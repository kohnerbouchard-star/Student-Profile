import { SupabaseStockMarketPlayerReadRepository } from "./supabaseStockMarketPlayerReadRepository.ts";
import {
  assertEquals,
  assertRejectsWithCodeAndStatus,
  defaultTables,
  FakeClient,
  GAME_SESSION_ID,
  ORDER_ID,
  orderRow,
  OTHER_ORDER_ID,
  OTHER_PLAYER_SESSION_ID,
  OTHER_SESSION_ID,
  OTHER_TRADE_ID,
  PLAYER_SESSION_ID,
  playerSessionRow,
  repositoryWithTables,
  STOCK_ASSET_ID,
  TRADE_ID,
  tradeRow,
} from "./supabaseStockMarketPlayerReadRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock player read repository maps orders newest-first and scoped", async () => {
  const repository = repositoryWithTables({
    ...defaultTables(),
    stock_orders: [
      orderRow({ id: ORDER_ID, created_at: "2026-06-24T00:00:00.000Z" }),
      orderRow({
        id: OTHER_ORDER_ID,
        created_at: "2026-06-24T00:05:00.000Z",
        side: "sell",
        quantity: 1,
        execution_price: 130,
        gross_value: 130,
        idempotency_key: "order-2",
      }),
      orderRow({
        id: "00000000-0000-4000-8000-000000000299",
        game_session_id: OTHER_SESSION_ID,
        player_session_id: PLAYER_SESSION_ID,
        created_at: "2026-06-24T00:10:00.000Z",
      }),
      orderRow({
        id: "00000000-0000-4000-8000-000000000298",
        player_session_id: OTHER_PLAYER_SESSION_ID,
        created_at: "2026-06-24T00:15:00.000Z",
      }),
    ],
  });
  const result = await repository.read({
    action: "read_orders",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 10,
  });

  if (result.action !== "read_orders") {
    throw new Error("Expected read_orders result.");
  }

  assertEquals(result.orders.map((order) => order.orderId), [
    OTHER_ORDER_ID,
    ORDER_ID,
  ]);
  assertEquals(result.orders[0], {
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
  });
});

Deno.test("stock player read repository maps trades newest-first and scoped", async () => {
  const repository = repositoryWithTables({
    ...defaultTables(),
    stock_trades: [
      tradeRow({ id: TRADE_ID, created_at: "2026-06-24T00:00:00.000Z" }),
      tradeRow({
        id: OTHER_TRADE_ID,
        order_id: OTHER_ORDER_ID,
        created_at: "2026-06-24T00:05:00.000Z",
        side: "sell",
        quantity: 1,
        execution_price: 130,
        gross_value: 130,
      }),
      tradeRow({
        id: "00000000-0000-4000-8000-000000000399",
        game_session_id: OTHER_SESSION_ID,
        created_at: "2026-06-24T00:10:00.000Z",
      }),
      tradeRow({
        id: "00000000-0000-4000-8000-000000000398",
        player_session_id: OTHER_PLAYER_SESSION_ID,
        created_at: "2026-06-24T00:15:00.000Z",
      }),
    ],
  });
  const result = await repository.read({
    action: "read_trades",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 10,
  });

  if (result.action !== "read_trades") {
    throw new Error("Expected read_trades result.");
  }

  assertEquals(result.trades.map((trade) => trade.tradeId), [
    OTHER_TRADE_ID,
    TRADE_ID,
  ]);
  assertEquals(result.trades[0], {
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

Deno.test("stock player read repository maps missing and inactive player sessions", async () => {
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithTables({ ...defaultTables(), player_sessions: [] }).read({
        action: "read_portfolio",
        gameSessionId: GAME_SESSION_ID,
        playerSessionId: PLAYER_SESSION_ID,
        limit: 100,
      }),
    "player_session_not_found",
    404,
  );
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithTables({
        ...defaultTables(),
        player_sessions: [
          playerSessionRow({
            status: "revoked",
            revoked_at: "2026-06-24T00:00:00.000Z",
          }),
        ],
      }).read({
        action: "read_portfolio",
        gameSessionId: GAME_SESSION_ID,
        playerSessionId: PLAYER_SESSION_ID,
        limit: 100,
      }),
    "invalid_player_session",
    409,
  );
});

Deno.test("stock player read repository maps schema errors", async () => {
  const client = new FakeClient(defaultTables());
  client.tableErrors.set("stock_holdings", {
    code: "42P01",
    message: "relation stock_holdings does not exist",
  });
  const repository = new SupabaseStockMarketPlayerReadRepository(
    client as any,
    {
      now: () => new Date("2026-06-24T00:00:00.000Z"),
    },
  );

  await assertRejectsWithCodeAndStatus(
    () =>
      repository.read({
        action: "read_portfolio",
        gameSessionId: GAME_SESSION_ID,
        playerSessionId: PLAYER_SESSION_ID,
        limit: 100,
      }),
    "stock_market_player_read_schema_not_applied",
    500,
  );
});
