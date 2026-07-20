-- Canonical game lifecycle controls V1.
-- Adds explicit start/pause/resume/end/archive semantics while preserving the
-- existing active/disabled/archived operational status projection used by
-- Player session and economic mutation guards.

alter table public.game_sessions
  add column if not exists lifecycle_state text,
  add column if not exists lifecycle_version bigint not null default 1,
  add column if not exists started_at timestamptz null,
  add column if not exists paused_at timestamptz null,
  add column if not exists resumed_at timestamptz null,
  add column if not exists ended_at timestamptz null,
  add column if not exists archived_at timestamptz null;

update public.game_sessions
set lifecycle_state = case status
  when 'active' then 'active'
  when 'disabled' then 'paused'
  when 'archived' then 'archived'
  else 'active'
end
where lifecycle_state is null;

update public.game_sessions
set started_at = coalesce(started_at, created_at)
where lifecycle_state in ('active', 'paused', 'ended', 'archived');

update public.game_sessions
set paused_at = coalesce(paused_at, updated_at)
where lifecycle_state = 'paused';

update public.game_sessions
set archived_at = coalesce(archived_at, updated_at)
where lifecycle_state = 'archived';

alter table public.game_sessions
  alter column lifecycle_state set default 'draft',
  alter column lifecycle_state set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'game_sessions_lifecycle_state_check'
      and conrelid = 'public.game_sessions'::regclass
  ) then
    alter table public.game_sessions
      add constraint game_sessions_lifecycle_state_check
      check (lifecycle_state in ('draft', 'active', 'paused', 'ended', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_sessions_lifecycle_version_positive'
      and conrelid = 'public.game_sessions'::regclass
  ) then
    alter table public.game_sessions
      add constraint game_sessions_lifecycle_version_positive
      check (lifecycle_version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_sessions_lifecycle_status_projection_check'
      and conrelid = 'public.game_sessions'::regclass
  ) then
    alter table public.game_sessions
      add constraint game_sessions_lifecycle_status_projection_check
      check (
        (lifecycle_state = 'active' and status = 'active')
        or (lifecycle_state in ('draft', 'paused') and status = 'disabled')
        or (lifecycle_state in ('ended', 'archived') and status = 'archived')
      );
  end if;
end;
$$;

create or replace function public.initialize_game_lifecycle_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.lifecycle_state := coalesce(new.lifecycle_state, 'draft');
  new.status := case new.lifecycle_state
    when 'active' then 'active'
    when 'draft' then 'disabled'
    when 'paused' then 'disabled'
    when 'ended' then 'archived'
    when 'archived' then 'archived'
  end;
  if new.lifecycle_state = 'active' then
    new.started_at := coalesce(new.started_at, new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists initialize_game_lifecycle_before_insert
on public.game_sessions;

create trigger initialize_game_lifecycle_before_insert
before insert on public.game_sessions
for each row
execute function public.initialize_game_lifecycle_v1();

create index if not exists game_sessions_lifecycle_state_idx
on public.game_sessions (lifecycle_state, updated_at desc);

create table if not exists public.game_lifecycle_transition_requests (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  staff_user_id uuid not null references public.staff_users (id),
  idempotency_key text not null,
  action text not null,
  previous_state text not null,
  lifecycle_state text not null,
  operational_status text not null,
  lifecycle_version bigint not null,
  sessions_revoked integer not null default 0,
  join_code_status text not null,
  started_at timestamptz null,
  paused_at timestamptz null,
  resumed_at timestamptz null,
  ended_at timestamptz null,
  archived_at timestamptz null,
  game_updated_at timestamptz not null,
  outcome text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),

  constraint game_lifecycle_transition_requests_key_not_blank
    check (length(btrim(idempotency_key)) between 1 and 128),
  constraint game_lifecycle_transition_requests_action_check
    check (action in ('start', 'pause', 'resume', 'end', 'archive', 'revoke_sessions')),
  constraint game_lifecycle_transition_requests_previous_state_check
    check (previous_state in ('draft', 'active', 'paused', 'ended', 'archived')),
  constraint game_lifecycle_transition_requests_state_check
    check (lifecycle_state in ('draft', 'active', 'paused', 'ended', 'archived')),
  constraint game_lifecycle_transition_requests_operational_status_check
    check (operational_status in ('active', 'disabled', 'archived')),
  constraint game_lifecycle_transition_requests_version_positive
    check (lifecycle_version > 0),
  constraint game_lifecycle_transition_requests_sessions_nonnegative
    check (sessions_revoked >= 0),
  constraint game_lifecycle_transition_requests_outcome_check
    check (outcome in ('applied', 'already_current')),
  constraint game_lifecycle_transition_requests_scope_key_unique
    unique (game_session_id, idempotency_key)
);

create index if not exists game_lifecycle_transition_requests_game_created_idx
on public.game_lifecycle_transition_requests (game_session_id, created_at desc);

comment on column public.game_sessions.lifecycle_state is
  'Canonical Admin lifecycle state. status remains the compatibility projection: active, disabled, or archived.';
comment on table public.game_lifecycle_transition_requests is
  'Idempotency and immutable result evidence for Admin game lifecycle and Player-session revocation controls.';

create or replace function public.read_admin_game_lifecycle_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid
)
returns table (
  lifecycle_state text,
  operational_status text,
  lifecycle_version bigint,
  join_code_status text,
  active_player_sessions integer,
  allowed_actions text[],
  started_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  ended_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.game_sessions%rowtype;
begin
  if p_game_session_id is null or p_staff_user_id is null then
    raise exception 'GAME_LIFECYCLE_READ_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_game
  from public.game_sessions
  where id = p_game_session_id
    and owner_staff_user_id = p_staff_user_id;

  if not found then
    raise exception 'GAME_LIFECYCLE_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  select
    v_game.lifecycle_state,
    v_game.status,
    v_game.lifecycle_version,
    v_game.game_join_code_status,
    (
      select count(*)::integer
      from public.player_sessions ps
      where ps.game_session_id = v_game.id
        and ps.status = 'active'
        and ps.revoked_at is null
        and ps.expires_at > now()
    ),
    case v_game.lifecycle_state
      when 'draft' then array['start', 'revoke_sessions']::text[]
      when 'active' then array['pause', 'end', 'revoke_sessions']::text[]
      when 'paused' then array['resume', 'end', 'revoke_sessions']::text[]
      when 'ended' then array['archive', 'revoke_sessions']::text[]
      when 'archived' then array['revoke_sessions']::text[]
      else array[]::text[]
    end,
    v_game.started_at,
    v_game.paused_at,
    v_game.resumed_at,
    v_game.ended_at,
    v_game.archived_at,
    v_game.updated_at;
end;
$$;

create or replace function public.transition_game_lifecycle_atomic_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_action text,
  p_idempotency_key text,
  p_expected_version bigint default null
)
returns table (
  transition_outcome text,
  transition_action text,
  previous_state text,
  lifecycle_state text,
  operational_status text,
  lifecycle_version bigint,
  sessions_revoked integer,
  join_code_status text,
  allowed_actions text[],
  started_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  ended_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_game public.game_sessions%rowtype;
  v_existing public.game_lifecycle_transition_requests%rowtype;
  v_previous text;
  v_next text;
  v_projection text;
  v_outcome text := 'applied';
  v_sessions_revoked integer := 0;
  v_changed boolean := false;
  v_now timestamptz := now();
begin
  if p_game_session_id is null or p_staff_user_id is null then
    raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
  end if;
  if v_action not in ('start', 'pause', 'resume', 'end', 'archive', 'revoke_sessions') then
    raise exception 'GAME_LIFECYCLE_ACTION_INVALID' using errcode = 'P0001';
  end if;
  if length(v_key) = 0 or length(v_key) > 128 or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'GAME_LIFECYCLE_IDEMPOTENCY_INVALID' using errcode = 'P0001';
  end if;
  if p_expected_version is not null and p_expected_version < 1 then
    raise exception 'GAME_LIFECYCLE_VERSION_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_game_session_id::text || ':' || v_key, 0)
  );

  select *
  into v_existing
  from public.game_lifecycle_transition_requests
  where game_session_id = p_game_session_id
    and idempotency_key = v_key;

  if found then
    if v_existing.action <> v_action then
      raise exception 'GAME_LIFECYCLE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select *
    into v_game
    from public.game_sessions
    where id = p_game_session_id
      and owner_staff_user_id = p_staff_user_id;

    if not found then
      raise exception 'GAME_LIFECYCLE_SCOPE_FORBIDDEN' using errcode = 'P0001';
    end if;

    return query
    select
      'replayed'::text,
      v_existing.action,
      v_existing.previous_state,
      v_existing.lifecycle_state,
      v_existing.operational_status,
      v_existing.lifecycle_version,
      v_existing.sessions_revoked,
      v_existing.join_code_status,
      case v_existing.lifecycle_state
        when 'draft' then array['start', 'revoke_sessions']::text[]
        when 'active' then array['pause', 'end', 'revoke_sessions']::text[]
        when 'paused' then array['resume', 'end', 'revoke_sessions']::text[]
        when 'ended' then array['archive', 'revoke_sessions']::text[]
        when 'archived' then array['revoke_sessions']::text[]
        else array[]::text[]
      end,
      v_existing.started_at,
      v_existing.paused_at,
      v_existing.resumed_at,
      v_existing.ended_at,
      v_existing.archived_at,
      v_existing.game_updated_at;
    return;
  end if;

  select *
  into v_game
  from public.game_sessions
  where id = p_game_session_id
    and owner_staff_user_id = p_staff_user_id
  for update;

  if not found then
    raise exception 'GAME_LIFECYCLE_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_expected_version is not null and v_game.lifecycle_version <> p_expected_version then
    raise exception 'GAME_LIFECYCLE_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  v_previous := v_game.lifecycle_state;
  v_next := v_previous;

  if v_action = 'start' then
    if v_previous = 'draft' then v_next := 'active';
    elsif v_previous = 'active' then v_outcome := 'already_current';
    else raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'pause' then
    if v_previous = 'active' then v_next := 'paused';
    elsif v_previous = 'paused' then v_outcome := 'already_current';
    else raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'resume' then
    if v_previous = 'paused' then v_next := 'active';
    elsif v_previous = 'active' then v_outcome := 'already_current';
    else raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'end' then
    if v_previous in ('active', 'paused') then v_next := 'ended';
    elsif v_previous = 'ended' then v_outcome := 'already_current';
    else raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'archive' then
    if v_previous = 'ended' then v_next := 'archived';
    elsif v_previous = 'archived' then v_outcome := 'already_current';
    else raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  end if;

  v_changed := v_next <> v_previous;

  if v_action in ('end', 'archive', 'revoke_sessions') then
    update public.player_sessions
    set
      status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now)
    where game_session_id = p_game_session_id
      and status = 'active';
    get diagnostics v_sessions_revoked = row_count;
    if v_action = 'revoke_sessions' and v_sessions_revoked = 0 then
      v_outcome := 'already_current';
    end if;
  end if;

  v_projection := case v_next
    when 'active' then 'active'
    when 'draft' then 'disabled'
    when 'paused' then 'disabled'
    when 'ended' then 'archived'
    when 'archived' then 'archived'
  end;

  if v_changed or v_sessions_revoked > 0 then
    update public.game_sessions
    set
      lifecycle_state = v_next,
      status = v_projection,
      lifecycle_version = lifecycle_version + 1,
      started_at = case
        when v_action = 'start' then coalesce(started_at, v_now)
        else started_at
      end,
      paused_at = case when v_action = 'pause' then v_now else paused_at end,
      resumed_at = case when v_action = 'resume' then v_now else resumed_at end,
      ended_at = case when v_action = 'end' then coalesce(ended_at, v_now) else ended_at end,
      archived_at = case when v_action = 'archive' then coalesce(archived_at, v_now) else archived_at end,
      game_join_code_status = case
        when v_action in ('end', 'archive') then 'revoked'
        else game_join_code_status
      end,
      game_join_code_hash = case
        when v_action in ('end', 'archive') then null
        else game_join_code_hash
      end
    where id = p_game_session_id
    returning * into v_game;
  end if;

  insert into public.game_lifecycle_transition_requests (
    game_session_id,
    staff_user_id,
    idempotency_key,
    action,
    previous_state,
    lifecycle_state,
    operational_status,
    lifecycle_version,
    sessions_revoked,
    join_code_status,
    started_at,
    paused_at,
    resumed_at,
    ended_at,
    archived_at,
    game_updated_at,
    outcome,
    completed_at
  ) values (
    p_game_session_id,
    p_staff_user_id,
    v_key,
    v_action,
    v_previous,
    v_game.lifecycle_state,
    v_game.status,
    v_game.lifecycle_version,
    v_sessions_revoked,
    v_game.game_join_code_status,
    v_game.started_at,
    v_game.paused_at,
    v_game.resumed_at,
    v_game.ended_at,
    v_game.archived_at,
    v_game.updated_at,
    v_outcome,
    v_now
  );

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'staff_user',
    p_staff_user_id,
    'game.lifecycle.' || v_action,
    'game_session',
    p_game_session_id,
    jsonb_build_object(
      'previous_state', v_previous,
      'lifecycle_state', v_game.lifecycle_state,
      'operational_status', v_game.status,
      'lifecycle_version', v_game.lifecycle_version,
      'sessions_revoked', v_sessions_revoked,
      'join_code_status', v_game.game_join_code_status,
      'outcome', v_outcome
    )
  );

  return query
  select
    v_outcome,
    v_action,
    v_previous,
    v_game.lifecycle_state,
    v_game.status,
    v_game.lifecycle_version,
    v_sessions_revoked,
    v_game.game_join_code_status,
    case v_game.lifecycle_state
      when 'draft' then array['start', 'revoke_sessions']::text[]
      when 'active' then array['pause', 'end', 'revoke_sessions']::text[]
      when 'paused' then array['resume', 'end', 'revoke_sessions']::text[]
      when 'ended' then array['archive', 'revoke_sessions']::text[]
      when 'archived' then array['revoke_sessions']::text[]
      else array[]::text[]
    end,
    v_game.started_at,
    v_game.paused_at,
    v_game.resumed_at,
    v_game.ended_at,
    v_game.archived_at,
    v_game.updated_at;
end;
$$;

revoke all on function public.read_admin_game_lifecycle_v1(uuid, uuid) from public;
grant execute on function public.read_admin_game_lifecycle_v1(uuid, uuid) to service_role;

revoke all on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint) from public;
grant execute on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint) to service_role;
