-- Shared bounded Business economy runtime V2.
--
-- One scheduler entry advances due Business work in batches. There are no
-- per-Business cron jobs and every worker is idempotent / SKIP LOCKED aware.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.run_business_economy_tick_v2(
  p_limit integer default 250,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_limit integer := least(2000, greatest(10, coalesce(p_limit, 250)));
  v_research record;
  v_wholesale record;
  v_production record;
  v_payroll record;
  v_retention record;
  v_sales record;
  v_game record;
  v_business record;
  v_week_start date := date_trunc('week', p_now)::date;
  v_prior_week_start timestamptz := date_trunc('week', p_now) - interval '7 days';
  v_current_week_start timestamptz := date_trunc('week', p_now);
  v_replenished integer := 0;
  v_talent_created integer := 0;
  v_talent_expired integer := 0;
  v_valuations integer := 0;
  v_tax_assessments integer := 0;
  v_health integer := 0;
  v_forced integer := 0;
  v_talent record;
begin
  select * into v_research
  from public.complete_due_business_research_v2(v_limit);

  for v_game in
    select distinct business_row.game_session_id
    from public.business_entities as business_row
    where business_row.status <> 'closed'
      and business_row.formation_state in ('operational', 'winding_up')
    order by business_row.game_session_id
    limit 200
  loop
    v_replenished := v_replenished
      + public.replenish_business_wholesale_supply_v2(v_game.game_session_id, v_limit);
  end loop;

  select * into v_wholesale
  from public.complete_due_business_wholesale_orders_v2(v_limit);

  select * into v_production
  from public.complete_due_business_production_v2(v_limit);

  -- Weekly talent markets are game/country scoped. The generator is deterministic
  -- and unique-key protected, so repeated ticks do not reroll candidates.
  for v_game in
    select distinct business_row.game_session_id, business_row.country_code
    from public.business_entities as business_row
    where business_row.status <> 'closed'
      and business_row.formation_state = 'operational'
    order by business_row.game_session_id, business_row.country_code
    limit 500
  loop
    select * into v_talent
    from public.refresh_business_talent_market_v2(
      v_game.game_session_id,
      v_game.country_code,
      v_week_start,
      8
    );
    v_talent_created := v_talent_created + coalesce(v_talent.created, 0);
    v_talent_expired := v_talent_expired + coalesce(v_talent.expired, 0);
  end loop;

  select * into v_payroll
  from public.process_due_business_payroll_v2(v_limit);

  select * into v_retention
  from public.review_business_employee_retention_v2(v_limit);

  -- Daily market settlement is deterministic for the settlement date and guarded
  -- by a unique Business/item/date settlement key.
  select * into v_sales
  from public.settle_business_sales_v2(p_now::date, v_limit);

  -- At most one valuation snapshot per Business per 24 hours.
  for v_business in
    select business_row.game_session_id, business_row.id
    from public.business_entities as business_row
    where business_row.status <> 'closed'
      and business_row.formation_state in ('operational', 'winding_up')
      and not exists (
        select 1
        from public.business_valuation_snapshots_v2 as snapshot_row
        where snapshot_row.game_session_id = business_row.game_session_id
          and snapshot_row.business_id = business_row.id
          and snapshot_row.as_of > p_now - interval '24 hours'
      )
    order by business_row.updated_at, business_row.id
    limit v_limit
  loop
    perform public.calculate_business_valuation_v2(
      v_business.game_session_id,
      v_business.id,
      p_now
    );
    v_valuations := v_valuations + 1;
  end loop;

  -- Assess the prior completed week only when a game/country policy is available.
  -- The assessment table's period uniqueness makes the worker replay-safe.
  for v_business in
    select business_row.game_session_id, business_row.id, business_row.country_code
    from public.business_entities as business_row
    where business_row.status <> 'closed'
      and business_row.formation_state in ('operational', 'winding_up')
      and exists (
        select 1
        from public.business_tax_policies_v2 as policy_row
        where policy_row.game_session_id = business_row.game_session_id
          and policy_row.country_code = business_row.country_code
          and policy_row.status = 'active'
          and policy_row.effective_from <= (v_current_week_start - interval '1 second')::date
      )
      and not exists (
        select 1
        from public.business_tax_assessments_v2 as assessment_row
        where assessment_row.game_session_id = business_row.game_session_id
          and assessment_row.business_id = business_row.id
          and assessment_row.period_start = v_prior_week_start
          and assessment_row.period_end = v_current_week_start
      )
    order by business_row.updated_at, business_row.id
    limit v_limit
  loop
    perform public.assess_business_tax_v2(
      v_business.game_session_id,
      v_business.id,
      v_prior_week_start,
      v_current_week_start
    );
    v_tax_assessments := v_tax_assessments + 1;
  end loop;

  v_health := public.evaluate_business_financial_health_batch_v2(v_limit);
  v_forced := public.begin_forced_business_liquidations_v2(v_limit);

  return jsonb_build_object(
    'ranAt', p_now,
    'limit', v_limit,
    'research', jsonb_build_object(
      'processed', coalesce(v_research.processed, 0),
      'completed', coalesce(v_research.completed, 0),
      'skipped', coalesce(v_research.skipped, 0)
    ),
    'wholesale', jsonb_build_object(
      'replenishedSupplierItems', v_replenished,
      'processedDeliveries', coalesce(v_wholesale.processed, 0),
      'delivered', coalesce(v_wholesale.delivered, 0),
      'skipped', coalesce(v_wholesale.skipped, 0)
    ),
    'production', jsonb_build_object(
      'processed', coalesce(v_production.processed, 0),
      'completed', coalesce(v_production.completed, 0),
      'skipped', coalesce(v_production.skipped, 0)
    ),
    'talentMarket', jsonb_build_object(
      'created', v_talent_created,
      'expired', v_talent_expired
    ),
    'payroll', jsonb_build_object(
      'processed', coalesce(v_payroll.processed, 0),
      'paid', coalesce(v_payroll.paid, 0),
      'missed', coalesce(v_payroll.missed, 0)
    ),
    'retention', jsonb_build_object(
      'reviewed', coalesce(v_retention.reviewed, 0),
      'warnings', coalesce(v_retention.warnings, 0),
      'departures', coalesce(v_retention.departures, 0)
    ),
    'sales', jsonb_build_object(
      'processed', coalesce(v_sales.processed, 0),
      'settled', coalesce(v_sales.settled, 0),
      'unitsSold', coalesce(v_sales.units_sold, 0),
      'revenue', coalesce(v_sales.revenue, 0)
    ),
    'valuationsCreated', v_valuations,
    'taxAssessmentsCreated', v_tax_assessments,
    'financialHealthReviewed', v_health,
    'forcedLiquidationsStarted', v_forced
  );
end
$function$;

revoke all on function public.run_business_economy_tick_v2(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_business_economy_tick_v2(integer, timestamptz)
  to service_role;

commit;
