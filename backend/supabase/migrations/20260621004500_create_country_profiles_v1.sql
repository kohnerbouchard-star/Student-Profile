-- Eco Novaria country profile pricing foundation V1.
-- Defines the canonical map-country set and player country assignment source for future dynamic economy systems.
-- Player location is intentionally modeled as mutable assignment history so players can immigrate between countries.

create table public.country_profiles (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  country_name text not null unique,
  capital_name text not null,
  currency_code text not null default 'ECO',
  inflation_rate numeric(9, 4) not null default 0,
  cost_of_living_index numeric(9, 4) not null default 1,
  regional_price_multiplier numeric(9, 4) not null default 1,
  supply_constraint_index numeric(9, 4) not null default 1,
  market_risk_index numeric(9, 4) not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint country_profiles_country_code_format check (country_code ~ '^[A-Z][A-Z0-9_]{2,31}$'),
  constraint country_profiles_country_name_not_blank check (length(btrim(country_name)) > 0),
  constraint country_profiles_capital_name_not_blank check (length(btrim(capital_name)) > 0),
  constraint country_profiles_currency_code_format check (currency_code ~ '^[A-Z]{3,8}$'),
  constraint country_profiles_inflation_rate_reasonable check (inflation_rate >= -1 and inflation_rate <= 10),
  constraint country_profiles_cost_of_living_positive check (cost_of_living_index > 0),
  constraint country_profiles_regional_price_multiplier_positive check (regional_price_multiplier > 0),
  constraint country_profiles_supply_constraint_index_positive check (supply_constraint_index > 0),
  constraint country_profiles_market_risk_index_positive check (market_risk_index > 0),
  constraint country_profiles_status_check check (status in ('active', 'disabled', 'archived'))
);

create trigger set_country_profiles_updated_at
before update on public.country_profiles
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.country_profiles is
  'Canonical country/economy profile set for Eco Novaria map countries. Store quote pricing uses the active player country profile as an economic input.';
comment on column public.country_profiles.country_code is
  'Stable backend code for a map country. Not intended for display copy.';
comment on column public.country_profiles.inflation_rate is
  'Current inflation rate used by pricing policy. Example: 0.075 means 7.5%.';
comment on column public.country_profiles.cost_of_living_index is
  'Country cost-of-living index. Neutral baseline is 1.';
comment on column public.country_profiles.regional_price_multiplier is
  'Direct regional price multiplier for store quote pricing. Neutral baseline is 1.';
comment on column public.country_profiles.supply_constraint_index is
  'Supply/scarcity pressure used by store quote pricing. Neutral baseline is 1.';
comment on column public.country_profiles.market_risk_index is
  'Economic risk index reserved for future events, forecasts, and market simulation. Neutral baseline is 1.';

create index country_profiles_status_idx
on public.country_profiles (status);

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
  inflation_rate,
  cost_of_living_index,
  regional_price_multiplier,
  supply_constraint_index,
  market_risk_index,
  metadata
)
values
  ('NORTHREACH', 'Northreach', 'Frostgate', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"northwest","mapColor":"purple"}'::jsonb),
  ('YRETHIA', 'Yrethia', 'Sableport', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"west","mapColor":"blue"}'::jsonb),
  ('THALORIS', 'Thaloris', 'Dusk Harbor', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"southwest","mapColor":"orange"}'::jsonb),
  ('SOLVEND', 'Solvend', 'Aurora Spire', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"north-central","mapColor":"cyan"}'::jsonb),
  ('ELDORAN', 'Eldoran', 'Crescent Bay', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"central","mapColor":"yellow"}'::jsonb),
  ('VALERION', 'Valerion', 'Glassfall', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"south-central","mapColor":"teal"}'::jsonb),
  ('LUMENOR', 'Lumenor', 'Starfall', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"south","mapColor":"blue-white"}'::jsonb),
  ('XALVORIA', 'Xalvoria', 'Emberhall', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"northeast","mapColor":"gold"}'::jsonb),
  ('DRAVENLOK', 'Dravenlok', 'Ironhold', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"east","mapColor":"red"}'::jsonb),
  ('SYNDALIS', 'Syndalis', 'Blacklight', 'ECO', 0, 1, 1, 1, 1, '{"mapRegion":"southeast","mapColor":"violet"}'::jsonb);

alter table public.country_profiles enable row level security;
alter table public.player_country_assignments enable row level security;
alter table public.player_country_migration_events enable row level security;

comment on table public.country_profiles is
  'Backend-owned country/economy source for Eco Novaria. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.player_country_assignments is
  'Backend-owned mutable active player country location source. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.player_country_migration_events is
  'Backend-owned immigration history. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
