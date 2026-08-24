-- Business V2 Phase 7A compatibility identity and terminal-guard assertions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

DO $assert$
BEGIN
  IF to_regprocedure('economy_private.guard_store_item_offer_identity_v2()') IS NULL THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_STORE_ITEM_GUARD_FUNCTION_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.store_items'::regclass
      AND tgname = 'guard_store_item_offer_identity_v2'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_STORE_ITEM_GUARD_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  IF pg_get_functiondef(
      'economy_private.guard_store_seller_offer_v2()'::regprocedure
    ) NOT LIKE '%if old.status = ''retired'' then%'
  THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_TERMINAL_GUARD_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  IF pg_get_functiondef(
      'economy_private.guard_store_item_offer_identity_v2()'::regprocedure
    ) NOT LIKE '%STORE_SELLER_OFFER_STORE_ITEM_IDENTITY_IMMUTABLE%'
    OR pg_get_functiondef(
      'economy_private.guard_store_item_offer_identity_v2()'::regprocedure
    ) NOT LIKE '%STORE_SELLER_OFFER_CURRENCY_CHANGE_BLOCKED%'
  THEN
    RAISE EXCEPTION 'STORE_SELLER_OFFER_STORE_ITEM_GUARD_INCOMPLETE'
      USING ERRCODE = 'P0001';
  END IF;
END
$assert$;

commit;
