import { SupabaseStockMarketPlayerReadRepository } from "./supabaseStockMarketPlayerReadRepository.ts";
import {
  assertEquals,
  assertTableFilter,
  assetRow,
  defaultTables,
  FakeClient,
  GAME_SESSION_ID,
  holdingRow,
  OTHER_PLAYER_ID,
  OTHER_PLAYER_SESSION_ID,
  OTHER_SESSION_ID,
  OTHER_STOCK_ASSET_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
  repositoryWithTables,
  STOCK_ASSET_ID,
} from "./supabaseStockMarketPlayerReadRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock player read repository maps cash, holdings, and portfolio math", async () => {
  const client = new FakeClient(defaultTables());
  const repository = new SupabaseStockMarketPlayerReadRepository(
    client as any,
    {
      now: () => new Date("2026-06-24T00:00:00.000Z"),
    },
  );
  const result = await repository.read({
    action: "read_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  });

  assertEquals(result, {
    action: "read_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    playerId: PLAYER_ID,
    cash: {
      accountType: "checking",
      currencyCode: "ECO",
      balance: 9500,
    },
    summary: {
      currencyCode: "ECO",
      valuationStatus: "complete",
      byCurrency: [{
        currencyCode: "ECO",
        marketValue: 625,
        costBasis: 500,
        unrealizedPnl: 125,
        realizedPnl: 30,
      }],
      cashBalance: 9500,
      holdingsMarketValue: 625,
      totalEquity: 10125,
      totalCostBasis: 500,
      unrealizedPnl: 125,
      realizedPnl: 30,
      positionsCount: 1,
    },
    holdings: [{
      stockAssetId: STOCK_ASSET_ID,
      ticker: "AURA",
      companyName: "Aurora Aerospace Systems",
      sector: "AI_AEROSPACE",
      countryCode: "SOLVEND",
      currencyCode: "ECO",
      quantity: 5,
      averageCost: 100,
      currentPrice: 125,
      marketValue: 625,
      costBasis: 500,
      unrealizedPnl: 125,
      unrealizedPnlPct: 25,
      realizedPnl: 30,
    }],
  });
});

Deno.test("stock player read repository queries only requested game and player data", async () => {
  const client = new FakeClient({
    ...defaultTables(),
    stock_holdings: [
      holdingRow(),
      holdingRow({
        game_session_id: OTHER_SESSION_ID,
        player_session_id: OTHER_PLAYER_SESSION_ID,
        player_id: PLAYER_ID,
        stock_asset_id: OTHER_STOCK_ASSET_ID,
        ticker: "LEAK",
      }),
      holdingRow({
        player_id: OTHER_PLAYER_ID,
        stock_asset_id: OTHER_STOCK_ASSET_ID,
        ticker: "OTHR",
      }),
    ],
    game_session_stock_assets: [
      assetRow(),
      assetRow({
        id: OTHER_STOCK_ASSET_ID,
        game_session_id: OTHER_SESSION_ID,
        ticker: "LEAK",
        current_price: 999,
      }),
    ],
  });
  const repository = new SupabaseStockMarketPlayerReadRepository(
    client as any,
    {
      now: () => new Date("2026-06-24T00:00:00.000Z"),
    },
  );
  const result = await repository.read({
    action: "read_holdings",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  });

  if (result.action !== "read_holdings") {
    throw new Error("Expected read_holdings result.");
  }

  assertEquals(result.holdings.map((holding) => holding.ticker), ["AURA"]);
  assertTableFilter(
    client,
    "player_sessions",
    "game_session_id",
    GAME_SESSION_ID,
  );
  assertTableFilter(client, "player_sessions", "id", PLAYER_SESSION_ID);
  assertEquals(client.rpcCalls, [{
    functionName: "read_player_stock_positions_v1",
    args: { p_game_session_id: GAME_SESSION_ID, p_player_id: PLAYER_ID },
  }]);
  assertTableFilter(
    client,
    "game_session_stock_assets",
    "game_session_id",
    GAME_SESSION_ID,
  );
});

Deno.test("stock player read repository handles zero cost basis PnL percentage safely", async () => {
  const repository = repositoryWithTables({
    ...defaultTables(),
    stock_holdings: [
      holdingRow({ quantity: 2, average_cost: 0, realized_pnl: 0 }),
    ],
    game_session_stock_assets: [assetRow({ current_price: 25 })],
  });
  const result = await repository.read({
    action: "read_holdings",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  });

  if (result.action !== "read_holdings") {
    throw new Error("Expected read_holdings result.");
  }

  assertEquals(result.holdings[0].costBasis, 0);
  assertEquals(result.holdings[0].unrealizedPnl, 50);
  assertEquals(result.holdings[0].unrealizedPnlPct, 0);
});
