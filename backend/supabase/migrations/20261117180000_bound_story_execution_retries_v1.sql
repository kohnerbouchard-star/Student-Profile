-- Bounded Story retry containment; no FX/currency/plan/resolution rewrite.
-- Holds never auto-release. The guarded release RPC requires an independently
-- approved recovery decision and does not repair or bypass economic prerequisites.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Hold the same control lock used by the purge worker before reordering its
-- targets. The Story suffix follows the immutable loan graph convergence.
do $story_purge_baseline$
declare
  registry record;
  graph record;
  delete_order record;
begin
  perform 1 from private.game_data_purge_control where singleton for update;
  lock table private.game_data_purge_requests,
    private.game_data_purge_table_registry,
    private.game_data_purge_delete_order_v1 in share row exclusive mode;

  if exists (
    select 1 from private.game_data_purge_requests
    where status not in ('completed', 'cancelled', 'failed')
      and (db_delete_cursor <> 0 or status = 'db_deleting')
  ) then
    raise exception 'GAME_PURGE_CURSOR_RECONCILIATION_REQUIRED' using errcode = 'P0001';
  end if;

  select * into strict registry from public.get_game_data_purge_registry_digest_v1();
  select * into strict graph from public.get_game_data_purge_fk_graph_digest_v1();
  select * into strict delete_order from public.get_game_data_purge_delete_order_digest_v1();
  if (registry.table_count, registry.registry_sha256) is distinct from
       (207::bigint, '7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3'::text)
     or (graph.edge_count, graph.fk_graph_sha256) is distinct from
       (460::bigint, '0c932d6e620cec801b527e81f3e4d3e91bd8d70fd4fb45d6e1a72166ff0c7a82'::text)
     or (delete_order.table_count, delete_order.order_sha256) is distinct from
       (206::bigint, '19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897'::text)
  then
    raise exception 'STORY_RETRY_PURGE_BASELINE_DRIFT' using errcode = 'P0001';
  end if;
end;
$story_purge_baseline$;
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

-- Register the child once and rerank the existing certified order. The pinned
-- graph changes only this child and the depths of its claim/resolution ancestors.
create index story_retry_release_audit_claim_idx
  on public.story_execution_retry_release_audit (claim_id);
create index story_retry_release_audit_event_idx
  on public.story_execution_retry_release_audit (storyline_event_id);
create index story_retry_release_audit_actor_idx
  on public.story_execution_retry_release_audit (actor_staff_user_id);

insert into private.game_data_purge_table_registry (table_schema, table_name)
values ('public', 'story_execution_retry_release_audit');

-- Move the certified positions outside the final range to avoid transient
-- primary-key collisions while computing the new child-first order.
update private.game_data_purge_delete_order_v1
set position = position + 207,
    dependency_depth = case
      when table_schema = 'public' and table_name = 'story_event_execution_claims' then 1
      when table_schema = 'public' and table_name = 'story_event_resolutions' then 2
      else dependency_depth
    end;
insert into private.game_data_purge_delete_order_v1
  (position, table_schema, table_name, dependency_depth)
values (414, 'public', 'story_execution_retry_release_audit', 0);
with ranked as (
  select table_schema, table_name,
    row_number() over (order by dependency_depth,
      table_schema collate "C", table_name collate "C")::integer as position
  from private.game_data_purge_delete_order_v1
)
update private.game_data_purge_delete_order_v1 as target
set position = ranked.position
from ranked
where target.table_schema = ranked.table_schema and target.table_name = ranked.table_name;

-- Change only the exact reviewed function preimages and fingerprint/cursor
-- literals. All request, game, token, expiry and zero-row checks are retained.
do $story_purge_fingerprints$
declare
  registry record;
  graph record;
  delete_order record;
  target record;
  definition text;
begin
  select * into strict registry from public.get_game_data_purge_registry_digest_v1();
  select * into strict graph from public.get_game_data_purge_fk_graph_digest_v1();
  select * into strict delete_order from public.get_game_data_purge_delete_order_digest_v1();
  if (registry.table_count, registry.registry_sha256) is distinct from
       (208::bigint, '37c2231abb9aff3c306dc7975c2968d549991fa9c2c9815cf8163c54db458bc6'::text)
     or (graph.edge_count, graph.fk_graph_sha256) is distinct from
       (461::bigint, '314a9ec50cca588ac091cad4ac42f68c77dbc81e9fb712cb960a7f714566cda3'::text)
     or (delete_order.table_count, delete_order.order_sha256) is distinct from
       (207::bigint, 'ad48814a47842407203f6b495b10bc7d1f7b1110cbf55506179456b461f678a3'::text)
  then
    raise exception 'STORY_RETRY_PURGE_RESULT_DRIFT' using errcode = 'P0001';
  end if;

  for target in select * from (values
    ('public.execute_game_data_purge_db_batch_v2(uuid,integer)', 'b52001a93064ad4609fd5f7e4b471250e731d4610c5302ef0bdb5e8af4dddcc8'),
    ('public.finalize_game_data_purge_v1(uuid)', 'f3904e8d5df8fd96f5311a0299e4d8e2ba87715bfb4dd9177b9c53b03f220d2e')
  ) as expected(signature, sha256)
  loop
    definition := pg_get_functiondef(target.signature::regprocedure);
    if encode(sha256(convert_to(definition, 'UTF8')), 'hex') is distinct from target.sha256 then
      raise exception 'STORY_RETRY_PURGE_DEFINITION_DRIFT' using errcode = 'P0001';
    end if;
    definition := replace(definition, '7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3',
      registry.registry_sha256);
    definition := replace(definition, '0c932d6e620cec801b527e81f3e4d3e91bd8d70fd4fb45d6e1a72166ff0c7a82',
      graph.fk_graph_sha256);
    definition := replace(definition, '19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897',
      delete_order.order_sha256);
    definition := regexp_replace(definition, '\m207\M', '208', 'g');
    definition := regexp_replace(definition, '\m206\M', '207', 'g');
    definition := regexp_replace(definition, '\m460\M', '461', 'g');
    execute definition;
  end loop;
end;
$story_purge_fingerprints$;


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
