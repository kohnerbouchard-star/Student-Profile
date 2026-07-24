-- Forward-only repair for transition_game_lifecycle_atomic_v1.
-- PostgreSQL exposes RETURNS TABLE columns as PL/pgSQL variables. The original
-- UPDATE used unqualified game_sessions columns whose names overlap those
-- output variables, causing runtime ambiguity. Applied migration history is
-- preserved; this migration replaces only the function definition.

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
    if v_previous = 'draft' then
      v_next := 'active';
    elsif v_previous = 'active' then
      v_outcome := 'already_current';
    else
      raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'pause' then
    if v_previous = 'active' then
      v_next := 'paused';
    elsif v_previous = 'paused' then
      v_outcome := 'already_current';
    else
      raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'resume' then
    if v_previous = 'paused' then
      v_next := 'active';
    elsif v_previous = 'active' then
      v_outcome := 'already_current';
    else
      raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'end' then
    if v_previous in ('active', 'paused') then
      v_next := 'ended';
    elsif v_previous = 'ended' then
      v_outcome := 'already_current';
    else
      raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif v_action = 'archive' then
    if v_previous = 'ended' then
      v_next := 'archived';
    elsif v_previous = 'archived' then
      v_outcome := 'already_current';
    else
      raise exception 'GAME_LIFECYCLE_TRANSITION_INVALID' using errcode = 'P0001';
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
    update public.game_sessions as gs
    set
      lifecycle_state = v_next,
      status = v_projection,
      lifecycle_version = gs.lifecycle_version + 1,
      started_at = case
        when v_action = 'start' then coalesce(gs.started_at, v_now)
        else gs.started_at
      end,
      paused_at = case
        when v_action = 'pause' then v_now
        else gs.paused_at
      end,
      resumed_at = case
        when v_action = 'resume' then v_now
        else gs.resumed_at
      end,
      ended_at = case
        when v_action = 'end' then coalesce(gs.ended_at, v_now)
        else gs.ended_at
      end,
      archived_at = case
        when v_action = 'archive' then coalesce(gs.archived_at, v_now)
        else gs.archived_at
      end,
      game_join_code_status = case
        when v_action in ('end', 'archive') then 'revoked'
        else gs.game_join_code_status
      end,
      game_join_code_hash = case
        when v_action in ('end', 'archive') then null
        else gs.game_join_code_hash
      end
    where gs.id = p_game_session_id
    returning gs.* into v_game;
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

revoke all on function public.transition_game_lifecycle_atomic_v1(
  uuid,
  uuid,
  text,
  text,
  bigint
) from public;

grant execute on function public.transition_game_lifecycle_atomic_v1(
  uuid,
  uuid,
  text,
  text,
  bigint
) to service_role;

comment on function public.transition_game_lifecycle_atomic_v1(
  uuid,
  uuid,
  text,
  text,
  bigint
) is
  'Atomically transitions an owner-scoped game lifecycle with idempotency, optimistic versioning, session revocation, and fully qualified game_sessions update columns.';
