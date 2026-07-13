begin;

-- These helpers are evaluated under authenticated RLS policies. They do not
-- need owner privileges because the underlying tables already expose only the
-- caller's permitted rows.
alter function public.current_staff_user_id()
  security invoker;

alter function public.is_game_owner(uuid)
  security invoker;

-- Pin deterministic helper/trigger lookup paths.
alter function public.set_current_timestamp_updated_at()
  set search_path = pg_catalog, public;

alter function public.apply_economy_gradual_adjustment(numeric, numeric)
  set search_path = pg_catalog, public;

-- Server-mediated business and trigger functions must not be directly
-- executable through the anon or authenticated Data API roles.
revoke execute on function public.apply_stock_market_runner_tick(uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.create_player_with_balanced_country_assignment(uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ensure_stock_order_active_player_session()
  from public, anon, authenticated;
revoke execute on function public.execute_stock_market_order(uuid, uuid, uuid, text, numeric, text)
  from public, anon, authenticated;
revoke execute on function public.initialize_country_economic_snapshots_for_game(uuid, timestamptz, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.initialize_stock_market_assets_for_game(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.purchase_quoted_store_item(uuid, uuid, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke execute on function public.read_latest_stock_market_ticks_for_game(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.record_player_attendance_clock_in(uuid, uuid, date, text, numeric, text, text)
  from public, anon, authenticated;
revoke execute on function public.record_player_ledger_entry(uuid, uuid, text, numeric, text, text, text, text, uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.seed_initial_player_balances(uuid, numeric, text, text, uuid, text, text)
  from public, anon, authenticated;

-- RLS helpers remain callable by signed-in users, but not anonymously.
revoke execute on function public.current_staff_user_id()
  from public, anon;
revoke execute on function public.is_game_owner(uuid)
  from public, anon;

grant execute on function public.current_staff_user_id()
  to authenticated, service_role;
grant execute on function public.is_game_owner(uuid)
  to authenticated, service_role;

-- Edge Functions call the business RPCs with the service-role client.
grant execute on function public.apply_stock_market_runner_tick(uuid, integer, jsonb, jsonb)
  to service_role;
grant execute on function public.create_player_with_balanced_country_assignment(uuid, text, text, jsonb)
  to service_role;
grant execute on function public.ensure_stock_order_active_player_session()
  to service_role;
grant execute on function public.execute_stock_market_order(uuid, uuid, uuid, text, numeric, text)
  to service_role;
grant execute on function public.initialize_country_economic_snapshots_for_game(uuid, timestamptz, text, jsonb)
  to service_role;
grant execute on function public.initialize_stock_market_assets_for_game(uuid, text)
  to service_role;
grant execute on function public.purchase_quoted_store_item(uuid, uuid, uuid, text, timestamptz, jsonb)
  to service_role;
grant execute on function public.read_latest_stock_market_ticks_for_game(uuid, text)
  to service_role;
grant execute on function public.record_player_attendance_clock_in(uuid, uuid, date, text, numeric, text, text)
  to service_role;
grant execute on function public.record_player_ledger_entry(uuid, uuid, text, numeric, text, text, text, text, uuid, text, uuid, jsonb)
  to service_role;
grant execute on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb)
  to service_role;
grant execute on function public.seed_initial_player_balances(uuid, numeric, text, text, uuid, text, text)
  to service_role;

commit;
