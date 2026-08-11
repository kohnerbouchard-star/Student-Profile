-- Admin V2 teacher-safety convergence.
--
-- 1. Seeded Store definitions are baseline simulation content. Teacher-facing
--    Store management may not generically edit or archive those definitions.
--    Dedicated bounded stock/price controls remain available to trusted paths.
-- 2. Contract money rewards converge on Checking and resolve the receiving
--    player's active-country currency by default. The retired `cash` reward key
--    remains an input alias only so existing Admin clients fail safely forward.

begin;

create or replace function public.admin_mutate_store_item_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_item_id uuid,
  p_item_payload jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_payload jsonb := coalesce(p_item_payload, '{}'::jsonb);
  v_claim record;
  v_item jsonb;
  v_item_uuid uuid;
  v_status integer;
  v_action text;
begin
  if v_operation not in ('create', 'update', 'archive', 'restock', 'rebalance')
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'ADMIN_STORE_OPERATION_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'store.' || v_operation,
    p_idempotency_key,
    p_request_payload
  );

  if v_claim.was_replayed then
    return query
    select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  -- Seeded physical-pack/system content is part of the simulation baseline.
  -- Generic teacher Edit/Archive must not mutate that definition. Dedicated
  -- restock and rebalance operations remain intentionally separate so a game
  -- can still change availability or price without rewriting item identity.
  if v_operation in ('update', 'archive')
     and exists (
       select 1
       from public.store_items as item_row
       join public.game_items as game_item
         on game_item.game_session_id = item_row.game_session_id
        and game_item.id = item_row.game_item_id
       where item_row.game_session_id = p_game_session_id
         and item_row.id = p_item_id
         and game_item.source_kind in ('physical_pack', 'system')
     ) then
    raise exception 'ADMIN_STORE_SEEDED_ITEM_PROTECTED' using errcode = 'P0001';
  end if;

  if v_operation = 'create' then
    begin
      insert into public.store_items (
        game_session_id,
        item_key,
        name,
        description,
        category,
        price,
        currency_code,
        stock_quantity,
        status,
        visibility,
        sort_order
      ) values (
        p_game_session_id,
        v_payload ->> 'itemKey',
        v_payload ->> 'name',
        nullif(btrim(coalesce(v_payload ->> 'description', '')), ''),
        v_payload ->> 'category',
        (v_payload ->> 'price')::numeric,
        v_payload ->> 'currencyCode',
        (v_payload ->> 'stockQuantity')::integer,
        v_payload ->> 'status',
        v_payload ->> 'visibility',
        (v_payload ->> 'sortOrder')::integer
      )
      returning id into v_item_uuid;
    exception when unique_violation then
      raise exception 'ADMIN_STORE_ITEM_CONFLICT' using errcode = 'P0001';
    end;
    v_status := 201;
    v_action := 'store.item_created';
  elsif v_operation = 'archive' then
    update public.store_items as item_row
    set status = 'archived',
        visibility = 'hidden',
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_archived';
  elsif v_operation = 'restock' then
    if not (v_payload ? 'quantity')
       or jsonb_typeof(v_payload -> 'quantity') <> 'number'
       or (v_payload ->> 'quantity')::numeric <= 0
       or trunc((v_payload ->> 'quantity')::numeric) <> (v_payload ->> 'quantity')::numeric then
      raise exception 'ADMIN_STORE_RESTOCK_QUANTITY_INVALID' using errcode = 'P0001';
    end if;
    update public.store_items as item_row
    set stock_quantity = item_row.stock_quantity + (v_payload ->> 'quantity')::integer,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_restocked';
  elsif v_operation = 'rebalance' then
    if not (v_payload ? 'price')
       or jsonb_typeof(v_payload -> 'price') <> 'number'
       or (v_payload ->> 'price')::numeric < 0 then
      raise exception 'ADMIN_STORE_REBALANCE_PRICE_INVALID' using errcode = 'P0001';
    end if;
    update public.store_items as item_row
    set price = (v_payload ->> 'price')::numeric,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_price_rebalanced';
  else
    update public.store_items as item_row
    set name = case when v_payload ? 'name' then v_payload ->> 'name' else item_row.name end,
        description = case when v_payload ? 'description'
          then nullif(btrim(coalesce(v_payload ->> 'description', '')), '')
          else item_row.description end,
        category = case when v_payload ? 'category' then v_payload ->> 'category' else item_row.category end,
        price = case when v_payload ? 'price' then (v_payload ->> 'price')::numeric else item_row.price end,
        currency_code = case when v_payload ? 'currencyCode' then v_payload ->> 'currencyCode' else item_row.currency_code end,
        stock_quantity = case when v_payload ? 'stockQuantity' then (v_payload ->> 'stockQuantity')::integer else item_row.stock_quantity end,
        status = case when v_payload ? 'status' then v_payload ->> 'status' else item_row.status end,
        visibility = case when v_payload ? 'visibility' then v_payload ->> 'visibility' else item_row.visibility end,
        sort_order = case when v_payload ? 'sortOrder' then (v_payload ->> 'sortOrder')::integer else item_row.sort_order end,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_updated';
  end if;

  if v_item_uuid is null then
    raise exception 'ADMIN_STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select to_jsonb(item_row)
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_item_uuid;

  return query
  select *
  from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    v_status,
    case when v_operation = 'restock'
      then jsonb_build_object(
        'item', v_item,
        'quantityAdded', (v_payload ->> 'quantity')::integer
      )
      else jsonb_build_object('item', v_item)
    end,
    v_action,
    'store_item',
    v_item_uuid,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'changedFields', coalesce(
        (
          select jsonb_agg(field_name order by field_name)
          from jsonb_object_keys(v_payload) as fields(field_name)
        ),
        '[]'::jsonb
      )
    )
  );
end;
$function$;

comment on function public.admin_mutate_store_item_v1(
  uuid, uuid, text, uuid, jsonb, jsonb, text, text
) is
  'Owner-scoped Store mutation. Generic update/archive rejects seeded baseline items; bounded restock/rebalance remain available.';

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
  v_progress public.player_contract_progress%rowtype;
  v_contract public.game_session_contracts%rowtype;
  v_existing public.contract_reward_issuances%rowtype;
  v_reward jsonb;
  v_money jsonb;
  v_items jsonb;
  v_item jsonb;
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
  v_applied jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_result jsonb;
  v_issued_at timestamptz := now();
begin
  if p_game_session_id is null or p_contract_id is null or p_progress_id is null then
    raise exception 'CONTRACT_REWARD_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_staff_user_id is null then
    raise exception 'STAFF_USER_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_progress
  from public.player_contract_progress
  where game_session_id = p_game_session_id
    and contract_id = p_contract_id
    and id = p_progress_id
  for update;

  if not found then
    raise exception 'CONTRACT_PROGRESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_progress.reward_issued_at is not null then
    select *
    into v_existing
    from public.contract_reward_issuances
    where game_session_id = p_game_session_id
      and progress_id = p_progress_id;

    return query
    select
      false,
      true,
      v_progress.reward_issued_at,
      coalesce(
        v_existing.reward_result,
        v_progress.result_payload -> 'rewardResult',
        jsonb_build_object(
          'status', 'skipped',
          'appliedRewards', '[]'::jsonb,
          'skippedRewards', jsonb_build_array(
            jsonb_build_object(
              'rewardType', 'all',
              'reason', 'Rewards were already issued.'
            )
          ),
          'failedRewards', '[]'::jsonb,
          'unsupportedRewardTypes', '[]'::jsonb
        )
      );
    return;
  end if;

  if v_progress.status <> 'completed' then
    raise exception 'CONTRACT_PROGRESS_NOT_COMPLETED' using errcode = 'P0001';
  end if;

  select *
  into v_contract
  from public.game_session_contracts
  where game_session_id = p_game_session_id
    and id = p_contract_id;

  if not found then
    raise exception 'CONTRACT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_reward := coalesce(v_contract.reward_payload, '{}'::jsonb);
  if jsonb_typeof(v_reward) <> 'object' then
    raise exception 'INVALID_CONTRACT_REWARD_PAYLOAD' using errcode = 'P0001';
  end if;

  if (v_reward ? 'checking') and (v_reward ? 'cash') then
    raise exception 'AMBIGUOUS_CONTRACT_MONEY_REWARD' using errcode = 'P0001';
  end if;

  select array_agg(key_name order by key_name)
  into v_unsupported
  from jsonb_object_keys(v_reward) as reward_keys(key_name)
  where key_name not in ('checking', 'cash', 'items');

  if coalesce(array_length(v_unsupported, 1), 0) > 0 then
    raise exception 'UNSUPPORTED_CONTRACT_REWARD_TYPES: %',
      array_to_string(v_unsupported, ',')
      using errcode = 'P0001';
  end if;

  -- `cash` is a compatibility input alias only. All monetary rewards settle
  -- into Checking. New callers should use `checking`.
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

    -- The retired `cash` alias historically carried ECO by default. Treat an
    -- alias payload without an explicit currency mode as player-local so old
    -- Admin clients converge forward instead of reintroducing global ECO.
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
        'source', 'issue_contract_rewards_atomic_v1',
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
      select value from jsonb_array_elements(v_items)
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

      select *
      into v_store_item
      from public.store_items
      where game_session_id = p_game_session_id
        and id = v_item_id
        and status = 'active'
      for update;

      if not found then
        raise exception 'CONTRACT_REWARD_STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
      end if;
      if v_store_item.stock_quantity < v_quantity then
        raise exception 'CONTRACT_REWARD_STORE_ITEM_OUT_OF_STOCK' using errcode = 'P0001';
      end if;

      update public.store_items
      set stock_quantity = stock_quantity - v_quantity,
          updated_at = v_issued_at
      where game_session_id = p_game_session_id
        and id = v_item_id;

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

  update public.player_contract_progress
  set reward_issued_at = v_issued_at,
      result_payload = coalesce(result_payload, '{}'::jsonb)
        || jsonb_build_object('rewardResult', v_result),
      updated_at = v_issued_at
  where id = p_progress_id;

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
    'contracts.contract_rewards_issued',
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

  return query
  select true, false, v_issued_at, v_result;
end;
$function$;

revoke all on function public.issue_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.issue_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on function public.issue_contract_rewards_atomic_v1(
  uuid, uuid, uuid, uuid, text
) is
  'Atomic/idempotent Contract reward issuance. Money settles to Checking; player-country currency is authoritative by default; legacy cash input is normalized.';

commit;
