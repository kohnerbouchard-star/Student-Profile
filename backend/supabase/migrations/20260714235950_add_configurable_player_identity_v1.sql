-- Configurable player identity V1.
-- Separates the internal UUID from a teacher-configured RFID/card identifier
-- and a separately managed, hashed player access code.

alter table public.players
  add column if not exists player_identifier text null,
  add column if not exists player_identifier_normalized text null;

alter table public.players
  drop constraint if exists players_player_identifier_pair_check,
  add constraint players_player_identifier_pair_check check (
    (player_identifier is null and player_identifier_normalized is null)
    or (
      player_identifier is not null
      and player_identifier_normalized is not null
      and length(btrim(player_identifier)) > 0
      and length(btrim(player_identifier_normalized)) > 0
    )
  );

comment on column public.players.player_identifier is
  'Teacher-configured player-facing identifier, such as an RFID card UID. This is not the internal players.id UUID.';
comment on column public.players.player_identifier_normalized is
  'Normalized lookup value for player_identifier. Written only by trusted server code.';

-- Only reuse an existing roster label when it is unique among active players
-- in that game. Ambiguous labels remain unconfigured and must be set by staff.
with unique_active_roster_labels as (
  select
    game_session_id,
    upper(regexp_replace(roster_label, '\s+', '', 'g')) as normalized_label
  from public.players
  where status = 'active'
    and roster_label is not null
    and length(btrim(roster_label)) > 0
  group by
    game_session_id,
    upper(regexp_replace(roster_label, '\s+', '', 'g'))
  having count(*) = 1
)
update public.players p
set
  player_identifier = p.roster_label,
  player_identifier_normalized = u.normalized_label
from unique_active_roster_labels u
where p.game_session_id = u.game_session_id
  and p.status = 'active'
  and p.player_identifier is null
  and upper(regexp_replace(p.roster_label, '\s+', '', 'g')) = u.normalized_label;

create unique index if not exists players_active_identifier_unique_idx
on public.players (game_session_id, player_identifier_normalized)
where status = 'active' and player_identifier_normalized is not null;

create index if not exists players_identifier_lookup_idx
on public.players (game_session_id, player_identifier_normalized, status);

create or replace function public.create_player_with_identity_and_credential(
  p_game_session_id uuid,
  p_display_name text,
  p_roster_label text,
  p_player_identifier text,
  p_player_identifier_normalized text,
  p_access_code_hash text,
  p_assignment_metadata jsonb default '{}'::jsonb
)
returns table (
  player_id uuid,
  display_name text,
  roster_label text,
  player_identifier text,
  player_status text,
  player_created_at timestamptz,
  player_updated_at timestamptz,
  country_assignment_id uuid,
  country_profile_id uuid,
  country_code text,
  country_name text,
  assigned_at timestamptz,
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
  v_created record;
  v_credential public.player_access_credentials%rowtype;
begin
  if v_identifier is null or v_identifier_normalized is null then
    raise exception 'PLAYER_IDENTIFIER_REQUIRED' using errcode = 'P0001';
  end if;

  if v_access_code_hash is null then
    raise exception 'PLAYER_ACCESS_CODE_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_created
  from public.create_player_with_balanced_country_assignment(
    p_game_session_id,
    p_display_name,
    p_roster_label,
    coalesce(p_assignment_metadata, '{}'::jsonb) || jsonb_build_object(
      'identityMode', 'rfid_player_id_plus_access_code_v1'
    )
  );

  update public.players
  set
    player_identifier = v_identifier,
    player_identifier_normalized = v_identifier_normalized,
    updated_at = now()
  where id = v_created.player_id
    and game_session_id = p_game_session_id;

  insert into public.player_access_credentials (
    game_session_id,
    player_id,
    normalized_student_code_hash,
    status
  )
  values (
    p_game_session_id,
    v_created.player_id,
    v_access_code_hash,
    'active'
  )
  returning * into v_credential;

  return query
  select
    v_created.player_id,
    v_created.display_name,
    v_created.roster_label,
    v_identifier,
    v_created.player_status,
    v_created.player_created_at,
    v_created.player_updated_at,
    v_created.country_assignment_id,
    v_created.country_profile_id,
    v_created.country_code,
    v_created.country_name,
    v_created.assigned_at,
    v_credential.created_at;
exception
  when unique_violation then
    if exists (
      select 1
      from public.players p
      where p.game_session_id = p_game_session_id
        and p.player_identifier_normalized = v_identifier_normalized
        and p.status = 'active'
    ) then
      raise exception 'PLAYER_IDENTIFIER_CONFLICT' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.player_access_credentials pac
      where pac.game_session_id = p_game_session_id
        and pac.normalized_student_code_hash = v_access_code_hash
        and pac.status = 'active'
    ) then
      raise exception 'PLAYER_ACCESS_CODE_CONFLICT' using errcode = 'P0001';
    end if;

    raise;
end;
$$;

comment on function public.create_player_with_identity_and_credential(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) is
  'Creates a player, balanced country assignment, configurable RFID/player identifier, and hashed access credential in one transaction.';

revoke all on function public.create_player_with_identity_and_credential(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public;

grant execute on function public.create_player_with_identity_and_credential(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

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

  update public.players
  set
    player_identifier = v_identifier,
    player_identifier_normalized = v_identifier_normalized,
    updated_at = now()
  where id = p_player_id
    and game_session_id = p_game_session_id
    and status = 'active'
  returning * into v_player;

  if v_player.id is null then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_access_code_hash is not null then
    update public.player_access_credentials
    set
      status = 'revoked',
      revoked_at = now(),
      updated_at = now()
    where game_session_id = p_game_session_id
      and player_id = p_player_id
      and status = 'active';

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
    returning created_at into v_credential_created_at;
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
      from public.players p
      where p.game_session_id = p_game_session_id
        and p.player_identifier_normalized = v_identifier_normalized
        and p.id <> p_player_id
        and p.status = 'active'
    ) then
      raise exception 'PLAYER_IDENTIFIER_CONFLICT' using errcode = 'P0001';
    end if;

    if v_access_code_hash is not null and exists (
      select 1
      from public.player_access_credentials pac
      where pac.game_session_id = p_game_session_id
        and pac.normalized_student_code_hash = v_access_code_hash
        and pac.player_id <> p_player_id
        and pac.status = 'active'
    ) then
      raise exception 'PLAYER_ACCESS_CODE_CONFLICT' using errcode = 'P0001';
    end if;

    raise;
end;
$$;

comment on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) is
  'Updates a player-facing RFID/player identifier and optionally rotates the hashed access credential in one transaction.';

revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from public;

grant execute on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;
