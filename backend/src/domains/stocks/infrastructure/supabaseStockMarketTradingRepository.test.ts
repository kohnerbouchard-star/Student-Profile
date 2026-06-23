import {
  SupabaseStockMarketTradingRepository,
} from "./supabaseStockMarketTradingRepository.ts";
import {
  type StockMarketOrderExecuteInput,
  StockMarketTradingError,
} from "../contracts/stockMarketTradingContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const ORDER_ID = "00000000-0000-4000-8000-000000000201";

Deno.test("stock trading repository calls execute order RPC with one game and player session", async () => {
  const client = new FakeClient({
    execute_stock_market_order: [orderRow()],
  });
  const repository = new SupabaseStockMarketTradingRepository(client as any);
  await repository.executeOrder({
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    stockAssetId: STOCK_ASSET_ID,
    side: "buy",
    quantity: 5,
    idempotencyKey: "order-1",
  });

  assertEquals(client.calls[0].functionName, "execute_stock_market_order");
  assertEquals(client.calls[0].args, {
    p_game_session_id: GAME_SESSION_ID,
    p_player_session_id: PLAYER_SESSION_ID,
    p_stock_asset_id: STOCK_ASSET_ID,
    p_side: "buy",
    p_quantity: 5,
    p_idempotency_key: "order-1",
  });
});

Deno.test("stock trading repository maps filled buy response with actual cash balance", async () => {
  const repository = new SupabaseStockMarketTradingRepository(
    new FakeClient({
      execute_stock_market_order: [orderRow()],
    }) as any,
  );
  const result = await repository.executeOrder(orderInput());

  assertEquals(result, {
    order: {
      orderId: ORDER_ID,
      gameSessionId: GAME_SESSION_ID,
      playerSessionId: PLAYER_SESSION_ID,
      stockAssetId: STOCK_ASSET_ID,
      ticker: "AURA",
      side: "buy",
      quantity: 5,
      executionPrice: 100,
      grossValue: 500,
      status: "filled",
      rejectionReason: null,
    },
    cash: {
      accountType: "cash",
      currencyCode: "ECO",
      balance: 9500,
    },
    holding: {
      quantity: 5,
      averageCost: 100,
    },
  });
});

Deno.test("stock trading repository maps filled sell response with actual cash balance", async () => {
  const repository = new SupabaseStockMarketTradingRepository(
    new FakeClient({
      execute_stock_market_order: [orderRow({
        side: "sell",
        quantity: 2,
        gross_value: 210,
        cash_balance: 9710,
        holding_quantity: 3,
        average_cost: 100,
      })],
    }) as any,
  );
  const result = await repository.executeOrder(
    orderInput({ side: "sell", quantity: 2 }),
  );

  assertEquals(result.order.side, "sell");
  assertEquals(result.order.quantity, 2);
  assertEquals(result.order.grossValue, 210);
  assertEquals(result.cash.balance, 9710);
  assertEquals(result.cash.currencyCode, "ECO");
  assertEquals(result.holding.quantity, 3);
});

Deno.test("stock trading repository maps insufficient cash to 409", async () => {
  await assertRejectsWithCodeAndStatus(
    () =>
      new SupabaseStockMarketTradingRepository(
        new FakeClient({
          execute_stock_market_order: [orderRow({
            status: "rejected",
            rejection_reason: "insufficient_cash",
          })],
        }) as any,
      ).executeOrder(orderInput()),
    "insufficient_cash",
    409,
  );
});

Deno.test("stock trading repository maps insufficient shares to 409", async () => {
  await assertRejectsWithCodeAndStatus(
    () =>
      new SupabaseStockMarketTradingRepository(
        new FakeClient({
          execute_stock_market_order: [orderRow({
            side: "sell",
            status: "rejected",
            rejection_reason: "insufficient_shares",
          })],
        }) as any,
      ).executeOrder(orderInput({ side: "sell" })),
    "insufficient_shares",
    409,
  );
});

Deno.test("stock trading repository maps missing game, player, and stock to 404", async () => {
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithError("STOCK_TRADING_GAME_SESSION_NOT_FOUND")
        .executeOrder(orderInput()),
    "game_session_not_found",
    404,
  );
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithError("STOCK_TRADING_PLAYER_SESSION_NOT_FOUND")
        .executeOrder(orderInput()),
    "player_session_not_found",
    404,
  );
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithError("STOCK_TRADING_STOCK_ASSET_NOT_FOUND")
        .executeOrder(orderInput()),
    "stock_asset_not_found",
    404,
  );
});

Deno.test("stock trading repository maps missing schema to schema-not-applied", async () => {
  await assertRejectsWithCodeAndStatus(
    () =>
      new SupabaseStockMarketTradingRepository(
        new FakeClient({}, {
          code: "42P01",
          message: "relation account_balances does not exist",
        }) as any,
      ).executeOrder(orderInput()),
    "stock_market_trading_schema_not_applied",
    500,
  );
});

Deno.test("stock trading repository forwards idempotency key", async () => {
  const client = new FakeClient({
    execute_stock_market_order: [orderRow()],
  });
  const repository = new SupabaseStockMarketTradingRepository(client as any);
  await repository.executeOrder(
    orderInput({ idempotencyKey: "client-key-123" }),
  );

  assertEquals(client.calls[0].args.p_idempotency_key, "client-key-123");
});

Deno.test("stock trading repository does not call initialize portfolio RPC", async () => {
  const client = new FakeClient({
    execute_stock_market_order: [orderRow()],
  });
  const repository = new SupabaseStockMarketTradingRepository(client as any);
  await repository.executeOrder(orderInput());

  assertEquals(client.calls.map((call) => call.functionName), [
    "execute_stock_market_order",
  ]);
});

Deno.test("stock trading repository does not call runner, read, or seed RPCs", async () => {
  const client = new FakeClient({
    execute_stock_market_order: [orderRow()],
  });
  const repository = new SupabaseStockMarketTradingRepository(client as any);
  await repository.executeOrder(orderInput());

  assertEquals(client.calls.map((call) => call.functionName), [
    "execute_stock_market_order",
  ]);
});

function orderInput(
  overrides: Partial<StockMarketOrderExecuteInput> = {},
): StockMarketOrderExecuteInput {
  return {
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    stockAssetId: STOCK_ASSET_ID,
    side: "buy" as const,
    quantity: 5,
    idempotencyKey: "order-1",
    ...overrides,
  };
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    order_id: ORDER_ID,
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "buy",
    quantity: 5,
    execution_price: 100,
    gross_value: 500,
    status: "filled",
    rejection_reason: null,
    cash_balance: 9500,
    cash_currency_code: "ECO",
    holding_quantity: 5,
    average_cost: 100,
    ...overrides,
  };
}

function repositoryWithError(message: string) {
  return new SupabaseStockMarketTradingRepository(
    new FakeClient({}, { message }) as any,
  );
}

async function assertRejectsWithCodeAndStatus(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketTradingError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      return;
    }

    throw error;
  }

  throw new Error(`Expected StockMarketTradingError with code ${code}.`);
}

class FakeClient {
  readonly calls: { readonly functionName: string; readonly args: any }[] = [];

  constructor(
    private readonly rowsByFunction: Record<
      string,
      readonly Record<string, unknown>[]
    >,
    private readonly error:
      | { readonly code?: string; readonly message: string }
      | null = null,
  ) {}

  async rpc(functionName: string, args: any) {
    this.calls.push({ functionName, args });

    if (this.error) {
      return { data: null, error: this.error };
    }

    return {
      data: this.rowsByFunction[functionName] ?? null,
      error: null,
    };
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
