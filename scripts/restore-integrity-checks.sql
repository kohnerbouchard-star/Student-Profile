select
  current_database() as database_name,
  current_setting('server_version') as server_version,
  (select count(*) from supabase_migrations.schema_migrations) as migration_count,
  (select max(version) from supabase_migrations.schema_migrations) as migration_head;

select
  (select count(*) from public.game_sessions) as game_sessions,
  (select count(*) from public.players) as players,
  (select count(*) from public.account_balances) as account_balances,
  (select count(*) from public.ledger_entries) as ledger_entries,
  (select count(*) from public.player_inventory) as inventory_rows,
  (select count(*) from public.player_contract_progress) as contract_progress_rows,
  (select count(*) from public.player_stock_holdings) as stock_holding_rows,
  (select count(*) from public.stock_market_orders) as stock_order_rows,
  (select count(*) from public.notifications) as notifications;

select
  count(*) filter (where l.player_id is not null and p.id is null) as ledger_missing_players,
  count(*) filter (where l.game_session_id is not null and g.id is null) as ledger_missing_games
from public.ledger_entries l
left join public.players p on p.id = l.player_id
left join public.game_sessions g on g.id = l.game_session_id;

select
  count(*) filter (where b.player_id is not null and p.id is null) as balance_missing_players,
  count(*) filter (where b.game_session_id is not null and g.id is null) as balance_missing_games
from public.account_balances b
left join public.players p on p.id = b.player_id
left join public.game_sessions g on g.id = b.game_session_id;
