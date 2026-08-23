-- Business V2 Phase 6B: atomic manufacturing start and canonical resource hold.
--
-- One transaction resolves an exact Business-owned canonical recipe/output,
-- stages exact BOM inputs from Warehouse into WIP, reserves finite eligible
-- employee minutes, reserves finite installed-equipment minutes, and creates one
-- queued manufacturing job. Any failure rolls every resource mutation back.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_labor_reservations
  add column if not exists manufacturing_job_id uuid null;

alter table public.business_equipment_reservations
  add column if not exists manufacturing_job_id uuid null;

alter table public.business_labor_reservations
  add constraint business_labor_reservations_manufacturing_job_fk
    foreign key (game_session_id, manufacturing_job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    deferrable initially deferred,
  add constraint business_labor_reservations_single_work_binding_check
    check (num_nonnulls(production_run_id, manufacturing_job_id) <= 1);

alter table public.business_equipment_reservations
  add constraint business_equipment_reservations_manufacturing_job_fk
    foreign key (game_session_id, manufacturing_job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    deferrable initially deferred,
  add constraint business_equipment_reservations_single_work_binding_check
    check (num_nonnulls(production_run_id, manufacturing_job_id) <= 1);

create index business_labor_reservations_manufacturing_job_idx
  on public.business_labor_reservations(
    game_session_id, manufacturing_job_id, status, public_key
  )
  where manufacturing_job_id is not null;

create index business_equipment_reservations_manufacturing_job_idx
  on public.business_equipment_reservations(
    game_session_id, manufacturing_job_id, status, public_key
  )
  where manufacturing_job_id is not null;

create table public.business_manufacturing_job_materials (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('mfm_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  recipe_line_key text not null,
  game_item_id uuid not null,
  warehouse_account_id uuid not null
    references public.inventory_accounts(id) on delete restrict,
  wip_account_id uuid not null
    references public.inventory_accounts(id) on delete restrict,
  staged_quantity integer not null,
  staged_unit_cost numeric(18,4) not null default 0,
  cost_currency_code text not null,
  status text not null default 'staged',
  created_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz null,
  released_at timestamptz null,
  constraint business_manufacturing_job_materials_public_key_check
    check (public_key ~ '^mfm_[0-9a-f]{32}$'),
  constraint business_manufacturing_job_materials_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade,
  constraint business_manufacturing_job_materials_line_key_check
    check (recipe_line_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  constraint business_manufacturing_job_materials_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_manufacturing_job_materials_quantity_check
    check (staged_quantity between 1 and 100000000),
  constraint business_manufacturing_job_materials_unit_cost_check
    check (staged_unit_cost >= 0),
  constraint business_manufacturing_job_materials_currency_check
    check (cost_currency_code ~ '^[A-Z]{3}$'),
  constraint business_manufacturing_job_materials_status_check
    check (status in ('staged','consumed','released')),
  constraint business_manufacturing_job_materials_state_check check (
    (status = 'staged' and consumed_at is null and released_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null)
    or (status = 'released' and consumed_at is null and released_at is not null)
  ),
  constraint business_manufacturing_job_materials_line_unique
    unique (game_session_id, job_id, recipe_line_key)
);

create index business_manufacturing_job_materials_job_status_idx
  on public.business_manufacturing_job_materials(
    game_session_id, job_id, status, recipe_line_key
  );

create or replace function economy_private.guard_business_manufacturing_material_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
  v_business_party public.economic_parties%rowtype;
  v_warehouse public.inventory_accounts%rowtype;
  v_wip public.inventory_accounts%rowtype;
  v_item public.game_items%rowtype;
begin
  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = new.game_session_id
    and job_row.id = new.job_id;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_business_party
  from public.economic_parties as party_row
  where party_row.game_session_id = new.game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_job.business_id
    and party_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PARTY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_warehouse
  from public.inventory_accounts as account_row
  where account_row.game_session_id = new.game_session_id
    and account_row.id = new.warehouse_account_id
    and account_row.party_id = v_business_party.id
    and account_row.status = 'active';
  if not found
    or not (
      v_warehouse.account_kind = 'warehouse'
      or lower(coalesce(v_warehouse.location_key, '')) in ('warehouse','materials')
    )
  then
    raise exception 'BUSINESS_MANUFACTURING_WAREHOUSE_INVALID'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_wip
  from public.inventory_accounts as account_row
  where account_row.game_session_id = new.game_session_id
    and account_row.id = new.wip_account_id
    and account_row.party_id = v_business_party.id
    and account_row.status = 'active';
  if not found
    or not (
      v_wip.account_kind = 'work_in_progress'
      or lower(coalesce(v_wip.location_key, '')) in ('work_in_progress','wip')
    )
  then
    raise exception 'BUSINESS_MANUFACTURING_WIP_INVALID'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.game_items as item_row
  where item_row.game_session_id = new.game_session_id
    and item_row.id = new.game_item_id
    and item_row.status = 'active';
  if not found
    or not exists (
      select 1
      from public.physical_economy_recipe_inputs as recipe_input
      where recipe_input.recipe_id = v_job.recipe_definition_id
        and recipe_input.line_key = new.recipe_line_key
        and recipe_input.item_key = v_item.canonical_key
    )
  then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_LINE_INVALID'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if new.game_session_id is distinct from old.game_session_id
      or new.job_id is distinct from old.job_id
      or new.recipe_line_key is distinct from old.recipe_line_key
      or new.game_item_id is distinct from old.game_item_id
      or new.warehouse_account_id is distinct from old.warehouse_account_id
      or new.wip_account_id is distinct from old.wip_account_id
      or new.staged_quantity is distinct from old.staged_quantity
      or new.staged_unit_cost is distinct from old.staged_unit_cost
      or new.cost_currency_code is distinct from old.cost_currency_code
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;
    if old.status in ('consumed','released') and new.status <> old.status then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_TERMINAL'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$function$;

create trigger guard_business_manufacturing_material_v2
before insert or update on public.business_manufacturing_job_materials
for each row execute function economy_private.guard_business_manufacturing_material_v2();

create or replace function economy_private.guard_manufacturing_reservation_binding_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
begin
  if new.manufacturing_job_id is null then
    if tg_op = 'UPDATE' and old.manufacturing_job_id is not null then
      raise exception 'BUSINESS_MANUFACTURING_RESERVATION_BINDING_IMMUTABLE'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = new.game_session_id
    and job_row.id = new.manufacturing_job_id;
  if not found
    or v_job.business_id is distinct from new.business_id
  then
    raise exception 'BUSINESS_MANUFACTURING_RESERVATION_JOB_INVALID'
      using errcode = 'P0001';
  end if;

  if new.production_run_id is not null then
    raise exception 'BUSINESS_MANUFACTURING_RESERVATION_ALREADY_BOUND'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
    and old.manufacturing_job_id is not null
    and new.manufacturing_job_id is distinct from old.manufacturing_job_id
  then
    raise exception 'BUSINESS_MANUFACTURING_RESERVATION_BINDING_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end
$function$;

create trigger guard_business_labor_manufacturing_binding_v2
before insert or update on public.business_labor_reservations
for each row execute function economy_private.guard_manufacturing_reservation_binding_v2();

create trigger guard_business_equipment_manufacturing_binding_v2
before insert or update on public.business_equipment_reservations
for each row execute function economy_private.guard_manufacturing_reservation_binding_v2();

create or replace function economy_private.validate_business_manufacturing_resources_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
  v_expected integer;
  v_actual integer;
  v_headcount integer;
  v_requirement record;
begin
  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.id = new.id;
  if not found or v_job.status not in ('queued','in_progress') then
    return new;
  end if;

  for v_requirement in
    select input.line_key, input.item_key, input.base_quantity
    from public.physical_economy_recipe_inputs as input
    where input.recipe_id = v_job.recipe_definition_id
    order by input.line_key
  loop
    v_expected := ceil(v_requirement.base_quantity * v_job.quantity)::integer;
    select coalesce(sum(material.staged_quantity), 0)::integer
    into v_actual
    from public.business_manufacturing_job_materials as material
    join public.game_items as item
      on item.game_session_id = material.game_session_id
     and item.id = material.game_item_id
    where material.game_session_id = v_job.game_session_id
      and material.job_id = v_job.id
      and material.recipe_line_key = v_requirement.line_key
      and item.canonical_key = v_requirement.item_key
      and material.status = 'staged';
    if v_actual <> v_expected then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_INCOMPLETE:%:%:%',
        v_requirement.line_key, v_expected, v_actual using errcode = 'P0001';
    end if;
  end loop;

  if exists (
    select 1
    from public.business_manufacturing_job_materials as material
    left join public.physical_economy_recipe_inputs as input
      on input.recipe_id = v_job.recipe_definition_id
     and input.line_key = material.recipe_line_key
    where material.game_session_id = v_job.game_session_id
      and material.job_id = v_job.id
      and input.id is null
  ) then
    raise exception 'BUSINESS_MANUFACTURING_EXTRA_MATERIAL_HOLD'
      using errcode = 'P0001';
  end if;

  for v_requirement in
    select requirement.id,
      requirement.fixed_labor_minutes_per_run,
      requirement.labor_minutes_per_unit,
      requirement.minimum_headcount
    from public.business_recipe_labor_requirements as requirement
    where requirement.recipe_definition_id = v_job.recipe_definition_id
      and requirement.status = 'active'
    order by requirement.public_key
  loop
    v_expected := v_requirement.fixed_labor_minutes_per_run
      + v_requirement.labor_minutes_per_unit * v_job.quantity;
    select
      coalesce(sum(reservation.reserved_minutes), 0)::integer,
      count(distinct reservation.employee_id)::integer
    into v_actual, v_headcount
    from public.business_labor_reservations as reservation
    where reservation.game_session_id = v_job.game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.requirement_id = v_requirement.id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status in ('reserved','active');
    if v_actual <> v_expected
      or v_headcount < v_requirement.minimum_headcount
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_INCOMPLETE:%:%:%:%',
        v_requirement.id, v_expected, v_actual, v_headcount using errcode = 'P0001';
    end if;
  end loop;

  for v_requirement in
    select requirement.id,
      requirement.fixed_equipment_minutes_per_run,
      requirement.equipment_minutes_per_unit,
      requirement.minimum_instance_count
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_job.recipe_definition_id
      and requirement.status = 'active'
    order by requirement.public_key
  loop
    v_expected := v_requirement.fixed_equipment_minutes_per_run
      + v_requirement.equipment_minutes_per_unit * v_job.quantity;
    select
      coalesce(sum(reservation.reserved_minutes), 0)::integer,
      count(distinct reservation.installation_id)::integer
    into v_actual, v_headcount
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = v_job.game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.requirement_id = v_requirement.id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status in ('reserved','active');
    if v_actual <> v_expected
      or v_headcount < v_requirement.minimum_instance_count
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INCOMPLETE:%:%:%:%',
        v_requirement.id, v_expected, v_actual, v_headcount using errcode = 'P0001';
    end if;
  end loop;

  return new;
end
$function$;

create constraint trigger validate_business_manufacturing_resources_v2
after insert or update on public.business_manufacturing_jobs
deferrable initially deferred
for each row execute function economy_private.validate_business_manufacturing_resources_v2();

alter table public.business_manufacturing_job_materials enable row level security;
alter table public.business_manufacturing_job_materials force row level security;
revoke all on table public.business_manufacturing_job_materials
  from public, anon, authenticated;
grant select, insert, update on table public.business_manufacturing_job_materials
  to service_role;

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
  business_key text,
  job_key text,
  status text,
  quantity integer,
  duration_seconds integer,
  queued_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_business record;
  v_business_row public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_output public.game_items%rowtype;
  v_recipe_matches integer := 0;
  v_party public.economic_parties%rowtype;
  v_warehouse public.inventory_accounts%rowtype;
  v_wip public.inventory_accounts%rowtype;
  v_job public.business_manufacturing_jobs%rowtype;
  v_input public.physical_economy_recipe_inputs%rowtype;
  v_item public.game_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_inventory_post jsonb;
  v_required integer;
  v_hash text;
  v_intent_ref text;
  v_period_key text;
  v_equipment_period_key text;
  v_requirement record;
  v_employee record;
  v_candidate record;
  v_reservation record;
  v_used integer := 0;
  v_available integer := 0;
  v_allocate integer := 0;
  v_remaining integer := 0;
  v_headcount_remaining integer := 0;
  v_headcount_used integer := 0;
  v_reservation_hash text;
  v_reservation_idempotency text;
  v_duration integer;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null
    or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_product_key, '') !~ '^bpr_[0-9a-f]{32}$'
    or p_quantity is null
    or p_quantity not between 1 and 10000
    or lower(btrim(coalesce(p_priority, ''))) not in ('standard','expedite')
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_MANUFACTURING_START_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_business.business_key is distinct from lower(btrim(p_business_key)) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business_row
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_business.business_id
    and business_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select product_row.*
  into v_product
  from public.business_products as product_row
  where product_row.game_session_id = p_game_session_id
    and product_row.business_id = v_business.business_id
    and product_row.public_key = lower(btrim(p_product_key))
    and product_row.product_kind = 'physical_good'
    and product_row.output_game_item_id is not null
    and product_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PRODUCT_INVALID'
      using errcode = 'P0001';
  end if;

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
    if v_recipe_matches = 0 then
      raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
        using errcode = 'P0001';
    end if;
    raise exception 'BUSINESS_PRODUCTION_RECIPE_AMBIGUOUS'
      using errcode = 'P0001';
  end if;

  select recipe.*, output_item.*
  into v_recipe, v_output
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
  where access.game_session_id = p_game_session_id
    and access.business_id = v_business.business_id
    and access.revoked_at is null
    and (
      cardinality(availability.country_codes) = 0
      or v_business_row.country_code = any(availability.country_codes)
    )
  order by recipe.recipe_key
  limit 1;

  v_hash := encode(
    extensions.digest(
      concat_ws(
        '|', p_game_session_id, p_player_id, v_business.business_id,
        v_product.id, v_recipe.id, v_output.id, p_quantity,
        lower(btrim(p_priority))
      ),
      'sha256'
    ),
    'hex'
  );

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.requested_by_player_id = p_player_id
    and job_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if found then
    if v_job.request_hash <> v_hash then
      raise exception 'BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return query select
      v_business.business_key,
      v_job.public_key,
      v_job.status,
      v_job.quantity,
      v_job.duration_seconds,
      v_job.created_at,
      true;
    return;
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.business_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PARTY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_warehouse
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party.id
    and account_row.status = 'active'
    and (
      account_row.account_kind = 'warehouse'
      or lower(coalesce(account_row.location_key, '')) in ('warehouse','materials')
    )
  order by
    case when account_row.account_kind = 'warehouse' then 0 else 1 end,
    account_row.id
  limit 1
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_WAREHOUSE_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_wip
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party.id
    and account_row.status = 'active'
    and (
      account_row.account_kind = 'work_in_progress'
      or lower(coalesce(account_row.location_key, '')) in ('work_in_progress','wip')
    )
  order by
    case when account_row.account_kind = 'work_in_progress' then 0 else 1 end,
    account_row.id
  limit 1
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_WIP_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  v_duration := public.derive_business_manufacturing_duration_seconds_v2(
    p_game_session_id,
    v_business.business_id,
    v_recipe.id,
    p_quantity,
    lower(btrim(p_priority))
  );

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
    queue_available_at,
    completion_next_attempt_at
  ) values (
    gen_random_uuid(),
    'mfg_' || encode(gen_random_bytes(16), 'hex'),
    p_game_session_id,
    v_business.business_id,
    v_product.id,
    v_recipe.id,
    v_output.id,
    p_player_id,
    btrim(p_idempotency_key),
    v_hash,
    p_quantity,
    lower(btrim(p_priority)),
    'queued',
    'reserved',
    v_duration,
    v_now,
    v_now
  )
  returning * into v_job;

  v_intent_ref := 'manufacturing:' || substr(v_hash, 1, 48);

  for v_input in
    select input.*
    from public.physical_economy_recipe_inputs as input
    where input.recipe_id = v_recipe.id
    order by input.line_key
  loop
    v_required := ceil(v_input.base_quantity * p_quantity)::integer;
    if v_required <= 0 then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_REQUIREMENT_INVALID:%',
        v_input.line_key using errcode = 'P0001';
    end if;

    select item_row.*
    into v_item
    from public.game_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.canonical_key = v_input.item_key
      and item_row.status = 'active'
    for share;
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_ITEM_UNAVAILABLE:%',
        v_input.item_key using errcode = 'P0001';
    end if;

    select holding_row.*
    into v_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_warehouse.id
      and holding_row.game_item_id = v_item.id
    for update;
    if not found
      or v_holding.quantity_owned - v_holding.quantity_reserved < v_required
    then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNAVAILABLE:%:%',
        v_input.item_key, v_required using errcode = 'P0001';
    end if;

    v_inventory_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'transfer',
      'business',
      'manufacturing_material_staged',
      v_job.id,
      btrim(p_idempotency_key) || ':material:' || v_input.line_key,
      jsonb_build_object(
        'businessKey', v_business.business_key,
        'jobKey', v_job.public_key,
        'recipeKey', v_recipe.recipe_key,
        'lineKey', v_input.line_key,
        'itemKey', v_item.public_key,
        'quantity', v_required
      ),
      jsonb_build_array(
        jsonb_build_object(
          'inventoryAccountId', v_warehouse.id,
          'gameItemId', v_item.id,
          'playerId', null,
          'storeItemId', v_holding.store_item_id,
          'quantityDelta', -v_required,
          'reservationDelta', 0,
          'unitCost', v_holding.average_unit_cost,
          'currencyCode', v_holding.cost_currency_code,
          'eventType', 'TRANSFERRED_OUT',
          'legacyEventQuantityDelta', -v_required,
          'eventMetadata', jsonb_build_object(
            'businessKey', v_business.business_key,
            'jobKey', v_job.public_key,
            'location', 'warehouse'
          )
        ),
        jsonb_build_object(
          'inventoryAccountId', v_wip.id,
          'gameItemId', v_item.id,
          'playerId', null,
          'storeItemId', v_holding.store_item_id,
          'quantityDelta', v_required,
          'reservationDelta', 0,
          'unitCost', v_holding.average_unit_cost,
          'currencyCode', v_holding.cost_currency_code,
          'eventType', 'TRANSFERRED_IN',
          'legacyEventQuantityDelta', v_required,
          'eventMetadata', jsonb_build_object(
            'businessKey', v_business.business_key,
            'jobKey', v_job.public_key,
            'location', 'work_in_progress'
          )
        )
      )
    );

    if coalesce(v_inventory_post->>'committed', 'false') <> 'true' then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_POST_FAILED:%',
        v_input.line_key using errcode = 'P0001';
    end if;

    insert into public.business_manufacturing_job_materials(
      game_session_id,
      job_id,
      recipe_line_key,
      game_item_id,
      warehouse_account_id,
      wip_account_id,
      staged_quantity,
      staged_unit_cost,
      cost_currency_code,
      status
    ) values (
      p_game_session_id,
      v_job.id,
      v_input.line_key,
      v_item.id,
      v_warehouse.id,
      v_wip.id,
      v_required,
      coalesce(v_holding.average_unit_cost, 0),
      coalesce(v_holding.cost_currency_code, v_business_row.currency_code),
      'staged'
    );
  end loop;

  v_period_key := public.current_business_payroll_period_key_v2(
    p_game_session_id,
    v_business.business_id
  );

  for v_requirement in
    select requirement.*
    from public.business_recipe_labor_requirements as requirement
    where requirement.recipe_definition_id = v_recipe.id
      and requirement.status = 'active'
    order by requirement.public_key
  loop
    v_remaining := v_requirement.fixed_labor_minutes_per_run
      + v_requirement.labor_minutes_per_unit * p_quantity;
    v_headcount_remaining := v_requirement.minimum_headcount;
    v_headcount_used := 0;
    if v_remaining <= 0 or v_remaining < v_headcount_remaining then
      raise exception 'BUSINESS_LABOR_REQUIREMENT_INVALID'
        using errcode = 'P0001';
    end if;

    for v_employee in
      select employee.*
      from public.business_employees as employee
      where employee.game_session_id = p_game_session_id
        and employee.business_id = v_business.business_id
        and employee.status = 'active'
        and employee.workforce_source_type in ('candidate_v2','migration_v2')
        and employee.workforce_role_definition_id = v_requirement.role_definition_id
        and employee.skill_basis_points >= v_requirement.minimum_skill_basis_points
      order by employee.public_key
      for update of employee
    loop
      exit when v_remaining <= 0 and v_headcount_remaining <= 0;

      select coalesce(sum(reservation.reserved_minutes), 0)::integer
      into v_used
      from public.business_labor_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.employee_id = v_employee.id
        and reservation.period_key = v_period_key
        and reservation.status in ('reserved','active','consumed');

      v_available := greatest(v_employee.labor_minutes_per_cycle - v_used, 0);
      if v_available <= 0 then
        continue;
      end if;

      if v_headcount_remaining > 0 then
        v_allocate := least(
          v_available,
          greatest(1, v_remaining - (v_headcount_remaining - 1))
        );
      else
        v_allocate := least(v_available, v_remaining);
      end if;
      if v_allocate <= 0 then
        continue;
      end if;

      v_reservation_hash := encode(
        extensions.digest(
          concat_ws(
            '|', p_game_session_id, v_business.business_id,
            v_employee.id, v_requirement.id, v_period_key,
            v_intent_ref, v_allocate
          ),
          'sha256'
        ),
        'hex'
      );
      v_reservation_idempotency := 'manufacturing-labor:'
        || substr(v_reservation_hash, 1, 48);

      insert into public.business_labor_reservations(
        game_session_id,
        business_id,
        employee_id,
        requirement_id,
        manufacturing_job_id,
        period_key,
        intent_ref,
        reserved_minutes,
        status,
        idempotency_key,
        request_hash
      ) values (
        p_game_session_id,
        v_business.business_id,
        v_employee.id,
        v_requirement.id,
        v_job.id,
        v_period_key,
        v_intent_ref,
        v_allocate,
        'reserved',
        v_reservation_idempotency,
        v_reservation_hash
      );

      v_remaining := greatest(v_remaining - v_allocate, 0);
      if v_headcount_remaining > 0 then
        v_headcount_remaining := v_headcount_remaining - 1;
      end if;
      v_headcount_used := v_headcount_used + 1;
    end loop;

    if v_remaining > 0
      or v_headcount_used < v_requirement.minimum_headcount
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE'
        using errcode = 'P0001';
    end if;
  end loop;

  v_equipment_period_key := public.current_business_equipment_period_key_v2(
    p_game_session_id,
    v_business.business_id
  );

  for v_requirement in
    select requirement.*
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_recipe.id
      and requirement.status = 'active'
    order by requirement.capability_key, requirement.public_key
  loop
    v_remaining := v_requirement.fixed_equipment_minutes_per_run
      + v_requirement.equipment_minutes_per_unit * p_quantity;
    v_headcount_remaining := v_requirement.minimum_instance_count;
    v_headcount_used := 0;
    if v_remaining <= 0 or v_remaining < v_headcount_remaining then
      raise exception 'BUSINESS_EQUIPMENT_REQUIREMENT_INVALID:%',
        v_requirement.capability_key using errcode = 'P0001';
    end if;

    for v_candidate in
      select
        installation.id as installation_id,
        installation.public_key as installation_key,
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
        and installation.business_id = v_business.business_id
        and installation.status = 'installed'
        and v_requirement.capability_key = any(profile.capability_keys)
      order by installation.public_key
    loop
      exit when v_remaining <= 0 and v_headcount_remaining <= 0;

      perform 1
      from public.business_equipment_installations as locked_installation
      where locked_installation.game_session_id = p_game_session_id
        and locked_installation.id = v_candidate.installation_id
        and locked_installation.status = 'installed'
      for update;
      if not found then
        continue;
      end if;

      select coalesce(sum(reservation.reserved_minutes), 0)::integer
      into v_used
      from public.business_equipment_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.installation_id = v_candidate.installation_id
        and reservation.period_key = v_equipment_period_key
        and reservation.status in ('reserved','active','consumed');

      v_available := greatest(v_candidate.capacity_minutes - v_used, 0);
      if v_available <= 0 then
        continue;
      end if;

      if v_headcount_remaining > 0 then
        v_allocate := least(
          v_available,
          greatest(1, v_remaining - (v_headcount_remaining - 1))
        );
      else
        v_allocate := least(v_available, v_remaining);
      end if;
      if v_allocate <= 0 then
        continue;
      end if;

      v_reservation_hash := encode(
        extensions.digest(
          concat_ws(
            '|', p_game_session_id, v_business.business_id,
            v_candidate.installation_id, v_requirement.id,
            v_equipment_period_key, v_intent_ref, v_allocate
          ),
          'sha256'
        ),
        'hex'
      );
      v_reservation_idempotency := 'manufacturing-equipment:'
        || substr(v_reservation_hash, 1, 48);

      select reserved.*
      into v_reservation
      from public.reserve_business_equipment_v2(
        p_game_session_id,
        v_business.business_key,
        v_candidate.installation_key,
        v_requirement.public_key,
        v_equipment_period_key,
        v_allocate,
        v_intent_ref,
        v_reservation_idempotency
      ) as reserved;

      update public.business_equipment_reservations
      set manufacturing_job_id = v_job.id
      where game_session_id = p_game_session_id
        and public_key = v_reservation.reservation_key
        and manufacturing_job_id is null;
      if not found then
        raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_BINDING_FAILED'
          using errcode = 'P0001';
      end if;

      v_remaining := greatest(v_remaining - v_allocate, 0);
      if v_headcount_remaining > 0 then
        v_headcount_remaining := v_headcount_remaining - 1;
      end if;
      v_headcount_used := v_headcount_used + 1;
    end loop;

    if v_remaining > 0
      or v_headcount_used < v_requirement.minimum_instance_count
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE:%',
        v_requirement.capability_key using errcode = 'P0001';
    end if;
  end loop;

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
      'businessKey', v_business.business_key,
      'jobKey', v_job.public_key,
      'productKey', v_product.public_key,
      'recipeKey', v_recipe.recipe_key,
      'outputItemKey', v_output.public_key,
      'quantity', v_job.quantity,
      'priority', v_job.priority,
      'durationSeconds', v_job.duration_seconds
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
      'businessKey', v_business.business_key,
      'jobKey', v_job.public_key,
      'productKey', v_product.public_key,
      'recipeKey', v_recipe.recipe_key,
      'quantity', v_job.quantity,
      'priority', v_job.priority,
      'idempotencyKey', btrim(p_idempotency_key),
      'timingAuthority', 'server_v2',
      'resourceAuthority', 'canonical_reserved_v2'
    )
  );

  set constraints validate_business_manufacturing_resources_v2 immediate;
  set constraints validate_business_manufacturing_resources_v2 deferred;

  return query select
    v_business.business_key,
    v_job.public_key,
    v_job.status,
    v_job.quantity,
    v_job.duration_seconds,
    v_job.created_at,
    false;
end
$function$;

revoke all on function public.start_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.start_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) to service_role;

comment on function public.start_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) is
  'Atomic Phase 6B start command. Browser intent selects public Business/product keys, quantity, and bounded priority; canonical recipe, BOM, labor, equipment, duration, cost basis, and ownership are server-derived.';

commit;
