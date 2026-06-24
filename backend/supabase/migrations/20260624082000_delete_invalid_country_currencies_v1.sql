-- Delete invalid archived currencies after all references were repaired.
-- Official replacements:
-- MRV -> LUM
-- KAI -> XAL
-- ZAF -> DRV

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.currency_exchange_rates
    WHERE from_currency_code IN ('MRV', 'KAI', 'ZAF')
       OR to_currency_code IN ('MRV', 'KAI', 'ZAF')
  ) THEN
    RAISE EXCEPTION 'INVALID_CURRENCY_STILL_REFERENCED_BY_EXCHANGE_RATES'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.country_profiles
    WHERE currency_code IN ('MRV', 'KAI', 'ZAF')
  ) THEN
    RAISE EXCEPTION 'INVALID_CURRENCY_STILL_REFERENCED_BY_COUNTRY_PROFILES'
      USING errcode = 'P0001';
  END IF;

  DELETE FROM public.currencies
  WHERE code IN ('MRV', 'KAI', 'ZAF');
END $$;
