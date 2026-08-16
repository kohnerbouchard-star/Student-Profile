begin;

create or replace function public.apply_contract_rewards_atomic_v1(
  p_game_session_id uuid,
  p_contract_id uuid,
  p_progress_id uuid,
  p_staff_user_id uuid,
  p_request_id text default null
)
returns table(
  reward_applied boolean,
  already_applied boolean,
  applied_at timestamptz,
  reward_result jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_progress public.player_contract_progress%rowtype;
  v_contract public.game_session_contracts%rowtype;
  v_existing public.contract_reward_issuances%rowtype;
  v_reward jsonb;
  v_money jsonb;
  v_items jsonb;
  v_item jsonb;
  v_story_flags jsonb;
  v_story_flag jsonb;
  v_unsupported text[];
  v_amount numeric;
  v_currency_mode text;
  v_requested_currency_code text;
  v_currency_code text;
  v_account_type text := 'checking';
  v_cash_ledger_entry_id uuid;
  v_cash_balance numeric;
  v_item_id_text text;
  v_item_id uuid;
  v_quantity integer;
  v_store_item public.store_items%rowtype;
  v_inventory_quantity integer;
  v_flag_key text;
  v_flag_value jsonb;
  v_source_story_event_id uuid;
  v_applied jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_result jsonb;
  v_issued_at timestamptz := clock_timestamp();
begin
  if p_game_session_id is null or p_contract_id is null or p_progress_id is null then
    raise exception 'CONTRACT_REWARD_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_staff_user_id is null then
    raise exception 'STAFF_USER_REQUIRED' using errcode = 'P0001';
  end if;

  select progress_row.*
  into v_progress
  from public.player_contract_progress as progress_row
  where progress_row.game_session_id = p_game_session_id
    and progress_row.contract_id = p_contract_id
    and progress_row.id = p_progress_id
  for update;

  if not found then
    raise exception 'CONTRACT_PROGRESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_progress.status <> 'completed' then
    raise exception 'CONTRACT_PROGRESS_NOT_COMPLETED' using errcode = 'P0001';
  end if;

  select contract_row.*
  into v_contract
  from public.game_session_contracts as contract_row
  where contract_row.game_session_id = p_game_session_id
    and contract_row.id = p_contract_id;

  if not found then
    raise exception 'CONTRACT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_reward := coalesce(v_contract.reward_payload, '{}'::jsonb);
  if jsonb_typeof(v_reward) <> 'object' then
    raise exception 'INVALID_CONTRACT_REWARD_PAYLOAD' using errcode = 'P0001';
  end if;

  select issuance_row.*
  into v_existing
  from public.contract_reward_issuances as issuance_row
  where issuance_row.game_session_id = p_game_session_id
    and issuance_row.progress_id = p_progress_id;

  if found then
    if v_existing.contract_id <> p_contract_id
      or v_existing.player_id <> v_progress.player_id
      or v_existing.reward_payload is distinct from v_reward
    then
      raise exception 'CONTRACT_REWARD_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select false, true, v_existing.issued_at, v_existing.reward_result;
    return;
  end if;

  if v_progress.reward_issued_at is not null then
    raise exception 'CONTRACT_REWARD_ISSUANCE_RECORD_MISSING' using errcode = 'P0001';
  end if;

  if (v_reward ? 'checking') and (v_reward ? 'cash') then
    raise exception 'AMBIGUOUS_CONTRACT_MONEY_REWARD' using errcode = 'P0001';
  end if;

  select array_agg(key_name order by key_name)
  into v_unsupported
  from jsonb_object_keys(v_reward) as reward_keys(key_name)
  where key_name not in ('checking', 'cash', 'items', 'storyFlagsToSet');

  if coalesce(array_length(v_unsupported, 1), 0) > 0 then
    raise exception 'UNSUPPORTED_CONTRACT_REWARD_TYPES: %',
      array_to_string(v_unsupported, ',')
      using errcode = 'P0001';
  end if;

  v_story_flags := v_reward -> 'storyFlagsToSet';
  if v_story_flags is not null and v_story_flags <> 'null'::jsonb then
    if jsonb_typeof(v_story_flags) <> 'array'
      or jsonb_array_length(v_story_flags) > 50
    then
      raise exception 'INVALID_CONTRACT_STORY_FLAG_REWARDS' using errcode = 'P0001';
    end if;

    for v_story_flag in
      select flag_entry.value
      from jsonb_array_elements(v_story_flags) as flag_entry(value)
    loop
      if jsonb_typeof(v_story_flag) <> 'object'
        or not (v_story_flag ? 'flagKey')
        or not (v_story_flag ? 'value')
        or exists (
          select 1
          from jsonb_object_keys(v_story_flag) as flag_keys(key_name)
          where flag_keys.key_name not in ('flagKey', 'value')
        )
      then
        raise exception 'INVALID_CONTRACT_STORY_FLAG_REWARD' using errcode = 'P0001';
      end if;

      v_flag_key := btrim(coalesce(v_story_flag ->> 'flagKey', ''));
      if length(v_flag_key) not between 1 and 160 then
        raise exception 'INVALID_CONTRACT_STORY_FLAG_KEY' using errcode = 'P0001';
      end if;
    end loop;

    if exists (
      select 1
      from (
        select btrim(flag_entry.value ->> 'flagKey') as flag_key,
               count(*) as key_count
        from jsonb_array_elements(v_story_flags) as flag_entry(value)
        group by btrim(flag_entry.value ->> 'flagKey')
      ) as duplicate_keys
      where duplicate_keys.key_count > 1
    ) then
      raise exception 'CONTRACT_REWARD_STORY_FLAG_DUPLICATE' using errcode = 'P0001';
    end if;
  end if;

  v_money := coalesce(v_reward -> 'checking', v_reward -> 'cash');
  if v_money is not null and v_money <> 'null'::jsonb then
    if jsonb_typeof(v_money) <> 'object' then
      raise exception 'INVALID_CONTRACT_CASH_REWARD' using errcode = 'P0001';
    end if;
    if coalesce(v_money ->> 'amount', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'INVALID_CONTRACT_CASH_REWARD_AMOUNT' using errcode = 'P0001';
    end if;

    v_amount := (v_money ->> 'amount')::numeric;
    if v_amount <= 0 then
      raise exception 'INVALID_CONTRACT_CASH_REWARD_AMOUNT' using errcode = 'P0001';
    end if;

    v_currency_mode := lower(btrim(coalesce(v_money ->> 'currencyMode', '')));
    v_requested_currency_code := upper(btrim(coalesce(v_money ->> 'currencyCode', '')));

    if v_currency_mode = '' and (v_reward ? 'cash') then
      v_currency_mode := 'player_country';
      v_requested_currency_code := '';
    elsif v_currency_mode = '' then
      v_currency_mode := case
        when v_requested_currency_code = '' then 'player_country'
        when v_requested_currency_code = 'ECO' then 'global_eco'
        else 'player_country'
      end;
    end if;

    if v_currency_mode in ('global_eco', 'eco', 'global') then
      if v_requested_currency_code not in ('', 'ECO') then
        raise exception 'CONTRACT_REWARD_CURRENCY_MODE_MISMATCH' using errcode = 'P0001';
      end if;
      v_currency_code := 'ECO';
    elsif v_currency_mode in ('player_country', 'local', 'player_local') then
      select upper(btrim(country.currency_code))
      into v_currency_code
      from public.player_country_assignments as assignment
      join public.country_profiles as country
        on country.id = assignment.country_profile_id
       and country.status = 'active'
      where assignment.game_session_id = p_game_session_id
        and assignment.player_id = v_progress.player_id
        and assignment.status = 'active'
      order by assignment.assigned_at desc
      limit 1;

      if coalesce(v_currency_code, '') = '' then
        raise exception 'CONTRACT_REWARD_PLAYER_CURRENCY_UNAVAILABLE' using errcode = 'P0001';
      end if;
      if v_requested_currency_code <> ''
         and v_requested_currency_code <> v_currency_code then
        raise exception 'CONTRACT_REWARD_CURRENCY_MISMATCH' using errcode = 'P0001';
      end if;
    else
      raise exception 'CONTRACT_REWARD_CURRENCY_MODE_INVALID' using errcode = 'P0001';
    end if;

    select entry.ledger_entry_id, entry.balance
    into v_cash_ledger_entry_id, v_cash_balance
    from public.record_player_ledger_entry(
      p_game_session_id,
      v_progress.player_id,
      v_account_type,
      v_amount,
      v_currency_code,
      'credit',
      'contracts',
      'contract_reward_cash',
      p_progress_id,
      'staff_user',
      p_staff_user_id,
      jsonb_build_object(
        'requestId', p_request_id,
        'contractId', p_contract_id,
        'progressId', p_progress_id,
        'rewardIssuedAt', v_issued_at,
        'source', 'apply_contract_rewards_atomic_v1',
        'currencyMode', v_currency_mode,
        'resolvedCurrencyCode', v_currency_code
      )
    ) as entry;

    v_applied := v_applied || jsonb_build_array(
      jsonb_build_object(
        'rewardType', 'checking',
        'ledgerEntryId', v_cash_ledger_entry_id,
        'amount', v_amount,
        'accountType', v_account_type,
        'currencyCode', v_currency_code,
        'balance', v_cash_balance
      )
    );
  end if;

  v_items := v_reward -> 'items';
  if v_items is not null and v_items <> 'null'::jsonb then
    if jsonb_typeof(v_items) <> 'array' then
      raise exception 'INVALID_CONTRACT_ITEM_REWARDS' using errcode = 'P0001';
    end if;

    for v_item in
      select item_entry.value from jsonb_array_elements(v_items) as item_entry(value)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'INVALID_CONTRACT_ITEM_REWARD' using errcode = 'P0001';
      end if;

      v_item_id_text := coalesce(
        nullif(v_item ->> 'storeItemId', ''),
        nullif(v_item ->> 'itemUuid', ''),
        nullif(v_item ->> 'id', '')
      );
      begin
        v_item_id := v_item_id_text::uuid;
      exception when invalid_text_representation then
        raise exception 'INVALID_CONTRACT_ITEM_REWARD_ID' using errcode = 'P0001';
      end;

      if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]+$' then
        raise exception 'INVALID_CONTRACT_ITEM_REWARD_QUANTITY' using errcode = 'P0001';
      end if;
      v_quantity := (v_item ->> 'quantity')::integer;
      if v_quantity <= 0 then
        raise exception 'INVALID_CONTRACT_ITEM_REWARD_QUANTITY' using errcode = 'P0001';
      end if;

      select store_row.*
      into v_store_item
      from public.store_items as store_row
      where store_row.game_session_id = p_game_session_id
        and store_row.id = v_item_id
        and store_row.status = 'active'
      for update;

      if not found then
        raise exception 'CONTRACT_REWARD_STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
      end if;
      if v_store_item.stock_quantity < v_quantity then
        raise exception 'CONTRACT_REWARD_STORE_ITEM_OUT_OF_STOCK' using errcode = 'P0001';
      end if;

      update public.store_items as store_row
      set stock_quantity = store_row.stock_quantity - v_quantity,
          updated_at = v_issued_at
      where store_row.game_session_id = p_game_session_id
        and store_row.id = v_item_id;

      insert into public.inventory_holdings (
        game_session_id,
        player_id,
        store_item_id,
        quantity_owned,
        quantity_reserved
      ) values (
        p_game_session_id,
        v_progress.player_id,
        v_item_id,
        v_quantity,
        0
      )
      on conflict on constraint inventory_holdings_scope_unique
      do update set
        quantity_owned = public.inventory_holdings.quantity_owned + excluded.quantity_owned,
        updated_at = v_issued_at
      returning quantity_owned into v_inventory_quantity;

      insert into public.audit_log (
        game_session_id,
        actor_type,
        actor_id,
        action,
        target_type,
        target_id,
        metadata
      ) values (
        p_game_session_id,
        'staff_user',
        p_staff_user_id,
        'contracts.contract_reward_item',
        'inventory_holding',
        v_progress.player_id,
        jsonb_build_object(
          'requestId', p_request_id,
          'contractId', p_contract_id,
          'progressId', p_progress_id,
          'playerId', v_progress.player_id,
          'storeItemId', v_item_id,
          'quantity', v_quantity,
          'quantityOwned', v_inventory_quantity
        )
      );

      v_applied := v_applied || jsonb_build_array(
        jsonb_build_object(
          'rewardType', 'item',
          'storeItemId', v_item_id,
          'itemName', v_store_item.name,
          'quantity', v_quantity,
          'quantityOwned', v_inventory_quantity
        )
      );
    end loop;
  end if;

  if v_story_flags is not null and v_story_flags <> 'null'::jsonb then
    if v_contract.source_type = 'story_event'
      and v_contract.source_id is not null
      and exists (
        select 1
        from public.storyline_events as event_row
        where event_row.id = v_contract.source_id
      )
    then
      v_source_story_event_id := v_contract.source_id;
    end if;

    for v_story_flag in
      select flag_entry.value
      from jsonb_array_elements(v_story_flags) as flag_entry(value)
    loop
      v_flag_key := btrim(v_story_flag ->> 'flagKey');
      v_flag_value := v_story_flag -> 'value';

      insert into public.game_session_story_flags (
        game_session_id,
        flag_key,
        value,
        source_story_event_id
      ) values (
        p_game_session_id,
        v_flag_key,
        v_flag_value,
        v_source_story_event_id
      )
      on conflict (game_session_id, flag_key) do update
      set value = excluded.value,
          source_story_event_id = coalesce(
            excluded.source_story_event_id,
            public.game_session_story_flags.source_story_event_id
          );

      insert into public.audit_log (
        game_session_id,
        actor_type,
        actor_id,
        action,
        target_type,
        target_id,
        metadata
      ) values (
        p_game_session_id,
        'staff_user',
        p_staff_user_id,
        'contracts.contract_reward_story_flag',
        'player',
        v_progress.player_id,
        jsonb_build_object(
          'requestId', p_request_id,
          'contractId', p_contract_id,
          'progressId', p_progress_id,
          'playerId', v_progress.player_id,
          'flagKey', v_flag_key,
          'value', v_flag_value,
          'sourceStoryEventId', v_source_story_event_id
        )
      );

      v_applied := v_applied || jsonb_build_array(
        jsonb_build_object(
          'rewardType', 'story_flag',
          'flagKey', v_flag_key,
          'value', v_flag_value
        )
      );
    end loop;
  end if;

  if jsonb_array_length(v_applied) = 0 then
    v_skipped := jsonb_build_array(
      jsonb_build_object(
        'rewardType', 'none',
        'reason', 'No reward payload was configured.'
      )
    );
  end if;

  v_result := jsonb_build_object(
    'status', case when jsonb_array_length(v_applied) = 0 then 'skipped' else 'applied' end,
    'appliedRewards', v_applied,
    'skippedRewards', v_skipped,
    'failedRewards', '[]'::jsonb,
    'unsupportedRewardTypes', '[]'::jsonb
  );

  insert into public.contract_reward_issuances (
    game_session_id,
    contract_id,
    progress_id,
    player_id,
    issued_by_staff_user_id,
    cash_ledger_entry_id,
    reward_payload,
    reward_result,
    request_id,
    issued_at
  ) values (
    p_game_session_id,
    p_contract_id,
    p_progress_id,
    v_progress.player_id,
    p_staff_user_id,
    v_cash_ledger_entry_id,
    v_reward,
    v_result,
    nullif(btrim(coalesce(p_request_id, '')), ''),
    v_issued_at
  );

  update public.player_contract_progress as progress_row
  set result_payload = coalesce(progress_row.result_payload, '{}'::jsonb)
        || jsonb_build_object('rewardResult', v_result),
      updated_at = v_issued_at
  where progress_row.id = p_progress_id;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'staff_user',
    p_staff_user_id,
    'contracts.contract_rewards_applied',
    'player_contract_progress',
    p_progress_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'contractId', p_contract_id,
      'progressId', p_progress_id,
      'playerId', v_progress.player_id,
      'rewardResult', v_result
    )
  );

  return query select true, false, v_issued_at, v_result;
end;
$function$;

create or replace function public.issue_contract_rewards_atomic_v1(
  p_game_session_id uuid,
  p_contract_id uuid,
  p_progress_id uuid,
  p_staff_user_id uuid,
  p_request_id text default null
)
returns table(
  reward_issued boolean,
  already_issued boolean,
  issued_at timestamptz,
  reward_result jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_application record;
  v_marked integer := 0;
begin
  select application.*
  into v_application
  from public.apply_contract_rewards_atomic_v1(
    p_game_session_id,
    p_contract_id,
    p_progress_id,
    p_staff_user_id,
    p_request_id
  ) as application;

  update public.player_contract_progress as progress_row
  set reward_issued_at = v_application.applied_at,
      result_payload = coalesce(progress_row.result_payload, '{}'::jsonb)
        || jsonb_build_object('rewardResult', v_application.reward_result),
      updated_at = v_application.applied_at
  where progress_row.game_session_id = p_game_session_id
    and progress_row.contract_id = p_contract_id
    and progress_row.id = p_progress_id
    and progress_row.reward_issued_at is null;

  get diagnostics v_marked = row_count;

  return query
  select
    v_marked = 1,
    v_marked = 0,
    v_application.applied_at,
    v_application.reward_result;
end;
$function$;

revoke all on function public.apply_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.apply_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) to service_role;

revoke all on function public.issue_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.issue_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on function public.apply_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) is
  'Applies one Contract reward plan atomically and idempotently without separately marking progress. Supports Checking, the legacy cash alias, Store items, and game-scoped Story flags.';

comment on function public.issue_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) is
  'Applies one Contract reward plan and atomically marks progress rewarded. Mixed money, item, and game-scoped Story-flag rewards share one transaction and replay record.';

commit;
