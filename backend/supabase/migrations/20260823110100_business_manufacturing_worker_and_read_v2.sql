-- Business V2 Phase 6A: bounded queue start, due-completion leasing, retry
-- release, and public-key-only Player read model.
--
-- No function in this migration may declare a manufacturing job completed. The
-- completion settlement command remains closed until Phase 6B atomically consumes
-- WIP, commits output to Finished Goods, and consumes/releases labor/equipment.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

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
      and job_row.queue_available_at <= v_now
    order by job_row.queue_available_at, job_row.public_key
    for update skip locked
    limit p_batch_size
  loop
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
      continue;
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
        'durationSeconds', v_started.duration_seconds
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

revoke all on function public.start_queued_business_manufacturing_jobs_v2(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.start_queued_business_manufacturing_jobs_v2(
  uuid, integer
) to service_role;

create or replace function public.claim_due_business_manufacturing_jobs_v2(
  p_game_session_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 90
)
returns table (
  job_id uuid,
  job_key text,
  business_id uuid,
  recipe_definition_id uuid,
  output_game_item_id uuid,
  quantity integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  completion_attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.business_manufacturing_jobs%rowtype;
  v_claimed public.business_manufacturing_jobs%rowtype;
begin
  if p_game_session_id is null
    or p_batch_size is null
    or p_batch_size not between 1 and 50
    or p_lease_seconds is null
    or p_lease_seconds not between 30 and 600
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_CLAIM_INVALID'
      using errcode = 'P0001';
  end if;

  for v_job in
    select job_row.*
    from public.business_manufacturing_jobs as job_row
    where job_row.game_session_id = p_game_session_id
      and job_row.status = 'in_progress'
      and job_row.resource_state = 'reserved'
      and job_row.completes_at <= v_now
      and job_row.completion_next_attempt_at <= v_now
      and job_row.completion_attempt_count < job_row.completion_max_attempts
      and (
        job_row.completion_lease_token is null
        or job_row.completion_lease_expires_at <= v_now
      )
    order by job_row.completes_at, job_row.public_key
    for update skip locked
    limit p_batch_size
  loop
    update public.business_manufacturing_jobs
    set
      completion_attempt_count = completion_attempt_count + 1,
      completion_lease_token = extensions.gen_random_uuid(),
      completion_lease_expires_at = v_now + make_interval(secs => p_lease_seconds)
    where id = v_job.id
      and game_session_id = p_game_session_id
      and status = 'in_progress'
    returning * into v_claimed;

    if v_claimed.id is null then
      continue;
    end if;

    job_id := v_claimed.id;
    job_key := v_claimed.public_key;
    business_id := v_claimed.business_id;
    recipe_definition_id := v_claimed.recipe_definition_id;
    output_game_item_id := v_claimed.output_game_item_id;
    quantity := v_claimed.quantity;
    lease_token := v_claimed.completion_lease_token;
    lease_expires_at := v_claimed.completion_lease_expires_at;
    completion_attempt_count := v_claimed.completion_attempt_count;
    return next;
  end loop;
end
$function$;

revoke all on function public.claim_due_business_manufacturing_jobs_v2(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.claim_due_business_manufacturing_jobs_v2(
  uuid, integer, integer
) to service_role;

create or replace function public.release_business_manufacturing_completion_lease_v2(
  p_game_session_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_retry_after_seconds integer,
  p_error_code text,
  p_error_detail text default null
)
returns table (
  job_key text,
  status text,
  next_attempt_at timestamptz,
  completion_attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_error_code text := lower(btrim(coalesce(p_error_code, '')));
  v_job public.business_manufacturing_jobs%rowtype;
begin
  if p_game_session_id is null
    or p_job_id is null
    or p_lease_token is null
    or p_retry_after_seconds is null
    or p_retry_after_seconds not between 1 and 86400
    or v_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or length(coalesce(p_error_detail, '')) > 2000
  then
    raise exception 'BUSINESS_MANUFACTURING_LEASE_RELEASE_INVALID'
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

  if v_job.status <> 'in_progress'
    or v_job.completion_lease_token is distinct from p_lease_token
    or v_job.completion_lease_expires_at is null
    or v_job.completion_lease_expires_at <= v_now
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  update public.business_manufacturing_jobs
  set
    completion_next_attempt_at = v_now + make_interval(secs => p_retry_after_seconds),
    completion_lease_token = null,
    completion_lease_expires_at = null,
    last_error_code = v_error_code,
    last_error_detail = nullif(left(btrim(coalesce(p_error_detail, '')), 2000), '')
  where id = v_job.id
  returning * into v_job;

  return query select
    v_job.public_key,
    v_job.status,
    v_job.completion_next_attempt_at,
    v_job.completion_attempt_count;
end
$function$;

revoke all on function public.release_business_manufacturing_completion_lease_v2(
  uuid, uuid, uuid, integer, text, text
) from public, anon, authenticated;
grant execute on function public.release_business_manufacturing_completion_lease_v2(
  uuid, uuid, uuid, integer, text, text
) to service_role;

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
declare
  v_business record;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

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

revoke all on function public.read_owned_business_manufacturing_jobs_v2(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.read_owned_business_manufacturing_jobs_v2(
  uuid, uuid
) to service_role;

comment on function public.start_queued_business_manufacturing_jobs_v2(uuid, integer) is
  'Bounded same-game queue starter. The server derives started/completion time; the browser cannot declare either timestamp.';
comment on function public.claim_due_business_manufacturing_jobs_v2(uuid, integer, integer) is
  'Bounded lease-based due-job claim using deterministic ordering and FOR UPDATE SKIP LOCKED. This function does not settle output.';
comment on function public.read_owned_business_manufacturing_jobs_v2(uuid, uuid) is
  'Public-key-only timed manufacturing read. Internal UUIDs, leases, request hashes, and reservation ownership remain private.';

commit;
