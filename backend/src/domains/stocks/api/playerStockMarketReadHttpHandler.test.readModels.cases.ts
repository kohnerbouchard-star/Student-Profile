import { handlePlayerStockMarketReadRequest } from "./playerStockMarketReadHttpHandler.ts";
import {
  assertEquals,
  dependencies,
  FakeClient,
  GAME_SESSION_ID,
  holdingDto,
  ORDER_ID,
  OTHER_ORDER_ID,
  OTHER_TRADE_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
  request,
  STOCK_ASSET_ID,
  tables,
  TRADE_ID,
} from "./playerStockMarketReadHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock read returns portfolio DTO through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
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
    holdings: [holdingDto()],
  });
});

Deno.test("player stock read returns holdings DTO through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_holdings"),
    "read_holdings",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.action, "read_holdings");
  assertEquals(body.holdings, [holdingDto()]);
  assertEquals(body.cash.balance, 9500);
  assertEquals(body.summary.totalEquity, 10125);
});

Deno.test("player stock read returns orders newest-first through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_orders", { limit: "50" }),
    "read_orders",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    action: "read_orders",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    playerId: PLAYER_ID,
    orders: [
      {
        orderId: OTHER_ORDER_ID,
        stockAssetId: STOCK_ASSET_ID,
        ticker: "AURA",
        side: "sell",
        quantity: 1,
        executionPrice: 130,
        grossValue: 130,
        status: "filled",
        rejectionReason: null,
        idempotencyKey: "order-2",
        createdAt: "2026-06-24T00:05:00.000Z",
      },
      {
        orderId: ORDER_ID,
        stockAssetId: STOCK_ASSET_ID,
        ticker: "AURA",
        side: "buy",
        quantity: 5,
        executionPrice: 100,
        grossValue: 500,
        status: "filled",
        rejectionReason: null,
        idempotencyKey: "order-1",
        createdAt: "2026-06-24T00:00:00.000Z",
      },
    ],
  });
});

Deno.test("player stock read returns trades newest-first through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_trades"),
    "read_trades",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(
    body.trades.map((trade: { readonly tradeId: string }) => trade.tradeId),
    [
      OTHER_TRADE_ID,
      TRADE_ID,
    ],
  );
  assertEquals(body.trades[0], {
    tradeId: OTHER_TRADE_ID,
    orderId: OTHER_ORDER_ID,
    stockAssetId: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "sell",
    quantity: 1,
    executionPrice: 130,
    grossValue: 130,
    createdAt: "2026-06-24T00:05:00.000Z",
  });
});

Deno.test("player stock read stays read-only", async () => {
  const client = new FakeClient(tables());
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies({ client }),
  );

  assertEquals(response.status, 200);
  assertEquals(client.forbiddenCalls, []);
});
