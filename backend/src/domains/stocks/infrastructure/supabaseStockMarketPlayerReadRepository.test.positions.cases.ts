import { SupabaseStockMarketPlayerReadRepository } from "./supabaseStockMarketPlayerReadRepository.ts";
import {
  assertEquals,
  assertRejectsWithCodeAndStatus,
  assetRow,
  defaultTables,
  FakeClient,
  GAME_SESSION_ID,
  holdingRow,
  OTHER_SESSION_ID,
  PLAYER_SESSION_ID,
  repositoryWithTables,
} from "./supabaseStockMarketPlayerReadRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock player positions keep national currencies out of ECO totals", async () => {
  const result = await repositoryWithTables({
    ...defaultTables(),
    game_session_stock_assets: [assetRow({ listing_currency_code: "NRC" })],
  }).read({
    action: "read_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  });
  if (result.action !== "read_portfolio") {
    throw new Error("Expected portfolio.");
  }
  assertEquals(result.holdings[0].currencyCode, "NRC");
  assertEquals(result.summary.holdingsMarketValue, 0);
  assertEquals(result.summary.totalEquity, 9500);
  assertEquals(result.summary.valuationStatus, "partial_unconverted");
  assertEquals(result.summary.byCurrency, [{
    currencyCode: "NRC",
    marketValue: 625,
    costBasis: 500,
    unrealizedPnl: 125,
    realizedPnl: 30,
  }]);
});

Deno.test("stock player positions reject a foreign RPC result", async () => {
  const client = new FakeClient(defaultTables());
  client.rpc = async () => ({
    data: [holdingRow({ game_session_id: OTHER_SESSION_ID })],
    error: null,
  });
  const repository = new SupabaseStockMarketPlayerReadRepository(
    client as any,
    { now: () => new Date("2026-06-24T00:00:00Z") },
  );
  await assertRejectsWithCodeAndStatus(
    () =>
      repository.read({
        action: "read_portfolio",
        gameSessionId: GAME_SESSION_ID,
        playerSessionId: PLAYER_SESSION_ID,
        limit: 100,
      }),
    "stock_market_player_read_failed",
    500,
  );
});
