-- Eco Novaria country profile pricing foundation V1.
-- Defines the canonical map-country set and player country assignment source for future dynamic economy systems.

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
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_country_assignments_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_country_assignments_status_check check (status in ('active', 'inactive', 'archived'))
);

create trigger set_player_country_assignments_updated_at
before update on public.player_country_assignments
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.player_country_assignments is
  'Current and historical player location/country assignment. The active assignment determines which country profile affects store pricing.';
comment on column public.player_country_assignments.country_profile_id is
  'Country profile used as the active economic input for store quote pricing.';

create unique index player_country_assignments_one_active_idx
on public.player_country_assignments (game_session_id, player_id)
where status = 'active';

create index player_country_assignments_country_profile_idx
on public.player_country_assignments (country_profile_id);

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

comment on table public.country_profiles is
  'Backend-owned country/economy source for Eco Novaria. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.player_country_assignments is
  'Backend-owned active player country location source. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
