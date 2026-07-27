begin;

-- The canonical Arrival grant key includes game, player, country, package, and
-- class definition identities. Preserve that full source as the replay input,
-- but store a deterministic SHA-256 token that remains inside the reviewed
-- 128-character mutation-idempotency boundary.
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
set search_path = public, extensions, pg_temp
as $function$
declare
  v_assignment public.arrival_class_assignments%rowtype;
  v_grant public.arrival_grant_commands%rowtype;
  v_assignment_created boolean := false;
  v_country public.world_country_runtime%rowtype;
  v_class_grant public.arrival_class_grant_runtime%rowtype;
  v_bounded_grant_idempotency_key text;
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
    or p_assignment_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or p_arrival_package_definition_id !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or p_grant_definition_id !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or p_grant_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,511}$'
    or p_assigned_at is null
  then
    raise exception 'ARRIVAL_CLASS_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  v_bounded_grant_idempotency_key :=
    'arrival-grant:' || encode(
      extensions.digest(p_grant_idempotency_key, 'sha256'),
      'hex'
    );

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
    v_bounded_grant_idempotency_key,
    p_arrival_package_definition_id,
    p_grant_definition_id
  )
  on conflict (game_session_id, player_id, idempotency_key)
  do nothing;

  select grant_command.* into v_grant
  from public.arrival_grant_commands as grant_command
  where grant_command.game_session_id = p_game_session_id
    and grant_command.player_id = p_player_id
    and grant_command.idempotency_key = v_bounded_grant_idempotency_key;

  return query select
    case when v_assignment_created then 'assigned' else 'replayed' end,
    v_assignment.public_id,
    v_assignment.class_id,
    v_assignment.country_id,
    v_grant.public_id,
    v_grant.status;
end;
$function$;

comment on function public.assign_arrival_class_atomic_v2(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, timestamptz
) is
  'Assigns one Arrival Class and creates one grant command. V3 hashes the full grant replay identity into a bounded deterministic storage key.';

revoke all on function public.assign_arrival_class_atomic_v2(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.assign_arrival_class_atomic_v2(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, timestamptz
) to service_role;

commit;
