-- Business V2 Phase 6C: lease-validated exact-once manufacturing completion.
--
-- A due worker lease atomically consumes canonical WIP materials, posts the
-- exact canonical output into Finished Goods with material plus labor cost
-- basis, consumes finite labor/equipment reservations, appends immutable
-- evidence, and marks the job completed. No second payroll cash debit occurs.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_manufacturing_jobs
  add column if not exists completed_output_quantity integer null,
  add column if not exists material_cost_basis numeric(18,4) null,
  add column if not exists labor_cost_basis numeric(18,4) null,
  add column if not exists total_cost_basis numeric(18,4) null,
  add column if not exists finished_unit_cost numeric(18,6) null,
  add column if not exists cost_currency_code text null,
  add column if not exists completion_token_hash text null;

alter table public.business_manufacturing_jobs
  add constraint business_manufacturing_jobs_completed_output_quantity_check
    check (
      completed_output_quantity is null
      or completed_output_quantity between 1 and 100000000
    ),
  add constraint business_manufacturing_jobs_completion_costs_check
    check (
      (material_cost_basis is null or material_cost_basis >= 0)
      and (labor_cost_basis is null or labor_cost_basis >= 0)
      and (total_cost_basis is null or total_cost_basis >= 0)
      and (finished_unit_cost is null or finished_unit_cost >= 0)
      and (
        total_cost_basis is null
        or total_cost_basis = material_cost_basis + labor_cost_basis
      )
    ),
  add constraint business_manufacturing_jobs_completion_currency_check
    check (
      cost_currency_code is null
      or cost_currency_code ~ '^[A-Z0-9_]{3,16}$'
    ),
  add constraint business_manufacturing_jobs_completion_token_hash_check
    check (
      completion_token_hash is null
      or completion_token_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint business_manufacturing_jobs_completion_economics_state_check
    check (
      (
        status = 'completed'
        and completed_output_quantity is not null
        and material_cost_basis is not null
        and labor_cost_basis is not null
        and total_cost_basis is not null
        and finished_unit_cost is not null
        and cost_currency_code is not null
        and completion_token_hash is not null
      )
      or (
        status <> 'completed'
        and completed_output_quantity is null
        and material_cost_basis is null
        and labor_cost_basis is null
        and total_cost_basis is null
        and finished_unit_cost is null
        and cost_currency_code is null
        and completion_token_hash is null
      )
    );

alter table public.business_labor_reservations
  add column if not exists manufacturing_labor_cost_basis numeric(18,4) null;

alter table public.business_labor_reservations
  add constraint business_labor_reservations_manufacturing_cost_basis_check
    check (
      manufacturing_labor_cost_basis is null
      or manufacturing_labor_cost_basis >= 0
    );

create table public.business_manufacturing_completion_receipts (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('mcr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  output_game_item_id uuid not null,
  inventory_transaction_id uuid not null,
  completion_token_hash text not null,
  completed_output_quantity integer not null,
  material_cost_basis numeric(18,4) not null,
  labor_cost_basis numeric(18,4) not null,
  total_cost_basis numeric(18,4) not null,
  finished_unit_cost numeric(18,6) not null,
  cost_currency_code text not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_completion_receipts_public_key_check
    check (public_key ~ '^mcr_[0-9a-f]{32}$'),
  constraint business_manufacturing_completion_receipts_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete restrict,
  constraint business_manufacturing_completion_receipts_output_scope_fk
    foreign key (game_session_id, output_game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_manufacturing_completion_receipts_inventory_fk
    foreign key (inventory_transaction_id)
    references public.inventory_transactions(id) on delete restrict,
  constraint business_manufacturing_completion_receipts_token_check
    check (completion_token_hash ~ '^[0-9a-f]{64}$'),
  constraint business_manufacturing_completion_receipts_quantity_check
    check (completed_output_quantity between 1 and 100000000),
  constraint business_manufacturing_completion_receipts_cost_check
    check (
      material_cost_basis >= 0
      and labor_cost_basis >= 0
      and total_cost_basis = material_cost_basis + labor_cost_basis
      and finished_unit_cost >= 0
    ),
  constraint business_manufacturing_completion_receipts_currency_check
    check (cost_currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_manufacturing_completion_receipts_job_unique
    unique (game_session_id, job_id),
  constraint business_manufacturing_completion_receipts_inventory_unique
    unique (inventory_transaction_id)
);

create or replace function economy_private.guard_business_manufacturing_completion_receipt_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_RECEIPT_IMMUTABLE'
      using errcode = '42501';
  end if;
  return new;
end
$function$;

create trigger guard_business_manufacturing_completion_receipt_v2
before update or delete on public.business_manufacturing_completion_receipts
for each row execute function economy_private.guard_business_manufacturing_completion_receipt_v2();

alter table public.business_manufacturing_completion_receipts enable row level security;
alter table public.business_manufacturing_completion_receipts force row level security;
revoke all on table public.business_manufacturing_completion_receipts
  from public, anon, authenticated;
grant select, insert on table public.business_manufacturing_completion_receipts
  to service_role;

create or replace function public.complete_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_job_id uuid,
  p_lease_token uuid
)
returns table (
  job_key text,
  status text,
  resource_state text,
  output_item_key text,
  output_quantity integer,
  material_cost_basis numeric,
  labor_cost_basis numeric,
  total_cost_basis numeric,
  finished_unit_cost numeric,
  cost_currency_code text,
  completed_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.business_manufacturing_jobs%rowtype;
  v_business public.business_entities%rowtype;
  v_output public.game_items%rowtype;
  v_recipe_output public.physical_economy_recipe_outputs%rowtype;
  v_finished_goods_account_id uuid;
  v_finished_goods_holding public.inventory_holdings%rowtype;
  v_material public.business_manufacturing_job_materials%rowtype;
  v_wip_holding public.inventory_holdings%rowtype;
  v_receipt public.business_manufacturing_completion_receipts%rowtype;
  v_inventory_lines jsonb := '[]'::jsonb;
  v_inventory_post jsonb;
  v_inventory_transaction_id uuid;
  v_token_hash text;
  v_output_quantity integer;
  v_material_count integer := 0;
  v_labor_count integer := 0;
  v_equipment_count integer := 0;
  v_updated_count integer := 0;
  v_currency_count integer := 0;
  v_currency text;
  v_material_cost numeric(18,4) := 0;
  v_labor_cost numeric(18,4) := 0;
  v_total_cost numeric(18,4) := 0;
  v_unit_cost numeric(18,6) := 0;
begin
  if p_game_session_id is null
    or p_job_id is null
    or p_lease_token is null
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  v_token_hash := encode(
    extensions.digest(p_lease_token::text, 'sha256'),
    'hex'
  );

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.id = p_job_id
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_job.status = 'completed' then
    if v_job.completion_token_hash is distinct from v_token_hash then
      raise exception 'BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT'
        using errcode = 'P0001';
    end if;

    select item_row.*
    into v_output
    from public.game_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.id = v_job.output_game_item_id;
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
        using errcode = 'P0001';
    end if;

    return query select
      v_job.public_key,
      v_job.status,
      v_job.resource_state,
      v_output.public_key,
      v_job.completed_output_quantity,
      v_job.material_cost_basis,
      v_job.labor_cost_basis,
      v_job.total_cost_basis,
      v_job.finished_unit_cost,
      v_job.cost_currency_code,
      v_job.completed_at,
      true;
    return;
  end if;

  if v_job.status <> 'in_progress'
    or v_job.resource_state <> 'reserved'
    or v_job.completes_at is null
    or v_job.completes_at > v_now
    or v_job.completion_lease_token is distinct from p_lease_token
    or v_job.completion_lease_expires_at is null
    or v_job.completion_lease_expires_at <= v_now
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_job.business_id
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_BUSINESS_INACTIVE'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_output
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_job.output_game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
      using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.physical_economy_recipe_outputs as recipe_output
    where recipe_output.recipe_id = v_job.recipe_definition_id
  ) <> 1 then
    raise exception 'BUSINESS_MANUFACTURING_MULTI_OUTPUT_UNSUPPORTED'
      using errcode = 'P0001';
  end if;

  select recipe_output.*
  into v_recipe_output
  from public.physical_economy_recipe_outputs as recipe_output
  where recipe_output.recipe_id = v_job.recipe_definition_id
    and recipe_output.item_key = v_output.canonical_key
  limit 1;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
      using errcode = 'P0001';
  end if;

  v_output_quantity := ceil(v_recipe_output.base_quantity * v_job.quantity)::integer;
  if v_output_quantity not between 1 and 100000000 then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_QUANTITY_INVALID'
      using errcode = 'P0001';
  end if;

  v_finished_goods_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_job.business_id,
    'finished_goods'
  );

  select holding_row.*
  into v_finished_goods_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_finished_goods_account_id
    and holding_row.game_item_id = v_output.id
  for update;

  select
    count(*)::integer,
    count(distinct material.cost_currency_code)::integer,
    min(material.cost_currency_code),
    round(
      coalesce(sum(material.staged_quantity * material.staged_unit_cost), 0),
      4
    )
  into
    v_material_count,
    v_currency_count,
    v_currency,
    v_material_cost
  from public.business_manufacturing_job_materials as material
  where material.game_session_id = p_game_session_id
    and material.job_id = v_job.id
    and material.status = 'staged';

  if v_material_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_MISSING'
      using errcode = 'P0001';
  end if;
  if v_currency_count <> 1
    or v_currency is distinct from v_business.currency_code
  then
    raise exception 'BUSINESS_MANUFACTURING_COST_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  for v_material in
    select material.*
    from public.business_manufacturing_job_materials as material
    join public.game_items as item
      on item.game_session_id = material.game_session_id
     and item.id = material.game_item_id
    where material.game_session_id = p_game_session_id
      and material.job_id = v_job.id
      and material.status = 'staged'
    order by item.public_key, material.recipe_line_key
    for update of material
  loop
    select holding_row.*
    into v_wip_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_material.wip_account_id
      and holding_row.game_item_id = v_material.game_item_id
    for update;
    if not found
      or v_wip_holding.quantity_owned - v_wip_holding.quantity_reserved
        < v_material.staged_quantity
    then
      raise exception 'BUSINESS_MANUFACTURING_WIP_QUANTITY_UNAVAILABLE:%',
        v_material.public_key using errcode = 'P0001';
    end if;

    v_inventory_lines := v_inventory_lines || jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_material.wip_account_id,
        'gameItemId', v_material.game_item_id,
        'playerId', null,
        'storeItemId', v_wip_holding.store_item_id,
        'quantityDelta', -v_material.staged_quantity,
        'reservationDelta', 0,
        'unitCost', v_material.staged_unit_cost,
        'currencyCode', v_material.cost_currency_code,
        'eventType', 'CONSUMED',
        'legacyEventQuantityDelta', -v_material.staged_quantity,
        'eventMetadata', jsonb_build_object(
          'businessKey', v_business.public_key,
          'jobKey', v_job.public_key,
          'materialKey', v_material.public_key,
          'location', 'work_in_progress'
        )
      )
    );
  end loop;

  select count(*)::integer,
    round(
      coalesce(sum(
        employee.wage_per_cycle
          * reservation.reserved_minutes::numeric
          / nullif(employee.labor_minutes_per_cycle, 0)::numeric
      ), 0),
      4
    )
  into v_labor_count, v_labor_cost
  from public.business_labor_reservations as reservation
  join public.business_employees as employee
    on employee.game_session_id = reservation.game_session_id
   and employee.id = reservation.employee_id
   and employee.business_id = reservation.business_id
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_job.business_id
    and reservation.manufacturing_job_id = v_job.id
    and reservation.status in ('reserved','active');

  if v_labor_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_MISSING'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.business_labor_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status not in ('reserved','active')
  ) then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_CONFLICT'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_equipment_count
  from public.business_equipment_reservations as reservation
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_job.business_id
    and reservation.manufacturing_job_id = v_job.id
    and reservation.status in ('reserved','active');

  if exists (
    select 1
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status not in ('reserved','active')
  ) then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_CONFLICT'
      using errcode = 'P0001';
  end if;

  v_total_cost := round(v_material_cost + v_labor_cost, 4);
  v_unit_cost := round(v_total_cost / v_output_quantity::numeric, 6);

  v_inventory_lines := v_inventory_lines || jsonb_build_array(
    jsonb_build_object(
      'inventoryAccountId', v_finished_goods_account_id,
      'gameItemId', v_output.id,
      'playerId', null,
      'storeItemId', v_finished_goods_holding.store_item_id,
      'quantityDelta', v_output_quantity,
      'reservationDelta', 0,
      'unitCost', v_unit_cost,
      'currencyCode', v_currency,
      'eventType', 'PRODUCED',
      'legacyEventQuantityDelta', v_output_quantity,
      'eventMetadata', jsonb_build_object(
        'businessKey', v_business.public_key,
        'jobKey', v_job.public_key,
        'recipeKey', v_job.recipe_snapshot ->> 'recipeKey',
        'location', 'finished_goods',
        'materialCostBasis', v_material_cost,
        'laborCostBasis', v_labor_cost,
        'totalCostBasis', v_total_cost
      )
    )
  );

  v_inventory_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'production',
    'business_manufacturing',
    'job_completed',
    v_job.id,
    'mfg:complete:' || substr(
      encode(
        extensions.digest(
          concat_ws('|', p_game_session_id, v_job.id, v_output_quantity, v_total_cost),
          'sha256'
        ),
        'hex'
      ),
      1,
      48
    ),
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'jobKey', v_job.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'finishedUnitCost', v_unit_cost
    ),
    v_inventory_lines
  );
  if coalesce(v_inventory_post ->> 'status', '') <> 'committed' then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_INVENTORY_POST_FAILED'
      using errcode = 'P0001';
  end if;

  begin
    v_inventory_transaction_id := (v_inventory_post ->> 'transactionId')::uuid;
  exception when invalid_text_representation then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_TRANSACTION_INVALID'
      using errcode = 'P0001';
  end;
  if v_inventory_transaction_id is null then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_TRANSACTION_MISSING'
      using errcode = 'P0001';
  end if;

  update public.business_manufacturing_job_materials
  set
    status = 'consumed',
    consumed_at = v_now
  where game_session_id = p_game_session_id
    and job_id = v_job.id
    and status = 'staged';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_material_count then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_CONSUMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_labor_reservations as reservation
  set
    status = 'consumed',
    consumed_at = v_now,
    manufacturing_labor_cost_basis = round(
      employee.wage_per_cycle
        * reservation.reserved_minutes::numeric
        / nullif(employee.labor_minutes_per_cycle, 0)::numeric,
      4
    )
  from public.business_employees as employee
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_job.business_id
    and reservation.manufacturing_job_id = v_job.id
    and reservation.status in ('reserved','active')
    and employee.game_session_id = reservation.game_session_id
    and employee.id = reservation.employee_id
    and employee.business_id = reservation.business_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_labor_count then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_CONSUMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_equipment_reservations
  set
    status = 'consumed',
    consumed_at = v_now
  where game_session_id = p_game_session_id
    and business_id = v_job.business_id
    and manufacturing_job_id = v_job.id
    and status in ('reserved','active');
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_equipment_count then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_CONSUMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  insert into public.business_manufacturing_completion_receipts(
    game_session_id,
    job_id,
    output_game_item_id,
    inventory_transaction_id,
    completion_token_hash,
    completed_output_quantity,
    material_cost_basis,
    labor_cost_basis,
    total_cost_basis,
    finished_unit_cost,
    cost_currency_code,
    completed_at
  ) values (
    p_game_session_id,
    v_job.id,
    v_output.id,
    v_inventory_transaction_id,
    v_token_hash,
    v_output_quantity,
    v_material_cost,
    v_labor_cost,
    v_total_cost,
    v_unit_cost,
    v_currency,
    v_now
  )
  returning * into v_receipt;

  update public.business_manufacturing_jobs
  set
    status = 'completed',
    resource_state = 'consumed',
    completed_at = v_now,
    completion_lease_token = null,
    completion_lease_expires_at = null,
    last_error_code = null,
    last_error_detail = null,
    completed_output_quantity = v_output_quantity,
    material_cost_basis = v_material_cost,
    labor_cost_basis = v_labor_cost,
    total_cost_basis = v_total_cost,
    finished_unit_cost = v_unit_cost,
    cost_currency_code = v_currency,
    completion_token_hash = v_token_hash
  where game_session_id = p_game_session_id
    and id = v_job.id
    and status = 'in_progress'
  returning * into v_job;
  if v_job.id is null then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_CONFLICT'
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
    'in_progress',
    'completed',
    'system',
    null,
    'business.manufacturing.completed',
    'system:complete:' || v_job.public_key,
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'receiptKey', v_receipt.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'finishedUnitCost', v_unit_cost,
      'inventoryTransactionId', v_inventory_transaction_id
    )
  )
  on conflict on constraint business_manufacturing_job_transitions_idempotency_unique
  do nothing;

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
    'system',
    null,
    'business.manufacturing.completed',
    'business_manufacturing_job',
    v_job.id,
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'receiptKey', v_receipt.public_key,
      'businessKey', v_business.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'finishedUnitCost', v_unit_cost,
      'payrollCashDebitCreated', false,
      'inventoryTransactionId', v_inventory_transaction_id
    )
  );

  return query select
    v_job.public_key,
    v_job.status,
    v_job.resource_state,
    v_output.public_key,
    v_output_quantity,
    v_material_cost,
    v_labor_cost,
    v_total_cost,
    v_unit_cost,
    v_currency,
    v_job.completed_at,
    false;
end
$function$;

revoke all on function public.complete_business_manufacturing_job_v2(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.complete_business_manufacturing_job_v2(
  uuid, uuid, uuid
) to service_role;

comment on function public.complete_business_manufacturing_job_v2(
  uuid, uuid, uuid
) is
  'Lease-validated exact-once Phase 6C completion. Consumes canonical WIP, labor, and installed-equipment holds, posts Finished Goods with material plus labor cost basis, and creates no second payroll cash debit.';

commit;
