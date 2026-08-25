begin;

-- Canonical FX authority v1.
-- B1 owns currency identity, reference fixings, deterministic input evidence,
-- and Story shock authorization only. Banking balances, holds, clearing, and
-- monetary settlement remain deliberately outside this migration.

alter table public.currencies
  add column if not exists currency_kind text;

update public.currencies
set currency_kind = 'national'
where currency_kind is null;

alter table public.currencies
  alter column currency_kind set default 'national',
  alter column currency_kind set not null,
  alter column country_code drop not null;

alter table public.currencies
  drop constraint if exists currencies_currency_kind_check,
  drop constraint if exists currencies_country_kind_consistency_check;

alter table public.currencies
  add constraint currencies_currency_kind_check
    check (currency_kind in ('national', 'global_settlement')),
  add constraint currencies_country_kind_consistency_check
    check (
      (currency_kind = 'national' and country_code is not null)
      or (currency_kind = 'global_settlement' and country_code is null)
    );

insert into public.currencies (
  code,
  country_code,
  name,
  symbol,
  decimal_places,
  status,
  symbol_key,
  currency_kind
)
values (
  'ECO',
  null,
  'Econovaria Settlement Unit',
  'ECO',
  2,
  'active',
  null,
  'global_settlement'
)
on conflict (code) do nothing;

do $validate_eco_registry$
begin
  if not exists (
    select 1
    from public.currencies as currency_row
    where currency_row.code = 'ECO'
      and currency_row.country_code is null
      and currency_row.name = 'Econovaria Settlement Unit'
      and currency_row.symbol = 'ECO'
      and currency_row.decimal_places = 2
      and currency_row.status = 'active'
      and currency_row.symbol_key is null
      and currency_row.currency_kind = 'global_settlement'
  ) then
    raise exception 'FX_ECO_REGISTRY_CONFLICT' using errcode = 'P0001';
  end if;
end;
$validate_eco_registry$;

create table public.fx_policy_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  policy_version text not null unique,
  status text not null default 'published',
  fixing_local_time time without time zone not null default time '08:00',
  normal_movement_cap_basis_points integer not null,
  crisis_movement_cap_basis_points integer not null,
  parameters jsonb not null,
  activated_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_policy_versions_policy_version_format
    check (policy_version ~ '^fx-policy-v[1-9][0-9]*$'),
  constraint fx_policy_versions_status_check
    check (status = 'published'),
  constraint fx_policy_versions_normal_cap_check
    check (normal_movement_cap_basis_points between 1 and 200),
  constraint fx_policy_versions_crisis_cap_check
    check (
      crisis_movement_cap_basis_points
        between normal_movement_cap_basis_points and 1500
    ),
  constraint fx_policy_versions_parameters_object
    check (jsonb_typeof(parameters) = 'object'),
  constraint fx_policy_versions_component_caps_fit_storage
    check (
      case
        when parameters #>> '{gdp,capBasisPoints}' ~ '^[0-9]+$'
          then (parameters #>> '{gdp,capBasisPoints}')::integer between 1 and 50
        else false
      end
      and case
        when parameters #>> '{inflation,capBasisPoints}' ~ '^[0-9]+$'
          then (parameters #>> '{inflation,capBasisPoints}')::integer
            between 1 and 45
        else false
      end
      and case
        when parameters #>> '{realInterest,capBasisPoints}' ~ '^[0-9]+$'
          then (parameters #>> '{realInterest,capBasisPoints}')::integer
            between 1 and 30
        else false
      end
      and case
        when parameters #>> '{trade,capBasisPoints}' ~ '^[0-9]+$'
          then (parameters #>> '{trade,capBasisPoints}')::integer
            between 1 and 40
        else false
      end
      and case
        when parameters #>> '{confidenceStability,capBasisPoints}' ~ '^[0-9]+$'
          then (parameters #>> '{confidenceStability,capBasisPoints}')::integer
            between 1 and 35
        else false
      end
    )
);

insert into public.fx_policy_versions (
  policy_version,
  status,
  fixing_local_time,
  normal_movement_cap_basis_points,
  crisis_movement_cap_basis_points,
  parameters,
  activated_at
)
values (
  'fx-policy-v1',
  'published',
  time '08:00',
  200,
  1500,
  jsonb_build_object(
    'numeraireCurrencyCode', 'ECO',
    'gdp', jsonb_build_object(
      'capBasisPoints', 50,
      'levelWeightBasisPoints', 2500,
      'growthWeightBasisPoints', 7500,
      'levelNormalizer', '25.000000000000000000',
      'growthNormalizer', '0.100000000000000000'
    ),
    'inflation', jsonb_build_object(
      'capBasisPoints', 45,
      'normalizer', '0.100000000000000000'
    ),
    'realInterest', jsonb_build_object(
      'capBasisPoints', 30,
      'normalizer', '0.100000000000000000'
    ),
    'trade', jsonb_build_object(
      'capBasisPoints', 40,
      'tradeBalanceWeightBasisPoints', 5000,
      'exportStrengthWeightBasisPoints', 2500,
      'inverseImportDependencyWeightBasisPoints', 2500,
      'tradeBalanceNormalizer', '50.000000000000000000',
      'exportStrengthNormalizer', '0.500000000000000000',
      'importDependencyNormalizer', '0.500000000000000000'
    ),
    'confidenceStability', jsonb_build_object(
      'capBasisPoints', 35,
      'signalWeightBasisPoints', 2000,
      'confidenceNormalizer', '50.000000000000000000',
      'indexNormalizer', '0.500000000000000000'
    ),
    'exchangeRateIndexWeightBasisPoints', 0,
    'bilateralTradeExposureWeightBasisPoints', 0
  ),
  clock_timestamp()
)
on conflict (policy_version) do nothing;

create table public.fx_fixings (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxf_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  fixing_kind text not null,
  fixing_local_date date not null,
  game_timezone text not null,
  effective_at timestamptz not null,
  calculated_at timestamptz not null,
  previous_fixing_id uuid null,
  policy_version_id uuid not null references public.fx_policy_versions(id),
  calculation_version text not null,
  input_hash text not null,
  source_kind text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_fixings_id_game_unique unique (id, game_session_id),
  constraint fx_fixings_public_key_format
    check (public_key ~ '^fxf_[0-9a-f]{32}$'),
  constraint fx_fixings_kind_check
    check (fixing_kind in ('bootstrap', 'daily')),
  constraint fx_fixings_timezone_not_blank
    check (length(btrim(game_timezone)) > 0),
  constraint fx_fixings_calculation_version_not_blank
    check (length(btrim(calculation_version)) between 1 and 96),
  constraint fx_fixings_input_hash_format
    check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint fx_fixings_source_kind_check
    check (source_kind in ('legacy_matrix', 'policy_baseline', 'daily_engine')),
  constraint fx_fixings_kind_predecessor_check
    check (
      (fixing_kind = 'bootstrap' and previous_fixing_id is null)
      or (fixing_kind = 'daily' and previous_fixing_id is not null)
    ),
  constraint fx_fixings_previous_scope_fk
    foreign key (previous_fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id)
);

create unique index fx_fixings_one_bootstrap_per_game_idx
  on public.fx_fixings (game_session_id)
  where fixing_kind = 'bootstrap';

create unique index fx_fixings_one_daily_per_game_date_idx
  on public.fx_fixings (game_session_id, fixing_local_date)
  where fixing_kind = 'daily';

create index fx_fixings_game_effective_history_idx
  on public.fx_fixings (game_session_id, effective_at desc, public_key desc);

-- The component limits below are the published v1 storage envelope. A future
-- policy with wider limits must arrive with a forward migration that expands
-- this constraint before that policy can be activated.
create table public.fx_fixing_currency_values (
  id uuid primary key default extensions.gen_random_uuid(),
  fixing_id uuid not null,
  game_session_id uuid not null,
  currency_code text not null references public.currencies(code),
  country_code text null,
  previous_units_per_eco numeric(38, 18) not null,
  units_per_eco numeric(38, 18) not null,
  gdp_basis_points integer not null,
  inflation_basis_points integer not null,
  real_interest_basis_points integer not null,
  trade_basis_points integer not null,
  confidence_stability_basis_points integer not null,
  fundamental_basis_points integer not null,
  story_basis_points integer not null,
  final_basis_points integer not null,
  applied_story_shock_ids jsonb not null default '[]'::jsonb,
  explanation text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_fixing_currency_values_fixing_scope_fk
    foreign key (fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id) on delete cascade,
  constraint fx_fixing_currency_values_unique
    unique (fixing_id, currency_code),
  constraint fx_fixing_currency_values_positive
    check (previous_units_per_eco > 0 and units_per_eco > 0),
  constraint fx_fixing_currency_values_component_ranges
    check (
      gdp_basis_points between -50 and 50
      and inflation_basis_points between -45 and 45
      and real_interest_basis_points between -30 and 30
      and trade_basis_points between -40 and 40
      and confidence_stability_basis_points between -35 and 35
      and fundamental_basis_points between -200 and 200
      and story_basis_points between -1500 and 1500
      and final_basis_points between -1500 and 1500
    ),
  constraint fx_fixing_currency_values_story_ids_array
    check (jsonb_typeof(applied_story_shock_ids) = 'array'),
  constraint fx_fixing_currency_values_explanation_not_blank
    check (length(btrim(explanation)) > 0)
);

create index fx_fixing_currency_values_game_currency_idx
  on public.fx_fixing_currency_values (game_session_id, currency_code, fixing_id);

create table public.fx_fixing_macro_snapshots (
  fixing_id uuid not null,
  game_session_id uuid not null,
  country_profile_id uuid not null,
  currency_code text not null references public.currencies(code),
  snapshot_id uuid not null,
  snapshot_sequence integer not null,
  snapshot_effective_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  primary key (fixing_id, country_profile_id),
  constraint fx_fixing_macro_snapshots_fixing_scope_fk
    foreign key (fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id) on delete cascade,
  constraint fx_fixing_macro_snapshots_snapshot_scope_fk
    foreign key (snapshot_id, game_session_id, country_profile_id)
    references public.country_economic_snapshots(id, game_session_id, country_profile_id),
  constraint fx_fixing_macro_snapshots_currency_unique
    unique (fixing_id, currency_code),
  constraint fx_fixing_macro_snapshots_sequence_nonnegative
    check (snapshot_sequence >= 0)
);

create table public.fx_story_shock_authorizations (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxs_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  command_key text not null,
  adjustments_basis_points jsonb not null,
  eligible_at timestamptz not null,
  authorization_hash text not null,
  authorized_at timestamptz not null default clock_timestamp(),

  constraint fx_story_shock_authorizations_id_game_unique
    unique (id, game_session_id),
  constraint fx_story_shock_authorizations_scope_command_unique
    unique (game_session_id, command_key),
  constraint fx_story_shock_authorizations_public_key_format
    check (public_key ~ '^fxs_[0-9a-f]{32}$'),
  constraint fx_story_shock_authorizations_command_key_format
    check (command_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$'),
  constraint fx_story_shock_authorizations_adjustments_object
    check (jsonb_typeof(adjustments_basis_points) = 'object'),
  constraint fx_story_shock_authorizations_hash_format
    check (authorization_hash ~ '^[0-9a-f]{64}$')
);

create index fx_story_shock_authorizations_eligible_idx
  on public.fx_story_shock_authorizations (game_session_id, eligible_at, public_key);

create table public.fx_fixing_story_shocks (
  fixing_id uuid not null,
  game_session_id uuid not null,
  shock_authorization_id uuid not null unique,
  adjustments_basis_points jsonb not null,
  created_at timestamptz not null default clock_timestamp(),

  primary key (fixing_id, shock_authorization_id),
  constraint fx_fixing_story_shocks_fixing_scope_fk
    foreign key (fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id) on delete cascade,
  constraint fx_fixing_story_shocks_authorization_scope_fk
    foreign key (shock_authorization_id, game_session_id)
    references public.fx_story_shock_authorizations(id, game_session_id) on delete cascade,
  constraint fx_fixing_story_shocks_adjustments_object
    check (jsonb_typeof(adjustments_basis_points) = 'object')
);

create table private.fx_runtime_state (
  game_session_id uuid primary key references public.game_sessions(id) on delete cascade,
  cutover_status text not null default 'pending',
  blocked_reason text null,
  current_fixing_id uuid null,
  policy_version_id uuid not null references public.fx_policy_versions(id),
  next_due_at timestamptz null,
  retry_after_at timestamptz null,
  claimed_local_date date null,
  claimed_effective_at timestamptz null,
  lease_token uuid null,
  lease_owner text null,
  lease_expires_at timestamptz null,
  claimed_input_hash text null,
  claimed_engine_input jsonb null,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz null,
  last_success_at timestamptz null,
  last_error_code text null,
  last_error_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint fx_runtime_state_cutover_status_check
    check (cutover_status in ('pending', 'ready', 'blocked')),
  constraint fx_runtime_state_current_fixing_scope_fk
    foreign key (current_fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id),
  constraint fx_runtime_state_blocked_reason_check
    check (
      (cutover_status = 'blocked' and length(btrim(blocked_reason)) > 0)
      or (cutover_status <> 'blocked' and blocked_reason is null)
    ),
  constraint fx_runtime_state_lease_consistency_check
    check (
      (
        lease_token is null
        and lease_owner is null
        and lease_expires_at is null
        and claimed_local_date is null
        and claimed_effective_at is null
        and claimed_input_hash is null
        and claimed_engine_input is null
      )
      or (
        lease_token is not null
        and length(btrim(lease_owner)) > 0
        and lease_expires_at is not null
        and claimed_local_date is not null
        and claimed_effective_at is not null
        and (
          (claimed_input_hash is null and claimed_engine_input is null)
          or (
            claimed_input_hash ~ '^[0-9a-f]{64}$'
            and jsonb_typeof(claimed_engine_input) = 'object'
          )
        )
      )
    ),
  constraint fx_runtime_state_attempt_count_nonnegative
    check (attempt_count >= 0),
  constraint fx_runtime_state_last_error_code_format
    check (
      last_error_code is null
      or last_error_code ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    )
);

create index fx_runtime_state_due_idx
  on private.fx_runtime_state (
    cutover_status,
    next_due_at,
    retry_after_at,
    game_session_id
  );

alter table public.fx_policy_versions enable row level security;
alter table public.fx_policy_versions force row level security;
alter table public.fx_fixings enable row level security;
alter table public.fx_fixings force row level security;
alter table public.fx_fixing_currency_values enable row level security;
alter table public.fx_fixing_currency_values force row level security;
alter table public.fx_fixing_macro_snapshots enable row level security;
alter table public.fx_fixing_macro_snapshots force row level security;
alter table public.fx_story_shock_authorizations enable row level security;
alter table public.fx_story_shock_authorizations force row level security;
alter table public.fx_fixing_story_shocks enable row level security;
alter table public.fx_fixing_story_shocks force row level security;
alter table private.fx_runtime_state enable row level security;
alter table private.fx_runtime_state force row level security;

revoke all on table public.fx_policy_versions from public, anon, authenticated, service_role;
revoke all on table public.fx_fixings from public, anon, authenticated, service_role;
revoke all on table public.fx_fixing_currency_values from public, anon, authenticated, service_role;
revoke all on table public.fx_fixing_macro_snapshots from public, anon, authenticated, service_role;
revoke all on table public.fx_story_shock_authorizations from public, anon, authenticated, service_role;
revoke all on table public.fx_fixing_story_shocks from public, anon, authenticated, service_role;
revoke all on table private.fx_runtime_state from public, anon, authenticated, service_role;

grant select on table public.fx_policy_versions to service_role;
grant select on table public.fx_fixings to service_role;
grant select on table public.fx_fixing_currency_values to service_role;
grant select on table public.fx_fixing_macro_snapshots to service_role;
grant select on table public.fx_story_shock_authorizations to service_role;
grant select on table public.fx_fixing_story_shocks to service_role;

create or replace function private.reject_fx_immutable_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if tg_op = 'DELETE'
     and to_jsonb(old) ? 'game_session_id'
     and not exists (
       select 1
       from public.game_sessions as game_row
       where game_row.id = (to_jsonb(old) ->> 'game_session_id')::uuid
     )
  then
    return old;
  end if;

  raise exception 'FX_EVIDENCE_IMMUTABLE' using errcode = '42501';
end;
$function$;

create trigger fx_policy_versions_immutable
before update or delete on public.fx_policy_versions
for each row execute function private.reject_fx_immutable_mutation_v1();

create trigger fx_fixings_immutable
before update or delete on public.fx_fixings
for each row execute function private.reject_fx_immutable_mutation_v1();

create trigger fx_fixing_currency_values_immutable
before update or delete on public.fx_fixing_currency_values
for each row execute function private.reject_fx_immutable_mutation_v1();

create trigger fx_fixing_macro_snapshots_immutable
before update or delete on public.fx_fixing_macro_snapshots
for each row execute function private.reject_fx_immutable_mutation_v1();

create trigger fx_story_shock_authorizations_immutable
before update or delete on public.fx_story_shock_authorizations
for each row execute function private.reject_fx_immutable_mutation_v1();

create trigger fx_fixing_story_shocks_immutable
before update or delete on public.fx_fixing_story_shocks
for each row execute function private.reject_fx_immutable_mutation_v1();

create or replace function private.fx_digest_jsonb_v1(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $function$
  select encode(extensions.digest(pg_catalog.convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex');
$function$;

revoke all on function private.fx_digest_jsonb_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.game_timezone_for_game_v1(
  p_game_session_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_timezone text;
begin
  if p_game_session_id is null then
    raise exception 'GAME_TIMEZONE_GAME_REQUIRED' using errcode = '22023';
  end if;

  select nullif(btrim(settings.stock_market_window ->> 'timezone'), '')
  into v_timezone
  from public.game_settings as settings
  where settings.game_session_id = p_game_session_id;

  if v_timezone is null then
    raise exception 'GAME_TIMEZONE_REQUIRED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = v_timezone
  ) then
    raise exception 'GAME_TIMEZONE_INVALID' using errcode = 'P0001';
  end if;

  return v_timezone;
end;
$function$;

revoke all on function public.game_timezone_for_game_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.game_timezone_for_game_v1(uuid)
  to service_role;

create or replace function private.guard_fx_game_timezone_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_old_timezone text := nullif(btrim(old.stock_market_window ->> 'timezone'), '');
  v_new_timezone text := nullif(btrim(new.stock_market_window ->> 'timezone'), '');
begin
  if v_old_timezone is distinct from v_new_timezone
     and exists (
       select 1
       from public.fx_fixings as fixing_row
       where fixing_row.game_session_id = new.game_session_id
     )
  then
    raise exception 'FX_TIMEZONE_IMMUTABLE_AFTER_BOOTSTRAP' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_fx_game_timezone_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_fx_game_timezone
  on public.game_settings;
create trigger guard_fx_game_timezone
before update of stock_market_window on public.game_settings
for each row execute function private.guard_fx_game_timezone_v1();

-- stock_market_timezone_for_game delegates to game_timezone_for_game_v1;
-- Stock calendar policy remains separate from the shared timezone source.
create or replace function public.stock_market_timezone_for_game(
  p_game_session_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select public.game_timezone_for_game_v1(p_game_session_id);
$function$;

revoke all on function public.stock_market_timezone_for_game(uuid)
  from public, anon, authenticated;
grant execute on function public.stock_market_timezone_for_game(uuid)
  to service_role;

create or replace function private.fx_boundary_for_local_date_v1(
  p_local_date date,
  p_timezone text
)
returns timestamptz
language sql
stable
strict
set search_path = pg_catalog
as $function$
  select (p_local_date::timestamp + time '08:00') at time zone p_timezone;
$function$;

create or replace function private.fx_next_boundary_v1(
  p_after timestamptz,
  p_timezone text
)
returns timestamptz
language plpgsql
stable
strict
set search_path = pg_catalog, private
as $function$
declare
  v_local timestamp without time zone := p_after at time zone p_timezone;
  v_date date := v_local::date;
begin
  if v_local::time >= time '08:00' then
    v_date := v_date + 1;
  end if;

  return private.fx_boundary_for_local_date_v1(v_date, p_timezone);
end;
$function$;

revoke all on function private.fx_boundary_for_local_date_v1(date, text)
  from public, anon, authenticated, service_role;
revoke all on function private.fx_next_boundary_v1(timestamptz, text)
  from public, anon, authenticated, service_role;

drop trigger if exists initialize_game_fx_after_insert
  on public.game_sessions;

create or replace function public.initialize_fx_authority_for_game_v1(
  p_game_session_id uuid,
  p_effective_at timestamptz default clock_timestamp(),
  p_allow_policy_baseline boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_policy public.fx_policy_versions%rowtype;
  v_existing public.fx_fixings%rowtype;
  v_timezone text;
  v_effective_at timestamptz := p_effective_at;
  v_calculated_at timestamptz := clock_timestamp();
  v_snapshot_effective_at timestamptz;
  v_legacy_rows integer := 0;
  v_pair_count integer := 0;
  v_incoherent_count integer := 0;
  v_snapshot_count integer := 0;
  v_currency_count integer := 0;
  v_source_kind text;
  v_values jsonb;
  v_snapshots jsonb;
  v_input_manifest jsonb;
  v_input_hash text;
  v_fixing_id uuid;
  v_fixing_public_key text;
begin
  if p_game_session_id is null
     or p_effective_at is null
     or p_allow_policy_baseline is null
  then
    raise exception 'FX_BOOTSTRAP_REQUEST_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'FX_BOOTSTRAP_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select policy_row.*
  into v_policy
  from public.fx_policy_versions as policy_row
  where policy_row.status = 'published'
    and policy_row.activated_at <= v_calculated_at
  order by policy_row.activated_at desc, policy_row.policy_version desc
  limit 1;

  if not found then
    raise exception 'FX_ACTIVE_POLICY_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_timezone := public.game_timezone_for_game_v1(p_game_session_id);

  select fixing_row.*
  into v_existing
  from public.fx_fixings as fixing_row
  where fixing_row.game_session_id = p_game_session_id
    and fixing_row.fixing_kind = 'bootstrap';

  if found then
    -- Serialize against the fixing worker before selecting the canonical
    -- current pointer.  Re-running bootstrap authority must never rewind a
    -- game from a published daily fixing back to its bootstrap fixing.
    perform 1
    from private.fx_runtime_state as runtime
    where runtime.game_session_id = p_game_session_id
    for update;

    select fixing_row.*
    into strict v_existing
    from public.fx_fixings as fixing_row
    where fixing_row.game_session_id = p_game_session_id
    order by
      fixing_row.effective_at desc,
      fixing_row.calculated_at desc,
      fixing_row.id desc
    limit 1;

    insert into private.fx_runtime_state (
      game_session_id,
      cutover_status,
      blocked_reason,
      current_fixing_id,
      policy_version_id,
      next_due_at,
      last_success_at,
      updated_at
    )
    values (
      p_game_session_id,
      'ready',
      null,
      v_existing.id,
      v_existing.policy_version_id,
      private.fx_next_boundary_v1(clock_timestamp(), v_existing.game_timezone),
      v_existing.calculated_at,
      clock_timestamp()
    )
    on conflict (game_session_id) do update
    set cutover_status = 'ready',
        blocked_reason = null,
        current_fixing_id = excluded.current_fixing_id,
        policy_version_id = excluded.policy_version_id,
        next_due_at = coalesce(
          private.fx_runtime_state.next_due_at,
          excluded.next_due_at
        ),
        retry_after_at = null,
        last_success_at = coalesce(
          private.fx_runtime_state.last_success_at,
          excluded.last_success_at
        ),
        updated_at = clock_timestamp();

    return jsonb_build_object(
      'outcome', 'replayed',
      'cutoverStatus', 'ready',
      'fixingPublicId', v_existing.public_key
    );
  end if;

  insert into private.fx_runtime_state (
    game_session_id,
    cutover_status,
    blocked_reason,
    policy_version_id,
    updated_at
  )
  values (
    p_game_session_id,
    'pending',
    null,
    v_policy.id,
    clock_timestamp()
  )
  on conflict (game_session_id) do update
  set cutover_status = 'pending',
      blocked_reason = null,
      policy_version_id = excluded.policy_version_id,
      retry_after_at = null,
      updated_at = clock_timestamp();

  select count(*)::integer
  into v_legacy_rows
  from public.currency_exchange_rates as rate_row
  where rate_row.game_session_id = p_game_session_id
    and rate_row.from_currency_code in (
      'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
    )
    and rate_row.to_currency_code in (
      'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
    )
    and rate_row.from_currency_code <> rate_row.to_currency_code
    and rate_row.effective_at <= p_effective_at;

  if v_legacy_rows > 0 then
    select max(matrix.effective_at)
    into v_effective_at
    from (
      select rate_row.effective_at
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = p_game_session_id
        and rate_row.from_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.to_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.from_currency_code <> rate_row.to_currency_code
        and rate_row.effective_at <= p_effective_at
      group by rate_row.effective_at
      having count(distinct (
        rate_row.from_currency_code,
        rate_row.to_currency_code
      )) = 90
    ) as matrix;

    if v_effective_at is not null then
      select count(*)::integer
      into v_pair_count
      from (
        select distinct on (
          rate_row.from_currency_code,
          rate_row.to_currency_code
        )
          rate_row.from_currency_code,
          rate_row.to_currency_code
        from public.currency_exchange_rates as rate_row
        where rate_row.game_session_id = p_game_session_id
          and rate_row.from_currency_code in (
            'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
          )
          and rate_row.to_currency_code in (
            'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
          )
          and rate_row.from_currency_code <> rate_row.to_currency_code
          and rate_row.effective_at = v_effective_at
        order by
          rate_row.from_currency_code,
          rate_row.to_currency_code,
          rate_row.created_at desc,
          rate_row.id desc
      ) as matrix_pairs;
    end if;

    if v_pair_count <> 90 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_LEGACY_MATRIX_INCOMPLETE',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_LEGACY_MATRIX_INCOMPLETE',
        'pairCount', v_pair_count
      );
    end if;

    with latest_rates as (
      select distinct on (
        rate_row.from_currency_code,
        rate_row.to_currency_code
      )
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.rate
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = p_game_session_id
        and rate_row.from_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.to_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.from_currency_code <> rate_row.to_currency_code
        and rate_row.effective_at = v_effective_at
      order by
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.created_at desc,
        rate_row.id desc
    ), national_values as (
      select
        profile.currency_code,
        profile.country_code,
        case
          when profile.currency_code = 'VAL' then 1::numeric
          else val_rate.rate
        end::numeric(38, 18) as units_per_eco
      from public.country_profiles as profile
      left join latest_rates as val_rate
        on val_rate.from_currency_code = 'VAL'
       and val_rate.to_currency_code = profile.currency_code
      where profile.status = 'active'
    ), all_values as (
      select
        national.currency_code,
        national.country_code,
        national.units_per_eco
      from national_values as national
      union all
      select 'ECO'::text, null::text, 1::numeric(38, 18)
    )
    select jsonb_agg(
      jsonb_build_object(
        'currencyCode', value_row.currency_code,
        'countryCode', value_row.country_code,
        'unitsPerEco', value_row.units_per_eco::text
      )
      order by case when value_row.currency_code = 'ECO' then 0 else 1 end,
               value_row.currency_code
    )
    into v_values
    from all_values as value_row
    where value_row.units_per_eco is not null;

    select jsonb_array_length(coalesce(v_values, '[]'::jsonb))
    into v_currency_count;

    if v_currency_count <> 11 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_LEGACY_VECTOR_INCOMPLETE',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_LEGACY_VECTOR_INCOMPLETE'
      );
    end if;

    with latest_rates as (
      select distinct on (
        rate_row.from_currency_code,
        rate_row.to_currency_code
      )
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.rate
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = p_game_session_id
        and rate_row.from_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.to_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.from_currency_code <> rate_row.to_currency_code
        and rate_row.effective_at = v_effective_at
      order by
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.created_at desc,
        rate_row.id desc
    ), value_rows as (
      select
        item ->> 'currencyCode' as currency_code,
        (item ->> 'unitsPerEco')::numeric as units_per_eco
      from jsonb_array_elements(v_values) as value_item(item)
      where item ->> 'currencyCode' <> 'ECO'
    )
    select count(*)::integer
    into v_incoherent_count
    from latest_rates as rate_row
    join value_rows as source_value
      on source_value.currency_code = rate_row.from_currency_code
    join value_rows as target_value
      on target_value.currency_code = rate_row.to_currency_code
    where abs(
      rate_row.rate - (target_value.units_per_eco / source_value.units_per_eco)
    ) > 0.00000001::numeric;

    if v_incoherent_count <> 0 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_LEGACY_MATRIX_INCOHERENT',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_LEGACY_MATRIX_INCOHERENT',
        'incoherentPairs', v_incoherent_count
      );
    end if;

    v_source_kind := 'legacy_matrix';
  elsif p_allow_policy_baseline then
    with baseline(currency_code, units_per_eco) as (
      values
        ('NRC'::text, 0.940000000000000000::numeric),
        ('YRC'::text, 1.030000000000000000::numeric),
        ('THD'::text, 1.480000000000000000::numeric),
        ('SLV'::text, 0.780000000000000000::numeric),
        ('ELD'::text, 1.010000000000000000::numeric),
        ('VAL'::text, 1.000000000000000000::numeric),
        ('LUM'::text, 1.360000000000000000::numeric),
        ('SYN'::text, 1.120000000000000000::numeric),
        ('XAL'::text, 1.240000000000000000::numeric),
        ('DRV'::text, 1.610000000000000000::numeric)
    ), all_values as (
      select
        baseline.currency_code,
        profile.country_code,
        baseline.units_per_eco::numeric(38, 18) as units_per_eco
      from baseline
      join public.country_profiles as profile
        on profile.currency_code = baseline.currency_code
       and profile.status = 'active'
      union all
      select 'ECO'::text, null::text, 1::numeric(38, 18)
    )
    select jsonb_agg(
      jsonb_build_object(
        'currencyCode', value_row.currency_code,
        'countryCode', value_row.country_code,
        'unitsPerEco', value_row.units_per_eco::text
      )
      order by case when value_row.currency_code = 'ECO' then 0 else 1 end,
               value_row.currency_code
    )
    into v_values
    from all_values as value_row;

    select jsonb_array_length(coalesce(v_values, '[]'::jsonb))
    into v_currency_count;

    if v_currency_count <> 11 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_CURRENCY_REGISTRY_INCOMPLETE',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_CURRENCY_REGISTRY_INCOMPLETE'
      );
    end if;

    v_source_kind := 'policy_baseline';
  else
    update private.fx_runtime_state
    set cutover_status = 'blocked',
        blocked_reason = 'FX_LEGACY_MATRIX_MISSING',
        next_due_at = null,
        retry_after_at = null,
        updated_at = clock_timestamp()
    where game_session_id = p_game_session_id;

    return jsonb_build_object(
      'outcome', 'blocked',
      'cutoverStatus', 'blocked',
      'reason', 'FX_LEGACY_MATRIX_MISSING'
    );
  end if;

  select max(cohort.effective_at)
  into v_snapshot_effective_at
  from (
    select snapshot_row.effective_at
    from public.country_economic_snapshots as snapshot_row
    join public.country_profiles as profile
      on profile.id = snapshot_row.country_profile_id
     and profile.status = 'active'
    where snapshot_row.game_session_id = p_game_session_id
      and snapshot_row.effective_at <= v_effective_at
    group by snapshot_row.effective_at
    having count(distinct snapshot_row.country_profile_id) = 10
  ) as cohort;

  if v_snapshot_effective_at is not null then
    select count(*)::integer
    into v_snapshot_count
    from (
      select distinct on (profile.id) snapshot_row.id
      from public.country_profiles as profile
      join public.country_economic_snapshots as snapshot_row
        on snapshot_row.country_profile_id = profile.id
       and snapshot_row.game_session_id = p_game_session_id
       and snapshot_row.effective_at = v_snapshot_effective_at
      where profile.status = 'active'
      order by
        profile.id,
        snapshot_row.snapshot_sequence desc,
        snapshot_row.created_at desc,
        snapshot_row.id desc
    ) as cohort_snapshots;
  end if;

  if v_snapshot_count = 0 and p_allow_policy_baseline then
    perform *
    from public.initialize_country_economic_snapshots_for_game(
      p_game_session_id,
      v_effective_at,
      'Canonical FX bootstrap baseline',
      jsonb_build_object('source', 'canonical-fx-authority-v1')
    );

    v_snapshot_effective_at := v_effective_at;

    select count(*)::integer
    into v_snapshot_count
    from (
      select distinct on (profile.id) snapshot_row.id
      from public.country_profiles as profile
      join public.country_economic_snapshots as snapshot_row
        on snapshot_row.country_profile_id = profile.id
       and snapshot_row.game_session_id = p_game_session_id
       and snapshot_row.effective_at = v_snapshot_effective_at
      where profile.status = 'active'
      order by
        profile.id,
        snapshot_row.snapshot_sequence desc,
        snapshot_row.created_at desc,
        snapshot_row.id desc
    ) as latest_snapshots;
  end if;

  if v_snapshot_count <> 10 then
    update private.fx_runtime_state
    set cutover_status = 'blocked',
        blocked_reason = 'FX_MACRO_SNAPSHOT_SET_INCOMPLETE',
        next_due_at = null,
        retry_after_at = null,
        updated_at = clock_timestamp()
    where game_session_id = p_game_session_id;

    return jsonb_build_object(
      'outcome', 'blocked',
      'cutoverStatus', 'blocked',
      'reason', 'FX_MACRO_SNAPSHOT_SET_INCOMPLETE',
      'snapshotCount', v_snapshot_count
    );
  end if;

  with latest_snapshots as (
    select distinct on (profile.id)
      profile.id as country_profile_id,
      profile.country_code,
      profile.currency_code,
      snapshot_row.id as snapshot_id,
      snapshot_row.snapshot_sequence,
      snapshot_row.effective_at
    from public.country_profiles as profile
    join public.country_economic_snapshots as snapshot_row
      on snapshot_row.country_profile_id = profile.id
     and snapshot_row.game_session_id = p_game_session_id
     and snapshot_row.effective_at = v_snapshot_effective_at
    where profile.status = 'active'
    order by
      profile.id,
      snapshot_row.snapshot_sequence desc,
      snapshot_row.created_at desc,
      snapshot_row.id desc
  )
  select jsonb_agg(
    jsonb_build_object(
      'countryProfileId', snapshot.country_profile_id,
      'countryCode', snapshot.country_code,
      'currencyCode', snapshot.currency_code,
      'snapshotId', snapshot.snapshot_id,
      'snapshotSequence', snapshot.snapshot_sequence,
      'effectiveAt', snapshot.effective_at
    )
    order by snapshot.currency_code
  )
  into v_snapshots
  from latest_snapshots as snapshot;

  v_input_manifest := jsonb_build_object(
    'kind', 'bootstrap',
    'gameSessionId', p_game_session_id,
    'effectiveAt', v_effective_at,
    'policyVersion', v_policy.policy_version,
    'sourceKind', v_source_kind,
    'currencyValues', v_values,
    'macroSnapshots', v_snapshots
  );
  v_input_hash := private.fx_digest_jsonb_v1(v_input_manifest);

  insert into public.fx_fixings (
    game_session_id,
    fixing_kind,
    fixing_local_date,
    game_timezone,
    effective_at,
    calculated_at,
    previous_fixing_id,
    policy_version_id,
    calculation_version,
    input_hash,
    source_kind
  )
  values (
    p_game_session_id,
    'bootstrap',
    (v_effective_at at time zone v_timezone)::date,
    v_timezone,
    v_effective_at,
    v_calculated_at,
    null,
    v_policy.id,
    'fx-bootstrap-v1',
    v_input_hash,
    v_source_kind
  )
  returning id, public_key into v_fixing_id, v_fixing_public_key;

  insert into public.fx_fixing_currency_values (
    fixing_id,
    game_session_id,
    currency_code,
    country_code,
    previous_units_per_eco,
    units_per_eco,
    gdp_basis_points,
    inflation_basis_points,
    real_interest_basis_points,
    trade_basis_points,
    confidence_stability_basis_points,
    fundamental_basis_points,
    story_basis_points,
    final_basis_points,
    applied_story_shock_ids,
    explanation
  )
  select
    v_fixing_id,
    p_game_session_id,
    value_item.item ->> 'currencyCode',
    nullif(value_item.item ->> 'countryCode', ''),
    (value_item.item ->> 'unitsPerEco')::numeric(38, 18),
    (value_item.item ->> 'unitsPerEco')::numeric(38, 18),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    '[]'::jsonb,
    case
      when v_source_kind = 'legacy_matrix'
        then 'Bootstrap from the latest coherent legacy VAL vector; no new movement applied.'
      else 'Bootstrap from the canonical FX policy baseline; no movement applied.'
    end
  from jsonb_array_elements(v_values) as value_item(item);

  insert into public.fx_fixing_macro_snapshots (
    fixing_id,
    game_session_id,
    country_profile_id,
    currency_code,
    snapshot_id,
    snapshot_sequence,
    snapshot_effective_at
  )
  select
    v_fixing_id,
    p_game_session_id,
    (snapshot_item.item ->> 'countryProfileId')::uuid,
    snapshot_item.item ->> 'currencyCode',
    (snapshot_item.item ->> 'snapshotId')::uuid,
    (snapshot_item.item ->> 'snapshotSequence')::integer,
    (snapshot_item.item ->> 'effectiveAt')::timestamptz
  from jsonb_array_elements(v_snapshots) as snapshot_item(item);

  update private.fx_runtime_state
  set cutover_status = 'ready',
      blocked_reason = null,
      current_fixing_id = v_fixing_id,
      policy_version_id = v_policy.id,
      next_due_at = private.fx_next_boundary_v1(v_calculated_at, v_timezone),
      retry_after_at = null,
      last_success_at = v_calculated_at,
      last_error_code = null,
      last_error_at = null,
      updated_at = clock_timestamp()
  where game_session_id = p_game_session_id;

  return jsonb_build_object(
    'outcome', 'initialized',
    'cutoverStatus', 'ready',
    'fixingPublicId', v_fixing_public_key,
    'sourceKind', v_source_kind,
    'currencyValuesInserted', 11,
    'macroSnapshotsLinked', 10
  );
end;
$function$;

revoke all on function public.initialize_fx_authority_for_game_v1(
  uuid, timestamptz, boolean
) from public, anon, authenticated, service_role;

create or replace function private.ensure_ready_game_fx_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_result jsonb;
  v_allow_policy_baseline boolean;
begin
  -- Readiness fields are also touched during ordinary lifecycle updates.
  -- Once a valid authority exists, lifecycle synchronization owns pause and
  -- resume scheduling; bootstrap replay must not rewrite the fixing pointer.
  if exists (
    select 1
    from private.fx_runtime_state as runtime
    where runtime.game_session_id = new.id
      and runtime.cutover_status = 'ready'
      and runtime.current_fixing_id is not null
  ) then
    return new;
  end if;

  select
    new.provisioned_at is not null
    and new.created_at >= policy_row.activated_at
    and not exists (
      select 1
      from private.fx_runtime_state as runtime
      where runtime.game_session_id = new.id
    )
    and not exists (
      select 1
      from public.currency_exchange_rates as legacy_rate
      where legacy_rate.game_session_id = new.id
    )
  into v_allow_policy_baseline
  from public.fx_policy_versions as policy_row
  where policy_row.status = 'published'
  order by policy_row.activated_at asc, policy_row.policy_version asc
  limit 1;

  v_result := public.initialize_fx_authority_for_game_v1(
    new.id,
    coalesce(new.provisioned_at, new.started_at, clock_timestamp()),
    coalesce(v_allow_policy_baseline, false)
  );

  if v_result ->> 'cutoverStatus' <> 'ready' then
    raise exception 'FX_PROVISIONING_BOOTSTRAP_FAILED: %',
      coalesce(v_result ->> 'reason', 'UNKNOWN')
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.ensure_ready_game_fx_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists ensure_ready_game_fx
  on public.game_sessions;
create trigger ensure_ready_game_fx
after insert or update of status, lifecycle_state, provisioning_status, provisioned_at
on public.game_sessions
for each row
when (
  new.status = 'active'
  and new.lifecycle_state = 'active'
  and new.provisioning_status = 'ready'
)
execute function private.ensure_ready_game_fx_v1();

do $fx_existing_game_backfill$
declare
  v_game record;
begin
  for v_game in
    select game_row.id
    from public.game_sessions as game_row
    order by game_row.created_at, game_row.id
  loop
    perform public.initialize_fx_authority_for_game_v1(
      v_game.id,
      clock_timestamp(),
      false
    );
  end loop;
end;
$fx_existing_game_backfill$;

create or replace function private.sync_fx_runtime_lifecycle_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_timezone text;
  v_local timestamp without time zone;
  v_resume_date date;
  v_today_boundary timestamptz;
  v_current_effective_at timestamptz;
begin
  if new.lifecycle_state = 'paused'
     and old.lifecycle_state is distinct from 'paused'
  then
    update private.fx_runtime_state
    set next_due_at = null,
        retry_after_at = null,
        claimed_local_date = null,
        claimed_effective_at = null,
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null,
        claimed_input_hash = null,
        claimed_engine_input = null,
        updated_at = v_now
    where game_session_id = new.id
      and cutover_status = 'ready';
  elsif old.lifecycle_state = 'paused'
        and new.lifecycle_state = 'active'
        and new.status = 'active'
        and new.provisioning_status = 'ready'
  then
    v_timezone := public.game_timezone_for_game_v1(new.id);
    v_local := v_now at time zone v_timezone;
    v_today_boundary := private.fx_boundary_for_local_date_v1(
      v_local::date,
      v_timezone
    );

    select fixing_row.effective_at
    into v_current_effective_at
    from private.fx_runtime_state as runtime
    join public.fx_fixings as fixing_row
      on fixing_row.id = runtime.current_fixing_id
     and fixing_row.game_session_id = runtime.game_session_id
    where runtime.game_session_id = new.id
      and runtime.cutover_status = 'ready';

    if v_current_effective_at is null then
      raise exception 'FX_RESUME_CURRENT_FIXING_NOT_FOUND' using errcode = 'P0001';
    end if;

    v_resume_date := case
      when v_current_effective_at < v_today_boundary then v_local::date
      else v_local::date + 1
    end;

    update private.fx_runtime_state
    set next_due_at = private.fx_boundary_for_local_date_v1(
          v_resume_date,
          v_timezone
        ),
        retry_after_at = null,
        claimed_local_date = null,
        claimed_effective_at = null,
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null,
        claimed_input_hash = null,
        claimed_engine_input = null,
        updated_at = v_now
    where game_session_id = new.id
      and cutover_status = 'ready';
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_fx_runtime_lifecycle_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists sync_fx_runtime_lifecycle
  on public.game_sessions;
create trigger sync_fx_runtime_lifecycle
after update of lifecycle_state, status, provisioning_status
on public.game_sessions
for each row execute function private.sync_fx_runtime_lifecycle_v1();

create or replace function public.claim_due_fx_games_v1(
  p_now timestamptz default clock_timestamp(),
  p_limit integer default 25,
  p_lease_owner text default 'fx-orchestrator-v1',
  p_lease_seconds integer default 120
)
returns table (
  game_session_id uuid,
  fixing_local_date date,
  fixing_effective_at timestamptz,
  game_timezone text,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_owner text := btrim(coalesce(p_lease_owner, ''));
begin
  if p_now is null
     or p_limit is null
     or p_limit not between 1 and 100
     or v_owner !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$'
     or p_lease_seconds is null
     or p_lease_seconds not between 30 and 600
  then
    raise exception 'FX_CLAIM_REQUEST_INVALID' using errcode = '22023';
  end if;

  -- FOR UPDATE SKIP LOCKED is deliberately qualified to the private runtime
  -- row below so unrelated game metadata never becomes claim-owned state.
  return query
  with candidate as (
    select
      runtime.game_session_id,
      due.fixing_local_date,
      due.fixing_effective_at,
      timezone_row.game_timezone
    from private.fx_runtime_state as runtime
    join public.game_sessions as game_row
      on game_row.id = runtime.game_session_id
    cross join lateral (
      select public.game_timezone_for_game_v1(runtime.game_session_id)
        as game_timezone
    ) as timezone_row
    cross join lateral (
      select
        case
          when (p_now at time zone timezone_row.game_timezone)::time >= time '08:00'
            then (p_now at time zone timezone_row.game_timezone)::date
          else (p_now at time zone timezone_row.game_timezone)::date - 1
        end as fixing_local_date
    ) as local_date_row
    cross join lateral (
      select
        local_date_row.fixing_local_date,
        private.fx_boundary_for_local_date_v1(
          local_date_row.fixing_local_date,
          timezone_row.game_timezone
        ) as fixing_effective_at
    ) as due
    where runtime.cutover_status = 'ready'
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
      and game_row.provisioning_status = 'ready'
      and game_row.license_expired_at is null
      and (runtime.next_due_at is null or runtime.next_due_at <= p_now)
      and (runtime.retry_after_at is null or runtime.retry_after_at <= p_now)
      and due.fixing_effective_at <= p_now
      and (runtime.lease_token is null or runtime.lease_expires_at <= p_now)
      and exists (
        select 1
        from public.entitlements as entitlement
        where entitlement.game_session_id = game_row.id
          and entitlement.status = 'active'
          and (
            entitlement.license_expires_at is null
            or entitlement.license_expires_at > p_now
          )
      )
      and not exists (
        select 1
        from public.fx_fixings as fixing_row
        where fixing_row.game_session_id = runtime.game_session_id
          and fixing_row.fixing_kind = 'daily'
          and fixing_row.fixing_local_date = due.fixing_local_date
      )
    order by due.fixing_local_date, runtime.game_session_id
    for update of runtime skip locked
    limit p_limit
  ), claimed as (
    update private.fx_runtime_state as runtime
    set claimed_local_date = candidate.fixing_local_date,
        claimed_effective_at = candidate.fixing_effective_at,
        lease_token = extensions.gen_random_uuid(),
        lease_owner = v_owner,
        lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        retry_after_at = null,
        claimed_input_hash = null,
        claimed_engine_input = null,
        attempt_count = runtime.attempt_count + 1,
        last_attempt_at = p_now,
        updated_at = p_now
    from candidate
    where runtime.game_session_id = candidate.game_session_id
    returning
      runtime.game_session_id,
      runtime.claimed_local_date,
      runtime.claimed_effective_at,
      candidate.game_timezone,
      runtime.lease_token,
      runtime.lease_expires_at
  )
  select
    claimed.game_session_id,
    claimed.claimed_local_date,
    claimed.claimed_effective_at,
    claimed.game_timezone,
    claimed.lease_token,
    claimed.lease_expires_at
  from claimed
  order by claimed.claimed_local_date, claimed.game_session_id;
end;
$function$;

revoke all on function public.claim_due_fx_games_v1(
  timestamptz, integer, text, integer
) from public, anon, authenticated;
grant execute on function public.claim_due_fx_games_v1(
  timestamptz, integer, text, integer
) to service_role;

create or replace function public.load_fx_fixing_input_v1(
  p_game_session_id uuid,
  p_fixing_local_date date,
  p_lease_token uuid
)
returns table (
  input_hash text,
  engine_input jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_runtime private.fx_runtime_state%rowtype;
  v_policy public.fx_policy_versions%rowtype;
  v_previous public.fx_fixings%rowtype;
  v_snapshot_effective_at timestamptz;
  v_snapshot_count integer := 0;
  v_previous_value_count integer := 0;
  v_currencies jsonb;
  v_story_shocks jsonb;
  v_engine_input jsonb;
  v_input_hash text;
begin
  if p_game_session_id is null
     or p_fixing_local_date is null
     or p_lease_token is null
  then
    raise exception 'FX_INPUT_REQUEST_INVALID' using errcode = '22023';
  end if;

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
  for update;

  if not found
     or v_runtime.cutover_status <> 'ready'
     or v_runtime.claimed_local_date is distinct from p_fixing_local_date
     or v_runtime.lease_token is distinct from p_lease_token
     or v_runtime.lease_expires_at is null
     or v_runtime.lease_expires_at <= v_now
  then
    raise exception 'FX_INPUT_LEASE_INVALID' using errcode = 'P0001';
  end if;

  if v_runtime.claimed_input_hash is not null then
    return query
    select v_runtime.claimed_input_hash, v_runtime.claimed_engine_input;
    return;
  end if;

  select policy_row.*
  into v_policy
  from public.fx_policy_versions as policy_row
  where policy_row.status = 'published'
    and policy_row.activated_at <= v_runtime.claimed_effective_at
  order by policy_row.activated_at desc, policy_row.policy_version desc
  limit 1;

  if not found then
    raise exception 'FX_INPUT_POLICY_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update private.fx_runtime_state
  set policy_version_id = v_policy.id,
      updated_at = v_now
  where game_session_id = p_game_session_id
    and lease_token = p_lease_token;

  if not found then
    raise exception 'FX_INPUT_LEASE_LOST' using errcode = 'P0001';
  end if;

  v_runtime.policy_version_id := v_policy.id;

  select fixing_row.*
  into v_previous
  from public.fx_fixings as fixing_row
  where fixing_row.id = v_runtime.current_fixing_id
    and fixing_row.game_session_id = p_game_session_id;

  if not found then
    raise exception 'FX_INPUT_PREVIOUS_FIXING_REQUIRED' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_previous_value_count
  from public.fx_fixing_currency_values as value_row
  where value_row.fixing_id = v_previous.id
    and value_row.game_session_id = p_game_session_id;

  if v_previous_value_count <> 11
     or not exists (
       select 1
       from public.fx_fixing_currency_values as eco_value
       where eco_value.fixing_id = v_previous.id
         and eco_value.game_session_id = p_game_session_id
         and eco_value.currency_code = 'ECO'
         and eco_value.units_per_eco = 1
     )
  then
    raise exception 'FX_INPUT_PREVIOUS_VALUES_INCOMPLETE' using errcode = 'P0001';
  end if;

  select max(cohort.effective_at)
  into v_snapshot_effective_at
  from (
    select snapshot_row.effective_at
    from public.country_economic_snapshots as snapshot_row
    join public.country_profiles as profile
      on profile.id = snapshot_row.country_profile_id
     and profile.status = 'active'
    where snapshot_row.game_session_id = p_game_session_id
      and snapshot_row.effective_at <= v_runtime.claimed_effective_at
      and snapshot_row.created_at <= v_runtime.claimed_effective_at
    group by snapshot_row.effective_at
    having count(distinct snapshot_row.country_profile_id) = 10
  ) as cohort;

  if v_snapshot_effective_at is not null then
    select count(*)::integer
    into v_snapshot_count
    from (
      select distinct on (profile.id) snapshot_row.id
      from public.country_profiles as profile
      join public.country_economic_snapshots as snapshot_row
        on snapshot_row.country_profile_id = profile.id
       and snapshot_row.game_session_id = p_game_session_id
       and snapshot_row.effective_at = v_snapshot_effective_at
       and snapshot_row.created_at <= v_runtime.claimed_effective_at
      where profile.status = 'active'
      order by
        profile.id,
        snapshot_row.snapshot_sequence desc,
        snapshot_row.created_at desc,
        snapshot_row.id desc
    ) as cohort_snapshots;
  end if;

  if v_snapshot_count <> 10 then
    raise exception 'FX_INPUT_MACRO_COHORT_INCOMPLETE' using errcode = 'P0001';
  end if;

  with cohort_snapshots as (
    select distinct on (profile.id)
      profile.id as country_profile_id,
      profile.country_code,
      profile.currency_code,
      snapshot_row.id as snapshot_id,
      snapshot_row.snapshot_sequence,
      snapshot_row.real_gdp_index,
      snapshot_row.gdp_growth_rate,
      snapshot_row.inflation_rate,
      snapshot_row.interest_rate,
      snapshot_row.consumer_confidence_index,
      snapshot_row.business_confidence_index,
      snapshot_row.import_dependency_index,
      snapshot_row.currency_stability_index,
      snapshot_row.trade_balance_index,
      snapshot_row.export_strength_index,
      snapshot_row.market_risk_index,
      snapshot_row.political_stability_index
    from public.country_profiles as profile
    join public.country_economic_snapshots as snapshot_row
      on snapshot_row.country_profile_id = profile.id
     and snapshot_row.game_session_id = p_game_session_id
     and snapshot_row.effective_at = v_snapshot_effective_at
     and snapshot_row.created_at <= v_runtime.claimed_effective_at
    where profile.status = 'active'
    order by
      profile.id,
      snapshot_row.snapshot_sequence desc,
      snapshot_row.created_at desc,
      snapshot_row.id desc
  )
  select jsonb_agg(
    jsonb_build_object(
      'currencyCode', snapshot.currency_code,
      'countryCode', snapshot.country_code,
      'previousUnitsPerEco',
        to_char(previous_value.units_per_eco, 'FM99999999999999999990.000000000000000000'),
      'snapshotId', snapshot.snapshot_id,
      'snapshotSequence', snapshot.snapshot_sequence,
      'realGdpIndex',
        to_char(snapshot.real_gdp_index, 'FM99999999999999999990.000000000000000000'),
      'gdpGrowthRate',
        to_char(snapshot.gdp_growth_rate, 'FM99999999999999999990.000000000000000000'),
      'inflationRate',
        to_char(snapshot.inflation_rate, 'FM99999999999999999990.000000000000000000'),
      'interestRate',
        to_char(snapshot.interest_rate, 'FM99999999999999999990.000000000000000000'),
      'consumerConfidenceIndex',
        to_char(snapshot.consumer_confidence_index, 'FM99999999999999999990.000000000000000000'),
      'businessConfidenceIndex',
        to_char(snapshot.business_confidence_index, 'FM99999999999999999990.000000000000000000'),
      'importDependencyIndex',
        to_char(snapshot.import_dependency_index, 'FM99999999999999999990.000000000000000000'),
      'currencyStabilityIndex',
        to_char(snapshot.currency_stability_index, 'FM99999999999999999990.000000000000000000'),
      'tradeBalanceIndex',
        to_char(snapshot.trade_balance_index, 'FM99999999999999999990.000000000000000000'),
      'exportStrengthIndex',
        to_char(snapshot.export_strength_index, 'FM99999999999999999990.000000000000000000'),
      'marketRiskIndex',
        to_char(snapshot.market_risk_index, 'FM99999999999999999990.000000000000000000'),
      'politicalStabilityIndex',
        to_char(snapshot.political_stability_index, 'FM99999999999999999990.000000000000000000')
    )
    order by snapshot.currency_code
  )
  into v_currencies
  from cohort_snapshots as snapshot
  join public.fx_fixing_currency_values as previous_value
    on previous_value.fixing_id = v_previous.id
   and previous_value.game_session_id = p_game_session_id
   and previous_value.currency_code = snapshot.currency_code;

  if jsonb_array_length(coalesce(v_currencies, '[]'::jsonb)) <> 10 then
    raise exception 'FX_INPUT_CURRENCY_MAPPING_INCOMPLETE' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'shockId', shock_row.public_key,
        'currencyCode', adjustment.currency_code,
        'basisPoints', adjustment.basis_points::integer
      )
      order by adjustment.currency_code, shock_row.public_key
    ),
    '[]'::jsonb
  )
  into v_story_shocks
  from public.fx_story_shock_authorizations as shock_row
  cross join lateral jsonb_each_text(
    shock_row.adjustments_basis_points
  ) as adjustment(currency_code, basis_points)
  where shock_row.game_session_id = p_game_session_id
    and shock_row.eligible_at <= v_runtime.claimed_effective_at
    and shock_row.authorized_at <= v_runtime.claimed_effective_at
    and adjustment.currency_code <> 'ECO'
    and adjustment.basis_points::integer <> 0
    and not exists (
      select 1
      from public.fx_fixing_story_shocks as consumed
      where consumed.shock_authorization_id = shock_row.id
    );

  v_engine_input := jsonb_build_object(
    'gameSessionId', p_game_session_id,
    'fixingLocalDate', to_char(p_fixing_local_date, 'YYYY-MM-DD'),
    'policyVersion', v_policy.policy_version,
    'policy', jsonb_build_object(
      'fixingLocalTime', v_policy.fixing_local_time::text,
      'normalMovementCapBasisPoints',
        v_policy.normal_movement_cap_basis_points,
      'crisisMovementCapBasisPoints',
        v_policy.crisis_movement_cap_basis_points,
      'parameters', v_policy.parameters
    ),
    'currencies', v_currencies,
    'storyShocks', v_story_shocks
  );
  v_input_hash := private.fx_digest_jsonb_v1(v_engine_input);

  update private.fx_runtime_state
  set claimed_input_hash = v_input_hash,
      claimed_engine_input = v_engine_input,
      updated_at = v_now
  where game_session_id = p_game_session_id
    and lease_token = p_lease_token;

  if not found then
    raise exception 'FX_INPUT_LEASE_LOST' using errcode = 'P0001';
  end if;

  return query select v_input_hash, v_engine_input;
end;
$function$;

revoke all on function public.load_fx_fixing_input_v1(uuid, date, uuid)
  from public, anon, authenticated;
grant execute on function public.load_fx_fixing_input_v1(uuid, date, uuid)
  to service_role;

create or replace function public.apply_fx_fixing_v1(
  p_game_session_id uuid,
  p_fixing_local_date date,
  p_fixing_effective_at timestamptz,
  p_lease_token uuid,
  p_input_hash text,
  p_calculated_at timestamptz,
  p_fixing_result jsonb
)
returns table (
  outcome text,
  fixing_public_id text,
  currency_values_inserted integer,
  shocks_consumed integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_runtime private.fx_runtime_state%rowtype;
  v_policy public.fx_policy_versions%rowtype;
  v_previous public.fx_fixings%rowtype;
  v_existing public.fx_fixings%rowtype;
  v_profile public.country_profiles%rowtype;
  v_value jsonb;
  v_canonical_engine_input jsonb;
  v_input_currency jsonb;
  v_components jsonb;
  v_code text;
  v_country_code text;
  v_previous_units numeric(38, 18);
  v_units numeric(38, 18);
  v_gdp integer;
  v_inflation integer;
  v_real_interest integer;
  v_trade integer;
  v_confidence integer;
  v_fundamental integer;
  v_story integer;
  v_final integer;
  v_expected_fundamental integer;
  v_expected_story integer;
  v_expected_final integer;
  v_expected_units numeric(38, 18);
  v_expected_shock_ids jsonb;
  v_expected_shock_count integer;
  v_value_count integer;
  v_distinct_value_count integer;
  v_fixing_id uuid;
  v_fixing_public_key text;
  v_values_inserted integer := 0;
  v_snapshots_inserted integer := 0;
  v_shocks_consumed integer := 0;
  v_timezone text;
  v_gdp_cap integer;
  v_inflation_cap integer;
  v_real_interest_cap integer;
  v_trade_cap integer;
  v_confidence_cap integer;
begin
  if p_game_session_id is null
     or p_fixing_local_date is null
     or p_fixing_effective_at is null
     or p_lease_token is null
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_calculated_at is null
     or jsonb_typeof(p_fixing_result) <> 'object'
  then
    raise exception 'FX_APPLY_REQUEST_INVALID' using errcode = '22023';
  end if;

  select fixing_row.*
  into v_existing
  from public.fx_fixings as fixing_row
  where fixing_row.game_session_id = p_game_session_id
    and fixing_row.fixing_kind = 'daily'
    and fixing_row.fixing_local_date = p_fixing_local_date;

  if found then
    if v_existing.input_hash <> p_input_hash
       or v_existing.effective_at <> p_fixing_effective_at
    then
      raise exception 'FX_INPUT_HASH_CONFLICT' using errcode = 'P0001';
    end if;

    return query select
      'replayed'::text,
      v_existing.public_key,
      0,
      0;
    return;
  end if;

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
  for update;

  if not found
     or v_runtime.cutover_status <> 'ready'
     or v_runtime.claimed_local_date is distinct from p_fixing_local_date
     or v_runtime.claimed_effective_at is distinct from p_fixing_effective_at
     or v_runtime.lease_token is distinct from p_lease_token
     or v_runtime.lease_expires_at is null
     or v_runtime.lease_expires_at <= v_now
  then
    raise exception 'FX_APPLY_LEASE_INVALID' using errcode = 'P0001';
  end if;

  if v_runtime.claimed_input_hash is null
     or v_runtime.claimed_engine_input is null
     or v_runtime.claimed_input_hash <> p_input_hash
     or private.fx_digest_jsonb_v1(v_runtime.claimed_engine_input) <>
       v_runtime.claimed_input_hash
  then
    raise exception 'FX_INPUT_HASH_CONFLICT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
      and game_row.provisioning_status = 'ready'
  ) then
    raise exception 'FX_APPLY_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  if p_calculated_at < p_fixing_effective_at
     or p_calculated_at > v_now + interval '5 minutes'
  then
    raise exception 'FX_APPLY_CALCULATED_AT_INVALID' using errcode = '22023';
  end if;

  select policy_row.*
  into v_policy
  from public.fx_policy_versions as policy_row
  where policy_row.id = v_runtime.policy_version_id
    and policy_row.status = 'published';

  if not found then
    raise exception 'FX_APPLY_POLICY_NOT_FOUND' using errcode = 'P0001';
  end if;

  select fixing_row.*
  into v_previous
  from public.fx_fixings as fixing_row
  where fixing_row.id = v_runtime.current_fixing_id
    and fixing_row.game_session_id = p_game_session_id;

  if not found then
    raise exception 'FX_APPLY_PREVIOUS_FIXING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_previous.effective_at >= p_fixing_effective_at then
    raise exception 'FX_APPLY_FIXING_CHRONOLOGY_INVALID' using errcode = 'P0001';
  end if;

  if p_fixing_result ->> 'gameSessionId' <> p_game_session_id::text
     or p_fixing_result ->> 'fixingLocalDate' <> to_char(p_fixing_local_date, 'YYYY-MM-DD')
     or p_fixing_result ->> 'policyVersion' <> v_policy.policy_version
     or length(btrim(coalesce(p_fixing_result ->> 'canonicalInputJson', ''))) = 0
     or jsonb_typeof(p_fixing_result -> 'values') <> 'array'
  then
    raise exception 'FX_FIXING_RESULT_SCOPE_INVALID' using errcode = '22023';
  end if;

  begin
    v_canonical_engine_input :=
      (p_fixing_result ->> 'canonicalInputJson')::jsonb;
  exception
    when others then
      raise exception 'FX_FIXING_CANONICAL_INPUT_INVALID' using errcode = '22023';
  end;

  if v_canonical_engine_input <> v_runtime.claimed_engine_input then
    raise exception 'FX_FIXING_CANONICAL_INPUT_MISMATCH' using errcode = 'P0001';
  end if;

  if v_runtime.claimed_engine_input ->> 'policyVersion' <> v_policy.policy_version
     or v_runtime.claimed_engine_input -> 'policy' <> jsonb_build_object(
       'fixingLocalTime', v_policy.fixing_local_time::text,
       'normalMovementCapBasisPoints',
         v_policy.normal_movement_cap_basis_points,
       'crisisMovementCapBasisPoints',
         v_policy.crisis_movement_cap_basis_points,
       'parameters', v_policy.parameters
     )
  then
    raise exception 'FX_FIXING_POLICY_BINDING_INVALID' using errcode = 'P0001';
  end if;

  v_gdp_cap := (v_policy.parameters #>> '{gdp,capBasisPoints}')::integer;
  v_inflation_cap :=
    (v_policy.parameters #>> '{inflation,capBasisPoints}')::integer;
  v_real_interest_cap :=
    (v_policy.parameters #>> '{realInterest,capBasisPoints}')::integer;
  v_trade_cap := (v_policy.parameters #>> '{trade,capBasisPoints}')::integer;
  v_confidence_cap :=
    (v_policy.parameters #>> '{confidenceStability,capBasisPoints}')::integer;

  select
    count(*)::integer,
    count(distinct value_item.item ->> 'currencyCode')::integer
  into v_value_count, v_distinct_value_count
  from jsonb_array_elements(p_fixing_result -> 'values') as value_item(item);

  if v_value_count <> 11 or v_distinct_value_count <> 11 then
    raise exception 'FX_FIXING_RESULT_VALUES_INCOMPLETE' using errcode = '22023';
  end if;

  for v_value in
    select value_item.item
    from jsonb_array_elements(p_fixing_result -> 'values') as value_item(item)
  loop
    if jsonb_typeof(v_value) <> 'object' then
      raise exception 'FX_FIXING_RESULT_VALUE_INVALID' using errcode = '22023';
    end if;

    if not (
      v_value ?& array[
        'currencyCode',
        'countryCode',
        'snapshotId',
        'snapshotSequence',
        'previousUnitsPerEco',
        'unitsPerEco',
        'components',
        'appliedStoryShockIds'
      ]
    ) then
      raise exception 'FX_FIXING_RESULT_VALUE_KEYS_INVALID' using errcode = '22023';
    end if;

    v_code := upper(btrim(coalesce(v_value ->> 'currencyCode', '')));
    v_country_code := v_value ->> 'countryCode';
    v_components := v_value -> 'components';

    if v_code !~ '^[A-Z]{3,16}$'
       or coalesce(v_value ->> 'previousUnitsPerEco', '')
         !~ '^[0-9]+[.][0-9]{18}$'
       or coalesce(v_value ->> 'unitsPerEco', '')
         !~ '^[0-9]+[.][0-9]{18}$'
       or jsonb_typeof(v_components) <> 'object'
       or jsonb_typeof(v_value -> 'appliedStoryShockIds') <> 'array'
    then
      raise exception 'FX_FIXING_RESULT_VALUE_INVALID' using errcode = '22023';
    end if;

    if not (
      v_components ?& array[
        'gdpBasisPoints',
        'inflationBasisPoints',
        'realInterestBasisPoints',
        'tradeBasisPoints',
        'confidenceStabilityBasisPoints',
        'fundamentalBasisPoints',
        'storyBasisPoints',
        'finalBasisPoints'
      ]
    ) then
      raise exception 'FX_FIXING_RESULT_COMPONENT_KEYS_INVALID'
        using errcode = '22023';
    end if;

    if coalesce(v_components ->> 'gdpBasisPoints', '') !~ '^-?[0-9]+$'
       or coalesce(v_components ->> 'inflationBasisPoints', '') !~ '^-?[0-9]+$'
       or coalesce(v_components ->> 'realInterestBasisPoints', '') !~ '^-?[0-9]+$'
       or coalesce(v_components ->> 'tradeBasisPoints', '') !~ '^-?[0-9]+$'
       or coalesce(v_components ->> 'confidenceStabilityBasisPoints', '') !~ '^-?[0-9]+$'
       or coalesce(v_components ->> 'fundamentalBasisPoints', '') !~ '^-?[0-9]+$'
       or coalesce(v_components ->> 'storyBasisPoints', '') !~ '^-?[0-9]+$'
       or coalesce(v_components ->> 'finalBasisPoints', '') !~ '^-?[0-9]+$'
    then
      raise exception 'FX_FIXING_RESULT_COMPONENT_INVALID' using errcode = '22023';
    end if;

    v_previous_units := (v_value ->> 'previousUnitsPerEco')::numeric(38, 18);
    v_units := (v_value ->> 'unitsPerEco')::numeric(38, 18);
    v_gdp := (v_components ->> 'gdpBasisPoints')::integer;
    v_inflation := (v_components ->> 'inflationBasisPoints')::integer;
    v_real_interest := (v_components ->> 'realInterestBasisPoints')::integer;
    v_trade := (v_components ->> 'tradeBasisPoints')::integer;
    v_confidence :=
      (v_components ->> 'confidenceStabilityBasisPoints')::integer;
    v_fundamental := (v_components ->> 'fundamentalBasisPoints')::integer;
    v_story := (v_components ->> 'storyBasisPoints')::integer;
    v_final := (v_components ->> 'finalBasisPoints')::integer;

    if v_previous_units <= 0
       or v_units <= 0
       or abs(v_gdp) > v_gdp_cap
       or abs(v_inflation) > v_inflation_cap
       or abs(v_real_interest) > v_real_interest_cap
       or abs(v_trade) > v_trade_cap
       or abs(v_confidence) > v_confidence_cap
    then
      raise exception 'FX_FIXING_RESULT_COMPONENT_OUT_OF_RANGE' using errcode = '22023';
    end if;

    if v_code = 'ECO' then
      if jsonb_typeof(v_value -> 'countryCode') <> 'null'
         or jsonb_typeof(v_value -> 'snapshotId') <> 'null'
         or jsonb_typeof(v_value -> 'snapshotSequence') <> 'null'
         or v_previous_units <> 1
         or v_units <> 1
         or v_gdp <> 0
         or v_inflation <> 0
         or v_real_interest <> 0
         or v_trade <> 0
         or v_confidence <> 0
         or v_fundamental <> 0
         or v_story <> 0
         or v_final <> 0
         or v_value -> 'appliedStoryShockIds' <> '[]'::jsonb
      then
        raise exception 'FX_FIXING_ECO_IDENTITY_INVALID' using errcode = '22023';
      end if;
      continue;
    end if;

    select profile.*
    into v_profile
    from public.country_profiles as profile
    where profile.status = 'active'
      and profile.currency_code = v_code
      and profile.country_code = v_country_code;

    if not found then
      raise exception 'FX_FIXING_CURRENCY_COUNTRY_INVALID' using errcode = '22023';
    end if;

    select input_item.item
    into v_input_currency
    from jsonb_array_elements(
      v_runtime.claimed_engine_input -> 'currencies'
    ) as input_item(item)
    where input_item.item ->> 'currencyCode' = v_code;

    if not found
       or v_input_currency ->> 'countryCode' <> v_country_code
       or v_value ->> 'snapshotId' <> v_input_currency ->> 'snapshotId'
       or v_value ->> 'snapshotSequence' <>
         v_input_currency ->> 'snapshotSequence'
       or v_previous_units <>
         (v_input_currency ->> 'previousUnitsPerEco')::numeric(38, 18)
    then
      raise exception 'FX_FIXING_VALUE_INPUT_MISMATCH' using errcode = 'P0001';
    end if;

    if coalesce(v_value ->> 'snapshotId', '')
         !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_value ->> 'snapshotSequence', '') !~ '^[0-9]+$'
       or not exists (
         select 1
         from public.country_economic_snapshots as snapshot_row
         where snapshot_row.id = (v_value ->> 'snapshotId')::uuid
           and snapshot_row.game_session_id = p_game_session_id
           and snapshot_row.country_profile_id = v_profile.id
           and snapshot_row.snapshot_sequence =
             (v_value ->> 'snapshotSequence')::integer
       )
    then
      raise exception 'FX_FIXING_SNAPSHOT_SCOPE_INVALID' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.fx_fixing_currency_values as previous_value
      where previous_value.fixing_id = v_previous.id
        and previous_value.game_session_id = p_game_session_id
        and previous_value.currency_code = v_code
        and previous_value.country_code = v_country_code
        and previous_value.units_per_eco = v_previous_units
    ) then
      raise exception 'FX_FIXING_PREVIOUS_VALUE_MISMATCH' using errcode = 'P0001';
    end if;

    v_expected_fundamental := greatest(
      -v_policy.normal_movement_cap_basis_points,
      least(
        v_policy.normal_movement_cap_basis_points,
        v_gdp + v_inflation + v_real_interest + v_trade + v_confidence
      )
    );

    select
      greatest(
        -v_policy.crisis_movement_cap_basis_points,
        least(
          v_policy.crisis_movement_cap_basis_points,
          coalesce(sum((shock_item.item ->> 'basisPoints')::integer), 0)::integer
        )
      ),
      count(*)::integer,
      coalesce(
        jsonb_agg(
          to_jsonb(shock_item.item ->> 'shockId')
          order by shock_item.item ->> 'shockId'
        ),
        '[]'::jsonb
      )
    into v_expected_story, v_expected_shock_count, v_expected_shock_ids
    from jsonb_array_elements(
      v_runtime.claimed_engine_input -> 'storyShocks'
    ) as shock_item(item)
    where shock_item.item ->> 'currencyCode' = v_code;

    v_expected_final := case
      when v_expected_shock_count = 0 then v_expected_fundamental
      else greatest(
        -v_policy.crisis_movement_cap_basis_points,
        least(
          v_policy.crisis_movement_cap_basis_points,
          v_expected_fundamental + v_expected_story
        )
      )
    end;
    v_expected_units := round(
      v_previous_units * (10000 + v_expected_final)::numeric / 10000,
      18
    );

    if v_fundamental <> v_expected_fundamental
       or v_story <> v_expected_story
       or v_final <> v_expected_final
       or v_units <> v_expected_units
       or v_value -> 'appliedStoryShockIds' <> v_expected_shock_ids
    then
      raise exception 'FX_FIXING_RESULT_CALCULATION_INVALID' using errcode = 'P0001';
    end if;
  end loop;

  if not exists (
    select 1
    from jsonb_array_elements(p_fixing_result -> 'values') as value_item(item)
    where value_item.item ->> 'currencyCode' = 'ECO'
  )
     or exists (
       select 1
       from public.country_profiles as profile
       where profile.status = 'active'
         and not exists (
           select 1
           from jsonb_array_elements(p_fixing_result -> 'values')
             as value_item(item)
           where value_item.item ->> 'currencyCode' = profile.currency_code
             and value_item.item ->> 'countryCode' = profile.country_code
         )
     )
  then
    raise exception 'FX_FIXING_RESULT_CURRENCY_SET_INVALID' using errcode = '22023';
  end if;

  select count(distinct shock_item.item ->> 'shockId')::integer
  into v_expected_shock_count
  from jsonb_array_elements(
    v_runtime.claimed_engine_input -> 'storyShocks'
  ) as shock_item(item);

  if exists (
    select 1
    from jsonb_array_elements(
      v_runtime.claimed_engine_input -> 'storyShocks'
    ) as shock_item(item)
    left join public.fx_story_shock_authorizations as shock_row
      on shock_row.public_key = shock_item.item ->> 'shockId'
     and shock_row.game_session_id = p_game_session_id
    where shock_row.id is null
       or shock_row.eligible_at > p_fixing_effective_at
       or shock_row.authorized_at > p_fixing_effective_at
       or not (
         shock_row.adjustments_basis_points
           ? (shock_item.item ->> 'currencyCode')
       )
       or (shock_row.adjustments_basis_points ->>
         (shock_item.item ->> 'currencyCode'))::integer <>
         (shock_item.item ->> 'basisPoints')::integer
       or exists (
         select 1
         from public.fx_fixing_story_shocks as consumed
         where consumed.shock_authorization_id = shock_row.id
       )
  ) then
    raise exception 'FX_FIXING_STORY_SHOCK_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  v_timezone := public.game_timezone_for_game_v1(p_game_session_id);

  insert into public.fx_fixings (
    game_session_id,
    fixing_kind,
    fixing_local_date,
    game_timezone,
    effective_at,
    calculated_at,
    previous_fixing_id,
    policy_version_id,
    calculation_version,
    input_hash,
    source_kind
  )
  values (
    p_game_session_id,
    'daily',
    p_fixing_local_date,
    v_timezone,
    p_fixing_effective_at,
    p_calculated_at,
    v_previous.id,
    v_policy.id,
    'fx-fixing-engine-v1',
    p_input_hash,
    'daily_engine'
  )
  returning id, public_key into v_fixing_id, v_fixing_public_key;

  insert into public.fx_fixing_currency_values (
    fixing_id,
    game_session_id,
    currency_code,
    country_code,
    previous_units_per_eco,
    units_per_eco,
    gdp_basis_points,
    inflation_basis_points,
    real_interest_basis_points,
    trade_basis_points,
    confidence_stability_basis_points,
    fundamental_basis_points,
    story_basis_points,
    final_basis_points,
    applied_story_shock_ids,
    explanation
  )
  select
    v_fixing_id,
    p_game_session_id,
    value_item.item ->> 'currencyCode',
    value_item.item ->> 'countryCode',
    (value_item.item ->> 'previousUnitsPerEco')::numeric(38, 18),
    (value_item.item ->> 'unitsPerEco')::numeric(38, 18),
    (value_item.item #>> '{components,gdpBasisPoints}')::integer,
    (value_item.item #>> '{components,inflationBasisPoints}')::integer,
    (value_item.item #>> '{components,realInterestBasisPoints}')::integer,
    (value_item.item #>> '{components,tradeBasisPoints}')::integer,
    (value_item.item #>> '{components,confidenceStabilityBasisPoints}')::integer,
    (value_item.item #>> '{components,fundamentalBasisPoints}')::integer,
    (value_item.item #>> '{components,storyBasisPoints}')::integer,
    (value_item.item #>> '{components,finalBasisPoints}')::integer,
    value_item.item -> 'appliedStoryShockIds',
    concat_ws(
      '; ',
      'GDP ' || (value_item.item #>> '{components,gdpBasisPoints}') || ' bp',
      'inflation ' || (value_item.item #>> '{components,inflationBasisPoints}') || ' bp',
      'real interest ' || (value_item.item #>> '{components,realInterestBasisPoints}') || ' bp',
      'trade ' || (value_item.item #>> '{components,tradeBasisPoints}') || ' bp',
      'confidence/stability ' ||
        (value_item.item #>> '{components,confidenceStabilityBasisPoints}') || ' bp',
      'Story ' || (value_item.item #>> '{components,storyBasisPoints}') || ' bp',
      'final ' || (value_item.item #>> '{components,finalBasisPoints}') || ' bp'
    )
  from jsonb_array_elements(p_fixing_result -> 'values') as value_item(item);

  get diagnostics v_values_inserted = row_count;

  if v_values_inserted <> 11 then
    raise exception 'FX_FIXING_VALUE_WRITE_INCOMPLETE' using errcode = 'P0001';
  end if;

  insert into public.fx_fixing_macro_snapshots (
    fixing_id,
    game_session_id,
    country_profile_id,
    currency_code,
    snapshot_id,
    snapshot_sequence,
    snapshot_effective_at
  )
  select
    v_fixing_id,
    p_game_session_id,
    profile.id,
    input_item.item ->> 'currencyCode',
    (input_item.item ->> 'snapshotId')::uuid,
    (input_item.item ->> 'snapshotSequence')::integer,
    snapshot_row.effective_at
  from jsonb_array_elements(
    v_runtime.claimed_engine_input -> 'currencies'
  ) as input_item(item)
  join public.country_profiles as profile
    on profile.status = 'active'
   and profile.currency_code = input_item.item ->> 'currencyCode'
   and profile.country_code = input_item.item ->> 'countryCode'
  join public.country_economic_snapshots as snapshot_row
    on snapshot_row.id = (input_item.item ->> 'snapshotId')::uuid
   and snapshot_row.game_session_id = p_game_session_id
   and snapshot_row.country_profile_id = profile.id;

  get diagnostics v_snapshots_inserted = row_count;

  if v_snapshots_inserted <> 10 then
    raise exception 'FX_FIXING_MACRO_SNAPSHOT_WRITE_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  if v_expected_shock_count > 0 then
    insert into public.fx_fixing_story_shocks (
      fixing_id,
      game_session_id,
      shock_authorization_id,
      adjustments_basis_points
    )
    select distinct
      v_fixing_id,
      p_game_session_id,
      shock_row.id,
      shock_row.adjustments_basis_points
    from jsonb_array_elements(
      v_runtime.claimed_engine_input -> 'storyShocks'
    ) as shock_item(item)
    join public.fx_story_shock_authorizations as shock_row
      on shock_row.public_key = shock_item.item ->> 'shockId'
     and shock_row.game_session_id = p_game_session_id;

    get diagnostics v_shocks_consumed = row_count;

    if v_shocks_consumed <> v_expected_shock_count then
      raise exception 'FX_FIXING_STORY_SHOCK_WRITE_INCOMPLETE' using errcode = 'P0001';
    end if;
  end if;

  update private.fx_runtime_state
  set current_fixing_id = v_fixing_id,
      next_due_at = private.fx_boundary_for_local_date_v1(
        p_fixing_local_date + 1,
        v_timezone
      ),
      retry_after_at = null,
      claimed_local_date = null,
      claimed_effective_at = null,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      claimed_input_hash = null,
      claimed_engine_input = null,
      last_success_at = p_calculated_at,
      last_error_code = null,
      last_error_at = null,
      updated_at = v_now
  where game_session_id = p_game_session_id
    and lease_token = p_lease_token;

  if not found then
    raise exception 'FX_APPLY_LEASE_LOST' using errcode = 'P0001';
  end if;

  return query select
    'applied'::text,
    v_fixing_public_key,
    v_values_inserted,
    v_shocks_consumed;
end;
$function$;

revoke all on function public.apply_fx_fixing_v1(
  uuid, date, timestamptz, uuid, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_fx_fixing_v1(
  uuid, date, timestamptz, uuid, text, timestamptz, jsonb
) to service_role;

create or replace function public.fail_fx_fixing_claim_v1(
  p_game_session_id uuid,
  p_fixing_local_date date,
  p_lease_token uuid,
  p_error_code text,
  p_failed_at timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_error_code text := lower(btrim(coalesce(p_error_code, '')));
  v_runtime private.fx_runtime_state%rowtype;
begin
  if p_game_session_id is null
     or p_fixing_local_date is null
     or p_lease_token is null
     or v_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
     or p_failed_at is null
  then
    raise exception 'FX_FAILURE_REQUEST_INVALID' using errcode = '22023';
  end if;

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
  for update;

  if not found then
    raise exception 'FX_FAILURE_RUNTIME_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_runtime.lease_token is distinct from p_lease_token
     or v_runtime.claimed_local_date is distinct from p_fixing_local_date
  then
    if exists (
      select 1
      from public.fx_fixings as fixing_row
      where fixing_row.game_session_id = p_game_session_id
        and fixing_row.fixing_kind = 'daily'
        and fixing_row.fixing_local_date = p_fixing_local_date
    ) then
      return true;
    end if;

    raise exception 'FX_FAILURE_LEASE_INVALID' using errcode = 'P0001';
  end if;

  update private.fx_runtime_state
  set retry_after_at = p_failed_at + interval '1 minute',
      claimed_local_date = null,
      claimed_effective_at = null,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      claimed_input_hash = null,
      claimed_engine_input = null,
      last_error_code = v_error_code,
      last_error_at = p_failed_at,
      updated_at = p_failed_at
  where game_session_id = p_game_session_id
    and lease_token = p_lease_token;

  return found;
end;
$function$;

revoke all on function public.fail_fx_fixing_claim_v1(
  uuid, date, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.fail_fx_fixing_claim_v1(
  uuid, date, uuid, text, timestamptz
) to service_role;

create or replace function public.resolve_fx_rate_v1(
  p_game_session_id uuid,
  p_from_currency_code text,
  p_to_currency_code text,
  p_at timestamptz default clock_timestamp()
)
returns table (
  fixing_public_id text,
  fixing_effective_at timestamptz,
  from_currency_code text,
  to_currency_code text,
  rate numeric(38, 18)
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_from text := upper(btrim(coalesce(p_from_currency_code, '')));
  v_to text := upper(btrim(coalesce(p_to_currency_code, '')));
  v_fixing public.fx_fixings%rowtype;
  v_from_units numeric(38, 18);
  v_to_units numeric(38, 18);
begin
  if p_game_session_id is null
     or v_from !~ '^[A-Z]{3,16}$'
     or v_to !~ '^[A-Z]{3,16}$'
     or p_at is null
  then
    raise exception 'FX_RATE_REQUEST_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.currencies where code = v_from and status = 'active'
  ) or not exists (
    select 1 from public.currencies where code = v_to and status = 'active'
  ) then
    raise exception 'FX_RATE_CURRENCY_INVALID' using errcode = '22023';
  end if;

  select fixing_row.*
  into v_fixing
  from public.fx_fixings as fixing_row
  where fixing_row.game_session_id = p_game_session_id
    and fixing_row.effective_at <= p_at
  order by fixing_row.effective_at desc, fixing_row.created_at desc, fixing_row.id desc
  limit 1;

  if not found then
    raise exception 'FX_FIXING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select value_row.units_per_eco
  into v_from_units
  from public.fx_fixing_currency_values as value_row
  where value_row.fixing_id = v_fixing.id
    and value_row.game_session_id = p_game_session_id
    and value_row.currency_code = v_from;

  select value_row.units_per_eco
  into v_to_units
  from public.fx_fixing_currency_values as value_row
  where value_row.fixing_id = v_fixing.id
    and value_row.game_session_id = p_game_session_id
    and value_row.currency_code = v_to;

  if v_from_units is null or v_to_units is null then
    raise exception 'FX_FIXING_VALUE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return query select
    v_fixing.public_key,
    v_fixing.effective_at,
    v_from,
    v_to,
    case
      when v_from = v_to then 1::numeric(38, 18)
      else (v_to_units / v_from_units)::numeric(38, 18)
    end;
end;
$function$;

revoke all on function public.resolve_fx_rate_v1(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolve_fx_rate_v1(uuid, text, text, timestamptz)
  to service_role;

create or replace function public.get_current_fx_fixing_v1(
  p_game_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'fixingPublicId', fixing_row.public_key,
    'fixingKind', fixing_row.fixing_kind,
    'fixingLocalDate', fixing_row.fixing_local_date,
    'gameTimezone', fixing_row.game_timezone,
    'effectiveAt', fixing_row.effective_at,
    'calculatedAt', fixing_row.calculated_at,
    'policyVersion', policy_row.policy_version,
    'inputHash', fixing_row.input_hash,
    'values', (
      select jsonb_agg(
        jsonb_build_object(
          'currencyCode', value_row.currency_code,
          'countryCode', value_row.country_code,
          'unitsPerEco', value_row.units_per_eco::text,
          'finalBasisPoints', value_row.final_basis_points,
          'explanation', value_row.explanation
        )
        order by case when value_row.currency_code = 'ECO' then 0 else 1 end,
                 value_row.currency_code
      )
      from public.fx_fixing_currency_values as value_row
      where value_row.fixing_id = fixing_row.id
        and value_row.game_session_id = fixing_row.game_session_id
    )
  )
  from private.fx_runtime_state as runtime
  join public.fx_fixings as fixing_row
    on fixing_row.id = runtime.current_fixing_id
   and fixing_row.game_session_id = runtime.game_session_id
  join public.fx_policy_versions as policy_row
    on policy_row.id = fixing_row.policy_version_id
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready';
$function$;

revoke all on function public.get_current_fx_fixing_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_current_fx_fixing_v1(uuid)
  to service_role;

create or replace function public.list_fx_fixing_history_v1(
  p_game_session_id uuid,
  p_before_effective_at timestamptz default null,
  p_before_public_key text default null,
  p_limit integer default 30
)
returns table (
  fixing_public_id text,
  fixing_kind text,
  fixing_local_date date,
  effective_at timestamptz,
  calculated_at timestamptz,
  policy_version text,
  input_hash text,
  currency_values jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if p_game_session_id is null
     or p_limit is null
     or p_limit not between 1 and 100
     or (
       (p_before_effective_at is null) <>
       (p_before_public_key is null)
     )
     or (
       p_before_public_key is not null
       and p_before_public_key !~ '^fxf_[0-9a-f]{32}$'
     )
  then
    raise exception 'FX_HISTORY_REQUEST_INVALID' using errcode = '22023';
  end if;

  return query
  select
    fixing_row.public_key,
    fixing_row.fixing_kind,
    fixing_row.fixing_local_date,
    fixing_row.effective_at,
    fixing_row.calculated_at,
    policy_row.policy_version,
    fixing_row.input_hash,
    (
      select jsonb_agg(
        jsonb_build_object(
          'currencyCode', value_row.currency_code,
          'countryCode', value_row.country_code,
          'unitsPerEco', value_row.units_per_eco::text,
          'components', jsonb_build_object(
            'gdpBasisPoints', value_row.gdp_basis_points,
            'inflationBasisPoints', value_row.inflation_basis_points,
            'realInterestBasisPoints', value_row.real_interest_basis_points,
            'tradeBasisPoints', value_row.trade_basis_points,
            'confidenceStabilityBasisPoints',
              value_row.confidence_stability_basis_points,
            'fundamentalBasisPoints', value_row.fundamental_basis_points,
            'storyBasisPoints', value_row.story_basis_points,
            'finalBasisPoints', value_row.final_basis_points
          ),
          'explanation', value_row.explanation
        )
        order by case when value_row.currency_code = 'ECO' then 0 else 1 end,
                 value_row.currency_code
      )
      from public.fx_fixing_currency_values as value_row
      where value_row.fixing_id = fixing_row.id
        and value_row.game_session_id = fixing_row.game_session_id
    )
  from public.fx_fixings as fixing_row
  join public.fx_policy_versions as policy_row
    on policy_row.id = fixing_row.policy_version_id
  where fixing_row.game_session_id = p_game_session_id
    and (
      p_before_effective_at is null
      or (fixing_row.effective_at, fixing_row.public_key) <
        (p_before_effective_at, p_before_public_key)
    )
  order by fixing_row.effective_at desc, fixing_row.public_key desc
  limit p_limit;
end;
$function$;

revoke all on function public.list_fx_fixing_history_v1(
  uuid, timestamptz, text, integer
) from public, anon, authenticated;
grant execute on function public.list_fx_fixing_history_v1(
  uuid, timestamptz, text, integer
) to service_role;

create or replace function public.get_fx_runtime_status_v1(
  p_game_session_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_game_session_id is null or p_now is null then
    raise exception 'FX_RUNTIME_STATUS_REQUEST_INVALID' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'cutoverStatus', runtime.cutover_status,
    'blockedReason', runtime.blocked_reason,
    'currentFixingPublicId', fixing_row.public_key,
    'nextDueAt', runtime.next_due_at,
    'retryAfterAt', runtime.retry_after_at,
    'overdue', (
      runtime.cutover_status = 'ready'
      and runtime.next_due_at is not null
      and runtime.next_due_at < p_now
    ),
    'overdueSince', case
      when runtime.cutover_status = 'ready'
       and runtime.next_due_at is not null
       and runtime.next_due_at < p_now
        then runtime.next_due_at
      else null
    end,
    'attemptCount', runtime.attempt_count,
    'lastAttemptAt', runtime.last_attempt_at,
    'lastSuccessAt', runtime.last_success_at,
    'lastErrorCode', runtime.last_error_code,
    'lastErrorAt', runtime.last_error_at
  )
  into v_result
  from private.fx_runtime_state as runtime
  left join public.fx_fixings as fixing_row
    on fixing_row.id = runtime.current_fixing_id
   and fixing_row.game_session_id = runtime.game_session_id
  where runtime.game_session_id = p_game_session_id;

  if v_result is null then
    raise exception 'FX_RUNTIME_STATUS_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.get_fx_runtime_status_v1(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_fx_runtime_status_v1(uuid, timestamptz)
  to service_role;

create or replace function public.apply_story_currency_volatility_v1(
  p_game_session_id uuid,
  p_command_key text,
  p_adjustments_basis_points jsonb,
  p_effective_at timestamptz default clock_timestamp()
)
returns table (
  command_outcome text,
  inserted_rates integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_adjustments jsonb;
  v_authorization_hash text;
  v_existing public.fx_story_shock_authorizations%rowtype;
  v_invalid integer := 0;
begin
  if p_game_session_id is null
     or p_command_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$'
     or jsonb_typeof(p_adjustments_basis_points) <> 'object'
     or p_effective_at is null
  then
    raise exception 'STORY_CURRENCY_VOLATILITY_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_invalid
  from jsonb_each_text(p_adjustments_basis_points)
    as adjustment(currency_code, basis_points)
  where adjustment.currency_code <> upper(adjustment.currency_code)
     or adjustment.basis_points !~ '^-?[0-9]+$'
     or adjustment.basis_points::integer not between -1500 and 1500
     or not exists (
       select 1
       from public.currencies as currency_row
       where currency_row.code = adjustment.currency_code
         and currency_row.status = 'active'
         and (
           currency_row.currency_kind = 'national'
           or currency_row.code = 'ECO'
         )
     );

  if v_invalid <> 0 then
    raise exception 'STORY_CURRENCY_VOLATILITY_ADJUSTMENT_INVALID'
      using errcode = '22023';
  end if;

  if coalesce((p_adjustments_basis_points ->> 'ECO')::integer, 0) <> 0 then
    raise exception 'STORY_CURRENCY_VOLATILITY_ECO_NUMERAIRE_REQUIRED'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from jsonb_each_text(p_adjustments_basis_points)
      as adjustment(currency_code, basis_points)
    join public.currencies as currency_row
      on currency_row.code = adjustment.currency_code
     and currency_row.currency_kind = 'national'
     and currency_row.status = 'active'
    where adjustment.basis_points::integer <> 0
  ) then
    raise exception 'STORY_CURRENCY_VOLATILITY_NONZERO_ADJUSTMENT_REQUIRED'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    join private.fx_runtime_state as runtime
      on runtime.game_session_id = game_row.id
     and runtime.cutover_status = 'ready'
    where game_row.id = p_game_session_id
      and game_row.lifecycle_state in ('active', 'paused')
  ) then
    raise exception 'STORY_CURRENCY_VOLATILITY_FX_NOT_READY'
      using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_object_agg(
      adjustment.currency_code,
      adjustment.basis_points::integer
      order by adjustment.currency_code
    ),
    '{}'::jsonb
  )
  into v_adjustments
  from jsonb_each_text(p_adjustments_basis_points)
    as adjustment(currency_code, basis_points);

  v_authorization_hash := private.fx_digest_jsonb_v1(
    jsonb_build_object(
      'gameSessionId', p_game_session_id,
      'commandKey', p_command_key,
      'adjustmentsBasisPoints', v_adjustments,
      'eligibleAt', p_effective_at
    )
  );

  perform pg_advisory_xact_lock(
    hashtextextended(p_game_session_id::text, 2608252238)
  );

  select shock_row.*
  into v_existing
  from public.fx_story_shock_authorizations as shock_row
  where shock_row.game_session_id = p_game_session_id
    and shock_row.command_key = p_command_key;

  if found then
    if v_existing.authorization_hash <> v_authorization_hash then
      raise exception 'STORY_CURRENCY_VOLATILITY_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;

    return query select 'replayed'::text, 0;
    return;
  end if;

  insert into public.fx_story_shock_authorizations (
    game_session_id,
    command_key,
    adjustments_basis_points,
    eligible_at,
    authorization_hash
  )
  values (
    p_game_session_id,
    p_command_key,
    v_adjustments,
    p_effective_at,
    v_authorization_hash
  );

  return query select 'queued'::text, 0;
end;
$function$;

revoke all on function public.apply_story_currency_volatility_v1(
  uuid, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_story_currency_volatility_v1(
  uuid, text, jsonb, timestamptz
) to service_role;

create or replace function public.configure_fx_runtime_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net, extensions, pg_temp
as $function$
declare
  v_scheduler_name constant text := 'econovaria-fx-runtime-scheduler-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/fx-orchestrator$' then
    raise exception using
      errcode = '22023',
      message = 'invalid FX runtime scheduler function URL';
  end if;

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name = v_scheduler_name
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      v_scheduler_name,
      'Internal token for the one-minute Econovaria FX runtime scheduler.'
    );
  end if;

  insert into private.runtime_scheduler_tokens (scheduler_name, token_sha256)
  values (
    v_scheduler_name,
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  on conflict (scheduler_name) do update
  set token_sha256 = excluded.token_sha256,
      rotated_at = case
        when private.runtime_scheduler_tokens.token_sha256 <>
          excluded.token_sha256
          then clock_timestamp()
        else private.runtime_scheduler_tokens.rotated_at
      end;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = v_scheduler_name
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format(
    $command$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-econovaria-scheduler-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'econovaria-fx-runtime-scheduler-v1'
            order by created_at desc
            limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $command$,
    v_function_url
  );

  return cron.schedule(v_scheduler_name, '* * * * *', v_command);
end;
$function$;

revoke all on function public.configure_fx_runtime_scheduler_v1(text)
  from public, anon, authenticated;
grant execute on function public.configure_fx_runtime_scheduler_v1(text)
  to service_role;

comment on function public.configure_fx_runtime_scheduler_v1(text) is
  'On explicit service invocation, creates or rotates the dedicated Vault-backed FX scheduler token, records only its SHA-256 verifier, replaces the named Cron job, and invokes fx-orchestrator every minute. This migration defines but does not invoke the configurator.';

-- The actual legacy trigger was named initialize_game_fx_after_insert. The
-- second bounded drop documents and retires any earlier donor spelling of the
-- initialize_currency_exchange_rates writer without touching its evidence.
drop trigger if exists initialize_currency_exchange_rates_after_game_insert
  on public.game_sessions;

create or replace function public.initialize_currency_exchange_rates_for_game_v1(
  p_game_session_id uuid,
  p_effective_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  perform p_game_session_id, p_effective_at;
  raise exception 'FX_LEGACY_WRITER_RETIRED' using errcode = '42501';
end;
$function$;

revoke all on function public.initialize_currency_exchange_rates_for_game_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate
  on table public.currency_exchange_rates
  from public, anon, authenticated, service_role;
grant select on table public.currency_exchange_rates to service_role;

drop trigger if exists currency_exchange_rates_immutable
  on public.currency_exchange_rates;
create trigger currency_exchange_rates_immutable
before insert or update on public.currency_exchange_rates
for each row execute function private.reject_fx_immutable_mutation_v1();

comment on table public.currency_exchange_rates is
  'Frozen legacy FX pair evidence retained for guarded cutover and pre-cutover compatibility. Inserts and updates are trigger-rejected and runtime DELETE privileges are revoked; existing trusted whole-game purge authority may delete the complete game-scoped evidence set without changing its historical FK semantics.';

create or replace function public.convert_currency_amount(
  p_game_session_id uuid,
  p_amount numeric,
  p_from_currency_code text,
  p_to_currency_code text
)
returns numeric
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_from text := upper(btrim(coalesce(p_from_currency_code, '')));
  v_to text := upper(btrim(coalesce(p_to_currency_code, '')));
  v_decimal_places integer;
  v_rate numeric;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;

  if p_amount is null then
    raise exception 'AMOUNT_REQUIRED' using errcode = 'P0001';
  end if;

  if v_from !~ '^[A-Z]{3,16}$' or v_to !~ '^[A-Z]{3,16}$' then
    raise exception 'CURRENCY_CODE_REQUIRED' using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_decimal_places
  from public.currencies as currency_row
  where currency_row.code = v_to
    and currency_row.status = 'active';

  if v_decimal_places is null
     or not exists (
       select 1
       from public.currencies as currency_row
       where currency_row.code = v_from
         and currency_row.status = 'active'
     )
  then
    raise exception 'EXCHANGE_RATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_from = v_to then
    return round(p_amount, v_decimal_places);
  end if;

  if exists (
    select 1
    from private.fx_runtime_state as runtime
    where runtime.game_session_id = p_game_session_id
      and runtime.cutover_status = 'ready'
  ) then
    select resolved.rate
    into v_rate
    from public.resolve_fx_rate_v1(
      p_game_session_id,
      v_from,
      v_to,
      clock_timestamp()
    ) as resolved;
  else
    select rate_row.rate
    into v_rate
    from public.currency_exchange_rates as rate_row
    where rate_row.game_session_id = p_game_session_id
      and rate_row.from_currency_code = v_from
      and rate_row.to_currency_code = v_to
      and rate_row.effective_at <= clock_timestamp()
      and (
        rate_row.expires_at is null
        or rate_row.expires_at > clock_timestamp()
      )
    order by rate_row.effective_at desc, rate_row.created_at desc, rate_row.id desc
    limit 1;

    if v_rate is null then
      select 1 / rate_row.rate
      into v_rate
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = p_game_session_id
        and rate_row.from_currency_code = v_to
        and rate_row.to_currency_code = v_from
        and rate_row.effective_at <= clock_timestamp()
        and (
          rate_row.expires_at is null
          or rate_row.expires_at > clock_timestamp()
        )
      order by rate_row.effective_at desc, rate_row.created_at desc, rate_row.id desc
      limit 1;
    end if;
  end if;

  if v_rate is null then
    raise exception 'EXCHANGE_RATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return round(p_amount * v_rate, v_decimal_places);
end;
$function$;

revoke all on function public.convert_currency_amount(uuid, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.convert_currency_amount(uuid, numeric, text, text)
  to service_role;

revoke all on function private.reject_fx_immutable_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on table private.fx_runtime_state
  from public, anon, authenticated, service_role;

comment on table public.fx_policy_versions is
  'Immutable published FX calculation policy definitions. Runtime state pins one exact policy version; later policies are forward-added with later activated_at values.';
comment on table public.fx_fixings is
  'Immutable game-scoped ECO-valued bootstrap and daily fixing headers.';
comment on table public.fx_fixing_currency_values is
  'Immutable per-currency units-per-ECO values and explained basis-point components for one fixing.';
comment on table public.fx_fixing_macro_snapshots is
  'The exact complete ten-country macro cohort consumed by one immutable fixing.';
comment on table public.fx_story_shock_authorizations is
  'Immutable idempotent Story shock authorizations queued for the next eligible fixing.';
comment on table public.fx_fixing_story_shocks is
  'One-time fixing consumption evidence for each Story shock authorization.';
comment on table private.fx_runtime_state is
  'Private mutable FX cursor, due time, lease, bound engine input, and observable failure state.';
comment on function public.apply_story_currency_volatility_v1(
  uuid, text, jsonb, timestamptz
) is
  'Preserves the trusted Story RPC signature while queueing one immutable next-fixing authorization. It never publishes pair rates.';
comment on function public.convert_currency_amount(uuid, numeric, text, text) is
  'Deprecated server compatibility adapter. Ready games resolve the canonical ECO-valued fixing; cutover-blocked games retain read-only legacy pair behavior.';

notify pgrst, 'reload schema';

commit;
