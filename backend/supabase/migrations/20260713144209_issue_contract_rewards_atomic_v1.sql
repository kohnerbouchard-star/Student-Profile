begin;

create table if not exists public.contract_reward_issuances (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  contract_id uuid not null references public.game_session_contracts(id) on delete cascade,
  progress_id uuid not null references public.player_contract_progress(id) on delete cascade,
  player_id uuid not null,
  issued_by_staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  cash_ledger_entry_id uuid null references public.ledger_entries(id) on delete restrict,
  reward_payload jsonb not null default '{}'::jsonb,
  reward_result jsonb not null default '{}'::jsonb,
  request_id text null,
  issued_at timestamptz not null default now(),
  constraint contract_reward_issuances_scope_unique unique (game_session_id, progress_id),
  constraint contract_reward_issuances_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint contract_reward_issuances_reward_payload_object
    check (jsonb_typeof(reward_payload) = 'object'),
  constraint contract_reward_issuances_reward_result_object
    check (jsonb_typeof(reward_result) = 'object'),
  constraint contract_reward_issuances_request_id_not_blank
    check (request_id is null or length(btrim(request_id)) > 0)
);

create index if not exists contract_reward_issuances_contract_issued_idx
  on public.contract_reward_issuances (game_session_id, contract_id, issued_at desc);

create index if not exists contract_reward_issuances_player_issued_idx
  on public.contract_reward_issuances (game_session_id, player_id, issued_at desc);

alter table public.contract_reward_issuances enable row level security;

comment on table public.contract_reward_issuances is
  'Atomic and idempotent issuance record for contract cash and store-item rewards.';

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
  v_cash jsonb;
  v_items jsonb;
  v_item jsonb;
  v_unsupported text[];
  v_amount numeric;
  v_currency_code text;
  v_account_type text;
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

  select * into v_progress
  from public.player_contract_progress
  where game_session_id = p_game_session_id
    and contract_id = p_contract_id
    and id = p_progress_id
  for update;

  if not found then
    raise exception 'CONTRACT_PROGRESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_progress.reward_issued_at is not null then
    select * into v_existing
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
            jsonb_build_object('rewardType', 'all', 'reason', 'Rewards were already issued.')
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

  select * into v_contract
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

  select array_agg(key_name order by key_name)
  into v_unsupported
  from jsonb_object_keys(v_reward) as reward_keys(key_name)
  where key_name not in ('cash', 'items');

  if coalesce(array_length(v_unsupported, 1), 0) > 0 then
    raise exception 'UNSUPPORTED_CONTRACT_REWARD_TYPES: %', array_to_string(v_unsupported, ',')
      using errcode = 'P0001';
  end if;

  v_cash := v_reward -> 'cash';
  if v_cash is not null and v_cash <> 'null'::jsonb then
    if jsonb_typeof(v_cash) <> 'object' then
      raise exception 'INVALID_CONTRACT_CASH_REWARD' using errcode = 'P0001';
    end if;
    if coalesce(v_cash ->> 'amount', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'INVALID_CONTRACT_CASH_REWARD_AMOUNT' using errcode = 'P0001';
    end if;

    v_amount := (v_cash ->> 'amount')::numeric;
    if v_amount <= 0 then
      raise exception 'INVALID_CONTRACT_CASH_REWARD_AMOUNT' using errcode = 'P0001';
    end if;

    v_currency_code := upper(btrim(coalesce(nullif(v_cash ->> 'currencyCode', ''), 'ECO')));
    v_account_type := btrim(coalesce(nullif(v_cash ->> 'accountType', ''), 'cash'));

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
        'source', 'issue_contract_rewards_atomic_v1'
      )
    ) as entry;

    v_applied := v_applied || jsonb_build_array(
      jsonb_build_object(
        'rewardType', 'cash',
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

    for v_item in select value from jsonb_array_elements(v_items)
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

      select * into v_store_item
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
      jsonb_build_object('rewardType', 'none', 'reason', 'No reward payload was configured.')
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
      result_payload = coalesce(result_payload, '{}'::jsonb) || jsonb_build_object('rewardResult', v_result),
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

  return query select true, false, v_issued_at, v_result;
end;
$function$;

revoke all on function public.issue_contract_rewards_atomic_v1(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.issue_contract_rewards_atomic_v1(uuid, uuid, uuid, uuid, text)
  to service_role;

commit;
