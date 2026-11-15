import { SupabaseStockMarketRunnerRepository } from "./supabaseStockMarketRunnerRepository.ts";
import {
  assertEquals,
  countryProfile,
  countrySnapshot,
  FakeSupabaseClient,
  GAME_SESSION_ID,
  gameSession,
  OTHER_SESSION_ID,
  SOLVEND_PROFILE_ID,
  stockAsset,
  stockEvent,
  stockRegime,
} from "./supabaseStockMarketRunnerRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock runner preserves read order inclusive event windows and latest regime tie", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    country_profiles: [countryProfile("SOLVEND", SOLVEND_PROFILE_ID)],
    country_economic_snapshots: [countrySnapshot()],
    stock_market_events: [
      stockEvent({ shock_id: "ending", created_tick: 1, expires_tick: 4 }),
      stockEvent({ shock_id: "starting", created_tick: 4, expires_tick: 4 }),
      stockEvent({ shock_id: "future", created_tick: 5 }),
      stockEvent({ shock_id: "expired", expires_tick: 3 }),
      stockEvent({ shock_id: "other-game", game_session_id: OTHER_SESSION_ID }),
    ],
    stock_market_regimes: [
      stockRegime({ regime: "bear", starts_tick: 4, ends_tick: 4 }),
      stockRegime({ regime: "bull", starts_tick: 4 }),
      stockRegime({ regime: "sideways", starts_tick: 3 }),
    ],
  });
  const state = await new SupabaseStockMarketRunnerRepository(client as any)
    .load({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 });
  assertEquals(client.operations, [
    "read:game_sessions",
    "rpc:consume_business_market_events_v1",
    "read:stock_price_ticks",
    "read:game_session_stock_assets",
    "read:country_profiles",
    "read:country_economic_snapshots",
    "read:stock_market_events",
    "read:stock_market_regimes",
  ]);
  assertEquals(state.shocks.map((shock) => shock.shockId), [
    "ending",
    "starting",
  ]);
  assertEquals(state.regime?.regime, "bear");
});
