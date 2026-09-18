-- Phase 14D Market event consumption receipts join the deterministic, child-first game purge.
-- Cursor reconciliation preserves the existing request-bound deletion contract.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $purge_cursor_reconciliation$
begin
  if exists (
    select 1
    from private.game_data_purge_requests as request_row
    where request_row.status not in ('completed', 'cancelled', 'failed')
      and request_row.db_delete_cursor <> 0
  ) then
    raise exception 'GAME_PURGE_CURSOR_RECONCILIATION_REQUIRED'
      using errcode = 'P0001';
  end if;
end;
$purge_cursor_reconciliation$;

truncate table private.game_data_purge_table_registry;
insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
select
  column_row.table_schema,
  column_row.table_name
from information_schema.columns as column_row
where column_row.column_name = 'game_session_id'
  and column_row.table_schema in ('public', 'private')
  and column_row.table_name <> 'game_sessions'
  and not (
    column_row.table_schema = 'private'
    and column_row.table_name = 'game_data_purge_requests'
  )
group by column_row.table_schema, column_row.table_name
order by column_row.table_schema, column_row.table_name;

truncate table private.game_data_purge_delete_order_v1;
insert into private.game_data_purge_delete_order_v1 (
  position,
  table_schema,
  table_name,
  dependency_depth
)
with recursive registry as (
  select
    registry_row.table_schema::text collate "C" as table_schema,
    registry_row.table_name::text collate "C" as table_name
  from private.game_data_purge_table_registry as registry_row
  where not (
    registry_row.table_schema = 'public'
    and registry_row.table_name = 'entitlements'
  )
), edges as (
  select
    child_namespace.nspname::text collate "C" as child_schema,
    child.relname::text collate "C" as child_table,
    parent_namespace.nspname::text collate "C" as parent_schema,
    parent.relname::text collate "C" as parent_table
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as child
    on child.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as child_namespace
    on child_namespace.oid = child.relnamespace
  join pg_catalog.pg_class as parent
    on parent.oid = constraint_row.confrelid
  join pg_catalog.pg_namespace as parent_namespace
    on parent_namespace.oid = parent.relnamespace
  where constraint_row.contype = 'f'
    -- This one cascade is the deliberate cycle break documented above. The
    -- request table has no DELETE guard; every other registered FK remains
    -- child-first so a parent cascade cannot run under the wrong table token.
    and not (
      child_namespace.nspname = 'public'
      and child.relname = 'store_offer_withdrawal_requests'
      and constraint_row.conname =
          'store_offer_withdrawal_requests_offer_id_fkey'
    )
    and exists (
      select 1
      from registry as item
      where item.table_schema = child_namespace.nspname::text collate "C"
        and item.table_name = child.relname::text collate "C"
    )
    and exists (
      select 1
      from registry as item
      where item.table_schema = parent_namespace.nspname::text collate "C"
        and item.table_name = parent.relname::text collate "C"
    )
    and not (
      child_namespace.nspname = parent_namespace.nspname
      and child.relname = parent.relname
    )
), walk(
  root_schema,
  root_table,
  node_schema,
  node_table,
  depth,
  path
) as (
  select
    table_schema,
    table_name,
    table_schema,
    table_name,
    0,
    array[table_schema || '.' || table_name]
  from registry
  union all
  select
    walk.root_schema,
    walk.root_table,
    edge.child_schema,
    edge.child_table,
    walk.depth + 1,
    walk.path || (edge.child_schema || '.' || edge.child_table)
  from walk
  join edges as edge
    on edge.parent_schema = walk.node_schema
   and edge.parent_table = walk.node_table
  where not (edge.child_schema || '.' || edge.child_table) = any (walk.path)
    and walk.depth < 250
), ranked as (
  select
    root_schema as table_schema,
    root_table as table_name,
    max(depth)::integer as dependency_depth
  from walk
  group by root_schema, root_table
), generated as (
  select
    row_number() over (
      order by dependency_depth asc, table_schema, table_name
    )::integer as position,
    table_schema,
    table_name,
    dependency_depth
  from ranked
)
select position, table_schema, table_name, dependency_depth
from generated
order by position;


commit;
