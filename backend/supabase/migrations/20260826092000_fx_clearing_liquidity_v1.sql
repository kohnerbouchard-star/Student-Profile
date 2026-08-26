-- Banking FX clearing and capped reserve liquidity V1.
--
-- B1 owns reference fixings. Banking owns accounts, journal balances, holds,
-- clearing inventory, and reserve utilization. This migration deliberately
-- adds no customer order surface; customer commands arrive in the next
-- forward migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.fx_liquidity_cap_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxc_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  fixing_id uuid not null,
  currency_code text not null references public.currencies(code),
  snapshot_kind text not null,
  arrival_basis_amount numeric(38, 18) not null,
  arrival_formula_cap numeric(38, 18) not null,
  positive_non_system_balance numeric(38, 18) not null,
  balance_formula_cap numeric(38, 18) not null,
  utilized_before numeric(38, 18) not null,
  reserved_before numeric(38, 18) not null,
  utilization_floor numeric(38, 18) not null,
  facility_cap numeric(38, 18) not null,
  operating_buffer_target numeric(38, 18) not null,
  input_hash text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_liquidity_cap_snapshots_public_key_format
    check (public_key ~ '^fxc_[0-9a-f]{32}$'),
  constraint fx_liquidity_cap_snapshots_fixing_scope_fk
    foreign key (fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id) on delete cascade,
  constraint fx_liquidity_cap_snapshots_scope_unique
    unique (fixing_id, currency_code),
  constraint fx_liquidity_cap_snapshots_scope_id_unique
    unique (id, game_session_id),
  constraint fx_liquidity_cap_snapshots_kind_check
    check (snapshot_kind in ('cutover_bootstrap', 'fixing')),
  constraint fx_liquidity_cap_snapshots_nonnegative
    check (
      arrival_basis_amount >= 0
      and arrival_formula_cap >= 0
      and positive_non_system_balance >= 0
      and balance_formula_cap >= 0
      and utilized_before >= 0
      and reserved_before >= 0
      and utilization_floor >= 0
      and facility_cap > 0
      and operating_buffer_target >= 0
    ),
  constraint fx_liquidity_cap_snapshots_formula_check
    check (
      arrival_formula_cap = arrival_basis_amount * 100
      and balance_formula_cap = positive_non_system_balance * 2
      and utilization_floor = utilized_before + reserved_before
      and facility_cap >= greatest(
        arrival_formula_cap,
        balance_formula_cap,
        utilization_floor
      )
      and operating_buffer_target <= facility_cap
    ),
  constraint fx_liquidity_cap_snapshots_hash_format
    check (input_hash ~ '^[0-9a-f]{64}$')
);

create index fx_liquidity_cap_snapshots_game_currency_created_idx
  on public.fx_liquidity_cap_snapshots(
    game_session_id,
    currency_code,
    created_at desc,
    public_key desc
  );

create table public.fx_liquidity_events (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxe_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  cap_snapshot_id uuid not null,
  bank_transaction_id uuid null,
  hold_id uuid null,
  currency_code text not null references public.currencies(code),
  event_kind text not null,
  amount numeric(38, 18) not null,
  idempotency_key text not null,
  request_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_liquidity_events_public_key_format
    check (public_key ~ '^fxe_[0-9a-f]{32}$'),
  constraint fx_liquidity_events_cap_scope_fk
    foreign key (cap_snapshot_id, game_session_id)
    references public.fx_liquidity_cap_snapshots(id, game_session_id) on delete cascade,
  constraint fx_liquidity_events_transaction_scope_fk
    foreign key (bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id),
  constraint fx_liquidity_events_hold_scope_fk
    foreign key (hold_id, game_session_id)
    references public.bank_account_holds(id, game_session_id),
  constraint fx_liquidity_events_kind_check
    check (
      event_kind in (
        'buffer_seed',
        'facility_reserved',
        'facility_released',
        'facility_consumed',
        'reserve_draw',
        'reserve_repayment'
      )
    ),
  constraint fx_liquidity_events_amount_positive check (amount > 0),
  constraint fx_liquidity_events_idempotency_not_blank
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint fx_liquidity_events_request_hash_format
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint fx_liquidity_events_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint fx_liquidity_events_scope_idempotency_unique
    unique (game_session_id, idempotency_key),
  constraint fx_liquidity_events_scope_id_unique
    unique (id, game_session_id)
);

create index fx_liquidity_events_game_currency_created_idx
  on public.fx_liquidity_events(
    game_session_id,
    currency_code,
    created_at desc,
    public_key desc
  );

alter table public.fx_liquidity_cap_snapshots enable row level security;
alter table public.fx_liquidity_cap_snapshots force row level security;
alter table public.fx_liquidity_events enable row level security;
alter table public.fx_liquidity_events force row level security;

revoke all on table public.fx_liquidity_cap_snapshots
  from public, anon, authenticated, service_role;
revoke all on table public.fx_liquidity_events
  from public, anon, authenticated, service_role;
grant select on table public.fx_liquidity_cap_snapshots to service_role;
grant select on table public.fx_liquidity_events to service_role;

create or replace function private.reject_fx_liquidity_evidence_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = old.game_session_id
  ) then
    return old;
  end if;

  raise exception 'FX_LIQUIDITY_EVIDENCE_IMMUTABLE' using errcode = '42501';
end;
$function$;

create trigger guard_fx_liquidity_cap_snapshots_immutable
before update or delete on public.fx_liquidity_cap_snapshots
for each row execute function private.reject_fx_liquidity_evidence_mutation_v1();

create trigger guard_fx_liquidity_events_immutable
before update or delete on public.fx_liquidity_events
for each row execute function private.reject_fx_liquidity_evidence_mutation_v1();

revoke all on function private.reject_fx_liquidity_evidence_mutation_v1()
  from public, anon, authenticated, service_role;

create or replace function private.ensure_fx_clearing_accounts_v1(
  p_game_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_account record;
  v_currency_count integer;
  v_account_count integer;
begin
  if p_game_session_id is null then
    raise exception 'FX_CLEARING_GAME_REQUIRED' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'FX_CLEARING_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.economic_parties(
    game_session_id,
    party_kind,
    system_key,
    status
  )
  values
    (p_game_session_id, 'system', 'fx.clearing-house', 'active'),
    (p_game_session_id, 'system', 'fx.central-reserve', 'active'),
    (p_game_session_id, 'system', 'fx.fee-revenue', 'active'),
    (p_game_session_id, 'system', 'banking.compatibility-offset', 'active')
  on conflict (game_session_id, party_kind, system_key)
    where system_key is not null
  do update
    set status = case
      when public.economic_parties.status = 'closed' then 'closed'
      else 'active'
    end;

  if exists (
    select 1
    from public.economic_parties as party_row
    where party_row.game_session_id = p_game_session_id
      and party_row.party_kind = 'system'
      and party_row.system_key in (
        'fx.clearing-house',
        'fx.central-reserve',
        'fx.fee-revenue',
        'banking.compatibility-offset'
      )
      and party_row.status <> 'active'
  ) then
    raise exception 'FX_CLEARING_PARTY_CLOSED' using errcode = 'P0001';
  end if;

  for v_account in
    select
      currency_row.code as currency_code,
      account_spec.system_key,
      account_spec.account_kind
    from public.currencies as currency_row
    cross join (
      values
        ('fx.clearing-house'::text, 'fx_clearing'::text),
        ('fx.central-reserve'::text, 'fx_reserve'::text),
        ('fx.fee-revenue'::text, 'fx_fee_revenue'::text),
        ('banking.compatibility-offset'::text, 'compatibility_offset'::text)
    ) as account_spec(system_key, account_kind)
    where currency_row.status = 'active'
    order by currency_row.code, account_spec.system_key
  loop
    perform private.ensure_system_bank_account_v1(
      p_game_session_id,
      v_account.system_key,
      v_account.account_kind,
      v_account.currency_code
    );
  end loop;

  for v_account in
    select account_row.id
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = p_game_session_id
      and party_row.party_kind = 'system'
      and party_row.system_key in (
        'fx.clearing-house',
        'fx.central-reserve',
        'fx.fee-revenue',
        'banking.compatibility-offset'
      )
      and account_row.status = 'active'
    order by account_row.id
  loop
    perform private.ensure_bank_account_projection_v1(
      p_game_session_id,
      v_account.id
    );
  end loop;

  select count(*)::integer
  into v_currency_count
  from public.currencies as currency_row
  where currency_row.status = 'active';

  select count(*)::integer
  into v_account_count
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'system'
    and party_row.system_key in (
      'fx.clearing-house',
      'fx.central-reserve',
      'fx.fee-revenue',
      'banking.compatibility-offset'
    )
    and account_row.status = 'active';

  if v_currency_count <> 11 or v_account_count <> v_currency_count * 4 then
    raise exception 'FX_CLEARING_ACCOUNT_PROVISIONING_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'currencyCount', v_currency_count,
    'accountCount', v_account_count
  );
end;
$function$;

revoke all on function private.ensure_fx_clearing_accounts_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.authorize_bank_account_negative_balance_v1(
  p_game_session_id uuid,
  p_bank_account_id uuid,
  p_proposed_balance numeric,
  p_transaction_kind text,
  p_metadata jsonb,
  p_consumed_hold_ids uuid[]
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_account public.bank_accounts%rowtype;
  v_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_reserved numeric(38, 18);
  v_snapshot_id uuid;
  v_requested_hold numeric(38, 18) := 0;
begin
  if p_game_session_id is null
     or p_bank_account_id is null
     or p_proposed_balance is null
  then
    return false;
  end if;

  select account_row.*
  into v_account
  from public.bank_accounts as account_row
  where account_row.id = p_bank_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.status = 'active';

  if not found then
    return false;
  end if;

  if v_account.account_kind = 'compatibility_offset' then
    return p_transaction_kind = 'compatibility_bridge'
      and coalesce(p_metadata ->> 'compatibilityAuthority', '') =
        'allowlisted_legacy_gateway_v1';
  end if;

  if v_account.account_kind <> 'fx_reserve'
     or p_transaction_kind not in (
       'hold_reservation',
       'fx_liquidity_buffer',
       'fx_conversion',
       'fx_liquidity_repayment'
     )
     or coalesce(p_metadata ->> 'reserveAuthority', '') <> 'fx_liquidity_v1'
     or coalesce(p_metadata ->> 'liquidityCapSnapshotId', '') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  v_snapshot_id := (p_metadata ->> 'liquidityCapSnapshotId')::uuid;

  select cap_row.*
  into v_cap
  from public.fx_liquidity_cap_snapshots as cap_row
  where cap_row.id = v_snapshot_id
    and cap_row.game_session_id = p_game_session_id
    and cap_row.currency_code = v_account.currency_code;

  if not found then
    return false;
  end if;

  select coalesce(sum(hold_row.amount), 0)
  into v_reserved
  from public.bank_account_holds as hold_row
  where hold_row.game_session_id = p_game_session_id
    and hold_row.bank_account_id = p_bank_account_id
    and hold_row.status in ('active', 'claimed')
    and (hold_row.expires_at is null or hold_row.expires_at > clock_timestamp())
    and not (
      hold_row.id = any(coalesce(p_consumed_hold_ids, '{}'::uuid[]))
    );

  if p_transaction_kind = 'hold_reservation' then
    if coalesce(p_metadata ->> 'requestedHoldAmount', '')
         !~ '^[0-9]+([.][0-9]+)?$'
    then
      return false;
    end if;
    v_requested_hold := (p_metadata ->> 'requestedHoldAmount')::numeric;
  end if;

  if p_transaction_kind = 'hold_reservation' then
    -- A reservation consumes only the deficit that would remain after the
    -- reserve account's existing positive balance, if any, is exhausted.
    return greatest(
      v_reserved + v_requested_hold - p_proposed_balance,
      0
    ) <= v_cap.facility_cap;
  end if;

  return greatest(-p_proposed_balance, 0) + v_reserved
    <= v_cap.facility_cap;
end;
$function$;

revoke all on function private.authorize_bank_account_negative_balance_v1(
  uuid, uuid, numeric, text, jsonb, uuid[]
) from public, anon, authenticated, service_role;

create or replace function private.fx_liquidity_headroom_v1(
  p_game_session_id uuid,
  p_cap_snapshot_id uuid,
  p_reserve_account_id uuid,
  p_excluded_hold_ids uuid[] default '{}'::uuid[]
)
returns numeric
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_account public.bank_accounts%rowtype;
  v_balance numeric(38, 18);
  v_reserved numeric(38, 18);
begin
  select cap_row.*
  into v_cap
  from public.fx_liquidity_cap_snapshots as cap_row
  where cap_row.id = p_cap_snapshot_id
    and cap_row.game_session_id = p_game_session_id;

  select account_row.*
  into v_account
  from public.bank_accounts as account_row
  where account_row.id = p_reserve_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'fx_reserve'
    and account_row.status = 'active';

  select balance_row.balance
  into v_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = p_reserve_account_id
    and balance_row.game_session_id = p_game_session_id;

  if v_cap.id is null
     or v_account.id is null
     or v_cap.currency_code <> v_account.currency_code
  then
    raise exception 'FX_LIQUIDITY_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  select coalesce(sum(hold_row.amount), 0)
  into v_reserved
  from public.bank_account_holds as hold_row
  where hold_row.game_session_id = p_game_session_id
    and hold_row.bank_account_id = p_reserve_account_id
    and hold_row.status in ('active', 'claimed')
    and (hold_row.expires_at is null or hold_row.expires_at > clock_timestamp())
    and not (
      hold_row.id = any(coalesce(p_excluded_hold_ids, '{}'::uuid[]))
    );

  return greatest(
    v_cap.facility_cap - greatest(-v_balance, 0) - v_reserved,
    0
  );
end;
$function$;

revoke all on function private.fx_liquidity_headroom_v1(
  uuid, uuid, uuid, uuid[]
) from public, anon, authenticated, service_role;

create or replace function private.snapshot_fx_liquidity_caps_v1(
  p_game_session_id uuid,
  p_fixing_id uuid,
  p_snapshot_kind text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_fixing public.fx_fixings%rowtype;
  v_currency record;
  v_reserve_account_id uuid;
  v_clearing_account_id uuid;
  v_reserve_balance numeric(38, 18);
  v_arrival_basis numeric(38, 18);
  v_arrival_cap numeric(38, 18);
  v_positive_balances numeric(38, 18);
  v_balance_cap numeric(38, 18);
  v_utilized numeric(38, 18);
  v_reserved numeric(38, 18);
  v_floor numeric(38, 18);
  v_cap numeric(38, 18);
  v_buffer numeric(38, 18);
  v_manifest jsonb;
  v_hash text;
  v_snapshot_id uuid;
  v_snapshot_public_key text;
  v_post record;
  v_seed_hash text;
  v_inserted integer := 0;
  v_had_prior_snapshot boolean;
begin
  if p_game_session_id is null
     or p_fixing_id is null
     or p_snapshot_kind not in ('cutover_bootstrap', 'fixing')
  then
    raise exception 'FX_LIQUIDITY_SNAPSHOT_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'banking-monetary-v1:' || p_game_session_id::text,
      0
    )
  );

  select fixing_row.*
  into v_fixing
  from public.fx_fixings as fixing_row
  where fixing_row.id = p_fixing_id
    and fixing_row.game_session_id = p_game_session_id
  for share;

  if not found then
    raise exception 'FX_LIQUIDITY_FIXING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.fx_fixing_currency_values as value_row
    where value_row.fixing_id = p_fixing_id
      and value_row.game_session_id = p_game_session_id
  ) <> (
    select count(*)
    from public.currencies as currency_row
    where currency_row.status = 'active'
  ) then
    raise exception 'FX_LIQUIDITY_FIXING_INCOMPLETE' using errcode = 'P0001';
  end if;

  perform private.ensure_fx_clearing_accounts_v1(p_game_session_id);

  for v_currency in
    select
      currency_row.code,
      currency_row.decimal_places,
      value_row.units_per_eco
    from public.currencies as currency_row
    join public.fx_fixing_currency_values as value_row
      on value_row.fixing_id = p_fixing_id
     and value_row.game_session_id = p_game_session_id
     and value_row.currency_code = currency_row.code
    where currency_row.status = 'active'
    order by currency_row.code
  loop
    if exists (
      select 1
      from public.fx_liquidity_cap_snapshots as cap_row
      where cap_row.fixing_id = p_fixing_id
        and cap_row.currency_code = v_currency.code
    ) then
      continue;
    end if;

    select account_row.id, balance_row.balance
    into strict v_reserve_account_id, v_reserve_balance
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    join public.account_balances as balance_row
      on balance_row.bank_account_id = account_row.id
     and balance_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = p_game_session_id
      and account_row.account_kind = 'fx_reserve'
      and account_row.currency_code = v_currency.code
      and account_row.status = 'active'
      and party_row.party_kind = 'system'
      and party_row.system_key = 'fx.central-reserve';

    select account_row.id
    into strict v_clearing_account_id
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = p_game_session_id
      and account_row.account_kind = 'fx_clearing'
      and account_row.currency_code = v_currency.code
      and account_row.status = 'active'
      and party_row.party_kind = 'system'
      and party_row.system_key = 'fx.clearing-house';

    if v_currency.code = 'ECO' then
      select coalesce(max(
        package_row.approved_starting_balance / nullif(value_row.units_per_eco, 0)
      ), 0)
      into v_arrival_basis
      from public.arrival_package_runtime_definitions as package_row
      join public.fx_fixing_currency_values as value_row
        on value_row.fixing_id = p_fixing_id
       and value_row.game_session_id = p_game_session_id
       and value_row.currency_code = package_row.currency_code
      where package_row.status = 'active';
    else
      select coalesce(max(package_row.approved_starting_balance), 0)
      into v_arrival_basis
      from public.arrival_package_runtime_definitions as package_row
      where package_row.status = 'active'
        and package_row.currency_code = v_currency.code;
    end if;

    select coalesce(sum(greatest(balance_row.balance, 0)), 0)
    into v_positive_balances
    from public.account_balances as balance_row
    join public.bank_accounts as account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where balance_row.game_session_id = p_game_session_id
      and account_row.currency_code = v_currency.code
      and party_row.party_kind <> 'system';

    select coalesce(sum(hold_row.amount), 0)
    into v_reserved
    from public.bank_account_holds as hold_row
    where hold_row.game_session_id = p_game_session_id
      and hold_row.bank_account_id = v_reserve_account_id
      and hold_row.status in ('active', 'claimed')
      and (hold_row.expires_at is null or hold_row.expires_at > clock_timestamp());

    v_arrival_basis := round(v_arrival_basis, v_currency.decimal_places);
    v_positive_balances := round(v_positive_balances, v_currency.decimal_places);
    v_arrival_cap := round(v_arrival_basis * 100, v_currency.decimal_places);
    v_balance_cap := round(v_positive_balances * 2, v_currency.decimal_places);
    v_utilized := round(greatest(-v_reserve_balance, 0), v_currency.decimal_places);
    v_reserved := round(v_reserved, v_currency.decimal_places);
    v_floor := round(v_utilized + v_reserved, v_currency.decimal_places);
    v_cap := round(
      greatest(v_arrival_cap, v_balance_cap, v_floor),
      v_currency.decimal_places
    );
    v_buffer := round(v_cap * 0.10, v_currency.decimal_places);

    if v_cap <= 0 then
      raise exception 'FX_LIQUIDITY_CAP_INVALID' using errcode = 'P0001';
    end if;

    v_manifest := jsonb_build_object(
      'version', 'fx-liquidity-cap-v1',
      'gameSessionId', p_game_session_id,
      'fixingId', p_fixing_id,
      'fixingPublicKey', v_fixing.public_key,
      'currencyCode', v_currency.code,
      'arrivalBasisAmount', v_arrival_basis::text,
      'arrivalFormulaCap', v_arrival_cap::text,
      'positiveNonSystemBalance', v_positive_balances::text,
      'balanceFormulaCap', v_balance_cap::text,
      'utilizedBefore', v_utilized::text,
      'reservedBefore', v_reserved::text,
      'utilizationFloor', v_floor::text,
      'facilityCap', v_cap::text,
      'operatingBufferTarget', v_buffer::text
    );
    v_hash := private.fx_digest_jsonb_v1(v_manifest);

    select exists (
      select 1
      from public.fx_liquidity_cap_snapshots as prior_row
      where prior_row.game_session_id = p_game_session_id
        and prior_row.currency_code = v_currency.code
    )
    into v_had_prior_snapshot;

    insert into public.fx_liquidity_cap_snapshots(
      game_session_id,
      fixing_id,
      currency_code,
      snapshot_kind,
      arrival_basis_amount,
      arrival_formula_cap,
      positive_non_system_balance,
      balance_formula_cap,
      utilized_before,
      reserved_before,
      utilization_floor,
      facility_cap,
      operating_buffer_target,
      input_hash
    )
    values (
      p_game_session_id,
      p_fixing_id,
      v_currency.code,
      p_snapshot_kind,
      v_arrival_basis,
      v_arrival_cap,
      v_positive_balances,
      v_balance_cap,
      v_utilized,
      v_reserved,
      v_floor,
      v_cap,
      v_buffer,
      v_hash
    )
    returning id, public_key
    into v_snapshot_id, v_snapshot_public_key;

    if not v_had_prior_snapshot and v_buffer > 0 then
      v_seed_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
        'version', 'fx-liquidity-buffer-v1',
        'capSnapshotId', v_snapshot_id,
        'currencyCode', v_currency.code,
        'amount', v_buffer::text
      ));

      select *
      into strict v_post
      from private.post_bank_transaction_v1(
        p_game_session_id,
        'fx_liquidity_buffer',
        'banking_fx',
        'seed_operating_buffer',
        v_snapshot_id,
        'fx-buffer:' || v_snapshot_public_key,
        v_seed_hash,
        jsonb_build_array(
          jsonb_build_object(
            'bankAccountId', v_reserve_account_id,
            'amount', (-v_buffer)::text,
            'entryType', 'debit',
            'metadata', jsonb_build_object('lineRole', 'reserve_draw')
          ),
          jsonb_build_object(
            'bankAccountId', v_clearing_account_id,
            'amount', v_buffer::text,
            'entryType', 'credit',
            'metadata', jsonb_build_object('lineRole', 'clearing_buffer')
          )
        ),
        'system',
        null,
        jsonb_build_object(
          'reserveAuthority', 'fx_liquidity_v1',
          'liquidityCapSnapshotId', v_snapshot_id,
          'currencyCode', v_currency.code
        ),
        '{}'::uuid[]
      );

      insert into public.fx_liquidity_events(
        game_session_id,
        cap_snapshot_id,
        bank_transaction_id,
        currency_code,
        event_kind,
        amount,
        idempotency_key,
        request_hash,
        metadata
      )
      values (
        p_game_session_id,
        v_snapshot_id,
        v_post.bank_transaction_id,
        v_currency.code,
        'buffer_seed',
        v_buffer,
        'fx-buffer-event:' || v_snapshot_public_key,
        v_seed_hash,
        jsonb_build_object('fixingPublicKey', v_fixing.public_key)
      );
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  if (
    select count(*)
    from public.fx_liquidity_cap_snapshots as cap_row
    where cap_row.fixing_id = p_fixing_id
      and cap_row.game_session_id = p_game_session_id
  ) <> (
    select count(*)
    from public.currencies as currency_row
    where currency_row.status = 'active'
  ) then
    raise exception 'FX_LIQUIDITY_CAP_SET_INCOMPLETE' using errcode = 'P0001';
  end if;

  return v_inserted;
end;
$function$;

revoke all on function private.snapshot_fx_liquidity_caps_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.capture_fx_liquidity_caps_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if new.cutover_status = 'ready'
     and new.current_fixing_id is not null
     and (
       tg_op = 'INSERT'
       or new.current_fixing_id is distinct from old.current_fixing_id
     )
  then
    perform private.snapshot_fx_liquidity_caps_v1(
      new.game_session_id,
      new.current_fixing_id,
      'fixing'
    );
  end if;

  return new;
end;
$function$;

create trigger capture_fx_liquidity_caps_on_runtime_pointer
after insert or update on private.fx_runtime_state
for each row execute function private.capture_fx_liquidity_caps_v1();

revoke all on function private.capture_fx_liquidity_caps_v1()
  from public, anon, authenticated, service_role;

do $backfill_current_fx_liquidity_caps$
declare
  v_runtime record;
begin
  for v_runtime in
    select runtime.game_session_id, runtime.current_fixing_id
    from private.fx_runtime_state as runtime
    where runtime.cutover_status = 'ready'
      and runtime.current_fixing_id is not null
    order by runtime.game_session_id
  loop
    perform private.snapshot_fx_liquidity_caps_v1(
      v_runtime.game_session_id,
      v_runtime.current_fixing_id,
      'cutover_bootstrap'
    );
  end loop;
end;
$backfill_current_fx_liquidity_caps$;

commit;
