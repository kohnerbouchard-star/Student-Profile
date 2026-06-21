-- Add bounded per-game country economic baseline settings V1.
-- These settings back Advanced Settings controls for macroeconomic snapshot inputs such as inflation, unemployment, and interest rates.

create table public.game_country_economic_baseline_settings (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null unique references public.game_sessions (id),
  source text not null default 'default',
  custom_label text null,
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
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint game_country_economic_baseline_settings_source_check check (source in ('default', 'custom')),
  constraint game_country_economic_baseline_settings_custom_label_not_blank check (
    custom_label is null
    or length(btrim(custom_label)) > 0
  ),
  constraint game_country_economic_baseline_settings_custom_has_label check (
    source <> 'custom'
    or custom_label is not null
  ),
  constraint game_country_economic_baseline_settings_real_gdp_range check (real_gdp_index >= 50 and real_gdp_index <= 200),
  constraint game_country_economic_baseline_settings_gdp_growth_range check (gdp_growth_rate >= -0.2500 and gdp_growth_rate <= 0.5000),
  constraint game_country_economic_baseline_settings_inflation_range check (inflation_rate >= -0.1000 and inflation_rate <= 1.0000),
  constraint game_country_economic_baseline_settings_unemployment_range check (unemployment_rate >= 0 and unemployment_rate <= 0.5000),
  constraint game_country_economic_baseline_settings_interest_range check (interest_rate >= -0.0500 and interest_rate <= 0.5000),
  constraint game_country_economic_baseline_settings_consumer_confidence_range check (consumer_confidence_index >= 25 and consumer_confidence_index <= 200),
  constraint game_country_economic_baseline_settings_business_confidence_range check (business_confidence_index >= 25 and business_confidence_index <= 200),
  constraint game_country_economic_baseline_settings_cost_of_living_range check (cost_of_living_index >= 0.5000 and cost_of_living_index <= 2.0000),
  constraint game_country_economic_baseline_settings_regional_price_range check (regional_price_multiplier >= 0.5000 and regional_price_multiplier <= 2.0000),
  constraint game_country_economic_baseline_settings_supply_constraint_range check (supply_constraint_index >= 0.5000 and supply_constraint_index <= 2.0000),
  constraint game_country_economic_baseline_settings_import_dependency_range check (import_dependency_index >= 0.5000 and import_dependency_index <= 2.0000),
  constraint game_country_economic_baseline_settings_tax_rate_range check (tax_rate >= 0 and tax_rate <= 0.5000),
  constraint game_country_economic_baseline_settings_subsidy_rate_range check (subsidy_rate >= 0 and subsidy_rate <= 0.5000),
  constraint game_country_economic_baseline_settings_exchange_rate_range check (exchange_rate_index >= 0.5000 and exchange_rate_index <= 2.0000),
  constraint game_country_economic_baseline_settings_currency_stability_range check (currency_stability_index >= 0.5000 and currency_stability_index <= 2.0000),
  constraint game_country_economic_baseline_settings_trade_balance_range check (trade_balance_index >= -100 and trade_balance_index <= 100),
  constraint game_country_economic_baseline_settings_export_strength_range check (export_strength_index >= 0.5000 and export_strength_index <= 2.0000),
  constraint game_country_economic_baseline_settings_market_risk_range check (market_risk_index >= 0.5000 and market_risk_index <= 2.0000),
  constraint game_country_economic_baseline_settings_political_stability_range check (political_stability_index >= 0.5000 and political_stability_index <= 2.0000),
  constraint game_country_economic_baseline_settings_infrastructure_range check (infrastructure_index >= 0.5000 and infrastructure_index <= 2.0000),
  constraint game_country_economic_baseline_settings_energy_security_range check (energy_security_index >= 0.5000 and energy_security_index <= 2.0000),
  constraint game_country_economic_baseline_settings_status_check check (status in ('active', 'disabled', 'archived')),
  constraint game_country_economic_baseline_settings_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create trigger set_game_country_economic_baseline_settings_updated_at
before update on public.game_country_economic_baseline_settings
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.game_country_economic_baseline_settings is
  'Backend-owned per-game Advanced Settings macroeconomic baseline. These bounded values are used when initializing country_economic_snapshots and prevent outrageous custom inflation, unemployment, interest, tax, or multiplier inputs.';
comment on column public.game_country_economic_baseline_settings.inflation_rate is
  'Starting country inflation rate for initialized snapshots. Example: 0.075 means 7.5%. Bounded from -10% to 100%.';
comment on column public.game_country_economic_baseline_settings.unemployment_rate is
  'Starting unemployment rate for initialized snapshots. Example: 0.08 means 8%. Bounded from 0% to 50%.';
comment on column public.game_country_economic_baseline_settings.interest_rate is
  'Starting interest rate for initialized snapshots. Example: 0.05 means 5%. Bounded from -5% to 50%.';

create index game_country_economic_baseline_settings_status_idx
on public.game_country_economic_baseline_settings (status);

alter table public.game_country_economic_baseline_settings enable row level security;

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
  v_real_gdp_index numeric(10, 4) := 100;
  v_gdp_growth_rate numeric(9, 4) := 0;
  v_inflation_rate numeric(9, 4) := 0;
  v_unemployment_rate numeric(9, 4) := 0.05;
  v_interest_rate numeric(9, 4) := 0.03;
  v_consumer_confidence_index numeric(10, 4) := 100;
  v_business_confidence_index numeric(10, 4) := 100;
  v_cost_of_living_index numeric(9, 4) := 1;
  v_regional_price_multiplier numeric(9, 4) := 1;
  v_supply_constraint_index numeric(9, 4) := 1;
  v_import_dependency_index numeric(9, 4) := 1;
  v_tax_rate numeric(9, 4) := 0;
  v_subsidy_rate numeric(9, 4) := 0;
  v_exchange_rate_index numeric(9, 4) := 1;
  v_currency_stability_index numeric(9, 4) := 1;
  v_trade_balance_index numeric(10, 4) := 0;
  v_export_strength_index numeric(9, 4) := 1;
  v_market_risk_index numeric(9, 4) := 1;
  v_political_stability_index numeric(9, 4) := 1;
  v_infrastructure_index numeric(9, 4) := 1;
  v_energy_security_index numeric(9, 4) := 1;
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

  select
    gebs.real_gdp_index,
    gebs.gdp_growth_rate,
    gebs.inflation_rate,
    gebs.unemployment_rate,
    gebs.interest_rate,
    gebs.consumer_confidence_index,
    gebs.business_confidence_index,
    gebs.cost_of_living_index,
    gebs.regional_price_multiplier,
    gebs.supply_constraint_index,
    gebs.import_dependency_index,
    gebs.tax_rate,
    gebs.subsidy_rate,
    gebs.exchange_rate_index,
    gebs.currency_stability_index,
    gebs.trade_balance_index,
    gebs.export_strength_index,
    gebs.market_risk_index,
    gebs.political_stability_index,
    gebs.infrastructure_index,
    gebs.energy_security_index
  into
    v_real_gdp_index,
    v_gdp_growth_rate,
    v_inflation_rate,
    v_unemployment_rate,
    v_interest_rate,
    v_consumer_confidence_index,
    v_business_confidence_index,
    v_cost_of_living_index,
    v_regional_price_multiplier,
    v_supply_constraint_index,
    v_import_dependency_index,
    v_tax_rate,
    v_subsidy_rate,
    v_exchange_rate_index,
    v_currency_stability_index,
    v_trade_balance_index,
    v_export_strength_index,
    v_market_risk_index,
    v_political_stability_index,
    v_infrastructure_index,
    v_energy_security_index
  from public.game_country_economic_baseline_settings gebs
  where gebs.game_session_id = p_game_session_id
    and gebs.status = 'active';

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
    real_gdp_index,
    gdp_growth_rate,
    inflation_rate,
    unemployment_rate,
    interest_rate,
    consumer_confidence_index,
    business_confidence_index,
    cost_of_living_index,
    regional_price_multiplier,
    supply_constraint_index,
    import_dependency_index,
    tax_rate,
    subsidy_rate,
    exchange_rate_index,
    currency_stability_index,
    trade_balance_index,
    export_strength_index,
    market_risk_index,
    political_stability_index,
    infrastructure_index,
    energy_security_index,
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
    v_real_gdp_index,
    v_gdp_growth_rate,
    v_inflation_rate,
    v_unemployment_rate,
    v_interest_rate,
    v_consumer_confidence_index,
    v_business_confidence_index,
    v_cost_of_living_index,
    v_regional_price_multiplier,
    v_supply_constraint_index,
    v_import_dependency_index,
    v_tax_rate,
    v_subsidy_rate,
    v_exchange_rate_index,
    v_currency_stability_index,
    v_trade_balance_index,
    v_export_strength_index,
    v_market_risk_index,
    v_political_stability_index,
    v_infrastructure_index,
    v_energy_security_index,
    p_request_metadata || jsonb_build_object(
      'initializationSource', 'initialize_country_economic_snapshots_for_game',
      'difficultyPreset', v_difficulty_preset,
      'economicBaselineSource', coalesce((
        select gebs.source
        from public.game_country_economic_baseline_settings gebs
        where gebs.game_session_id = p_game_session_id
          and gebs.status = 'active'
      ), 'default')
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
  'Creates baseline country_economic_snapshots for every active map country in one game session. It resolves difficulty, applies bounded per-game macroeconomic Advanced Settings when present, snapshots those values, and is safe to call repeatedly for the same game/tick.';
