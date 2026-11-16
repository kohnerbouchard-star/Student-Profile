-- Business V2 Phase 6E: authenticated Player-facing manufacturing wrappers.
--
-- These functions do not create a second production authority. Start and cancel
-- delegate to the Phase 6B/6D commands. Reads expose public keys and immutable
-- server timing only. Internal UUIDs, leases, reservation evidence, cost-basis
-- internals, and worker commands remain private to the service role.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.list_player_business_manufacturing_jobs_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 250);
  v_result jsonb;
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'BUSINESS_MANUFACTURING_SCOPE_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_business_key, ''))) not between 5 and 160 then
    raise exception 'BUSINESS_KEY_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.business_entities as business
    where business.game_session_id = p_game_session_id
      and business.owner_player_id = p_player_id
      and business.public_key = lower(btrim(p_business_key))
  ) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(job_payload order by sort_key desc, job_key desc), '[]'::jsonb)
  into v_result
  from (
    select
      job.public_key as job_key,
      coalesce(
        (to_jsonb(job)->>'queued_at')::timestamptz,
        (to_jsonb(job)->>'started_at')::timestamptz,
        (to_jsonb(job)->>'created_at')::timestamptz,
        '-infinity'::timestamptz
      ) as sort_key,
      jsonb_build_object(
        'jobKey', job.public_key,
        'businessKey', business.public_key,
        'productKey', product.public_key,
        'productName', product.name,
        'status', job.status,
        'resourceState', job.resource_state,
        'priority', job.priority,
        'quantity', coalesce(
          nullif(to_jsonb(job)->>'requested_quantity', '')::integer,
          nullif(to_jsonb(job)->>'quantity', '')::integer,
          0
        ),
        'completedOutputQuantity', coalesce(
          nullif(to_jsonb(job)->>'completed_output_quantity', '')::integer,
          0
        ),
        'queuedAt', to_jsonb(job)->>'queued_at',
        'startedAt', to_jsonb(job)->>'started_at',
        'completesAt', to_jsonb(job)->>'completes_at',
        'completedAt', to_jsonb(job)->>'completed_at',
        'cancelledAt', to_jsonb(job)->>'cancelled_at',
        'failedAt', to_jsonb(job)->>'failed_at',
        'failureCode', coalesce(
          to_jsonb(job)->>'failure_code',
          to_jsonb(job)->>'last_error_code'
        ),
        'canCancel', job.status in ('queued', 'in_progress')
      ) as job_payload
    from public.business_manufacturing_jobs as job
    join public.business_entities as business
      on business.id = job.business_id
     and business.game_session_id = job.game_session_id
     and business.owner_player_id = p_player_id
    join public.business_products as product
      on product.id = job.product_id
     and product.game_session_id = job.game_session_id
    where job.game_session_id = p_game_session_id
      and job.requested_by_player_id = p_player_id
      and business.public_key = lower(btrim(p_business_key))
    order by sort_key desc, job.public_key desc
    limit v_limit
  ) as jobs;

  return coalesce(v_result, '[]'::jsonb);
end
$function$;

create or replace function public.start_player_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_quantity integer,
  p_priority text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_started record;
  v_started_payload jsonb;
  v_job_key text;
  v_jobs jsonb;
  v_job jsonb;
begin
  select started.*
  into v_started
  from public.start_business_manufacturing_job_v2(
    p_game_session_id,
    p_player_id,
    p_business_key,
    p_product_key,
    p_quantity,
    p_priority,
    p_idempotency_key
  ) as started;

  v_started_payload := to_jsonb(v_started);
  v_job_key := coalesce(
    v_started_payload->>'job_key',
    v_started_payload->>'public_key'
  );

  if v_job_key is null then
    raise exception 'BUSINESS_MANUFACTURING_START_RESULT_INVALID' using errcode = 'P0001';
  end if;

  v_jobs := public.list_player_business_manufacturing_jobs_v2(
    p_game_session_id,
    p_player_id,
    p_business_key,
    250
  );

  select element
  into v_job
  from jsonb_array_elements(v_jobs) as element
  where element->>'jobKey' = v_job_key
  limit 1;

  if v_job is null then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_job || jsonb_build_object(
    'replayed', coalesce(nullif(v_started_payload->>'replayed', '')::boolean, false)
  );
end
$function$;

create or replace function public.cancel_player_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_job_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_cancelled record;
  v_cancelled_payload jsonb;
  v_jobs jsonb;
  v_job jsonb;
begin
  select cancelled.*
  into v_cancelled
  from public.cancel_business_manufacturing_job_v2(
    p_game_session_id,
    p_player_id,
    p_business_key,
    p_job_key,
    p_idempotency_key
  ) as cancelled;

  v_cancelled_payload := to_jsonb(v_cancelled);
  v_jobs := public.list_player_business_manufacturing_jobs_v2(
    p_game_session_id,
    p_player_id,
    p_business_key,
    250
  );

  select element
  into v_job
  from jsonb_array_elements(v_jobs) as element
  where element->>'jobKey' = lower(btrim(p_job_key))
  limit 1;

  if v_job is null then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_job || jsonb_build_object(
    'replayed', coalesce(nullif(v_cancelled_payload->>'replayed', '')::boolean, false)
  );
end
$function$;

revoke all on function public.list_player_business_manufacturing_jobs_v2(uuid, uuid, text, integer) from public;
revoke all on function public.start_player_business_manufacturing_job_v2(uuid, uuid, text, text, integer, text, text) from public;
revoke all on function public.cancel_player_business_manufacturing_job_v2(uuid, uuid, text, text, text) from public;

grant execute on function public.list_player_business_manufacturing_jobs_v2(uuid, uuid, text, integer) to service_role;
grant execute on function public.start_player_business_manufacturing_job_v2(uuid, uuid, text, text, integer, text, text) to service_role;
grant execute on function public.cancel_player_business_manufacturing_job_v2(uuid, uuid, text, text, text) to service_role;

comment on function public.list_player_business_manufacturing_jobs_v2(uuid, uuid, text, integer) is
  'Phase 6E public-key-only Player read model for one owned Business manufacturing queue and history.';
comment on function public.start_player_business_manufacturing_job_v2(uuid, uuid, text, text, integer, text, text) is
  'Phase 6E Player start wrapper. Delegates all material, labor, equipment, timing, and idempotency authority to start_business_manufacturing_job_v2.';
comment on function public.cancel_player_business_manufacturing_job_v2(uuid, uuid, text, text, text) is
  'Phase 6E Player cancellation wrapper. Delegates recovery and exact-once release authority to cancel_business_manufacturing_job_v2.';

commit;
