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
as $$
declare
  v_identifier text := nullif(btrim(coalesce(p_player_identifier, '')), '');
  v_identifier_normalized text := nullif(btrim(coalesce(p_player_identifier_normalized, '')), '');
  v_access_code_hash text := nullif(btrim(coalesce(p_access_code_hash, '')), '');
  v_player public.players%rowtype;
  v_credential_created_at timestamptz := null;
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;

  if v_identifier is null or v_identifier_normalized is null then
    raise exception 'PLAYER_IDENTIFIER_REQUIRED' using errcode = 'P0001';
  end if;

  update public.players as target_player
  set
    player_identifier = v_identifier,
    player_identifier_normalized = v_identifier_normalized,
    updated_at = now()
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
      revoked_at = now(),
      updated_at = now()
    where existing_credential.game_session_id = p_game_session_id
      and existing_credential.player_id = p_player_id
      and existing_credential.status = 'active';

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
$$;

revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from public;
revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from anon;
revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from authenticated;
grant execute on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;
