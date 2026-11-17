-- Bounded Story retry containment; no FX/currency/plan/resolution rewrite.
-- Holds never auto-release. The guarded release RPC requires an independently
-- approved recovery decision and does not repair or bypass economic prerequisites.
begin;
alter table public.story_event_execution_claims
  add column retry_after_at timestamptz null,
  add column retry_hold_reason text null,
  add column retry_hold_generation bigint not null default 0 check (retry_hold_generation >= 0),
  add column retry_epoch_start_attempt integer not null default 0,
  add constraint story_execution_retry_epoch_valid check (retry_epoch_start_attempt >= 0 and retry_epoch_start_attempt <= attempt_count),
  add constraint story_execution_retry_hold_reason_valid check (
    retry_hold_reason is null or retry_hold_reason in (
      'STORY_CURRENCY_VOLATILITY_FX_NOT_READY',
      'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED'
    )
  );

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

  -- Inspect the durable frozen plan, never a caller-supplied replacement plan.
  -- Dependency failure is not a transient retry. Do not manufacture FX readiness.
  if v_claim.retry_hold_reason is null and exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(v_claim.execution_plan -> 'effects') = 'array'
        then v_claim.execution_plan -> 'effects' else '[]'::jsonb end
    ) as planned(effect_entry)
    where planned.effect_entry -> 'effect' ->> 'type' = 'currency_volatility'
  ) and not exists (
    select 1 from private.fx_runtime_state as runtime
    join public.game_sessions as game_row on game_row.id = runtime.game_session_id
    where runtime.game_session_id = p_game_session_id
      and runtime.cutover_status = 'ready'
      and game_row.lifecycle_state in ('active', 'paused')
  ) then
    update public.story_event_execution_claims as claim_row
    set status = 'retryable_failed',
        lease_token = null,
        lease_expires_at = null,
        retry_hold_generation = claim_row.retry_hold_generation + 1,
        retry_hold_reason = 'STORY_CURRENCY_VOLATILITY_FX_NOT_READY',
        retry_after_at = null,
        updated_at = v_now
    where claim_row.id = v_claim.id
    returning * into v_claim;
  end if;

  if v_claim.retry_hold_reason is null and (v_claim.attempt_count - v_claim.retry_epoch_start_attempt) >= 8 then
    update public.story_event_execution_claims as claim_row
    set status = 'retryable_failed',
        lease_token = null,
        lease_expires_at = null,
        retry_hold_generation = claim_row.retry_hold_generation + 1,
        retry_hold_reason = 'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',
        retry_after_at = null,
        updated_at = v_now
    where claim_row.id = v_claim.id
    returning * into v_claim;
  end if;

  if v_claim.retry_hold_reason is not null or v_claim.retry_after_at > v_now then
    -- Existing clients treat busy as non-executable. A held claim is not resolved.
    -- No execution plan crosses PostgREST on the non-executable path.
    return query select
      'busy'::text, v_claim.id, null::uuid, null::timestamptz,
      v_claim.effective_at, v_claim.effective_market_tick,
      v_claim.attempt_count, '{}'::jsonb, null::uuid;
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
    retry_after_at = null,
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
    retry_after_at = case when (v_claim.attempt_count - v_claim.retry_epoch_start_attempt) < 8 then
      v_now + make_interval(secs => least(3600, 60 * power(2, least(v_claim.attempt_count - v_claim.retry_epoch_start_attempt - 1, 6)))::integer)
      else null end,
    retry_hold_generation = case when (v_claim.attempt_count - v_claim.retry_epoch_start_attempt) >= 8
      then v_claim.retry_hold_generation + 1 else v_claim.retry_hold_generation end,
    retry_hold_reason = case when (v_claim.attempt_count - v_claim.retry_epoch_start_attempt) >= 8
      then 'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED' else null end,
    updated_at = v_now
  where claim_row.id = v_claim.id
  returning * into v_claim;

  return query select 'retryable_failed'::text, v_claim.id, v_claim.attempt_count;
end;
$function$;


-- CREATE OR REPLACE preserves the service-role-only ACLs of these existing RPCs.
comment on column public.story_event_execution_claims.retry_hold_reason is
  'Non-terminal execution hold. Never marks an event resolved or changes frozen effect identity. Requires reviewed explicit release.';
-- Audit is written only by the release authority, not directly by API callers.
create table public.story_execution_retry_release_audit (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.story_event_execution_claims(id) on delete cascade,
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  storyline_event_id uuid not null references public.storyline_events(id) on delete cascade,
  actor_staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  idempotency_key text not null,
  reason text not null,
  prior_hold_reason text not null,
  preserved_attempt_count integer not null,
  released_hold_generation bigint not null check (released_hold_generation > 0),
  released_at timestamptz not null default clock_timestamp(),
  unique(game_session_id, idempotency_key),
  check(length(reason) between 12 and 1000 and reason = btrim(reason)),
  check(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$')
);
alter table public.story_execution_retry_release_audit enable row level security;
alter table public.story_execution_retry_release_audit force row level security;
revoke all on table public.story_execution_retry_release_audit from public, anon, authenticated, service_role;
grant select on table public.story_execution_retry_release_audit to service_role;

create or replace function public.release_story_execution_retry_hold_v1(
  p_game_session_id uuid,
  p_storyline_event_id uuid,
  p_expected_hold_reason text,
  p_expected_attempt_count integer,
  p_expected_hold_generation bigint,
  p_actor_staff_user_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table(release_outcome text, audit_id uuid, preserved_attempt_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_claim public.story_event_execution_claims%rowtype;
  v_audit public.story_execution_retry_release_audit%rowtype;
begin
  if p_game_session_id is null or p_storyline_event_id is null or p_actor_staff_user_id is null
     or p_expected_attempt_count is null or p_expected_attempt_count < 1
     or p_expected_hold_generation is null or p_expected_hold_generation < 1
     or p_expected_hold_reason is null or p_expected_hold_reason not in (
       'STORY_CURRENCY_VOLATILITY_FX_NOT_READY','STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED')
     or p_reason is null or p_reason <> btrim(p_reason) or length(p_reason) not between 12 and 1000
     or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'STORY_RETRY_RELEASE_INVALID' using errcode='22023'; end if;

  -- Same lock as claim/fail/finalize. Also serialize reuse of a game-level key
  -- across different event requests so idempotency conflicts cannot race.
  perform pg_advisory_xact_lock(hashtextextended(p_game_session_id::text || ':story-release:' || p_idempotency_key,0));
  perform pg_advisory_xact_lock(hashtextextended(p_game_session_id::text || ':' || p_storyline_event_id::text,0));
  perform 1 from public.game_sessions as game_row
    where game_row.id=p_game_session_id and game_row.owner_staff_user_id=p_actor_staff_user_id
      and game_row.status in ('active','paused') and game_row.lifecycle_state in ('active','paused')
    for share;
  if not found then raise exception 'STORY_RETRY_RELEASE_OWNER_OR_GAME_INVALID' using errcode='42501'; end if;

  select audit_row.* into v_audit from public.story_execution_retry_release_audit as audit_row
    where audit_row.game_session_id=p_game_session_id and audit_row.idempotency_key=p_idempotency_key;
  if found then
    if v_audit.storyline_event_id is distinct from p_storyline_event_id
       or v_audit.actor_staff_user_id is distinct from p_actor_staff_user_id
       or v_audit.reason is distinct from p_reason
       or v_audit.prior_hold_reason is distinct from p_expected_hold_reason
       or v_audit.preserved_attempt_count is distinct from p_expected_attempt_count
       or v_audit.released_hold_generation is distinct from p_expected_hold_generation
    then raise exception 'STORY_RETRY_RELEASE_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
    return query select 'replayed'::text,v_audit.id,v_audit.preserved_attempt_count;
    return;
  end if;

  select claim_row.* into v_claim from public.story_event_execution_claims as claim_row
    where claim_row.game_session_id=p_game_session_id and claim_row.storyline_event_id=p_storyline_event_id
    for update;
  if not found or v_claim.status <> 'retryable_failed'
     or v_claim.retry_hold_reason is distinct from p_expected_hold_reason
     or v_claim.attempt_count is distinct from p_expected_attempt_count
     or v_claim.retry_hold_generation is distinct from p_expected_hold_generation
     or v_claim.lease_token is not null or v_claim.completed_resolution_id is not null
  then raise exception 'STORY_RETRY_RELEASE_STATE_CHANGED' using errcode='40001'; end if;

  -- Check the actual plan even if the hold originally came from the attempt cap.
  if exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(v_claim.execution_plan->'effects')='array'
      then v_claim.execution_plan->'effects' else '[]'::jsonb end) as planned(effect_entry)
    where planned.effect_entry->'effect'->>'type'='currency_volatility'
  ) then
    perform 1 from private.fx_runtime_state as runtime
      where runtime.game_session_id=p_game_session_id and runtime.cutover_status='ready'
      for share;
    if not found then raise exception 'STORY_RETRY_RELEASE_FX_NOT_READY' using errcode='P0001'; end if;
  end if;

  insert into public.story_execution_retry_release_audit(
    claim_id,game_session_id,storyline_event_id,actor_staff_user_id,idempotency_key,
    reason,prior_hold_reason,preserved_attempt_count,released_hold_generation
  ) values(v_claim.id,p_game_session_id,p_storyline_event_id,p_actor_staff_user_id,p_idempotency_key,
    p_reason,v_claim.retry_hold_reason,v_claim.attempt_count,v_claim.retry_hold_generation) returning * into v_audit;
  update public.story_event_execution_claims as claim_row
    set retry_hold_reason=null,retry_after_at=null,
        retry_epoch_start_attempt=v_claim.attempt_count,updated_at=clock_timestamp()
    where claim_row.id=v_claim.id;
  return query select 'released'::text,v_audit.id,v_claim.attempt_count;
end;
$function$;
revoke all on function public.release_story_execution_retry_hold_v1(uuid,uuid,text,integer,bigint,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.release_story_execution_retry_hold_v1(uuid,uuid,text,integer,bigint,uuid,text,text)
  to service_role;

commit;
