-- Align canonical country profiles with country-specific currencies.
-- Removes ECO from country profiles and migrates old country identity rows
-- to the current Econovaria country set.

UPDATE public.country_profiles
SET
  country_code = 'MARAVELLE',
  country_name = 'Maravelle',
  capital_name = 'Tidecross',
  currency_code = 'MRV',
  metadata = coalesce(metadata, '{}'::jsonb)
    || '{"renamedFrom":"LUMENOR","mapRegion":"south","mapColor":"blue-white"}'::jsonb
WHERE country_code = 'LUMENOR';

UPDATE public.country_profiles
SET
  country_code = 'KAIZORA',
  country_name = 'Kaizora',
  capital_name = 'Neon Gate',
  currency_code = 'KAI',
  metadata = coalesce(metadata, '{}'::jsonb)
    || '{"renamedFrom":"XALVORIA","mapRegion":"northeast","mapColor":"gold"}'::jsonb
WHERE country_code = 'XALVORIA';

UPDATE public.country_profiles
SET
  country_code = 'ZAFRAN',
  country_name = 'Zafran',
  capital_name = 'Sunspire',
  currency_code = 'ZAF',
  metadata = coalesce(metadata, '{}'::jsonb)
    || '{"renamedFrom":"DRAVENLOK","mapRegion":"east","mapColor":"red"}'::jsonb
WHERE country_code = 'DRAVENLOK';

UPDATE public.country_profiles
SET currency_code = CASE country_code
  WHEN 'NORTHREACH' THEN 'NRC'
  WHEN 'YRETHIA' THEN 'YRC'
  WHEN 'THALORIS' THEN 'THD'
  WHEN 'SOLVEND' THEN 'SLV'
  WHEN 'ELDORAN' THEN 'ELD'
  WHEN 'VALERION' THEN 'VAL'
  WHEN 'SYNDALIS' THEN 'SYN'
  WHEN 'MARAVELLE' THEN 'MRV'
  WHEN 'KAIZORA' THEN 'KAI'
  WHEN 'ZAFRAN' THEN 'ZAF'
  ELSE currency_code
END
WHERE country_code IN (
  'NORTHREACH',
  'YRETHIA',
  'THALORIS',
  'SOLVEND',
  'ELDORAN',
  'VALERION',
  'SYNDALIS',
  'MARAVELLE',
  'KAIZORA',
  'ZAFRAN'
);
