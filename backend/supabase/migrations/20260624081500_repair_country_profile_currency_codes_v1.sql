-- Repair country_profiles rows still pointing to invalid currencies.
-- Official replacements:
-- MRV -> LUM for LUMENOR
-- KAI -> XAL for XALVORIA
-- ZAF -> DRV for DRAVENLOK

INSERT INTO public.currencies (
  code,
  country_code,
  name,
  symbol,
  decimal_places,
  status
)
VALUES
  ('LUM', 'LUMENOR', 'Lumenor Lumen', 'LM', 2, 'active'),
  ('XAL', 'XALVORIA', 'Xalvorian Crown', 'XA', 2, 'active'),
  ('DRV', 'DRAVENLOK', 'Dravenlok Mark', 'DM', 2, 'active')
ON CONFLICT (code) DO UPDATE
SET
  country_code = excluded.country_code,
  name = excluded.name,
  symbol = excluded.symbol,
  decimal_places = excluded.decimal_places,
  status = excluded.status;

-- If the bad migration renamed the country profile rows, restore the official identities.
UPDATE public.country_profiles
SET
  country_code = 'LUMENOR',
  country_name = 'Lumenor',
  capital_name = 'Starfall',
  currency_code = 'LUM',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"repairedFrom":"MARAVELLE"}'::jsonb
WHERE country_code = 'MARAVELLE'
  AND NOT EXISTS (
    SELECT 1 FROM public.country_profiles WHERE country_code = 'LUMENOR'
  );

UPDATE public.country_profiles
SET
  country_code = 'XALVORIA',
  country_name = 'Xalvoria',
  capital_name = 'Emberhall',
  currency_code = 'XAL',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"repairedFrom":"KAIZORA"}'::jsonb
WHERE country_code = 'KAIZORA'
  AND NOT EXISTS (
    SELECT 1 FROM public.country_profiles WHERE country_code = 'XALVORIA'
  );

UPDATE public.country_profiles
SET
  country_code = 'DRAVENLOK',
  country_name = 'Dravenlok',
  capital_name = 'Ironhold',
  currency_code = 'DRV',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"repairedFrom":"ZAFRAN"}'::jsonb
WHERE country_code = 'ZAFRAN'
  AND NOT EXISTS (
    SELECT 1 FROM public.country_profiles WHERE country_code = 'DRAVENLOK'
  );

-- Repair currency codes whether the country names were already official or just restored.
UPDATE public.country_profiles
SET currency_code = CASE country_code
  WHEN 'LUMENOR' THEN 'LUM'
  WHEN 'XALVORIA' THEN 'XAL'
  WHEN 'DRAVENLOK' THEN 'DRV'
  ELSE currency_code
END
WHERE country_code IN ('LUMENOR', 'XALVORIA', 'DRAVENLOK')
   OR currency_code IN ('MRV', 'KAI', 'ZAF');

-- Keep exchange rates aligned with the official currencies.
UPDATE public.currency_exchange_rates
SET
  from_currency_code = CASE from_currency_code
    WHEN 'MRV' THEN 'LUM'
    WHEN 'KAI' THEN 'XAL'
    WHEN 'ZAF' THEN 'DRV'
    ELSE from_currency_code
  END,
  to_currency_code = CASE to_currency_code
    WHEN 'MRV' THEN 'LUM'
    WHEN 'KAI' THEN 'XAL'
    WHEN 'ZAF' THEN 'DRV'
    ELSE to_currency_code
  END
WHERE from_currency_code IN ('MRV', 'KAI', 'ZAF')
   OR to_currency_code IN ('MRV', 'KAI', 'ZAF');

UPDATE public.currencies
SET status = 'archived'
WHERE code IN ('MRV', 'KAI', 'ZAF');
