-- Business V2 Phase 6D: exact-once cancellation/failure resource recovery.
--
-- Queued or in-progress jobs may reach cancelled/failed only after exact staged
-- WIP materials are returned to Warehouse and finite labor/equipment holds are
-- released in the same transaction. Completion and recovery serialize on the
-- same job row; whichever terminal transition commits first wins.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_manufacturing_jobs
  add column if not exists terminal_idempotency_key text null,
  add column if not exists terminal_request_hash text null,
  add column if not exists terminal_reason_code text null,
  add column if not exists terminal_actor_type text null;

alter table public.business_manufacturing_jobs
  add constraint business_manufacturing_jobs_terminal_idempotency_check
    check (
      terminal_idempotency_key is null
      or length(btrim(terminal_idempotency_key)) between 8 and 160
    ),
  add constraint business_manufacturing_jobs_terminal_request_hash_check
    check (
      terminal_request_hash is null
      or terminal_request_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint business_manufacturing_jobs_terminal_reason_check
    check (
      terminal_reason_code is null
      or terminal_reason_code ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    ),
  add constraint business_manufacturing_jobs_terminal_actor_check
    check (
      terminal_actor_type is null
      or terminal_actor_type in ('player','staff_user','system')
    ),
  add constraint business_manufacturing_jobs_terminal_evidence_check
    check (
      (
        status in ('cancelled','failed')
        and terminal_idempotency_key is not null
        and terminal_request_hash is not null
        and terminal_reason_code is not null
        and terminal_actor_type is not null
      )
      or (
        status not in ('cancelled','failed')
        and terminal_idempotency_key is null
        and terminal_request_hash is null
        and terminal_reason_code is null
        and terminal_actor_type is null
      )
    );

create or replace function economy_private.release_business_manufacturing_resources_v2(
  p_game_session_id uuid,
  p_job_id uuid,
  p_terminal_status text,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_terminal text := lower(btrim(coalesce(p_terminal_status, '')));
  v_reason text := lower(btrim(coalesce(p_reason_code, '')));
  v_job public.business_manufacturing_jobs%rowtype;
  v_business public.business_entities%rowtype;
  v_material public.business_manufacturing_job_materials%rowtype;
  v_wip_holding public.inventory_holdings%rowtype;
  v_warehouse_holding public.inventory_holdings%rowtype;
  v_inventory_lines jsonb := '[]'::jsonb;
  v_inventory_post jsonb;
  v_material_count integer := 0;
  v_labor_count integer := 0;
  v_equipment_count integer := 0;
  v_updated_count integer := 0;
begin
  if p_game_session_id is null
    or p_job_id is null
    or v_terminal not in ('cancelled','failed')
    or v_reason !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
  then
    raise exception 'BUSINESS_MANUFACTURING_RESOURCE_RELEASE_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

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
  if v_job.status not in ('queued','in_progress')
    or v_job.resource_state <> 'reserved'
  then
    raise exception 'BUSINESS_MANUFACTURING_RESOURCE_RELEASE_STATE_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_job.business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  for v_material in
    select material.*
    from public.business_manufacturing_job_materials as material
    join public.game_items as item
      on item.game_session_id = material.game_session_id
     and item.id = material.game_item_id
    where material.game_session_id = p_game_session_id
      and material.job_id = v_job.id
    order by item.public_key, material.recipe_line_key
    for update of material
  loop
    if v_material.status <> 'staged'
      or v_material.consumed_at is not null
      or v_material.released_at is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_STATE_INVALID:%',
        v_material.public_key using errcode = 'P0001';
    end if;

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

    select holding_row.*
    into v_warehouse_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_material.warehouse_account_id
      and holding_row.game_item_id = v_material.game_item_id
    for update;

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
        'eventType', 'TRANSFERRED_OUT',
        'legacyEventQuantityDelta', -v_material.staged_quantity,
        'eventMetadata', jsonb_build_object(
          'businessKey', v_business.public_key,
          'jobKey', v_job.public_key,
          'materialKey', v_material.public_key,
          'terminalStatus', v_terminal,
          'reasonCode', v_reason,
          'location', 'work_in_progress'
        )
      ),
      jsonb_build_object(
        'inventoryAccountId', v_material.warehouse_account_id,
        'gameItemId', v_material.game_item_id,
        'playerId', null,
        'storeItemId', coalesce(
          v_warehouse_holding.store_item_id,
          v_wip_holding.store_item_id
        ),
        'quantityDelta', v_material.staged_quantity,
        'reservationDelta', 0,
        'unitCost', v_material.staged_unit_cost,
        'currencyCode', v_material.cost_currency_code,
        'eventType', 'TRANSFERRED_IN',
        'legacyEventQuantityDelta', v_material.staged_quantity,
        'eventMetadata', jsonb_build_object(
          'businessKey', v_business.public_key,
          'jobKey', v_job.public_key,
          'materialKey', v_material.public_key,
          'terminalStatus', v_terminal,
          'reasonCode', v_reason,
          'location', 'warehouse'
        )
      )
    );
    v_material_count := v_material_count + 1;
  end loop;

  if v_material_count > 0 then
    v_inventory_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'transfer',
      'business',
      'manufacturing_resources_released',
      v_job.id,
      'manufacturing-release:' || v_job.public_key,
      jsonb_build_object(
        'businessKey', v_business.public_key,
        'jobKey', v_job.public_key,
        'terminalStatus', v_terminal,
        'reasonCode', v_reason
      ),
      v_inventory_lines
    );
    if coalesce(v_inventory_post->>'committed', 'false') <> 'true' then
      raise exception 'BUSINESS_MANUFACTURING_RESOURCE_RELEASE_POST_FAILED'
        using errcode = 'P0001';
    end if;
  end if;

  select count(*)::integer
  into v_labor_count
  from public.business_labor_reservations as reservation
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_job.business_id
    and reservation.manufacturing_job_id = v_job.id
    and reservation.status in ('reserved','active');

  if exists (
    select 1
    from public.business_labor_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status not in ('reserved','active')
  ) then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_RELEASE_CONFLICT'
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
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_RELEASE_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_manufacturing_job_materials
  set
    status = 'released',
    released_at = v_now
  where game_session_id = p_game_session_id
    and job_id = v_job.id
    and status = 'staged';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_material_count then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_RELEASE_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_labor_reservations
  set
    status = 'released',
    released_at = v_now
  where game_session_id = p_game_session_id
    and business_id = v_job.business_id
    and manufacturing_job_id = v_job.id
    and status in ('reserved','active');
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_labor_count then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_RELEASE_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_equipment_reservations
  set
    status = 'released',
    released_at = v_now
  where game_session_id = p_game_session_id
    and business_id = v_job.business_id
    and manufacturing_job_id = v_job.id
    and status in ('reserved','active');
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_equipment_count then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_RELEASE_CONFLICT'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'jobKey', v_job.public_key,
    'terminalStatus', v_terminal,
    'reasonCode', v_reason,
    'materialLinesReleased', v_material_count,
    'laborReservationsReleased', v_labor_count,
    'equipmentReservationsReleased', v_equipment_count,
    'committed', true
  );
end
$function$;

revoke all on function economy_private.release_business_manufacturing_resources_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function economy_private.release_business_manufacturing_resources_v2(
  uuid, uuid, text, text
) to service_role;

create or replace function public.cancel_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_job_key text,
  p_idempotency_key text
)
returns table (
  business_key text,
  job_key text,
  status text,
  resource_state text,
  cancelled_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_business record;
  v_job public.business_manufacturing_jobs%rowtype;
  v_hash text;
  v_release jsonb;
begin
  if p_game_session_id is null
    or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_job_key, '') !~ '^mfg_[0-9a-f]{32}$'
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_MANUFACTURING_CANCEL_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_business.business_key is distinct from lower(btrim(p_business_key)) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_hash := encode(
    extensions.digest(
      concat_ws(
        '|', p_game_session_id, p_player_id, v_business.business_id,
        lower(btrim(p_job_key)), 'cancelled'
      ),
      'sha256'
    ),
    'hex'
  );

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.business_id = v_business.business_id
    and job_row.public_key = lower(btrim(p_job_key))
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_job.status = 'cancelled' then
    if v_job.terminal_idempotency_key is distinct from btrim(p_idempotency_key)
      or v_job.terminal_request_hash is distinct from v_hash
    then
      raise exception 'BUSINESS_MANUFACTURING_TERMINAL_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return query select
      v_business.business_key,
      v_job.public_key,
      v_job.status,
      v_job.resource_state,
      v_job.cancelled_at,
      true;
    return;
  end if;

  if v_job.status not in ('queued','in_progress')
    or v_job.resource_state <> 'reserved'
  then
    raise exception 'BUSINESS_MANUFACTURING_CANCEL_STATE_INVALID'
      using errcode = 'P0001';
  end if;

  v_release := economy_private.release_business_manufacturing_resources_v2(
    p_game_session_id,
    v_job.id,
    'cancelled',
    'player_cancelled'
  );
  if coalesce(v_release->>'committed', 'false') <> 'true' then
    raise exception 'BUSINESS_MANUFACTURING_RESOURCE_RELEASE_FAILED'
      using errcode = 'P0001';
  end if;

  update public.business_manufacturing_jobs
  set
    status = 'cancelled',
    resource_state = 'released',
    cancelled_at = v_now,
    completion_lease_token = null,
    completion_lease_expires_at = null,
    terminal_idempotency_key = btrim(p_idempotency_key),
    terminal_request_hash = v_hash,
    terminal_reason_code = 'player_cancelled',
    terminal_actor_type = 'player',
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
    case when v_job.started_at is null then 'queued' else 'in_progress' end,
    'cancelled',
    'player',
    p_player_id,
    'business.manufacturing.cancelled',
    btrim(p_idempotency_key),
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'jobKey', v_job.public_key,
      'reasonCode', v_job.terminal_reason_code,
      'resourceRelease', v_release
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
    'business.manufacturing.cancelled',
    'business_manufacturing_job',
    v_job.id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'jobKey', v_job.public_key,
      'reasonCode', v_job.terminal_reason_code,
      'idempotencyKey', btrim(p_idempotency_key),
      'resourceRelease', v_release
    )
  );

  return query select
    v_business.business_key,
    v_job.public_key,
    v_job.status,
    v_job.resource_state,
    v_job.cancelled_at,
    false;
end
$function$;

revoke all on function public.cancel_business_manufacturing_job_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.cancel_business_manufacturing_job_v2(
  uuid, uuid, text, text, text
) to service_role;

create or replace function public.fail_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_job_id uuid,
  p_reason_code text,
  p_idempotency_key text
)
returns table (
  business_key text,
  job_key text,
  status text,
  resource_state text,
  failed_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_reason text := lower(btrim(coalesce(p_reason_code, '')));
  v_job public.business_manufacturing_jobs%rowtype;
  v_business public.business_entities%rowtype;
  v_hash text;
  v_release jsonb;
begin
  if p_game_session_id is null
    or p_job_id is null
    or v_reason !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_MANUFACTURING_FAIL_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  v_hash := encode(
    extensions.digest(
      concat_ws('|', p_game_session_id, p_job_id, v_reason, 'failed'),
      'sha256'
    ),
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

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_job.business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status = 'failed' then
    if v_job.terminal_idempotency_key is distinct from btrim(p_idempotency_key)
      or v_job.terminal_request_hash is distinct from v_hash
    then
      raise exception 'BUSINESS_MANUFACTURING_TERMINAL_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return query select
      v_business.public_key,
      v_job.public_key,
      v_job.status,
      v_job.resource_state,
      v_job.failed_at,
      true;
    return;
  end if;

  if v_job.status not in ('queued','in_progress')
    or v_job.resource_state <> 'reserved'
  then
    raise exception 'BUSINESS_MANUFACTURING_FAIL_STATE_INVALID'
      using errcode = 'P0001';
  end if;

  if v_job.completion_lease_token is not null
    and v_job.completion_lease_expires_at > v_now
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_LEASE_ACTIVE'
      using errcode = 'P0001';
  end if;

  if v_reason = 'completion_attempts_exhausted'
    and v_job.completion_attempt_count < v_job.completion_max_attempts
  then
    raise exception 'BUSINESS_MANUFACTURING_ATTEMPTS_NOT_EXHAUSTED'
      using errcode = 'P0001';
  end if;

  v_release := economy_private.release_business_manufacturing_resources_v2(
    p_game_session_id,
    v_job.id,
    'failed',
    v_reason
  );
  if coalesce(v_release->>'committed', 'false') <> 'true' then
    raise exception 'BUSINESS_MANUFACTURING_RESOURCE_RELEASE_FAILED'
      using errcode = 'P0001';
  end if;

  update public.business_manufacturing_jobs
  set
    status = 'failed',
    resource_state = 'released',
    failed_at = v_now,
    completion_lease_token = null,
    completion_lease_expires_at = null,
    terminal_idempotency_key = btrim(p_idempotency_key),
    terminal_request_hash = v_hash,
    terminal_reason_code = v_reason,
    terminal_actor_type = 'system',
    last_error_code = v_reason,
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
    case when v_job.started_at is null then 'queued' else 'in_progress' end,
    'failed',
    'system',
    null,
    'business.manufacturing.failed',
    btrim(p_idempotency_key),
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'jobKey', v_job.public_key,
      'reasonCode', v_job.terminal_reason_code,
      'resourceRelease', v_release
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
    'business.manufacturing.failed',
    'business_manufacturing_job',
    v_job.id,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'jobKey', v_job.public_key,
      'reasonCode', v_job.terminal_reason_code,
      'resourceRelease', v_release
    )
  );

  return query select
    v_business.public_key,
    v_job.public_key,
    v_job.status,
    v_job.resource_state,
    v_job.failed_at,
    false;
end
$function$;

revoke all on function public.fail_business_manufacturing_job_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.fail_business_manufacturing_job_v2(
  uuid, uuid, text, text
) to service_role;

create or replace function public.fail_exhausted_business_manufacturing_jobs_v2(
  p_game_session_id uuid,
  p_batch_size integer default 25
)
returns table (
  job_key text,
  status text,
  failed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.business_manufacturing_jobs%rowtype;
  v_failed record;
begin
  if p_game_session_id is null
    or p_batch_size is null
    or p_batch_size not between 1 and 100
  then
    raise exception 'BUSINESS_MANUFACTURING_FAILURE_BATCH_INVALID'
      using errcode = 'P0001';
  end if;

  for v_job in
    select job_row.*
    from public.business_manufacturing_jobs as job_row
    where job_row.game_session_id = p_game_session_id
      and job_row.status = 'in_progress'
      and job_row.resource_state = 'reserved'
      and job_row.completion_attempt_count >= job_row.completion_max_attempts
      and (
        job_row.completion_lease_token is null
        or job_row.completion_lease_expires_at <= v_now
      )
    order by job_row.completes_at, job_row.public_key
    for update skip locked
    limit p_batch_size
  loop
    select failed.*
    into v_failed
    from public.fail_business_manufacturing_job_v2(
      p_game_session_id,
      v_job.id,
      'completion_attempts_exhausted',
      'system:exhausted:' || v_job.public_key
    ) as failed;

    job_key := v_failed.job_key;
    status := v_failed.status;
    failed_at := v_failed.failed_at;
    return next;
  end loop;
end
$function$;

revoke all on function public.fail_exhausted_business_manufacturing_jobs_v2(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.fail_exhausted_business_manufacturing_jobs_v2(
  uuid, integer
) to service_role;

comment on function public.cancel_business_manufacturing_job_v2(
  uuid, uuid, text, text, text
) is
  'Player-owned idempotent manufacturing cancellation. Exact WIP, labor, and equipment holds are released before the terminal state commits.';
comment on function public.fail_exhausted_business_manufacturing_jobs_v2(
  uuid, integer
) is
  'Bounded same-game recovery for jobs that exhausted completion attempts. Uses deterministic ordering and exact-once resource release.';

commit;
