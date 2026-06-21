-- Eco Novaria country profile pricing foundation V1.
-- Defines the canonical map-country set and player country assignment source for future dynamic economy systems.
-- Player location is intentionally modeled as mutable assignment history so players can immigrate between countries.
-- Difficulty is modeled as global preset policies plus per-game Advanced Settings overrides, then snapshotted into country economic history.
-- Custom difficulty is not a selectable global preset; it is inferred when per-game Advanced Settings values diverge from a preset.

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
  constraint country_profiles_status_check check (status in ('active', 'disabled', 'archived')),
  constraint country_profiles_metadata_object check (jsonb_typeof(metadata) = 'object')
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

create table public.difficulty_policy_profiles (
  id uuid primary key default gen_random_uuid(),
  preset_key text not null unique,
  label text not null,
  description text null,
  price_modifier numeric(9, 4) not null default 1,
  event_volatility_modifier numeric(9, 4) not null default 1,
  scarcity_modifier numeric(9, 4) not null default 1,
  income_modifier numeric(9, 4) not null default 1,
  trade_modifier numeric(9, 4) not null default 1,
  credit_modifier numeric(9, 4) not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint difficulty_policy_profiles_preset_key_format check (preset_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint difficulty_policy_profiles_no_custom_preset check (preset_key <> 'custom'),
  constraint difficulty_policy_profiles_label_not_blank check (length(btrim(label)) > 0),
  constraint difficulty_policy_profiles_description_not_blank check (
    description is null
    or length(btrim(description)) > 0
  ),
  constraint difficulty_policy_profiles_price_positive check (price_modifier > 0),
  constraint difficulty_policy_profiles_event_volatility_positive check (event_volatility_modifier > 0),
  constraint difficulty_policy_profiles_scarcity_positive check (scarcity_modifier > 0),
  constraint difficulty_policy_profiles_income_positive check (income_modifier > 0),
  constraint difficulty_policy_profiles_trade_positive check (trade_modifier > 0),
  constraint difficulty_policy_profiles_credit_positive check (credit_modifier > 0),
  constraint difficulty_policy_profiles_status_check check (status in ('active', 'disabled', 'archived')),
  constraint difficulty_policy_profiles_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create trigger set_difficulty_policy_profiles_updated_at
before update on public.difficulty_policy_profiles
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.difficulty_policy_profiles is
  'Global selectable difficulty policy presets used as defaults for game setup. Custom is not stored here; it is inferred from per-game Advanced Settings overrides. Runtime pricing should consume resolved modifiers from country_economic_snapshots, not this table directly.';
comment on column public.difficulty_policy_profiles.price_modifier is
  'Difficulty modifier for store prices and purchase quotes.';
comment on column public.difficulty_policy_profiles.event_volatility_modifier is
  'Difficulty modifier for country event/shock magnitude.';
comment on column public.difficulty_policy_profiles.scarcity_modifier is
  'Difficulty modifier for scarcity, supply, and item availability pressure.';
comment on column public.difficulty_policy_profiles.income_modifier is
  'Difficulty modifier for future wages, rewards, stipends, and income-like payouts.';
comment on column public.difficulty_policy_profiles.trade_modifier is
  'Difficulty modifier reserved for future trade and import/export pressure.';
comment on column public.difficulty_policy_profiles.credit_modifier is
  'Difficulty modifier reserved for future borrowing, credit, and financing pressure.';

create index difficulty_policy_profiles_status_idx
on public.difficulty_policy_profiles (status);

create table public.game_difficulty_policy_settings (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null unique references public.game_sessions (id),
  difficulty_policy_profile_id uuid null references public.difficulty_policy_profiles (id),
  difficulty_preset text not null default 'standard',
  custom_label text null,
  source text not null default 'preset',
  price_modifier numeric(9, 4) not null default 1,
  event_volatility_modifier numeric(9, 4) not null default 1,
  scarcity_modifier numeric(9, 4) not null default 1,
  income_modifier numeric(9, 4) not null default 1,
  trade_modifier numeric(9, 4) not null default 1,
  credit_modifier numeric(9, 4) not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint game_difficulty_policy_settings_preset_not_blank check (length(btrim(difficulty_preset)) > 0),
  constraint game_difficulty_policy_settings_custom_label_not_blank check (
    custom_label is null
    or length(btrim(custom_label)) > 0
  ),
  constraint game_difficulty_policy_settings_source_check check (source in ('preset', 'custom')),
  constraint game_difficulty_policy_settings_preset_has_profile check (
    source <> 'preset'
    or difficulty_policy_profile_id is not null
  ),
  constraint game_difficulty_policy_settings_preset_not_custom check (
    source <> 'preset'
    or difficulty_preset <> 'custom'
  ),
  constraint game_difficulty_policy_settings_custom_has_no_profile check (
    source <> 'custom'
    or difficulty_policy_profile_id is null
  ),
  constraint game_difficulty_policy_settings_custom_uses_custom_preset check (
    source <> 'custom'
    or difficulty_preset = 'custom'
  ),
  constraint game_difficulty_policy_settings_custom_has_label check (
    source <> 'custom'
    or custom_label is not null
  ),
  constraint game_difficulty_policy_settings_price_positive check (price_modifier > 0),
  constraint game_difficulty_policy_settings_event_volatility_positive check (event_volatility_modifier > 0),
  constraint game_difficulty_policy_settings_scarcity_positive check (scarcity_modifier > 0),
  constraint game_difficulty_policy_settings_income_positive check (income_modifier > 0),
  constraint game_difficulty_policy_settings_trade_positive check (trade_modifier > 0),
  constraint game_difficulty_policy_settings_credit_positive check (credit_modifier > 0),
  constraint game_difficulty_policy_settings_status_check check (status in ('active', 'disabled', 'archived')),
  constraint game_difficulty_policy_settings_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create trigger set_game_difficulty_policy_settings_updated_at
before update on public.game_difficulty_policy_settings
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.game_difficulty_policy_settings is
  'Per-game selected or custom Advanced Settings difficulty policy. If a teacher changes a modifier, source becomes custom and these resolved values are saved for that game.';
comment on column public.game_difficulty_policy_settings.source is
  'preset means copied from a global difficulty_policy_profiles row. custom means teacher-defined Advanced Settings values inferred from edited modifiers.';

create index game_difficulty_policy_settings_status_idx
on public.game_difficulty_policy_settings (status);

create table public.country_economic_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  country_profile_id uuid not null references public.country_profiles (id),
  simulation_tick integer not null default 0,
  snapshot_label text null,
  difficulty_policy_profile_id uuid null references public.difficulty_policy_profiles (id),
  difficulty_preset text not null default 'standard',
  price_difficulty_modifier numeric(9, 4) not null default 1,
  event_volatility_modifier numeric(9, 4) not null default 1,
  scarcity_difficulty_modifier numeric(9, 4) not null default 1,
  income_difficulty_modifier numeric(9, 4) not null default 1,
  trade_difficulty_modifier numeric(9, 4) not null default 1,
  credit_difficulty_modifier numeric(9, 4) not null default 1,
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
  constraint country_economic_snapshots_difficulty_preset_not_blank check (length(btrim(difficulty_preset)) > 0),
  constraint country_economic_snapshots_price_difficulty_positive check (price_difficulty_modifier > 0),
  constraint country_economic_snapshots_event_volatility_positive check (event_volatility_modifier > 0),
  constraint country_economic_snapshots_scarcity_difficulty_positive check (scarcity_difficulty_modifier > 0),
  constraint country_economic_snapshots_income_difficulty_positive check (income_difficulty_modifier > 0),
  constraint country_economic_snapshots_trade_difficulty_positive check (trade_difficulty_modifier > 0),
  constraint country_economic_snapshots_credit_difficulty_positive check (credit_difficulty_modifier > 0),
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
  constraint country_economic_snapshots_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint country_economic_snapshots_unique_tick unique (game_session_id, country_profile_id, simulation_tick),
  constraint country_economic_snapshots_scope_unique unique (id, game_session_id, country_profile_id)
);

comment on table public.country_economic_snapshots is
  'Per-game, per-country macroeconomic snapshot history. Store pricing should use the latest active snapshot for the player country rather than global hard-coded multipliers.';
comment on column public.country_economic_snapshots.simulation_tick is
  'Game round/tick for this economic state. One country can have one snapshot per tick per game session.';
comment on column public.country_economic_snapshots.difficulty_policy_profile_id is
  'Global preset used to resolve this snapshot, if any. Null is allowed for custom per-game Advanced Settings.';
comment on column public.country_economic_snapshots.price_difficulty_modifier is
  'Resolved difficulty modifier for store prices and purchase quotes. Runtime pricing should read this snapshot value.';
comment on column public.country_economic_snapshots.event_volatility_modifier is
  'Resolved difficulty modifier for country event/shock magnitude.';
comment on column public.country_economic_snapshots.scarcity_difficulty_modifier is
  'Resolved difficulty modifier for scarcity, supply, and item availability pressure.';
comment on column public.country_economic_snapshots.income_difficulty_modifier is
  'Resolved difficulty modifier for future wages, rewards, stipends, and income-like payouts.';
comment on column public.country_economic_snapshots.trade_difficulty_modifier is
  'Resolved difficulty modifier reserved for future trade and import/export pressure.';
comment on column public.country_economic_snapshots.credit_difficulty_modifier is
  'Resolved difficulty modifier reserved for future borrowing, credit, and financing pressure.';
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
  source_snapshot_id uuid null,
  result_snapshot_id uuid null,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint country_event_impacts_source_snapshot_scope_fk
    foreign key (source_snapshot_id, game_session_id, country_profile_id)
    references public.country_economic_snapshots (id, game_session_id, country_profile_id),
  constraint country_event_impacts_result_snapshot_scope_fk
    foreign key (result_snapshot_id, game_session_id, country_profile_id)
    references public.country_economic_snapshots (id, game_session_id, country_profile_id),
  constraint country_event_impacts_event_key_not_blank check (length(btrim(event_key)) > 0),
  constraint country_event_impacts_event_name_not_blank check (length(btrim(event_name)) > 0),
  constraint country_event_impacts_event_type_not_blank check (length(btrim(event_type)) > 0),
  constraint country_event_impacts_impact_summary_not_blank check (length(btrim(impact_summary)) > 0),
  constraint country_event_impacts_stat_deltas_object check (jsonb_typeof(stat_deltas) = 'object'),
  constraint country_event_impacts_snapshot_changed check (
    source_snapshot_id is null
    or result_snapshot_id is null
    or source_snapshot_id <> result_snapshot_id
  )
);

comment on table public.country_event_impacts is
  'Append-only event-impact log explaining why a country macroeconomic profile changed during a game session. Snapshot references are constrained to the same game session and country.';
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
  ),
  constraint player_country_assignments_scope_unique unique (id, game_session_id, player_id, country_profile_id)
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
  from_assignment_id uuid null,
  to_assignment_id uuid not null,
  migration_reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  migrated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint player_country_migration_events_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_country_migration_events_from_assignment_scope_fk
    foreign key (from_assignment_id, game_session_id, player_id, from_country_profile_id)
    references public.player_country_assignments (id, game_session_id, player_id, country_profile_id),
  constraint player_country_migration_events_to_assignment_scope_fk
    foreign key (to_assignment_id, game_session_id, player_id, to_country_profile_id)
    references public.player_country_assignments (id, game_session_id, player_id, country_profile_id),
  constraint player_country_migration_events_reason_not_blank check (length(btrim(migration_reason)) > 0),
  constraint player_country_migration_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
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
  'Append-only audit trail for player immigration/location changes between Eco Novaria countries. Assignment references are constrained to the same game session and player.';
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

insert into public.difficulty_policy_profiles (
  preset_key,
  label,
  description,
  price_modifier,
  event_volatility_modifier,
  scarcity_modifier,
  income_modifier,
  trade_modifier,
  credit_modifier,
  metadata
)
values
  ('easy', 'Easy', 'Lower prices, gentler events, lower scarcity, and higher income scaling.', 0.9000, 0.7500, 0.8500, 1.1500, 0.9000, 0.9000, '{"advancedSettingsEditable":false}'::jsonb),
  ('standard', 'Standard', 'Neutral baseline difficulty policy.', 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, '{"advancedSettingsEditable":false}'::jsonb),
  ('moderate', 'Moderate', 'Slightly higher prices, volatility, scarcity, trade pressure, and credit pressure.', 1.0800, 1.1000, 1.0800, 0.9500, 1.0800, 1.0800, '{"advancedSettingsEditable":false}'::jsonb),
  ('hard', 'Hard', 'Higher prices, stronger event shocks, stronger scarcity, and lower income scaling.', 1.1800, 1.2500, 1.2000, 0.9000, 1.1800, 1.1800, '{"advancedSettingsEditable":false}'::jsonb),
  ('insane', 'Insane', 'Maximum intended challenge with sharp prices, volatile events, heavy scarcity, and reduced income scaling.', 1.3500, 1.5000, 1.4000, 0.8000, 1.3500, 1.3500, '{"advancedSettingsEditable":false}'::jsonb);

create or replace function public.initialize_country_economic_snapshots_for_game(
  p_game_session_id uuid,
  p_simulation_tick integer default 0,
  p_snapshot_label text default 'Initial baseline',
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  country_profile_id uuid,
  snapshot_id uuid,
  simulation_tick integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_difficulty_preset text;
  v_policy_profile_id uuid;
  v_difficulty_preset text;
  v_price_modifier numeric(9, 4);
  v_event_volatility_modifier numeric(9, 4);
  v_scarcity_modifier numeric(9, 4);
  v_income_modifier numeric(9, 4);
  v_trade_modifier numeric(9, 4);
  v_credit_modifier numeric(9, 4);
begin
  if p_game_session_id is null then
    raise exception 'p_game_session_id is required'
      using errcode = '22023';
  end if;

  if p_simulation_tick is null or p_simulation_tick < 0 then
    raise exception 'p_simulation_tick must be non-negative'
      using errcode = '22023';
  end if;

  if p_snapshot_label is not null and length(btrim(p_snapshot_label)) = 0 then
    raise exception 'p_snapshot_label must not be blank'
      using errcode = '22023';
  end if;

  if p_request_metadata is null or jsonb_typeof(p_request_metadata) <> 'object' then
    raise exception 'p_request_metadata must be a JSON object'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.game_sessions gs
    where gs.id = p_game_session_id
  ) then
    raise exception 'game session not found'
      using errcode = 'P0002';
  end if;

  select
    gdps.difficulty_policy_profile_id,
    gdps.difficulty_preset,
    gdps.price_modifier,
    gdps.event_volatility_modifier,
    gdps.scarcity_modifier,
    gdps.income_modifier,
    gdps.trade_modifier,
    gdps.credit_modifier
  into
    v_policy_profile_id,
    v_difficulty_preset,
    v_price_modifier,
    v_event_volatility_modifier,
    v_scarcity_modifier,
    v_income_modifier,
    v_trade_modifier,
    v_credit_modifier
  from public.game_difficulty_policy_settings gdps
  where gdps.game_session_id = p_game_session_id
    and gdps.status = 'active';

  if v_difficulty_preset is null then
    select coalesce(gs.difficulty_preset, 'standard')
    into v_game_difficulty_preset
    from public.game_settings gs
    where gs.game_session_id = p_game_session_id;

    if lower(coalesce(v_game_difficulty_preset, 'standard')) = 'custom' then
      raise exception 'custom difficulty settings must be configured before initializing country economic snapshots'
        using errcode = '22023';
    end if;

    select
      dpp.id,
      dpp.preset_key,
      dpp.price_modifier,
      dpp.event_volatility_modifier,
      dpp.scarcity_modifier,
      dpp.income_modifier,
      dpp.trade_modifier,
      dpp.credit_modifier
    into
      v_policy_profile_id,
      v_difficulty_preset,
      v_price_modifier,
      v_event_volatility_modifier,
      v_scarcity_modifier,
      v_income_modifier,
      v_trade_modifier,
      v_credit_modifier
    from public.difficulty_policy_profiles dpp
    where dpp.preset_key = lower(coalesce(v_game_difficulty_preset, 'standard'))
      and dpp.status = 'active';
  end if;

  if v_difficulty_preset is null then
    select
      dpp.id,
      dpp.preset_key,
      dpp.price_modifier,
      dpp.event_volatility_modifier,
      dpp.scarcity_modifier,
      dpp.income_modifier,
      dpp.trade_modifier,
      dpp.credit_modifier
    into
      v_policy_profile_id,
      v_difficulty_preset,
      v_price_modifier,
      v_event_volatility_modifier,
      v_scarcity_modifier,
      v_income_modifier,
      v_trade_modifier,
      v_credit_modifier
    from public.difficulty_policy_profiles dpp
    where dpp.preset_key = 'standard'
      and dpp.status = 'active';
  end if;

  if v_difficulty_preset is null then
    raise exception 'active difficulty policy not found'
      using errcode = 'P0002';
  end if;

  return query
  insert into public.country_economic_snapshots (
    game_session_id,
    country_profile_id,
    simulation_tick,
    snapshot_label,
    difficulty_policy_profile_id,
    difficulty_preset,
    price_difficulty_modifier,
    event_volatility_modifier,
    scarcity_difficulty_modifier,
    income_difficulty_modifier,
    trade_difficulty_modifier,
    credit_difficulty_modifier,
    metadata
  )
  select
    p_game_session_id,
    cp.id,
    p_simulation_tick,
    p_snapshot_label,
    v_policy_profile_id,
    v_difficulty_preset,
    v_price_modifier,
    v_event_volatility_modifier,
    v_scarcity_modifier,
    v_income_modifier,
    v_trade_modifier,
    v_credit_modifier,
    p_request_metadata || jsonb_build_object(
      'initializationSource', 'initialize_country_economic_snapshots_for_game',
      'difficultyPreset', v_difficulty_preset
    )
  from public.country_profiles cp
  where cp.status = 'active'
  on conflict (game_session_id, country_profile_id, simulation_tick) do update
    set metadata = public.country_economic_snapshots.metadata || excluded.metadata
  returning
    public.country_economic_snapshots.country_profile_id,
    public.country_economic_snapshots.id,
    public.country_economic_snapshots.simulation_tick;
end;
$$;

comment on function public.initialize_country_economic_snapshots_for_game(uuid, integer, text, jsonb) is
  'Creates neutral baseline country_economic_snapshots for every active map country in one game session. It resolves difficulty from game_difficulty_policy_settings first, then game_settings/difficulty_policy_profiles, snapshots those modifiers, rejects unconfigured custom difficulty, and is safe to call repeatedly for the same game/tick.';

alter table public.country_profiles enable row level security;
alter table public.difficulty_policy_profiles enable row level security;
alter table public.game_difficulty_policy_settings enable row level security;
alter table public.country_economic_snapshots enable row level security;
alter table public.country_event_impacts enable row level security;
alter table public.player_country_assignments enable row level security;
alter table public.player_country_migration_events enable row level security;

comment on table public.country_profiles is
  'Backend-owned country identity source for Eco Novaria. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.difficulty_policy_profiles is
  'Backend-owned global selectable difficulty preset source. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.game_difficulty_policy_settings is
  'Backend-owned per-game Advanced Settings difficulty policy. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.country_economic_snapshots is
  'Backend-owned per-game macroeconomic country history. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.country_event_impacts is
  'Backend-owned country economic event history. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.player_country_assignments is
  'Backend-owned mutable active player country location source. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
comment on table public.player_country_migration_events is
  'Backend-owned immigration history. RLS is enabled; trusted service-role routes own reads/writes until explicit player-safe policies are designed.';
