begin;

alter table public.player_residency_states
  add column currency_code text;

alter table public.player_residency_states
  add constraint player_residency_states_currency_valid check (
    currency_code is null or currency_code ~ '^[A-Z]{3}$'
  );

create table public.world_country_runtime (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  country_id text not null,
  currency_code text not null,
  arrival_location_id text not null,
  arrival_package_definition_id text not null,
  created_at timestamptz not null default now(),
  constraint world_country_runtime_scope_unique unique (game_session_id, country_id),
  constraint world_country_runtime_currency_valid check (currency_code ~ '^[A-Z]{3}$'),
  constraint world_country_runtime_country_valid check (country_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint world_country_runtime_arrival_definition_valid check (
    arrival_package_definition_id ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
  ),
  constraint world_country_runtime_location_fk
    foreign key (game_session_id, arrival_location_id)
    references public.world_location_states (game_session_id, public_location_id) on delete restrict
);

alter table public.world_country_runtime enable row level security;
revoke all on table public.world_country_runtime from public, anon, authenticated, service_role;
grant select, insert on table public.world_country_runtime to service_role;

create or replace function public.initialize_world_country_runtime_v1(
  p_game_session_id uuid,
  p_countries jsonb
)
returns table (
  initialization_outcome text,
  country_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_country jsonb;
  v_count integer;
  v_existing integer;
begin
  if p_game_session_id is null
    or jsonb_typeof(p_countries) <> 'array'
    or jsonb_array_length(p_countries) <> 10
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

  select count(*)::integer into v_existing
  from public.world_country_runtime
  where game_session_id = p_game_session_id;

  if v_existing > 0 then
    if v_existing <> 10 then
      raise exception 'WORLD_COUNTRY_RUNTIME_PARTIAL_STATE' using errcode = 'P0001';
    end if;
    return query select 'replayed'::text, v_existing;
    return;
  end if;

  for v_country in select value from jsonb_array_elements(p_countries)
  loop
    if jsonb_typeof(v_country) <> 'object'
      or coalesce(v_country->>'countryId', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      or coalesce(v_country->>'currencyCode', '') !~ '^[A-Z]{3}$'
      or coalesce(v_country->>'arrivalLocationId', '') !~ '^loc_[a-z0-9_]+$'
      or coalesce(v_country->>'arrivalPackageDefinitionId', '') !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    then
      raise exception 'WORLD_COUNTRY_RUNTIME_ENTRY_INVALID' using errcode = 'P0001';
    end if;

    perform 1
    from public.world_location_states as location_row
    where location_row.game_session_id = p_game_session_id
      and location_row.public_location_id = v_country->>'arrivalLocationId'
      and location_row.country_id = v_country->>'countryId'
      and location_row.availability <> 'closed';
    if not found then
      raise exception 'WORLD_COUNTRY_RUNTIME_LOCATION_INVALID' using errcode = 'P0001';
    end if;

    insert into public.world_country_runtime (
      game_session_id,
      country_id,
      currency_code,
      arrival_location_id,
      arrival_package_definition_id
    ) values (
      p_game_session_id,
      v_country->>'countryId',
      v_country->>'currencyCode',
      v_country->>'arrivalLocationId',
      v_country->>'arrivalPackageDefinitionId'
    );
  end loop;

  select count(*)::integer into v_count
  from public.world_country_runtime
  where game_session_id = p_game_session_id;
  if v_count <> 10 then
    raise exception 'WORLD_COUNTRY_RUNTIME_COUNT_INVALID' using errcode = 'P0001';
  end if;

  return query select 'initialized'::text, v_count;
end;
$function$;

create or replace function public.initialize_arrival_player_world_state_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_country public.world_country_runtime%rowtype;
begin
  select country_row.* into v_country
  from public.world_country_runtime as country_row
  where country_row.game_session_id = new.game_session_id
    and country_row.country_id = new.country_id;

  if not found then
    raise exception 'ARRIVAL_COUNTRY_RUNTIME_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.player_residency_states (
    game_session_id,
    player_id,
    current_country_id,
    currency_code,
    eligible_country_ids,
    pending_country_id,
    revision,
    updated_at
  ) values (
    new.game_session_id,
    new.player_id,
    new.country_id,
    v_country.currency_code,
    '[]'::jsonb,
    null,
    0,
    new.assigned_at
  )
  on conflict on constraint player_residency_states_unique
  do nothing;

  insert into public.player_travel_states (
    game_session_id,
    player_id,
    current_location_id,
    status,
    revision,
    created_at,
    updated_at
  ) values (
    new.game_session_id,
    new.player_id,
    v_country.arrival_location_id,
    'available',
    0,
    new.assigned_at,
    new.assigned_at
  )
  on conflict on constraint player_travel_states_scope_unique
  do nothing;

  return new;
end;
$function$;

revoke all on function public.initialize_world_country_runtime_v1(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.initialize_arrival_player_world_state_v1()
  from public, anon, authenticated;
grant execute on function public.initialize_world_country_runtime_v1(uuid, jsonb)
  to service_role;
grant execute on function public.initialize_arrival_player_world_state_v1()
  to service_role;

drop trigger if exists initialize_arrival_player_world_state
  on public.arrival_class_assignments;
create trigger initialize_arrival_player_world_state
after insert on public.arrival_class_assignments
for each row execute function public.initialize_arrival_player_world_state_v1();

commit;
