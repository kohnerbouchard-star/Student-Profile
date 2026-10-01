-- Supplemental Phase 15 restored-target integrity checks.
--
-- The authoritative all-table data comparison is produced from the exact
-- source and restored data dumps by the deterministic comparator. This file
-- checks canonical relation names, selected counts, and referential invariants
-- after restore. It does not query production and must not be used to replace
-- dump-bound source evidence.

begin transaction isolation level repeatable read read only;

select jsonb_build_object(
  'schemaVersion', 2,
  'recordType', 'restoreIdentity',
  'serverVersion', current_setting('server_version'),
  'migrationCount', (select count(*) from supabase_migrations.schema_migrations),
  'migrationHead', (select max(version) from supabase_migrations.schema_migrations),
  'applicationDataSchemas', jsonb_build_array('public', 'private'),
  'schemaOnlySchemas', jsonb_build_array('economy_private'),
  'economyPrivateTableCount', (
    select count(*)
    from pg_catalog.pg_class as class_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'economy_private'
      and class_row.relkind in ('r', 'p')
  )
)::text;

select jsonb_build_object(
  'schemaVersion', 2,
  'recordType', 'canonicalCounts',
  'gameSessions', (select count(*) from public.game_sessions),
  'players', (select count(*) from public.players),
  'accountBalances', (select count(*) from public.account_balances),
  'ledgerEntries', (select count(*) from public.ledger_entries),
  'inventoryHoldings', (select count(*) from public.inventory_holdings),
  'contractProgress', (select count(*) from public.player_contract_progress),
  'stockHoldings', (select count(*) from public.stock_holdings),
  'stockOrders', (select count(*) from public.stock_orders),
  'notifications', (select count(*) from public.notifications)
)::text;

with integrity as (
  select
    (
      select count(*)
      from public.ledger_entries as ledger_row
      left join public.players as player_row
        on player_row.id = ledger_row.player_id
       and player_row.game_session_id = ledger_row.game_session_id
      where ledger_row.player_id is not null
        and player_row.id is null
    ) as ledger_missing_players,
    (
      select count(*)
      from public.ledger_entries as ledger_row
      left join public.game_sessions as game_row
        on game_row.id = ledger_row.game_session_id
      where game_row.id is null
    ) as ledger_missing_games,
    (
      select count(*)
      from public.account_balances as balance_row
      left join public.players as player_row
        on player_row.id = balance_row.player_id
       and player_row.game_session_id = balance_row.game_session_id
      where player_row.id is null
    ) as balance_missing_players,
    (
      select count(*)
      from public.account_balances as balance_row
      left join public.game_sessions as game_row
        on game_row.id = balance_row.game_session_id
      where game_row.id is null
    ) as balance_missing_games,
    (
      select count(*)
      from public.inventory_holdings as holding_row
      left join public.players as player_row
        on player_row.id = holding_row.player_id
       and player_row.game_session_id = holding_row.game_session_id
      where player_row.id is null
    ) as inventory_missing_players,
    (
      select count(*)
      from public.player_contract_progress as progress_row
      left join public.players as player_row
        on player_row.id = progress_row.player_id
       and player_row.game_session_id = progress_row.game_session_id
      where player_row.id is null
    ) as contract_progress_missing_players,
    (
      select count(*)
      from public.stock_holdings as holding_row
      left join public.players as player_row
        on player_row.id = holding_row.player_id
       and player_row.game_session_id = holding_row.game_session_id
      where player_row.id is null
    ) as stock_holdings_missing_players,
    (
      select count(*)
      from public.stock_orders as order_row
      left join public.players as player_row
        on player_row.id = order_row.player_id
       and player_row.game_session_id = order_row.game_session_id
      where player_row.id is null
    ) as stock_orders_missing_players,
    (
      select count(*)
      from public.notifications as notification_row
      left join public.game_sessions as game_row
        on game_row.id = notification_row.game_session_id
      where game_row.id is null
    ) as notifications_missing_games
)
select jsonb_build_object(
  'schemaVersion', 2,
  'recordType', 'canonicalIntegrity',
  'ledgerMissingPlayers', ledger_missing_players,
  'ledgerMissingGames', ledger_missing_games,
  'balanceMissingPlayers', balance_missing_players,
  'balanceMissingGames', balance_missing_games,
  'inventoryMissingPlayers', inventory_missing_players,
  'contractProgressMissingPlayers', contract_progress_missing_players,
  'stockHoldingsMissingPlayers', stock_holdings_missing_players,
  'stockOrdersMissingPlayers', stock_orders_missing_players,
  'notificationsMissingGames', notifications_missing_games,
  'passed',
    ledger_missing_players = 0
    and ledger_missing_games = 0
    and balance_missing_players = 0
    and balance_missing_games = 0
    and inventory_missing_players = 0
    and contract_progress_missing_players = 0
    and stock_holdings_missing_players = 0
    and stock_orders_missing_players = 0
    and notifications_missing_games = 0
)::text
from integrity;

select jsonb_build_object(
  'schemaVersion', 2,
  'recordType', 'canonicalRelationNames',
  'inventoryHoldingsPresent', to_regclass('public.inventory_holdings') is not null,
  'stockHoldingsPresent', to_regclass('public.stock_holdings') is not null,
  'stockOrdersPresent', to_regclass('public.stock_orders') is not null
)::text;

commit;
