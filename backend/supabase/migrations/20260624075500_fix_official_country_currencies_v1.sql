-- Correct country-currency foundation to match the official Econovaria country list.
-- Official countries include LUMENOR, XALVORIA, and DRAVENLOK.
-- Removes the non-official MARAVELLE, KAIZORA, and ZAFRAN currency rows from the seed model.

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

UPDATE public.country_profiles
SET currency_code = CASE country_code
  WHEN 'NORTHREACH' THEN 'NRC'
  WHEN 'YRETHIA' THEN 'YRC'
  WHEN 'THALORIS' THEN 'THD'
  WHEN 'SOLVEND' THEN 'SLV'
  WHEN 'ELDORAN' THEN 'ELD'
  WHEN 'VALERION' THEN 'VAL'
  WHEN 'LUMENOR' THEN 'LUM'
  WHEN 'SYNDALIS' THEN 'SYN'
  WHEN 'XALVORIA' THEN 'XAL'
  WHEN 'DRAVENLOK' THEN 'DRV'
  ELSE currency_code
END
WHERE country_code IN (
  'NORTHREACH',
  'YRETHIA',
  'THALORIS',
  'SOLVEND',
  'ELDORAN',
  'VALERION',
  'LUMENOR',
  'SYNDALIS',
  'XALVORIA',
  'DRAVENLOK'
);

UPDATE public.currency_exchange_rates
SET from_currency_code = CASE from_currency_code
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

UPDATE public.currencies
SET country_code = CASE code
  WHEN 'NRC' THEN 'NORTHREACH'
  WHEN 'YRC' THEN 'YRETHIA'
  WHEN 'THD' THEN 'THALORIS'
  WHEN 'SLV' THEN 'SOLVEND'
  WHEN 'ELD' THEN 'ELDORAN'
  WHEN 'VAL' THEN 'VALERION'
  WHEN 'LUM' THEN 'LUMENOR'
  WHEN 'SYN' THEN 'SYNDALIS'
  WHEN 'XAL' THEN 'XALVORIA'
  WHEN 'DRV' THEN 'DRAVENLOK'
  ELSE country_code
END
WHERE code IN ('NRC', 'YRC', 'THD', 'SLV', 'ELD', 'VAL', 'LUM', 'SYN', 'XAL', 'DRV');
