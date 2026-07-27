-- Align Player travel settlement with the canonical checking account.
-- The legacy travel RPC still queried and debited the retired cash account,
-- while Player banking and connected fixture credits use checking.

begin;

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
    and balance_row.account_type = 'checking'
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
    'checking',
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

revoke all on function public.execute_player_travel_v1(uuid, uuid, text, text, timestamptz, jsonb)
  from public, anon, authenticated;

grant execute on function public.execute_player_travel_v1(uuid, uuid, text, text, timestamptz, jsonb)
  to service_role;

comment on function public.execute_player_travel_v1(uuid, uuid, text, text, timestamptz, jsonb) is
  'Executes Player travel atomically against the canonical checking account, with route validation and idempotent replay.';

commit;
