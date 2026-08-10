begin;

create or replace function public.advance_country_economic_snapshots_for_game_v1(
  p_game_session_id uuid,
  p_effective_at timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_latest_at timestamptz;
  v_inserted integer := 0;
begin
  if p_game_session_id is null or p_effective_at is null then
    raise exception using errcode = '22023', message = 'game session and effective time are required';
  end if;

  if not exists (
    select 1
    from public.game_sessions gs
    where gs.id = p_game_session_id
      and gs.status = 'active'
      and gs.lifecycle_state = 'active'
      and gs.provisioning_status = 'ready'
  ) then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_session_id::text, 260810));

  select max(s.effective_at)
  into v_latest_at
  from public.country_economic_snapshots s
  where s.game_session_id = p_game_session_id;

  if v_latest_at is null then
    perform public.initialize_country_economic_snapshots_for_game(
      p_game_session_id,
      p_effective_at,
      'Initial baseline',
      jsonb_build_object('runtimeSource', 'daily_macro_progression_v1')
    );

    return (
      select count(*)::integer
      from public.country_economic_snapshots s
      where s.game_session_id = p_game_session_id
        and s.snapshot_sequence = 0
    );
  end if;

  if v_latest_at > p_effective_at - interval '24 hours' then
    return 0;
  end if;

  insert into public.game_country_economic_baseline_settings (
    game_session_id,
    source,
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
    status,
    metadata
  )
  with latest as (
    select distinct on (s.country_profile_id) s.*
    from public.country_economic_snapshots s
    where s.game_session_id = p_game_session_id
    order by s.country_profile_id, s.snapshot_sequence desc
  )
  select
    p_game_session_id,
    'default',
    avg(real_gdp_index),
    avg(gdp_growth_rate),
    avg(inflation_rate),
    avg(unemployment_rate),
    avg(interest_rate),
    avg(consumer_confidence_index),
    avg(business_confidence_index),
    avg(cost_of_living_index),
    avg(regional_price_multiplier),
    avg(supply_constraint_index),
    avg(import_dependency_index),
    avg(tax_rate),
    avg(subsidy_rate),
    avg(exchange_rate_index),
    avg(currency_stability_index),
    avg(trade_balance_index),
    avg(export_strength_index),
    avg(market_risk_index),
    avg(political_stability_index),
    avg(infrastructure_index),
    avg(energy_security_index),
    'active',
    jsonb_build_object(
      'runtimeBackfill', true,
      'runtimeSource', 'daily_macro_progression_v1',
      'anchoredAt', p_effective_at
    )
  from latest
  having count(*) > 0
  on conflict (game_session_id) do nothing;

  with latest as (
    select distinct on (s.country_profile_id) s.*
    from public.country_economic_snapshots s
    where s.game_session_id = p_game_session_id
    order by s.country_profile_id, s.snapshot_sequence desc
  ), target as (
    select *
    from public.game_country_economic_baseline_settings b
    where b.game_session_id = p_game_session_id
      and b.status = 'active'
  )
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
    l.game_session_id,
    l.country_profile_id,
    l.snapshot_sequence + 1,
    p_effective_at,
    'Daily macro progression',
    l.difficulty_policy_profile_id,
    l.difficulty_preset,
    l.price_difficulty_modifier,
    l.event_volatility_modifier,
    l.scarcity_difficulty_modifier,
    l.income_difficulty_modifier,
    l.trade_difficulty_modifier,
    l.credit_difficulty_modifier,
    l.real_gdp_index + ((t.real_gdp_index - l.real_gdp_index) * 0.1),
    l.gdp_growth_rate + ((t.gdp_growth_rate - l.gdp_growth_rate) * 0.1),
    l.inflation_rate + ((t.inflation_rate - l.inflation_rate) * 0.1),
    l.unemployment_rate + ((t.unemployment_rate - l.unemployment_rate) * 0.1),
    l.interest_rate + ((t.interest_rate - l.interest_rate) * 0.1),
    l.consumer_confidence_index + ((t.consumer_confidence_index - l.consumer_confidence_index) * 0.1),
    l.business_confidence_index + ((t.business_confidence_index - l.business_confidence_index) * 0.1),
    l.cost_of_living_index + ((t.cost_of_living_index - l.cost_of_living_index) * 0.1),
    l.regional_price_multiplier + ((t.regional_price_multiplier - l.regional_price_multiplier) * 0.1),
    l.supply_constraint_index + ((t.supply_constraint_index - l.supply_constraint_index) * 0.1),
    l.import_dependency_index + ((t.import_dependency_index - l.import_dependency_index) * 0.1),
    l.tax_rate + ((t.tax_rate - l.tax_rate) * 0.1),
    l.subsidy_rate + ((t.subsidy_rate - l.subsidy_rate) * 0.1),
    l.exchange_rate_index + ((t.exchange_rate_index - l.exchange_rate_index) * 0.1),
    l.currency_stability_index + ((t.currency_stability_index - l.currency_stability_index) * 0.1),
    l.trade_balance_index + ((t.trade_balance_index - l.trade_balance_index) * 0.1),
    l.export_strength_index + ((t.export_strength_index - l.export_strength_index) * 0.1),
    l.market_risk_index + ((t.market_risk_index - l.market_risk_index) * 0.1),
    l.political_stability_index + ((t.political_stability_index - l.political_stability_index) * 0.1),
    l.infrastructure_index + ((t.infrastructure_index - l.infrastructure_index) * 0.1),
    l.energy_security_index + ((t.energy_security_index - l.energy_security_index) * 0.1),
    coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
      'runtimeSource', 'daily_macro_progression_v1',
      'previousSnapshotSequence', l.snapshot_sequence,
      'gradualAdjustmentRate', 0.1,
      'targetSource', t.source
    )
  from latest l
  cross join target t
  join public.country_profiles cp
    on cp.id = l.country_profile_id
   and cp.status = 'active'
  on conflict on constraint country_economic_snapshots_unique_sequence do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.run_due_country_economic_snapshot_progression_v1(
  p_now timestamptz default clock_timestamp()
)
returns table(game_session_id uuid, snapshots_inserted integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_game record;
  v_inserted integer;
begin
  if p_now is null then
    raise exception using errcode = '22023', message = 'current time is required';
  end if;

  for v_game in
    select gs.id
    from public.game_sessions gs
    where gs.status = 'active'
      and gs.lifecycle_state = 'active'
      and gs.provisioning_status = 'ready'
    order by gs.id
  loop
    v_inserted := public.advance_country_economic_snapshots_for_game_v1(
      v_game.id,
      p_now
    );
    game_session_id := v_game.id;
    snapshots_inserted := v_inserted;
    return next;
  end loop;
end;
$$;

revoke all on function public.advance_country_economic_snapshots_for_game_v1(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.advance_country_economic_snapshots_for_game_v1(uuid, timestamptz)
  to service_role;

revoke all on function public.run_due_country_economic_snapshot_progression_v1(timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_due_country_economic_snapshot_progression_v1(timestamptz)
  to service_role;

comment on function public.advance_country_economic_snapshots_for_game_v1(uuid, timestamptz) is
  'Appends one historical country macro snapshot per active country when the game has not advanced macro state for at least 24 hours; each value moves 10 percent toward the configured game target.';

comment on function public.run_due_country_economic_snapshot_progression_v1(timestamptz) is
  'Runs guarded daily country macro progression across active, lifecycle-active, provisioning-ready games.';

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'econovaria-daily-macro-progression-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'econovaria-daily-macro-progression-v1',
    '7 * * * *',
    $cron$select * from public.run_due_country_economic_snapshot_progression_v1(clock_timestamp());$cron$
  );
end;
$$;

commit;
