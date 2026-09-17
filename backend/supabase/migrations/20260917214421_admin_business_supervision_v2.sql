-- Phase 13: shared read-only Business projections. Player wrappers preserve ownership;
-- Admin selection never supplies or impersonates a Player. No tables or economic writes.
-- Roll forward only; no production application is authorized by this migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.resolve_business_read_scope_v2(
  p_game_session_id uuid, p_business_id uuid
) returns table (business_id uuid, business_key text, country_code text, currency_code text)
language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  return query select b.id, b.public_key, b.country_code, b.currency_code
  from public.business_entities b
  where b.game_session_id = p_game_session_id and b.id = p_business_id;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001'; end if;
end
$function$;
revoke all on function economy_private.resolve_business_read_scope_v2(uuid,uuid)
  from public, anon, authenticated, service_role;


-- Shared body from 20260821130000_business_stockroom_locations_v2.sql
create or replace function economy_private.read_business_stockroom_locations_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns table (
  business_key text,
  account_key text,
  location_key text,
  location_label text,
  item_count bigint,
  quantity_owned numeric,
  quantity_reserved numeric,
  quantity_available numeric
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_business record;
begin
  select * into v_business
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

  return query
  select
    v_business.business_key,
    account.public_key,
    account.account_kind,
    case account.account_kind
      when 'warehouse' then 'Warehouse / Materials'
      when 'work_in_progress' then 'Work in Progress'
      when 'finished_goods' then 'Finished Goods'
      when 'in_transit' then 'In Transit'
    end,
    count(item.id)::bigint,
    coalesce(sum(
      case when item.id is not null then holding.quantity_owned else 0 end
    ), 0)::numeric,
    coalesce(sum(
      case when item.id is not null then holding.quantity_reserved else 0 end
    ), 0)::numeric,
    coalesce(sum(
      case when item.id is not null
        then greatest(holding.quantity_owned - holding.quantity_reserved, 0)
        else 0
      end
    ), 0)::numeric
  from public.economic_parties as party
  join public.inventory_accounts as account
    on account.game_session_id = party.game_session_id
   and account.party_id = party.id
   and account.account_kind in (
     'warehouse',
     'work_in_progress',
     'finished_goods',
     'in_transit'
   )
   and account.status = 'active'
   and account.location_key is null
  left join public.inventory_holdings as holding
    on holding.game_session_id = account.game_session_id
   and holding.inventory_account_id = account.id
   and holding.quantity_owned > 0
  left join public.game_items as item
    on item.game_session_id = holding.game_session_id
   and item.id = holding.game_item_id
   and item.status = 'active'
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
  group by
    v_business.business_key,
    account.public_key,
    account.account_kind
  order by case account.account_kind
    when 'warehouse' then 1
    when 'work_in_progress' then 2
    when 'finished_goods' then 3
    when 'in_transit' then 4
    else 5
  end;
end
$function$;
revoke all on function economy_private.read_business_stockroom_locations_v2(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.read_owned_business_stockroom_locations_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  account_key text,
  location_key text,
  location_label text,
  item_count bigint,
  quantity_owned numeric,
  quantity_reserved numeric,
  quantity_available numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return query select * from economy_private.read_business_stockroom_locations_v2(p_game_session_id, v_business.business_id);
end
$function$;
revoke all on function public.read_owned_business_stockroom_locations_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_stockroom_locations_v2(uuid,uuid) to service_role;

-- Shared body from 20260902091000_business_stockroom_numeric_projection_v2.sql
create or replace function economy_private.read_business_stockroom_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns table (
  business_key text,
  account_key text,
  location_key text,
  item_key text,
  canonical_key text,
  item_name text,
  item_class text,
  item_subtype text,
  quantity_owned numeric,
  quantity_reserved numeric,
  quantity_available numeric,
  average_unit_cost numeric,
  cost_currency_code text,
  holding_version bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_business record;
begin
  select * into v_business
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

  return query
  select
    v_business.business_key,
    account.public_key,
    account.account_kind,
    item.public_key,
    item.canonical_key,
    item.name,
    item.item_class,
    item.subtype,
    holding.quantity_owned::numeric,
    holding.quantity_reserved::numeric,
    greatest(holding.quantity_owned - holding.quantity_reserved, 0)::numeric,
    holding.average_unit_cost::numeric,
    holding.cost_currency_code,
    holding.version
  from public.economic_parties as party
  join public.inventory_accounts as account
    on account.game_session_id = party.game_session_id
   and account.party_id = party.id
   and account.account_kind in (
     'warehouse',
     'work_in_progress',
     'finished_goods',
     'in_transit'
   )
   and account.status = 'active'
   and account.location_key is null
  join public.inventory_holdings as holding
    on holding.game_session_id = account.game_session_id
   and holding.inventory_account_id = account.id
  join public.game_items as item
    on item.game_session_id = holding.game_session_id
   and item.id = holding.game_item_id
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
    and holding.quantity_owned > 0
    and item.status = 'active'
  order by
    case account.account_kind
      when 'warehouse' then 1
      when 'work_in_progress' then 2
      when 'finished_goods' then 3
      when 'in_transit' then 4
      else 5
    end,
    item.item_class,
    item.name,
    item.canonical_key;
end
$function$;
revoke all on function economy_private.read_business_stockroom_v2(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.read_owned_business_stockroom_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  account_key text,
  location_key text,
  item_key text,
  canonical_key text,
  item_name text,
  item_class text,
  item_subtype text,
  quantity_owned numeric,
  quantity_reserved numeric,
  quantity_available numeric,
  average_unit_cost numeric,
  cost_currency_code text,
  holding_version bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return query select * from economy_private.read_business_stockroom_v2(p_game_session_id, v_business.business_id);
end
$function$;
revoke all on function public.read_owned_business_stockroom_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_stockroom_v2(uuid,uuid) to service_role;

-- Shared body from 20260902090000_business_equipment_read_period_projection_v2.sql
create or replace function economy_private.read_business_equipment_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns table (
  business_key text,
  installation_key text,
  equipment_key text,
  item_key text,
  canonical_key text,
  item_name text,
  equipment_slot text,
  capability_keys text[],
  installation_status text,
  period_key text,
  capacity_minutes integer,
  reserved_minutes integer,
  consumed_minutes integer,
  available_minutes integer,
  idle_minutes integer,
  utilization_basis_points integer,
  durability_supported boolean,
  repair_supported boolean
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_business record;
  v_period_number bigint;
  v_period_key text;
begin
  select *
  into v_business
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

  -- Phase 11 made current_business_payroll_period_key_v2() lazy-initializing
  -- and therefore VOLATILE. Player reads must project an existing clock only.
  -- A legacy Business with no clock is read as period 1, which is the same
  -- initial period command-side initialization will authoritatively create.
  select coalesce((
    select clock_row.current_period_number
    from public.business_payroll_clocks as clock_row
    where clock_row.game_session_id = p_game_session_id
      and clock_row.business_id = v_business.business_id
  ), 1::bigint)
  into v_period_number;

  v_period_key := 'equipment:' || v_period_number::text;

  return query
  select
    v_business.business_key,
    installation.public_key,
    instance.public_id,
    item.public_key,
    item.canonical_key,
    item.name,
    definition.equipment_slot,
    profile.capability_keys,
    installation.status,
    v_period_key,
    case when installation.status = 'installed'
      then profile.base_capacity_minutes_per_period else 0 end,
    coalesce(usage.reserved_minutes, 0),
    coalesce(usage.consumed_minutes, 0),
    case when installation.status = 'installed' then greatest(
      profile.base_capacity_minutes_per_period
        - coalesce(usage.committed_minutes, 0),
      0
    ) else 0 end,
    case when installation.status = 'installed' then greatest(
      profile.base_capacity_minutes_per_period
        - coalesce(usage.committed_minutes, 0),
      0
    ) else 0 end,
    case when installation.status = 'installed' then least(
      10000,
      greatest(
        0,
        round(
          10000.0 * coalesce(usage.committed_minutes, 0)
          / nullif(profile.base_capacity_minutes_per_period, 0)
        )::integer
      )
    ) else 0 end,
    false,
    false
  from public.business_equipment_installations as installation
  join public.equipment_instances as instance
    on instance.game_session_id = installation.game_session_id
   and instance.id = installation.equipment_instance_id
  join public.game_items as item
    on item.game_session_id = instance.game_session_id
   and item.id = instance.game_item_id
  join public.physical_economy_item_definitions as definition
    on definition.id = item.physical_item_definition_id
  join public.business_equipment_capacity_profiles as profile
    on profile.id = installation.capacity_profile_id
  left join lateral (
    select
      coalesce(sum(reservation.reserved_minutes) filter (
        where reservation.status in ('reserved','active')
      ), 0)::integer as reserved_minutes,
      coalesce(sum(reservation.reserved_minutes) filter (
        where reservation.status = 'consumed'
      ), 0)::integer as consumed_minutes,
      coalesce(sum(reservation.reserved_minutes) filter (
        where reservation.status in ('reserved','active','consumed')
      ), 0)::integer as committed_minutes
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = installation.game_session_id
      and reservation.installation_id = installation.id
      and reservation.period_key = v_period_key
  ) as usage on true
  where installation.game_session_id = p_game_session_id
    and installation.business_id = v_business.business_id
    and installation.status in ('installed','offline')
    and instance.status = 'active'
    and instance.player_id is null
    and instance.equipped_slot is null
    and item.status = 'active'
    and definition.status = 'active'
    and profile.status = 'active'
  order by item.name, instance.public_id;
end
$function$;
revoke all on function economy_private.read_business_equipment_v2(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.read_owned_business_equipment_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  installation_key text,
  equipment_key text,
  item_key text,
  canonical_key text,
  item_name text,
  equipment_slot text,
  capability_keys text[],
  installation_status text,
  period_key text,
  capacity_minutes integer,
  reserved_minutes integer,
  consumed_minutes integer,
  available_minutes integer,
  idle_minutes integer,
  utilization_basis_points integer,
  durability_supported boolean,
  repair_supported boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return query select * from economy_private.read_business_equipment_v2(p_game_session_id, v_business.business_id);
end
$function$;
revoke all on function public.read_owned_business_equipment_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_equipment_v2(uuid,uuid) to service_role;

-- Shared body from 20260822140300_business_production_labor_reservations_v2.sql
create or replace function economy_private.read_business_workforce_utilization_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_business record;
  v_period_key text;
  v_result jsonb;
begin
  select *
  into v_business
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

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
revoke all on function economy_private.read_business_workforce_utilization_v2(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.read_owned_business_workforce_utilization_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return economy_private.read_business_workforce_utilization_v2(p_game_session_id, v_business.business_id);
end
$function$;
revoke all on function public.read_owned_business_workforce_utilization_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_workforce_utilization_v2(uuid,uuid) to service_role;

-- Shared body from 20260823110100_business_manufacturing_worker_and_read_v2.sql
create or replace function economy_private.read_business_manufacturing_jobs_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns table (
  business_key text,
  job_key text,
  product_key text,
  recipe_key text,
  output_item_key text,
  output_canonical_key text,
  output_name text,
  status text,
  resource_state text,
  quantity integer,
  priority text,
  duration_seconds integer,
  queued_at timestamptz,
  started_at timestamptz,
  completes_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  completion_attempt_count integer,
  completion_blocked boolean,
  last_error_code text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
begin
  select *
  into v_business
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

  return query
  select
    v_business.business_key,
    job.public_key,
    product.public_key,
    recipe.recipe_key,
    output_item.public_key,
    output_item.canonical_key,
    output_item.name,
    job.status,
    job.resource_state,
    job.quantity,
    job.priority,
    job.duration_seconds,
    job.created_at,
    job.started_at,
    job.completes_at,
    job.completed_at,
    job.cancelled_at,
    job.failed_at,
    job.completion_attempt_count,
    (
      job.status = 'in_progress'
      and job.completion_attempt_count >= job.completion_max_attempts
    ),
    job.last_error_code
  from (
    select job_row.*
    from public.business_manufacturing_jobs as job_row
    where job_row.game_session_id = p_game_session_id
      and job_row.business_id = v_business.business_id
    order by job_row.created_at desc, job_row.public_key
    limit 200
  ) as job
  join public.business_products as product
    on product.game_session_id = job.game_session_id
   and product.id = job.product_id
  join public.physical_economy_recipe_definitions as recipe
    on recipe.id = job.recipe_definition_id
  join public.game_items as output_item
    on output_item.game_session_id = job.game_session_id
   and output_item.id = job.output_game_item_id
  order by job.created_at desc, job.public_key;
end
$function$;
revoke all on function economy_private.read_business_manufacturing_jobs_v2(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.read_owned_business_manufacturing_jobs_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  job_key text,
  product_key text,
  recipe_key text,
  output_item_key text,
  output_canonical_key text,
  output_name text,
  status text,
  resource_state text,
  quantity integer,
  priority text,
  duration_seconds integer,
  queued_at timestamptz,
  started_at timestamptz,
  completes_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  completion_attempt_count integer,
  completion_blocked boolean,
  last_error_code text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return query select * from economy_private.read_business_manufacturing_jobs_v2(p_game_session_id, v_business.business_id);
end
$function$;
revoke all on function public.read_owned_business_manufacturing_jobs_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_manufacturing_jobs_v2(uuid,uuid) to service_role;

-- Shared body from 20260902092000_business_workspace_read_projections_v2.sql
create or replace function economy_private.read_business_production_readiness_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
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
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

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
revoke all on function economy_private.read_business_production_readiness_v2(uuid,uuid)
  from public, anon, authenticated, service_role;

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
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return economy_private.read_business_production_readiness_v2(p_game_session_id, v_business.business_id);
end
$function$;
revoke all on function public.read_owned_business_production_readiness_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_production_readiness_v2(uuid,uuid) to service_role;

-- Shared body from 20260831101000_business_treasury_fx_commands_v1.sql
create or replace function economy_private.get_business_treasury_overview_v1(
  p_game_session_id uuid,
  p_business_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_generated_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  select * into v_business
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

  select jsonb_build_object(
    'business_key', v_business.business_key,
    'reporting_currency_code', upper(btrim(v_business.currency_code)),
    'generated_at', v_generated_at,
    'accounts', coalesce((
      select jsonb_agg(
        private.business_bank_account_public_json_v1(account_row.id)
        order by account_row.currency_code, account_row.public_key
      )
      from public.bank_accounts as account_row
      join public.economic_parties as party_row
        on party_row.id = account_row.party_id
       and party_row.game_session_id = account_row.game_session_id
      where account_row.game_session_id = p_game_session_id
        and account_row.account_kind = 'checking'
        and party_row.party_kind = 'business'
        and party_row.business_id = v_business.business_id
    ), '[]'::jsonb),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_account_key', source_account.public_key,
        'source_currency_code', source_value.currency_code,
        'target_currency_code', target_value.currency_code,
        'source_minor_unit', source_currency.decimal_places,
        'target_minor_unit', target_currency.decimal_places,
        'reference_rate', (
          target_value.units_per_eco / source_value.units_per_eco
        )::numeric(38, 18)::text,
        'fixing_key', fixing_row.public_key,
        'policy_version', policy_row.policy_version,
        'calculated_at', fixing_row.calculated_at,
        'effective_at', fixing_row.effective_at,
        'generated_at', fixing_row.created_at
      ) order by source_value.currency_code, target_value.currency_code)
      from private.fx_runtime_state as runtime
      join public.fx_fixings as fixing_row
        on fixing_row.id = runtime.current_fixing_id
       and fixing_row.game_session_id = runtime.game_session_id
      join public.fx_fixing_currency_values as source_value
        on source_value.fixing_id = fixing_row.id
       and source_value.game_session_id = fixing_row.game_session_id
      join public.fx_fixing_currency_values as target_value
        on target_value.fixing_id = fixing_row.id
       and target_value.game_session_id = fixing_row.game_session_id
      join public.currencies as source_currency
        on source_currency.code = source_value.currency_code
      join public.currencies as target_currency
        on target_currency.code = target_value.currency_code
      join public.fx_policy_versions as policy_row
        on policy_row.id = fixing_row.policy_version_id
      join public.bank_accounts as source_account
        on source_account.game_session_id = p_game_session_id
       and source_account.currency_code = source_value.currency_code
       and source_account.account_kind = 'checking'
       and source_account.status = 'active'
      join public.economic_parties as source_party
        on source_party.id = source_account.party_id
       and source_party.game_session_id = source_account.game_session_id
       and source_party.party_kind = 'business'
       and source_party.business_id = v_business.business_id
      where runtime.game_session_id = p_game_session_id
        and runtime.cutover_status = 'ready'
        and source_currency.status = 'active'
        and target_currency.status = 'active'
        and target_value.currency_code <> source_value.currency_code
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        private.fx_order_public_json_v1(recent_order.id)
        order by recent_order.submitted_at desc, recent_order.public_key desc
      )
      from (
        select order_row.id, order_row.submitted_at, order_row.public_key
        from public.fx_orders as order_row
        where order_row.game_session_id = p_game_session_id
          and order_row.business_id = v_business.business_id
        order by order_row.submitted_at desc, order_row.public_key desc
        limit 50
      ) as recent_order
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(
        private.fx_settlement_receipt_public_json_v1(recent_receipt.id)
        order by recent_receipt.settled_at desc, recent_receipt.public_key desc
      )
      from (
        select receipt_row.id, receipt_row.settled_at, receipt_row.public_key
        from public.fx_settlement_receipts as receipt_row
        join public.fx_orders as order_row on order_row.id = receipt_row.order_id
        where receipt_row.game_session_id = p_game_session_id
          and order_row.business_id = v_business.business_id
        order by receipt_row.settled_at desc, receipt_row.public_key desc
        limit 50
      ) as recent_receipt
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;
revoke all on function economy_private.get_business_treasury_overview_v1(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_business_treasury_overview_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return economy_private.get_business_treasury_overview_v1(p_game_session_id, v_business.business_id);
end
$function$;
revoke all on function public.get_business_treasury_overview_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_business_treasury_overview_v1(uuid,uuid) to service_role;

commit;
