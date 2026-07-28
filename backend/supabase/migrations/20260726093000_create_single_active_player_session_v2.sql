begin;

create or replace function public.create_player_session_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_session_token_hash text,
  p_expires_at timestamptz
)
returns table (
  session_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_session public.player_sessions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PLAYER_SESSION_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SESSION_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if coalesce(p_session_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'PLAYER_SESSION_TOKEN_HASH_INVALID' using errcode = '22023';
  end if;
  if p_expires_at is null
    or p_expires_at <= v_now + interval '5 minutes'
    or p_expires_at > v_now + interval '24 hours' then
    raise exception 'PLAYER_SESSION_EXPIRY_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_game_session_id::text || ':' || p_player_id::text,
    0
  ));

  if not exists (
    select 1
    from public.players as player
    join public.game_sessions as game
      on game.id = player.game_session_id
    where player.game_session_id = p_game_session_id
      and player.id = p_player_id
      and player.status = 'active'
      and game.status = 'active'
  ) then
    raise exception 'PLAYER_SESSION_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  update public.player_sessions as existing_session
  set
    status = 'revoked',
    revoked_at = v_now,
    updated_at = v_now
  where existing_session.game_session_id = p_game_session_id
    and existing_session.player_id = p_player_id
    and existing_session.status = 'active'
    and existing_session.revoked_at is null;

  insert into public.player_sessions (
    game_session_id,
    player_id,
    session_token_hash,
    status,
    expires_at
  ) values (
    p_game_session_id,
    p_player_id,
    p_session_token_hash,
    'active',
    p_expires_at
  )
  returning * into v_session;

  return query select v_session.id, v_session.expires_at;
end;
$function$;

revoke all on function public.create_player_session_v2(
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.create_player_session_v2(
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;

comment on function public.create_player_session_v2(
  uuid,
  uuid,
  text,
  timestamptz
) is
  'Creates one active Player session after atomically revoking prior active sessions for the same Player and game.';

commit;
