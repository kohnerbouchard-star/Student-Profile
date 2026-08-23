-- Business V2 Phase 6B: canonical manufacturing resource manifest authority.
--
-- Manufacturing jobs may commit only when their exact canonical BOM transfer,
-- finite labor reservations, and finite installed-equipment reservations reconcile
-- under one game-scoped job. Resource links are immutable identity evidence and
-- are validated by deferred constraint triggers at transaction commit.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_manufacturing_jobs
  add column output_quantity integer not null default 1,
  add column resource_manifest_status text not null default 'verified',
  add column material_hold_count integer not null default 0,
  add column labor_reservation_count integer not null default 0,
  add column equipment_reservation_count integer not null default 0,
  add column material_cost_basis numeric(18,4) not null default 0,
  add column labor_cost_basis numeric(18,4) not null default 0,
  add column payroll_period_key text null,
  add column equipment_period_key text null;

alter table public.business_manufacturing_jobs
  add constraint business_manufacturing_jobs_output_quantity_check
    check (output_quantity between 1 and 2000000000),
  add constraint business_manufacturing_jobs_manifest_status_check
    check (resource_manifest_status = 'verified'),
  add constraint business_manufacturing_jobs_manifest_counts_check
    check (
      material_hold_count between 1 and 1000
      and labor_reservation_count between 1 and 10000
      and equipment_reservation_count between 0 and 10000
    ),
  add constraint business_manufacturing_jobs_cost_basis_check
    check (material_cost_basis >= 0 and labor_cost_basis >= 0),
  add constraint business_manufacturing_jobs_payroll_period_check
    check (payroll_period_key ~ '^payroll:[1-9][0-9]*$'),
  add constraint business_manufacturing_jobs_equipment_period_check
    check (
      (
        equipment_reservation_count = 0
        and equipment_period_key is null
      )
      or (
        equipment_reservation_count > 0
        and equipment_period_key ~ '^equipment:[1-9][0-9]*$'
      )
    );

alter table public.business_manufacturing_jobs
  alter column output_quantity drop default,
  alter column resource_manifest_status drop default;

comment on column public.business_manufacturing_jobs.resource_manifest_status is
  'verified means the deferred canonical material/labor/equipment manifest validator passed at commit.';
comment on column public.business_manufacturing_jobs.material_cost_basis is
  'Actual canonical Warehouse cost basis moved into WIP for this job.';
comment on column public.business_manufacturing_jobs.labor_cost_basis is
  'Managerial wage allocation from reserved employee minutes. This is not a second payroll cash debit.';

create unique index if not exists business_equipment_reservations_scope_id_unique
  on public.business_equipment_reservations(game_session_id, id);

create table public.business_manufacturing_material_holds (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('mhm_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  recipe_input_id uuid not null
    references public.physical_economy_recipe_inputs(id) on delete restrict,
  game_item_id uuid not null references public.game_items(id) on delete restrict,
  warehouse_account_id uuid not null
    references public.inventory_accounts(id) on delete restrict,
  wip_account_id uuid not null
    references public.inventory_accounts(id) on delete restrict,
  transfer_inventory_transaction_id uuid not null
    references public.inventory_transactions(id) on delete restrict,
  settlement_inventory_transaction_id uuid null
    references public.inventory_transactions(id) on delete restrict,
  required_quantity integer not null,
  unit_cost numeric(18,4) not null,
  currency_code text not null,
  status text not null default 'held',
  activated_at timestamptz null,
  consumed_at timestamptz null,
  released_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_material_holds_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade deferrable initially deferred,
  constraint business_manufacturing_material_holds_public_key_check
    check (public_key ~ '^mhm_[0-9a-f]{32}$'),
  constraint business_manufacturing_material_holds_quantity_check
    check (required_quantity between 1 and 2000000000),
  constraint business_manufacturing_material_holds_cost_check
    check (unit_cost >= 0),
  constraint business_manufacturing_material_holds_currency_check
    check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_manufacturing_material_holds_status_check
    check (status in ('held','active','consumed','released')),
  constraint business_manufacturing_material_holds_accounts_check
    check (warehouse_account_id <> wip_account_id),
  constraint business_manufacturing_material_holds_state_check check (
    (
      status = 'held'
      and activated_at is null
      and consumed_at is null
      and released_at is null
      and settlement_inventory_transaction_id is null
    )
    or (
      status = 'active'
      and activated_at is not null
      and consumed_at is null
      and released_at is null
      and settlement_inventory_transaction_id is null
    )
    or (
      status = 'consumed'
      and consumed_at is not null
      and released_at is null
      and settlement_inventory_transaction_id is not null
    )
    or (
      status = 'released'
      and released_at is not null
      and consumed_at is null
      and settlement_inventory_transaction_id is not null
    )
  ),
  constraint business_manufacturing_material_holds_input_unique
    unique (game_session_id, job_id, recipe_input_id),
  constraint business_manufacturing_material_holds_transfer_unique
    unique (transfer_inventory_transaction_id)
);

create table public.business_manufacturing_labor_holds (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('mlh_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  labor_reservation_id uuid not null,
  requirement_id uuid not null
    references public.business_recipe_labor_requirements(id) on delete restrict,
  reserved_minutes integer not null,
  wage_cost_basis numeric(18,4) not null,
  status text not null default 'held',
  activated_at timestamptz null,
  consumed_at timestamptz null,
  released_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_labor_holds_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade deferrable initially deferred,
  constraint business_manufacturing_labor_holds_reservation_scope_fk
    foreign key (game_session_id, labor_reservation_id)
    references public.business_labor_reservations(game_session_id, id)
    on delete restrict,
  constraint business_manufacturing_labor_holds_public_key_check
    check (public_key ~ '^mlh_[0-9a-f]{32}$'),
  constraint business_manufacturing_labor_holds_minutes_check
    check (reserved_minutes between 1 and 1000000),
  constraint business_manufacturing_labor_holds_cost_check
    check (wage_cost_basis >= 0),
  constraint business_manufacturing_labor_holds_status_check
    check (status in ('held','active','consumed','released')),
  constraint business_manufacturing_labor_holds_state_check check (
    (status = 'held' and activated_at is null and consumed_at is null and released_at is null)
    or (status = 'active' and activated_at is not null and consumed_at is null and released_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null)
    or (status = 'released' and released_at is not null and consumed_at is null)
  ),
  constraint business_manufacturing_labor_holds_reservation_unique
    unique (labor_reservation_id),
  constraint business_manufacturing_labor_holds_scope_unique
    unique (game_session_id, job_id, labor_reservation_id)
);

create table public.business_manufacturing_equipment_holds (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('meh_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  equipment_reservation_id uuid not null,
  requirement_id uuid not null
    references public.business_recipe_equipment_requirements(id) on delete restrict,
  reserved_minutes integer not null,
  status text not null default 'held',
  activated_at timestamptz null,
  consumed_at timestamptz null,
  released_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_equipment_holds_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade deferrable initially deferred,
  constraint business_manufacturing_equipment_holds_reservation_scope_fk
    foreign key (game_session_id, equipment_reservation_id)
    references public.business_equipment_reservations(game_session_id, id)
    on delete restrict,
  constraint business_manufacturing_equipment_holds_public_key_check
    check (public_key ~ '^meh_[0-9a-f]{32}$'),
  constraint business_manufacturing_equipment_holds_minutes_check
    check (reserved_minutes between 1 and 100000),
  constraint business_manufacturing_equipment_holds_status_check
    check (status in ('held','active','consumed','released')),
  constraint business_manufacturing_equipment_holds_state_check check (
    (status = 'held' and activated_at is null and consumed_at is null and released_at is null)
    or (status = 'active' and activated_at is not null and consumed_at is null and released_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null)
    or (status = 'released' and released_at is not null and consumed_at is null)
  ),
  constraint business_manufacturing_equipment_holds_reservation_unique
    unique (equipment_reservation_id),
  constraint business_manufacturing_equipment_holds_scope_unique
    unique (game_session_id, job_id, equipment_reservation_id)
);

create index business_manufacturing_material_holds_job_status_idx
  on public.business_manufacturing_material_holds(game_session_id, job_id, status);
create index business_manufacturing_labor_holds_job_status_idx
  on public.business_manufacturing_labor_holds(game_session_id, job_id, status);
create index business_manufacturing_equipment_holds_job_status_idx
  on public.business_manufacturing_equipment_holds(game_session_id, job_id, status);

create trigger set_business_manufacturing_material_holds_updated_at
before update on public.business_manufacturing_material_holds
for each row execute function public.set_current_timestamp_updated_at();
create trigger set_business_manufacturing_labor_holds_updated_at
before update on public.business_manufacturing_labor_holds
for each row execute function public.set_current_timestamp_updated_at();
create trigger set_business_manufacturing_equipment_holds_updated_at
before update on public.business_manufacturing_equipment_holds
for each row execute function public.set_current_timestamp_updated_at();

create or replace function economy_private.guard_business_manufacturing_material_hold_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_IMMUTABLE'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'held'
      or new.activated_at is not null
      or new.consumed_at is not null
      or new.released_at is not null
      or new.settlement_inventory_transaction_id is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_INITIAL_STATE_INVALID'
        using errcode = 'P0001';
    end if;
  else
    if new.game_session_id is distinct from old.game_session_id
      or new.job_id is distinct from old.job_id
      or new.recipe_input_id is distinct from old.recipe_input_id
      or new.game_item_id is distinct from old.game_item_id
      or new.warehouse_account_id is distinct from old.warehouse_account_id
      or new.wip_account_id is distinct from old.wip_account_id
      or new.transfer_inventory_transaction_id is distinct from old.transfer_inventory_transaction_id
      or new.required_quantity is distinct from old.required_quantity
      or new.unit_cost is distinct from old.unit_cost
      or new.currency_code is distinct from old.currency_code
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;
    if old.status = 'held' and new.status not in ('held','active','consumed','released') then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status = 'active' and new.status not in ('active','consumed','released') then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status in ('consumed','released') and new.status <> old.status then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_TERMINAL'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;

create or replace function economy_private.guard_business_manufacturing_labor_hold_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_IMMUTABLE'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'held'
      or new.activated_at is not null
      or new.consumed_at is not null
      or new.released_at is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_INITIAL_STATE_INVALID'
        using errcode = 'P0001';
    end if;
  else
    if new.game_session_id is distinct from old.game_session_id
      or new.job_id is distinct from old.job_id
      or new.labor_reservation_id is distinct from old.labor_reservation_id
      or new.requirement_id is distinct from old.requirement_id
      or new.reserved_minutes is distinct from old.reserved_minutes
      or new.wage_cost_basis is distinct from old.wage_cost_basis
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;
    if old.status = 'held' and new.status not in ('held','active','consumed','released') then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status = 'active' and new.status not in ('active','consumed','released') then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status in ('consumed','released') and new.status <> old.status then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_TERMINAL'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;

create or replace function economy_private.guard_business_manufacturing_equipment_hold_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_IMMUTABLE'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'held'
      or new.activated_at is not null
      or new.consumed_at is not null
      or new.released_at is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INITIAL_STATE_INVALID'
        using errcode = 'P0001';
    end if;
  else
    if new.game_session_id is distinct from old.game_session_id
      or new.job_id is distinct from old.job_id
      or new.equipment_reservation_id is distinct from old.equipment_reservation_id
      or new.requirement_id is distinct from old.requirement_id
      or new.reserved_minutes is distinct from old.reserved_minutes
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;
    if old.status = 'held' and new.status not in ('held','active','consumed','released') then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status = 'active' and new.status not in ('active','consumed','released') then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status in ('consumed','released') and new.status <> old.status then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_TERMINAL'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;

create trigger guard_business_manufacturing_material_hold_v2
before insert or update or delete on public.business_manufacturing_material_holds
for each row execute function economy_private.guard_business_manufacturing_material_hold_v2();
create trigger guard_business_manufacturing_labor_hold_v2
before insert or update or delete on public.business_manufacturing_labor_holds
for each row execute function economy_private.guard_business_manufacturing_labor_hold_v2();
create trigger guard_business_manufacturing_equipment_hold_v2
before insert or update or delete on public.business_manufacturing_equipment_holds
for each row execute function economy_private.guard_business_manufacturing_equipment_hold_v2();

create or replace function economy_private.validate_business_manufacturing_resource_manifest_v2(
  p_game_session_id uuid,
  p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
  v_expected_hold_status text;
  v_expected_labor_status text;
  v_expected_equipment_status text;
  v_input public.physical_economy_recipe_inputs%rowtype;
  v_labor_requirement public.business_recipe_labor_requirements%rowtype;
  v_equipment_requirement public.business_recipe_equipment_requirements%rowtype;
  v_expected_quantity bigint;
  v_count integer;
  v_distinct_count integer;
  v_sum integer;
  v_numeric_sum numeric;
  v_material_requirement_count integer;
  v_labor_requirement_count integer;
  v_equipment_requirement_count integer;
  v_output_line_count integer;
  v_expected_output bigint;
begin
  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.id = p_job_id
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_MANIFEST_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  v_expected_hold_status := case v_job.status
    when 'queued' then 'held'
    when 'in_progress' then 'active'
    when 'completed' then 'consumed'
    else 'released'
  end;
  v_expected_labor_status := case v_job.status
    when 'queued' then 'reserved'
    when 'in_progress' then 'active'
    when 'completed' then 'consumed'
    else 'released'
  end;
  v_expected_equipment_status := v_expected_labor_status;

  select count(*)::integer
  into v_material_requirement_count
  from public.physical_economy_recipe_inputs as recipe_input
  where recipe_input.recipe_id = v_job.recipe_definition_id;
  if v_material_requirement_count <= 0
    or v_job.material_hold_count <> v_material_requirement_count
  then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_MANIFEST_COUNT_INVALID'
      using errcode = 'P0001';
  end if;

  select count(*)::integer,
    round(coalesce(sum(hold.required_quantity * hold.unit_cost), 0), 4)
  into v_count, v_numeric_sum
  from public.business_manufacturing_material_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = p_job_id
    and hold.status = v_expected_hold_status;
  if v_count <> v_job.material_hold_count
    or v_numeric_sum is distinct from round(v_job.material_cost_basis, 4)
  then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_MANIFEST_TOTAL_INVALID'
      using errcode = 'P0001';
  end if;

  for v_input in
    select input_row.*
    from public.physical_economy_recipe_inputs as input_row
    where input_row.recipe_id = v_job.recipe_definition_id
    order by input_row.line_key
  loop
    v_expected_quantity := v_input.base_quantity::bigint * v_job.quantity::bigint;
    select count(*)::integer
    into v_count
    from public.business_manufacturing_material_holds as hold
    join public.game_items as item
      on item.id = hold.game_item_id
     and item.game_session_id = hold.game_session_id
     and item.status = 'active'
    join public.inventory_accounts as warehouse
      on warehouse.id = hold.warehouse_account_id
     and warehouse.game_session_id = hold.game_session_id
     and warehouse.account_kind = 'warehouse'
     and warehouse.status = 'active'
    join public.inventory_accounts as wip
      on wip.id = hold.wip_account_id
     and wip.game_session_id = hold.game_session_id
     and wip.account_kind = 'work_in_progress'
     and wip.status = 'active'
    join public.economic_parties as warehouse_party
      on warehouse_party.id = warehouse.party_id
     and warehouse_party.game_session_id = hold.game_session_id
     and warehouse_party.party_kind = 'business'
     and warehouse_party.business_id = v_job.business_id
     and warehouse_party.status = 'active'
    join public.economic_parties as wip_party
      on wip_party.id = wip.party_id
     and wip_party.game_session_id = hold.game_session_id
     and wip_party.party_kind = 'business'
     and wip_party.business_id = v_job.business_id
     and wip_party.status = 'active'
    join public.inventory_transactions as transaction_row
      on transaction_row.id = hold.transfer_inventory_transaction_id
     and transaction_row.game_session_id = hold.game_session_id
     and transaction_row.source_domain = 'business'
     and transaction_row.source_action = 'manufacturing_material_to_wip'
     and transaction_row.source_id = v_job.id
     and transaction_row.status = 'committed'
    where hold.game_session_id = p_game_session_id
      and hold.job_id = p_job_id
      and hold.recipe_input_id = v_input.id
      and hold.status = v_expected_hold_status
      and item.canonical_key = v_input.item_key
      and hold.required_quantity = v_expected_quantity::integer
      and hold.currency_code = v_job.recipe_snapshot ->> 'businessCurrencyCode'
      and (
        select count(*)
        from public.inventory_transaction_lines as transaction_line
        where transaction_line.game_session_id = hold.game_session_id
          and transaction_line.transaction_id = hold.transfer_inventory_transaction_id
          and transaction_line.game_item_id = hold.game_item_id
          and transaction_line.reservation_delta = 0
          and (
            (
              transaction_line.inventory_account_id = hold.warehouse_account_id
              and transaction_line.quantity_delta = -hold.required_quantity
            )
            or (
              transaction_line.inventory_account_id = hold.wip_account_id
              and transaction_line.quantity_delta = hold.required_quantity
            )
          )
      ) = 2;
    if v_count <> 1 then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_MANIFEST_LINE_INVALID:%',
        v_input.line_key using errcode = 'P0001';
    end if;
  end loop;

  select count(*)::integer,
    coalesce(sum(output_row.quantity::bigint * v_job.quantity::bigint), 0)
  into v_output_line_count, v_expected_output
  from public.physical_economy_recipe_outputs as output_row
  join public.game_items as output_item
    on output_item.game_session_id = v_job.game_session_id
   and output_item.id = v_job.output_game_item_id
   and output_item.canonical_key = output_row.item_key
  where output_row.recipe_id = v_job.recipe_definition_id;
  if v_output_line_count <> 1
    or v_expected_output <> v_job.output_quantity
  then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_MANIFEST_INVALID'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_labor_requirement_count
  from public.business_recipe_labor_requirements as requirement
  where requirement.recipe_definition_id = v_job.recipe_definition_id
    and requirement.status = 'active';
  if v_labor_requirement_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_REQUIREMENTS_MISSING'
      using errcode = 'P0001';
  end if;

  select count(*)::integer,
    round(coalesce(sum(hold.wage_cost_basis), 0), 4)
  into v_count, v_numeric_sum
  from public.business_manufacturing_labor_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = p_job_id
    and hold.status = v_expected_hold_status;
  if v_count <> v_job.labor_reservation_count
    or v_numeric_sum is distinct from round(v_job.labor_cost_basis, 4)
  then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_MANIFEST_TOTAL_INVALID'
      using errcode = 'P0001';
  end if;

  for v_labor_requirement in
    select requirement.*
    from public.business_recipe_labor_requirements as requirement
    where requirement.recipe_definition_id = v_job.recipe_definition_id
      and requirement.status = 'active'
    order by requirement.public_key
  loop
    select count(*)::integer,
      count(distinct reservation.employee_id)::integer,
      coalesce(sum(hold.reserved_minutes), 0)::integer
    into v_count, v_distinct_count, v_sum
    from public.business_manufacturing_labor_holds as hold
    join public.business_labor_reservations as reservation
      on reservation.game_session_id = hold.game_session_id
     and reservation.id = hold.labor_reservation_id
     and reservation.business_id = v_job.business_id
     and reservation.role_definition_id = v_labor_requirement.role_definition_id
     and reservation.period_key = v_job.payroll_period_key
     and reservation.reservation_kind = 'production_job'
     and reservation.source_reference_key like v_job.public_key || ':labor:%'
     and reservation.reserved_minutes = hold.reserved_minutes
    join public.business_employees as employee
      on employee.game_session_id = reservation.game_session_id
     and employee.id = reservation.employee_id
     and employee.business_id = v_job.business_id
     and employee.status = 'active'
     and employee.workforce_role_definition_id = v_labor_requirement.role_definition_id
     and employee.skill_basis_points >= v_labor_requirement.minimum_skill_basis_points
    where hold.game_session_id = p_game_session_id
      and hold.job_id = p_job_id
      and hold.requirement_id = v_labor_requirement.id
      and hold.status = v_expected_hold_status
      and (
        reservation.status = v_expected_labor_status
        or (
          v_expected_labor_status = 'released'
          and reservation.status = 'cancelled'
        )
      );
    if v_count <= 0
      or v_distinct_count < v_labor_requirement.minimum_headcount
      or v_sum <> (
        v_labor_requirement.fixed_labor_minutes_per_run
        + v_labor_requirement.labor_minutes_per_unit * v_job.quantity
      )
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_MANIFEST_REQUIREMENT_INVALID:%',
        v_labor_requirement.public_key using errcode = 'P0001';
    end if;
  end loop;

  select count(*)::integer
  into v_equipment_requirement_count
  from public.business_recipe_equipment_requirements as requirement
  where requirement.recipe_definition_id = v_job.recipe_definition_id
    and requirement.status = 'active';

  select count(*)::integer
  into v_count
  from public.business_manufacturing_equipment_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = p_job_id
    and hold.status = v_expected_hold_status;
  if v_count <> v_job.equipment_reservation_count
    or (
      v_equipment_requirement_count = 0
      and (v_job.equipment_reservation_count <> 0 or v_job.equipment_period_key is not null)
    )
    or (
      v_equipment_requirement_count > 0
      and (v_job.equipment_reservation_count <= 0 or v_job.equipment_period_key is null)
    )
  then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_MANIFEST_TOTAL_INVALID'
      using errcode = 'P0001';
  end if;

  for v_equipment_requirement in
    select requirement.*
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_job.recipe_definition_id
      and requirement.status = 'active'
    order by requirement.capability_key, requirement.public_key
  loop
    select count(*)::integer,
      count(distinct reservation.installation_id)::integer,
      coalesce(sum(hold.reserved_minutes), 0)::integer
    into v_count, v_distinct_count, v_sum
    from public.business_manufacturing_equipment_holds as hold
    join public.business_equipment_reservations as reservation
      on reservation.game_session_id = hold.game_session_id
     and reservation.id = hold.equipment_reservation_id
     and reservation.business_id = v_job.business_id
     and reservation.requirement_id = v_equipment_requirement.id
     and reservation.period_key = v_job.equipment_period_key
     and reservation.intent_ref like v_job.public_key || ':equipment:%'
     and reservation.reserved_minutes = hold.reserved_minutes
     and reservation.status = v_expected_equipment_status
    where hold.game_session_id = p_game_session_id
      and hold.job_id = p_job_id
      and hold.requirement_id = v_equipment_requirement.id
      and hold.status = v_expected_hold_status;
    if v_count <= 0
      or v_distinct_count < v_equipment_requirement.minimum_instance_count
      or v_sum <> (
        v_equipment_requirement.fixed_equipment_minutes_per_run
        + v_equipment_requirement.equipment_minutes_per_unit * v_job.quantity
      )
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_MANIFEST_REQUIREMENT_INVALID:%',
        v_equipment_requirement.public_key using errcode = 'P0001';
    end if;
  end loop;
end
$function$;

create or replace function economy_private.validate_business_manufacturing_manifest_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    perform economy_private.validate_business_manufacturing_resource_manifest_v2(
      old.game_session_id,
      old.job_id
    );
    return old;
  end if;
  perform economy_private.validate_business_manufacturing_resource_manifest_v2(
    new.game_session_id,
    case when tg_table_name = 'business_manufacturing_jobs' then new.id else new.job_id end
  );
  return new;
end
$function$;

create constraint trigger validate_business_manufacturing_job_manifest_v2
after insert or update on public.business_manufacturing_jobs
deferrable initially deferred
for each row execute function economy_private.validate_business_manufacturing_manifest_trigger_v2();
create constraint trigger validate_business_manufacturing_material_manifest_v2
after insert or update or delete on public.business_manufacturing_material_holds
deferrable initially deferred
for each row execute function economy_private.validate_business_manufacturing_manifest_trigger_v2();
create constraint trigger validate_business_manufacturing_labor_manifest_v2
after insert or update or delete on public.business_manufacturing_labor_holds
deferrable initially deferred
for each row execute function economy_private.validate_business_manufacturing_manifest_trigger_v2();
create constraint trigger validate_business_manufacturing_equipment_manifest_v2
after insert or update or delete on public.business_manufacturing_equipment_holds
deferrable initially deferred
for each row execute function economy_private.validate_business_manufacturing_manifest_trigger_v2();

create or replace function economy_private.validate_linked_business_manufacturing_reservation_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_link record;
begin
  if tg_table_name = 'business_labor_reservations' then
    for v_link in
      select hold.game_session_id, hold.job_id
      from public.business_manufacturing_labor_holds as hold
      where hold.labor_reservation_id = new.id
    loop
      perform economy_private.validate_business_manufacturing_resource_manifest_v2(
        v_link.game_session_id,
        v_link.job_id
      );
    end loop;
  else
    for v_link in
      select hold.game_session_id, hold.job_id
      from public.business_manufacturing_equipment_holds as hold
      where hold.equipment_reservation_id = new.id
    loop
      perform economy_private.validate_business_manufacturing_resource_manifest_v2(
        v_link.game_session_id,
        v_link.job_id
      );
    end loop;
  end if;
  return new;
end
$function$;

create constraint trigger validate_linked_business_manufacturing_labor_v2
after update on public.business_labor_reservations
deferrable initially deferred
for each row execute function economy_private.validate_linked_business_manufacturing_reservation_trigger_v2();
create constraint trigger validate_linked_business_manufacturing_equipment_v2
after update on public.business_equipment_reservations
deferrable initially deferred
for each row execute function economy_private.validate_linked_business_manufacturing_reservation_trigger_v2();

alter table public.business_manufacturing_material_holds enable row level security;
alter table public.business_manufacturing_material_holds force row level security;
alter table public.business_manufacturing_labor_holds enable row level security;
alter table public.business_manufacturing_labor_holds force row level security;
alter table public.business_manufacturing_equipment_holds enable row level security;
alter table public.business_manufacturing_equipment_holds force row level security;

revoke all on table public.business_manufacturing_material_holds
  from public, anon, authenticated;
revoke all on table public.business_manufacturing_labor_holds
  from public, anon, authenticated;
revoke all on table public.business_manufacturing_equipment_holds
  from public, anon, authenticated;
grant select, insert, update on table public.business_manufacturing_material_holds
  to service_role;
grant select, insert, update on table public.business_manufacturing_labor_holds
  to service_role;
grant select, insert, update on table public.business_manufacturing_equipment_holds
  to service_role;

revoke all on function economy_private.validate_business_manufacturing_resource_manifest_v2(uuid, uuid)
  from public, anon, authenticated;
revoke all on function economy_private.validate_business_manufacturing_manifest_trigger_v2()
  from public, anon, authenticated;
revoke all on function economy_private.validate_linked_business_manufacturing_reservation_trigger_v2()
  from public, anon, authenticated;

commit;
