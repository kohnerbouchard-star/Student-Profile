-- Econovaria Business V2 Phase 10A.4C3A: register the new Stock Market
-- liquidity-account binding with the canonical resumable game purge registry.
--
-- B2 populated the registry before C3A introduced this game-scoped table. The
-- new table must therefore be registered explicitly; the global B2 invariant
-- remains fail-closed and is not weakened.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $precondition$
begin
  if to_regclass('private.game_data_purge_table_registry') is null then
    raise exception 'STOCK_FUNDING_PURGE_REGISTRY_MISSING';
  end if;

  if to_regclass('public.stock_market_liquidity_accounts') is null then
    raise exception 'STOCK_MARKET_LIQUIDITY_ACCOUNT_TABLE_MISSING';
  end if;
end
$precondition$;

insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
values (
  'public',
  'stock_market_liquidity_accounts'
)
on conflict (table_schema, table_name) do nothing;

do $assertion$
begin
  if not exists (
    select 1
    from private.game_data_purge_table_registry as registry_row
    where registry_row.table_schema = 'public'
      and registry_row.table_name = 'stock_market_liquidity_accounts'
  ) then
    raise exception 'STOCK_FUNDING_PURGE_REGISTRY_INCOMPLETE';
  end if;

  if exists (
    select 1
    from information_schema.columns as column_row
    join information_schema.tables as table_row
      on table_row.table_schema = column_row.table_schema
     and table_row.table_name = column_row.table_name
    left join private.game_data_purge_table_registry as registry_row
      on registry_row.table_schema = column_row.table_schema
     and registry_row.table_name = column_row.table_name
    where column_row.column_name = 'game_session_id'
      and column_row.table_schema in ('public', 'private')
      and table_row.table_type = 'BASE TABLE'
      and column_row.table_name <> 'game_sessions'
      and column_row.table_name not in (
        'game_data_purge_requests',
        'game_data_purge_table_registry'
      )
      and registry_row.table_name is null
  ) then
    raise exception 'STOCK_FUNDING_GLOBAL_PURGE_REGISTRY_INCOMPLETE';
  end if;
end
$assertion$;

commit;
