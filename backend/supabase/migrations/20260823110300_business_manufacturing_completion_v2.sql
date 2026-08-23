-- Business V2 Phase 6C: lease-validated exact-once manufacturing completion.
--
-- A due worker lease atomically consumes held Work in Progress materials, posts
-- the exact canonical output into Finished Goods with material + labor cost
-- basis, consumes labor/equipment reservations, appends evidence, and marks the
-- job completed. Cancellation/failure recovery and Player cutover remain closed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_manufacturing_jobs
  add column output_quantity integer null,
  add column material_cost_basis numeric(14,2) not null default 0,
  add column labor_cost_basis numeric(14,2) not null default 0,
  add column total_cost_basis numeric(14,2) not null default 0,
  add column output_unit_cost_basis numeric(18,6) not null default 0,
  add column cost_currency_code text null,
  add column completion_receipt_hash text null;

alter table public.business_manufacturing_jobs
  add constraint business_manufacturing_jobs_output_quantity_check
    check (output_quantity is null or output_quantity between 1 and 100000000),
  add constraint business_manufacturing_jobs_cost_basis_check
    check (
      material_cost_basis >= 0
      and labor_cost_basis >= 0
      and total_cost_basis >= 0
      and output_unit_cost_basis >= 0
      and total_cost_basis = material_cost_basis + labor_cost_basis
    ),
  add constraint business_manufacturing_jobs_cost_currency_check
    check (cost_currency_code is null or cost_currency_code ~ '^[A-Z]{3}$'),
  add constraint business_manufacturing_jobs_completion_receipt_hash_check
    check (
      completion_receipt_hash is null
      or completion_receipt_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint business_manufacturing_jobs_completion_economics_state_check
    check (
      (
        status = 'completed'
        and output_quantity is not null
        and cost_currency_code is not null
        and completion_receipt_hash is not null
      )
      or (
        status <> 'completed'
        and output_quantity is null
        and material_cost_basis = 0
        and labor_cost_basis = 0
        and total_cost_basis = 0
        and output_unit_cost_basis = 0
        and cost_currency_code is null
        and completion_receipt_hash is null
      )
    );

create table public.business_manufacturing_completion_receipts (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('mcr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  output_game_item_id uuid not null,
  output_quantity integer not null,
  material_cost_basis numeric(14,2) not null,
  labor_cost_basis numeric(14,2) not null,
  total_cost_basis numeric(14,2) not null,
  output_unit_cost_basis numeric(18,6) not null,
  cost_currency_code text not null,
  inventory_idempotency_key text not null,
  completion_lease_hash text not null,
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
  constraint business_manufacturing_completion_receipts_quantity_check
    check (output_quantity between 1 and 100000000),
  constraint business_manufacturing_completion_receipts_cost_check
    check (
      material_cost_basis >= 0
      and labor_cost_basis >= 0
      and total_cost_basis = material_cost_basis + labor_cost_basis
      and output_unit_cost_basis >= 0
    ),
  constraint business_manufacturing_completion_receipts_currency_check
    check (cost_currency_code ~ '^[A-Z]{3}$'),
  constraint business_manufacturing_completion_receipts_inventory_key_check
    check (length(btrim(inventory_idempotency_key)) between 8 and 160),
  constraint business_manufacturing_completion_receipts_lease_hash_check
    check (completion_lease_hash ~ '^[0-9a-f]{64}$'),
  constraint business_manufacturing_completion_receipts_job_unique
    unique (game_session_id, job_id),
  constraint business_manufacturing_completion_receipts_inventory_key_unique
    unique (game_session_id, inventory_idempotency_key)
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
  from public, anon, authenticated, service_role;
grant select on table public.business_manufacturing_completion_receipts
  to service_role;

create or replace function public.complete_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_job_key text,
  p_lease_token uuid
)
returns table (
  job_key text,
  receipt_key text,
  status text,
  resource_state text,
  output_item_key text,
  output_quantity integer,
  material_cost_basis numeric,
  labor_cost_basis numeric,
  total_cost_basis numeric,
  output_unit_cost_basis numeric,
  cost_currency_code text,
  completed_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
  v_business public.business_entities%rowtype;
  v_output public.game_items%rowtype;
  v_recipe_output public.physical_economy_recipe_outputs%rowtype;
  v_party public.economic_parties%rowtype;
  v_finished_goods public.inventory_accounts%rowtype;
  v_material public.business_manufacturing_material_holds%rowtype;
  v_wip_holding public.inventory_holdings%rowtype;
  v_labor record;
  v_equipment record;
  v_receipt public.business_manufacturing_completion_receipts%rowtype;
  v_journal_lines jsonb := '[]'::jsonb;
  v_inventory_result jsonb;
  v_inventory_idempotency text;
  v_lease_hash text;
  v_output_quantity integer;
  v_material_cost numeric := 0;
  v_labor_cost numeric := 0;
  v_total_cost numeric := 0;
  v_unit_cost numeric := 0;
  v_material_count integer := 0;
  v_labor_count integer := 0;
  v_equipment_count integer := 0;
  v_currency_count integer := 0;
  v_currency text;
  v_now timestamptz := clock_timestamp();
begin
  p_job_key := lower(btrim(coalesce(p_job_key, '')));
  if p_game_session_id is null
    or p_job_key !~ '^mfg_[0-9a-f]{32}$'
    or p_lease_token is null
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  v_lease_hash := encode(
    extensions.digest(p_lease_token::text, 'sha256'),
    'hex'
  );

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.public_key = p_job_key
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_job.status = 'completed' then
    select receipt_row.*
    into v_receipt
    from public.business_manufacturing_completion_receipts as receipt_row
    where receipt_row.game_session_id = p_game_session_id
      and receipt_row.job_id = v_job.id;
    if not found
      or v_receipt.completion_lease_hash is distinct from v_lease_hash
      or v_job.completion_receipt_hash is distinct from v_lease_hash
    then
      raise exception 'BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT'
        using errcode = 'P0001';
    end if;

    select item_row.*
    into v_output
    from public.game_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.id = v_receipt.output_game_item_id;

    return query select
      v_job.public_key,
      v_receipt.public_key,
      v_job.status,
      v_job.resource_state,
      v_output.public_key,
      v_receipt.output_quantity,
      v_receipt.material_cost_basis,
      v_receipt.labor_cost_basis,
      v_receipt.total_cost_basis,
      v_receipt.output_unit_cost_basis,
      v_receipt.cost_currency_code,
      v_receipt.completed_at,
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

  select recipe_output.*
  into v_recipe_output
  from public.physical_economy_recipe_outputs as recipe_output
  where recipe_output.recipe_id = v_job.recipe_definition_id
    and recipe_output.item_key = v_output.canonical_key
  order by recipe_output.line_key
  limit 1;
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

  v_output_quantity := ceil(v_recipe_output.base_quantity * v_job.quantity)::integer;
  if v_output_quantity <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_QUANTITY_INVALID'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_job.business_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PARTY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_finished_goods
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'finished_goods'
    and account_row.location_key is null
    and account_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_FINISHED_GOODS_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    count(distinct hold.cost_currency_code)::integer,
    min(hold.cost_currency_code),
    coalesce(sum(hold.unit_cost * hold.quantity), 0)::numeric
  into v_material_count, v_currency_count, v_currency, v_material_cost
  from public.business_manufacturing_material_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = v_job.id
    and hold.status = 'held';

  if v_material_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_MISSING'
      using errcode = 'P0001';
  end if;
  if v_currency_count <> 1 or v_currency is distinct from v_business.currency_code then
    raise exception 'BUSINESS_MANUFACTURING_COST_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  for v_material in
    select hold.*
    from public.business_manufacturing_material_holds as hold
    where hold.game_session_id = p_game_session_id
      and hold.job_id = v_job.id
      and hold.status = 'held'
    order by hold.line_key, hold.public_key
    for update
  loop
    select holding_row.*
    into v_wip_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_material.work_in_progress_account_id
      and holding_row.game_item_id = v_material.game_item_id
    for update;
    if not found
      or v_wip_holding.quantity_owned - v_wip_holding.quantity_reserved < v_material.quantity
    then
      raise exception 'BUSINESS_MANUFACTURING_WIP_HOLDING_INVALID:%',
        v_material.line_key using errcode = 'P0001';
    end if;

    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_material.work_in_progress_account_id,
        'gameItemId', v_material.game_item_id,
        'playerId', null,
        'storeItemId', v_wip_holding.store_item_id,
        'quantityDelta', -v_material.quantity,
        'reservationDelta', 0,
        'unitCost', v_material.unit_cost,
        'currencyCode', v_material.cost_currency_code,
        'eventType', 'CONSUMED',
        'legacyEventQuantityDelta', -v_material.quantity,
        'eventMetadata', jsonb_build_object(
          'jobKey', v_job.public_key,
          'lineKey', v_material.line_key,
          'location', 'work_in_progress'
        )
      )
    );
  end loop;

  select
    count(*)::integer,
    coalesce(sum(hold.allocated_labor_cost), 0)::numeric
  into v_labor_count, v_labor_cost
  from public.business_manufacturing_labor_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = v_job.id;

  select count(*)::integer
  into v_equipment_count
  from public.business_manufacturing_equipment_holds as hold
  where hold.game_session_id = p_game_session_id
    and hold.job_id = v_job.id;

  v_material_cost := round(v_material_cost, 2);
  v_labor_cost := round(v_labor_cost, 2);
  v_total_cost := v_material_cost + v_labor_cost;
  v_unit_cost := round(v_total_cost / nullif(v_output_quantity, 0), 6);

  v_journal_lines := v_journal_lines || jsonb_build_array(
    jsonb_build_object(
      'inventoryAccountId', v_finished_goods.id,
      'gameItemId', v_output.id,
      'playerId', null,
      'storeItemId', null,
      'quantityDelta', v_output_quantity,
      'reservationDelta', 0,
      'unitCost', v_unit_cost,
      'currencyCode', v_currency,
      'eventType', 'PRODUCED',
      'legacyEventQuantityDelta', v_output_quantity,
      'eventMetadata', jsonb_build_object(
        'jobKey', v_job.public_key,
        'recipeDefinitionId', v_job.recipe_definition_id,
        'location', 'finished_goods',
        'materialCostBasis', v_material_cost,
        'laborCostBasis', v_labor_cost,
        'totalCostBasis', v_total_cost
      )
    )
  );

  v_inventory_idempotency := 'mfg:complete:' || substr(
    encode(
      extensions.digest(
        concat_ws('|', p_game_session_id, v_job.id, v_output_quantity, v_total_cost),
        'sha256'
      ),
      'hex'
    ),
    1,
    48
  );

  v_inventory_result := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'production',
    'business_manufacturing',
    'job_completed',
    v_job.id,
    v_inventory_idempotency,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'jobKey', v_job.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'costCurrencyCode', v_currency
    ),
    v_journal_lines
  );

  for v_labor in
    select reservation.*
    from public.business_manufacturing_labor_holds as hold
    join public.business_labor_reservations as reservation
      on reservation.game_session_id = hold.game_session_id
     and reservation.id = hold.labor_reservation_id
    where hold.game_session_id = p_game_session_id
      and hold.job_id = v_job.id
    order by reservation.public_key
    for update of reservation
  loop
    if v_labor.status not in ('reserved','active')
      or v_labor.consumed_at is not null
      or v_labor.released_at is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_INVALID'
        using errcode = 'P0001';
    end if;

    update public.business_labor_reservations
    set
      status = 'consumed',
      consumed_at = v_now
    where id = v_labor.id;
  end loop;

  for v_equipment in
    select reservation.*
    from public.business_manufacturing_equipment_holds as hold
    join public.business_equipment_reservations as reservation
      on reservation.game_session_id = hold.game_session_id
     and reservation.id = hold.equipment_reservation_id
    where hold.game_session_id = p_game_session_id
      and hold.job_id = v_job.id
    order by reservation.public_key
    for update of reservation
  loop
    if v_equipment.status not in ('reserved','active')
      or v_equipment.consumed_at is not null
      or v_equipment.released_at is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INVALID'
        using errcode = 'P0001';
    end if;

    update public.business_equipment_reservations
    set
      status = 'consumed',
      consumed_at = v_now
    where id = v_equipment.id;
  end loop;

  update public.business_manufacturing_material_holds
  set
    status = 'consumed',
    consumed_at = v_now
  where game_session_id = p_game_session_id
    and job_id = v_job.id
    and status = 'held';

  insert into public.business_manufacturing_completion_receipts(
    game_session_id,
    job_id,
    output_game_item_id,
    output_quantity,
    material_cost_basis,
    labor_cost_basis,
    total_cost_basis,
    output_unit_cost_basis,
    cost_currency_code,
    inventory_idempotency_key,
    completion_lease_hash,
    completed_at
  ) values (
    p_game_session_id,
    v_job.id,
    v_output.id,
    v_output_quantity,
    v_material_cost,
    v_labor_cost,
    v_total_cost,
    v_unit_cost,
    v_currency,
    v_inventory_idempotency,
    v_lease_hash,
    v_now
  )
  returning * into v_receipt;

  update public.business_manufacturing_jobs
  set
    status = 'completed',
    resource_state = 'consumed',
    output_quantity = v_output_quantity,
    material_cost_basis = v_material_cost,
    labor_cost_basis = v_labor_cost,
    total_cost_basis = v_total_cost,
    output_unit_cost_basis = v_unit_cost,
    cost_currency_code = v_currency,
    completion_receipt_hash = v_lease_hash,
    completed_at = v_now,
    completion_lease_token = null,
    completion_lease_expires_at = null,
    last_error_code = null,
    last_error_detail = null
  where id = v_job.id
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
    'in_progress',
    'completed',
    'system',
    null,
    'business.manufacturing.completed',
    'system:complete:' || substr(v_lease_hash, 1, 48),
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'receiptKey', v_receipt.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'outputUnitCostBasis', v_unit_cost,
      'costCurrencyCode', v_currency,
      'materialHoldCount', v_material_count,
      'laborHoldCount', v_labor_count,
      'equipmentHoldCount', v_equipment_count
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
    'system',
    null,
    'business.manufacturing.completed',
    'business_manufacturing_job',
    v_job.id,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'jobKey', v_job.public_key,
      'receiptKey', v_receipt.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'totalCostBasis', v_total_cost,
      'costCurrencyCode', v_currency,
      'inventoryIdempotencyKey', v_inventory_idempotency
    )
  );

  return query select
    v_job.public_key,
    v_receipt.public_key,
    v_job.status,
    v_job.resource_state,
    v_output.public_key,
    v_receipt.output_quantity,
    v_receipt.material_cost_basis,
    v_receipt.labor_cost_basis,
    v_receipt.total_cost_basis,
    v_receipt.output_unit_cost_basis,
    v_receipt.cost_currency_code,
    v_receipt.completed_at,
    false;
end
$function$;

revoke all on function public.complete_business_manufacturing_job_v2(
  uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.complete_business_manufacturing_job_v2(
  uuid, text, uuid
) to service_role;

comment on function public.complete_business_manufacturing_job_v2(
  uuid, text, uuid
) is
  'Lease-validated exact-once Phase 6C completion. Consumes WIP and finite labor/equipment, posts exact Finished Goods output, and commits terminal evidence atomically.';

commit;
