-- Clean up official Econovaria currency metadata.
-- Currency codes remain stable backend identifiers.
-- Currency names are player-facing display names.
-- symbol_key maps to frontend SVG/icon assets from the alchemical symbol sheet.
-- symbol is a short fallback label if the frontend asset is unavailable.

ALTER TABLE public.currencies
ADD COLUMN IF NOT EXISTS symbol_key text NULL;

UPDATE public.currencies
SET
  name = CASE code
    WHEN 'NRC' THEN 'Northreach Credit'
    WHEN 'YRC' THEN 'Yrethian Crown'
    WHEN 'THD' THEN 'Thaloris Dinar'
    WHEN 'SLV' THEN 'Solvend Volt'
    WHEN 'ELD' THEN 'Eldoran Ducat'
    WHEN 'VAL' THEN 'Valerion Lira'
    WHEN 'LUM' THEN 'Lumenor Mark'
    WHEN 'SYN' THEN 'Syndalis Note'
    WHEN 'XAL' THEN 'Xalvorian Lira'
    WHEN 'DRV' THEN 'Dravenlok Vek'
    ELSE name
  END,
  symbol_key = CASE code
    WHEN 'NRC' THEN 'saturn'
    WHEN 'YRC' THEN 'neptune'
    WHEN 'THD' THEN 'arsenic'
    WHEN 'SLV' THEN 'jupiter'
    WHEN 'ELD' THEN 'alumen'
    WHEN 'VAL' THEN 'gold'
    WHEN 'LUM' THEN 'lapis_lazuli'
    WHEN 'SYN' THEN 'alcali'
    WHEN 'XAL' THEN 'lead'
    WHEN 'DRV' THEN 'ferrum'
    ELSE symbol_key
  END,
  symbol = CASE code
    WHEN 'NRC' THEN 'SAT'
    WHEN 'YRC' THEN 'NEP'
    WHEN 'THD' THEN 'ARS'
    WHEN 'SLV' THEN 'JUP'
    WHEN 'ELD' THEN 'ALU'
    WHEN 'VAL' THEN 'GLD'
    WHEN 'LUM' THEN 'LAP'
    WHEN 'SYN' THEN 'ALC'
    WHEN 'XAL' THEN 'LED'
    WHEN 'DRV' THEN 'FER'
    ELSE symbol
  END
WHERE code IN ('NRC', 'YRC', 'THD', 'SLV', 'ELD', 'VAL', 'LUM', 'SYN', 'XAL', 'DRV');

ALTER TABLE public.currencies
DROP CONSTRAINT IF EXISTS currencies_symbol_key_format_check;

ALTER TABLE public.currencies
ADD CONSTRAINT currencies_symbol_key_format_check
CHECK (
  symbol_key IS NULL
  OR symbol_key ~ '^[a-z][a-z0-9_]{1,63}$'
);
