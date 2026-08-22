-- Business V2 Phase 4C-B: couple canonical recipe labor to production.
--
-- Existing material and inventory settlement is retained as a compatibility
-- helper. Canonical recipe-backed production reserves finite employee minutes
-- in the current payroll period, records wage-rate labor allocation as cost
-- basis, and consumes the reservations exactly once. Recurring payroll remains
-- the only wage cash authority.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_production_runs
  add column if not exists canonical_recipe_id uuid null
    references public.physical_economy_recipe_definitions(id),
  add column if not exists payroll_period_key text null,
  add column if not exists reserved_labor_minutes integer not null default 0,
  add column if not exists labor_cost_basis numeric(14,2) not null default 0,
  add column if not exists labor_authority_mode text not null default 'compatibility_v1';

alter table public.business_production_runs
  add constraint business_production_runs_payroll_period_key_valid
    check (
      payroll_period_key is null
      or payroll_period_key ~ '^payroll:[1-9][0-9]*$'
    ),
  add constraint business_production_runs_reserved_labor_valid
    check (reserved_labor_minutes >= 0),
  add constraint business_production_runs_labor_cost_basis_valid
    check (labor_cost_basis >= 0),
  add constraint business_production_runs_labor_authority_mode_valid
    check (labor_authority_mode in ('compatibility_v1', 'canonical_recipe_v2')),
  add constraint business_production_runs_labor_authority_state_valid
    check (
      (
        labor_authority_mode = 'compatibility_v1'
        and canonical_recipe_id is null
        and payroll_period_key is null
        and reserved_labor_minutes = 0
        and labor_cost_basis = 0
      )
      or (
        labor_authority_mode = 'canonical_recipe_v2'
        and canonical_recipe_id is not null
        and payroll_period_key is not null
        and reserved_labor_minutes > 0
        and labor_cost_basis >= 0
      )
    );

comment on column public.business_production_runs.labor_cost_basis is
  'Managerial allocation from authoritative wage/capacity terms. This is not a second wage cash debit.';
comment on column public.business_production_runs.labor_authority_mode is
  'canonical_recipe_v2 means the run consumed finite candidate-backed employee minutes; compatibility_v1 makes no canonical workforce claim.';

-- Preserve the already-replayed inventory/material implementation as a bounded
-- helper. Phase 4C-A fixed business_products.unit_labor_cost at zero, therefore
-- this helper can no longer create a production_labor cash debit for new runs.
alter function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) rename to run_business_production_material_compat_v1;

create or replace function public.run_business_production_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_quantity integer,
  p_priority text,
  p_idempotency_key text
)
returns table (
  run_key text,
  status text,
  output_quantity integer,
  total_cost numeric,
  business_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_run public.business_production_runs%rowtype;
  v_material record;
  v_requirement record;
  v_employee record;
  v_reservation record;
  v_hash text;
  v_intent_ref text;
  v_recipe_id uuid;
  v_recipe_key text;
  v_recipe_matches integer := 0;
  v_requirement_count integer := 0;
  v_period_key text;
  v_role_count integer := 0;
  v_skill_count integer := 0;
  v_available_capacity integer := 0;
  v_required_total integer := 0;
  v_required_remaining integer := 0;
  v_headcount_remaining integer := 0;
  v_allocate integer := 0;
  v_reserved_total integer := 0;
  v_reservation_count integer := 0;
  v_consumed_count integer := 0;
  v_labor_cost numeric := 0;
  v_balance numeric := 0;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 10000 then
    raise exception 'PRODUCTION_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if p_priority not in ('standard', 'expedite') then
    raise exception 'PRODUCTION_PRIORITY_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.owner_player_id = p_player_id
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
    and product_row.status = 'active'
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_hash := encode(
    extensions.digest(
      concat_ws(
        '|',
        p_game_session_id,
        p_player_id,
        v_business.id,
        v_product.id,
        p_quantity,
        p_priority,
        v_product.product_kind,
        v_product.version
      ),
      'sha256'
    ),
    'hex'
  );

  -- Replays return before any new labor reservation is attempted.
  select run_row.*
  into v_run
  from public.business_production_runs as run_row
  where run_row.game_session_id = p_game_session_id
    and run_row.requested_by_player_id = p_player_id
    and run_row.idempotency_key = p_idempotency_key
  for share;
  if found then
    if v_run.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select balance_row.balance
    into v_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.player_id = p_player_id
      and balance_row.account_type = public.business_account_type_v1(v_business.public_key)
      and balance_row.currency_code = v_business.currency_code;
    return query select
      v_run.public_key,
      v_run.status,
      v_run.output_quantity,
      v_run.total_cost,
      coalesce(v_balance, 0),
      true;
    return;
  end if;

  -- A run may claim canonical workforce authority only when its physical output
  -- resolves to exactly one active recipe that this Business currently owns and
  -- that recipe is active for the same game/pack/country context.
  if v_product.product_kind = 'physical_good'
    and v_product.output_game_item_id is not null
  then
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

    if v_recipe_matches > 1 then
      raise exception 'BUSINESS_PRODUCTION_RECIPE_AMBIGUOUS' using errcode = 'P0001';
    end if;

    if v_recipe_matches = 1 then
      select recipe.id, recipe.recipe_key
      into v_recipe_id, v_recipe_key
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
      order by recipe.recipe_key
      limit 1;
    end if;
  end if;

  if v_recipe_id is not null then
    select count(*)::integer
    into v_requirement_count
    from public.business_recipe_labor_requirements as requirement
    where requirement.recipe_definition_id = v_recipe_id
      and requirement.status = 'active';
  end if;

  -- Products that cannot prove one canonical recipe with explicit labor remain
  -- compatibility-only. They make no claim on canonical workforce utilization.
  if v_recipe_id is null or v_requirement_count = 0 then
    select material_row.*
    into v_material
    from public.run_business_production_material_compat_v1(
      p_game_session_id,
      p_player_id,
      p_business_key,
      p_product_key,
      p_quantity,
      p_priority,
      p_idempotency_key
    ) as material_row;

    return query select
      v_material.run_key::text,
      v_material.status::text,
      v_material.output_quantity::integer,
      v_material.total_cost::numeric,
      v_material.business_balance::numeric,
      v_material.replayed::boolean;
    return;
  end if;

  v_period_key := public.current_business_payroll_period_key_v2(
    p_game_session_id,
    v_business.id
  );
  v_intent_ref := 'prod:' || substr(
    encode(
      extensions.digest(
        concat_ws(
          '|',
          p_game_session_id,
          p_player_id,
          v_business.id,
          v_product.id,
          p_idempotency_key
        ),
        'sha256'
      ),
      'hex'
    ),
    1,
    48
  );

  for v_requirement in
    select
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
    where requirement.recipe_definition_id = v_recipe_id
      and requirement.status = 'active'
    order by role.role_key, requirement.public_key
  loop
    v_required_total := v_requirement.fixed_labor_minutes_per_run
      + v_requirement.labor_minutes_per_unit * p_quantity;
    if v_required_total < v_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_REQUIREMENT_INVALID' using errcode = 'P0001';
    end if;

    select
      count(*)::integer,
      count(*) filter (
        where employee.skill_basis_points >= v_requirement.minimum_skill_basis_points
      )::integer,
      coalesce(sum(
        case
          when employee.skill_basis_points >= v_requirement.minimum_skill_basis_points
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
        and reservation.period_key = v_period_key
        and reservation.status in ('reserved', 'active', 'consumed')
    ) as used on true
    where employee.game_session_id = p_game_session_id
      and employee.business_id = v_business.id
      and employee.status = 'active'
      and employee.workforce_source_type in ('candidate_v2', 'migration_v2')
      and employee.workforce_role_definition_id = v_requirement.role_definition_id;

    if v_role_count < v_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE:%', v_requirement.role_key
        using errcode = 'P0001';
    end if;
    if v_skill_count < v_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_SKILL_UNAVAILABLE:%', v_requirement.role_key
        using errcode = 'P0001';
    end if;
    if v_available_capacity < v_required_total then
      raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%', v_requirement.role_key
        using errcode = 'P0001';
    end if;

    v_required_remaining := v_required_total;
    v_headcount_remaining := v_requirement.minimum_headcount;

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
          and reservation.period_key = v_period_key
          and reservation.status in ('reserved', 'active', 'consumed')
      ) as used on true
      where employee.game_session_id = p_game_session_id
        and employee.business_id = v_business.id
        and employee.status = 'active'
        and employee.workforce_source_type in ('candidate_v2', 'migration_v2')
        and employee.workforce_role_definition_id = v_requirement.role_definition_id
        and employee.skill_basis_points >= v_requirement.minimum_skill_basis_points
      order by employee.public_key
      for update of employee
    loop
      exit when v_required_remaining <= 0;
      if v_employee.available_minutes <= 0 then
        continue;
      end if;

      if v_headcount_remaining > 0 then
        v_allocate := least(
          v_employee.available_minutes,
          greatest(
            1,
            v_required_remaining - (v_headcount_remaining - 1)
          )
        );
      else
        v_allocate := least(v_employee.available_minutes, v_required_remaining);
      end if;

      if v_allocate <= 0 then
        continue;
      end if;

      begin
        select reservation_row.*
        into v_reservation
        from public.reserve_business_labor_v2(
          p_game_session_id,
          v_business.public_key,
          v_employee.public_key,
          v_requirement.role_key,
          v_period_key,
          v_allocate,
          'production_job',
          v_intent_ref || ':' || substr(v_requirement.requirement_key, 5, 8)
            || ':' || substr(v_employee.public_key, 5, 8),
          null,
          v_intent_ref || ':' || substr(
            encode(
              extensions.digest(
                v_requirement.requirement_key || ':' || v_employee.public_key,
                'sha256'
              ),
              'hex'
            ),
            1,
            32
          )
        ) as reservation_row;
      exception when raise_exception then
        if position('BUSINESS_LABOR_CAPACITY_EXCEEDED' in sqlerrm) > 0 then
          raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%', v_requirement.role_key
            using errcode = 'P0001';
        end if;
        raise;
      end;

      v_reserved_total := v_reserved_total + v_allocate;
      v_reservation_count := v_reservation_count + 1;
      v_labor_cost := v_labor_cost + round(
        v_employee.wage_per_cycle
          * v_allocate::numeric
          / v_employee.labor_minutes_per_cycle::numeric,
        4
      );
      v_required_remaining := v_required_remaining - v_allocate;
      if v_headcount_remaining > 0 then
        v_headcount_remaining := v_headcount_remaining - 1;
      end if;
    end loop;

    if v_required_remaining > 0 or v_headcount_remaining > 0 then
      raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%', v_requirement.role_key
        using errcode = 'P0001';
    end if;
  end loop;

  v_labor_cost := round(v_labor_cost, 2);

  -- Material settlement remains atomic with the reservations because this helper
  -- runs inside the same database transaction. Any material failure rolls the
  -- provisional reservations back automatically.
  select material_row.*
  into v_material
  from public.run_business_production_material_compat_v1(
    p_game_session_id,
    p_player_id,
    p_business_key,
    p_product_key,
    p_quantity,
    p_priority,
    p_idempotency_key
  ) as material_row;

  select run_row.*
  into v_run
  from public.business_production_runs as run_row
  where run_row.game_session_id = p_game_session_id
    and run_row.requested_by_player_id = p_player_id
    and run_row.public_key = v_material.run_key
  for update;
  if not found then
    raise exception 'BUSINESS_PRODUCTION_RUN_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.business_labor_reservations
  set
    production_run_id = v_run.id,
    status = 'consumed',
    consumed_at = statement_timestamp(),
    metadata = metadata || jsonb_build_object(
      'productionRunKey', v_run.public_key,
      'canonicalRecipeKey', v_recipe_key,
      'laborAuthorityMode', 'canonical_recipe_v2'
    ),
    updated_at = statement_timestamp()
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and period_key = v_period_key
    and reservation_kind = 'production_job'
    and source_reference_key like v_intent_ref || ':%'
    and status = 'reserved';
  get diagnostics v_consumed_count = row_count;

  if v_consumed_count <> v_reservation_count then
    raise exception 'BUSINESS_LABOR_RESERVATION_CONSUMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_production_runs
  set
    canonical_recipe_id = v_recipe_id,
    payroll_period_key = v_period_key,
    reserved_labor_minutes = v_reserved_total,
    labor_cost_basis = v_labor_cost,
    labor_cost = v_labor_cost,
    total_cost = round(input_cost + v_labor_cost, 2),
    labor_authority_mode = 'canonical_recipe_v2',
    ledger_entry_id = null
  where id = v_run.id
  returning * into v_run;

  select balance_row.balance
  into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = public.business_account_type_v1(v_business.public_key)
    and balance_row.currency_code = v_business.currency_code;

  return query select
    v_run.public_key,
    v_run.status,
    v_run.output_quantity,
    v_run.total_cost,
    coalesce(v_balance, 0),
    false;
end
$function$;

revoke all on function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) to service_role;

revoke all on function public.run_business_production_material_compat_v1(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.run_business_production_material_compat_v1(
  uuid, uuid, text, text, integer, text, text
) to service_role;

create or replace function public.read_owned_business_workforce_utilization_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business record;
  v_period_key text;
  v_result jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select 'payroll:' || coalesce(clock_row.current_period_number, 1)::text
  into v_period_key
  from (select 1) as seed
  left join public.business_payroll_clocks as clock_row
    on clock_row.game_session_id = p_game_session_id
   and clock_row.business_id = v_business.business_id;

  select jsonb_build_object(
    'businessKey', v_business.business_key,
    'payrollPeriodKey', v_period_key,
    'generatedAt', statement_timestamp(),
    'payroll', coalesce((
      select jsonb_build_object(
        'payrollRunKey', payroll.public_key,
        'periodKey', payroll.payroll_period_key,
        'status', payroll.status,
        'employeeCount', payroll.employee_count,
        'wageDue', payroll.gross_wages_due,
        'wagePaid', payroll.gross_wages_paid,
        'wageUnpaid', payroll.gross_wages_unpaid,
        'currencyCode', payroll.currency_code,
        'completedAt', payroll.completed_at
      )
      from public.business_payroll_runs as payroll
      where payroll.game_session_id = p_game_session_id
        and payroll.business_id = v_business.business_id
      order by payroll.created_at desc, payroll.public_key desc
      limit 1
    ), jsonb_build_object(
      'payrollRunKey', null,
      'periodKey', null,
      'status', 'not_settled',
      'employeeCount', 0,
      'wageDue', 0,
      'wagePaid', 0,
      'wageUnpaid', 0,
      'currencyCode', v_business.currency_code,
      'completedAt', null
    )),
    'employees', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'employeeKey', employee.public_key,
          'roleKey', role.role_key,
          'roleName', role.display_name,
          'status', employee.status,
          'workforceSource', employee.workforce_source_type,
          'capacityMinutes', coalesce(employee.labor_minutes_per_cycle, 0),
          'reservedMinutes', coalesce(usage.reserved_minutes, 0),
          'consumedMinutes', coalesce(usage.consumed_minutes, 0),
          'utilizedMinutes', coalesce(usage.reserved_minutes, 0)
            + coalesce(usage.consumed_minutes, 0),
          'availableMinutes', greatest(
            coalesce(employee.labor_minutes_per_cycle, 0)
              - coalesce(usage.reserved_minutes, 0)
              - coalesce(usage.consumed_minutes, 0),
            0
          ),
          'idleMinutes', greatest(
            coalesce(employee.labor_minutes_per_cycle, 0)
              - coalesce(usage.reserved_minutes, 0)
              - coalesce(usage.consumed_minutes, 0),
            0
          ),
          'utilizationBasisPoints', case
            when coalesce(employee.labor_minutes_per_cycle, 0) <= 0 then 0
            else least(
              10000,
              floor(
                10000.0
                * (
                  coalesce(usage.reserved_minutes, 0)
                  + coalesce(usage.consumed_minutes, 0)
                )
                / employee.labor_minutes_per_cycle
              )::integer
            )
          end,
          'latestPayrollStatus', coalesce(latest_entry.status, 'not_settled'),
          'wageDue', coalesce(latest_entry.wage_due, 0),
          'wagePaid', coalesce(latest_entry.wage_paid, 0),
          'wageUnpaid', coalesce(latest_entry.wage_unpaid, 0),
          'currencyCode', v_business.currency_code
        ) order by role.role_key, employee.public_key
      )
      from public.business_employees as employee
      left join public.business_workforce_role_definitions as role
        on role.id = employee.workforce_role_definition_id
      left join lateral (
        select
          coalesce(sum(reservation.reserved_minutes) filter (
            where reservation.status in ('reserved', 'active')
          ), 0)::integer as reserved_minutes,
          coalesce(sum(reservation.reserved_minutes) filter (
            where reservation.status = 'consumed'
          ), 0)::integer as consumed_minutes
        from public.business_labor_reservations as reservation
        where reservation.game_session_id = p_game_session_id
          and reservation.employee_id = employee.id
          and reservation.period_key = v_period_key
      ) as usage on true
      left join lateral (
        select
          payroll_entry.status,
          payroll_entry.wage_due,
          payroll_entry.wage_paid,
          payroll_entry.wage_unpaid
        from public.business_payroll_entries as payroll_entry
        join public.business_payroll_runs as payroll_run
          on payroll_run.game_session_id = payroll_entry.game_session_id
         and payroll_run.id = payroll_entry.payroll_run_id
        where payroll_entry.game_session_id = p_game_session_id
          and payroll_entry.employee_id = employee.id
        order by payroll_run.created_at desc, payroll_entry.public_key desc
        limit 1
      ) as latest_entry on true
      where employee.game_session_id = p_game_session_id
        and employee.business_id = v_business.business_id
        and employee.status = 'active'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.read_owned_business_workforce_utilization_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_workforce_utilization_v2(uuid, uuid)
  to service_role;

comment on function public.read_owned_business_workforce_utilization_v2(uuid, uuid) is
  'Browser-safe workforce utilization/payroll read. Returns public keys only; game/player/internal UUID scope remains server-owned.';

commit;
