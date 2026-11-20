-- Business V2 Phase 12: Player-safe operating workspace projections.
--
-- These reads compose existing canonical Business, Inventory, Workforce,
-- Equipment, Store, governance, and activity authorities. They do not reserve,
-- settle, initialize clocks, or mutate simulation state.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.read_owned_business_governance_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_business_row public.business_entities%rowtype;
  v_position public.business_ownership_positions%rowtype;
  v_total_units numeric := 0;
  v_total_voting_units numeric := 0;
  v_owner_count integer := 0;
  v_ownership_bps integer := 0;
  v_voting_bps integer := 0;
  v_share_structure jsonb := null;
  v_proposals jsonb := '[]'::jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select business_row.*
  into v_business_row
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_business.business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select position_row.*
  into v_position
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.business_id
    and position_row.player_id = p_player_id
    and position_row.status = 'active'
  order by position_row.effective_at, position_row.public_key
  limit 1;
  if not found then
    raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(position_row.units), 0)::numeric,
    coalesce(sum(position_row.voting_units), 0)::numeric,
    count(*)::integer
  into v_total_units, v_total_voting_units, v_owner_count
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.business_id
    and position_row.status = 'active';

  if v_total_units <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_STATE_INVALID' using errcode = 'P0001';
  end if;

  v_ownership_bps := least(
    10000,
    greatest(0, floor(v_position.units * 10000.0 / v_total_units)::integer)
  );
  if v_total_voting_units > 0 then
    v_voting_bps := least(
      10000,
      greatest(
        0,
        floor(v_position.voting_units * 10000.0 / v_total_voting_units)::integer
      )
    );
  end if;

  select jsonb_build_object(
    'authorizedShares', structure.authorized_shares::text,
    'issuedShares', structure.issued_shares::text,
    'treasuryShares', structure.treasury_shares::text,
    'outstandingShares', structure.outstanding_shares::text
  )
  into v_share_structure
  from public.business_corporate_share_structures as structure
  where structure.game_session_id = p_game_session_id
    and structure.business_id = v_business.business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'proposalKey', proposal.public_key,
    'proposalType', proposal.proposal_type,
    'status', proposal.status,
    'approvalThresholdBasisPoints', proposal.approval_threshold_basis_points,
    'snapshotTotalVotingUnits', proposal.snapshot_total_voting_units::text,
    'expiresAt', proposal.expires_at,
    'resolvedAt', proposal.resolved_at,
    'executedAt', proposal.executed_at
  ) order by proposal.created_at desc, proposal.public_key), '[]'::jsonb)
  into v_proposals
  from public.business_governance_proposals as proposal
  where proposal.game_session_id = p_game_session_id
    and proposal.business_id = v_business.business_id
    and proposal.status in ('open','approved');

  return jsonb_build_object(
    'businessKey', v_business.business_key,
    'entityType', v_business_row.entity_type,
    'taxClassification', v_business_row.tax_classification,
    'formationState', v_business_row.formation_state,
    'ownershipModelVersion', v_business_row.ownership_model_version,
    'ownerCount', v_owner_count,
    'totalUnits', v_total_units::text,
    'totalVotingUnits', v_total_voting_units::text,
    'currentPosition', jsonb_build_object(
      'positionKey', v_position.public_key,
      'ownershipKind', v_position.ownership_kind,
      'units', v_position.units::text,
      'votingUnits', v_position.voting_units::text,
      'ownershipBasisPoints', v_ownership_bps,
      'votingBasisPoints', v_voting_bps,
      'effectiveAt', v_position.effective_at
    ),
    'corporateShareStructure', v_share_structure,
    'openProposals', v_proposals,
    'readOnly', true
  );
end
$function$;

revoke all on function public.read_owned_business_governance_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_governance_v2(uuid, uuid)
  to service_role;

create or replace function public.read_owned_business_sales_offers_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_party_id uuid;
  v_offers jsonb := '[]'::jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select party.id
  into v_party_id
  from public.economic_parties as party
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
  order by party.id
  limit 1;

  if v_party_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'offerKey', offer.public_key,
    'itemKey', item.public_key,
    'canonicalKey', item.canonical_key,
    'itemName', item.name,
    'status', offer.status,
    'unitPrice', offer.unit_price,
    'currencyCode', offer.currency_code,
    'quantityOwned', coalesce(holding.quantity_owned, 0),
    'quantityReserved', coalesce(holding.quantity_reserved, 0),
    'quantityAvailable', greatest(
      coalesce(holding.quantity_owned, 0) - coalesce(holding.quantity_reserved, 0),
      0
    ),
    'purchaseAllowed', offer.status = 'active',
    'withdrawal', case when offer.status = 'withdrawal_pending' then jsonb_build_object(
      'requestKey', withdrawal.public_key,
      'mode', offer.withdrawal_mode,
      'requestedQuantity', offer.withdrawal_requested_quantity,
      'resumeStatus', offer.withdrawal_resume_status,
      'requestedAt', offer.withdrawal_requested_at,
      'effectiveAt', offer.withdrawal_effective_at,
      'nextAttemptAt', withdrawal.next_attempt_at,
      'lastAttemptAt', withdrawal.last_attempt_at,
      'lastBlockReason', withdrawal.last_block_reason,
      'attemptCount', coalesce(withdrawal.attempt_count, 0)
    ) else null end,
    'version', offer.version
  ) order by offer.updated_at desc, offer.public_key), '[]'::jsonb)
  into v_offers
  from public.store_seller_offers as offer
  join public.game_items as item
    on item.game_session_id = offer.game_session_id
   and item.id = offer.game_item_id
  left join public.inventory_holdings as holding
    on holding.game_session_id = offer.game_session_id
   and holding.inventory_account_id = offer.inventory_account_id
   and holding.game_item_id = offer.game_item_id
  left join public.store_offer_withdrawal_requests as withdrawal
    on withdrawal.game_session_id = offer.game_session_id
   and withdrawal.id = offer.withdrawal_request_id
  where offer.game_session_id = p_game_session_id
    and offer.seller_party_id = v_party_id
    and offer.seller_kind = 'business'
    and offer.status <> 'retired';

  return v_offers;
end
$function$;

revoke all on function public.read_owned_business_sales_offers_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_sales_offers_v2(uuid, uuid)
  to service_role;

create or replace function public.read_owned_business_activity_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_activity jsonb := '[]'::jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'activityKey', activity.public_key,
    'eventType', activity.event_type,
    'reasonCode', activity.reason_code,
    'actorType', activity.actor_type,
    'referenceKey', case
      when coalesce(activity.metadata ->> 'receiptKey', '') ~ '^[a-z]{3,8}_[0-9a-f]{32}$'
        then activity.metadata ->> 'receiptKey'
      when coalesce(activity.metadata ->> 'proposalKey', '') ~ '^[a-z]{3,8}_[0-9a-f]{32}$'
        then activity.metadata ->> 'proposalKey'
      when coalesce(activity.metadata ->> 'jobKey', '') ~ '^[a-z]{3,8}_[0-9a-f]{32}$'
        then activity.metadata ->> 'jobKey'
      when coalesce(activity.metadata ->> 'offerKey', '') ~ '^[a-z]{3,8}_[0-9a-f]{32}$'
        then activity.metadata ->> 'offerKey'
      when coalesce(activity.metadata ->> 'orderKey', '') ~ '^[a-z]{3,8}_[0-9a-f]{32}$'
        then activity.metadata ->> 'orderKey'
      when coalesce(activity.metadata ->> 'formationKey', '') ~ '^[a-z]{3,8}_[0-9a-f]{32}$'
        then activity.metadata ->> 'formationKey'
      else null
    end,
    'occurredAt', activity.occurred_at
  ) order by activity.occurred_at desc, activity.public_key), '[]'::jsonb)
  into v_activity
  from (
    select event.*
    from public.business_activity_events as event
    where event.game_session_id = p_game_session_id
      and event.business_id = v_business.business_id
    order by event.occurred_at desc, event.public_key
    limit 50
  ) as activity;

  return v_activity;
end
$function$;

revoke all on function public.read_owned_business_activity_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_activity_v2(uuid, uuid)
  to service_role;

create or replace function public.read_owned_business_production_readiness_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_business_row public.business_entities%rowtype;
  v_party_id uuid;
  v_warehouse_id uuid;
  v_period_number bigint := 1;
  v_payroll_period_key text;
  v_equipment_period_key text;
  v_product public.business_products%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_recipe_matches integer;
  v_input public.physical_economy_recipe_inputs%rowtype;
  v_labor_requirement public.business_recipe_labor_requirements%rowtype;
  v_equipment_requirement public.business_recipe_equipment_requirements%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_planned_quantity integer := 10;
  v_material_max integer;
  v_labor_max integer;
  v_equipment_max integer;
  v_overall_max integer;
  v_line_max integer;
  v_material_lines integer;
  v_material_blocked integer;
  v_material_required numeric;
  v_material_available numeric;
  v_material_required_total numeric;
  v_material_available_total numeric;
  v_labor_required integer;
  v_labor_available integer;
  v_labor_required_total integer;
  v_labor_available_total integer;
  v_labor_required_headcount integer;
  v_labor_available_headcount integer;
  v_equipment_required integer;
  v_equipment_available integer;
  v_equipment_required_total integer;
  v_equipment_available_total integer;
  v_equipment_required_instances integer;
  v_equipment_available_instances integer;
  v_bottlenecks text[];
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select business_row.*
  into v_business_row
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_business.business_id
    and business_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(clock_row.current_period_number, 1::bigint)
  into v_period_number
  from (select 1) as seed
  left join public.business_payroll_clocks as clock_row
    on clock_row.game_session_id = p_game_session_id
   and clock_row.business_id = v_business.business_id;
  v_payroll_period_key := 'payroll:' || v_period_number::text;
  v_equipment_period_key := 'equipment:' || v_period_number::text;

  select party.id
  into v_party_id
  from public.economic_parties as party
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
  order by party.id
  limit 1;

  if v_party_id is not null then
    select account.id
    into v_warehouse_id
    from public.inventory_accounts as account
    where account.game_session_id = p_game_session_id
      and account.party_id = v_party_id
      and account.account_kind = 'warehouse'
      and account.location_key is null
      and account.status = 'active'
    order by account.id
    limit 1;
  end if;

  for v_product in
    select product.*
    from public.business_products as product
    where product.game_session_id = p_game_session_id
      and product.business_id = v_business.business_id
      and product.product_kind = 'physical_good'
      and product.output_game_item_id is not null
      and product.status = 'active'
    order by product.created_at, product.public_key
  loop
    select count(distinct recipe.id)::integer
    into v_recipe_matches
    from public.business_recipe_access as access
    join public.physical_economy_recipe_definitions as recipe
      on recipe.id = access.recipe_id
     and recipe.status = 'active'
    join public.physical_economy_recipe_outputs as recipe_output
      on recipe_output.recipe_id = recipe.id
    join public.game_items as output_item
      on output_item.game_session_id = access.game_session_id
     and output_item.canonical_key = recipe_output.item_key
     and output_item.id = v_product.output_game_item_id
     and output_item.status = 'active'
    join public.game_session_recipe_availability as availability
      on availability.game_session_id = access.game_session_id
     and availability.recipe_id = recipe.id
     and availability.enabled = true
     and availability.scarcity_band <> 'unavailable'
    join public.game_session_physical_economy_packs as pack_scope
      on pack_scope.game_session_id = access.game_session_id
     and pack_scope.pack_id = recipe.pack_id
     and pack_scope.status = 'active'
    where access.game_session_id = p_game_session_id
      and access.business_id = v_business.business_id
      and access.revoked_at is null
      and (
        cardinality(availability.country_codes) = 0
        or v_business_row.country_code = any(availability.country_codes)
      );

    if v_recipe_matches <> 1 then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'businessKey', v_business.business_key,
        'productKey', v_product.public_key,
        'productName', v_product.name,
        'recipeKey', null,
        'plannedQuantity', v_planned_quantity,
        'status', case when v_recipe_matches = 0 then 'recipe_unavailable' else 'recipe_ambiguous' end,
        'nextRunReady', false,
        'materialReady', false,
        'laborReady', false,
        'equipmentReady', false,
        'materialMaxUnits', 0,
        'laborMaxUnits', 0,
        'equipmentMaxUnits', 0,
        'maxRunnableUnits', 0,
        'bottlenecks', jsonb_build_array('recipe'),
        'materialLines', 0,
        'materialBlockedLines', 0,
        'materialRequired', 0,
        'materialAvailable', 0,
        'laborRequiredMinutes', 0,
        'laborAvailableMinutes', 0,
        'laborRequiredHeadcount', 0,
        'laborAvailableHeadcount', 0,
        'equipmentRequiredMinutes', 0,
        'equipmentAvailableMinutes', 0,
        'equipmentRequiredInstances', 0,
        'equipmentAvailableInstances', 0,
        'payrollPeriodKey', v_payroll_period_key,
        'equipmentPeriodKey', v_equipment_period_key
      ));
      continue;
    end if;

    select recipe.*
    into v_recipe
    from public.business_recipe_access as access
    join public.physical_economy_recipe_definitions as recipe
      on recipe.id = access.recipe_id
     and recipe.status = 'active'
    join public.physical_economy_recipe_outputs as recipe_output
      on recipe_output.recipe_id = recipe.id
    join public.game_items as output_item
      on output_item.game_session_id = access.game_session_id
     and output_item.canonical_key = recipe_output.item_key
     and output_item.id = v_product.output_game_item_id
     and output_item.status = 'active'
    join public.game_session_recipe_availability as availability
      on availability.game_session_id = access.game_session_id
     and availability.recipe_id = recipe.id
     and availability.enabled = true
     and availability.scarcity_band <> 'unavailable'
    join public.game_session_physical_economy_packs as pack_scope
      on pack_scope.game_session_id = access.game_session_id
     and pack_scope.pack_id = recipe.pack_id
     and pack_scope.status = 'active'
    where access.game_session_id = p_game_session_id
      and access.business_id = v_business.business_id
      and access.revoked_at is null
      and (
        cardinality(availability.country_codes) = 0
        or v_business_row.country_code = any(availability.country_codes)
      )
    order by recipe.recipe_key
    limit 1;

    v_material_max := 10000;
    v_material_lines := 0;
    v_material_blocked := 0;
    v_material_required_total := 0;
    v_material_available_total := 0;
    for v_input in
      select input.*
      from public.physical_economy_recipe_inputs as input
      where input.recipe_id = v_recipe.id
      order by input.line_key
    loop
      v_material_lines := v_material_lines + 1;
      v_material_required := ceil(v_input.base_quantity * v_planned_quantity);
      select coalesce(sum(greatest(
        holding.quantity_owned - holding.quantity_reserved,
        0
      )), 0)::numeric
      into v_material_available
      from public.game_items as item
      left join public.inventory_holdings as holding
        on holding.game_session_id = p_game_session_id
       and holding.inventory_account_id = v_warehouse_id
       and holding.game_item_id = item.id
      where item.game_session_id = p_game_session_id
        and item.canonical_key = v_input.item_key
        and item.status = 'active';
      v_material_required_total := v_material_required_total + v_material_required;
      v_material_available_total := v_material_available_total + v_material_available;
      if v_material_available < v_material_required then
        v_material_blocked := v_material_blocked + 1;
      end if;
      v_line_max := least(
        10000,
        greatest(
          0,
          floor(v_material_available / nullif(v_input.base_quantity, 0))::integer
        )
      );
      v_material_max := least(v_material_max, v_line_max);
    end loop;

    v_labor_max := 10000;
    v_labor_required_total := 0;
    v_labor_available_total := 0;
    v_labor_required_headcount := 0;
    v_labor_available_headcount := 0;
    for v_labor_requirement in
      select requirement.*
      from public.business_recipe_labor_requirements as requirement
      where requirement.recipe_definition_id = v_recipe.id
        and requirement.status = 'active'
      order by requirement.public_key
    loop
      v_labor_required := v_labor_requirement.fixed_labor_minutes_per_run
        + v_labor_requirement.labor_minutes_per_unit * v_planned_quantity;
      select
        count(*)::integer,
        coalesce(sum(greatest(
          employee.labor_minutes_per_cycle - coalesce(usage.used_minutes, 0),
          0
        )), 0)::integer
      into v_labor_available_headcount, v_labor_available
      from public.business_employees as employee
      left join lateral (
        select coalesce(sum(reservation.reserved_minutes), 0)::integer as used_minutes
        from public.business_labor_reservations as reservation
        where reservation.game_session_id = p_game_session_id
          and reservation.employee_id = employee.id
          and reservation.period_key = v_payroll_period_key
          and reservation.status in ('reserved','active','consumed')
      ) as usage on true
      where employee.game_session_id = p_game_session_id
        and employee.business_id = v_business.business_id
        and employee.status = 'active'
        and employee.workforce_source_type in ('candidate_v2','migration_v2')
        and employee.workforce_role_definition_id = v_labor_requirement.role_definition_id
        and employee.skill_basis_points >= v_labor_requirement.minimum_skill_basis_points;

      v_labor_required_total := v_labor_required_total + v_labor_required;
      v_labor_available_total := v_labor_available_total + v_labor_available;
      v_labor_required_headcount := v_labor_required_headcount
        + v_labor_requirement.minimum_headcount;

      if v_labor_available_headcount < v_labor_requirement.minimum_headcount
        or v_labor_available < (
          v_labor_requirement.fixed_labor_minutes_per_run
          + v_labor_requirement.labor_minutes_per_unit
        )
      then
        v_line_max := 0;
      else
        v_line_max := least(
          10000,
          greatest(
            0,
            floor(
              (v_labor_available - v_labor_requirement.fixed_labor_minutes_per_run)::numeric
              / v_labor_requirement.labor_minutes_per_unit
            )::integer
          )
        );
      end if;
      v_labor_max := least(v_labor_max, v_line_max);
    end loop;

    v_equipment_max := 10000;
    v_equipment_required_total := 0;
    v_equipment_available_total := 0;
    v_equipment_required_instances := 0;
    v_equipment_available_instances := 0;
    for v_equipment_requirement in
      select requirement.*
      from public.business_recipe_equipment_requirements as requirement
      where requirement.recipe_definition_id = v_recipe.id
        and requirement.status = 'active'
      order by requirement.capability_key, requirement.public_key
    loop
      v_equipment_required := v_equipment_requirement.fixed_equipment_minutes_per_run
        + v_equipment_requirement.equipment_minutes_per_unit * v_planned_quantity;
      select
        count(*)::integer,
        coalesce(sum(greatest(
          profile.base_capacity_minutes_per_period - coalesce(usage.used_minutes, 0),
          0
        )), 0)::integer
      into v_equipment_available_instances, v_equipment_available
      from public.business_equipment_installations as installation
      join public.equipment_instances as instance
        on instance.game_session_id = installation.game_session_id
       and instance.id = installation.equipment_instance_id
       and instance.status = 'active'
       and instance.player_id is null
       and instance.equipped_slot is null
      join public.business_equipment_capacity_profiles as profile
        on profile.id = installation.capacity_profile_id
       and profile.status = 'active'
      left join lateral (
        select coalesce(sum(reservation.reserved_minutes), 0)::integer as used_minutes
        from public.business_equipment_reservations as reservation
        where reservation.game_session_id = p_game_session_id
          and reservation.installation_id = installation.id
          and reservation.period_key = v_equipment_period_key
          and reservation.status in ('reserved','active','consumed')
      ) as usage on true
      where installation.game_session_id = p_game_session_id
        and installation.business_id = v_business.business_id
        and installation.status = 'installed'
        and v_equipment_requirement.capability_key = any(profile.capability_keys);

      v_equipment_required_total := v_equipment_required_total + v_equipment_required;
      v_equipment_available_total := v_equipment_available_total + v_equipment_available;
      v_equipment_required_instances := v_equipment_required_instances
        + v_equipment_requirement.minimum_instance_count;

      if v_equipment_available_instances < v_equipment_requirement.minimum_instance_count
        or v_equipment_available < v_equipment_requirement.fixed_equipment_minutes_per_run
      then
        v_line_max := 0;
      elsif v_equipment_requirement.equipment_minutes_per_unit = 0 then
        v_line_max := 10000;
      else
        v_line_max := least(
          10000,
          greatest(
            0,
            floor(
              (v_equipment_available - v_equipment_requirement.fixed_equipment_minutes_per_run)::numeric
              / v_equipment_requirement.equipment_minutes_per_unit
            )::integer
          )
        );
      end if;
      v_equipment_max := least(v_equipment_max, v_line_max);
    end loop;

    v_overall_max := least(v_material_max, v_labor_max, v_equipment_max);
    v_bottlenecks := '{}'::text[];
    if v_overall_max < 10000 then
      if v_material_max = v_overall_max then
        v_bottlenecks := array_append(v_bottlenecks, 'material');
      end if;
      if v_labor_max = v_overall_max then
        v_bottlenecks := array_append(v_bottlenecks, 'labor');
      end if;
      if v_equipment_max = v_overall_max then
        v_bottlenecks := array_append(v_bottlenecks, 'equipment');
      end if;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'businessKey', v_business.business_key,
      'productKey', v_product.public_key,
      'productName', v_product.name,
      'recipeKey', v_recipe.recipe_key,
      'plannedQuantity', v_planned_quantity,
      'status', case when v_overall_max >= v_planned_quantity then 'ready' else 'blocked' end,
      'nextRunReady', v_overall_max >= v_planned_quantity,
      'materialReady', v_material_max >= v_planned_quantity,
      'laborReady', v_labor_max >= v_planned_quantity,
      'equipmentReady', v_equipment_max >= v_planned_quantity,
      'materialMaxUnits', v_material_max,
      'laborMaxUnits', v_labor_max,
      'equipmentMaxUnits', v_equipment_max,
      'maxRunnableUnits', v_overall_max,
      'bottlenecks', to_jsonb(v_bottlenecks),
      'materialLines', v_material_lines,
      'materialBlockedLines', v_material_blocked,
      'materialRequired', v_material_required_total,
      'materialAvailable', v_material_available_total,
      'laborRequiredMinutes', v_labor_required_total,
      'laborAvailableMinutes', v_labor_available_total,
      'laborRequiredHeadcount', v_labor_required_headcount,
      'laborAvailableHeadcount', v_labor_available_headcount,
      'equipmentRequiredMinutes', v_equipment_required_total,
      'equipmentAvailableMinutes', v_equipment_available_total,
      'equipmentRequiredInstances', v_equipment_required_instances,
      'equipmentAvailableInstances', v_equipment_available_instances,
      'payrollPeriodKey', v_payroll_period_key,
      'equipmentPeriodKey', v_equipment_period_key
    ));
  end loop;

  return v_result;
end
$function$;

revoke all on function public.read_owned_business_production_readiness_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_production_readiness_v2(uuid, uuid)
  to service_role;

create or replace function public.read_owned_business_workspace_projection_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_object(
    'governance', public.read_owned_business_governance_v2(p_game_session_id, p_player_id),
    'productionReadiness', public.read_owned_business_production_readiness_v2(p_game_session_id, p_player_id),
    'salesOffers', public.read_owned_business_sales_offers_v2(p_game_session_id, p_player_id),
    'activity', public.read_owned_business_activity_v2(p_game_session_id, p_player_id)
  )
$function$;

revoke all on function public.read_owned_business_workspace_projection_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_workspace_projection_v2(uuid, uuid)
  to service_role;

comment on function public.read_owned_business_workspace_projection_v2(uuid, uuid) is
  'Player-safe Phase 12 Business workspace projection composed only from canonical read authorities; performs no reservations, settlement, or clock initialization.';

commit;
