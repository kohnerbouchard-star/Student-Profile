-- Created with Supabase CLI as 20260831000254, then moved to the reserved C4 timestamp.

-- Business multi-currency treasury, funding, and atomic procurement assertions V1.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $assertions$
declare
  v_table text;
  v_constraint text;
  v_trigger text;
  v_signature text;
  v_oid oid;
  v_security_definer boolean;
  v_immutable boolean;
  v_strict boolean;
  v_definition text;
  v_search_path text;
  v_expected_formatter_count integer;
  v_formatter_count integer;
begin
  foreach v_table in array array[
    'fx_quotes',
    'fx_orders',
    'purchase_funding_quotes',
    'purchase_funding_quote_lines',
    'purchase_funding_receipts',
    'business_store_purchase_quotes',
    'business_store_purchases'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'C4_ASSERT_TABLE_MISSING:%', v_table;
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
      raise exception 'C4_ASSERT_RLS_NOT_FORCED:%', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege(
         'authenticated', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE'
       )
    then
      raise exception 'C4_ASSERT_BROWSER_TABLE_PRIVILEGE:%', v_table;
    end if;
  end loop;

  foreach v_constraint in array array[
    'fx_quotes_exactly_one_owner_check',
    'fx_orders_exactly_one_owner_check',
    'purchase_funding_quotes_exactly_one_owner_check',
    'purchase_funding_receipts_exactly_one_owner_check',
    'business_store_quotes_funding_family_check',
    'business_store_purchases_completed_state_valid'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conname = v_constraint
        and constraint_row.convalidated
    ) then
      raise exception 'C4_ASSERT_CONSTRAINT_MISSING_OR_UNVALIDATED:%',
        v_constraint;
    end if;
  end loop;

  foreach v_trigger in array array[
    'guard_fx_quotes_immutable',
    'guard_fx_orders_immutable',
    'guard_purchase_funding_quotes_immutable',
    'guard_purchase_funding_receipts_immutable',
    'apply_fx_quote_owner_context_v1',
    'apply_fx_order_owner_context_v1',
    'apply_purchase_funding_quote_owner_context_v1',
    'apply_purchase_funding_receipt_owner_context_v1',
    'guard_business_store_quote_evidence',
    'guard_business_store_purchase_evidence'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_row
      where trigger_row.tgname = v_trigger
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled = 'O'
    ) then
      raise exception 'C4_ASSERT_TRIGGER_NOT_ENABLED:%', v_trigger;
    end if;
  end loop;

  if exists (
    select 1 from public.fx_quotes
    where (player_id is null) = (business_id is null)
       or created_by_player_id is null
  ) or exists (
    select 1 from public.fx_orders
    where (player_id is null) = (business_id is null)
       or created_by_player_id is null
  ) or exists (
    select 1 from public.purchase_funding_quotes
    where (player_id is null) = (business_id is null)
       or created_by_player_id is null
  ) or exists (
    select 1 from public.purchase_funding_receipts
    where (player_id is null) = (business_id is null)
       or created_by_player_id is null
  ) then
    raise exception 'C4_ASSERT_OWNER_FAMILY_DATA_INVALID';
  end if;

  if exists (
    select 1
    from public.fx_quotes as evidence_row
    join public.business_entities as business_row
      on business_row.id = evidence_row.business_id
     and business_row.game_session_id = evidence_row.game_session_id
    where evidence_row.business_id is not null
      and not private.business_controller_matches_request_v1(
        evidence_row.game_session_id,
        evidence_row.business_id,
        evidence_row.created_by_player_id
      )
  ) or exists (
    select 1
    from public.fx_orders as evidence_row
    join public.business_entities as business_row
      on business_row.id = evidence_row.business_id
     and business_row.game_session_id = evidence_row.game_session_id
    where evidence_row.business_id is not null
      and not private.business_controller_matches_request_v1(
        evidence_row.game_session_id,
        evidence_row.business_id,
        evidence_row.created_by_player_id
      )
  ) or exists (
    select 1
    from public.purchase_funding_quotes as evidence_row
    join public.business_entities as business_row
      on business_row.id = evidence_row.business_id
     and business_row.game_session_id = evidence_row.game_session_id
    where evidence_row.business_id is not null
      and not private.business_controller_matches_request_v1(
        evidence_row.game_session_id,
        evidence_row.business_id,
        evidence_row.created_by_player_id
      )
  ) or exists (
    select 1
    from public.purchase_funding_receipts as evidence_row
    join public.business_entities as business_row
      on business_row.id = evidence_row.business_id
     and business_row.game_session_id = evidence_row.game_session_id
    where evidence_row.business_id is not null
      and not private.business_controller_matches_request_v1(
        evidence_row.game_session_id,
        evidence_row.business_id,
        evidence_row.created_by_player_id
      )
  ) then
    raise exception 'C4_ASSERT_BUSINESS_CONTROLLER_MISMATCH';
  end if;

  if exists (
    select 1
    from public.business_store_purchase_quotes as quote_row
    where (
      quote_row.funding_quote_id is null
      or quote_row.funding_context_hash is null
      or quote_row.target_bank_account_id is null
      or quote_row.funding_idempotency_key is null
      or quote_row.funding_allocations is null
    ) and not (
      quote_row.funding_quote_id is null
      and quote_row.funding_context_hash is null
      and quote_row.target_bank_account_id is null
      and quote_row.funding_idempotency_key is null
      and quote_row.funding_allocations is null
    )
  ) then
    raise exception 'C4_ASSERT_STORE_QUOTE_PARTIAL_BINDING';
  end if;

  if exists (
    select 1
    from public.business_store_purchases as purchase_row
    where purchase_row.status = 'COMPLETED'
      and (
        (purchase_row.ledger_entry_id is not null)::integer
        + (purchase_row.funding_receipt_id is not null)::integer
      ) <> 1
  ) then
    raise exception 'C4_ASSERT_STORE_PURCHASE_PAYMENT_FAMILY_INVALID';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes as index_row
    where index_row.schemaname = 'public'
      and index_row.indexname =
        'purchase_funding_receipts_player_idempotency_unique'
      and index_row.indexdef not like '%player_id, source_domain%'
      and index_row.indexdef like
        '%game_session_id, source_domain, source_action, idempotency_key%'
      and index_row.indexdef like '%WHERE (player_id IS NOT NULL)%'
  ) then
    raise exception 'C4_ASSERT_PLAYER_RECEIPT_GLOBAL_IDEMPOTENCY_LOST';
  end if;

  foreach v_signature in array array[
    'public.list_player_business_bank_accounts_v1(uuid,uuid)',
    'public.ensure_business_banking_account_v1(uuid,uuid,text,text)',
    'public.create_business_fx_quote_v1(uuid,uuid,text,text,numeric,text,text,text)',
    'public.submit_business_standard_fx_order_v1(uuid,uuid,text,text)',
    'public.execute_business_instant_fx_v1(uuid,uuid,text,text)',
    'public.cancel_business_standard_fx_order_v1(uuid,uuid,text,text)',
    'public.list_business_fx_orders_v1(uuid,uuid,integer)',
    'public.get_business_treasury_overview_v1(uuid,uuid)',
    'public.create_business_purchase_funding_quote_v1(uuid,uuid,text,numeric,text,text,text,jsonb,text)',
    'public.create_business_store_quote_v2(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)',
    'public.create_business_store_quote_v2(uuid,uuid,text,integer,text,timestamp with time zone)',
    'public.purchase_business_store_quote_v2(uuid,uuid,text,text,timestamp with time zone,jsonb)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'C4_ASSERT_PUBLIC_FUNCTION_MISSING:%', v_signature;
    end if;
    select proc_row.prosecdef,
      coalesce(array_to_string(proc_row.proconfig, ','), '')
    into strict v_security_definer, v_search_path
    from pg_catalog.pg_proc as proc_row
    where proc_row.oid = v_oid;
    if not v_security_definer
       or v_search_path not like '%search_path=pg_catalog%'
       or v_search_path not like '%pg_temp%'
    then
      raise exception 'C4_ASSERT_PUBLIC_FUNCTION_SECURITY:%', v_signature;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_oid, 'EXECUTE')
    then
      raise exception 'C4_ASSERT_PUBLIC_FUNCTION_GRANT:%', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'private.currency_amount_text_v1(numeric,integer)',
    'private.current_business_owner_context_v1()',
    'private.business_controller_matches_request_v1(uuid,uuid,uuid)',
    'private.bank_party_matches_request_owner_v1(uuid,uuid,text,uuid,uuid)',
    'private.evidence_matches_request_owner_v1(uuid,uuid,uuid,uuid)',
    'private.ensure_active_business_checking_account_v1(uuid,uuid,text)',
    'private.ensure_active_system_checking_account_v1(uuid,text,text)',
    'private.ensure_request_owner_fx_checking_account_v1(uuid,uuid,text)',
    'private.compose_business_purchase_funding_v1(uuid,uuid,uuid,text,text,text,text,uuid,text,text,uuid,text,timestamp with time zone)',
    'private.business_store_funding_context_hash_v1(uuid,uuid)',
    'private.business_store_procurement_public_json_v1(uuid)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'C4_ASSERT_PRIVATE_FUNCTION_MISSING:%', v_signature;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_oid, 'EXECUTE')
    then
      raise exception 'C4_ASSERT_PRIVATE_FUNCTION_EXPOSED:%', v_signature;
    end if;
  end loop;

  v_oid := 'private.ensure_active_system_checking_account_v1(uuid,text,text)'::regprocedure;
  select proc_row.prosecdef,
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into strict v_security_definer, v_search_path
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid = v_oid;
  v_definition := pg_get_functiondef(v_oid);
  if not v_security_definer
     or v_search_path not like '%search_path=pg_catalog%'
     or v_search_path not like '%pg_temp%'
     or v_definition not like '%on conflict%do nothing%'
     or v_definition not like '%v_party_status <> ''active''%'
     or v_definition not like '%v_account_status <> ''active''%'
     or v_definition not like '%ensure_bank_account_identity_v1%'
     or v_definition like '%do update set%status = ''active''%'
  then
    raise exception 'C4_ASSERT_SYSTEM_CHECKING_HELPER_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'private.business_controller_matches_request_v1(uuid,uuid,uuid)'::regprocedure
  );
  if v_definition not ilike '%business_ownership_positions%'
     or v_definition not ilike '%ownership_model_version = 1%'
     or v_definition not ilike '%ended_at is null%'
  then
    raise exception 'C4_ASSERT_BUSINESS_CONTROLLER_AUTHORITY_INVALID';
  end if;

  if private.currency_amount_text_v1(42.000, 0) <> '42'
     or private.currency_amount_text_v1(12.3400, 3) <> '12.34'
     or private.currency_amount_text_v1(12.3456, 3) <> '12.346'
     or private.currency_amount_text_v1(
       0.1234567890123456789, 18
     ) <> '0.123456789012345679'
     or private.currency_amount_text_v1(
       7.230000000000000000, 18
     ) <> '7.23'
     or private.currency_amount_text_v1(0.000000000000000000, 18) <> '0'
  then
    raise exception 'C4_ASSERT_CURRENCY_AMOUNT_FORMATTER_INVALID';
  end if;

  select proc_row.provolatile = 'i', proc_row.proisstrict,
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into strict v_immutable, v_strict, v_search_path
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'private.currency_amount_text_v1(numeric,integer)'::regprocedure;

  if not v_immutable
     or not v_strict
     or v_search_path not like '%search_path=pg_catalog%'
     or v_search_path not like '%pg_temp%'
  then
    raise exception 'C4_ASSERT_CURRENCY_AMOUNT_FORMATTER_SECURITY_INVALID';
  end if;

  for v_signature, v_expected_formatter_count in
    select * from (values
      ('private.business_bank_account_public_json_v1(uuid)', 3),
      ('private.fx_quote_public_json_v1(uuid)', 3),
      ('private.fx_order_public_json_v1(uuid)', 3),
      ('private.fx_settlement_receipt_public_json_v1(uuid)', 5),
      ('private.purchase_funding_quote_public_json_v1(uuid)', 6),
      ('private.purchase_funding_receipt_public_json_v1(uuid)', 4),
      ('private.business_store_funded_quote_public_json_v1(uuid)', 5),
      ('private.business_store_procurement_public_json_v1(uuid)', 3)
    ) as formatter_contract(signature, expected_count)
  loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_formatter_count := (
      length(v_definition) - length(replace(
        v_definition, 'currency_amount_text_v1', ''
      ))
    ) / length('currency_amount_text_v1');
    if v_formatter_count <> v_expected_formatter_count then
      raise exception 'C4_ASSERT_PUBLIC_MONEY_FORMATTER_COUNT:%:%:%',
        v_signature, v_formatter_count, v_expected_formatter_count;
    end if;
  end loop;

  v_definition := pg_get_functiondef(
    'private.create_purchase_funding_quote_core_v1(uuid,uuid,text,numeric,text,text,text,jsonb,text)'::regprocedure
  );
  if v_definition not like '%current_business_owner_context_v1%'
     or v_definition not like '%bank_party_matches_request_owner_v1%'
     or v_definition not like '%evidence_matches_request_owner_v1%'
     or v_definition not like '%business-purchase-funding-quote-v1%'
     or v_definition not like '%legacy_account_type is null%'
     or v_definition not like '%when private.current_business_owner_context_v1() is null%'
  then
    raise exception 'C4_ASSERT_SHARED_FUNDING_QUOTE_CORE_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'private.compose_purchase_funding_v1(uuid,uuid,text,text,text,text,uuid,text,text,uuid,text,text,uuid,timestamp with time zone)'::regprocedure
  );
  if v_definition not like '%purchase-funding-compose-v1%'
     or v_definition not like '%player-global%'
     or v_definition not like '%business-purchase-funding-receipt-v1%'
     or v_definition not like '%receipt_row.player_id is not null%'
     or v_definition not like '%private.post_bank_transaction_v1%'
     or v_definition like '%record_business_ledger_entry_v2%'
  then
    raise exception 'C4_ASSERT_SHARED_FUNDING_COMPOSER_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.create_business_store_quote_v2(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)'::regprocedure
  );
  if v_definition not like '%PURCHASE_FUNDING_REMAINDER_INVALID%'
     or v_definition not like '%^[0-9]{1,20}([.][0-9]{1,18})?$%'
     or v_definition not like '%::numeric <= 0%'
     or v_definition not like
       '%v_settlement_total := v_settlement_unit * p_quantity%'
     or v_definition not like '%v_remainder::text%'
     or v_definition not like '%business.store-procurement%'
     or v_definition not like '%funding_allocations%'
     or v_definition like '%create_business_store_commercial_quote_v2%'
     or v_definition like '%update public.business_store_purchase_quotes%'
  then
    raise exception 'C4_ASSERT_FUNDED_STORE_QUOTE_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.create_business_purchase_funding_quote_v1(uuid,uuid,text,numeric,text,text,text,jsonb,text)'::regprocedure
  );
  if v_definition not like '%^[0-9]{1,20}([.][0-9]{1,18})?$%'
     or v_definition not like '%::numeric <= 0%'
     or v_definition not like '%resolve_player_business_v2%'
  then
    raise exception 'C4_ASSERT_BUSINESS_FUNDING_INPUT_BOUNDARY_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.purchase_business_store_quote_v2(uuid,uuid,text,text,timestamp with time zone,jsonb)'::regprocedure
  );
  if v_definition not like '%BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED%'
     or v_definition not like '%compose_business_purchase_funding_v1%'
     or v_definition not like '%''business'',%''store-procurement''%'
     or v_definition not like '%post_inventory_transaction_v2%'
     or v_definition not like '%stock_quantity = stock_quantity -%'
     or v_definition not like '%business.store.procurement.completed%'
     or v_definition like '%record_business_ledger_entry_v2%'
     or position(
       'from public.business_store_purchase_quotes as quote_row'
       in lower(v_definition)
     ) >= position('from public.store_items as item_row' in lower(v_definition))
     or position('from public.store_items as item_row' in lower(v_definition))
       >= position(
         'from public.inventory_holdings as holding_row'
         in lower(v_definition)
       )
     or position(
       'from public.inventory_holdings as holding_row'
       in lower(v_definition)
     ) >= position(
       'from public.bank_accounts as account_row'
       in lower(v_definition)
     )
     or position(
       'from public.bank_accounts as account_row'
       in lower(v_definition)
     ) >= position(
       'compose_business_purchase_funding_v1'
       in lower(v_definition)
     )
  then
    raise exception 'C4_ASSERT_FUNDED_STORE_PURCHASE_INVALID';
  end if;

  if to_regprocedure(
       'economy_private.create_business_store_commercial_quote_v2(uuid,uuid,text,integer,text,timestamp with time zone)'
     ) is not null
     or to_regprocedure(
       'economy_private.purchase_business_store_quote_legacy_v2(uuid,uuid,text,text,timestamp with time zone,jsonb)'
     ) is not null
  then
    raise exception 'C4_ASSERT_PARALLEL_STORE_AUTHORITY_RETAINED';
  end if;

  v_definition := pg_get_functiondef(
    'public.guard_business_store_quote_evidence_v2()'::regprocedure
  );
  if v_definition like '%old.funding_quote_id is null%'
     or v_definition like '%new.funding_quote_id is not null%'
  then
    raise exception 'C4_ASSERT_LEGACY_STORE_QUOTE_BINDING_ALLOWED';
  end if;

  v_definition := pg_get_functiondef(
    'private.purchase_funding_receipt_public_json_v1(uuid)'::regprocedure
  );
  if v_definition not like '%''target_minor_unit''%'
     or v_definition not like '%''source_minor_unit''%'
     or v_definition not like '%''target_currency_code''%'
     or v_definition not like
       '%''target_contribution''%currency_amount_text_v1%'
     or v_definition not like '%''source_debit''%currency_amount_text_v1%'
  then
    raise exception 'C4_ASSERT_FUNDING_RECEIPT_MONEY_CONTRACT_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'private.business_store_procurement_public_json_v1(uuid)'::regprocedure
  );
  if v_definition not like '%''settlement_minor_unit''%'
     or v_definition not like '%''warehouse_average_unit_cost_minor_unit'', 4%'
     or v_definition not like '%''funding_receipt_key''%'
     or v_definition ~* '''[a-z_]*uuid[a-z_]*'''
     or v_definition ~* '''[a-z_]*_id'''
  then
    raise exception 'C4_ASSERT_PROCUREMENT_PUBLIC_PAYLOAD_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.get_business_treasury_overview_v1(uuid,uuid)'::regprocedure
  );
  if v_definition like '%target_value.currency_code = source_value.currency_code%'
     or v_definition not like
       '%target_value.currency_code <> source_value.currency_code%'
     or v_definition not like '%source_currency.status = ''active''%'
     or v_definition not like '%target_currency.status = ''active''%'
  then
    raise exception 'C4_ASSERT_TREASURY_RATE_PAIR_INVALID';
  end if;
end;
$assertions$;

commit;
