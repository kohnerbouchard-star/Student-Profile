-- Remove legacy ECO defaults from store-specific tables.
-- Store prices must now be created with an explicit official country currency.

ALTER TABLE public.store_items
ALTER COLUMN currency_code DROP DEFAULT;

ALTER TABLE public.store_purchase_quotes
ALTER COLUMN currency_code DROP DEFAULT;

ALTER TABLE public.store_purchases
ALTER COLUMN currency_code DROP DEFAULT;
