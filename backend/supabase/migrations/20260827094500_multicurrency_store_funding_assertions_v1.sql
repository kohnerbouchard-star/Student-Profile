-- Econovaria Business V2 Phase 10A.4C1: accumulated-schema assertions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

DO $assertions$
declare
  v_definition text;
begin
  if to_regprocedure(
    'private.store_funding_normalize_allocations_v1(jsonb)'
  ) is null then
    raise exception 'C1_ASSERT_NORMALIZER_MISSING';
  end if;

  if to_regprocedure(
    'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)'
  ) is null then
    raise exception 'C1_ASSERT_SEEDED_QUOTE_MISSING';
  end if;

  if to_regprocedure(
    'public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)'
  ) is null then
    raise exception 'C1_ASSERT_BUSINESS_QUOTE_MISSING';
  end if;

  if to_regprocedure(
    'public.settle_seeded_store_funding_v1(uuid,uuid,text,text,timestamp with time zone,jsonb)'
  ) is null then
    raise exception 'C1_ASSERT_SEEDED_SETTLEMENT_MISSING';
  end if;

  if to_regprocedure(
    'public.settle_business_store_offer_funding_v1(uuid,uuid,text,text,integer,bigint,text)'
  ) is null then
    raise exception 'C1_ASSERT_BUSINESS_SETTLEMENT_MISSING';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_purchase_quotes'
      and column_name = 'funding_quote_id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_purchases'
      and column_name = 'funding_receipt_id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_offer_purchase_quotes'
      and column_name = 'funding_quote_id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_offer_purchase_receipts'
      and column_name = 'funding_receipt_id'
  ) then
    raise exception 'C1_ASSERT_FUNDING_BINDING_COLUMNS_MISSING';
  end if;

  if has_function_privilege(
    'anon',
    'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'C1_ASSERT_SEEDED_QUOTE_GRANTS_INVALID';
  end if;

  if has_function_privilege(
    'anon',
    'public.settle_business_store_offer_funding_v1(uuid,uuid,text,text,integer,bigint,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.settle_business_store_offer_funding_v1(uuid,uuid,text,text,integer,bigint,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.settle_business_store_offer_funding_v1(uuid,uuid,text,text,integer,bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'C1_ASSERT_BUSINESS_SETTLEMENT_GRANTS_INVALID';
  end if;

  if has_function_privilege(
    'service_role',
    'private.store_funding_normalize_allocations_v1(jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.compose_purchase_funding_v1(uuid,uuid,text,text,text,text,uuid,text,text,uuid,text,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'C1_ASSERT_PRIVATE_COMPOSER_BOUNDARY_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)'::regprocedure
  );
  if v_definition not like '%create_purchase_funding_quote_v1%'
     or v_definition like '%record_player_ledger_entry%'
     or v_definition like '%convert_currency_amount%'
  then
    raise exception 'C1_ASSERT_SEEDED_QUOTE_AUTHORITY_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)'::regprocedure
  );
  if v_definition not like '%create_purchase_funding_quote_v1%'
     or v_definition like '%STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED%'
     or v_definition like '%record_player_ledger_entry%'
  then
    raise exception 'C1_ASSERT_BUSINESS_QUOTE_AUTHORITY_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.settle_seeded_store_funding_v1(uuid,uuid,text,text,timestamp with time zone,jsonb)'::regprocedure
  );
  if v_definition not like '%compose_purchase_funding_v1%'
     or v_definition not like '%post_inventory_transaction_v2%'
     or v_definition like '%record_player_ledger_entry%'
  then
    raise exception 'C1_ASSERT_SEEDED_SETTLEMENT_AUTHORITY_INVALID';
  end if;

  v_definition := pg_get_functiondef(
    'public.settle_business_store_offer_funding_v1(uuid,uuid,text,text,integer,bigint,text)'::regprocedure
  );
  if v_definition not like '%compose_purchase_funding_v1%'
     or v_definition not like '%post_inventory_transaction_v2%'
     or v_definition like '%record_player_ledger_entry%'
     or v_definition like '%record_business_ledger_entry_v2%'
  then
    raise exception 'C1_ASSERT_BUSINESS_SETTLEMENT_AUTHORITY_INVALID';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_purchase_quotes_funding_binding_check'
  ) or not exists (
    select 1
    from pg_constraint
    where conname = 'store_purchases_payment_evidence_check'
  ) or not exists (
    select 1
    from pg_constraint
    where conname = 'store_offer_purchase_quotes_funding_binding_check'
  ) or not exists (
    select 1
    from pg_constraint
    where conname = 'store_offer_purchase_receipts_payment_evidence_check'
  ) then
    raise exception 'C1_ASSERT_BINDING_CONSTRAINTS_MISSING';
  end if;
end
$assertions$;

comment on function private.store_funding_normalize_allocations_v1(jsonb) is
  'C1 Store-only canonicalizer for one-to-three C0 target-currency allocations. It creates no balance, FX, or Store authority.';

commit;
