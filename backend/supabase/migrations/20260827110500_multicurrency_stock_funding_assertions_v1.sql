-- C3A structural assertions for Stock listing currency, evidence families,
-- and canonical market-liquidity identity.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Every template and runtime asset must resolve to the one active canonical
-- currency of its official issuer country.
do $assert_stock_listing_currency$
begin
  if exists (
    select 1
    from public.stock_templates as template_row
    join public.country_profiles as profile_row
      on profile_row.country_code = template_row.country_code
     and profile_row.status = 'active'
    join public.currencies as currency_row
      on currency_row.code = profile_row.currency_code
     and currency_row.status = 'active'
    where template_row.listing_currency_code <> profile_row.currency_code
  ) or exists (
    select 1
    from public.stock_templates as template_row
    where not exists (
      select 1
      from public.country_profiles as profile_row
      join public.currencies as currency_row
        on currency_row.code = profile_row.currency_code
       and currency_row.status = 'active'
      where profile_row.country_code = template_row.country_code
        and profile_row.status = 'active'
        and profile_row.currency_code = template_row.listing_currency_code
    )
  ) then
    raise exception 'C3A_STOCK_TEMPLATE_LISTING_CURRENCY_INVALID';
  end if;

  if exists (
    select 1
    from public.game_session_stock_assets as asset_row
    where not exists (
      select 1
      from public.country_profiles as profile_row
      join public.currencies as currency_row
        on currency_row.code = profile_row.currency_code
       and currency_row.status = 'active'
      where profile_row.country_code = asset_row.country_code
        and profile_row.status = 'active'
        and profile_row.currency_code = asset_row.listing_currency_code
    )
  ) then
    raise exception 'C3A_RUNTIME_STOCK_LISTING_CURRENCY_INVALID';
  end if;

  if exists (
    select 1
    from public.game_session_stock_assets as asset_row
    join public.stock_templates as template_row
      on template_row.id = asset_row.template_id
    where asset_row.country_code <> template_row.country_code
       or asset_row.listing_currency_code <> template_row.listing_currency_code
  ) then
    raise exception 'C3A_RUNTIME_TEMPLATE_CURRENCY_DRIFT';
  end if;
end;
$assert_stock_listing_currency$;

-- Existing holding/order/trade rows must be coherently backfilled while keeping
-- their historical monetary evidence family intact.
do $assert_stock_evidence_backfill$
begin
  if exists (
    select 1
    from public.stock_holdings as holding_row
    join public.game_session_stock_assets as asset_row
      on asset_row.id = holding_row.stock_asset_id
     and asset_row.game_session_id = holding_row.game_session_id
    where holding_row.cost_currency_code <> asset_row.listing_currency_code
  ) then
    raise exception 'C3A_HOLDING_COST_CURRENCY_INVALID';
  end if;

  if exists (
    select 1
    from public.stock_orders as order_row
    join public.game_session_stock_assets as asset_row
      on asset_row.id = order_row.stock_asset_id
     and asset_row.game_session_id = order_row.game_session_id
    where order_row.listing_currency_code <> asset_row.listing_currency_code
       or order_row.settlement_evidence_family <> 'legacy'
       or order_row.price_tick_index is not null
       or order_row.funding_quote_id is not null
       or order_row.funding_receipt_id is not null
       or order_row.funding_bank_transaction_id is not null
       or order_row.market_liquidity_account_id is not null
       or order_row.destination_bank_account_id is not null
       or order_row.settlement_bank_transaction_id is not null
  ) then
    raise exception 'C3A_LEGACY_ORDER_BACKFILL_INVALID';
  end if;

  if exists (
    select 1
    from public.stock_trades as trade_row
    join public.stock_orders as order_row
      on order_row.id = trade_row.order_id
     and order_row.game_session_id = trade_row.game_session_id
    where trade_row.listing_currency_code <> order_row.listing_currency_code
       or trade_row.settlement_evidence_family <> order_row.settlement_evidence_family
       or trade_row.price_tick_index is distinct from order_row.price_tick_index
  ) then
    raise exception 'C3A_TRADE_EVIDENCE_BACKFILL_INVALID';
  end if;
end;
$assert_stock_evidence_backfill$;

-- Required columns must be present and non-null where C3A promises a complete
-- currency identity.
do $assert_stock_columns$
declare
  v_required record;
begin
  for v_required in
    select *
    from (values
      ('stock_templates', 'listing_currency_code'),
      ('game_session_stock_assets', 'listing_currency_code'),
      ('stock_holdings', 'cost_currency_code'),
      ('stock_orders', 'listing_currency_code'),
      ('stock_orders', 'settlement_evidence_family'),
      ('stock_trades', 'listing_currency_code'),
      ('stock_trades', 'settlement_evidence_family')
    ) as required(table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute as attribute_row
      join pg_catalog.pg_class as relation_row
        on relation_row.oid = attribute_row.attrelid
      join pg_catalog.pg_namespace as namespace_row
        on namespace_row.oid = relation_row.relnamespace
      where namespace_row.nspname = 'public'
        and relation_row.relname = v_required.table_name
        and attribute_row.attname = v_required.column_name
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
        and attribute_row.attnotnull
    ) then
      raise exception 'C3A_REQUIRED_COLUMN_INVALID: %.%',
        v_required.table_name,
        v_required.column_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_row
    join pg_catalog.pg_class as relation_row
      on relation_row.oid = attribute_row.attrelid
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public'
      and relation_row.relname = 'stock_orders'
      and attribute_row.attname = 'cash_balance_after'
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
      and not attribute_row.attnotnull
  ) then
    raise exception 'C3A_STOCK_ORDER_LEGACY_BALANCE_NOT_NULLABLE';
  end if;
end;
$assert_stock_columns$;

-- Every C3A constraint must exist and be validated.
do $assert_stock_constraints$
declare
  v_constraint_name text;
begin
  foreach v_constraint_name in array array[
    'stock_templates_listing_currency_fk',
    'stock_templates_listing_currency_format',
    'game_session_stock_assets_listing_currency_fk',
    'game_session_stock_assets_listing_currency_format',
    'stock_holdings_cost_currency_fk',
    'stock_orders_listing_currency_fk',
    'stock_orders_funding_quote_scope_fk',
    'stock_orders_funding_receipt_scope_fk',
    'stock_orders_funding_transaction_scope_fk',
    'stock_orders_market_liquidity_account_scope_fk',
    'stock_orders_destination_account_scope_fk',
    'stock_orders_settlement_transaction_scope_fk',
    'stock_orders_settlement_evidence_family_check',
    'stock_orders_settlement_evidence_shape_check',
    'stock_trades_listing_currency_fk',
    'stock_trades_settlement_evidence_family_check',
    'stock_trades_settlement_evidence_shape_check',
    'stock_market_liquidity_accounts_account_scope_fk',
    'stock_market_liquidity_accounts_game_currency_unique',
    'stock_market_liquidity_accounts_bank_account_unique'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conname = v_constraint_name
        and constraint_row.convalidated
    ) then
      raise exception 'C3A_REQUIRED_CONSTRAINT_INVALID: %', v_constraint_name;
    end if;
  end loop;
end;
$assert_stock_constraints$;

-- C3A may not widen the execution model. Immediate market fills remain the
-- only live Stock order model until a separately scoped project exists.
do $assert_immediate_fill_model$
declare
  v_order_type_definition text;
  v_order_status_definition text;
begin
  select pg_get_constraintdef(constraint_row.oid, true)
  into v_order_type_definition
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.stock_orders'::regclass
    and constraint_row.conname = 'stock_orders_type_check';

  select pg_get_constraintdef(constraint_row.oid, true)
  into v_order_status_definition
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.stock_orders'::regclass
    and constraint_row.conname = 'stock_orders_status_check';

  if v_order_type_definition is null
     or v_order_type_definition !~* '''market'''
     or v_order_type_definition ~* '''limit''|''stop'''
  then
    raise exception 'C3A_ORDER_TYPE_MODEL_WIDENED';
  end if;

  if v_order_status_definition is null
     or v_order_status_definition !~* '''filled'''
     or v_order_status_definition !~* '''rejected'''
     or v_order_status_definition ~* '''open''|''partial''|''queued''|''pending'''
  then
    raise exception 'C3A_ORDER_STATUS_MODEL_WIDENED';
  end if;

  if to_regprocedure(
    'public.execute_stock_market_order(uuid,uuid,uuid,text,numeric,text)'
  ) is null then
    raise exception 'C3A_LEGACY_STOCK_EXECUTION_MISSING';
  end if;

  if to_regprocedure(
    'public.execute_stock_market_order_calendar_gated(uuid,uuid,uuid,text,numeric,text)'
  ) is null then
    raise exception 'C3A_CALENDAR_GATED_EXECUTION_MISSING';
  end if;
end;
$assert_immediate_fill_model$;

-- The new liquidity binding is identity-only. It cannot be used as a hidden
-- monetary faucet and remains inaccessible to browser roles.
do $assert_liquidity_identity_boundary$
declare
  v_initializer_definition text;
  v_ensure_definition text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public'
      and relation_row.relname = 'stock_market_liquidity_accounts'
      and relation_row.relkind = 'r'
      and relation_row.relrowsecurity
      and relation_row.relforcerowsecurity
  ) then
    raise exception 'C3A_LIQUIDITY_BINDING_RLS_INVALID';
  end if;

  if has_table_privilege(
    'anon',
    'public.stock_market_liquidity_accounts',
    'SELECT,INSERT,UPDATE,DELETE'
  ) or has_table_privilege(
    'authenticated',
    'public.stock_market_liquidity_accounts',
    'SELECT,INSERT,UPDATE,DELETE'
  ) or has_table_privilege(
    'service_role',
    'public.stock_market_liquidity_accounts',
    'INSERT,UPDATE,DELETE'
  ) then
    raise exception 'C3A_LIQUIDITY_BINDING_PRIVILEGE_INVALID';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.stock_market_liquidity_accounts',
    'SELECT'
  ) then
    raise exception 'C3A_LIQUIDITY_BINDING_SERVICE_READ_MISSING';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.initialize_stock_market_liquidity_accounts_v1(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.initialize_stock_market_liquidity_accounts_v1(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.initialize_stock_market_liquidity_accounts_v1(uuid)',
    'EXECUTE'
  ) then
    raise exception 'C3A_LIQUIDITY_INITIALIZER_PRIVILEGE_INVALID';
  end if;

  select lower(pg_get_functiondef(to_regprocedure(
    'public.initialize_stock_market_liquidity_accounts_v1(uuid)'
  ))) into v_initializer_definition;

  select lower(pg_get_functiondef(to_regprocedure(
    'private.ensure_stock_market_liquidity_account_v1(uuid,text)'
  ))) into v_ensure_definition;

  if v_initializer_definition is null or v_ensure_definition is null then
    raise exception 'C3A_LIQUIDITY_IDENTITY_FUNCTION_MISSING';
  end if;

  if concat(v_initializer_definition, E'\n', v_ensure_definition) ~
    '(insert[[:space:]]+into[[:space:]]+public[.]ledger_entries|update[[:space:]]+public[.]account_balances|record_player_ledger_entry|post_bank_transaction|record_business_ledger_entry)'
  then
    raise exception 'C3A_LIQUIDITY_INITIALIZER_MUTATES_MONEY';
  end if;
end;
$assert_liquidity_identity_boundary$;

-- All guards required to keep currencies and evidence immutable must exist.
do $assert_stock_triggers$
declare
  v_trigger_name text;
begin
  foreach v_trigger_name in array array[
    'guard_stock_template_listing_currency_v1',
    'guard_runtime_stock_listing_currency_v1',
    'guard_stock_holding_cost_currency_v1',
    'guard_stock_order_currency_evidence_v1',
    'guard_stock_trade_currency_evidence_v1',
    'guard_stock_market_liquidity_binding_immutable'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_row
      where trigger_row.tgname = v_trigger_name
        and not trigger_row.tgisinternal
    ) then
      raise exception 'C3A_REQUIRED_TRIGGER_MISSING: %', v_trigger_name;
    end if;
  end loop;
end;
$assert_stock_triggers$;

commit;
