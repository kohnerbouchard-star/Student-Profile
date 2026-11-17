export const GAME_PUBLIC_REALTIME_EVENTS = [
  "stock_tick",
  "market_news_posted",
  "leaderboard_updated",
  "contract_posted",
  "contract_updated",
  "store_item_posted",
  "store_item_updated",
  "store_prices_updated",
  "store_status_changed",
  "market_status_changed",
] as const;

export type GamePublicRealtimeEvent =
  typeof GAME_PUBLIC_REALTIME_EVENTS[number];
