-- Business V2 Phase 7A schema and privilege assertions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

DO $assert$
DECLARE
  v_missing text[] := '{}'::text[];
BEGIN
  IF to_regclass('public.store_seller_offers') IS NULL THEN
    v_missing := array_append(v_missing, 'public.store_seller_offers');
  END IF;
  IF to_regprocedure('public.create_business_store_offer_draft_v2(uuid,text,text,numeric,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'create_business_store_offer_draft_v2');
  END IF;
  IF to_regprocedure('public.mutate_store_seller_offer_v2(uuid,text,bigint,numeric,text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'mutate_store_seller_offer_v2');
  END IF;
  IF to_regprocedure('public.read_store_catalog_offer_groups_v2(uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'read_store_catalog_offer_groups_v2');
  END IF;
  IF to_regprocedure('economy_private.guard_store_seller_offer_v2()') IS NULL THEN
    v_missing := array_append(v_missing, 'guard_store_seller_offer_v2');
  END IF;
  IF to_regprocedure('economy_private.sync_seeded_store_seller_offer_v2()') IS NULL THEN
    v_missing := array_append(v_missing, 'sync_seeded_store_seller_offer_v2');
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_SCHEMA_MISSING:%', array_to_string(v_missing, ',')
      USING ERRCODE = 'P0001';
  END IF;
END
$assert$;

DO $assert$
DECLARE
  v_required_columns text[] := array[
    'public_key',
    'game_session_id',
    'store_item_id',
    'game_item_id',
    'seller_party_id',
    'inventory_account_id',
    'seller_kind',
    'unit_price',
    'currency_code',
    'status',
    'replenishment_policy',
    'creation_idempotency_key',
    'creation_request_hash',
    'version',
    'metadata'
  ];
  v_column text;
BEGIN
  FOREACH v_column IN ARRAY v_required_columns LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'store_seller_offers'
        AND column_name = v_column
    ) THEN
      RAISE EXCEPTION 'STORE_SELLER_OFFER_COLUMN_MISSING:%', v_column
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END
$assert$;

DO $assert$
DECLARE
  v_required_constraints text[] := array[
    'store_seller_offers_store_item_scope_fk',
    'store_seller_offers_game_item_scope_fk',
    'store_seller_offers_seller_party_scope_fk',
    'store_seller_offers_inventory_account_scope_fk',
    'store_seller_offers_active_custody_check',
    'store_seller_offers_idempotency_unique'
  ];
  v_constraint text;
BEGIN
  FOREACH v_constraint IN ARRAY v_required_constraints LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.store_seller_offers'::regclass
        AND conname = v_constraint
    ) THEN
      RAISE EXCEPTION 'STORE_SELLER_OFFER_CONSTRAINT_MISSING:%', v_constraint
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END
$assert$;

DO $assert$
DECLARE
  v_required_indexes text[] := array[
    'store_seller_offers_seeded_compatibility_unique',
    'store_seller_offers_business_current_unique',
    'store_seller_offers_active_account_unique',
    'store_seller_offers_catalog_active_idx',
    'store_seller_offers_seller_status_idx'
  ];
  v_index text;
BEGIN
  FOREACH v_index IN ARRAY v_required_indexes LOOP
    IF to_regclass('public.' || v_index) IS NULL THEN
      RAISE EXCEPTION 'STORE_SELLER_OFFER_INDEX_MISSING:%', v_index
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END
$assert$;

DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.store_seller_offers'::regclass
      AND tgname = 'guard_store_seller_offer_v2'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_GUARD_TRIGGER_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.store_items'::regclass
      AND tgname = 'sync_seeded_store_seller_offer_v2'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_COMPATIBILITY_TRIGGER_MISSING'
      USING ERRCODE = 'P0001';
  END IF;
END
$assert$;

DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.store_seller_offers'::regclass
      AND relrowsecurity
      AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_RLS_NOT_FORCED'
      USING ERRCODE = 'P0001';
  END IF;

  IF has_table_privilege('anon', 'public.store_seller_offers', 'SELECT')
    OR has_table_privilege('authenticated', 'public.store_seller_offers', 'SELECT')
    OR has_table_privilege('anon', 'public.store_seller_offers', 'INSERT')
    OR has_table_privilege('authenticated', 'public.store_seller_offers', 'UPDATE')
  THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_BROWSER_TABLE_PRIVILEGE_FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.create_business_store_offer_draft_v2(uuid,text,text,numeric,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.create_business_store_offer_draft_v2(uuid,text,text,numeric,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.mutate_store_seller_offer_v2(uuid,text,bigint,numeric,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.mutate_store_seller_offer_v2(uuid,text,bigint,numeric,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.read_store_catalog_offer_groups_v2(uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.read_store_catalog_offer_groups_v2(uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_BROWSER_FUNCTION_PRIVILEGE_FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;
END
$assert$;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.store_items AS item
    LEFT JOIN public.store_seller_offers AS offer
      ON offer.game_session_id = item.game_session_id
     AND offer.store_item_id = item.id
     AND offer.seller_kind = 'seeded'
    WHERE offer.id IS NULL
  ) THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_SEEDED_BACKFILL_INCOMPLETE'
      USING ERRCODE = 'P0001';
  END IF;
END
$assert$;

commit;
