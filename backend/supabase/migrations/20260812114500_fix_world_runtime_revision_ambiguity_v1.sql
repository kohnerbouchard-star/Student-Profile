begin;

create or replace function public.apply_world_route_state_v1(
  p_game_session_id uuid,
  p_expected_revision bigint,
  p_command_key text,
  p_public_route_ids jsonb,
  p_status text,
  p_reason text,
  p_cost_multiplier_basis_points integer,
  p_duration_multiplier_basis_points integer,
  p_applied_at timestamptz
)
returns table (
  command_outcome text,
  revision bigint,
  affected_routes integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_runtime public.world_runtime_instances%rowtype;
  v_affected integer;
begin
  if p_game_session_id is null
    or p_expected_revision is null or p_expected_revision < 0
    or p_command_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or jsonb_typeof(p_public_route_ids) <> 'array'
    or jsonb_array_length(p_public_route_ids) not between 1 and 100
    or p_status not in ('open', 'restricted', 'closed')
    or p_reason not in ('normal', 'shortage', 'meridian_disruption', 'war', 'recovery')
    or p_cost_multiplier_basis_points not between 1000 and 50000
    or p_duration_multiplier_basis_points not between 1000 and 50000
    or p_applied_at is null
  then
    raise exception 'WORLD_ROUTE_COMMAND_INVALID' using errcode = 'P0001';
  end if;

  select runtime_row.* into v_runtime
  from public.world_runtime_instances as runtime_row
  join public.game_sessions as game_row on game_row.id = runtime_row.game_session_id
  where runtime_row.game_session_id = p_game_session_id
    and game_row.status in ('active', 'paused')
  for update of runtime_row;
  if not found then
    raise exception 'WORLD_RUNTIME_NOT_MUTABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.world_runtime_commands as command_row
    where command_row.game_session_id = p_game_session_id
      and command_row.command_key = p_command_key
  ) then
    return query select 'replayed'::text, v_runtime.revision, 0;
    return;
  end if;
  if v_runtime.revision <> p_expected_revision then
    raise exception 'WORLD_RUNTIME_REVISION_CONFLICT' using errcode = '40001';
  end if;

  update public.world_route_states as route_row
  set status = p_status,
      reason = p_reason,
      cost_multiplier_basis_points = p_cost_multiplier_basis_points,
      duration_multiplier_basis_points = p_duration_multiplier_basis_points,
      revision = route_row.revision + 1,
      updated_at = p_applied_at
  where route_row.game_session_id = p_game_session_id
    and route_row.public_route_id in (
      select jsonb_array_elements_text(p_public_route_ids)
    );
  get diagnostics v_affected = row_count;

  if v_affected <> jsonb_array_length(p_public_route_ids) then
    raise exception 'WORLD_ROUTE_COMMAND_UNKNOWN_ROUTE' using errcode = 'P0001';
  end if;

  update public.world_runtime_instances as runtime_row
  set revision = runtime_row.revision + 1
  where runtime_row.game_session_id = p_game_session_id
  returning runtime_row.* into v_runtime;

  insert into public.world_runtime_commands (
    game_session_id, command_key, command_kind, applied_revision, applied_at
  ) values (
    p_game_session_id, p_command_key, 'route_state', v_runtime.revision, p_applied_at
  );

  return query select 'applied'::text, v_runtime.revision, v_affected;
end;
$function$;

create or replace function public.apply_world_location_state_v1(
  p_game_session_id uuid,
  p_expected_revision bigint,
  p_command_key text,
  p_public_location_ids jsonb,
  p_availability text,
  p_applied_at timestamptz
)
returns table (
  command_outcome text,
  revision bigint,
  affected_locations integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_runtime public.world_runtime_instances%rowtype;
  v_affected integer;
begin
  if p_game_session_id is null
    or p_expected_revision is null or p_expected_revision < 0
    or p_command_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or jsonb_typeof(p_public_location_ids) <> 'array'
    or jsonb_array_length(p_public_location_ids) not between 1 and 100
    or p_availability not in ('normal', 'shortage', 'conflict', 'closed')
    or p_applied_at is null
  then
    raise exception 'WORLD_LOCATION_COMMAND_INVALID' using errcode = 'P0001';
  end if;

  select runtime_row.* into v_runtime
  from public.world_runtime_instances as runtime_row
  join public.game_sessions as game_row on game_row.id = runtime_row.game_session_id
  where runtime_row.game_session_id = p_game_session_id
    and game_row.status in ('active', 'paused')
  for update of runtime_row;
  if not found then
    raise exception 'WORLD_RUNTIME_NOT_MUTABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.world_runtime_commands as command_row
    where command_row.game_session_id = p_game_session_id
      and command_row.command_key = p_command_key
  ) then
    return query select 'replayed'::text, v_runtime.revision, 0;
    return;
  end if;
  if v_runtime.revision <> p_expected_revision then
    raise exception 'WORLD_RUNTIME_REVISION_CONFLICT' using errcode = '40001';
  end if;

  update public.world_location_states as location_row
  set availability = p_availability,
      revision = location_row.revision + 1,
      updated_at = p_applied_at
  where location_row.game_session_id = p_game_session_id
    and location_row.public_location_id in (
      select jsonb_array_elements_text(p_public_location_ids)
    );
  get diagnostics v_affected = row_count;

  if v_affected <> jsonb_array_length(p_public_location_ids) then
    raise exception 'WORLD_LOCATION_COMMAND_UNKNOWN_LOCATION' using errcode = 'P0001';
  end if;

  update public.world_runtime_instances as runtime_row
  set revision = runtime_row.revision + 1
  where runtime_row.game_session_id = p_game_session_id
  returning runtime_row.* into v_runtime;

  insert into public.world_runtime_commands (
    game_session_id, command_key, command_kind, applied_revision, applied_at
  ) values (
    p_game_session_id, p_command_key, 'location_state', v_runtime.revision, p_applied_at
  );

  return query select 'applied'::text, v_runtime.revision, v_affected;
end;
$function$;

revoke all on function public.apply_world_route_state_v1(
  uuid, bigint, text, jsonb, text, text, integer, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.apply_world_location_state_v1(
  uuid, bigint, text, jsonb, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_world_route_state_v1(
  uuid, bigint, text, jsonb, text, text, integer, integer, timestamptz
) to service_role;
grant execute on function public.apply_world_location_state_v1(
  uuid, bigint, text, jsonb, text, timestamptz
) to service_role;

comment on function public.apply_world_route_state_v1(
  uuid, bigint, text, jsonb, text, text, integer, integer, timestamptz
) is 'Applies a revision-guarded, idempotent route-state mutation with an explicitly qualified world-runtime revision update.';
comment on function public.apply_world_location_state_v1(
  uuid, bigint, text, jsonb, text, timestamptz
) is 'Applies a revision-guarded, idempotent location-state mutation with an explicitly qualified world-runtime revision update.';

commit;
