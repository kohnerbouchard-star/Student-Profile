begin;

alter table public.world_country_runtime
  add column country_uuid uuid references public.countries (id) on delete restrict;

alter table public.world_country_runtime
  alter column country_uuid set not null;

alter table public.world_country_runtime
  add constraint world_country_runtime_country_uuid_unique
  unique (game_session_id, country_uuid);

create table public.arrival_class_grant_runtime (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  class_id text not null,
  grant_definition_id text not null,
  created_at timestamptz not null default now(),
  constraint arrival_class_grant_runtime_scope_unique unique (game_session_id, class_id),
  constraint arrival_class_grant_runtime_class_valid check (class_id in (
    'analyst', 'builder', 'maker', 'mediator',
    'navigator', 'operator', 'steward', 'trader'
  )),
  constraint arrival_class_grant_runtime_definition_valid check (
    grant_definition_id ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
  )
);

alter table public.arrival_class_grant_runtime enable row level security;
revoke all on table public.arrival_class_grant_runtime
  from public, anon, authenticated, service_role;
grant select, insert on table public.arrival_class_grant_runtime to service_role;

create or replace function public.initialize_world_country_runtime_v2(
  p_game_session_id uuid,
  p_countries jsonb,
  p_class_grants jsonb
)
returns table (
  initialization_outcome text,
  country_count integer,
  class_grant_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_country jsonb;
  v_grant jsonb;
  v_country_count integer;
  v_grant_count integer;
  v_existing_countries integer;
  v_existing_grants integer;
begin
  if p_game_session_id is null
    or jsonb_typeof(p_countries) <> 'array'
    or jsonb_array_length(p_countries) <> 10
    or jsonb_typeof(p_class_grants) <> 'array'
    or jsonb_array_length(p_class_grants) <> 8
  then
    raise exception 'WORLD_COUNTRY_RUNTIME_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.world_runtime_instances as runtime_row
  join public.game_sessions as game_row on game_row.id = runtime_row.game_session_id
  where runtime_row.game_session_id = p_game_session_id
    and game_row.status in ('draft', 'active')
  for update of runtime_row;
  if not found then
    raise exception 'WORLD_COUNTRY_RUNTIME_NOT_INITIALIZABLE' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_existing_countries
  from public.world_country_runtime
  where game_session_id = p_game_session_id;
  select count(*)::integer into v_existing_grants
  from public.arrival_class_grant_runtime
  where game_session_id = p_game_session_id;

  if v_existing_countries > 0 or v_existing_grants > 0 then
    if v_existing_countries <> 10 or v_existing_grants <> 8 then
      raise exception 'WORLD_COUNTRY_RUNTIME_PARTIAL_STATE' using errcode = 'P0001';
    end if;
    return query select
      'replayed'::text,
      v_existing_countries,
      v_existing_grants;
    return;
  end if;

  for v_country in select value from jsonb_array_elements(p_countries)
  loop
    if jsonb_typeof(v_country) <> 'object'
      or coalesce(v_country->>'countryUuid', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_country->>'countryId', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      or coalesce(v_country->>'currencyCode', '') !~ '^[A-Z]{3}$'
      or coalesce(v_country->>'arrivalLocationId', '') !~ '^loc_[a-z0-9_]+$'
      or coalesce(v_country->>'arrivalPackageDefinitionId', '') !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    then
      raise exception 'WORLD_COUNTRY_RUNTIME_ENTRY_INVALID' using errcode = 'P0001';
    end if;

    perform 1
    from public.countries as country_row
    join public.world_location_states as location_row
      on location_row.game_session_id = p_game_session_id
     and location_row.public_location_id = v_country->>'arrivalLocationId'
    where country_row.id = (v_country->>'countryUuid')::uuid
      and location_row.country_id = v_country->>'countryId'
      and location_row.availability <> 'closed';
    if not found then
      raise exception 'WORLD_COUNTRY_RUNTIME_REFERENCE_INVALID' using errcode = 'P0001';
    end if;

    insert into public.world_country_runtime (
      game_session_id,
      country_uuid,
      country_id,
      currency_code,
      arrival_location_id,
      arrival_package_definition_id
    ) values (
      p_game_session_id,
      (v_country->>'countryUuid')::uuid,
      v_country->>'countryId',
      v_country->>'currencyCode',
      v_country->>'arrivalLocationId',
      v_country->>'arrivalPackageDefinitionId'
    );
  end loop;

  for v_grant in select value from jsonb_array_elements(p_class_grants)
  loop
    if jsonb_typeof(v_grant) <> 'object'
      or coalesce(v_grant->>'classId', '') not in (
        'analyst', 'builder', 'maker', 'mediator',
        'navigator', 'operator', 'steward', 'trader'
      )
      or coalesce(v_grant->>'grantDefinitionId', '') !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    then
      raise exception 'ARRIVAL_CLASS_GRANT_ENTRY_INVALID' using errcode = 'P0001';
    end if;

    insert into public.arrival_class_grant_runtime (
      game_session_id,
      class_id,
      grant_definition_id
    ) values (
      p_game_session_id,
      v_grant->>'classId',
      v_grant->>'grantDefinitionId'
    );
  end loop;

  select count(*)::integer into v_country_count
  from public.world_country_runtime
  where game_session_id = p_game_session_id;
  select count(*)::integer into v_grant_count
  from public.arrival_class_grant_runtime
  where game_session_id = p_game_session_id;

  if v_country_count <> 10 or v_grant_count <> 8 then
    raise exception 'WORLD_COUNTRY_RUNTIME_COUNT_INVALID' using errcode = 'P0001';
  end if;

  return query select 'initialized'::text, v_country_count, v_grant_count;
end;
$function$;

create or replace function public.assign_arrival_class_atomic_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_country_id text,
  p_class_id text,
  p_questionnaire_id text,
  p_questionnaire_version text,
  p_score_result jsonb,
  p_assignment_idempotency_key text,
  p_arrival_package_definition_id text,
  p_grant_definition_id text,
  p_grant_idempotency_key text,
  p_assigned_at timestamptz
)
returns table (
  assignment_outcome text,
  assignment_id text,
  class_id text,
  country_id text,
  grant_command_id text,
  grant_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_assignment public.arrival_class_assignments%rowtype;
  v_grant public.arrival_grant_commands%rowtype;
  v_assignment_created boolean := false;
  v_country public.world_country_runtime%rowtype;
  v_class_grant public.arrival_class_grant_runtime%rowtype;
begin
  if p_game_session_id is null or p_player_id is null
    or p_country_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_class_id not in (
      'analyst', 'builder', 'maker', 'mediator',
      'navigator', 'operator', 'steward', 'trader'
    )
    or p_questionnaire_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or length(btrim(coalesce(p_questionnaire_version, ''))) not between 1 and 64
    or jsonb_typeof(p_score_result) <> 'object'
    or p_assignment_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_arrival_package_definition_id !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or p_grant_definition_id !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or p_grant_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_assigned_at is null
  then
    raise exception 'ARRIVAL_CLASS_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select runtime_country.* into v_country
  from public.players as player_row
  join public.game_sessions as game_row
    on game_row.id = player_row.game_session_id
  join public.world_country_runtime as runtime_country
    on runtime_country.game_session_id = player_row.game_session_id
   and runtime_country.country_uuid = player_row.country_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
  for update of player_row;

  if not found
    or v_country.country_id <> p_country_id
    or v_country.arrival_package_definition_id <> p_arrival_package_definition_id
  then
    raise exception 'ARRIVAL_PLAYER_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  select grant_row.* into v_class_grant
  from public.arrival_class_grant_runtime as grant_row
  where grant_row.game_session_id = p_game_session_id
    and grant_row.class_id = p_class_id;
  if not found or v_class_grant.grant_definition_id <> p_grant_definition_id then
    raise exception 'ARRIVAL_CLASS_GRANT_INVALID' using errcode = 'P0001';
  end if;

  select assignment_row.* into v_assignment
  from public.arrival_class_assignments as assignment_row
  where assignment_row.game_session_id = p_game_session_id
    and assignment_row.player_id = p_player_id
  for update;

  if found then
    if v_assignment.idempotency_key <> p_assignment_idempotency_key
      or v_assignment.class_id <> p_class_id
      or v_assignment.country_id <> p_country_id
    then
      raise exception 'ARRIVAL_CLASS_ALREADY_ASSIGNED' using errcode = 'P0001';
    end if;
  else
    insert into public.arrival_class_assignments (
      game_session_id,
      player_id,
      country_id,
      class_id,
      source,
      questionnaire_id,
      questionnaire_version,
      score_result,
      idempotency_key,
      assigned_at
    ) values (
      p_game_session_id,
      p_player_id,
      p_country_id,
      p_class_id,
      'questionnaire',
      p_questionnaire_id,
      p_questionnaire_version,
      p_score_result,
      p_assignment_idempotency_key,
      p_assigned_at
    ) returning * into v_assignment;
    v_assignment_created := true;
  end if;

  insert into public.arrival_grant_commands (
    game_session_id,
    player_id,
    assignment_id,
    idempotency_key,
    arrival_package_definition_id,
    grant_definition_id
  ) values (
    p_game_session_id,
    p_player_id,
    v_assignment.id,
    p_grant_idempotency_key,
    p_arrival_package_definition_id,
    p_grant_definition_id
  )
  on conflict (game_session_id, player_id, idempotency_key)
  do nothing;

  select grant_command.* into v_grant
  from public.arrival_grant_commands as grant_command
  where grant_command.game_session_id = p_game_session_id
    and grant_command.player_id = p_player_id
    and grant_command.idempotency_key = p_grant_idempotency_key;

  return query select
    case when v_assignment_created then 'assigned' else 'replayed' end,
    v_assignment.public_id,
    v_assignment.class_id,
    v_assignment.country_id,
    v_grant.public_id,
    v_grant.status;
end;
$function$;

revoke execute on function public.initialize_world_country_runtime_v1(uuid, jsonb)
  from service_role;
revoke execute on function public.assign_arrival_class_atomic_v1(
  uuid, uuid, text, text, text, text, jsonb,
  text, text, text, text, timestamptz
) from service_role;
revoke all on function public.initialize_world_country_runtime_v2(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.assign_arrival_class_atomic_v2(
  uuid, uuid, text, text, text, text, jsonb,
  text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.initialize_world_country_runtime_v2(uuid, jsonb, jsonb)
  to service_role;
grant execute on function public.assign_arrival_class_atomic_v2(
  uuid, uuid, text, text, text, text, jsonb,
  text, text, text, text, timestamptz
) to service_role;

commit;
