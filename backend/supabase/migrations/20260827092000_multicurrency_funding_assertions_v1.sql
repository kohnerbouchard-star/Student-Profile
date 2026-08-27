-- Multi-currency purchase-funding C0 install-time assertions V1.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Every game-scoped C0 evidence table participates in the existing canonical
-- resumable purge authority. C0 does not create a second deletion registry.
insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
values
  ('public', 'purchase_funding_quotes'),
  ('public', 'purchase_funding_quote_lines'),
  ('public', 'purchase_funding_receipts')
on conflict (table_schema, table_name) do nothing;

do $assertions$
declare
  v_table text;
  v_oid oid;
  v_definition text;
  v_search_path text;
begin
  foreach v_table in array array[
    'purchase_funding_quotes',
    'purchase_funding_quote_lines',
    'purchase_funding_receipts'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'PURCHASE_FUNDING_TABLE_MISSING:%', v_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class as class_row
      join pg_catalog.pg_namespace as namespace_row
        on namespace_row.oid = class_row.relnamespace
      where namespace_row.nspname = 'public'
        and class_row.relname = v_table
        and class_row.relrowsecurity
        and class_row.relforcerowsecurity
    ) then
      raise exception 'PURCHASE_FUNDING_RLS_NOT_FORCED:%', v_table;
    end if;

    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       or has_table_privilege('anon', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
       or has_table_privilege('service_role', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
    then
      raise exception 'PURCHASE_FUNDING_TABLE_PRIVILEGE_INVALID:%', v_table;
    end if;

    if not has_table_privilege('service_role', 'public.' || v_table, 'SELECT') then
      raise exception 'PURCHASE_FUNDING_SERVICE_READ_MISSING:%', v_table;
    end if;

    if not exists (
      select 1
      from private.game_data_purge_table_registry as registry_row
      where registry_row.table_schema = 'public'
        and registry_row.table_name = v_table
    ) then
      raise exception 'PURCHASE_FUNDING_PURGE_REGISTRY_MISSING:%', v_table;
    end if;
  end loop;

  -- Public quote command is intentionally a thin, service-only staging
  -- boundary. Economic/pricing authority remains in the private core.
  select proc_row.oid, pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_oid, v_definition, v_search_path
  from pg_catalog.pg_proc as proc_row
  join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = proc_row.pronamespace
  where namespace_row.nspname = 'public'
    and proc_row.proname = 'create_purchase_funding_quote_v1'
  order by proc_row.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'PURCHASE_FUNDING_QUOTE_RPC_MISSING';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_oid, 'EXECUTE')
  then
    raise exception 'PURCHASE_FUNDING_QUOTE_RPC_PRIVILEGE_INVALID';
  end if;
  if v_search_path not like '%search_path=pg_catalog, public, private, extensions, pg_temp%'
     or v_definition not like '%drop table if exists pg_temp.purchase_funding_line_stage_v1%'
     or v_definition not like '%private.create_purchase_funding_quote_core_v1%'
  then
    raise exception 'PURCHASE_FUNDING_QUOTE_WRAPPER_CONTRACT_INVALID';
  end if;

  select proc_row.oid, pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_oid, v_definition, v_search_path
  from pg_catalog.pg_proc as proc_row
  join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = proc_row.pronamespace
  where namespace_row.nspname = 'private'
    and proc_row.proname = 'create_purchase_funding_quote_core_v1'
  order by proc_row.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'PURCHASE_FUNDING_QUOTE_CORE_MISSING';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_oid, 'EXECUTE')
  then
    raise exception 'PURCHASE_FUNDING_QUOTE_CORE_EXPOSED';
  end if;
  if v_search_path not like '%search_path=pg_catalog, public, private, extensions, pg_temp%'
     or v_definition not like '%jsonb_array_length(p_allocations) not between 1 and 3%'
     or v_definition not like '%account_row.account_kind = ''checking''%'
     or v_definition not like '%v_customer_rate := (v_reference_rate * 0.99)%'
     or v_definition not like '%private.purchase_funding_ceil_minor_v1%'
     or v_definition not like '%PURCHASE_FUNDING_TOTAL_MISMATCH%'
  then
    raise exception 'PURCHASE_FUNDING_QUOTE_CORE_CONTRACT_INVALID';
  end if;

  select proc_row.oid, pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_oid, v_definition, v_search_path
  from pg_catalog.pg_proc as proc_row
  join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = proc_row.pronamespace
  where namespace_row.nspname = 'private'
    and proc_row.proname = 'compose_purchase_funding_v1'
  order by proc_row.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'PURCHASE_FUNDING_COMPOSER_MISSING';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_oid, 'EXECUTE')
  then
    raise exception 'PURCHASE_FUNDING_COMPOSER_EXPOSED';
  end if;
  if v_search_path not like '%search_path=pg_catalog, public, private, extensions, pg_temp%'
     or v_definition not like '%private.post_bank_transaction_v1%'
     or v_definition not like '%''purchaseFundingAuthority'', ''multicurrency_funding_v1''%'
     or v_definition not like '%''reserveAuthority''%'
     or v_definition not like '%''fx_liquidity_v1''%'
     or v_definition like '%compatibility_offset%'
     or v_definition like '%banking.compatibility-offset%'
  then
    raise exception 'PURCHASE_FUNDING_COMPOSER_CONTRACT_INVALID';
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
    raise exception 'PURCHASE_FUNDING_PURGE_REGISTRY_INCOMPLETE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = 'public'
      and proc_row.proname ~ 'compose_purchase_funding'
  ) then
    raise exception 'PURCHASE_FUNDING_GENERIC_PUBLIC_COMPOSER_FORBIDDEN';
  end if;
end;
$assertions$;

commit;
