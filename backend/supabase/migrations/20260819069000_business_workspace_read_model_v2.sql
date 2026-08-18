-- Bounded Player Business workspace read model V2.
--
-- One server-side read model supplies the Player Business workspace. It exposes
-- public keys/identifiers only, never ownership UUIDs, and never asks the browser
-- to derive authoritative economics.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.get_player_business_workspace_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_result jsonb;
  v_entity_options jsonb;
  v_formations jsonb;
  v_cash numeric := 0;
  v_financials jsonb := '{}'::jsonb;
  v_latest_valuation jsonb := null;
  v_ownership jsonb := '[]'::jsonb;
  v_recipes jsonb := '[]'::jsonb;
  v_research jsonb := '[]'::jsonb;
  v_wholesale jsonb := '[]'::jsonb;
  v_equipment jsonb := '[]'::jsonb;
  v_production jsonb := '[]'::jsonb;
  v_talent jsonb := '[]'::jsonb;
  v_workforce jsonb := '[]'::jsonb;
  v_sales jsonb := '[]'::jsonb;
  v_governance jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_activity jsonb := '[]'::jsonb;
  v_tax jsonb := '[]'::jsonb;
  v_liquidation jsonb := null;
  v_alerts jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.id = p_player_id
      and player_row.status = 'active'
  ) then
    raise exception 'PLAYER_NOT_FOUND_OR_INACTIVE' using errcode = 'P0001';
  end if;

  v_entity_options := jsonb_build_array(
    jsonb_build_object(
      'entityType', 'sole_proprietorship',
      'label', 'Sole Proprietorship',
      'owners', '1',
      'liability', 'Personal exposure',
      'tax', 'Pass-through',
      'ownership', 'Owner',
      'outsideEquity', false,
      'complexity', 'Low',
      'formationFee', public.business_formation_fee_v2(p_game_session_id, 'sole_proprietorship')
    ),
    jsonb_build_object(
      'entityType', 'partnership',
      'label', 'Partnership',
      'owners', '2+',
      'liability', 'Higher owner exposure',
      'tax', 'Pass-through',
      'ownership', 'Partnership interests',
      'outsideEquity', true,
      'complexity', 'Low / Medium',
      'formationFee', public.business_formation_fee_v2(p_game_session_id, 'partnership')
    ),
    jsonb_build_object(
      'entityType', 'llc',
      'label', 'LLC',
      'owners', '1+',
      'liability', 'Limited',
      'tax', 'Pass-through by default',
      'ownership', 'Membership interests',
      'outsideEquity', true,
      'complexity', 'Medium',
      'formationFee', public.business_formation_fee_v2(p_game_session_id, 'llc')
    ),
    jsonb_build_object(
      'entityType', 'c_corporation',
      'label', 'C Corporation',
      'owners', 'Shareholders',
      'liability', 'Limited',
      'tax', 'Corporate + possible distribution tax',
      'ownership', 'Shares',
      'outsideEquity', true,
      'complexity', 'Higher',
      'formationFee', public.business_formation_fee_v2(p_game_session_id, 'c_corporation')
    )
  );

  select coalesce(jsonb_agg(item order by item ->> 'createdAt' desc), '[]'::jsonb)
  into v_formations
  from (
    select jsonb_build_object(
      'formationKey', proposal_row.public_key,
      'legalName', proposal_row.legal_name,
      'entityType', proposal_row.entity_type,
      'industryCode', proposal_row.industry_code,
      'status', proposal_row.status,
      'formationFee', proposal_row.formation_fee,
      'totalCapitalization', proposal_row.total_capitalization,
      'createdAt', proposal_row.created_at,
      'expiresAt', proposal_row.expires_at,
      'isProposer', proposal_row.proposer_player_id = p_player_id,
      'myDecision', owner_row.decision,
      'owners', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'playerIdentifier', coalesce(
            to_jsonb(player_row) ->> 'player_identifier',
            to_jsonb(player_row) ->> 'player_identifier_normalized'
          ),
          'ownershipBasisPoints', proposed_row.ownership_basis_points,
          'capitalContribution', proposed_row.capital_contribution,
          'decision', proposed_row.decision
        ) order by proposed_row.ownership_basis_points desc), '[]'::jsonb)
        from public.business_formation_proposal_owners as proposed_row
        join public.players as player_row
          on player_row.game_session_id = proposed_row.game_session_id
         and player_row.id = proposed_row.player_id
        where proposed_row.game_session_id = proposal_row.game_session_id
          and proposed_row.proposal_id = proposal_row.id
      )
    ) as item
    from public.business_formation_proposals as proposal_row
    join public.business_formation_proposal_owners as owner_row
      on owner_row.game_session_id = proposal_row.game_session_id
     and owner_row.proposal_id = proposal_row.id
     and owner_row.player_id = p_player_id
    where proposal_row.game_session_id = p_game_session_id
      and proposal_row.status in ('pending_approval', 'approved', 'rejected', 'activated', 'cancelled', 'expired')
    order by proposal_row.created_at desc
    limit 20
  ) as formation_items;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  join public.business_ownership_positions as position_row
    on position_row.game_session_id = business_row.game_session_id
   and position_row.business_id = business_row.id
   and position_row.player_id = p_player_id
   and position_row.status = 'active'
  where business_row.game_session_id = p_game_session_id
    and business_row.status <> 'closed'
  order by business_row.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'schemaVersion', 2,
      'mode', 'formation',
      'entityOptions', v_entity_options,
      'formations', v_formations,
      'business', null,
      'alerts', jsonb_build_array(
        jsonb_build_object(
          'severity', 'info',
          'code', 'business_not_formed',
          'message', 'Choose a legal structure and complete the ownership agreement to begin operating.'
        )
      )
    );
  end if;

  perform public.ensure_business_starter_recipe_unlocks_v2(
    p_game_session_id,
    v_business.id
  );

  v_cash := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );
  v_financials := public.business_period_financials_v2(
    p_game_session_id,
    v_business.id,
    now() - interval '30 days',
    now()
  );

  select jsonb_build_object(
    'valuationKey', snapshot_row.public_key,
    'valuation', snapshot_row.valuation,
    'change', snapshot_row.change_amount,
    'asOf', snapshot_row.as_of,
    'breakdown', snapshot_row.breakdown,
    'reasons', snapshot_row.reasons,
    'shareValue', case
      when v_business.entity_type = 'c_corporation'
        then public.business_corporate_share_value_v2(p_game_session_id, v_business.id)
      else null
    end
  )
  into v_latest_valuation
  from public.business_valuation_snapshots_v2 as snapshot_row
  where snapshot_row.game_session_id = p_game_session_id
    and snapshot_row.business_id = v_business.id
  order by snapshot_row.as_of desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'playerIdentifier', coalesce(
      to_jsonb(player_row) ->> 'player_identifier',
      to_jsonb(player_row) ->> 'player_identifier_normalized'
    ),
    'ownershipKind', position_row.ownership_kind,
    'units', position_row.units,
    'votingUnits', position_row.voting_units,
    'ownershipBasisPoints', floor(position_row.units * 10000.0 / totals.total_units)::integer,
    'votingBasisPoints', floor(position_row.voting_units * 10000.0 / totals.total_voting_units)::integer,
    'effectiveAt', position_row.effective_at,
    'isMe', position_row.player_id = p_player_id
  ) order by position_row.units desc, player_row.id), '[]'::jsonb)
  into v_ownership
  from public.business_ownership_positions as position_row
  join public.players as player_row
    on player_row.game_session_id = position_row.game_session_id
   and player_row.id = position_row.player_id
  cross join lateral (
    select
      greatest(1, sum(active_row.units)) as total_units,
      greatest(1, sum(active_row.voting_units)) as total_voting_units
    from public.business_ownership_positions as active_row
    where active_row.game_session_id = p_game_session_id
      and active_row.business_id = v_business.id
      and active_row.status = 'active'
  ) as totals
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'recipeKey', recipe_row.public_key,
    'canonicalKey', recipe_row.canonical_key,
    'outputItemKey', item_row.public_key,
    'outputItemName', coalesce(to_jsonb(item_row) ->> 'name', to_jsonb(item_row) ->> 'item_name', recipe_row.canonical_key),
    'batchSize', recipe_row.batch_size,
    'productionDurationMinutes', recipe_row.production_duration_minutes,
    'researchFee', recipe_row.research_fee,
    'researchDurationHours', recipe_row.research_duration_hours,
    'starter', recipe_row.is_starter,
    'unlocked', unlock_row.id is not null,
    'unlockedAt', unlock_row.unlocked_at,
    'inputs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'itemKey', input_item.public_key,
        'itemName', coalesce(to_jsonb(input_item) ->> 'name', to_jsonb(input_item) ->> 'item_name', input_item.public_key),
        'quantityPerBatch', input_row.quantity_per_batch
      ) order by input_item.public_key), '[]'::jsonb)
      from public.business_recipe_inputs as input_row
      join public.game_items as input_item
        on input_item.game_session_id = input_row.game_session_id
       and input_item.id = input_row.input_game_item_id
      where input_row.game_session_id = p_game_session_id
        and input_row.recipe_id = recipe_row.id
    )
  ) order by recipe_row.is_starter desc, recipe_row.canonical_key), '[]'::jsonb)
  into v_recipes
  from public.business_recipe_definitions as recipe_row
  join public.game_items as item_row
    on item_row.game_session_id = recipe_row.game_session_id
   and item_row.id = recipe_row.output_game_item_id
  left join public.business_recipe_unlocks as unlock_row
    on unlock_row.game_session_id = recipe_row.game_session_id
   and unlock_row.business_id = v_business.id
   and unlock_row.recipe_id = recipe_row.id
  where recipe_row.game_session_id = p_game_session_id
    and recipe_row.industry_code = v_business.industry_code
    and recipe_row.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'projectKey', project_row.public_key,
    'recipeKey', recipe_row.public_key,
    'status', project_row.status,
    'feeCharged', project_row.fee_charged,
    'startedAt', project_row.started_at,
    'completionAt', project_row.completion_at,
    'completedAt', project_row.completed_at
  ) order by project_row.created_at desc), '[]'::jsonb)
  into v_research
  from public.business_research_projects as project_row
  join public.business_recipe_definitions as recipe_row
    on recipe_row.game_session_id = project_row.game_session_id
   and recipe_row.id = project_row.recipe_id
  where project_row.game_session_id = p_game_session_id
    and project_row.business_id = v_business.id
  limit 50;

  select coalesce(jsonb_agg(jsonb_build_object(
    'supplierItemKey', supplier_item.public_key,
    'supplierKey', supplier_row.public_key,
    'supplierName', supplier_row.display_name,
    'itemKey', item_row.public_key,
    'itemName', coalesce(to_jsonb(item_row) ->> 'name', to_jsonb(item_row) ->> 'item_name', item_row.public_key),
    'normalUnitPrice', quote_row.normal_unit_price,
    'todayUnitPrice', quote_row.quoted_unit_price,
    'discountPremiumBasisPoints', quote_row.discount_premium_basis_points,
    'supplierInventory', quote_row.available_quantity,
    'leadTimeHours', quote_row.lead_time_hours,
    'minimumOrderQuantity', supplier_item.minimum_order_quantity,
    'maximumOrderQuantity', least(supplier_item.maximum_order_quantity, quote_row.available_quantity),
    'status', supplier_item.status
  ) order by item_row.public_key, quote_row.quoted_unit_price), '[]'::jsonb)
  into v_wholesale
  from public.business_wholesale_supplier_items as supplier_item
  join public.business_wholesale_suppliers as supplier_row
    on supplier_row.game_session_id = supplier_item.game_session_id
   and supplier_row.id = supplier_item.supplier_id
  join public.game_items as item_row
    on item_row.game_session_id = supplier_item.game_session_id
   and item_row.id = supplier_item.game_item_id
  cross join lateral public.business_wholesale_quote_v2(
    p_game_session_id,
    supplier_item.id,
    current_date
  ) as quote_row
  where supplier_item.game_session_id = p_game_session_id
    and supplier_item.status in ('active', 'constrained')
    and supplier_row.status in ('active', 'constrained')
    and supplier_row.country_code = v_business.country_code;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assetKey', asset_row.public_key,
    'equipmentProfileKey', profile_row.public_key,
    'itemKey', item_row.public_key,
    'itemName', coalesce(to_jsonb(item_row) ->> 'name', to_jsonb(item_row) ->> 'item_name', item_row.public_key),
    'capabilityKey', profile_row.capability_key,
    'baseCapacity', profile_row.capacity_units,
    'effectiveCondition', public.business_equipment_effective_condition_v2(asset_row.id, now()),
    'maintenanceCost', profile_row.maintenance_cost,
    'maintenanceDueAt', asset_row.maintenance_due_at,
    'status', asset_row.status
  ) order by asset_row.status, asset_row.maintenance_due_at), '[]'::jsonb)
  into v_equipment
  from public.business_equipment_assets as asset_row
  join public.business_equipment_profiles as profile_row
    on profile_row.game_session_id = asset_row.game_session_id
   and profile_row.id = asset_row.equipment_profile_id
  join public.game_items as item_row
    on item_row.game_session_id = profile_row.game_session_id
   and item_row.id = profile_row.game_item_id
  where asset_row.game_session_id = p_game_session_id
    and asset_row.business_id = v_business.id
    and asset_row.status <> 'retired';

  select coalesce(jsonb_agg(jsonb_build_object(
    'jobKey', job_row.public_key,
    'recipeKey', recipe_row.public_key,
    'outputItemKey', item_row.public_key,
    'outputItemName', coalesce(to_jsonb(item_row) ->> 'name', to_jsonb(item_row) ->> 'item_name', item_row.public_key),
    'quantity', job_row.requested_output_quantity,
    'status', job_row.status,
    'startedAt', job_row.started_at,
    'completionAt', job_row.completion_at,
    'completedAt', job_row.completed_at
  ) order by job_row.created_at desc), '[]'::jsonb)
  into v_production
  from public.business_production_jobs_v2 as job_row
  join public.business_recipe_definitions as recipe_row
    on recipe_row.game_session_id = job_row.game_session_id
   and recipe_row.id = job_row.recipe_id
  join public.game_items as item_row
    on item_row.game_session_id = recipe_row.game_session_id
   and item_row.id = recipe_row.output_game_item_id
  where job_row.game_session_id = p_game_session_id
    and job_row.business_id = v_business.id
  limit 50;

  select coalesce(jsonb_agg(jsonb_build_object(
    'candidateKey', candidate_row.public_key,
    'name', candidate_row.display_name,
    'roleKey', role_row.role_key,
    'roleName', role_row.display_name,
    'primaryStat', role_row.primary_stat,
    'primaryStatValue', public.business_candidate_stat_v2(candidate_row, role_row.primary_stat),
    'secondaryStat', role_row.secondary_stat,
    'secondaryStatValue', case
      when role_row.secondary_stat is null then null
      else public.business_candidate_stat_v2(candidate_row, role_row.secondary_stat)
    end,
    'reliability', candidate_row.reliability,
    'experienceYears', candidate_row.experience_years,
    'expectedWage', candidate_row.expected_wage
  ) order by role_row.role_key, candidate_row.expected_wage), '[]'::jsonb)
  into v_talent
  from public.business_talent_candidates_v2 as candidate_row
  join public.business_role_definitions_v2 as role_row
    on role_row.game_session_id = candidate_row.game_session_id
   and role_row.id = candidate_row.role_id
  where candidate_row.game_session_id = p_game_session_id
    and candidate_row.country_code = v_business.country_code
    and candidate_row.week_start = date_trunc('week', current_date)::date
    and candidate_row.status = 'available'
  limit 100;

  select coalesce(jsonb_agg(jsonb_build_object(
    'employeeKey', employment_row.public_key,
    'name', candidate_row.display_name,
    'roleKey', role_row.role_key,
    'roleName', role_row.display_name,
    'primaryStat', role_row.primary_stat,
    'primaryStatValue', public.business_candidate_stat_v2(candidate_row, role_row.primary_stat),
    'wagePerCycle', employment_row.wage_per_cycle,
    'currentMarketWage', public.business_employee_current_market_wage_v2(employment_row.id),
    'retentionRisk', public.business_employee_retention_risk_v2(employment_row.id),
    'nextPayrollAt', employment_row.next_payroll_at,
    'missedPayrollCycles', employment_row.missed_payroll_cycles,
    'status', employment_row.status
  ) order by role_row.role_key, employment_row.hired_at), '[]'::jsonb)
  into v_workforce
  from public.business_employments_v2 as employment_row
  join public.business_talent_candidates_v2 as candidate_row
    on candidate_row.game_session_id = employment_row.game_session_id
   and candidate_row.id = employment_row.candidate_id
  join public.business_role_definitions_v2 as role_row
    on role_row.game_session_id = employment_row.game_session_id
   and role_row.id = employment_row.role_id
  where employment_row.game_session_id = p_game_session_id
    and employment_row.business_id = v_business.id
    and employment_row.status in ('active', 'unpaid');

  select coalesce(jsonb_agg(jsonb_build_object(
    'priceKey', price_row.public_key,
    'itemKey', item_row.public_key,
    'itemName', coalesce(to_jsonb(item_row) ->> 'name', to_jsonb(item_row) ->> 'item_name', item_row.public_key),
    'substitutionGroup', profile_row.substitution_group,
    'referencePrice', profile_row.reference_price,
    'sellingPrice', price_row.selling_price,
    'minimumPrice', round(profile_row.reference_price * profile_row.minimum_price_multiple, 2),
    'maximumPrice', round(profile_row.reference_price * profile_row.maximum_price_multiple, 2),
    'priceElasticity', profile_row.price_elasticity,
    'estimatedDemandToday', public.business_realized_demand_v2(price_row.id, current_date),
    'finishedAvailability', public.business_derived_finished_availability_v2(
      p_game_session_id,
      v_business.id,
      item_row.id
    ),
    'version', price_row.version,
    'status', price_row.status
  ) order by item_row.public_key), '[]'::jsonb)
  into v_sales
  from public.business_sales_prices_v2 as price_row
  join public.business_market_product_profiles_v2 as profile_row
    on profile_row.game_session_id = price_row.game_session_id
   and profile_row.id = price_row.market_profile_id
  join public.game_items as item_row
    on item_row.game_session_id = price_row.game_session_id
   and item_row.id = price_row.game_item_id
  where price_row.game_session_id = p_game_session_id
    and price_row.business_id = v_business.id;

  select coalesce(jsonb_agg(item order by item ->> 'createdAt' desc), '[]'::jsonb)
  into v_governance
  from (
    select jsonb_build_object(
      'proposalKey', proposal_row.public_key,
      'type', proposal_row.proposal_type,
      'status', proposal_row.status,
      'approvalThresholdBasisPoints', proposal_row.approval_threshold_basis_points,
      'approvalBasisPoints', floor(
        coalesce(sum(vote_row.voting_units) filter (where vote_row.decision = 'approve'), 0)
        * 10000.0 / proposal_row.snapshot_total_voting_units
      )::integer,
      'rejectionBasisPoints', floor(
        coalesce(sum(vote_row.voting_units) filter (where vote_row.decision = 'reject'), 0)
        * 10000.0 / proposal_row.snapshot_total_voting_units
      )::integer,
      'terms', proposal_row.terms,
      'myVotingUnits', max(snapshot_row.voting_units) filter (where snapshot_row.player_id = p_player_id),
      'myDecision', max(vote_row.decision) filter (where vote_row.player_id = p_player_id),
      'createdAt', proposal_row.created_at,
      'expiresAt', proposal_row.expires_at
    ) as item
    from public.business_governance_proposals as proposal_row
    left join public.business_governance_voter_snapshots as snapshot_row
      on snapshot_row.game_session_id = proposal_row.game_session_id
     and snapshot_row.proposal_id = proposal_row.id
    left join public.business_governance_votes as vote_row
      on vote_row.game_session_id = proposal_row.game_session_id
     and vote_row.proposal_id = proposal_row.id
    where proposal_row.game_session_id = p_game_session_id
      and proposal_row.business_id = v_business.id
    group by proposal_row.id
    order by proposal_row.created_at desc
    limit 50
  ) as governance_items;

  select coalesce(jsonb_agg(jsonb_build_object(
    'offerKey', offer_row.public_key,
    'direction', case when offer_row.seller_player_id = p_player_id then 'outgoing' else 'incoming' end,
    'counterpartyIdentifier', coalesce(
      to_jsonb(counterparty_row) ->> 'player_identifier',
      to_jsonb(counterparty_row) ->> 'player_identifier_normalized'
    ),
    'ownershipKind', offer_row.ownership_kind,
    'units', offer_row.units,
    'considerationAmount', offer_row.consideration_amount,
    'status', offer_row.status,
    'expiresAt', offer_row.expires_at,
    'createdAt', offer_row.created_at
  ) order by offer_row.created_at desc), '[]'::jsonb)
  into v_transfers
  from public.business_ownership_transfer_offers as offer_row
  join public.players as counterparty_row
    on counterparty_row.game_session_id = offer_row.game_session_id
   and counterparty_row.id = case
     when offer_row.seller_player_id = p_player_id then offer_row.buyer_player_id
     else offer_row.seller_player_id
   end
  where offer_row.game_session_id = p_game_session_id
    and offer_row.business_id = v_business.id
    and (offer_row.seller_player_id = p_player_id or offer_row.buyer_player_id = p_player_id)
  limit 50;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventKey', event_row.public_key,
    'eventType', event_row.event_type,
    'reasonCode', event_row.reason_code,
    'metadata', event_row.metadata,
    'createdAt', event_row.created_at
  ) order by event_row.created_at desc), '[]'::jsonb)
  into v_activity
  from (
    select *
    from public.business_activity_events
    where game_session_id = p_game_session_id
      and business_id = v_business.id
    order by created_at desc
    limit 100
  ) as event_row;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assessmentKey', assessment_row.public_key,
    'periodStart', assessment_row.period_start,
    'periodEnd', assessment_row.period_end,
    'taxClassification', assessment_row.tax_classification,
    'revenue', assessment_row.revenue,
    'eligibleExpenses', assessment_row.eligible_expenses,
    'taxableIncome', assessment_row.taxable_income,
    'entityTax', assessment_row.entity_tax,
    'passThroughTaxPool', assessment_row.pass_through_tax_pool,
    'status', assessment_row.status
  ) order by assessment_row.period_end desc), '[]'::jsonb)
  into v_tax
  from (
    select *
    from public.business_tax_assessments_v2
    where game_session_id = p_game_session_id
      and business_id = v_business.id
    order by period_end desc
    limit 12
  ) as assessment_row;

  select jsonb_build_object(
    'liquidationKey', liquidation_row.public_key,
    'type', liquidation_row.liquidation_type,
    'status', liquidation_row.status,
    'startedAt', liquidation_row.started_at,
    'completedAt', liquidation_row.completed_at,
    'metadata', liquidation_row.metadata
  )
  into v_liquidation
  from public.business_liquidations as liquidation_row
  where liquidation_row.game_session_id = p_game_session_id
    and liquidation_row.business_id = v_business.id
    and liquidation_row.status <> 'completed'
  order by liquidation_row.started_at desc
  limit 1;

  if v_business.financial_health_state = 'cash_warning' then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning', 'code', 'cash_warning',
      'message', 'Cash is below the recommended operating buffer.'
    ));
  elsif v_business.financial_health_state in ('distressed', 'insolvent', 'liquidating') then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'critical', 'code', 'financial_distress',
      'message', 'Protected obligations are at risk. Financing, restructuring, or liquidation requires attention.'
    ));
  end if;
  if exists (
    select 1
    from public.business_employments_v2 as employment_row
    where employment_row.game_session_id = p_game_session_id
      and employment_row.business_id = v_business.id
      and public.business_employee_retention_risk_v2(employment_row.id) in ('high', 'critical')
  ) then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning', 'code', 'retention_risk',
      'message', 'At least one employee is materially under market pay or has missed payroll.'
    ));
  end if;
  if exists (
    select 1
    from public.business_research_projects as project_row
    where project_row.game_session_id = p_game_session_id
      and project_row.business_id = v_business.id
      and project_row.status = 'researching'
  ) then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'info', 'code', 'research_active',
      'message', 'An R&D project is in progress.'
    ));
  end if;
  if exists (
    select 1
    from public.business_sales_settlements_v2 as settlement_row
    where settlement_row.game_session_id = p_game_session_id
      and settlement_row.business_id = v_business.id
      and settlement_row.settlement_date >= current_date - 3
      and settlement_row.demand_units > settlement_row.units_sold
  ) then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning', 'code', 'unmet_demand',
      'message', 'Recent demand exceeded fulfilled finished inventory.'
    ));
  end if;

  v_result := jsonb_build_object(
    'schemaVersion', 2,
    'mode', 'operating',
    'entityOptions', v_entity_options,
    'formations', v_formations,
    'business', jsonb_build_object(
      'businessKey', v_business.public_key,
      'legalName', v_business.legal_name,
      'entityType', v_business.entity_type,
      'taxClassification', v_business.tax_classification,
      'industryCode', v_business.industry_code,
      'countryCode', v_business.country_code,
      'currencyCode', v_business.currency_code,
      'status', v_business.status,
      'formationState', v_business.formation_state,
      'financialHealthState', v_business.financial_health_state,
      'cash', v_cash,
      'reputation', public.business_reputation_score_v2(p_game_session_id, v_business.id),
      'valuation', v_business.valuation,
      'outstandingDebt', public.business_outstanding_debt_v2(p_game_session_id, v_business.id),
      'protectedObligations', public.business_protected_obligations_v2(p_game_session_id, v_business.id),
      'financials30d', v_financials,
      'valuationDetail', v_latest_valuation,
      'ownership', v_ownership,
      'corporateShares', case
        when v_business.entity_type = 'c_corporation' then (
          select jsonb_build_object(
            'authorizedShares', share_row.authorized_shares,
            'issuedShares', share_row.issued_shares,
            'treasuryShares', share_row.treasury_shares,
            'outstandingShares', share_row.outstanding_shares
          )
          from public.business_corporate_share_structures as share_row
          where share_row.game_session_id = p_game_session_id
            and share_row.business_id = v_business.id
        )
        else null
      end,
      'recipes', v_recipes,
      'research', v_research,
      'wholesale', v_wholesale,
      'equipment', v_equipment,
      'production', v_production,
      'talentMarket', v_talent,
      'workforce', v_workforce,
      'sales', v_sales,
      'governance', v_governance,
      'ownershipTransfers', v_transfers,
      'tax', v_tax,
      'liquidation', v_liquidation,
      'activity', v_activity
    ),
    'alerts', v_alerts
  );

  return v_result;
end
$function$;

revoke all on function public.get_player_business_workspace_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_player_business_workspace_v2(uuid, uuid)
  to service_role;

commit;
