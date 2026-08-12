-- Story event execution lease and finalize-on-success authority.
--
-- A Story event may mutate several independent domains. Resolution therefore
-- cannot be recorded before those side effects and cutscene delivery succeed.
-- This migration adds a service-role-only execution claim that freezes the
-- first execution plan and effective event time. Failed or abandoned attempts
-- may reacquire the same frozen plan after a bounded lease; only finalize writes
-- the canonical story_event_resolutions row.

begin;

create table if not exists public.story_event_execution_claims (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  storyline_event_id uuid not null references public.storyline_events (id) on delete cascade,
  status text not null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  effective_at timestamptz not null,
  effective_market_tick integer null,
  attempt_count integer not null default 1,
  execution_plan jsonb not null,
  last_error text null,
  completed_resolution_id uuid null references public.story_event_resolutions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint story_event_execution_claims_scope_unique
    unique (game_session_id, storyline_event_id),
  constraint story_event_execution_claims_status_check
    check (status in ('executing', 'retryable_failed', 'completed')),
  constraint story_event_execution_claims_market_tick_non_negative
    check (effective_market_tick is null or effective_market_tick >= 0),
  constraint story_event_execution_claims_attempt_positive
    check (attempt_count >= 1),
  constraint story_event_execution_claims_plan_object
    check (jsonb_typeof(execution_plan) = 'object'),
  constraint story_event_execution_claims_last_error_bounded
    check (last_error is null or length(last_error) <= 2000),
  constraint story_event_execution_claims_lease_shape
    check (
      (status = 'executing' and lease_token is not null and lease_expires_at is not null)
      or (status <> 'executing' and lease_token is null and lease_expires_at is null)
    ),
  constraint story_event_execution_claims_completed_shape
    check (
      status <> 'completed'
      or completed_resolution_id is not null
    )
);

comment on table public.story_event_execution_claims is
  'Service-role Story execution lease. Freezes the first target/effect plan and effective time so retries cannot retarget a changed roster or re-time an event.';

create index if not exists story_event_execution_claims_retry_idx
  on public.story_event_execution_claims (status, lease_expires_at)
  where status in ('executing', 'retryable_failed');

alter table public.story_event_execution_claims enable row level security;
alter table public.story_event_execution_claims force row level security;

revoke all on table public.story_event_execution_claims from public, anon, authenticated;
grant select, insert, update on table public.story_event_execution_claims to service_role;

create or replace function public.claim_story_event_execution_v1(
  p_game_session_id uuid,
  p_storyline_event_id uuid,
  p_effective_at timestamptz,
  p_effective_market_tick integer,
  p_execution_plan jsonb,
  p_lease_seconds integer default 120
)
returns table (
  claim_outcome text,
  claim_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  effective_at timestamptz,
  effective_market_tick integer,
  attempt_count integer,
  execution_plan jsonb,
  resolution_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_claim public.story_event_execution_claims%rowtype;
  v_resolution public.story_event_resolutions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_token uuid;
begin
  if p_game_session_id is null
     or p_storyline_event_id is null
     or p_effective_at is null
     or p_effective_market_tick is null
     or p_effective_market_tick < 0
     or p_lease_seconds not between 30 and 600
     or (p_execution_plan is not null and jsonb_typeof(p_execution_plan) <> 'object') then
    raise exception 'STORY_EXECUTION_CLAIM_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status in ('active', 'paused')
  ) then
    raise exception 'STORY_EXECUTION_GAME_NOT_MUTABLE' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.storyline_events as event_row
    where event_row.id = p_storyline_event_id
  ) then
    raise exception 'STORY_EXECUTION_EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_game_session_id::text || ':' || p_storyline_event_id::text,
      0
    )
  );

  select *
  into v_resolution
  from public.story_event_resolutions as resolution_row
  where resolution_row.game_session_id = p_game_session_id
    and resolution_row.storyline_event_id = p_storyline_event_id;

  if found then
    select *
    into v_claim
    from public.story_event_execution_claims as claim_row
    where claim_row.game_session_id = p_game_session_id
      and claim_row.storyline_event_id = p_storyline_event_id;

    return query
    select
      'already_resolved'::text,
      v_claim.id,
      null::uuid,
      null::timestamptz,
      coalesce(v_claim.effective_at, v_resolution.resolved_at),
      coalesce(v_claim.effective_market_tick, v_resolution.resolved_market_tick),
      coalesce(v_claim.attempt_count, 0),
      coalesce(v_claim.execution_plan, '{}'::jsonb),
      v_resolution.id;
    return;
  end if;

  select *
  into v_claim
  from public.story_event_execution_claims as claim_row
  where claim_row.game_session_id = p_game_session_id
    and claim_row.storyline_event_id = p_storyline_event_id
  for update;

  if not found then
    if p_execution_plan is null then
      return query
      select
        'absent'::text,
        null::uuid,
        null::uuid,
        null::timestamptz,
        p_effective_at,
        p_effective_market_tick,
        0,
        '{}'::jsonb,
        null::uuid;
      return;
    end if;

    v_token := gen_random_uuid();
    insert into public.story_event_execution_claims (
      game_session_id,
      storyline_event_id,
      status,
      lease_token,
      lease_expires_at,
      effective_at,
      effective_market_tick,
      attempt_count,
      execution_plan,
      last_error,
      completed_resolution_id,
      created_at,
      updated_at
    ) values (
      p_game_session_id,
      p_storyline_event_id,
      'executing',
      v_token,
      v_now + make_interval(secs => p_lease_seconds),
      p_effective_at,
      p_effective_market_tick,
      1,
      p_execution_plan,
      null,
      null,
      v_now,
      v_now
    )
    returning * into v_claim;

    return query
    select
      'acquired'::text,
      v_claim.id,
      v_claim.lease_token,
      v_claim.lease_expires_at,
      v_claim.effective_at,
      v_claim.effective_market_tick,
      v_claim.attempt_count,
      v_claim.execution_plan,
      null::uuid;
    return;
  end if;

  if v_claim.status = 'completed' then
    if v_claim.completed_resolution_id is null then
      raise exception 'STORY_EXECUTION_COMPLETED_WITHOUT_RESOLUTION' using errcode = 'P0001';
    end if;

    return query
    select
      'already_resolved'::text,
      v_claim.id,
      null::uuid,
      null::timestamptz,
      v_claim.effective_at,
      v_claim.effective_market_tick,
      v_claim.attempt_count,
      v_claim.execution_plan,
      v_claim.completed_resolution_id;
    return;
  end if;

  if v_claim.status = 'executing' and v_claim.lease_expires_at > v_now then
    return query
    select
      'busy'::text,
      v_claim.id,
      null::uuid,
      v_claim.lease_expires_at,
      v_claim.effective_at,
      v_claim.effective_market_tick,
      v_claim.attempt_count,
      v_claim.execution_plan,
      null::uuid;
    return;
  end if;

  v_token := gen_random_uuid();
  update public.story_event_execution_claims as claim_row
  set
    status = 'executing',
    lease_token = v_token,
    lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
    attempt_count = claim_row.attempt_count + 1,
    last_error = null,
    updated_at = v_now
  where claim_row.id = v_claim.id
  returning * into v_claim;

  return query
  select
    'acquired'::text,
    v_claim.id,
    v_claim.lease_token,
    v_claim.lease_expires_at,
    v_claim.effective_at,
    v_claim.effective_market_tick,
    v_claim.attempt_count,
    v_claim.execution_plan,
    null::uuid;
end;
$function$;

create or replace function public.fail_story_event_execution_v1(
  p_game_session_id uuid,
  p_storyline_event_id uuid,
  p_lease_token uuid,
  p_error_message text
)
returns table (
  claim_outcome text,
  claim_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_claim public.story_event_execution_claims%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_game_session_id is null
     or p_storyline_event_id is null
     or p_lease_token is null
     or length(btrim(coalesce(p_error_message, ''))) = 0 then
    raise exception 'STORY_EXECUTION_FAILURE_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_game_session_id::text || ':' || p_storyline_event_id::text,
      0
    )
  );

  select *
  into v_claim
  from public.story_event_execution_claims as claim_row
  where claim_row.game_session_id = p_game_session_id
    and claim_row.storyline_event_id = p_storyline_event_id
  for update;

  if not found then
    raise exception 'STORY_EXECUTION_CLAIM_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_claim.status = 'completed' then
    return query select 'already_resolved'::text, v_claim.id, v_claim.attempt_count;
    return;
  end if;

  if v_claim.status <> 'executing' or v_claim.lease_token is distinct from p_lease_token then
    raise exception 'STORY_EXECUTION_LEASE_LOST' using errcode = '40001';
  end if;

  update public.story_event_execution_claims as claim_row
  set
    status = 'retryable_failed',
    lease_token = null,
    lease_expires_at = null,
    last_error = left(btrim(p_error_message), 2000),
    updated_at = v_now
  where claim_row.id = v_claim.id
  returning * into v_claim;

  return query select 'retryable_failed'::text, v_claim.id, v_claim.attempt_count;
end;
$function$;

create or replace function public.finalize_story_event_execution_v1(
  p_game_session_id uuid,
  p_storyline_event_id uuid,
  p_lease_token uuid,
  p_result_payload jsonb
)
returns table (
  finalize_outcome text,
  claim_id uuid,
  resolution_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_claim public.story_event_execution_claims%rowtype;
  v_resolution public.story_event_resolutions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_game_session_id is null
     or p_storyline_event_id is null
     or p_lease_token is null
     or p_result_payload is null
     or jsonb_typeof(p_result_payload) <> 'object' then
    raise exception 'STORY_EXECUTION_FINALIZE_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_game_session_id::text || ':' || p_storyline_event_id::text,
      0
    )
  );

  select *
  into v_claim
  from public.story_event_execution_claims as claim_row
  where claim_row.game_session_id = p_game_session_id
    and claim_row.storyline_event_id = p_storyline_event_id
  for update;

  if not found then
    raise exception 'STORY_EXECUTION_CLAIM_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_claim.status = 'completed' then
    return query
    select
      'already_resolved'::text,
      v_claim.id,
      v_claim.completed_resolution_id,
      v_claim.attempt_count;
    return;
  end if;

  if v_claim.status <> 'executing' or v_claim.lease_token is distinct from p_lease_token then
    raise exception 'STORY_EXECUTION_LEASE_LOST' using errcode = '40001';
  end if;

  insert into public.story_event_resolutions (
    game_session_id,
    storyline_event_id,
    resolved_at,
    resolved_market_tick,
    status,
    result_payload
  ) values (
    p_game_session_id,
    p_storyline_event_id,
    v_claim.effective_at,
    v_claim.effective_market_tick,
    'resolved',
    p_result_payload
  )
  on conflict on constraint story_event_resolutions_scope_unique
  do nothing
  returning * into v_resolution;

  if not found then
    select *
    into v_resolution
    from public.story_event_resolutions as resolution_row
    where resolution_row.game_session_id = p_game_session_id
      and resolution_row.storyline_event_id = p_storyline_event_id;

    if not found then
      raise exception 'STORY_EXECUTION_RESOLUTION_CONFLICT_MISSING' using errcode = 'P0001';
    end if;
  end if;

  update public.story_event_execution_claims as claim_row
  set
    status = 'completed',
    lease_token = null,
    lease_expires_at = null,
    completed_resolution_id = v_resolution.id,
    last_error = null,
    updated_at = v_now
  where claim_row.id = v_claim.id
  returning * into v_claim;

  return query
  select
    'finalized'::text,
    v_claim.id,
    v_resolution.id,
    v_claim.attempt_count;
end;
$function$;

revoke all on function public.claim_story_event_execution_v1(
  uuid, uuid, timestamptz, integer, jsonb, integer
) from public, anon, authenticated;
revoke all on function public.fail_story_event_execution_v1(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.finalize_story_event_execution_v1(
  uuid, uuid, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.claim_story_event_execution_v1(
  uuid, uuid, timestamptz, integer, jsonb, integer
) to service_role;
grant execute on function public.fail_story_event_execution_v1(
  uuid, uuid, uuid, text
) to service_role;
grant execute on function public.finalize_story_event_execution_v1(
  uuid, uuid, uuid, jsonb
) to service_role;

comment on function public.claim_story_event_execution_v1(
  uuid, uuid, timestamptz, integer, jsonb, integer
) is
  'Acquires or resumes one game-scoped Story event execution. First acquisition freezes the execution plan/effective time; retries reuse them.';
comment on function public.fail_story_event_execution_v1(uuid, uuid, uuid, text) is
  'Releases a valid Story execution lease as retryable_failed without creating a final Story resolution.';
comment on function public.finalize_story_event_execution_v1(uuid, uuid, uuid, jsonb) is
  'Writes the canonical Story resolution only after a valid execution lease has completed all side effects and notification delivery.';

commit;
