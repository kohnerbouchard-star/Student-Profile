-- Player Banking FX command, read, and leased-settlement authority V1.
--
-- Browser callers provide only game-scoped Player intent and opaque public
-- keys. Rates, accounts, fees, capacity, monetary lines, and terminal evidence
-- are derived and committed inside PostgreSQL.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function private.player_fx_system_account_v1(
  p_game_session_id uuid,
  p_system_key text,
  p_account_kind text,
  p_currency_code text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_account_id uuid;
begin
  select account_row.id
  into v_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = p_game_session_id
    and account_row.account_kind = p_account_kind
    and account_row.currency_code = upper(btrim(coalesce(p_currency_code, '')))
    and account_row.status = 'active'
    and party_row.party_kind = 'system'
    and party_row.system_key = p_system_key
    and party_row.status = 'active';

  if not found then
    raise exception 'FX_CLEARING_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_account_id;
end;
$function$;

revoke all on function private.player_fx_system_account_v1(uuid, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.player_fx_current_cap_v1(
  p_game_session_id uuid,
  p_currency_code text
)
returns public.fx_liquidity_cap_snapshots
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_cap public.fx_liquidity_cap_snapshots%rowtype;
begin
  select cap_row.*
  into v_cap
  from private.fx_runtime_state as runtime
  join public.fx_liquidity_cap_snapshots as cap_row
    on cap_row.fixing_id = runtime.current_fixing_id
   and cap_row.game_session_id = runtime.game_session_id
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready'
    and cap_row.currency_code = upper(btrim(coalesce(p_currency_code, '')));

  if not found then
    raise exception 'FX_LIQUIDITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return v_cap;
end;
$function$;

revoke all on function private.player_fx_current_cap_v1(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.get_player_banking_fx_overview_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_runtime private.fx_runtime_state%rowtype;
  v_fixing public.fx_fixings%rowtype;
  v_policy text;
  v_currencies jsonb;
  v_pending jsonb;
  v_completed jsonb;
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'FX_OVERVIEW_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready';
  if not found or v_runtime.current_fixing_id is null or v_runtime.next_due_at is null then
    raise exception 'FX_FIXING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select fixing_row.*
  into v_fixing
  from public.fx_fixings as fixing_row
  where fixing_row.id = v_runtime.current_fixing_id
    and fixing_row.game_session_id = p_game_session_id;
  if not found then
    raise exception 'FX_FIXING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select policy_row.policy_version
  into v_policy
  from public.fx_policy_versions as policy_row
  where policy_row.id = v_fixing.policy_version_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currency_code', currency_row.code,
        'minor_unit', currency_row.decimal_places
      )
      order by currency_row.code
    ),
    '[]'::jsonb
  )
  into v_currencies
  from public.fx_fixing_currency_values as value_row
  join public.currencies as currency_row
    on currency_row.code = value_row.currency_code
   and currency_row.status = 'active'
  where value_row.fixing_id = v_fixing.id
    and value_row.game_session_id = p_game_session_id;

  select coalesce(jsonb_agg(order_json order by submitted_at desc, order_key desc), '[]'::jsonb)
  into v_pending
  from (
    select
      private.fx_order_public_json_v1(order_row.id) as order_json,
      order_row.submitted_at,
      order_row.public_key as order_key
    from public.fx_orders as order_row
    join private.fx_order_runtime_state as runtime
      on runtime.order_id = order_row.id
     and runtime.game_session_id = order_row.game_session_id
    where order_row.game_session_id = p_game_session_id
      and order_row.player_id = p_player_id
      and runtime.status in ('pending', 'claimed')
    order by order_row.submitted_at desc, order_row.public_key desc
    limit 50
  ) as pending_rows;

  select coalesce(jsonb_agg(order_json order by submitted_at desc, order_key desc), '[]'::jsonb)
  into v_completed
  from (
    select
      private.fx_order_public_json_v1(order_row.id) as order_json,
      order_row.submitted_at,
      order_row.public_key as order_key
    from public.fx_orders as order_row
    join private.fx_order_runtime_state as runtime
      on runtime.order_id = order_row.id
     and runtime.game_session_id = order_row.game_session_id
    where order_row.game_session_id = p_game_session_id
      and order_row.player_id = p_player_id
      and runtime.status in ('settled', 'cancelled', 'failed')
    order by order_row.submitted_at desc, order_row.public_key desc
    limit 50
  ) as completed_rows;

  return jsonb_build_object(
    'fixing', jsonb_build_object(
      'fixing_key', v_fixing.public_key,
      'effective_at', v_fixing.effective_at,
      'calculated_at', v_fixing.calculated_at,
      'next_fixing_at', v_runtime.next_due_at,
      'overdue', v_runtime.next_due_at <= statement_timestamp(),
      'policy_version', v_policy
    ),
    'currencies', v_currencies,
    'pending_orders', v_pending,
    'completed_orders', v_completed
  );
end;
$function$;

revoke all on function public.get_player_banking_fx_overview_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_player_banking_fx_overview_v1(uuid, uuid)
  to service_role;

create or replace function public.list_player_bank_activity_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  account_type text,
  amount numeric,
  currency_code text,
  entry_type text,
  source_domain text,
  source_action text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if p_game_session_id is null
     or p_player_id is null
     or p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset not between 0 and 1000000
  then
    raise exception 'PLAYER_BANK_ACTIVITY_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  return query
  select
    case account_row.account_kind
      when 'checking' then 'checking'
      when 'savings' then 'savings'
      when 'legacy' then account_row.legacy_account_type
      else 'bank:' || account_row.account_kind
    end,
    ledger_row.amount,
    ledger_row.currency_code,
    ledger_row.entry_type,
    ledger_row.source_domain,
    ledger_row.source_action,
    ledger_row.created_at
  from public.ledger_entries as ledger_row
  join public.bank_accounts as account_row
    on account_row.id = ledger_row.bank_account_id
   and account_row.game_session_id = ledger_row.game_session_id
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where ledger_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'player'
    and party_row.player_id = p_player_id
  order by ledger_row.created_at desc, ledger_row.id desc
  limit p_limit + 1
  offset p_offset;
end;
$function$;

revoke all on function public.list_player_bank_activity_v1(
  uuid, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_player_bank_activity_v1(
  uuid, uuid, integer, integer
) to service_role;

create or replace function public.list_player_fx_rate_history_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_source_currency_code text,
  p_target_currency_code text,
  p_range text,
  p_limit integer,
  p_before_at timestamptz default null,
  p_before_key text default null
)
returns table (
  fixing_key text,
  effective_at timestamptz,
  source_currency_code text,
  target_currency_code text,
  reference_rate text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_source text := upper(btrim(coalesce(p_source_currency_code, '')));
  v_target text := upper(btrim(coalesce(p_target_currency_code, '')));
  v_range text := lower(btrim(coalesce(p_range, '')));
  v_cutoff timestamptz;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_source !~ '^[A-Z]{3,16}$'
     or v_target !~ '^[A-Z]{3,16}$'
     or v_range not in ('7d', '30d', 'game')
     or p_limit is null or p_limit not between 1 and 101
     or ((p_before_at is null) <> (p_before_key is null))
     or (p_before_key is not null and p_before_key !~ '^fxf_[0-9a-f]{32}$')
  then
    raise exception 'FX_HISTORY_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.currencies as currency_row
    where currency_row.code = v_source and currency_row.status = 'active'
  ) or not exists (
    select 1 from public.currencies as currency_row
    where currency_row.code = v_target and currency_row.status = 'active'
  ) then
    raise exception 'FX_RATE_CURRENCY_INVALID' using errcode = '22023';
  end if;

  v_cutoff := case v_range
    when '7d' then statement_timestamp() - interval '7 days'
    when '30d' then statement_timestamp() - interval '30 days'
    else null
  end;

  return query
  select
    fixing_row.public_key,
    fixing_row.effective_at,
    v_source,
    v_target,
    case
      when v_source = v_target then 1::numeric(38, 18)
      else (target_value.units_per_eco / source_value.units_per_eco)::numeric(38, 18)
    end::text
  from public.fx_fixings as fixing_row
  join public.fx_fixing_currency_values as source_value
    on source_value.fixing_id = fixing_row.id
   and source_value.game_session_id = fixing_row.game_session_id
   and source_value.currency_code = v_source
  join public.fx_fixing_currency_values as target_value
    on target_value.fixing_id = fixing_row.id
   and target_value.game_session_id = fixing_row.game_session_id
   and target_value.currency_code = v_target
  where fixing_row.game_session_id = p_game_session_id
    and fixing_row.effective_at <= statement_timestamp()
    and (v_cutoff is null or fixing_row.effective_at >= v_cutoff)
    and (
      p_before_at is null
      or (fixing_row.effective_at, fixing_row.public_key)
        < (p_before_at, p_before_key)
    )
  order by fixing_row.effective_at desc, fixing_row.public_key desc
  limit p_limit;
end;
$function$;

revoke all on function public.list_player_fx_rate_history_v1(
  uuid, uuid, text, text, text, integer, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.list_player_fx_rate_history_v1(
  uuid, uuid, text, text, text, integer, timestamptz, text
) to service_role;

create or replace function public.list_player_fx_orders_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_status text,
  p_limit integer,
  p_before_at timestamptz default null,
  p_before_key text default null
)
returns table (
  order_key text,
  quote_key text,
  product text,
  status text,
  source_currency_code text,
  target_currency_code text,
  source_amount text,
  fee_amount text,
  target_amount text,
  submitted_at timestamptz,
  settles_at timestamptz,
  completed_at timestamptz,
  receipt_key text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_status not in ('all', 'pending', 'completed')
     or p_limit is null or p_limit not between 1 and 101
     or ((p_before_at is null) <> (p_before_key is null))
     or (p_before_key is not null and p_before_key !~ '^fxo_[0-9a-f]{32}$')
  then
    raise exception 'FX_ORDER_HISTORY_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  return query
  select
    order_row.public_key,
    quote_row.public_key,
    order_row.product,
    runtime.status,
    quote_row.source_currency_code,
    quote_row.target_currency_code,
    order_row.source_amount::text,
    order_row.fee_amount::text,
    order_row.target_amount::text,
    order_row.submitted_at,
    order_row.settles_at,
    runtime.terminal_at,
    receipt_row.public_key
  from public.fx_orders as order_row
  join public.fx_quotes as quote_row
    on quote_row.id = order_row.quote_id
   and quote_row.game_session_id = order_row.game_session_id
  join private.fx_order_runtime_state as runtime
    on runtime.order_id = order_row.id
   and runtime.game_session_id = order_row.game_session_id
  left join public.fx_settlement_receipts as receipt_row
    on receipt_row.order_id = order_row.id
   and receipt_row.game_session_id = order_row.game_session_id
  where order_row.game_session_id = p_game_session_id
    and order_row.player_id = p_player_id
    and (
      v_status = 'all'
      or (v_status = 'pending' and runtime.status in ('pending', 'claimed'))
      or (v_status = 'completed' and runtime.status in ('settled', 'cancelled', 'failed'))
    )
    and (
      p_before_at is null
      or (order_row.submitted_at, order_row.public_key)
        < (p_before_at, p_before_key)
    )
  order by order_row.submitted_at desc, order_row.public_key desc
  limit p_limit;
end;
$function$;

revoke all on function public.list_player_fx_orders_v1(
  uuid, uuid, text, integer, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.list_player_fx_orders_v1(
  uuid, uuid, text, integer, timestamptz, text
) to service_role;

commit;
