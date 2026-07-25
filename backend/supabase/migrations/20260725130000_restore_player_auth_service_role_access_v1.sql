begin;

-- Player login, bootstrap, logout, and connected read projections are executed
-- only by the service-owned Classroom Edge Function after rate-limit and Player
-- session validation. RLS bypass is not sufficient for PostgREST: service_role
-- also needs explicit table privileges. Browser roles retain zero direct access
-- to credentials, sessions, ledger history, or economic snapshots.
revoke all on table
  public.player_access_credentials,
  public.player_sessions,
  public.ledger_entries,
  public.country_economic_snapshots
  from public, anon, authenticated;

grant select on table public.player_access_credentials
  to service_role;
grant select, insert, update on table public.player_sessions
  to service_role;
grant select on table
  public.ledger_entries,
  public.country_economic_snapshots
  to service_role;

do $$
begin
  if not has_table_privilege('service_role', 'public.player_access_credentials', 'select') then
    raise exception 'service_role privilege contract failed for player_access_credentials';
  end if;
  if not has_table_privilege('service_role', 'public.player_sessions', 'select,insert,update') then
    raise exception 'service_role privilege contract failed for player_sessions';
  end if;
  if not has_table_privilege('service_role', 'public.ledger_entries', 'select') then
    raise exception 'service_role privilege contract failed for ledger_entries';
  end if;
  if not has_table_privilege('service_role', 'public.country_economic_snapshots', 'select') then
    raise exception 'service_role privilege contract failed for country_economic_snapshots';
  end if;
end;
$$;

comment on table public.player_access_credentials is
  'Hashed Player login credentials. Browser roles have no direct access; the service-owned login route receives select-only verification access.';
comment on table public.player_sessions is
  'Hashed Player session persistence. Browser roles have no direct access; service-owned login, bootstrap, and logout routes manage the session lifecycle.';
comment on table public.ledger_entries is
  'Player financial history remains browser-inaccessible directly. Session-scoped service routes expose bounded ledger projections.';
comment on table public.country_economic_snapshots is
  'Game economic snapshots remain browser-inaccessible directly. Session-scoped service routes expose bounded public country projections.';

notify pgrst, 'reload schema';

commit;
