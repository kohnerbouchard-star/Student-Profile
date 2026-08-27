-- Shared multi-currency purchase-funding quote authority V1.
--
-- C0 creates immutable, non-reserving target-credit funding quotes for one
-- trusted target-currency bill and one to three Player Checking accounts.
-- It consumes B1 fixing evidence and B2 Banking/clearing authority without
-- modifying Store, Marketplace, Stocks, or Business settlement paths.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.purchase_funding_quotes (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'pfq_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  funding_context_kind text not null,
  funding_context_key text not null,
  funding_context_hash text not null,
  target_currency_code text not null references public.currencies(code),
  target_minor_unit integer not null,
  target_amount numeric(38, 18) not null,
  fixing_id uuid not null,
  policy_version_id uuid not null references public.fx_policy_versions(id),
  target_cap_snapshot_id uuid null,
  requires_fx boolean not null,
  idempotency_key text not null,
  request_hash text not null,
  evidence_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint purchase_funding_quotes_public_key_format
    check (public_key ~ '^pfq_[0-9a-f]{32}$'),
  constraint purchase_funding_quotes_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint purchase_funding_quotes_fixing_scope_fk
    foreign key (fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id),
  constraint purchase_funding_quotes_cap_scope_fk
    foreign key (target_cap_snapshot_id, game_session_id)
    references public.fx_liquidity_cap_snapshots(id, game_session_id),
  constraint purchase_funding_quotes_context_kind_check
    check (funding_context_kind ~ '^[a-z][a-z0-9._:-]{0,95}$'),
  constraint purchase_funding_quotes_context_key_check
    check (
      length(btrim(funding_context_key)) between 3 and 240
      and funding_context_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  constraint purchase_funding_quotes_context_hash_format
    check (funding_context_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_funding_quotes_precision_check
    check (target_minor_unit between 0 and 18),
  constraint purchase_funding_quotes_amount_check
    check (target_amount > 0 and target_amount < 1000000000000000::numeric),
  constraint purchase_funding_quotes_fx_check
    check (
      (requires_fx and target_cap_snapshot_id is not null)
      or (not requires_fx and target_cap_snapshot_id is null)
    ),
  constraint purchase_funding_quotes_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint purchase_funding_quotes_request_hash_format
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_funding_quotes_evidence_hash_format
    check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_funding_quotes_timing_check
    check (created_at < expires_at),
  constraint purchase_funding_quotes_scope_idempotency_unique
    unique (game_session_id, player_id, idempotency_key),
  constraint purchase_funding_quotes_scope_id_unique
    unique (id, game_session_id)
);

create index purchase_funding_quotes_player_created_idx
  on public.purchase_funding_quotes(
    game_session_id, player_id, created_at desc, public_key desc
  );

create table public.purchase_funding_quote_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  quote_id uuid not null,
  game_session_id uuid not null,
  line_number integer not null,
  source_account_id uuid not null,
  source_currency_code text not null references public.currencies(code),
  source_minor_unit integer not null,
  target_currency_code text not null references public.currencies(code),
  target_minor_unit integer not null,
  source_posted_snapshot numeric(38, 18) not null,
  source_held_snapshot numeric(38, 18) not null,
  source_available_snapshot numeric(38, 18) not null,
  target_contribution numeric(38, 18) not null,
  source_debit numeric(38, 18) not null,
  reference_rate numeric(38, 18) not null,
  customer_rate numeric(38, 18) not null,
  effective_rate numeric(38, 18) not null,
  spread_rate numeric(18, 8) not null,
  requires_fx boolean not null,
  rounding_disclosure text not null,
  evidence_hash text not null,
  created_at timestamptz not null,

  constraint purchase_funding_quote_lines_quote_scope_fk
    foreign key (quote_id, game_session_id)
    references public.purchase_funding_quotes(id, game_session_id) on delete cascade,
  constraint purchase_funding_quote_lines_account_scope_fk
    foreign key (source_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id),
  constraint purchase_funding_quote_lines_number_check
    check (line_number between 1 and 3),
  constraint purchase_funding_quote_lines_precision_check
    check (
      source_minor_unit between 0 and 18
      and target_minor_unit between 0 and 18
    ),
  constraint purchase_funding_quote_lines_snapshot_check
    check (
      source_held_snapshot >= 0
      and source_available_snapshot = source_posted_snapshot - source_held_snapshot
    ),
  constraint purchase_funding_quote_lines_amount_check
    check (
      target_contribution > 0
      and source_debit > 0
      and target_contribution < 1000000000000000::numeric
      and source_debit < 1000000000000000::numeric
    ),
  constraint purchase_funding_quote_lines_rate_check
    check (
      reference_rate > 0
      and customer_rate > 0
      and effective_rate > 0
      and spread_rate in (0, 0.01)
    ),
  constraint purchase_funding_quote_lines_fx_check
    check (
      (
        requires_fx
        and source_currency_code <> target_currency_code
        and spread_rate = 0.01
        and customer_rate < reference_rate
      )
      or (
        not requires_fx
        and source_currency_code = target_currency_code
        and source_debit = target_contribution
        and reference_rate = 1
        and customer_rate = 1
        and effective_rate = 1
        and spread_rate = 0
      )
    ),
  constraint purchase_funding_quote_lines_rounding_check
    check (length(btrim(rounding_disclosure)) between 1 and 400),
  constraint purchase_funding_quote_lines_evidence_hash_format
    check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_funding_quote_lines_quote_number_unique
    unique (quote_id, line_number),
  constraint purchase_funding_quote_lines_quote_account_unique
    unique (quote_id, source_account_id)
);

create index purchase_funding_quote_lines_account_idx
  on public.purchase_funding_quote_lines(
    game_session_id, source_account_id, quote_id
  );

alter table public.purchase_funding_quotes enable row level security;
alter table public.purchase_funding_quotes force row level security;
alter table public.purchase_funding_quote_lines enable row level security;
alter table public.purchase_funding_quote_lines force row level security;

revoke all on table public.purchase_funding_quotes
  from public, anon, authenticated, service_role;
revoke all on table public.purchase_funding_quote_lines
  from public, anon, authenticated, service_role;
grant select on table public.purchase_funding_quotes to service_role;
grant select on table public.purchase_funding_quote_lines to service_role;

comment on table public.purchase_funding_quotes is
  'Immutable non-reserving multi-currency purchase-funding quote for one exact target-currency bill.';
comment on table public.purchase_funding_quote_lines is
  'Immutable one-to-three source Checking allocation evidence using exact target-credit retail pricing.';

create or replace function private.reject_purchase_funding_quote_mutation_v1()
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

  raise exception 'PURCHASE_FUNDING_EVIDENCE_IMMUTABLE' using errcode = '42501';
end;
$function$;

create trigger guard_purchase_funding_quotes_immutable
before update or delete on public.purchase_funding_quotes
for each row execute function private.reject_purchase_funding_quote_mutation_v1();

create trigger guard_purchase_funding_quote_lines_immutable
before update or delete on public.purchase_funding_quote_lines
for each row execute function private.reject_purchase_funding_quote_mutation_v1();

revoke all on function private.reject_purchase_funding_quote_mutation_v1()
  from public, anon, authenticated, service_role;

create or replace function private.purchase_funding_ceil_minor_v1(
  p_amount numeric,
  p_decimal_places integer
)
returns numeric
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_scale numeric;
begin
  if p_amount <= 0 or p_decimal_places not between 0 and 18 then
    raise exception 'PURCHASE_FUNDING_PRECISION_INVALID' using errcode = '22023';
  end if;

  v_scale := power(10::numeric, p_decimal_places);
  return ceil(p_amount * v_scale) / v_scale;
end;
$function$;

revoke all on function private.purchase_funding_ceil_minor_v1(numeric, integer)
  from public, anon, authenticated, service_role;

create or replace function private.purchase_funding_quote_public_json_v1(
  p_quote_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'quote_key', quote_row.public_key,
    'funding_context_kind', quote_row.funding_context_kind,
    'funding_context_key', quote_row.funding_context_key,
    'target_currency_code', quote_row.target_currency_code,
    'target_minor_unit', quote_row.target_minor_unit,
    'target_amount', quote_row.target_amount::text,
    'fixing_key', fixing_row.public_key,
    'policy_version', policy_row.policy_version,
    'requires_fx', quote_row.requires_fx,
    'expires_at', quote_row.expires_at,
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'line_number', line_row.line_number,
          'source_account_key', account_row.public_key,
          'source_currency_code', line_row.source_currency_code,
          'source_minor_unit', line_row.source_minor_unit,
          'target_currency_code', line_row.target_currency_code,
          'target_minor_unit', line_row.target_minor_unit,
          'posted_amount', line_row.source_posted_snapshot::text,
          'held_amount', line_row.source_held_snapshot::text,
          'available_amount', line_row.source_available_snapshot::text,
          'target_contribution', line_row.target_contribution::text,
          'source_debit', line_row.source_debit::text,
          'reference_rate', line_row.reference_rate::text,
          'customer_rate', line_row.customer_rate::text,
          'effective_rate', line_row.effective_rate::text,
          'spread_rate', line_row.spread_rate::text,
          'requires_fx', line_row.requires_fx,
          'rounding_disclosure', line_row.rounding_disclosure
        )
        order by line_row.line_number
      )
      from public.purchase_funding_quote_lines as line_row
      join public.bank_accounts as account_row
        on account_row.id = line_row.source_account_id
       and account_row.game_session_id = line_row.game_session_id
      where line_row.quote_id = quote_row.id
        and line_row.game_session_id = quote_row.game_session_id
    ), '[]'::jsonb)
  )
  from public.purchase_funding_quotes as quote_row
  join public.fx_fixings as fixing_row
    on fixing_row.id = quote_row.fixing_id
   and fixing_row.game_session_id = quote_row.game_session_id
  join public.fx_policy_versions as policy_row
    on policy_row.id = quote_row.policy_version_id
  where quote_row.id = p_quote_id;
$function$;

revoke all on function private.purchase_funding_quote_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_purchase_funding_quote_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_target_currency_code text,
  p_target_amount numeric,
  p_funding_context_kind text,
  p_funding_context_key text,
  p_funding_context_hash text,
  p_allocations jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_target_currency text := upper(btrim(coalesce(p_target_currency_code, '')));
  v_context_kind text := lower(btrim(coalesce(p_funding_context_kind, '')));
  v_context_key text := btrim(coalesce(p_funding_context_key, ''));
  v_context_hash text := lower(btrim(coalesce(p_funding_context_hash, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_target_decimals integer;
  v_runtime private.fx_runtime_state%rowtype;
  v_fixing public.fx_fixings%rowtype;
  v_target_units numeric(38, 18);
  v_target_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_target_clearing_id uuid;
  v_target_reserve_id uuid;
  v_target_clearing_balance numeric(38, 18);
  v_target_clearing_holds numeric(38, 18);
  v_target_reserve_headroom numeric(38, 18);
  v_fx_target_total numeric(38, 18) := 0;
  v_normalized_allocations jsonb;
  v_request jsonb;
  v_request_hash text;
  v_evidence_hash text;
  v_existing public.purchase_funding_quotes%rowtype;
  v_quote_id uuid := extensions.gen_random_uuid();
  v_quote_public_key text;
  v_target_sum numeric(38, 18);
  v_line_count integer;
  v_line_number integer := 0;
  v_allocation record;
  v_source_account public.bank_accounts%rowtype;
  v_source_decimals integer;
  v_source_units numeric(38, 18);
  v_source_balance numeric(38, 18);
  v_source_holds numeric(38, 18);
  v_source_available numeric(38, 18);
  v_target_contribution numeric(38, 18);
  v_source_debit numeric(38, 18);
  v_reference_rate numeric(38, 18);
  v_customer_rate numeric(38, 18);
  v_effective_rate numeric(38, 18);
  v_spread_rate numeric(18, 8);
  v_requires_fx boolean;
  v_rounding_disclosure text;
  v_line_hash text;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_target_currency !~ '^[A-Z]{3,16}$'
     or p_target_amount is null
     or p_target_amount <= 0
     or p_target_amount >= 1000000000000000::numeric
     or v_context_kind !~ '^[a-z][a-z0-9._:-]{0,95}$'
     or length(v_context_key) not between 3 and 240
     or v_context_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_context_hash !~ '^[0-9a-f]{64}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) not between 1 and 3
  then
    raise exception 'PURCHASE_FUNDING_QUOTE_REQUEST_INVALID' using errcode = '22023';
  end if;

  select currency_row.decimal_places
  into v_target_decimals
  from public.currencies as currency_row
  where currency_row.code = v_target_currency
    and currency_row.status = 'active';
  if v_target_decimals is null then
    raise exception 'PURCHASE_FUNDING_CURRENCY_INVALID' using errcode = '22023';
  end if;
  if p_target_amount <> round(p_target_amount, v_target_decimals) then
    raise exception 'PURCHASE_FUNDING_TARGET_PRECISION_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) as allocation(value)
    where jsonb_typeof(allocation.value) <> 'object'
       or not (allocation.value ? 'sourceAccountKey')
       or not (allocation.value ? 'targetAmount')
       or (select count(*) from jsonb_object_keys(allocation.value)) <> 2
       or coalesce(allocation.value ->> 'sourceAccountKey', '') !~ '^bac_[0-9a-f]{32}$'
       or coalesce(allocation.value ->> 'targetAmount', '') !~ '^[0-9]+([.][0-9]+)?$'
       or (allocation.value ->> 'targetAmount')::numeric <= 0
  ) then
    raise exception 'PURCHASE_FUNDING_ALLOCATION_INVALID' using errcode = '22023';
  end if;

  select count(*)::integer, sum((allocation.value ->> 'targetAmount')::numeric)
  into v_line_count, v_target_sum
  from jsonb_array_elements(p_allocations) as allocation(value);

  if (
    select count(distinct allocation.value ->> 'sourceAccountKey')
    from jsonb_array_elements(p_allocations) as allocation(value)
  ) <> v_line_count then
    raise exception 'PURCHASE_FUNDING_DUPLICATE_ACCOUNT' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) as allocation(value)
    where (allocation.value ->> 'targetAmount')::numeric
      <> round((allocation.value ->> 'targetAmount')::numeric, v_target_decimals)
  ) then
    raise exception 'PURCHASE_FUNDING_TARGET_PRECISION_INVALID' using errcode = '22023';
  end if;

  if v_target_sum is distinct from p_target_amount then
    raise exception 'PURCHASE_FUNDING_TOTAL_MISMATCH' using errcode = 'P0001';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'sourceAccountKey', allocation.value ->> 'sourceAccountKey',
      'targetAmount', ((allocation.value ->> 'targetAmount')::numeric)::text
    )
    order by allocation.value ->> 'sourceAccountKey'
  )
  into v_normalized_allocations
  from jsonb_array_elements(p_allocations) as allocation(value);

  v_request := jsonb_build_object(
    'version', 'purchase-funding-quote-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'targetCurrencyCode', v_target_currency,
    'targetAmount', p_target_amount::text,
    'fundingContextKind', v_context_kind,
    'fundingContextKey', v_context_key,
    'fundingContextHash', v_context_hash,
    'allocations', v_normalized_allocations
  );
  v_request_hash := private.fx_digest_jsonb_v1(v_request);

  perform pg_advisory_xact_lock(hashtextextended(
    'purchase-funding-quote-v1:' || p_game_session_id::text || ':' ||
      p_player_id::text || ':' || v_idempotency_key,
    0
  ));

  select quote_row.*
  into v_existing
  from public.purchase_funding_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'PURCHASE_FUNDING_QUOTE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'quote', private.purchase_funding_quote_public_json_v1(v_existing.id)
    );
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
    and runtime.cutover_status = 'ready'
  for share;
  if not found or v_runtime.current_fixing_id is null then
    raise exception 'FX_FIXING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_runtime.next_due_at is null or v_runtime.next_due_at <= v_now then
    raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
  end if;

  select fixing_row.*
  into strict v_fixing
  from public.fx_fixings as fixing_row
  where fixing_row.id = v_runtime.current_fixing_id
    and fixing_row.game_session_id = p_game_session_id;

  select value_row.units_per_eco
  into v_target_units
  from public.fx_fixing_currency_values as value_row
  where value_row.fixing_id = v_fixing.id
    and value_row.game_session_id = p_game_session_id
    and value_row.currency_code = v_target_currency;
  if v_target_units is null then
    raise exception 'FX_FIXING_VALUE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_expires_at := least(v_now + interval '120 seconds', v_runtime.next_due_at);
  if v_expires_at <= v_now then
    raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
  end if;

  -- Validate every source account and calculate immutable target-credit lines
  -- before inserting any quote evidence.
  for v_allocation in
    select
      allocation.value ->> 'sourceAccountKey' as source_account_key,
      (allocation.value ->> 'targetAmount')::numeric as target_contribution
    from jsonb_array_elements(v_normalized_allocations) as allocation(value)
    order by allocation.value ->> 'sourceAccountKey'
  loop
    v_line_number := v_line_number + 1;
    v_target_contribution := v_allocation.target_contribution;

    select account_row.*
    into v_source_account
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.public_key = v_allocation.source_account_key
      and account_row.game_session_id = p_game_session_id
      and account_row.account_kind = 'checking'
      and account_row.status = 'active'
      and party_row.party_kind = 'player'
      and party_row.player_id = p_player_id
      and party_row.status = 'active';
    if not found then
      raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
    end if;

    select currency_row.decimal_places, value_row.units_per_eco
    into v_source_decimals, v_source_units
    from public.currencies as currency_row
    join public.fx_fixing_currency_values as value_row
      on value_row.fixing_id = v_fixing.id
     and value_row.game_session_id = p_game_session_id
     and value_row.currency_code = currency_row.code
    where currency_row.code = v_source_account.currency_code
      and currency_row.status = 'active';
    if v_source_decimals is null or v_source_units is null then
      raise exception 'FX_FIXING_VALUE_NOT_FOUND' using errcode = 'P0001';
    end if;

    v_requires_fx := v_source_account.currency_code <> v_target_currency;
    if v_requires_fx then
      v_reference_rate := (v_target_units / v_source_units)::numeric(38, 18);
      v_customer_rate := (v_reference_rate * 0.99)::numeric(38, 18);
      v_spread_rate := 0.01;
      -- Target-credit mode fixes the merchant contribution and rounds the
      -- required payer debit upward once at the source currency minor unit.
      v_source_debit := private.purchase_funding_ceil_minor_v1(
        v_target_contribution * v_source_units / v_target_units / 0.99,
        v_source_decimals
      );
      v_effective_rate := (v_target_contribution / v_source_debit)::numeric(38, 18);
      v_rounding_disclosure :=
        'Retail checkout FX uses the accepted reference fixing less a 1.00% spread; source debit is rounded upward once to the source-currency minor unit so the target contribution remains exact.';
      v_fx_target_total := v_fx_target_total + v_target_contribution;
    else
      v_reference_rate := 1;
      v_customer_rate := 1;
      v_spread_rate := 0;
      v_source_debit := v_target_contribution;
      v_effective_rate := 1;
      v_rounding_disclosure :=
        'Same-currency funding uses rate 1 with no FX spread, fee, or reserve capacity.';
    end if;

    if v_source_debit <= 0
       or v_source_debit >= 1000000000000000::numeric
       or v_source_debit <> round(v_source_debit, v_source_decimals)
    then
      raise exception 'PURCHASE_FUNDING_SOURCE_AMOUNT_INVALID' using errcode = '22023';
    end if;

    select balance_row.balance
    into v_source_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.bank_account_id = v_source_account.id;
    if not found then
      raise exception 'BANK_ACCOUNT_PROJECTION_MISSING' using errcode = 'P0001';
    end if;

    v_source_holds := private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      v_source_account.id,
      '{}'::uuid[]
    );
    v_source_available := v_source_balance - v_source_holds;
    if v_source_available < v_source_debit then
      raise exception 'FUNDING_INSUFFICIENT' using errcode = 'P0001';
    end if;

    v_line_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
      'version', 'purchase-funding-quote-line-v1',
      'quoteId', v_quote_id,
      'lineNumber', v_line_number,
      'sourceAccountId', v_source_account.id,
      'sourceCurrencyCode', v_source_account.currency_code,
      'sourceMinorUnit', v_source_decimals,
      'targetCurrencyCode', v_target_currency,
      'targetMinorUnit', v_target_decimals,
      'sourcePostedSnapshot', v_source_balance::text,
      'sourceHeldSnapshot', v_source_holds::text,
      'sourceAvailableSnapshot', v_source_available::text,
      'targetContribution', v_target_contribution::text,
      'sourceDebit', v_source_debit::text,
      'referenceRate', v_reference_rate::text,
      'customerRate', v_customer_rate::text,
      'effectiveRate', v_effective_rate::text,
      'spreadRate', v_spread_rate::text,
      'requiresFx', v_requires_fx
    ));

    -- Staged in a temporary table so the quote header can be inserted only
    -- after every source and target-liquidity check succeeds.
    create temporary table if not exists pg_temp.purchase_funding_line_stage_v1 (
      line_number integer,
      source_account_id uuid,
      source_currency_code text,
      source_minor_unit integer,
      source_posted_snapshot numeric(38, 18),
      source_held_snapshot numeric(38, 18),
      source_available_snapshot numeric(38, 18),
      target_contribution numeric(38, 18),
      source_debit numeric(38, 18),
      reference_rate numeric(38, 18),
      customer_rate numeric(38, 18),
      effective_rate numeric(38, 18),
      spread_rate numeric(18, 8),
      requires_fx boolean,
      rounding_disclosure text,
      evidence_hash text
    ) on commit drop;

    insert into pg_temp.purchase_funding_line_stage_v1 values (
      v_line_number,
      v_source_account.id,
      v_source_account.currency_code,
      v_source_decimals,
      v_source_balance,
      v_source_holds,
      v_source_available,
      v_target_contribution,
      v_source_debit,
      v_reference_rate,
      v_customer_rate,
      v_effective_rate,
      v_spread_rate,
      v_requires_fx,
      v_rounding_disclosure,
      v_line_hash
    );
  end loop;

  if v_fx_target_total > 0 then
    v_target_cap := private.player_fx_current_cap_v1(
      p_game_session_id,
      v_target_currency
    );
    if v_target_cap.fixing_id is distinct from v_fixing.id then
      raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
    end if;

    v_target_clearing_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.clearing-house',
      'fx_clearing',
      v_target_currency
    );
    v_target_reserve_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.central-reserve',
      'fx_reserve',
      v_target_currency
    );

    select balance_row.balance
    into strict v_target_clearing_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.bank_account_id = v_target_clearing_id;
    v_target_clearing_holds := private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      v_target_clearing_id,
      '{}'::uuid[]
    );
    v_target_reserve_headroom := private.fx_liquidity_headroom_v1(
      p_game_session_id,
      v_target_cap.id,
      v_target_reserve_id,
      '{}'::uuid[]
    );

    if greatest(v_target_clearing_balance - v_target_clearing_holds, 0)
         + v_target_reserve_headroom < v_fx_target_total
    then
      raise exception 'FX_LIQUIDITY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  v_quote_public_key := 'pfq_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'purchase-funding-quote-v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  )), 1, 32);

  v_evidence_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'purchase-funding-quote-evidence-v1',
    'requestHash', v_request_hash,
    'quotePublicKey', v_quote_public_key,
    'fixingPublicKey', v_fixing.public_key,
    'policyVersionId', v_fixing.policy_version_id,
    'targetCurrencyCode', v_target_currency,
    'targetMinorUnit', v_target_decimals,
    'targetAmount', p_target_amount::text,
    'fxTargetAmount', v_fx_target_total::text,
    'targetCapSnapshotPublicKey', case
      when v_fx_target_total > 0 then v_target_cap.public_key
      else null
    end,
    'expiresAt', v_expires_at
  ));

  insert into public.purchase_funding_quotes(
    id,
    public_key,
    game_session_id,
    player_id,
    funding_context_kind,
    funding_context_key,
    funding_context_hash,
    target_currency_code,
    target_minor_unit,
    target_amount,
    fixing_id,
    policy_version_id,
    target_cap_snapshot_id,
    requires_fx,
    idempotency_key,
    request_hash,
    evidence_hash,
    expires_at,
    created_at
  ) values (
    v_quote_id,
    v_quote_public_key,
    p_game_session_id,
    p_player_id,
    v_context_kind,
    v_context_key,
    v_context_hash,
    v_target_currency,
    v_target_decimals,
    p_target_amount,
    v_fixing.id,
    v_fixing.policy_version_id,
    case when v_fx_target_total > 0 then v_target_cap.id else null end,
    v_fx_target_total > 0,
    v_idempotency_key,
    v_request_hash,
    v_evidence_hash,
    v_expires_at,
    v_now
  );

  insert into public.purchase_funding_quote_lines(
    quote_id,
    game_session_id,
    line_number,
    source_account_id,
    source_currency_code,
    source_minor_unit,
    target_currency_code,
    target_minor_unit,
    source_posted_snapshot,
    source_held_snapshot,
    source_available_snapshot,
    target_contribution,
    source_debit,
    reference_rate,
    customer_rate,
    effective_rate,
    spread_rate,
    requires_fx,
    rounding_disclosure,
    evidence_hash,
    created_at
  )
  select
    v_quote_id,
    p_game_session_id,
    stage.line_number,
    stage.source_account_id,
    stage.source_currency_code,
    stage.source_minor_unit,
    v_target_currency,
    v_target_decimals,
    stage.source_posted_snapshot,
    stage.source_held_snapshot,
    stage.source_available_snapshot,
    stage.target_contribution,
    stage.source_debit,
    stage.reference_rate,
    stage.customer_rate,
    stage.effective_rate,
    stage.spread_rate,
    stage.requires_fx,
    stage.rounding_disclosure,
    stage.evidence_hash,
    v_now
  from pg_temp.purchase_funding_line_stage_v1 as stage
  order by stage.line_number;

  return jsonb_build_object(
    'outcome', 'applied',
    'quote', private.purchase_funding_quote_public_json_v1(v_quote_id)
  );
end;
$function$;

revoke all on function public.create_purchase_funding_quote_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_purchase_funding_quote_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) to service_role;

commit;
