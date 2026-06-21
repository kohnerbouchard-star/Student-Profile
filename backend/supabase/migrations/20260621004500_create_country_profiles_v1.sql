-- Eco Novaria country profile pricing foundation V1.
-- Defines the canonical map-country set and player country assignment source for future dynamic economy systems.
-- Player location is intentionally modeled as mutable assignment history so players can immigrate between countries.

create table public.country_profiles (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  country_name text not null unique,
  capital_name text not null,
  currency_code text not null default 'ECO',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint country_profiles_country_code_format check (country_code ~ '^[A-Z][A-Z0-9_]{2,31}$'),
  constraint country_profiles_country_name_not_blank check (length(btrim(country_name)) > 0),
  constraint country_profiles_capital_name_not_blank check (length(btrim(capital_name)) > 0),
  constraint country_profiles_currency_code_format check (currency_code ~ '^[A-Z]{3,8}$'),
  constraint country_profiles_status_check check (status in ('active', 'disabled', 'archived'))
);

create trigger set_country_profiles_updated_at
before update on public.country_profiles
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.country_profiles is
  'Canonical stable country identity set for Eco Novaria map countries. Dynamic macroeconomic values live in country_economic_snapshots.';
comment on column public.country_profiles.country_code is
  'Stable backend code for a map country. Not intended for display copy.';

create index country_profiles_status_idx
on public.country_profiles (status);

create table public.country_economic_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  country_profile_id uuid not null references public.country_profiles (id),
  simulation_tick integer not null default 0,
  snapshot_label text null,
  real_gdp_index numeric(10, 4) not null default 100,
  gdp_growth_rate numeric(9, 4) not null default 0,
  inflation_rate numeric(9, 4) not null default 0,
  unemployment_rate numeric(9, 4) not null default 0.05,
  interest_rate numeric(9, 4) not null default 0.03,
  consumer_confidence_index numeric(10, 4) not null default 100,
  business_confidence_index numeric(10, 4) not null default 100,
  cost_of_living_index numeric(9, 4) not null default 1,
  regional_price_multiplier numeric(9, 4) not null default 1,
  supply_constraint_index numeric(9, 4) not null default 1,
  import_dependency_index numeric(9, 4) not null default 1,
  tax_rate numeric(9, 4) not null default 0,
  subsidy_rate numeric(9, 4) not null default 0,
  exchange_rate_index numeric(9, 4) not null default 1,
  currency_stability_index numeric(9, 4) not null default 1,
  trade_balance_index numeric(10, 4) not null default 0,
  export_strength_index numeric(9, 4) not null default 1,
  market_risk_index numeric(9, 4) not null default 1,
  political_stability_index numeric(9, 4) not null default 1,
  infrastructure_index numeric(9, 4) not null default 1,
  energy_security_index numeric(9, 4) not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint country_economic_snapshots_tick_nonnegative check (simulation_tick >= 0),
  constraint country_economic_snapshots_snapshot_label_not_blank check (
    snapshot_label is null
    or length(btrim(snapshot_label)) > 0
  ),
  constraint country_economic_snapshots_real_gdp_positive check (real_gdp_index > 0),
  constraint country_economic_snapshots_gdp_growth_reasonable check (gdp_growth_rate >= -1 and gdp_growth_rate <= 10),
  constraint country_economic_snapshots_inflation_reasonable check (inflation_rate >= -1 and inflation_rate <= 10),
  constraint country_economic_snapshots_unemployment_reasonable check (unemployment_rate >= 0 and unemployment_rate <= 1),
  constraint country_economic_snapshots_interest_reasonable check (interest_rate >= -1 and interest_rate <= 10),
  constraint country_economic_snapshots_consumer_confidence_positive check (consumer_confidence_index > 0),
  constraint country_economic_snapshots_business_confidence_positive check (business_confidence_index > 0),
  constraint country_economic_snapshots_cost_of_living_positive check (cost_of_living_index > 0),
  constraint country_economic_snapshots_regional_price_positive check (regional_price_multiplier > 0),
  constraint country_economic_snapshots_supply_constraint_positive check (supply_constraint_index > 0),
  constraint country_economic_snapshots_import_dependency_positive check (import_dependency_index > 0),
  constraint country_economic_snapshots_tax_rate_reasonable check (tax_rate >= 0 and tax_rate <= 1),
  constraint country_economic_snapshots_subsidy_rate_reasonable check (subsidy_rate >= 0 and subsidy_rate <= 1),
  constraint country_economic_snapshots_exchange_rate_positive check (exchange_rate_index > 0),
  constraint country_economic_snapshots_currency_stability_positive check (currency_stability_index > 0),
  constraint country_economic_snapshots_export_strength_positive check (export_strength_index > 0),
  constraint country_economic_snapshots_market_risk_positive check (market_risk_index > 0),
  constraint country_economic_snapshots_political_stability_positive check (political_stability_index > 0),
  constraint country_economic_snapshots_infrastructure_positive check (infrastructure_index > 0),
  constraint country_economic_snapshots_energy_security_positive check (energy_security_index > 0),
  constraint country_economic_snapshots_unique_tick unique (game_session_id, country_profile_id, simulation_tick)
);

comment on table public.country_economic_snapshots is
  'Per-game, per-country macroeconomic snapshot history. Store pricing should use the latest active snapshot for the player country rather than global hard-coded multipliers.';
comment on column public.country_economic_snapshots.simulation_tick is
  'Game round/tick for this economic state. One country can have one snapshot per tick per game session.';
comment on column public.country_economic_snapshots.inflation_rate is
  'Current country inflation rate. Example: 0.075 means 7.5%.';
comment on column public.country_economic_snapshots.cost_of_living_index is
  'Country cost-of-living index. Neutral baseline is 1.';
comment on column public.country_economic_snapshots.regional_price_multiplier is
  'Direct regional price multiplier for store quote pricing. Neutral baseline is 1.';
comment on column public.country_economic_snapshots.supply_constraint_index is
  'Supply/scarcity pressure used by store quote pricing. Neutral baseline is 1.';
comment on column public.country_economic_snapshots.import_dependency_index is
  'Import exposure used by store quote pricing. Neutral baseline is 1.';

create index country_economic_snapshots_latest_idx
on public.country_economic_snapshots (game_session_id, country_profile_id, simulation_tick desc);

create index country_economic_snapshots_game_tick_idx
on public.country_economic_snapshots (game_session_id, simulation_tick desc);

create table public.country_event_impacts (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  country_profile_id uuid not null references public.country_profiles (id),
  event_key text not null,
  event_name text not null,
  event_type text not null,
  impact_summary text not null,
  stat_deltas jsonb not null default '{}'::jsonb,
  source_snapshot_id uuid null references public.country_economic_snapshots (id),
  result_snapshot_id uuid null references public.country_economic_snapshots (id),
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint country_event_impacts_event_key_not_blank check (length(btrim(event_key)) > 0),
  constraint country_event_impacts_event_name_not_blank check (length(btrim(event_name)) > 0),
  constraint country_event_impacts_event_type_not_blank check (length(btrim(event_type)) > 0),
  constraint country_event_impacts_impact_summary_not_blank check (length(btrim(impact_summary)) > 0),
  constraint country_event_impacts_snapshot_changed check (
    source_snapshot_id is null
    or result_snapshot_id is null
    or source_snapshot_id <> result_snapshot_id
  )
);

comment on table public.country_event_impacts is
  'Append-only event-impact log explaining why a country macroeconomic profile changed during a game session.';
comment on column public.country_event_impacts.stat_deltas is
  'JSON object of macro fields changed by the event. Example: {"inflation_rate":0.02,"supply_constraint_index":0.15}.';

create index country_event_impacts_country_time_idx
on public.country_event_impacts (game_session_id, country_profile_id, applied_at desc);

create index country_event_impacts_event_key_idx
on public.country_event_impacts (game_session_id, event_key);

create table public.player_country_assignments (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  country_profile_id uuid not null references public.country_profiles (id),
  status text not null default 'active',
  assignment_reason text not null default 'initial_assignment',
  assigned_at timestamptz not null default now(),
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_country_assignments_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_country_assignments_status_check check (status in ('active', 'inactive', 'archived')),
  constraint player_country_assignments_reason_not_blank check (length(btrim(assignment_reason)) > 0),
  constraint player_country_assignments_active_has_no_end check (
    status <> 'active'
    or ended_at is null
  ),
  constraint player_country_assignments_inactive_has_end check (
    status = 'active'
    or ended_at is not null
  ),
  constraint player_country_assignments_end_after_assign check (
    ended_at is null
    or ended_at >= assigned_at
  )
);

create trigger set_player_country_assignments_updated_at
before update on public.player_country_assignments
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.player_country_assignments is
  'Mutable player country/location assignment history. Players may immigrate to another country by ending the old active row and inserting a new active row.';
comment on column public.player_country_assignments.country_profile_id is
  'Country profile used as the active economic input for store quote pricing.';
comment on column public.player_country_assignments.assignment_reason is
  'Reason for this location assignment, such as initial_assignment, immigration, event_relocation, or admin_adjustment.';
comment on column public.player_country_assignments.ended_at is
  'Timestamp when this country assignment stopped being active. Active rows must not have ended_at.';

create unique index player_country_assignments_one_active_idx
on public.player_country_assignments (game_session_id, player_id)
where status = 'active';

create index player_country_assignments_country_profile_idx
on public.player_country_assignments (country_profile_id);

create index player_country_assignments_player_history_idx
on public.player_country_assignments (game_session_id, player_id, assigned_at desc);

create table public.player_country_migration_events (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  from_country_profile_id uuid null references public.country_profiles (id),
  to_country_profile_id uuid not null references public.country_profiles (id),
  from_assignment_id uuid null references public.player_country_assignments (id),
  to_assignment_id uuid not null references public.player_country_assignments (id),
  migration_reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  migrated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint player_country_migration_events_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_country_migration_events_reason_not_blank check (length(btrim(migration_reason)) > 0),
  constraint player_country_migration_events_country_changed check (
    from_country_profile_id is null
    or from_country_profile_id <> to_country_profile_id
  ),
  constraint player_country_migration_events_assignment_changed check (
    from_assignment_id is null
    or from_assignment_id <> to_assignment_id
  )
);

comment on table public.player_country_migration_events is
  'Append-only audit trail for player immigration/location changes between Eco Novaria countries.';
comment on column public.player_country_migration_events.from_country_profile_id is
  'Previous country profile, null only for first assignment if represented as a migration event.';
comment on column public.player_country_migration_events.to_country_profile_id is
  'New country profile after immigration.';

create index player_country_migration_events_player_idx
on public.player_country_migration_events (game_session_id, player_id, migrated_at desc);

create index player_country_migration_events_to_country_idx
on public.player_country_migration_events (to_country_profile_id);

insert into public.country_profiles (
  country_code,
  country_name,
  capital_name,
  currency_code,
  metadata
)
values
  ('NORTHREACH', 'Northreach', 'Frostgate', 'ECO', '{"mapRegion":"northwest","mapColor":"purple"}'::jsonb),
  ('YRETHIA', 'Yrethia', 'Sableport', 'ECO', '{"mapRegion":"west","mapColor":"blue"}'::jsonb),
  ('THALORIS', 'Thaloris', 'Dusk Harbor', 'ECO', '{"mapRegion":"southwest","mapColor":"orange"}'::jsonb),
  ('SOLVEND', 'Solvend', 'Aurora Spire', 'ECO', '{"mapRegion":"north-central","mapColor":"cyan"}'::jsonb),
  ('ELDORAN', 'Eldoran', 'Crescent Bay', 'ECO', '{"mapRegion":"central","mapColor":"yellow"}'::jsonb),
  ('VALERION', 'Valerion', 'Glassfall', 'ECO', '{"mapRegion":"south-central","mapColor":"teal"}'::jsonb),
  ('LUMENOR', 'Lumenor', 'Starfall', 'ECO', '{"mapRegion":"south","mapColor":"blue-white"}'::jsonb),
  ('XALVORIA', 'Xalvoria', 'Emberhall', 'ECO', '{"mapRegion":"northeast","mapColor":"gold"}'::jsonb),
  ('DRAVENLOK', 'Dravenlok', 'Ironhold', 'ECO', '{"mapRegion":"east","mapColor":"red"}'::jsonb),
  ('SYNDALIS', 'Syndalis', 'Blacklight', 'ECO', '{"mapRegion":"southeast","mapColor":"violet"}'::jsonb);

alter table public.country_profiles enable row level security;
alter table public.country_economic_snapshots enable row level security;
alter table public.country_event_impacts enable row level security;
alter table public.player_country_assignments enable row level security;
alter table public.player_country_migration_events enable row level security;

comment on table public.country_profiles is
  'Backend-owned country identity source for Eco Novaria. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.country_economic_snapshots is
  'Backend-owned per-game macroeconomic country history. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.country_event_impacts is
  'Backend-owned country economic event history. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.player_country_assignments is
  'Backend-owned mutable active player country location source. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.player_country_migration_events is
  'Backend-owned immigration history. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
