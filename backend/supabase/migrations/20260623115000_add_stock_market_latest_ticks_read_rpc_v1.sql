-- Stock market latest-tick read RPC V1.
-- Returns one latest tick row per active stock asset for one game session.
-- This is read-only support for the backend stock-market read endpoint and does
-- not add trading, portfolio, orders, fills, reservations, ledger writes,
-- schedulers, frontend routes, or classroom-api changes.

create or replace function public.read_latest_stock_market_ticks_for_game(
  p_game_session_id uuid,
  p_ticker text default null
)
returns table (
  game_session_id uuid,
  stock_asset_id uuid,
  tick_index integer,
  ticker text,
  price numeric,
  previous_price numeric,
  change_pct numeric,
  volume bigint,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select distinct on (tick.stock_asset_id)
    tick.game_session_id,
    tick.stock_asset_id,
    tick.tick_index,
    tick.ticker,
    tick.price,
    tick.previous_price,
    tick.change_pct,
    tick.volume,
    tick.created_at
  from public.stock_price_ticks tick
  join public.game_session_stock_assets asset
    on asset.game_session_id = tick.game_session_id
    and asset.id = tick.stock_asset_id
  where tick.game_session_id = p_game_session_id
    and asset.is_active = true
    and (
      p_ticker is null
      or lower(tick.ticker) = lower(btrim(p_ticker))
    )
  order by tick.stock_asset_id, tick.tick_index desc, tick.created_at desc;
$$;

comment on function public.read_latest_stock_market_ticks_for_game(uuid, text) is
  'Returns the latest stock_price_ticks row for each active stock asset in one game session. Intended for trusted service-role backend reads only.';

revoke all on function public.read_latest_stock_market_ticks_for_game(uuid, text) from public;
grant execute on function public.read_latest_stock_market_ticks_for_game(uuid, text) to service_role;
