-- C3B retained lifecycle repair: register immutable Stock buy quotes with the
-- canonical resumable game-data purge registry.
--
-- The C3B quote table is game-scoped and was introduced after the C3A purge
-- registration migration. Keep the global B2 purge invariant fail-closed by
-- registering the table explicitly rather than weakening acceptance.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $precondition$
begin
  if to_regclass('private.game_data_purge_table_registry') is null then
    raise exception 'STOCK_BUY_QUOTE_PURGE_REGISTRY_MISSING';
  end if;

  if to_regclass('public.stock_buy_quotes') is null then
    raise exception 'STOCK_BUY_QUOTE_TABLE_MISSING';
  end if;
end
$precondition$;

insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
values (
  'public',
  'stock_buy_quotes'
)
on conflict (table_schema, table_name) do nothing;

do $assertion$
begin
  if not exists (
    select 1
    from private.game_data_purge_table_registry as registry_row
    where registry_row.table_schema = 'public'
      and registry_row.table_name = 'stock_buy_quotes'
  ) then
    raise exception 'STOCK_BUY_QUOTE_PURGE_REGISTRY_INCOMPLETE';
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
    raise exception 'STOCK_BUY_QUOTE_GLOBAL_PURGE_REGISTRY_INCOMPLETE';
  end if;
end
$assertion$;

commit;
