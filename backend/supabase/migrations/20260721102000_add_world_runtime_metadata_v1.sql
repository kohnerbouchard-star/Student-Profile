begin;

alter table public.world_location_states
  add column display_name text,
  add column location_kind text;

alter table public.world_location_states
  add constraint world_location_states_display_name_valid check (
    display_name is null or length(btrim(display_name)) between 1 and 120
  ),
  add constraint world_location_states_kind_valid check (
    location_kind is null or location_kind in (
      'capital', 'city', 'port', 'airport', 'industrial', 'meridian_hub'
    )
  );

create table public.world_runtime_instances (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  pack_id text not null,
  pack_version text not null,
  definition_digest text not null,
  revision bigint not null default 0,
  initialized_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint world_runtime_instances_game_unique unique (game_session_id),
  constraint world_runtime_instances_pack_valid check (
    pack_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    and length(btrim(pack_version)) between 1 and 64
    and length(btrim(definition_digest)) between 16 and 160
  ),
  constraint world_runtime_instances_revision_valid check (revision >= 0)
);

create trigger set_world_runtime_instances_updated_at
before update on public.world_runtime_instances
for each row execute function public.set_current_timestamp_updated_at();

create table public.world_runtime_commands (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  command_key text not null,
  command_kind text not null,
  applied_revision bigint not null,
  applied_at timestamptz not null,
  constraint world_runtime_commands_scope_unique unique (game_session_id, command_key),
  constraint world_runtime_commands_key_valid check (
    command_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint world_runtime_commands_kind_valid check (
    command_kind in ('initialize', 'route_state', 'location_state')
  ),
  constraint world_runtime_commands_revision_valid check (applied_revision >= 0)
);

alter table public.world_runtime_instances enable row level security;
alter table public.world_runtime_commands enable row level security;

revoke all on table public.world_runtime_instances from public, anon, authenticated, service_role;
revoke all on table public.world_runtime_commands from public, anon, authenticated, service_role;
grant select, insert, update on table public.world_runtime_instances to service_role;
grant select, insert on table public.world_runtime_commands to service_role;

create or replace function public.initialize_world_runtime_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_pack_version text,
  p_definition_digest text,
  p_locations jsonb,
  p_routes jsonb,
  p_initialized_at timestamptz
)
returns table (
  initialization_outcome text,
  revision bigint,
  location_count integer,
  route_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_runtime public.world_runtime_instances%rowtype;
  v_location jsonb;
  v_route jsonb;
  v_location_count integer;
  v_route_count integer;
  v_known_locations text[];
begin
  if p_game_session_id is null
    or p_pack_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or length(btrim(coalesce(p_pack_version, ''))) not between 1 and 64
    or length(btrim(coalesce(p_definition_digest, ''))) not between 16 and 160
    or jsonb_typeof(p_locations) <> 'array'
    or jsonb_typeof(p_routes) <> 'array'
    or p_initialized_at is null
  then
    raise exception 'WORLD_RUNTIME_INITIALIZATION_INVALID' using errcode = 'P0001';
  end if;

  v_location_count := jsonb_array_length(p_locations);
  v_route_count := jsonb_array_length(p_routes);
  if v_location_count <> 50 or v_route_count < 1 or v_route_count > 250 then
    raise exception 'WORLD_RUNTIME_BOUNDS_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
    and game_row.status in ('draft', 'active')
  for update;
  if not found then
    raise exception 'WORLD_RUNTIME_GAME_NOT_INITIALIZABLE' using errcode = 'P0001';
  end if;

  select runtime_row.* into v_runtime
  from public.world_runtime_instances as runtime_row
  where runtime_row.game_session_id = p_game_session_id
  for update;

  if found then
    if v_runtime.pack_id <> p_pack_id
      or v_runtime.pack_version <> p_pack_version
      or v_runtime.definition_digest <> p_definition_digest
    then
      raise exception 'WORLD_RUNTIME_DEFINITION_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      'replayed'::text,
      v_runtime.revision,
      (select count(*)::integer from public.world_location_states where game_session_id = p_game_session_id),
      (select count(*)::integer from public.world_route_states where game_session_id = p_game_session_id);
    return;
  end if;

  insert into public.world_runtime_instances (
    game_session_id, pack_id, pack_version, definition_digest, revision, initialized_at
  ) values (
    p_game_session_id, p_pack_id, p_pack_version, p_definition_digest, 0, p_initialized_at
  ) returning * into v_runtime;

  for v_location in select value from jsonb_array_elements(p_locations)
  loop
    if jsonb_typeof(v_location) <> 'object'
      or coalesce(v_location->>'publicLocationId', '') !~ '^loc_[a-z0-9_]+$'
      or coalesce(v_location->>'countryId', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      or length(btrim(coalesce(v_location->>'name', ''))) not between 1 and 120
      or coalesce(v_location->>'kind', '') not in (
        'capital', 'city', 'port', 'airport', 'industrial', 'meridian_hub'
      )
    then
      raise exception 'WORLD_RUNTIME_LOCATION_INVALID' using errcode = 'P0001';
    end if;

    insert into public.world_location_states (
      game_session_id,
      public_location_id,
      country_id,
      display_name,
      location_kind,
      availability,
      revision,
      updated_at
    ) values (
      p_game_session_id,
      v_location->>'publicLocationId',
      v_location->>'countryId',
      v_location->>'name',
      v_location->>'kind',
      case when coalesce((v_location->>'enabled')::boolean, false) then 'normal' else 'closed' end,
      0,
      p_initialized_at
    );
  end loop;

  select array_agg(location_row.public_location_id order by location_row.public_location_id)
  into v_known_locations
  from public.world_location_states as location_row
  where location_row.game_session_id = p_game_session_id;

  if coalesce(array_length(v_known_locations, 1), 0) <> 50 then
    raise exception 'WORLD_RUNTIME_LOCATION_COUNT_INVALID' using errcode = 'P0001';
  end if;

  for v_route in select value from jsonb_array_elements(p_routes)
  loop
    if jsonb_typeof(v_route) <> 'object'
      or coalesce(v_route->>'publicRouteId', '') !~ '^rte_[a-z0-9_]+$'
      or not (coalesce(v_route->>'fromLocationId', '') = any(v_known_locations))
      or not (coalesce(v_route->>'toLocationId', '') = any(v_known_locations))
      or v_route->>'fromLocationId' = v_route->>'toLocationId'
      or coalesce(v_route->>'mode', '') not in ('land', 'sea', 'air', 'meridian')
      or coalesce((v_route->>'baseCostMinor')::bigint, -1) < 0
      or coalesce((v_route->>'baseDurationMinutes')::integer, 0) <= 0
    then
      raise exception 'WORLD_RUNTIME_ROUTE_INVALID' using errcode = 'P0001';
    end if;

    insert into public.world_route_states (
      game_session_id,
      public_route_id,
      from_location_id,
      to_location_id,
      mode,
      bidirectional,
      base_cost_minor,
      base_duration_minutes,
      status,
      reason,
      cost_multiplier_basis_points,
      duration_multiplier_basis_points,
      revision,
      updated_at
    ) values (
      p_game_session_id,
      v_route->>'publicRouteId',
      v_route->>'fromLocationId',
      v_route->>'toLocationId',
      v_route->>'mode',
      coalesce((v_route->>'bidirectional')::boolean, false),
      (v_route->>'baseCostMinor')::bigint,
      (v_route->>'baseDurationMinutes')::integer,
      'open',
      'normal',
      10000,
      10000,
      0,
      p_initialized_at
    );
  end loop;

  insert into public.world_runtime_commands (
    game_session_id, command_key, command_kind, applied_revision, applied_at
  ) values (
    p_game_session_id,
    'world-runtime:initialize:' || p_definition_digest,
    'initialize',
    0,
    p_initialized_at
  );

  return query select 'initialized'::text, 0::bigint, v_location_count, v_route_count;
end;
$function$;

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
    select 1 from public.world_runtime_commands
    where game_session_id = p_game_session_id and command_key = p_command_key
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

  update public.world_runtime_instances
  set revision = revision + 1
  where game_session_id = p_game_session_id
  returning * into v_runtime;

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
    select 1 from public.world_runtime_commands
    where game_session_id = p_game_session_id and command_key = p_command_key
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

  update public.world_runtime_instances
  set revision = revision + 1
  where game_session_id = p_game_session_id
  returning * into v_runtime;

  insert into public.world_runtime_commands (
    game_session_id, command_key, command_kind, applied_revision, applied_at
  ) values (
    p_game_session_id, p_command_key, 'location_state', v_runtime.revision, p_applied_at
  );

  return query select 'applied'::text, v_runtime.revision, v_affected;
end;
$function$;

revoke all on function public.initialize_world_runtime_v1(uuid, text, text, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.apply_world_route_state_v1(uuid, bigint, text, jsonb, text, text, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.apply_world_location_state_v1(uuid, bigint, text, jsonb, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.initialize_world_runtime_v1(uuid, text, text, text, jsonb, jsonb, timestamptz)
  to service_role;
grant execute on function public.apply_world_route_state_v1(uuid, bigint, text, jsonb, text, text, integer, integer, timestamptz)
  to service_role;
grant execute on function public.apply_world_location_state_v1(uuid, bigint, text, jsonb, text, timestamptz)
  to service_role;

commit;
