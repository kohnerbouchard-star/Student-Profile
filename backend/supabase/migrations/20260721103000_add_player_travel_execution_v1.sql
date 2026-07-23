begin;

create table public.player_travel_states (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  player_id uuid not null,
  current_location_id text not null,
  status text not null default 'available',
  active_journey_id uuid null,
  arrival_at timestamptz null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_travel_states_player_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete cascade,
  constraint player_travel_states_scope_unique unique (game_session_id, player_id),
  constraint player_travel_states_location_valid check (current_location_id ~ '^loc_[a-z0-9_]+$'),
  constraint player_travel_states_status_valid check (status in ('available', 'in_transit')),
  constraint player_travel_states_transit_valid check (
    (status = 'available' and active_journey_id is null and arrival_at is null)
    or (status = 'in_transit' and active_journey_id is not null and arrival_at is not null)
  ),
  constraint player_travel_states_revision_valid check (revision >= 0),
  constraint player_travel_states_location_fk
    foreign key (game_session_id, current_location_id)
    references public.world_location_states (game_session_id, public_location_id) on delete restrict
);

create trigger set_player_travel_states_updated_at
before update on public.player_travel_states
for each row execute function public.set_current_timestamp_updated_at();

create table public.player_travel_quotes (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('trq_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  player_id uuid not null,
  from_location_id text not null,
  to_location_id text not null,
  currency_code text not null,
  total_cost_minor bigint not null,
  total_duration_minutes integer not null,
  route_state_revision bigint not null,
  legs jsonb not null,
  status text not null default 'created',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz null,
  constraint player_travel_quotes_player_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete cascade,
  constraint player_travel_quotes_public_id_unique unique (public_id),
  constraint player_travel_quotes_public_id_valid check (public_id ~ '^trq_[0-9a-f]{32}$'),
  constraint player_travel_quotes_location_valid check (
    from_location_id ~ '^loc_[a-z0-9_]+$'
    and to_location_id ~ '^loc_[a-z0-9_]+$'
    and from_location_id <> to_location_id
  ),
  constraint player_travel_quotes_from_fk
    foreign key (game_session_id, from_location_id)
    references public.world_location_states (game_session_id, public_location_id) on delete restrict,
  constraint player_travel_quotes_to_fk
    foreign key (game_session_id, to_location_id)
    references public.world_location_states (game_session_id, public_location_id) on delete restrict,
  constraint player_travel_quotes_currency_valid check (currency_code ~ '^[A-Z]{3}$'),
  constraint player_travel_quotes_amount_valid check (
    total_cost_minor >= 0 and total_duration_minutes > 0 and route_state_revision >= 0
  ),
  constraint player_travel_quotes_legs_valid check (
    jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) between 1 and 20
  ),
  constraint player_travel_quotes_status_valid check (status in ('created', 'consumed', 'expired')),
  constraint player_travel_quotes_consumption_valid check (
    (status = 'consumed' and consumed_at is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);

create index player_travel_quotes_player_status_idx
  on public.player_travel_quotes (game_session_id, player_id, status, expires_at);

create table public.player_travel_journeys (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('trj_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  player_id uuid not null,
  quote_id uuid not null references public.player_travel_quotes (id) on delete restrict,
  idempotency_key text not null,
  from_location_id text not null,
  to_location_id text not null,
  currency_code text not null,
  total_cost_minor bigint not null,
  total_duration_minutes integer not null,
  ledger_entry_id uuid null references public.ledger_entries (id) on delete restrict,
  status text not null default 'in_transit',
  departed_at timestamptz not null,
  arrival_at timestamptz not null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_travel_journeys_player_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete cascade,
  constraint player_travel_journeys_scope_id_unique unique (game_session_id, id),
  constraint player_travel_journeys_public_id_unique unique (public_id),
  constraint player_travel_journeys_idempotency_unique unique (game_session_id, player_id, idempotency_key),
  constraint player_travel_journeys_public_id_valid check (public_id ~ '^trj_[0-9a-f]{32}$'),
  constraint player_travel_journeys_idempotency_valid check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint player_travel_journeys_location_valid check (
    from_location_id ~ '^loc_[a-z0-9_]+$'
    and to_location_id ~ '^loc_[a-z0-9_]+$'
    and from_location_id <> to_location_id
  ),
  constraint player_travel_journeys_currency_valid check (currency_code ~ '^[A-Z]{3}$'),
  constraint player_travel_journeys_amount_valid check (total_cost_minor >= 0 and total_duration_minutes > 0),
  constraint player_travel_journeys_status_valid check (status in ('in_transit', 'completed')),
  constraint player_travel_journeys_time_valid check (arrival_at > departed_at),
  constraint player_travel_journeys_completion_valid check (
    (status = 'completed' and completed_at is not null)
    or (status = 'in_transit' and completed_at is null)
  )
);

alter table public.player_travel_states
  add constraint player_travel_states_active_journey_fk
  foreign key (game_session_id, active_journey_id)
  references public.player_travel_journeys (game_session_id, id) on delete restrict;

create trigger set_player_travel_journeys_updated_at
before update on public.player_travel_journeys
for each row execute function public.set_current_timestamp_updated_at();

create index player_travel_journeys_player_status_idx
  on public.player_travel_journeys (game_session_id, player_id, status, arrival_at);

alter table public.player_travel_states enable row level security;
alter table public.player_travel_quotes enable row level security;
alter table public.player_travel_journeys enable row level security;

revoke all on table public.player_travel_states from public, anon, authenticated, service_role;
revoke all on table public.player_travel_quotes from public, anon, authenticated, service_role;
revoke all on table public.player_travel_journeys from public, anon, authenticated, service_role;

grant select, insert, update on table public.player_travel_states to service_role;
grant select, insert, update on table public.player_travel_quotes to service_role;
grant select, insert, update on table public.player_travel_journeys to service_role;

create or replace function public.initialize_player_travel_state_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_initial_location_id text,
  p_effective_at timestamptz
)
returns table (
  current_location_id text,
  status text,
  revision bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_state public.player_travel_states%rowtype;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_initial_location_id !~ '^loc_[a-z0-9_]+$'
    or p_effective_at is null
  then
    raise exception 'TRAVEL_INITIALIZATION_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  join public.game_sessions as game_row on game_row.id = player_row.game_session_id
  join public.world_location_states as location_row
    on location_row.game_session_id = player_row.game_session_id
   and location_row.public_location_id = p_initial_location_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
    and location_row.availability <> 'closed';

  if not found then
    raise exception 'TRAVEL_INITIALIZATION_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  insert into public.player_travel_states (
    game_session_id,
    player_id,
    current_location_id,
    status,
    revision,
    created_at,
    updated_at
  ) values (
    p_game_session_id,
    p_player_id,
    p_initial_location_id,
    'available',
    0,
    p_effective_at,
    p_effective_at
  )
  on conflict on constraint player_travel_states_scope_unique
  do nothing;

  select state_row.* into v_state
  from public.player_travel_states as state_row
  where state_row.game_session_id = p_game_session_id
    and state_row.player_id = p_player_id;

  if not found then
    raise exception 'TRAVEL_INITIALIZATION_FAILED' using errcode = 'P0001';
  end if;

  return query select
    v_state.current_location_id,
    v_state.status,
    v_state.revision;
end;
$function$;

create or replace function public.execute_player_travel_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_public_id text,
  p_idempotency_key text,
  p_departed_at timestamptz,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  journey_id text,
  quote_id text,
  from_location_id text,
  to_location_id text,
  currency_code text,
  total_cost_minor bigint,
  total_duration_minutes integer,
  status text,
  departed_at timestamptz,
  arrival_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_departed_at, now());
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_quote public.player_travel_quotes%rowtype;
  v_state public.player_travel_states%rowtype;
  v_balance public.account_balances%rowtype;
  v_journey public.player_travel_journeys%rowtype;
  v_ledger record;
  v_leg jsonb;
  v_route public.world_route_states%rowtype;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_quote_public_id !~ '^trq_[0-9a-f]{32}$'
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_departed_at is null
    or jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'TRAVEL_EXECUTION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  join public.game_sessions as game_row on game_row.id = player_row.game_session_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
  for update of player_row;

  if not found then
    raise exception 'TRAVEL_PLAYER_OR_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'gameSessionId', p_game_session_id,
        'playerId', p_player_id,
        'quotePublicId', p_quote_public_id,
        'routeKey', 'players.me.travel'
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.mutation_idempotency_keys (
    game_session_id,
    player_id,
    route_key,
    idempotency_key,
    request_hash,
    status,
    expires_at
  ) values (
    p_game_session_id,
    p_player_id,
    'players.me.travel',
    v_key,
    v_request_hash,
    'STARTED',
    v_now + interval '7 days'
  )
  on conflict on constraint mutation_idempotency_keys_scope_unique
  do nothing;

  select key_row.* into v_idempotency
  from public.mutation_idempotency_keys as key_row
  where key_row.game_session_id = p_game_session_id
    and key_row.player_id = p_player_id
    and key_row.route_key = 'players.me.travel'
    and key_row.idempotency_key = v_key
  for update;

  if not found then
    raise exception 'TRAVEL_IDEMPOTENCY_LOOKUP_FAILED' using errcode = 'P0001';
  end if;
  if v_idempotency.request_hash <> v_request_hash then
    raise exception 'TRAVEL_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_idempotency.status = 'COMPLETED' then
    select journey_row.* into v_journey
    from public.player_travel_journeys as journey_row
    where journey_row.id = v_idempotency.result_id
      and journey_row.game_session_id = p_game_session_id
      and journey_row.player_id = p_player_id;
    if not found then
      raise exception 'TRAVEL_IDEMPOTENCY_RESULT_NOT_FOUND' using errcode = 'P0001';
    end if;
    select quote_row.* into v_quote
    from public.player_travel_quotes as quote_row
    where quote_row.id = v_journey.quote_id;
    return query select
      v_journey.public_id,
      v_quote.public_id,
      v_journey.from_location_id,
      v_journey.to_location_id,
      v_journey.currency_code,
      v_journey.total_cost_minor,
      v_journey.total_duration_minutes,
      v_journey.status,
      v_journey.departed_at,
      v_journey.arrival_at,
      v_journey.completed_at;
    return;
  end if;
  if v_idempotency.status <> 'STARTED' then
    raise exception 'TRAVEL_IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;

  select quote_row.* into v_quote
  from public.player_travel_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_id = p_quote_public_id
  for update;

  if not found then
    raise exception 'TRAVEL_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'created' then
    raise exception 'TRAVEL_QUOTE_NOT_USABLE' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now then
    update public.player_travel_quotes
    set status = 'expired'
    where id = v_quote.id;
    raise exception 'TRAVEL_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  select state_row.* into v_state
  from public.player_travel_states as state_row
  where state_row.game_session_id = p_game_session_id
    and state_row.player_id = p_player_id
  for update;

  if not found or v_state.status <> 'available' then
    raise exception 'TRAVEL_ALREADY_IN_TRANSIT' using errcode = 'P0001';
  end if;
  if v_state.current_location_id <> v_quote.from_location_id then
    raise exception 'TRAVEL_QUOTE_ORIGIN_STALE' using errcode = 'P0001';
  end if;

  perform 1
  from public.world_location_states as location_row
  where location_row.game_session_id = p_game_session_id
    and location_row.public_location_id in (v_quote.from_location_id, v_quote.to_location_id)
    and location_row.availability <> 'closed';
  if (select count(*) from public.world_location_states as location_row
      where location_row.game_session_id = p_game_session_id
        and location_row.public_location_id in (v_quote.from_location_id, v_quote.to_location_id)
        and location_row.availability <> 'closed') <> 2 then
    raise exception 'TRAVEL_LOCATION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  for v_leg in select value from jsonb_array_elements(v_quote.legs)
  loop
    select route_row.* into v_route
    from public.world_route_states as route_row
    where route_row.game_session_id = p_game_session_id
      and route_row.public_route_id = v_leg->>'publicRouteId'
    for share;

    if not found
      or v_route.status = 'closed'
      or v_route.revision <> (v_leg->>'routeRevision')::bigint
    then
      raise exception 'TRAVEL_ROUTE_STATE_STALE' using errcode = 'P0001';
    end if;
  end loop;

  select balance_row.* into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = 'cash'
    and balance_row.currency_code = v_quote.currency_code
  for update;

  if not found or v_balance.balance < v_quote.total_cost_minor then
    raise exception 'TRAVEL_INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into public.player_travel_journeys (
    game_session_id,
    player_id,
    quote_id,
    idempotency_key,
    from_location_id,
    to_location_id,
    currency_code,
    total_cost_minor,
    total_duration_minutes,
    status,
    departed_at,
    arrival_at
  ) values (
    p_game_session_id,
    p_player_id,
    v_quote.id,
    v_key,
    v_quote.from_location_id,
    v_quote.to_location_id,
    v_quote.currency_code,
    v_quote.total_cost_minor,
    v_quote.total_duration_minutes,
    'in_transit',
    v_now,
    v_now + make_interval(mins => v_quote.total_duration_minutes)
  ) returning * into v_journey;

  select * into v_ledger
  from public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    'cash',
    -v_quote.total_cost_minor,
    v_quote.currency_code,
    'debit',
    'travel',
    'route_travel',
    v_journey.id,
    'player',
    p_player_id,
    jsonb_build_object(
      'travelJourneyId', v_journey.public_id,
      'travelQuoteId', v_quote.public_id,
      'fromLocationId', v_quote.from_location_id,
      'toLocationId', v_quote.to_location_id,
      'durationMinutes', v_quote.total_duration_minutes
    ) || coalesce(p_request_metadata, '{}'::jsonb)
  );

  update public.player_travel_journeys
  set ledger_entry_id = v_ledger.ledger_entry_id
  where id = v_journey.id
  returning * into v_journey;

  update public.player_travel_quotes
  set status = 'consumed', consumed_at = v_now
  where id = v_quote.id;

  update public.player_travel_states
  set status = 'in_transit',
      active_journey_id = v_journey.id,
      arrival_at = v_journey.arrival_at,
      revision = revision + 1
  where id = v_state.id;

  update public.mutation_idempotency_keys
  set status = 'COMPLETED',
      result_id = v_journey.id,
      response_body = jsonb_build_object(
        'journeyId', v_journey.public_id,
        'quoteId', v_quote.public_id,
        'status', v_journey.status,
        'arrivalAt', v_journey.arrival_at
      ),
      completed_at = v_now
  where id = v_idempotency.id;

  return query select
    v_journey.public_id,
    v_quote.public_id,
    v_journey.from_location_id,
    v_journey.to_location_id,
    v_journey.currency_code,
    v_journey.total_cost_minor,
    v_journey.total_duration_minutes,
    v_journey.status,
    v_journey.departed_at,
    v_journey.arrival_at,
    v_journey.completed_at;
end;
$function$;

create or replace function public.complete_player_travel_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_journey_public_id text,
  p_effective_at timestamptz
)
returns table (
  journey_id text,
  current_location_id text,
  status text,
  completed_at timestamptz,
  travel_state_revision bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_journey public.player_travel_journeys%rowtype;
  v_state public.player_travel_states%rowtype;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_journey_public_id !~ '^trj_[0-9a-f]{32}$'
    or p_effective_at is null
  then
    raise exception 'TRAVEL_COMPLETION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select journey_row.* into v_journey
  from public.player_travel_journeys as journey_row
  where journey_row.game_session_id = p_game_session_id
    and journey_row.player_id = p_player_id
    and journey_row.public_id = p_journey_public_id
  for update;

  if not found then
    raise exception 'TRAVEL_JOURNEY_NOT_FOUND' using errcode = 'P0001';
  end if;

  select state_row.* into v_state
  from public.player_travel_states as state_row
  where state_row.game_session_id = p_game_session_id
    and state_row.player_id = p_player_id
  for update;

  if not found then
    raise exception 'TRAVEL_STATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_journey.status = 'completed' then
    return query select
      v_journey.public_id,
      v_state.current_location_id,
      v_journey.status,
      v_journey.completed_at,
      v_state.revision;
    return;
  end if;

  if p_effective_at < v_journey.arrival_at then
    raise exception 'TRAVEL_NOT_ARRIVED' using errcode = 'P0001';
  end if;
  if v_state.active_journey_id <> v_journey.id then
    raise exception 'TRAVEL_STATE_CONFLICT' using errcode = '40001';
  end if;

  update public.player_travel_journeys
  set status = 'completed', completed_at = p_effective_at
  where id = v_journey.id
  returning * into v_journey;

  update public.player_travel_states
  set current_location_id = v_journey.to_location_id,
      status = 'available',
      active_journey_id = null,
      arrival_at = null,
      revision = revision + 1
  where id = v_state.id
  returning * into v_state;

  return query select
    v_journey.public_id,
    v_state.current_location_id,
    v_journey.status,
    v_journey.completed_at,
    v_state.revision;
end;
$function$;

revoke all on function public.initialize_player_travel_state_v1(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.execute_player_travel_v1(uuid, uuid, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_player_travel_v1(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.initialize_player_travel_state_v1(uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.execute_player_travel_v1(uuid, uuid, text, text, timestamptz, jsonb)
  to service_role;
grant execute on function public.complete_player_travel_v1(uuid, uuid, text, timestamptz)
  to service_role;

commit;
