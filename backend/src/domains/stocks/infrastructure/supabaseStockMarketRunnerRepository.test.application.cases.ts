import { SupabaseStockMarketRunnerRepository } from "./supabaseStockMarketRunnerRepository.ts";
import { StockMarketRunnerError } from "../contracts/stockMarketRunnerContracts.ts";
import {
  assertEquals,
  assertRejectsWithCode,
  ASSET_ID,
  FakeSupabaseClient,
  GAME_SESSION_ID,
  gameSession,
  stockAsset,
} from "./supabaseStockMarketRunnerRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock runner repository applies only the requested game session payload", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  });
  client.rpcResult = { assets_updated: 1, ticks_inserted: 1 };
  const repository = new SupabaseStockMarketRunnerRepository(client as any);
  const result = await repository.apply({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 3,
    assetUpdates: [{
      game_session_id: GAME_SESSION_ID,
      asset_id: ASSET_ID,
      current_price: 101,
      previous_close: 100,
      open_price: 100,
      day_high: 101,
      day_low: 100,
      market_cap: 101000000,
      current_volatility: 0.05,
      long_run_volatility: 0.05,
      recent_returns: [0.01],
      chart_history: [],
    }],
    tickRows: [{
      game_session_id: GAME_SESSION_ID,
      stock_asset_id: ASSET_ID,
      tick_index: 3,
      ticker: "AURA",
      price: 101,
      previous_price: 100,
      log_return: 0.00995033,
      change_pct: 1,
      volume: 1000,
      current_volatility: 0.05,
      long_run_volatility: 0.05,
      explanation: {},
    }],
  });

  assertEquals(result, { assetsUpdated: 1, ticksInserted: 1 });
  assertEquals(
    client.rpcCalls[0].functionName,
    "apply_stock_market_runner_tick",
  );
  assertEquals(client.rpcCalls[0].args.p_game_session_id, GAME_SESSION_ID);
  assertEquals(client.rpcCalls[0].args.p_tick_index, 3);
  assertEquals(
    client.rpcCalls[0].args.p_asset_updates[0].game_session_id,
    GAME_SESSION_ID,
  );
  assertEquals(
    client.rpcCalls[0].args.p_tick_rows[0].game_session_id,
    GAME_SESSION_ID,
  );
});

Deno.test("stock runner repository maps missing stock schema errors", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [gameSession()],
    game_session_stock_assets: [],
    stock_price_ticks: [],
    stock_market_events: [],
    stock_market_regimes: [],
    country_profiles: [],
    country_economic_snapshots: [],
  });
  client.tableErrors.set("stock_price_ticks", {
    code: "42P01",
    message: "relation stock_price_ticks does not exist",
  });
  const repository = new SupabaseStockMarketRunnerRepository(client as any);

  await assertRejectsWithCode(
    () => repository.load({ gameSessionId: GAME_SESSION_ID }),
    "stock_market_schema_not_applied",
  );
});

Deno.test("stock runner consumes Business observations before loading the game market", async () => {
  const client = new FakeSupabaseClient({
    game_sessions: [{ id: GAME_SESSION_ID }],
    game_session_stock_assets: [stockAsset()],
    stock_price_ticks: [],
    country_profiles: [],
    country_economic_snapshots: [],
    stock_market_events: [],
    stock_market_regimes: [],
  });
  await new SupabaseStockMarketRunnerRepository(client as any).load({
    gameSessionId: GAME_SESSION_ID,
  });
  assertEquals(client.rpcCalls[0], {
    functionName: "consume_business_market_events_v1",
    args: { p_game_session_id: GAME_SESSION_ID, p_limit: 1000 },
  });
  client.rpcError = { message: "STOCK_BUSINESS_EVENT_VERSION_UNSUPPORTED" };
  let failed = false;
  try {
    await new SupabaseStockMarketRunnerRepository(client as any).load({
      gameSessionId: GAME_SESSION_ID,
    });
  } catch (e) {
    failed = e instanceof StockMarketRunnerError &&
      e.code === "stock_market_state_load_failed";
  }
  assertEquals(failed, true);
});
