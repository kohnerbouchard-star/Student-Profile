begin;

-- Browser roles remain denied. Authenticated Admin Edge Functions verify the
-- staff session and game ownership, then use the server-owned service client.
revoke all on table
  public.attendance_day_locks,
  public.player_admin_flags,
  public.player_admin_settings,
  public.staff_admin_preferences,
  public.stock_holdings,
  public.stock_orders,
  public.stock_trades,
  public.stock_price_ticks,
  public.stock_market_events
  from public, anon, authenticated;

grant select, insert, update, delete on table
  public.attendance_day_locks,
  public.player_admin_flags,
  public.player_admin_settings,
  public.staff_admin_preferences
  to service_role;

-- Admin market surfaces are read-only. Trading writes continue through the
-- bounded stock execution RPC rather than direct table mutation.
grant select on table
  public.stock_holdings,
  public.stock_orders,
  public.stock_trades,
  public.stock_price_ticks,
  public.stock_market_events
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
  if not has_table_privilege('service_role', 'public.stock_holdings', 'select') then
    raise exception 'service_role privilege contract failed for stock_holdings';
  end if;
  if not has_table_privilege('service_role', 'public.stock_orders', 'select') then
    raise exception 'service_role privilege contract failed for stock_orders';
  end if;
  if not has_table_privilege('service_role', 'public.stock_trades', 'select') then
    raise exception 'service_role privilege contract failed for stock_trades';
  end if;
  if not has_table_privilege('service_role', 'public.stock_price_ticks', 'select') then
    raise exception 'service_role privilege contract failed for stock_price_ticks';
  end if;
  if not has_table_privilege('service_role', 'public.stock_market_events', 'select') then
    raise exception 'service_role privilege contract failed for stock_market_events';
  end if;
end;
$$;

comment on table public.player_admin_flags is
  'Staff-only Player review flags. Browser roles have no direct privileges; authenticated Admin Edge Functions use the service-owned client after game-ownership checks.';
comment on table public.player_admin_settings is
  'Staff-managed Player configuration. Browser roles have no direct privileges; authenticated Admin Edge Functions use the service-owned client after game-ownership checks.';
comment on table public.stock_trades is
  'Stock trade records are not browser-readable directly. Authenticated Admin and Player Edge Functions expose game-scoped projections through server-owned clients.';

notify pgrst, 'reload schema';

commit;
