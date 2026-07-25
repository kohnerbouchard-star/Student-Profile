begin;

-- Player login, bootstrap, and logout are executed only by the service-owned
-- Classroom Edge Function after rate-limit and session validation. RLS bypass is
-- not sufficient for PostgREST: the service role also needs explicit table
-- privileges. Browser roles must retain zero direct access to credential hashes
-- and Player-session persistence.
revoke all on table public.player_access_credentials
  from public, anon, authenticated;
revoke all on table public.player_sessions
  from public, anon, authenticated;

grant select on table public.player_access_credentials
  to service_role;
grant select, insert, update on table public.player_sessions
  to service_role;

comment on table public.player_access_credentials is
  'Hashed Player login credentials. Browser roles have no direct access; the service-owned login route receives select-only verification access.';
comment on table public.player_sessions is
  'Hashed Player session persistence. Browser roles have no direct access; service-owned login, bootstrap, and logout routes manage the session lifecycle.';

commit;
