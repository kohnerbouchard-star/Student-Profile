-- Country economy real-time rules V1.
-- The game is real-time, not round-based. Snapshot rows are historical versions of
-- effective real-time economy state, not player-facing rounds or turns.
--
-- Economy changes are gradual: future runtime advancement must move current values
-- 10% toward target values per update. This rate is fixed in V1 and is not admin-adjustable.
-- Existing snapshots are immutable except metadata merge behavior from initialization;
-- difficulty/economy changes affect future prices and future numbers only.

alter table public.country_economic_snapshots
  rename column simulation_tick to snapshot_sequence;

alter table public.country_economic_snapshots
  add column effective_at timestamptz not null default now();

alter table public.country_economic_snapshots
  drop constraint country_economic_snapshots_tick_nonnegative;

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_sequence_nonnegative check (snapshot_sequence >= 0);

alter table public.country_economic_snapshots
  drop constraint country_economic_snapshots_unique_tick;

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_unique_sequence unique (game_session_id, country_profile_id, snapshot_sequence);

create index country_economic_snapshots_effective_at_idx
on public.country_economic_snapshots (game_session_id, country_profile_id, effective_at desc);

comment on table public.country_economic_snapshots is
  'Per-game, per-country real-time macroeconomic snapshot history. Store pricing should use the latest effective snapshot for the player country rather than global hard-coded multipliers.';
comment on column public.country_economic_snapshots.snapshot_sequence is
  'Internal monotonic economy snapshot version. This is not a gameplay round or turn.';
comment on column public.country_economic_snapshots.effective_at is
  'Real-time timestamp when this economy snapshot becomes effective for future calculations.';

create or replace function public.apply_economy_gradual_adjustment(
  p_current numeric,
  p_target numeric
)
returns numeric
language sql
immutable
as $$
  select p_current + ((p_target - p_current) * 0.1000)
$$;

comment on function public.apply_economy_gradual_adjustment(numeric, numeric) is
  'Moves a current economy value 10% toward its target. This fixed V1 smoothing rate is not admin-adjustable and should only affect future snapshots.';

drop function if exists public.initialize_country_economic_snapshots_for_game(uuid, integer, text, jsonb);

create or replace function public.initialize_country_economic_snapshots_for_game(
  p_game_session_id uuid,
  p_effective_at timestamptz default now(),
  p_snapshot_label text default 'Initial baseline',
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  country_profile_id uuid,
  snapshot_id uuid,
  snapshot_sequence integer,
  effective_at timestamptz
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
  v_economic_baseline_source text := 'default';
begin
  if p_game_session_id is null then
    raise exception 'p_game_session_id is required'
      using errcode = '22023';
  end if;

  if p_effective_at is null then
    raise exception 'p_effective_at is required'
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
    gebs.energy_security_index,
    gebs.source
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
    v_energy_security_index,
    v_economic_baseline_source
  from public.game_country_economic_baseline_settings gebs
  where gebs.game_session_id = p_game_session_id
    and gebs.status = 'active';

  return query
  insert into public.country_economic_snapshots (
    game_session_id,
    country_profile_id,
    snapshot_sequence,
    effective_at,
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
    0,
    p_effective_at,
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
      'economicBaselineSource', v_economic_baseline_source,
      'economyMode', 'real_time',
      'gradualAdjustmentRate', 0.1
    )
  from public.country_profiles cp
  where cp.status = 'active'
  on conflict (game_session_id, country_profile_id, snapshot_sequence) do update
    set metadata = public.country_economic_snapshots.metadata || excluded.metadata
  returning
    public.country_economic_snapshots.country_profile_id,
    public.country_economic_snapshots.id,
    public.country_economic_snapshots.snapshot_sequence,
    public.country_economic_snapshots.effective_at;
end;
$$;

comment on function public.initialize_country_economic_snapshots_for_game(uuid, timestamptz, text, jsonb) is
  'Creates initial real-time country_economic_snapshots for every active map country in one game session. It resolves difficulty, applies bounded per-game macroeconomic Advanced Settings when present, snapshots those values, rejects unconfigured custom difficulty, and never rewrites prior economic history.';
