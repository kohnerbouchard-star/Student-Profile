begin;

-- Staff signup and bootstrap run through service-owned Edge Functions. PostgREST
-- still requires explicit table privileges even though service_role bypasses RLS.
-- Browser roles remain unable to read or mutate administrator identities.
revoke all on table public.staff_users from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_users to service_role;

-- Authenticated Admin routes resolve ownership server-side and assemble their
-- general dashboard, Players, Store, inventory, Contract, and attendance
-- projections through the service client. Market and Admin-control tables are
-- owned by the subsequent bounded Admin-control privilege migration.
grant select on table
  public.game_sessions,
  public.players,
  public.country_profiles,
  public.store_items,
  public.store_purchases,
  public.player_country_assignments,
  public.account_balances,
  public.game_session_stock_assets,
  public.player_sessions,
  public.inventory_holdings,
  public.game_session_contracts,
  public.player_contract_progress,
  public.player_attendance_records
  to service_role;

comment on table public.staff_users is
  'Administrator identity projection. Browser roles have no direct access; service-owned authentication routes receive explicit persistence privileges.';

commit;
