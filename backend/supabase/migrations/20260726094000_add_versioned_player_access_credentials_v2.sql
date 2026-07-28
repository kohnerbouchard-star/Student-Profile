begin;

alter table public.player_access_credentials
  add column if not exists credential_version text not null default 'sha256-v1',
  add column if not exists credential_salt text null,
  add column if not exists credential_verifier text null,
  add column if not exists credential_iterations integer null;

alter table public.player_access_credentials
  drop constraint if exists player_access_credentials_lookup_digest_check,
  add constraint player_access_credentials_lookup_digest_check check (
    normalized_student_code_hash ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists player_access_credentials_version_check,
  add constraint player_access_credentials_version_check check (
    credential_version in ('sha256-v1', 'pbkdf2-sha256-v2')
  ),
  drop constraint if exists player_access_credentials_material_check,
  add constraint player_access_credentials_material_check check (
    (
      credential_version = 'sha256-v1'
      and credential_salt is null
      and credential_verifier is null
      and credential_iterations is null
    )
    or
    (
      credential_version = 'pbkdf2-sha256-v2'
      and credential_salt ~ '^[A-Za-z0-9_-]{22}$'
      and credential_verifier ~ '^[A-Za-z0-9_-]{43}$'
      and credential_iterations between 100000 and 1000000
    )
  );

comment on column public.player_access_credentials.normalized_student_code_hash is
  'Legacy SHA-256 verifier for sha256-v1 rows; server-peppered HMAC lookup digest for pbkdf2-sha256-v2 rows. Plaintext Access Codes are never stored.';
comment on column public.player_access_credentials.credential_version is
  'Credential verification contract. sha256-v1 is migration-only; pbkdf2-sha256-v2 is current.';
comment on column public.player_access_credentials.credential_salt is
  'Random 16-byte salt encoded as unpadded base64url for the current PBKDF2 verifier.';
comment on column public.player_access_credentials.credential_verifier is
  'PBKDF2-SHA-256 derived verifier encoded as unpadded base64url.';
comment on column public.player_access_credentials.credential_iterations is
  'PBKDF2 iteration count retained with the credential to support controlled future rehashing.';

create or replace function public.set_player_identity_and_access_credential_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_player_identifier text,
  p_player_identifier_normalized text,
  p_lookup_digest text,
  p_credential_version text,
  p_credential_salt text,
  p_credential_verifier text,
  p_credential_iterations integer
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
  v_player public.players%rowtype;
  v_credential_created_at timestamptz := null;
  v_now timestamptz := clock_timestamp();
begin
  if auth.role() <> 'service_role' then
    raise exception 'PLAYER_CREDENTIAL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if v_identifier is null or v_identifier_normalized is null then
    raise exception 'PLAYER_IDENTIFIER_REQUIRED' using errcode = '22023';
  end if;
  if length(v_identifier) > 128 or length(v_identifier_normalized) > 128 then
    raise exception 'PLAYER_IDENTIFIER_TOO_LONG' using errcode = '22023';
  end if;
  if coalesce(p_lookup_digest, '') !~ '^[0-9a-f]{64}$'
    or p_credential_version <> 'pbkdf2-sha256-v2'
    or coalesce(p_credential_salt, '') !~ '^[A-Za-z0-9_-]{22}$'
    or coalesce(p_credential_verifier, '') !~ '^[A-Za-z0-9_-]{43}$'
    or p_credential_iterations not between 100000 and 1000000 then
    raise exception 'PLAYER_CREDENTIAL_MATERIAL_INVALID' using errcode = '22023';
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
    credential_version,
    credential_salt,
    credential_verifier,
    credential_iterations,
    status
  ) values (
    p_game_session_id,
    p_player_id,
    p_lookup_digest,
    p_credential_version,
    p_credential_salt,
    p_credential_verifier,
    p_credential_iterations,
    'active'
  )
  returning player_access_credentials.created_at into v_credential_created_at;

  return query select
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

    if exists (
      select 1
      from public.player_access_credentials as conflicting_credential
      where conflicting_credential.game_session_id = p_game_session_id
        and conflicting_credential.normalized_student_code_hash = p_lookup_digest
        and conflicting_credential.player_id <> p_player_id
        and conflicting_credential.status = 'active'
    ) then
      raise exception 'PLAYER_ACCESS_CODE_CONFLICT' using errcode = 'P0001';
    end if;

    raise;
end;
$function$;

create or replace function public.upgrade_player_access_credential_v2(
  p_credential_id uuid,
  p_game_session_id uuid,
  p_player_id uuid,
  p_expected_legacy_hash text,
  p_lookup_digest text,
  p_credential_version text,
  p_credential_salt text,
  p_credential_verifier text,
  p_credential_iterations integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'PLAYER_CREDENTIAL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_credential_id is null or p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_CREDENTIAL_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if coalesce(p_expected_legacy_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_lookup_digest, '') !~ '^[0-9a-f]{64}$'
    or p_credential_version <> 'pbkdf2-sha256-v2'
    or coalesce(p_credential_salt, '') !~ '^[A-Za-z0-9_-]{22}$'
    or coalesce(p_credential_verifier, '') !~ '^[A-Za-z0-9_-]{43}$'
    or p_credential_iterations not between 100000 and 1000000 then
    raise exception 'PLAYER_CREDENTIAL_MATERIAL_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_game_session_id::text || ':' || p_player_id::text,
    0
  ));

  update public.player_access_credentials as credential
  set
    normalized_student_code_hash = p_lookup_digest,
    credential_version = p_credential_version,
    credential_salt = p_credential_salt,
    credential_verifier = p_credential_verifier,
    credential_iterations = p_credential_iterations,
    updated_at = clock_timestamp()
  where credential.id = p_credential_id
    and credential.game_session_id = p_game_session_id
    and credential.player_id = p_player_id
    and credential.status = 'active'
    and credential.credential_version = 'sha256-v1'
    and credential.normalized_student_code_hash = p_expected_legacy_hash;

  return found;
end;
$function$;

revoke all on function public.set_player_identity_and_access_credential_v2(
  uuid, uuid, text, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.set_player_identity_and_access_credential_v2(
  uuid, uuid, text, text, text, text, text, text, integer
) to service_role;

revoke all on function public.upgrade_player_access_credential_v2(
  uuid, uuid, uuid, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.upgrade_player_access_credential_v2(
  uuid, uuid, uuid, text, text, text, text, text, integer
) to service_role;

comment on function public.set_player_identity_and_access_credential_v2(
  uuid, uuid, text, text, text, text, text, text, integer
) is
  'Rotates a Player Access Code to the current salted PBKDF2 credential contract and revokes every active Player session atomically.';
comment on function public.upgrade_player_access_credential_v2(
  uuid, uuid, uuid, text, text, text, text, text, integer
) is
  'Conditionally replaces one successfully verified legacy SHA-256 Player credential with the current salted PBKDF2 credential contract.';

commit;
