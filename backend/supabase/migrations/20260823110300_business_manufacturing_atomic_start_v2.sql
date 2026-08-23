-- Business V2 Phase 6B: atomic manufacturing start and canonical resource hold.
--
-- This service-owned command moves exact canonical BOM quantities from the
-- Business Warehouse into WIP, reserves eligible labor and installed equipment
-- in deterministic order, and inserts one queued job only after every hold has
-- succeeded inside the same transaction. It does not settle output.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.start_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_quantity integer,
  p_priority text,
  p_idempotency_key text
)
returns table (
  job_key text,
  business_key text,
  product_key text,
  recipe_key text,
  output_item_key text,
  status text,
  quantity integer,
  output_quantity integer,
  duration_seconds integer,
  material_cost_basis numeric,
  labor_cost_basis numeric,
  reserved_labor_minutes integer,
  reserved_equipment_minutes integer,
  queue_available_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_resolved record;
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_output_line public.physical_economy_recipe_outputs%rowtype;
  v_output_item public.game_items%rowtype;
  v_existing public.business_manufacturing_jobs%rowtype;
  v_job public.business_manufacturing_jobs%rowtype;
  v_input record;
  v_warehouse_holding public.inventory_holdings%rowtype;
  v_wip_holding public.inventory_holdings%rowtype;
  v_labor_requirement record;
  v_employee record;
  v_labor_result record;
  v_labor_reservation public.business_labor_reservations%rowtype;
  v_equipment_requirement public.business_recipe_equipment_requirements%rowtype;
  v_candidate record;
  v_equipment_result record;
  v_equipment_reservation public.business_equipment_reservations%rowtype;
  v_job_id uuid;
  v_job_public_key text;
  v_request_hash text;
  v_recipe_match_count integer := 0;
  v_material_requirement_count integer := 0;
  v_resolved_material_count integer := 0;
  v_labor_requirement_count integer := 0;
  v_equipment_requirement_count integer := 0;
  v_warehouse_account_id uuid;
  v_wip_account_id uuid;
  v_required_bigint bigint;
  v_required integer;
  v_transfer_result jsonb;
  v_transfer_transaction_id uuid;
  v_material_count integer := 0;
  v_material_cost numeric := 0;
  v_payroll_period_key text;
  v_equipment_period_key text;
  v_intent_ref text;
  v_role_count integer := 0;
  v_skill_count integer := 0;
  v_available_capacity integer := 0;
  v_required_total integer := 0;
  v_required_remaining integer := 0;
  v_headcount_remaining integer := 0;
  v_allocate integer := 0;
  v_labor_count integer := 0;
  v_labor_minutes integer := 0;
  v_labor_cost numeric := 0;
  v_instances_remaining integer := 0;
  v_instances_used integer := 0;
  v_used_minutes integer := 0;
  v_available_minutes integer := 0;
  v_equipment_count integer := 0;
  v_equipment_minutes integer := 0;
  v_duration integer;
  v_output_bigint bigint;
  v_output_quantity integer;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null
    or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_product_key, '') !~ '^prd_[0-9a-f]{32}$'
    or p_quantity is null
    or p_quantity not between 1 and 10000
    or lower(btrim(coalesce(p_priority, ''))) not in ('standard','expedite')
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_MANUFACTURING_START_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
  ) then
    raise exception 'BUSINESS_MANUFACTURING_GAME_INACTIVE'
      using errcode = 'P0001';
  end if;

  select *
  into v_resolved
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_resolved.business_key is distinct from lower(btrim(p_business_key)) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_resolved.business_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select product_row.*
  into v_product
  from public.business_products as product_row
  where product_row.game_session_id = p_game_session_id
    and product_row.business_id = v_business.id
    and product_row.public_key = lower(btrim(p_product_key))
    and product_row.product_kind = 'physical_good'
    and product_row.output_game_item_id is not null
    and product_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PRODUCT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_output_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_product.output_game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_recipe_match_count
  from public.business_recipe_access as access
  join public.physical_economy_recipe_definitions as recipe
    on recipe.id = access.recipe_id
   and recipe.status = 'active'
  join public.physical_economy_recipe_outputs as recipe_output
    on recipe_output.recipe_id = recipe.id
   and recipe_output.item_key = v_output_item.canonical_key
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
    and access.business_id = v_business.id
    and access.revoked_at is null
    and (
      cardinality(availability.country_codes) = 0
      or v_business.country_code = any(availability.country_codes)
    );

  if v_recipe_match_count = 0 then
    raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
      using errcode = 'P0001';
  elsif v_recipe_match_count > 1 then
    raise exception 'BUSINESS_MANUFACTURING_RECIPE_AMBIGUOUS'
      using errcode = 'P0001';
  end if;

  select recipe.*, recipe_output.*
  into v_recipe, v_output_line
  from public.business_recipe_access as access
  join public.physical_economy_recipe_definitions as recipe
    on recipe.id = access.recipe_id
   and recipe.status = 'active'
  join public.physical_economy_recipe_outputs as recipe_output
    on recipe_output.recipe_id = recipe.id
   and recipe_output.item_key = v_output_item.canonical_key
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
    and access.business_id = v_business.id
    and access.revoked_at is null
    and (
      cardinality(availability.country_codes) = 0
      or v_business.country_code = any(availability.country_codes)
    )
  limit 1;

  v_request_hash := encode(
    extensions.digest(
      concat_ws(
        '|',
        p_game_session_id,
        p_player_id,
        v_business.id,
        v_product.id,
        v_recipe.id,
        v_output_item.id,
        p_quantity,
        lower(btrim(p_priority))
      ),
      'sha256'
    ),
    'hex'
  );

  select job_row.*
  into v_existing
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.requested_by_player_id = p_player_id
    and job_row.idempotency_key = btrim(p_idempotency_key)
  for share;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return query select
      v_existing.public_key,
      v_business.public_key,
      v_product.public_key,
      v_recipe.recipe_key,
      v_output_item.public_key,
      v_existing.status,
      v_existing.quantity,
      v_existing.output_quantity,
      v_existing.duration_seconds,
      v_existing.material_cost_basis,
      v_existing.labor_cost_basis,
      coalesce((
        select sum(hold.reserved_minutes)::integer
        from public.business_manufacturing_labor_holds as hold
        where hold.game_session_id = p_game_session_id
          and hold.job_id = v_existing.id
      ), 0),
      coalesce((
        select sum(hold.reserved_minutes)::integer
        from public.business_manufacturing_equipment_holds as hold
        where hold.game_session_id = p_game_session_id
          and hold.job_id = v_existing.id
      ), 0),
      v_existing.queue_available_at,
      true;
    return;
  end if;

  select count(*)::integer
  into v_material_requirement_count
  from public.physical_economy_recipe_inputs as recipe_input
  where recipe_input.recipe_id = v_recipe.id;
  if v_material_requirement_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_REQUIREMENTS_MISSING'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_resolved_material_count
  from public.physical_economy_recipe_inputs as recipe_input
  join public.game_items as item
    on item.game_session_id = p_game_session_id
   and item.canonical_key = recipe_input.item_key
   and item.status = 'active'
  where recipe_input.recipe_id = v_recipe.id;
  if v_resolved_material_count <> v_material_requirement_count then
    raise exception 'BUSINESS_MANUFACTURING_INPUT_ITEM_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_labor_requirement_count
  from public.business_recipe_labor_requirements as requirement
  where requirement.recipe_definition_id = v_recipe.id
    and requirement.status = 'active';
  if v_labor_requirement_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_REQUIREMENTS_MISSING'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_equipment_requirement_count
  from public.business_recipe_equipment_requirements as requirement
  where requirement.recipe_definition_id = v_recipe.id
    and requirement.status = 'active';

  if exists (
    select 1
    from unnest(v_recipe.required_tools) as required_tool(tool_key)
    where lower(btrim(required_tool.tool_key)) ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
      and not exists (
        select 1
        from public.business_recipe_equipment_requirements as requirement
        where requirement.recipe_definition_id = v_recipe.id
          and requirement.capability_key = lower(btrim(required_tool.tool_key))
          and requirement.status = 'active'
      )
  ) then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_REQUIREMENTS_STALE'
      using errcode = 'P0001';
  end if;

  v_duration := public.derive_business_manufacturing_duration_seconds_v2(
    p_game_session_id,
    v_business.id,
    v_recipe.id,
    p_quantity,
    lower(btrim(p_priority))
  );
  v_output_bigint := v_output_line.quantity::bigint * p_quantity::bigint;
  if v_output_bigint not between 1 and 2000000000 then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_QUANTITY_UNSUPPORTED'
      using errcode = 'P0001';
  end if;
  v_output_quantity := v_output_bigint::integer;

  v_job_id := gen_random_uuid();
  v_job_public_key := 'mfg_' || encode(gen_random_bytes(16), 'hex');
  v_intent_ref := v_job_public_key;

  v_warehouse_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'warehouse'
  );
  v_wip_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'work_in_progress'
  );

  for v_input in
    select
      recipe_input.id as recipe_input_id,
      recipe_input.line_key,
      recipe_input.base_quantity,
      recipe_input.role,
      item.id as game_item_id,
      item.public_key as item_key,
      item.canonical_key
    from public.physical_economy_recipe_inputs as recipe_input
    join public.game_items as item
      on item.game_session_id = p_game_session_id
     and item.canonical_key = recipe_input.item_key
     and item.status = 'active'
    where recipe_input.recipe_id = v_recipe.id
    order by item.public_key, recipe_input.line_key
  loop
    v_required_bigint := v_input.base_quantity::bigint * p_quantity::bigint;
    if v_required_bigint not between 1 and 2000000000 then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNSUPPORTED:%',
        v_input.line_key using errcode = 'P0001';
    end if;
    v_required := v_required_bigint::integer;

    select holding.*
    into v_warehouse_holding
    from public.inventory_holdings as holding
    where holding.game_session_id = p_game_session_id
      and holding.inventory_account_id = v_warehouse_account_id
      and holding.game_item_id = v_input.game_item_id
    for update;
    if not found
      or v_warehouse_holding.quantity_owned - v_warehouse_holding.quantity_reserved < v_required
    then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_UNAVAILABLE:%:%',
        v_input.canonical_key, v_required using errcode = 'P0001';
    end if;
    if v_warehouse_holding.cost_currency_code is not null
      and v_warehouse_holding.cost_currency_code <> v_business.currency_code
    then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_CURRENCY_MISMATCH:%',
        v_input.canonical_key using errcode = 'P0001';
    end if;

    select holding.*
    into v_wip_holding
    from public.inventory_holdings as holding
    where holding.game_session_id = p_game_session_id
      and holding.inventory_account_id = v_wip_account_id
      and holding.game_item_id = v_input.game_item_id
    for update;
    if found
      and v_wip_holding.quantity_owned > 0
      and v_wip_holding.cost_currency_code is not null
      and v_wip_holding.cost_currency_code <> v_business.currency_code
    then
      raise exception 'BUSINESS_MANUFACTURING_WIP_CURRENCY_MISMATCH:%',
        v_input.canonical_key using errcode = 'P0001';
    end if;

    v_transfer_result := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'transfer',
      'business',
      'manufacturing_material_to_wip',
      v_job_id,
      'mfgwip:' || substr(
        encode(
          extensions.digest(v_job_public_key || ':' || v_input.line_key, 'sha256'),
          'hex'
        ),
        1,
        48
      ),
      jsonb_build_object(
        'jobKey', v_job_public_key,
        'businessKey', v_business.public_key,
        'productKey', v_product.public_key,
        'recipeKey', v_recipe.recipe_key,
        'inputLineKey', v_input.line_key,
        'itemKey', v_input.canonical_key,
        'quantity', v_required,
        'role', v_input.role,
        'direction', 'warehouse_to_wip'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'inventoryAccountId', v_warehouse_account_id,
          'gameItemId', v_input.game_item_id,
          'quantityDelta', -v_required,
          'reservationDelta', 0,
          'unitCost', v_warehouse_holding.average_unit_cost,
          'currencyCode', coalesce(
            v_warehouse_holding.cost_currency_code,
            v_business.currency_code
          ),
          'metadata', jsonb_build_object(
            'jobKey', v_job_public_key,
            'side', 'business_warehouse'
          )
        ),
        jsonb_build_object(
          'inventoryAccountId', v_wip_account_id,
          'gameItemId', v_input.game_item_id,
          'quantityDelta', v_required,
          'reservationDelta', 0,
          'unitCost', v_warehouse_holding.average_unit_cost,
          'currencyCode', coalesce(
            v_warehouse_holding.cost_currency_code,
            v_business.currency_code
          ),
          'metadata', jsonb_build_object(
            'jobKey', v_job_public_key,
            'side', 'business_wip'
          )
        )
      )
    );
    begin
      v_transfer_transaction_id := (v_transfer_result ->> 'transactionId')::uuid;
    exception when invalid_text_representation then
      raise exception 'BUSINESS_MANUFACTURING_WIP_TRANSACTION_INVALID'
        using errcode = 'P0001';
    end;
    if v_transfer_transaction_id is null then
      raise exception 'BUSINESS_MANUFACTURING_WIP_TRANSACTION_MISSING'
        using errcode = 'P0001';
    end if;

    insert into public.business_manufacturing_material_holds(
      game_session_id,
      job_id,
      recipe_input_id,
      game_item_id,
      warehouse_account_id,
      wip_account_id,
      transfer_inventory_transaction_id,
      required_quantity,
      unit_cost,
      currency_code,
      status
    ) values (
      p_game_session_id,
      v_job_id,
      v_input.recipe_input_id,
      v_input.game_item_id,
      v_warehouse_account_id,
      v_wip_account_id,
      v_transfer_transaction_id,
      v_required,
      v_warehouse_holding.average_unit_cost,
      coalesce(v_warehouse_holding.cost_currency_code, v_business.currency_code),
      'held'
    );

    v_material_count := v_material_count + 1;
    v_material_cost := v_material_cost
      + v_required * v_warehouse_holding.average_unit_cost;
  end loop;
  v_material_cost := round(v_material_cost, 4);

  v_payroll_period_key := public.current_business_payroll_period_key_v2(
    p_game_session_id,
    v_business.id
  );

  for v_labor_requirement in
    select
      requirement.id as requirement_id,
      requirement.public_key as requirement_key,
      requirement.role_definition_id,
      role.role_key,
      requirement.fixed_labor_minutes_per_run,
      requirement.labor_minutes_per_unit,
      requirement.minimum_headcount,
      requirement.minimum_skill_basis_points
    from public.business_recipe_labor_requirements as requirement
    join public.business_workforce_role_definitions as role
      on role.id = requirement.role_definition_id
     and role.status = 'active'
    where requirement.recipe_definition_id = v_recipe.id
      and requirement.status = 'active'
    order by role.role_key, requirement.public_key
  loop
    v_required_total := v_labor_requirement.fixed_labor_minutes_per_run
      + v_labor_requirement.labor_minutes_per_unit * p_quantity;
    if v_required_total < v_labor_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_REQUIREMENT_INVALID:%',
        v_labor_requirement.role_key using errcode = 'P0001';
    end if;

    select
      count(*)::integer,
      count(*) filter (
        where employee.skill_basis_points >= v_labor_requirement.minimum_skill_basis_points
      )::integer,
      coalesce(sum(
        case
          when employee.skill_basis_points >= v_labor_requirement.minimum_skill_basis_points
          then greatest(employee.labor_minutes_per_cycle - coalesce(used.used_minutes, 0), 0)
          else 0
        end
      ), 0)::integer
    into v_role_count, v_skill_count, v_available_capacity
    from public.business_employees as employee
    left join lateral (
      select coalesce(sum(reservation.reserved_minutes), 0)::integer as used_minutes
      from public.business_labor_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.employee_id = employee.id
        and reservation.period_key = v_payroll_period_key
        and reservation.status in ('reserved','active','consumed')
    ) as used on true
    where employee.game_session_id = p_game_session_id
      and employee.business_id = v_business.id
      and employee.status = 'active'
      and employee.workforce_source_type in ('candidate_v2','migration_v2')
      and employee.workforce_role_definition_id = v_labor_requirement.role_definition_id;

    if v_role_count < v_labor_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE:%',
        v_labor_requirement.role_key using errcode = 'P0001';
    elsif v_skill_count < v_labor_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_SKILL_UNAVAILABLE:%',
        v_labor_requirement.role_key using errcode = 'P0001';
    elsif v_available_capacity < v_required_total then
      raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%',
        v_labor_requirement.role_key using errcode = 'P0001';
    end if;

    v_required_remaining := v_required_total;
    v_headcount_remaining := v_labor_requirement.minimum_headcount;

    for v_employee in
      select
        employee.id,
        employee.public_key,
        employee.wage_per_cycle,
        employee.labor_minutes_per_cycle,
        greatest(
          employee.labor_minutes_per_cycle - coalesce(used.used_minutes, 0),
          0
        )::integer as available_minutes
      from public.business_employees as employee
      left join lateral (
        select coalesce(sum(reservation.reserved_minutes), 0)::integer as used_minutes
        from public.business_labor_reservations as reservation
        where reservation.game_session_id = p_game_session_id
          and reservation.employee_id = employee.id
          and reservation.period_key = v_payroll_period_key
          and reservation.status in ('reserved','active','consumed')
      ) as used on true
      where employee.game_session_id = p_game_session_id
        and employee.business_id = v_business.id
        and employee.status = 'active'
        and employee.workforce_source_type in ('candidate_v2','migration_v2')
        and employee.workforce_role_definition_id = v_labor_requirement.role_definition_id
        and employee.skill_basis_points >= v_labor_requirement.minimum_skill_basis_points
      order by employee.public_key
      for update of employee
    loop
      exit when v_required_remaining <= 0 and v_headcount_remaining <= 0;
      if v_employee.available_minutes <= 0 then
        continue;
      end if;
      if v_headcount_remaining > 0 then
        v_allocate := least(
          v_employee.available_minutes,
          greatest(1, v_required_remaining - (v_headcount_remaining - 1))
        );
      else
        v_allocate := least(v_employee.available_minutes, v_required_remaining);
      end if;
      if v_allocate <= 0 then
        continue;
      end if;

      begin
        select result_row.*
        into v_labor_result
        from public.reserve_business_labor_v2(
          p_game_session_id,
          v_business.public_key,
          v_employee.public_key,
          v_labor_requirement.role_key,
          v_payroll_period_key,
          v_allocate,
          'production_job',
          v_job_public_key || ':labor:'
            || substr(v_labor_requirement.requirement_key, 5, 12)
            || ':' || substr(v_employee.public_key, 5, 12),
          null,
          'mfgl:' || substr(
            encode(
              extensions.digest(
                v_job_public_key || ':' || v_labor_requirement.requirement_key
                  || ':' || v_employee.public_key,
                'sha256'
              ),
              'hex'
            ),
            1,
            48
          )
        ) as result_row;
      exception when raise_exception then
        if position('BUSINESS_LABOR_CAPACITY_EXCEEDED' in sqlerrm) > 0 then
          raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%',
            v_labor_requirement.role_key using errcode = 'P0001';
        end if;
        raise;
      end;

      select reservation.*
      into v_labor_reservation
      from public.business_labor_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.public_key = v_labor_result.reservation_key
      for share;
      if not found then
        raise exception 'BUSINESS_MANUFACTURING_LABOR_RESERVATION_MISSING'
          using errcode = 'P0001';
      end if;

      insert into public.business_manufacturing_labor_holds(
        game_session_id,
        job_id,
        labor_reservation_id,
        requirement_id,
        reserved_minutes,
        wage_cost_basis,
        status
      ) values (
        p_game_session_id,
        v_job_id,
        v_labor_reservation.id,
        v_labor_requirement.requirement_id,
        v_allocate,
        round(
          v_employee.wage_per_cycle
            * v_allocate::numeric
            / v_employee.labor_minutes_per_cycle::numeric,
          4
        ),
        'held'
      );

      v_labor_count := v_labor_count + 1;
      v_labor_minutes := v_labor_minutes + v_allocate;
      v_labor_cost := v_labor_cost + round(
        v_employee.wage_per_cycle
          * v_allocate::numeric
          / v_employee.labor_minutes_per_cycle::numeric,
        4
      );
      v_required_remaining := greatest(v_required_remaining - v_allocate, 0);
      if v_headcount_remaining > 0 then
        v_headcount_remaining := v_headcount_remaining - 1;
      end if;
    end loop;

    if v_required_remaining > 0 or v_headcount_remaining > 0 then
      raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%',
        v_labor_requirement.role_key using errcode = 'P0001';
    end if;
  end loop;
  v_labor_cost := round(v_labor_cost, 4);

  if v_equipment_requirement_count > 0 then
    v_equipment_period_key := public.current_business_equipment_period_key_v2(
      p_game_session_id,
      v_business.id
    );
  end if;

  for v_equipment_requirement in
    select requirement.*
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_recipe.id
      and requirement.status = 'active'
    order by requirement.capability_key, requirement.public_key
  loop
    v_required_total := v_equipment_requirement.fixed_equipment_minutes_per_run
      + v_equipment_requirement.equipment_minutes_per_unit * p_quantity;
    if v_required_total <= 0
      or v_required_total < v_equipment_requirement.minimum_instance_count
    then
      raise exception 'BUSINESS_EQUIPMENT_REQUIREMENT_INVALID:%',
        v_equipment_requirement.capability_key using errcode = 'P0001';
    end if;

    v_required_remaining := v_required_total;
    v_instances_remaining := v_equipment_requirement.minimum_instance_count;
    v_instances_used := 0;

    for v_candidate in
      select
        installation.id as installation_id,
        installation.public_key as installation_key,
        instance.id as instance_id,
        profile.base_capacity_minutes_per_period as capacity_minutes
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
      where installation.game_session_id = p_game_session_id
        and installation.business_id = v_business.id
        and installation.status = 'installed'
        and v_equipment_requirement.capability_key = any(profile.capability_keys)
      order by installation.public_key
    loop
      exit when v_required_remaining <= 0 and v_instances_remaining <= 0;

      perform 1
      from public.business_equipment_installations as locked_installation
      join public.equipment_instances as locked_instance
        on locked_instance.game_session_id = locked_installation.game_session_id
       and locked_instance.id = locked_installation.equipment_instance_id
      where locked_installation.game_session_id = p_game_session_id
        and locked_installation.id = v_candidate.installation_id
        and locked_installation.status = 'installed'
        and locked_instance.status = 'active'
      for update of locked_installation, locked_instance;
      if not found then
        continue;
      end if;

      select coalesce(sum(reservation.reserved_minutes), 0)::integer
      into v_used_minutes
      from public.business_equipment_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.installation_id = v_candidate.installation_id
        and reservation.period_key = v_equipment_period_key
        and reservation.status in ('reserved','active','consumed');
      v_available_minutes := greatest(
        v_candidate.capacity_minutes - v_used_minutes,
        0
      );
      if v_available_minutes <= 0 then
        continue;
      end if;

      if v_instances_remaining > 0 then
        v_allocate := least(
          v_available_minutes,
          greatest(1, v_required_remaining - (v_instances_remaining - 1))
        );
      else
        v_allocate := least(v_available_minutes, v_required_remaining);
      end if;
      if v_allocate <= 0 then
        continue;
      end if;

      select result_row.*
      into v_equipment_result
      from public.reserve_business_equipment_v2(
        p_game_session_id,
        v_business.public_key,
        v_candidate.installation_key,
        v_equipment_requirement.public_key,
        v_equipment_period_key,
        v_allocate,
        v_job_public_key || ':equipment:'
          || substr(v_equipment_requirement.public_key, 5, 12),
        'mfge:' || substr(
          encode(
            extensions.digest(
              v_job_public_key || ':' || v_equipment_requirement.public_key
                || ':' || v_candidate.installation_key,
              'sha256'
            ),
            'hex'
          ),
          1,
          48
        )
      ) as result_row;

      select reservation.*
      into v_equipment_reservation
      from public.business_equipment_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.public_key = v_equipment_result.reservation_key
      for share;
      if not found then
        raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_RESERVATION_MISSING'
          using errcode = 'P0001';
      end if;

      insert into public.business_manufacturing_equipment_holds(
        game_session_id,
        job_id,
        equipment_reservation_id,
        requirement_id,
        reserved_minutes,
        status
      ) values (
        p_game_session_id,
        v_job_id,
        v_equipment_reservation.id,
        v_equipment_requirement.id,
        v_allocate,
        'held'
      );

      v_equipment_count := v_equipment_count + 1;
      v_equipment_minutes := v_equipment_minutes + v_allocate;
      v_required_remaining := greatest(v_required_remaining - v_allocate, 0);
      if v_instances_remaining > 0 then
        v_instances_remaining := v_instances_remaining - 1;
      end if;
      v_instances_used := v_instances_used + 1;
    end loop;

    if v_instances_used < v_equipment_requirement.minimum_instance_count then
      raise exception 'BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE:%',
        v_equipment_requirement.capability_key using errcode = 'P0001';
    elsif v_required_remaining > 0 then
      raise exception 'BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE:%',
        v_equipment_requirement.capability_key using errcode = 'P0001';
    end if;
  end loop;

  insert into public.business_manufacturing_jobs(
    id,
    public_key,
    game_session_id,
    business_id,
    product_id,
    recipe_definition_id,
    output_game_item_id,
    requested_by_player_id,
    idempotency_key,
    request_hash,
    quantity,
    priority,
    status,
    resource_state,
    duration_seconds,
    recipe_snapshot,
    queue_available_at,
    completion_next_attempt_at,
    output_quantity,
    resource_manifest_status,
    material_hold_count,
    labor_reservation_count,
    equipment_reservation_count,
    material_cost_basis,
    labor_cost_basis,
    payroll_period_key,
    equipment_period_key
  ) values (
    v_job_id,
    v_job_public_key,
    p_game_session_id,
    v_business.id,
    v_product.id,
    v_recipe.id,
    v_output_item.id,
    p_player_id,
    btrim(p_idempotency_key),
    v_request_hash,
    p_quantity,
    lower(btrim(p_priority)),
    'queued',
    'reserved',
    v_duration,
    '{}'::jsonb,
    v_now,
    v_now,
    v_output_quantity,
    'verified',
    v_material_count,
    v_labor_count,
    v_equipment_count,
    v_material_cost,
    v_labor_cost,
    v_payroll_period_key,
    v_equipment_period_key
  )
  returning * into v_job;

  insert into public.business_manufacturing_job_transitions(
    game_session_id,
    job_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    action,
    idempotency_key,
    outcome
  ) values (
    p_game_session_id,
    v_job.id,
    null,
    'queued',
    'player',
    p_player_id,
    'business.manufacturing.queued',
    'player:queue:' || v_job.public_key,
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'businessKey', v_business.public_key,
      'productKey', v_product.public_key,
      'recipeKey', v_recipe.recipe_key,
      'quantity', v_job.quantity,
      'outputQuantity', v_job.output_quantity,
      'durationSeconds', v_job.duration_seconds,
      'materialHoldCount', v_job.material_hold_count,
      'laborReservationCount', v_job.labor_reservation_count,
      'equipmentReservationCount', v_job.equipment_reservation_count
    )
  );

  insert into public.audit_log(
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.manufacturing.queued',
    'business_manufacturing_job',
    v_job.id,
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'businessKey', v_business.public_key,
      'productKey', v_product.public_key,
      'recipeKey', v_recipe.recipe_key,
      'outputItemKey', v_output_item.public_key,
      'quantity', v_job.quantity,
      'outputQuantity', v_job.output_quantity,
      'durationSeconds', v_job.duration_seconds,
      'materialCostBasis', v_job.material_cost_basis,
      'laborCostBasis', v_job.labor_cost_basis,
      'reservedLaborMinutes', v_labor_minutes,
      'reservedEquipmentMinutes', v_equipment_minutes,
      'idempotencyKey', btrim(p_idempotency_key),
      'timingAuthority', 'server_v2',
      'resourceAuthority', 'canonical_reserved_v2'
    )
  );

  return query select
    v_job.public_key,
    v_business.public_key,
    v_product.public_key,
    v_recipe.recipe_key,
    v_output_item.public_key,
    v_job.status,
    v_job.quantity,
    v_job.output_quantity,
    v_job.duration_seconds,
    v_job.material_cost_basis,
    v_job.labor_cost_basis,
    v_labor_minutes,
    v_equipment_minutes,
    v_job.queue_available_at,
    false;
end
$function$;

revoke all on function public.start_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.start_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) to service_role;

create or replace function public.activate_business_manufacturing_resource_holds_v2(
  p_game_session_id uuid,
  p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
  v_count integer;
  v_now timestamptz := statement_timestamp();
begin
  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.id = p_job_id
    and job_row.status = 'queued'
    and job_row.resource_state = 'reserved'
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_QUEUED'
      using errcode = 'P0001';
  end if;

  update public.business_manufacturing_material_holds
  set status = 'active', activated_at = v_now
  where game_session_id = p_game_session_id
    and job_id = p_job_id
    and status = 'held';
  get diagnostics v_count = row_count;
  if v_count <> v_job.material_hold_count then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_ACTIVATION_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_labor_reservations as reservation
  set status = 'active', activated_at = v_now, updated_at = v_now
  from public.business_manufacturing_labor_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = p_job_id
    and hold.status = 'held'
    and reservation.game_session_id = hold.game_session_id
    and reservation.id = hold.labor_reservation_id
    and reservation.status = 'reserved';
  get diagnostics v_count = row_count;
  if v_count <> v_job.labor_reservation_count then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_ACTIVATION_CONFLICT'
      using errcode = 'P0001';
  end if;
  update public.business_manufacturing_labor_holds
  set status = 'active', activated_at = v_now
  where game_session_id = p_game_session_id
    and job_id = p_job_id
    and status = 'held';

  update public.business_equipment_reservations as reservation
  set status = 'active', activated_at = v_now
  from public.business_manufacturing_equipment_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = p_job_id
    and hold.status = 'held'
    and reservation.game_session_id = hold.game_session_id
    and reservation.id = hold.equipment_reservation_id
    and reservation.status = 'reserved';
  get diagnostics v_count = row_count;
  if v_count <> v_job.equipment_reservation_count then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_ACTIVATION_CONFLICT'
      using errcode = 'P0001';
  end if;
  update public.business_manufacturing_equipment_holds
  set status = 'active', activated_at = v_now
  where game_session_id = p_game_session_id
    and job_id = p_job_id
    and status = 'held';
end
$function$;

revoke all on function public.activate_business_manufacturing_resource_holds_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.activate_business_manufacturing_resource_holds_v2(uuid, uuid)
  to service_role;

create or replace function public.start_queued_business_manufacturing_jobs_v2(
  p_game_session_id uuid,
  p_batch_size integer default 25
)
returns table (
  job_id uuid,
  job_key text,
  business_id uuid,
  started_at timestamptz,
  completes_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_job public.business_manufacturing_jobs%rowtype;
  v_started public.business_manufacturing_jobs%rowtype;
begin
  if p_game_session_id is null
    or p_batch_size is null
    or p_batch_size not between 1 and 100
  then
    raise exception 'BUSINESS_MANUFACTURING_START_BATCH_INVALID'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
  ) then
    raise exception 'BUSINESS_MANUFACTURING_GAME_INACTIVE'
      using errcode = 'P0001';
  end if;

  for v_job in
    select job_row.*
    from public.business_manufacturing_jobs as job_row
    where job_row.game_session_id = p_game_session_id
      and job_row.status = 'queued'
      and job_row.resource_state = 'reserved'
      and job_row.resource_manifest_status = 'verified'
      and job_row.queue_available_at <= v_now
    order by job_row.queue_available_at, job_row.public_key
    for update skip locked
    limit p_batch_size
  loop
    perform public.activate_business_manufacturing_resource_holds_v2(
      p_game_session_id,
      v_job.id
    );

    update public.business_manufacturing_jobs
    set
      status = 'in_progress',
      started_at = v_now,
      completes_at = v_now + make_interval(secs => v_job.duration_seconds),
      completion_next_attempt_at = v_now
    where id = v_job.id
      and game_session_id = p_game_session_id
      and status = 'queued'
    returning * into v_started;

    if v_started.id is null then
      raise exception 'BUSINESS_MANUFACTURING_START_CONFLICT'
        using errcode = 'P0001';
    end if;

    insert into public.business_manufacturing_job_transitions(
      game_session_id,
      job_id,
      from_status,
      to_status,
      actor_type,
      actor_id,
      action,
      idempotency_key,
      outcome
    ) values (
      p_game_session_id,
      v_started.id,
      'queued',
      'in_progress',
      'system',
      null,
      'business.manufacturing.started',
      'system:start:' || v_started.public_key,
      jsonb_build_object(
        'jobKey', v_started.public_key,
        'startedAt', v_started.started_at,
        'completesAt', v_started.completes_at,
        'durationSeconds', v_started.duration_seconds,
        'materialHoldCount', v_started.material_hold_count,
        'laborReservationCount', v_started.labor_reservation_count,
        'equipmentReservationCount', v_started.equipment_reservation_count
      )
    )
    on conflict on constraint business_manufacturing_job_transitions_idempotency_unique
    do nothing;

    job_id := v_started.id;
    job_key := v_started.public_key;
    business_id := v_started.business_id;
    started_at := v_started.started_at;
    completes_at := v_started.completes_at;
    return next;
  end loop;
end
$function$;

revoke all on function public.start_queued_business_manufacturing_jobs_v2(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.start_queued_business_manufacturing_jobs_v2(uuid, integer)
  to service_role;

comment on function public.start_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) is
  'Atomic Phase 6B start boundary. Moves exact canonical BOM into WIP, reserves finite labor/equipment, and creates one queued job. No output is settled.';

commit;
