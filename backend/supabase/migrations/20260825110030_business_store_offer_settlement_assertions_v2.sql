-- Business V2 Phase 10A.3: fail-closed receipt, RPC, privilege, and authority assertions.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $assertions$
declare
  v_settle oid := to_regprocedure('public.settle_business_store_offer_v2(uuid,uuid,text,text,integer,bigint,text)');
  v_result oid := to_regprocedure('economy_private.read_store_offer_purchase_receipt_result_v2(uuid,boolean)');
  v_guard oid := to_regprocedure('economy_private.guard_store_offer_purchase_receipt_v2()');
  v_validator oid := to_regprocedure('economy_private.validate_store_offer_purchase_receipt_v2()');
  v_definition text;
  v_column text;
begin
  if to_regclass('public.store_offer_purchase_receipts') is null then
    raise exception 'STORE_OFFER_SETTLEMENT_RECEIPT_SCHEMA_MISSING';
  end if;

  foreach v_column in array array[
    'public_key','game_session_id','buyer_player_id','quote_id','offer_id',
    'business_id','seller_party_id','store_item_id','game_item_id',
    'listing_inventory_account_id','buyer_inventory_account_id',
    'buyer_debit_ledger_entry_id','business_credit_ledger_entry_id',
    'inventory_transaction_id','quote_key','offer_key','business_key',
    'seller_party_key','catalog_item_key','canonical_item_key','store_item_key',
    'buyer_inventory_account_key','inventory_transaction_key','quantity',
    'unit_price','total_price','currency_code','buyer_debit','business_credit',
    'gross_revenue','source_unit_cost','cost_currency_code','cost_of_goods_sold',
    'gross_margin','offer_version_before','offer_version_after',
    'remaining_listed_quantity','request_idempotency_key','request_hash',
    'completed_at','metadata'
  ] loop
    if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'store_offer_purchase_receipts'
        and column_name = v_column) then
      raise exception 'STORE_OFFER_SETTLEMENT_RECEIPT_COLUMN_MISSING:%', v_column;
    end if;
  end loop;

  if v_settle is null or v_result is null or v_guard is null or v_validator is null then
    raise exception 'STORE_OFFER_SETTLEMENT_FUNCTION_MISSING';
  end if;
  if not exists (select 1 from pg_proc where oid = v_settle and prosecdef)
    or not exists (select 1 from pg_proc where oid = v_result and prosecdef)
    or not exists (select 1 from pg_proc where oid = v_guard and prosecdef)
    or not exists (select 1 from pg_proc where oid = v_validator and prosecdef) then
    raise exception 'STORE_OFFER_SETTLEMENT_SECURITY_DEFINER_REQUIRED';
  end if;

  if has_function_privilege('anon', 'public.settle_business_store_offer_v2(uuid,uuid,text,text,integer,bigint,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.settle_business_store_offer_v2(uuid,uuid,text,text,integer,bigint,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.settle_business_store_offer_v2(uuid,uuid,text,text,integer,bigint,text)', 'EXECUTE') then
    raise exception 'STORE_OFFER_SETTLEMENT_FUNCTION_PRIVILEGE_INVALID';
  end if;
  if has_function_privilege('service_role', 'economy_private.read_store_offer_purchase_receipt_result_v2(uuid,boolean)', 'EXECUTE')
    or has_function_privilege('service_role', 'economy_private.guard_store_offer_purchase_receipt_v2()', 'EXECUTE')
    or has_function_privilege('service_role', 'economy_private.validate_store_offer_purchase_receipt_v2()', 'EXECUTE') then
    raise exception 'STORE_OFFER_SETTLEMENT_HELPER_PRIVILEGE_INVALID';
  end if;
  if has_table_privilege('anon', 'public.store_offer_purchase_receipts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_table_privilege('authenticated', 'public.store_offer_purchase_receipts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or not has_table_privilege('service_role', 'public.store_offer_purchase_receipts', 'SELECT')
    or has_table_privilege('service_role', 'public.store_offer_purchase_receipts', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
    raise exception 'STORE_OFFER_SETTLEMENT_TABLE_PRIVILEGE_INVALID';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.store_offer_purchase_receipts'::regclass
    and relrowsecurity and relforcerowsecurity) then
    raise exception 'STORE_OFFER_SETTLEMENT_RECEIPT_RLS_NOT_FORCED';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.store_offer_purchase_receipts'::regclass
    and tgname = 'guard_store_offer_purchase_receipt_v2' and not tgisinternal) then
    raise exception 'STORE_OFFER_SETTLEMENT_RECEIPT_GUARD_MISSING';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.store_offer_purchase_receipts'::regclass
    and tgname = 'validate_store_offer_purchase_receipt_v2' and not tgisinternal) then
    raise exception 'STORE_OFFER_SETTLEMENT_RECEIPT_VALIDATOR_MISSING';
  end if;

  v_definition := pg_get_functiondef(v_settle);
  if position('pg_advisory_xact_lock' in v_definition) = 0
    or position('from public.store_offer_purchase_receipts' in v_definition) = 0
    or position('from public.store_seller_offers' in v_definition) = 0
    or position('for update' in lower(v_definition)) = 0
    or position('STORE_OFFER_SETTLEMENT_MONEY_PRECISION_UNREPRESENTABLE' in v_definition) = 0
    or position('STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS' in v_definition) = 0
    or position('STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED' in v_definition) = 0
    or position('economy_private.post_inventory_transaction_v2' in v_definition) = 0
    or position('public.record_player_ledger_entry' in v_definition) = 0
    or position('public.record_business_ledger_entry_v2' in v_definition) = 0
    or position('business.store.sale.completed' in v_definition) = 0
    or position('status = ''used''' in v_definition) = 0
    or position('update public.store_seller_offers set version = version + 1' in v_definition) = 0
    or position('after_buyer_debit' in v_definition) = 0
    or position('after_business_credit' in v_definition) = 0
    or position('after_inventory_post' in v_definition) = 0
    or position('after_activity' in v_definition) = 0
    or position('after_receipt' in v_definition) = 0
    or position('after_quote_consumption' in v_definition) = 0
    or position('after_offer_version' in v_definition) = 0 then
    raise exception 'STORE_OFFER_SETTLEMENT_FUNCTION_INCOMPLETE';
  end if;

  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_offer_purchase_receipts'
      and column_name in ('buyer_balance','business_balance','listed_quantity_owned')) then
    raise exception 'STORE_OFFER_SETTLEMENT_PARALLEL_AUTHORITY_FORBIDDEN';
  end if;
end
$assertions$;

commit;
