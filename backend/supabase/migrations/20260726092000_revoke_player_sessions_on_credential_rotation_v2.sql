begin;

create or replace function public.set_player_identity_and_access_code(
  p_game_session_id uuid,
  p_player_id uuid,
  p_player_identifier text,
  p_player_identifier_normalized text,
  p_access_code_hash text default null
)
returns table (
  player_id uuid,
  player_identifier text,
  player_status text,
  credential_created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_identifier text := nullif(btrim(coalesce(p_player_identifier, '')), '');
  v_identifier_normalized text := nullif(
    btrim(coalesce(p_player_identifier_normalized, '')),
    ''
  );
  v_access_code_hash text := nullif(btrim(coalesce(p_access_code_hash, '')), '');
  v_player public.players%rowtype;
  v_credential_created_at timestamptz := null;
  v_now timestamptz := clock_timestamp();
begin
  if auth.role() <> 'service_role' then
    raise exception 'PLAYER_IDENTITY_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_identifier is null or v_identifier_normalized is null then
    raise exception 'PLAYER_IDENTIFIER_REQUIRED' using errcode = 'P0001';
  end if;
  if length(v_identifier) > 128 or length(v_identifier_normalized) > 128 then
    raise exception 'PLAYER_IDENTIFIER_TOO_LONG' using errcode = '22023';
  end if;
  if v_access_code_hash is not null and v_access_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'PLAYER_ACCESS_CODE_HASH_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_game_session_id::text || ':' || p_player_id::text,
    0
  ));

  update public.players as target_player
  set
    player_identifier = v_identifier,
    player_identifier_normalized = v_identifier_normalized,
    updated_at = v_now
  where target_player.id = p_player_id
    and target_player.game_session_id = p_game_session_id
    and target_player.status = 'active'
  returning target_player.* into v_player;

  if v_player.id is null then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_access_code_hash is not null then
    update public.player_access_credentials as existing_credential
    set
      status = 'revoked',
      revoked_at = v_now,
      updated_at = v_now
    where existing_credential.game_session_id = p_game_session_id
      and existing_credential.player_id = p_player_id
      and existing_credential.status = 'active';

    update public.player_sessions as existing_session
    set
      status = 'revoked',
      revoked_at = v_now,
      updated_at = v_now
    where existing_session.game_session_id = p_game_session_id
      and existing_session.player_id = p_player_id
      and existing_session.status = 'active'
      and existing_session.revoked_at is null;

    insert into public.player_access_credentials (
      game_session_id,
      player_id,
      normalized_student_code_hash,
      status
    )
    values (
      p_game_session_id,
      p_player_id,
      v_access_code_hash,
      'active'
    )
    returning player_access_credentials.created_at into v_credential_created_at;
  end if;

  return query
  select
    v_player.id,
    v_player.player_identifier,
    v_player.status,
    v_credential_created_at;
exception
  when unique_violation then
    if exists (
      select 1
      from public.players as conflicting_player
      where conflicting_player.game_session_id = p_game_session_id
        and conflicting_player.player_identifier_normalized = v_identifier_normalized
        and conflicting_player.id <> p_player_id
        and conflicting_player.status = 'active'
    ) then
      raise exception 'PLAYER_IDENTIFIER_CONFLICT' using errcode = 'P0001';
    end if;

    if v_access_code_hash is not null and exists (
      select 1
      from public.player_access_credentials as conflicting_credential
      where conflicting_credential.game_session_id = p_game_session_id
        and conflicting_credential.normalized_student_code_hash = v_access_code_hash
        and conflicting_credential.player_id <> p_player_id
        and conflicting_credential.status = 'active'
    ) then
      raise exception 'PLAYER_ACCESS_CODE_CONFLICT' using errcode = 'P0001';
    end if;

    raise;
end;
$function$;

revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;

comment on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) is
  'Atomically rotates Player identity credentials and revokes every active Player session so previously issued session tokens cannot survive an Access Code reset.';

commit;
