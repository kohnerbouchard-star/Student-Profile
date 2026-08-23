-- Business V2 Phase 6B: atomic manufacturing start and canonical resource hold.
--
-- One trusted transaction resolves the exact Business-owned canonical recipe,
-- moves exact BOM materials Warehouse -> Work in Progress, reserves eligible
-- labor and installed-equipment minutes, and creates one queued manufacturing
-- job. No completion/output settlement is authorized by this migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create unique index if not exists inventory_accounts_scope_id_unique
  on public.inventory_accounts(game_session_id, id);
create unique index if not exists business_labor_reservations_scope_id_unique
  on public.business_labor_reservations(game_session_id, id);
create unique index if not exists business_equipment_reservations_scope_id_unique
  on public.business_equipment_reservations(game_session_id, id);

create table public.business_manufacturing_material_holds (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('mmh_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  recipe_input_id uuid not null
    references public.physical_economy_recipe_inputs(id) on delete restrict,
  line_key text not null,
  game_item_id uuid not null,
  warehouse_account_id uuid not null,
  work_in_progress_account_id uuid not null,
  quantity integer not null,
  unit_cost numeric(18,6) not null,
  cost_currency_code text not null,
  inventory_idempotency_key text not null,
  status text not null default 'held',
  created_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz null,
  released_at timestamptz null,
  constraint business_manufacturing_material_holds_public_key_check
    check (public_key ~ '^mmh_[0-9a-f]{32}$'),
  constraint business_manufacturing_material_holds_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade,
  constraint business_manufacturing_material_holds_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_manufacturing_material_holds_warehouse_scope_fk
    foreign key (game_session_id, warehouse_account_id)
    references public.inventory_accounts(game_session_id, id) on delete restrict,
  constraint business_manufacturing_material_holds_wip_scope_fk
    foreign key (game_session_id, work_in_progress_account_id)
    references public.inventory_accounts(game_session_id, id) on delete restrict,
  constraint business_manufacturing_material_holds_line_check
    check (line_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint business_manufacturing_material_holds_quantity_check
    check (quantity between 1 and 100000000),
  constraint business_manufacturing_material_holds_cost_check
    check (unit_cost >= 0),
  constraint business_manufacturing_material_holds_currency_check
    check (cost_currency_code ~ '^[A-Z]{3}$'),
  constraint business_manufacturing_material_holds_idempotency_check
    check (length(btrim(inventory_idempotency_key)) between 8 and 160),
  constraint business_manufacturing_material_holds_status_check
    check (status in ('held','consumed','released')),
  constraint business_manufacturing_material_holds_state_check check (
    (status = 'held' and consumed_at is null and released_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null)
    or (status = 'released' and consumed_at is null and released_at is not null)
  ),
  constraint business_manufacturing_material_holds_line_unique
    unique (game_session_id, job_id, line_key),
  constraint business_manufacturing_material_holds_inventory_key_unique
    unique (game_session_id, inventory_idempotency_key)
);

create table public.business_manufacturing_labor_holds (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  labor_reservation_id uuid not null,
  wage_per_cycle_snapshot numeric(14,2) not null,
  labor_minutes_per_cycle_snapshot integer not null,
  allocated_labor_cost numeric(14,2) not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_labor_holds_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade,
  constraint business_manufacturing_labor_holds_reservation_scope_fk
    foreign key (game_session_id, labor_reservation_id)
    references public.business_labor_reservations(game_session_id, id)
    on delete restrict,
  constraint business_manufacturing_labor_holds_wage_check
    check (wage_per_cycle_snapshot >= 0),
  constraint business_manufacturing_labor_holds_minutes_check
    check (labor_minutes_per_cycle_snapshot between 1 and 100000),
  constraint business_manufacturing_labor_holds_cost_check
    check (allocated_labor_cost >= 0),
  constraint business_manufacturing_labor_holds_reservation_unique
    unique (game_session_id, labor_reservation_id)
);

create table public.business_manufacturing_equipment_holds (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  equipment_reservation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_equipment_holds_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade,
  constraint business_manufacturing_equipment_holds_reservation_scope_fk
    foreign key (game_session_id, equipment_reservation_id)
    references public.business_equipment_reservations(game_session_id, id)
    on delete restrict,
  constraint business_manufacturing_equipment_holds_reservation_unique
    unique (game_session_id, equipment_reservation_id)
);

create index business_manufacturing_material_holds_job_status_idx
  on public.business_manufacturing_material_holds(
    game_session_id, job_id, status, line_key
  );
create index business_manufacturing_labor_holds_job_idx
  on public.business_manufacturing_labor_holds(game_session_id, job_id, id);
create index business_manufacturing_equipment_holds_job_idx
  on public.business_manufacturing_equipment_holds(game_session_id, job_id, id);

create or replace function economy_private.guard_business_manufacturing_hold_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'BUSINESS_MANUFACTURING_HOLD_IMMUTABLE'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name <> 'business_manufacturing_material_holds'
      or new.game_session_id is distinct from old.game_session_id
      or new.job_id is distinct from old.job_id
      or new.recipe_input_id is distinct from old.recipe_input_id
      or new.line_key is distinct from old.line_key
      or new.game_item_id is distinct from old.game_item_id
      or new.warehouse_account_id is distinct from old.warehouse_account_id
      or new.work_in_progress_account_id is distinct from old.work_in_progress_account_id
      or new.quantity is distinct from old.quantity
      or new.unit_cost is distinct from old.unit_cost
      or new.cost_currency_code is distinct from old.cost_currency_code
      or new.inventory_idempotency_key is distinct from old.inventory_idempotency_key
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_HOLD_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.status = 'held' and new.status not in ('held','consumed','released') then
      raise exception 'BUSINESS_MANUFACTURING_HOLD_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status in ('consumed','released') and new.status <> old.status then
      raise exception 'BUSINESS_MANUFACTURING_HOLD_TERMINAL'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$function$;

create trigger guard_business_manufacturing_material_hold_v2
before update or delete on public.business_manufacturing_material_holds
for each row execute function economy_private.guard_business_manufacturing_hold_v2();
create trigger guard_business_manufacturing_labor_hold_v2
before update or delete on public.business_manufacturing_labor_holds
for each row execute function economy_private.guard_business_manufacturing_hold_v2();
create trigger guard_business_manufacturing_equipment_hold_v2
before update or delete on public.business_manufacturing_equipment_holds
for each row execute function economy_private.guard_business_manufacturing_hold_v2();

alter table public.business_manufacturing_material_holds enable row level security;
alter table public.business_manufacturing_material_holds force row level security;
alter table public.business_manufacturing_labor_holds enable row level security;
alter table public.business_manufacturing_labor_holds force row level security;
alter table public.business_manufacturing_equipment_holds enable row level security;
alter table public.business_manufacturing_equipment_holds force row level security;

revoke all on table public.business_manufacturing_material_holds
  from public, anon, authenticated, service_role;
revoke all on table public.business_manufacturing_labor_holds
  from public, anon, authenticated, service_role;
revoke all on table public.business_manufacturing_equipment_holds
  from public, anon, authenticated, service_role;
grant select on table public.business_manufacturing_material_holds to service_role;
grant select on table public.business_manufacturing_labor_holds to service_role;
grant select on table public.business_manufacturing_equipment_holds to service_role;

-- Direct service-role table writes are closed once the trusted atomic command
-- exists. Security-definer lifecycle/worker functions retain owner authority.
revoke insert, update, delete on table public.business_manufacturing_jobs
  from service_role;
revoke insert, update, delete on table public.business_manufacturing_job_transitions
  from service_role;
grant select on table public.business_manufacturing_jobs to service_role;
grant select on table public.business_manufacturing_job_transitions to service_role;

create or replace function public.queue_business_manufacturing_job_v2(
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
  product_key text,
  recipe_key text,
  output_item_key text,
  status text,
  resource_state text,
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
  v_existing public.business_manufacturing_jobs%rowtype;
  v_job public.business_manufacturing_jobs%rowtype;
  v_party public.economic_parties%rowtype;
  v_warehouse public.inventory_accounts%rowtype;
  v_wip public.inventory_accounts%rowtype;
  v_input public.physical_economy_recipe_inputs%rowtype;
  v_input_item public.game_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_requirement record;
  v_employee record;
  v_labor_reservation public.business_labor_reservations%rowtype;
  v_equipment_requirement public.business_recipe_equipment_requirements%rowtype;
  v_candidate record;
  v_equipment_reservation record;
  v_recipe_matches integer := 0;
  v_required integer := 0;
  v_required_total integer := 0;
  v_required_remaining integer := 0;
  v_headcount_remaining integer := 0;
  v_instances_remaining integer := 0;
  v_instances_used integer := 0;
  v_role_count integer := 0;
  v_skill_count integer := 0;
  v_available_capacity integer := 0;
  v_available_minutes integer := 0;
  v_used_minutes integer := 0;
  v_allocate integer := 0;
  v_duration integer;
  v_labor_period_key text;
  v_equipment_period_key text;
  v_intent_ref text;
  v_request_hash text;
  v_reservation_hash text;
  v_reservation_idempotency text;
  v_inventory_idempotency text;
  v_job_id uuid := gen_random_uuid();
  v_job_public_key text := 'mfg_' || encode(gen_random_bytes(16), 'hex');
  v_labor_cost numeric := 0;
  v_inventory_result jsonb;
  v_now timestamptz := statement_timestamp();
begin
  p_business_key := lower(btrim(coalesce(p_business_key, '')));
  p_product_key := lower(btrim(coalesce(p_product_key, '')));
  p_priority := lower(btrim(coalesce(p_priority, '')));
  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));

  if p_game_session_id is null
    or p_player_id is null
    or p_business_key !~ '^biz_[0-9a-f]{32}$'
    or p_product_key !~ '^prd_[0-9a-f]{32}$'
    or p_quantity is null
    or p_quantity not between 1 and 10000
    or p_priority not in ('standard','expedite')
    or length(p_idempotency_key) not between 8 and 160
  then
    raise exception 'BUSINESS_MANUFACTURING_QUEUE_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_business.business_key is distinct from p_business_key then
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
    and product_row.public_key = p_product_key
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

  if v_recipe_matches = 0 then
    raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
      using errcode = 'P0001';
  elsif v_recipe_matches > 1 then
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

  v_request_hash := encode(
    extensions.digest(
      concat_ws(
        '|', p_game_session_id, p_player_id, v_business.business_id,
        v_product.id, v_recipe.id, v_output.id, p_quantity, p_priority
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
    and job_row.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return query select
      v_business.business_key,
      v_existing.public_key,
      v_product.public_key,
      v_recipe.recipe_key,
      v_output.public_key,
      v_existing.status,
      v_existing.resource_state,
      v_existing.quantity,
      v_existing.duration_seconds,
      v_existing.created_at,
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
    and account_row.account_kind = 'warehouse'
    and account_row.location_key is null
    and account_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_WAREHOUSE_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_wip
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'work_in_progress'
    and account_row.location_key is null
    and account_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_WIP_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  v_duration := public.derive_business_manufacturing_duration_seconds_v2(
    p_game_session_id,
    v_business.business_id,
    v_recipe.id,
    p_quantity,
    p_priority
  );
  v_labor_period_key := public.current_business_payroll_period_key_v2(
    p_game_session_id,
    v_business.business_id
  );
  v_equipment_period_key := public.current_business_equipment_period_key_v2(
    p_game_session_id,
    v_business.business_id
  );
  v_intent_ref := 'manufacturing:' || substr(v_request_hash, 1, 48);

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
    completion_next_attempt_at
  ) values (
    v_job_id,
    v_job_public_key,
    p_game_session_id,
    v_business.business_id,
    v_product.id,
    v_recipe.id,
    v_output.id,
    p_player_id,
    p_idempotency_key,
    v_request_hash,
    p_quantity,
    p_priority,
    'queued',
    'reserved',
    v_duration,
    '{}'::jsonb,
    v_now,
    v_now
  )
  returning * into v_job;

  for v_input in
    select input_row.*
    from public.physical_economy_recipe_inputs as input_row
    where input_row.recipe_id = v_recipe.id
    order by input_row.line_key
  loop
    v_required := ceil(v_input.base_quantity * p_quantity)::integer;
    if v_required <= 0 then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_REQUIREMENT_INVALID:%',
        v_input.line_key using errcode = 'P0001';
    end if;

    select item_row.*
    into v_input_item
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
      and holding_row.game_item_id = v_input_item.id
    for update;
    if not found
      or v_holding.quantity_owned - v_holding.quantity_reserved < v_required
    then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_UNAVAILABLE:%:%',
        v_input.item_key, v_required using errcode = 'P0001';
    end if;

    v_inventory_idempotency := 'mfg:wip:' || substr(
      encode(
        extensions.digest(
          concat_ws('|', p_game_session_id, v_job_id, v_input.id, v_required),
          'sha256'
        ),
        'hex'
      ),
      1,
      48
    );

    v_inventory_result := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'transfer',
      'business_manufacturing',
      'materials_to_wip',
      v_job_id,
      v_inventory_idempotency,
      jsonb_build_object(
        'businessKey', v_business.business_key,
        'jobKey', v_job.public_key,
        'recipeKey', v_recipe.recipe_key,
        'lineKey', v_input.line_key,
        'itemKey', v_input_item.public_key,
        'quantity', v_required
      ),
      jsonb_build_array(
        jsonb_build_object(
          'inventoryAccountId', v_warehouse.id,
          'gameItemId', v_input_item.id,
          'playerId', null,
          'storeItemId', v_holding.store_item_id,
          'quantityDelta', -v_required,
          'reservationDelta', 0,
          'unitCost', coalesce(v_holding.average_unit_cost, 0),
          'currencyCode', coalesce(v_holding.cost_currency_code, v_business_row.currency_code),
          'eventType', 'TRANSFER_OUT',
          'legacyEventQuantityDelta', -v_required,
          'eventMetadata', jsonb_build_object(
            'jobKey', v_job.public_key,
            'location', 'warehouse'
          )
        ),
        jsonb_build_object(
          'inventoryAccountId', v_wip.id,
          'gameItemId', v_input_item.id,
          'playerId', null,
          'storeItemId', v_holding.store_item_id,
          'quantityDelta', v_required,
          'reservationDelta', 0,
          'unitCost', coalesce(v_holding.average_unit_cost, 0),
          'currencyCode', coalesce(v_holding.cost_currency_code, v_business_row.currency_code),
          'eventType', 'TRANSFER_IN',
          'legacyEventQuantityDelta', v_required,
          'eventMetadata', jsonb_build_object(
            'jobKey', v_job.public_key,
            'location', 'work_in_progress'
          )
        )
      )
    );

    insert into public.business_manufacturing_material_holds(
      game_session_id,
      job_id,
      recipe_input_id,
      line_key,
      game_item_id,
      warehouse_account_id,
      work_in_progress_account_id,
      quantity,
      unit_cost,
      cost_currency_code,
      inventory_idempotency_key,
      status
    ) values (
      p_game_session_id,
      v_job.id,
      v_input.id,
      v_input.line_key,
      v_input_item.id,
      v_warehouse.id,
      v_wip.id,
      v_required,
      coalesce(v_holding.average_unit_cost, 0),
      coalesce(v_holding.cost_currency_code, v_business_row.currency_code),
      v_inventory_idempotency,
      'held'
    );
  end loop;

  for v_requirement in
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
    v_required_total := v_requirement.fixed_labor_minutes_per_run
      + v_requirement.labor_minutes_per_unit * p_quantity;
    if v_required_total < v_requirement.minimum_headcount
      or v_required_total <= 0
    then
      raise exception 'BUSINESS_LABOR_REQUIREMENT_INVALID:%',
        v_requirement.role_key using errcode = 'P0001';
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
        and reservation.period_key = v_labor_period_key
        and reservation.status in ('reserved','active','consumed')
    ) as used on true
    where employee.game_session_id = p_game_session_id
      and employee.business_id = v_business.business_id
      and employee.status = 'active'
      and employee.workforce_source_type in ('candidate_v2','migration_v2')
      and employee.workforce_role_definition_id = v_requirement.role_definition_id;

    if v_role_count < v_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE:%',
        v_requirement.role_key using errcode = 'P0001';
    elsif v_skill_count < v_requirement.minimum_headcount then
      raise exception 'BUSINESS_LABOR_SKILL_UNAVAILABLE:%',
        v_requirement.role_key using errcode = 'P0001';
    elsif v_available_capacity < v_required_total then
      raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%',
        v_requirement.role_key using errcode = 'P0001';
    end if;

    v_required_remaining := v_required_total;
    v_headcount_remaining := v_requirement.minimum_headcount;

    for v_employee in
      select
        employee.*,
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
          and reservation.period_key = v_labor_period_key
          and reservation.status in ('reserved','active','consumed')
      ) as used on true
      where employee.game_session_id = p_game_session_id
        and employee.business_id = v_business.business_id
        and employee.status = 'active'
        and employee.workforce_source_type in ('candidate_v2','migration_v2')
        and employee.workforce_role_definition_id = v_requirement.role_definition_id
        and employee.skill_basis_points >= v_requirement.minimum_skill_basis_points
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

      v_reservation_idempotency := 'mfg:labor:' || substr(
        encode(
          extensions.digest(
            concat_ws(
              '|', p_game_session_id, v_job.id, v_requirement.requirement_id,
              v_employee.id, v_labor_period_key, v_allocate
            ),
            'sha256'
          ),
          'hex'
        ),
        1,
        48
      );
      v_reservation_hash := encode(
        extensions.digest(
          concat_ws(
            '|', p_game_session_id, v_business.business_id, v_employee.id,
            v_requirement.requirement_id, v_labor_period_key,
            v_allocate, v_intent_ref
          ),
          'sha256'
        ),
        'hex'
      );

      insert into public.business_labor_reservations(
        game_session_id,
        business_id,
        employee_id,
        requirement_id,
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
        v_requirement.requirement_id,
        v_labor_period_key,
        v_intent_ref,
        v_allocate,
        'reserved',
        v_reservation_idempotency,
        v_reservation_hash
      )
      returning * into v_labor_reservation;

      v_labor_cost := round(
        v_employee.wage_per_cycle
          * v_allocate::numeric
          / nullif(v_employee.labor_minutes_per_cycle, 0),
        2
      );

      insert into public.business_manufacturing_labor_holds(
        game_session_id,
        job_id,
        labor_reservation_id,
        wage_per_cycle_snapshot,
        labor_minutes_per_cycle_snapshot,
        allocated_labor_cost
      ) values (
        p_game_session_id,
        v_job.id,
        v_labor_reservation.id,
        v_employee.wage_per_cycle,
        v_employee.labor_minutes_per_cycle,
        v_labor_cost
      );

      v_required_remaining := greatest(v_required_remaining - v_allocate, 0);
      if v_headcount_remaining > 0 then
        v_headcount_remaining := v_headcount_remaining - 1;
      end if;
    end loop;

    if v_required_remaining > 0 or v_headcount_remaining > 0 then
      raise exception 'BUSINESS_LABOR_CAPACITY_UNAVAILABLE:%',
        v_requirement.role_key using errcode = 'P0001';
    end if;
  end loop;

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

      v_reservation_idempotency := 'mfg:equipment:' || substr(
        encode(
          extensions.digest(
            concat_ws(
              '|', p_game_session_id, v_job.id,
              v_equipment_requirement.id, v_candidate.installation_id,
              v_equipment_period_key, v_allocate
            ),
            'sha256'
          ),
          'hex'
        ),
        1,
        48
      );

      select *
      into v_equipment_reservation
      from public.reserve_business_equipment_v2(
        p_game_session_id,
        v_business.business_key,
        v_candidate.installation_key,
        v_equipment_requirement.public_key,
        v_equipment_period_key,
        v_allocate,
        v_intent_ref,
        v_reservation_idempotency
      );

      insert into public.business_manufacturing_equipment_holds(
        game_session_id,
        job_id,
        equipment_reservation_id
      )
      select
        p_game_session_id,
        v_job.id,
        reservation.id
      from public.business_equipment_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.installation_id = v_candidate.installation_id
        and reservation.requirement_id = v_equipment_requirement.id
        and reservation.period_key = v_equipment_period_key
        and reservation.intent_ref = v_intent_ref
        and reservation.status = 'reserved';

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

  if not exists (
    select 1
    from public.business_manufacturing_material_holds as material_hold
    where material_hold.game_session_id = p_game_session_id
      and material_hold.job_id = v_job.id
      and material_hold.status = 'held'
  ) then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_MISSING'
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
    v_job.id,
    null,
    'queued',
    'player',
    p_player_id,
    'business.manufacturing.queued',
    'player:queue:' || substr(v_request_hash, 1, 48),
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'jobKey', v_job.public_key,
      'productKey', v_product.public_key,
      'recipeKey', v_recipe.recipe_key,
      'outputItemKey', v_output.public_key,
      'quantity', v_job.quantity,
      'priority', v_job.priority,
      'durationSeconds', v_job.duration_seconds,
      'laborPeriodKey', v_labor_period_key,
      'equipmentPeriodKey', v_equipment_period_key,
      'materialHoldCount', (
        select count(*)
        from public.business_manufacturing_material_holds as hold
        where hold.game_session_id = p_game_session_id
          and hold.job_id = v_job.id
      ),
      'laborHoldCount', (
        select count(*)
        from public.business_manufacturing_labor_holds as hold
        where hold.game_session_id = p_game_session_id
          and hold.job_id = v_job.id
      ),
      'equipmentHoldCount', (
        select count(*)
        from public.business_manufacturing_equipment_holds as hold
        where hold.game_session_id = p_game_session_id
          and hold.job_id = v_job.id
      )
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
      'outputItemKey', v_output.public_key,
      'quantity', v_job.quantity,
      'priority', v_job.priority,
      'idempotencyKey', p_idempotency_key,
      'timingAuthority', 'server_v2',
      'resourceAuthority', 'canonical_reserved_v2'
    )
  );

  return query select
    v_business.business_key,
    v_job.public_key,
    v_product.public_key,
    v_recipe.recipe_key,
    v_output.public_key,
    v_job.status,
    v_job.resource_state,
    v_job.quantity,
    v_job.duration_seconds,
    v_job.created_at,
    false;
end
$function$;

revoke all on function public.queue_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.queue_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) to service_role;

comment on function public.queue_business_manufacturing_job_v2(
  uuid, uuid, text, text, integer, text, text
) is
  'Service-owned atomic Phase 6B start boundary. Moves exact BOM materials to WIP, reserves labor/equipment, and creates one queued job. No completion authority.';

commit;
