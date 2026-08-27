\set ON_ERROR_STOP on

begin;

-- B2 acceptance is intentionally self-contained and rolls back. It verifies the
-- rebuilt schema/ACL boundary before higher-level fixture/concurrency scripts
-- exercise settlement behavior.
do $acceptance$
declare
  v_table text;
  v_routine text;
  v_oid oid;
  v_rls boolean;
  v_force_rls boolean;
  v_definition text;
begin
  foreach v_table in array array[
    'bank_accounts',
    'bank_transactions',
    'bank_account_holds',
    'bank_account_hold_events',
    'fx_liquidity_cap_snapshots',
    'fx_quotes',
    'fx_orders',
    'fx_order_events',
    'fx_settlement_receipts'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'B2_ACCEPTANCE_TABLE_MISSING:%', v_table;
    end if;

    select class_row.relrowsecurity, class_row.relforcerowsecurity
    into v_rls, v_force_rls
    from pg_catalog.pg_class as class_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relname = v_table;

    if not coalesce(v_rls, false) or not coalesce(v_force_rls, false) then
      raise exception 'B2_ACCEPTANCE_RLS_NOT_FORCED:%', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
    then
      raise exception 'B2_ACCEPTANCE_BROWSER_TABLE_PRIVILEGE:%', v_table;
    end if;
  end loop;

  foreach v_routine in array array[
    'list_player_bank_accounts_v1',
    'list_player_bank_activity_v1',
    'get_player_banking_fx_overview_v1',
    'list_player_fx_rate_history_v1',
    'list_player_fx_orders_v1',
    'create_player_fx_quote_v1',
    'submit_player_standard_fx_order_v1',
    'execute_player_instant_fx_v1',
    'cancel_player_standard_fx_order_v1'
  ] loop
    select proc_row.oid
    into v_oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = 'public'
      and proc_row.proname = v_routine
    order by proc_row.oid
    limit 1;

    if v_oid is null then
      raise exception 'B2_ACCEPTANCE_RPC_MISSING:%', v_routine;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
      or has_function_privilege('authenticated', v_oid, 'EXECUTE')
    then
      raise exception 'B2_ACCEPTANCE_BROWSER_RPC_PRIVILEGE:%', v_routine;
    end if;
    if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'B2_ACCEPTANCE_SERVICE_RPC_PRIVILEGE_MISSING:%', v_routine;
    end if;
  end loop;

  foreach v_routine in array array[
    'ensure_bank_account_identity_v1',
    'ensure_player_bank_account_v1',
    'ensure_business_bank_account_identity_v1',
    'post_bank_transaction_v1',
    'create_bank_account_hold_v1',
    'release_bank_account_hold_v1',
    'settle_player_fx_order_v1'
  ] loop
    select proc_row.oid
    into v_oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = 'private'
      and proc_row.proname = v_routine
    order by proc_row.oid
    limit 1;

    if v_oid is null then
      raise exception 'B2_ACCEPTANCE_PRIVATE_ROUTINE_MISSING:%', v_routine;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
      or has_function_privilege('authenticated', v_oid, 'EXECUTE')
      or has_function_privilege('service_role', v_oid, 'EXECUTE')
    then
      raise exception 'B2_ACCEPTANCE_PRIVATE_ROUTINE_EXPOSED:%', v_routine;
    end if;
  end loop;

  if exists (
    select 1
    from public.bank_accounts as account_row
    where account_row.public_key !~ '^bac_[0-9a-f]{32}$'
       or account_row.game_session_id is null
       or account_row.party_id is null
       or account_row.currency_code is null
  ) then
    raise exception 'B2_ACCEPTANCE_ACCOUNT_IDENTITY_INVALID';
  end if;

  select string_agg(pg_get_constraintdef(constraint_row.oid), ' ')
  into v_definition
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.fx_quotes'::regclass;

  if v_definition is null
    or v_definition not like '%spread_rate = 0.005%'
    or v_definition not like '%fee_rate = 0.02%'
  then
    raise exception 'B2_ACCEPTANCE_PRICING_POLICY_CONSTRAINT_MISSING';
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
    raise exception 'B2_ACCEPTANCE_PURGE_REGISTRY_INCOMPLETE';
  end if;
end;
$acceptance$;

rollback;
