begin;

-- Admin control tables are intentionally inaccessible to browser roles. Admin
-- Edge Functions authenticate the staff user, verify game ownership, and then
-- perform these reads and writes through the server-owned service client.
revoke all on table
  public.attendance_day_locks,
  public.player_admin_flags,
  public.player_admin_settings,
  public.staff_admin_preferences
  from public, anon, authenticated;

grant select, insert, update, delete on table
  public.attendance_day_locks,
  public.player_admin_flags,
  public.player_admin_settings,
  public.staff_admin_preferences
  to service_role;

-- Fail the migration instead of leaving a partially usable Admin runtime.
do $$
begin
  if not has_table_privilege('service_role', 'public.attendance_day_locks', 'select,insert,update,delete') then
    raise exception 'service_role privilege contract failed for attendance_day_locks';
  end if;
  if not has_table_privilege('service_role', 'public.player_admin_flags', 'select,insert,update,delete') then
    raise exception 'service_role privilege contract failed for player_admin_flags';
  end if;
  if not has_table_privilege('service_role', 'public.player_admin_settings', 'select,insert,update,delete') then
    raise exception 'service_role privilege contract failed for player_admin_settings';
  end if;
  if not has_table_privilege('service_role', 'public.staff_admin_preferences', 'select,insert,update,delete') then
    raise exception 'service_role privilege contract failed for staff_admin_preferences';
  end if;
end;
$$;

comment on table public.player_admin_flags is
  'Staff-only Player review flags. Browser roles have no direct privileges; authenticated Admin Edge Functions use the service-owned client after game-ownership checks.';
comment on table public.player_admin_settings is
  'Staff-managed Player configuration. Browser roles have no direct privileges; authenticated Admin Edge Functions use the service-owned client after game-ownership checks.';

notify pgrst, 'reload schema';

commit;
