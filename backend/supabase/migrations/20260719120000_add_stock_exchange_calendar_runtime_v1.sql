-- Add authoritative real-time market-session gating.
-- Initial runtime baseline preserves the legacy classroom schedule:
-- Asia/Seoul, Monday-Friday, 08:00 inclusive to 17:00 exclusive.
-- Holiday and early-close overrides are represented by the domain calendar and
-- remain fail-closed until versioned records are approved.

create or replace function public.is_stock_market_open_at(
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_local timestamp without time zone;
  v_iso_day integer;
  v_local_time time without time zone;
begin
  if p_at is null then
    return false;
  end if;

  v_local := p_at at time zone 'Asia/Seoul';
  v_iso_day := extract(isodow from v_local)::integer;
  v_local_time := v_local::time;

  return v_iso_day between 1 and 5
    and v_local_time >= time '08:00'
    and v_local_time < time '17:00';
end;
$$;

comment on function public.is_stock_market_open_at(timestamptz) is
  'Authoritative fail-closed stock-session decision for the initial Asia/Seoul weekday 08:00-17:00 calendar baseline.';

revoke all on function public.is_stock_market_open_at(timestamptz)
from public, anon, authenticated;
grant execute on function public.is_stock_market_open_at(timestamptz)
to service_role;

create or replace function public.execute_stock_market_order_calendar_gated(
  p_game_session_id uuid,
  p_player_session_id uuid,
  p_stock_asset_id uuid,
  p_side text,
  p_quantity numeric,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  game_session_id uuid,
  player_session_id uuid,
  player_id uuid,
  stock_asset_id uuid,
  ticker text,
  side text,
  quantity numeric,
  execution_price numeric,
  gross_value numeric,
  status text,
  rejection_reason text,
  cash_balance numeric,
  cash_currency_code text,
  holding_quantity numeric,
  average_cost numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Preserve the existing RPC's idempotency guarantee. A retry of an order that
  -- already reached a terminal state returns the stored result even if the
  -- exchange has since closed. A new order remains fail-closed.
  if not exists (
    select 1
    from public.stock_orders existing_order
    where existing_order.game_session_id = p_game_session_id
      and existing_order.player_session_id = p_player_session_id
      and existing_order.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  ) and not public.is_stock_market_open_at(now()) then
    raise exception 'STOCK_TRADING_MARKET_CLOSED';
  end if;

  return query
  select result.*
  from public.execute_stock_market_order(
    p_game_session_id,
    p_player_session_id,
    p_stock_asset_id,
    p_side,
    p_quantity,
    p_idempotency_key
  ) result;
end;
$$;

comment on function public.execute_stock_market_order_calendar_gated(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) is
  'Service-role stock-order boundary that rejects new immediate fills while closed and preserves stored idempotent order replay.';

revoke all on function public.execute_stock_market_order_calendar_gated(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) from public, anon, authenticated;
grant execute on function public.execute_stock_market_order_calendar_gated(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) to service_role;
