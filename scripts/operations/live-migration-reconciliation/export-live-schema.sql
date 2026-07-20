\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Read-only schema export. Run as a role with catalog visibility.
-- Example:
--   psql "$DATABASE_URL" -X -f export-live-schema.sql > live-schema.json

with
user_schemas as (
  select n.oid, n.nspname as schema_name
  from pg_namespace n
  where n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
),
installed_extensions as (
  select e.extname as name, n.nspname as schema_name, e.extversion as version
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
),
tables as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    c.relkind as relation_kind,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced,
    obj_description(c.oid, 'pg_class') as comment
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm')
    and n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
),
columns as (
  select
    cols.table_schema as schema_name,
    cols.table_name,
    cols.ordinal_position,
    cols.column_name,
    cols.data_type,
    cols.udt_schema,
    cols.udt_name,
    cols.is_nullable,
    cols.column_default,
    cols.identity_generation,
    cols.is_generated,
    cols.generation_expression,
    col_description(cls.oid, cols.ordinal_position) as comment
  from information_schema.columns cols
  join pg_namespace ns on ns.nspname = cols.table_schema
  join pg_class cls on cls.relnamespace = ns.oid and cls.relname = cols.table_name
  where cols.table_schema not like 'pg_%'
    and cols.table_schema <> 'information_schema'
),
constraints as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    con.conname as constraint_name,
    con.contype as constraint_type,
    pg_get_constraintdef(con.oid, true) as definition,
    con.convalidated as validated
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
),
indexes as (
  select schemaname as schema_name, tablename as table_name, indexname as index_name, indexdef as definition
  from pg_indexes
  where schemaname not like 'pg_%'
    and schemaname <> 'information_schema'
),
policies as (
  select
    schemaname as schema_name,
    tablename as table_name,
    policyname as policy_name,
    permissive,
    roles,
    cmd as command,
    qual as using_expression,
    with_check as check_expression
  from pg_policies
  where schemaname not like 'pg_%'
    and schemaname <> 'information_schema'
),
table_grants as (
  select table_schema as schema_name, table_name, grantee, privilege_type, is_grantable
  from information_schema.role_table_grants
  where table_schema not like 'pg_%'
    and table_schema <> 'information_schema'
),
routine_grants as (
  select routine_schema as schema_name, routine_name, specific_name, grantee, privilege_type, is_grantable
  from information_schema.role_routine_grants
  where routine_schema not like 'pg_%'
    and routine_schema <> 'information_schema'
),
functions as (
  select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_result(p.oid) as result_type,
    l.lanname as language,
    p.prosecdef as security_definer,
    p.provolatile as volatility,
    pg_get_functiondef(p.oid) as definition,
    obj_description(p.oid, 'pg_proc') as comment
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
),
triggers as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    t.tgname as trigger_name,
    pg_get_triggerdef(t.oid, true) as definition,
    t.tgenabled as enabled_state
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
),
migration_history as (
  select
    version,
    name,
    md5(coalesce(array_to_string(statements, E'\n-- statement boundary --\n'), '')) as live_statement_md5,
    coalesce(array_length(statements, 1), 0) as statement_count,
    created_by,
    idempotency_key,
    coalesce(array_length(rollback, 1), 0) as rollback_statement_count
  from supabase_migrations.schema_migrations
)
select jsonb_pretty(
  jsonb_build_object(
    'format', 'econovaria-supabase-schema-snapshot-v1',
    'captured_at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'server_version', current_setting('server_version'),
    'database_name', current_database(),
    'schemas', (select coalesce(jsonb_agg(jsonb_build_object('name', schema_name) order by schema_name), '[]'::jsonb) from user_schemas),
    'extensions', (select coalesce(jsonb_agg(to_jsonb(installed_extensions) order by name), '[]'::jsonb) from installed_extensions),
    'tables', (select coalesce(jsonb_agg(to_jsonb(tables) order by schema_name, table_name), '[]'::jsonb) from tables),
    'columns', (select coalesce(jsonb_agg(to_jsonb(columns) order by schema_name, table_name, ordinal_position), '[]'::jsonb) from columns),
    'constraints', (select coalesce(jsonb_agg(to_jsonb(constraints) order by schema_name, table_name, constraint_name), '[]'::jsonb) from constraints),
    'indexes', (select coalesce(jsonb_agg(to_jsonb(indexes) order by schema_name, table_name, index_name), '[]'::jsonb) from indexes),
    'policies', (select coalesce(jsonb_agg(to_jsonb(policies) order by schema_name, table_name, policy_name), '[]'::jsonb) from policies),
    'table_grants', (select coalesce(jsonb_agg(to_jsonb(table_grants) order by schema_name, table_name, grantee, privilege_type), '[]'::jsonb) from table_grants),
    'routine_grants', (select coalesce(jsonb_agg(to_jsonb(routine_grants) order by schema_name, routine_name, specific_name, grantee, privilege_type), '[]'::jsonb) from routine_grants),
    'functions', (select coalesce(jsonb_agg(to_jsonb(functions) order by schema_name, function_name, identity_arguments), '[]'::jsonb) from functions),
    'triggers', (select coalesce(jsonb_agg(to_jsonb(triggers) order by schema_name, table_name, trigger_name), '[]'::jsonb) from triggers),
    'migrations', (select coalesce(jsonb_agg(to_jsonb(migration_history) order by version), '[]'::jsonb) from migration_history)
  )
);
