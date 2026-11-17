-- Keep the normalized student identifier out of PostgREST GET URLs/access logs.
-- This lookup does not authenticate a player or return credential material.
begin;

create or replace function public.lookup_player_login_identity_v1(
  p_game_session_id uuid,
  p_player_identifier_normalized text
)
returns table (
  id uuid,
  display_name text,
  roster_label text,
  player_identifier text,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select p.id, p.display_name, p.roster_label, p.player_identifier, p.status
  from public.players as p
  where p.game_session_id = p_game_session_id
    and p.player_identifier_normalized = p_player_identifier_normalized
    and p.status = 'active';
$function$;

revoke all on function public.lookup_player_login_identity_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lookup_player_login_identity_v1(uuid, text)
  to service_role;

comment on function public.lookup_player_login_identity_v1(uuid, text) is
  'Service-only Player login identity lookup. Call via POST RPC so student identifiers do not enter request URLs; authentication remains in the login handler.';

commit;
