-- Register Banking/FX game-scoped tables with the canonical resumable purge registry.
-- This migration is deliberately generic so every B1/B2 table carrying the
-- authoritative game_session_id tenancy key is covered without maintaining a
-- second hand-written deletion list.

begin;

insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
select distinct
  column_row.table_schema,
  column_row.table_name
from information_schema.columns as column_row
join information_schema.tables as table_row
  on table_row.table_schema = column_row.table_schema
 and table_row.table_name = column_row.table_name
where column_row.column_name = 'game_session_id'
  and column_row.table_schema in ('public', 'private')
  and table_row.table_type = 'BASE TABLE'
  and column_row.table_name <> 'game_sessions'
  and column_row.table_name not in (
    'game_data_purge_requests',
    'game_data_purge_table_registry'
  )
on conflict (table_schema, table_name) do nothing;

-- Fail closed if a game-owned base table exists outside the purge registry.
do $function$
begin
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
    raise exception 'BANKING_FX_PURGE_REGISTRY_INCOMPLETE'
      using errcode = 'P0001';
  end if;
end;
$function$;

commit;
