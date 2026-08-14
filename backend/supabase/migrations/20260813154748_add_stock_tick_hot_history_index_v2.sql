create index if not exists stock_price_ticks_game_tick_asset_idx
  on public.stock_price_ticks (game_session_id, tick_index, stock_asset_id);

comment on index public.stock_price_ticks_game_tick_asset_idx is
  'Stock Runtime V2 hot-history index supporting game-scoped tick ranges ordered by tick_index then stock_asset_id.';
