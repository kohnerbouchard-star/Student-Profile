-- Ledger transaction RPC V1.
-- Inserts an append-only ledger entry, updates the account balance projection,
-- and writes an audit log entry in one database transaction.

create or replace function public.record_player_ledger_entry(
  p_game_session_id uuid,
  p_player_id uuid,
  p_account_type text,
  p_amount numeric,
  p_currency_code text default 'ECO',
  p_entry_type text default 'adjustment',
  p_source_domain text default 'ledger',
  p_source_action text default 'staff_player_balance_adjustment',
  p_source_id uuid default null,
  p_created_by_type text default 'staff_user',
  p_created_by_id uuid default null,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns table (
  ledger_entry_id uuid,
  account_balance_id uuid,
  account_type text,
  balance numeric,
  currency_code text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.players%rowtype;
  v_ledger public.ledger_entries%rowtype;
  v_balance public.account_balances%rowtype;
  v_account_type text := btrim(coalesce(p_account_type, 'cash'));
  v_currency_code text := upper(btrim(coalesce(p_currency_code, 'ECO')));
  v_entry_type text := btrim(coalesce(p_entry_type, 'adjustment'));
  v_source_domain text := btrim(coalesce(p_source_domain, 'ledger'));
  v_source_action text := btrim(coalesce(p_source_action, 'staff_player_balance_adjustment'));
  v_created_by_type text := btrim(coalesce(p_created_by_type, 'staff_user'));
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_account_type) = 0 then
    raise exception 'ACCOUNT_TYPE_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'LEDGER_AMOUNT_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_currency_code) < 3 or length(v_currency_code) > 16 then
    raise exception 'INVALID_CURRENCY_CODE'
      using errcode = 'P0001';
  end if;

  if v_entry_type not in ('credit', 'debit', 'adjustment') then
    raise exception 'INVALID_LEDGER_ENTRY_TYPE'
      using errcode = 'P0001';
  end if;

  if length(v_source_domain) = 0 then
    raise exception 'SOURCE_DOMAIN_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_source_action) = 0 then
    raise exception 'SOURCE_ACTION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if v_created_by_type not in ('staff_user', 'player', 'system') then
    raise exception 'INVALID_CREATED_BY_TYPE'
      using errcode = 'P0001';
  end if;

  select *
  into v_player
  from public.players
  where game_session_id = p_game_session_id
    and id = p_player_id
    and status = 'active';

  if not found then
    raise exception 'PLAYER_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  insert into public.ledger_entries (
    game_session_id,
    player_id,
    account_type,
    amount,
    currency_code,
    entry_type,
    source_domain,
    source_action,
    source_id,
    created_by_type,
    created_by_id
  )
  values (
    p_game_session_id,
    p_player_id,
    v_account_type,
    p_amount,
    v_currency_code,
    v_entry_type,
    v_source_domain,
    v_source_action,
    p_source_id,
    v_created_by_type,
    p_created_by_id
  )
  returning *
  into v_ledger;

  insert into public.account_balances (
    game_session_id,
    player_id,
    account_type,
    balance,
    currency_code,
    last_ledger_entry_id
  )
  values (
    p_game_session_id,
    p_player_id,
    v_account_type,
    p_amount,
    v_currency_code,
    v_ledger.id
  )
  on conflict on constraint account_balances_scope_unique
  do update
  set
    balance = public.account_balances.balance + excluded.balance,
    last_ledger_entry_id = excluded.last_ledger_entry_id
  returning *
  into v_balance;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    p_game_session_id,
    v_created_by_type,
    p_created_by_id,
    v_source_domain || '.' || v_source_action,
    'player',
    p_player_id,
    jsonb_build_object(
      'ledger_entry_id', v_ledger.id,
      'account_balance_id', v_balance.id,
      'account_type', v_balance.account_type,
      'amount', v_ledger.amount,
      'balance', v_balance.balance,
      'currency_code', v_balance.currency_code,
      'source_id', p_source_id
    ) || coalesce(p_audit_metadata, '{}'::jsonb)
  );

  return query
  select
    v_ledger.id,
    v_balance.id,
    v_balance.account_type,
    v_balance.balance,
    v_balance.currency_code,
    v_ledger.created_at;
end;
$$;

comment on function public.record_player_ledger_entry(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  jsonb
) is
  'Atomically inserts a player ledger entry, updates the account balance projection, and writes an audit log entry.';

revoke all on function public.record_player_ledger_entry(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  jsonb
) from public;

grant execute on function public.record_player_ledger_entry(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  jsonb
) to service_role;
