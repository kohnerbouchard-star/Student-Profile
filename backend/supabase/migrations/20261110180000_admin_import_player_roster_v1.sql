begin;

-- One transaction, one staff/game-bound idempotency claim, one audit event.
-- Only hashes enter this function; raw access codes stay in request memory.
create or replace function public.admin_import_player_roster_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_student_names jsonb,
  p_credentials jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (response_status integer, response_body jsonb, was_replayed boolean)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_claim record;
  v_created record;
  v_identity record;
  v_name text;
  v_credential jsonb;
  v_index integer;
  v_count integer;
  v_students jsonb := '[]'::jsonb;
begin
  perform private.assert_admin_game_owned_v1(p_game_session_id, p_staff_user_id);
  if jsonb_typeof(p_student_names) is distinct from 'array' then
    raise exception 'ADMIN_ROSTER_IMPORT_INVALID' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_student_names);
  if v_count < 1 or v_count > 200 then
    raise exception 'ADMIN_ROSTER_IMPORT_INVALID' using errcode = 'P0001';
  end if;
  for v_index in 0..v_count - 1 loop
    v_name := p_student_names ->> v_index;
    if jsonb_typeof(p_student_names -> v_index) is distinct from 'string'
       or length(v_name) not between 1 and 240 or v_name <> btrim(v_name)
       or v_name <> normalize(v_name, NFC)
       or v_name ~ '[[:cntrl:]]'
       or v_name ~ U&'[\0080-\009f\202a-\202e\2066-\2069\fffd]'
       or v_name ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' then
      raise exception 'ADMIN_ROSTER_IMPORT_INVALID' using errcode = 'P0001';
    end if;
  end loop;

  select * into v_claim from private.begin_admin_mutation_v1(
    p_game_session_id, p_staff_user_id, 'players.roster_import',
    p_idempotency_key, jsonb_build_object('studentNames', p_student_names)
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  if jsonb_typeof(p_credentials) is distinct from 'array' then
    raise exception 'ADMIN_ROSTER_CREDENTIALS_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_credentials) <> v_count then
    raise exception 'ADMIN_ROSTER_CREDENTIALS_INVALID' using errcode = 'P0001';
  end if;
  -- Canonical creation owns the shared per-game advisory lock. Do not take
  -- a game row lock first: single-player creation takes advisory before FK locks.
  for v_index in 0..v_count - 1 loop
    v_name := p_student_names ->> v_index;
    v_credential := p_credentials -> v_index;
    if jsonb_typeof(v_credential) is distinct from 'object'
       or (v_credential ->> 'playerIdentifier') is null
       or (v_credential ->> 'playerIdentifier') !~ '^STU-[A-F0-9]{24}$'
       or (v_credential ->> 'credentialVersion') is distinct from 'pbkdf2-sha256-v2'
       or (v_credential ->> 'iterations') is distinct from '600000'
       or (v_credential - array['playerIdentifier','lookupDigest','credentialVersion','salt','verifier','iterations']) <> '{}'::jsonb then
      raise exception 'ADMIN_ROSTER_CREDENTIALS_INVALID' using errcode = 'P0001';
    end if;
    select * into v_created from public.create_player_with_balanced_country_assignment(
      p_game_session_id, v_name, null,
      jsonb_build_object('route', 'staff.players.roster_import', 'requestedByStaffUserId', p_staff_user_id)
    );
    if v_created.player_id is null then
      raise exception 'ADMIN_PLAYER_CREATE_FAILED' using errcode = 'P0001';
    end if;
    select * into v_identity from public.set_player_identity_and_access_credential_v2(
      p_game_session_id, v_created.player_id,
      v_credential ->> 'playerIdentifier', v_credential ->> 'playerIdentifier',
      v_credential ->> 'lookupDigest', v_credential ->> 'credentialVersion',
      v_credential ->> 'salt', v_credential ->> 'verifier', 600000
    );
    if v_identity.player_id is null or v_identity.credential_created_at is null then
      raise exception 'ADMIN_PLAYER_CREATE_FAILED' using errcode = 'P0001';
    end if;
    v_students := v_students || jsonb_build_array(jsonb_build_object(
      'row', v_index + 1, 'displayName', v_name,
      'playerIdentifier', v_credential ->> 'playerIdentifier'
    ));
  end loop;
  return query select * from private.complete_admin_mutation_v1(
    p_staff_user_id, p_idempotency_key, 201,
    jsonb_build_object('createdCount', v_count, 'students', v_students),
    'players.roster_imported', 'game_session', p_game_session_id,
    jsonb_build_object('requestId', nullif(btrim(coalesce(p_request_id, '')), ''), 'createdCount', v_count)
  );
end;
$function$;

revoke all on function public.admin_import_player_roster_v1(uuid, uuid, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_import_player_roster_v1(uuid, uuid, jsonb, jsonb, text, text)
  to service_role;
comment on function public.admin_import_player_roster_v1(uuid, uuid, jsonb, jsonb, text, text) is
  'Atomic names-only roster provisioning. Replays contain public receipts only; recover lost access codes through protected reset.';

commit;
