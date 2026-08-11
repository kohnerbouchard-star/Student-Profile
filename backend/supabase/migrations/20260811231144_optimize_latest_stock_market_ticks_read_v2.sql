-- Optimize stock market latest-tick read RPC V2.
--
-- The V1 DISTINCT ON implementation scanned and incrementally sorted the full
-- per-game tick history before reducing it to one row per active stock asset.
-- At current production scale (~253k ticks / 240 active assets), that exceeded
-- the database statement timeout and caused the Player dashboard bootstrap to
-- fail after successful authentication.
--
-- V2 preserves the public/service contract and existing grants while changing
-- only the internal read shape: drive from active assets and use one bounded
-- LATERAL index lookup (ORDER BY tick_index DESC ... LIMIT 1) per asset. The
-- existing stock_price_ticks_asset_tick_desc_idx supports this directly, so no
-- new index or broader schema change is required.

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
  select
    latest.game_session_id,
    latest.stock_asset_id,
    latest.tick_index,
    latest.ticker,
    latest.price,
    latest.previous_price,
    latest.change_pct,
    latest.volume,
    latest.created_at
  from public.game_session_stock_assets asset
  cross join lateral (
    select
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
    where tick.game_session_id = asset.game_session_id
      and tick.stock_asset_id = asset.id
    order by tick.tick_index desc, tick.created_at desc
    limit 1
  ) latest
  where asset.game_session_id = p_game_session_id
    and asset.is_active = true
    and (
      p_ticker is null
      or lower(asset.ticker) = lower(btrim(p_ticker))
    )
  order by latest.stock_asset_id;
$$;

comment on function public.read_latest_stock_market_ticks_for_game(uuid, text) is
  'Returns the latest stock_price_ticks row for each active stock asset in one game session using bounded per-asset index lookups. Intended for trusted service-role backend reads only.';

revoke all on function public.read_latest_stock_market_ticks_for_game(uuid, text) from public;
grant execute on function public.read_latest_stock_market_ticks_for_game(uuid, text) to service_role;
