-- Drop unused stock RPC accidentally introduced during ECO retirement.
-- The live Edge repository calls execute_stock_market_order, not execute_stock_order.

DROP FUNCTION IF EXISTS public.execute_stock_order(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
);
