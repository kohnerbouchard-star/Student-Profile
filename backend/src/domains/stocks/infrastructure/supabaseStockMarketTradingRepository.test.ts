import { SupabaseStockMarketTradingRepository } from "./supabaseStockMarketTradingRepository.ts";
import { StockMarketTradingError } from "../contracts/stockMarketTradingContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const G = "00000000-0000-4000-8000-000000000001";
const PS = "00000000-0000-4000-8000-000000000011";
const P = "00000000-0000-4000-8000-000000000021";
const ASSET = "00000000-0000-4000-8000-000000000101";
const ORDER = "00000000-0000-4000-8000-000000000201";
const Q = "sbq_11111111111111111111111111111111";
const A = "bac_22222222222222222222222222222222";
const T = "btx_33333333333333333333333333333333";

Deno.test("Stock repository preserves retained execution and routes C3B/C3C/C3D commands", async () => {
  const client = new FakeClient({
    execute_stock_market_order_calendar_gated: [{
      order_id: ORDER,
      game_session_id: G,
      player_session_id: PS,
      player_id: P,
      stock_asset_id: ASSET,
      ticker: "AURA",
      side: "buy",
      quantity: "5.0000",
      execution_price: "100.0000",
      gross_value: "500.00",
      status: "filled",
      rejection_reason: null,
      cash_balance: "9500.00",
      cash_currency_code: "ECO",
      holding_quantity: "5.0000",
      average_cost: "100.0000",
    }],
    create_stock_buy_quote_v1: quoteRow(),
    settle_stock_buy_quote_v1: buyRow(),
    settle_stock_sell_v1: sellRow(),
  });
  const repo = new SupabaseStockMarketTradingRepository(client as any);

  const retained = await repo.executeOrder({
    gameSessionId: G,
    playerSessionId: PS,
    stockAssetId: ASSET,
    side: "buy",
    quantity: 5,
    idempotencyKey: "retained-order-0001",
  });
  const quote = await repo.createBuyQuote({
    gameSessionId: G,
    playerId: P,
    ticker: "AURA",
    quantity: 3,
    expectedPrice: 100,
    expectedTickIndex: 42,
    allocations: [{ sourceAccountKey: A, targetAmount: 300 }],
    idempotencyKey: "stock-quote-0001",
  });
  const buy = await repo.settleBuyQuote({
    gameSessionId: G,
    playerId: P,
    quoteKey: Q,
    idempotencyKey: "stock-buy-settle-0001",
  });
  const sell = await repo.settleSell({
    gameSessionId: G,
    playerId: P,
    ticker: "AURA",
    quantity: 2,
    expectedPrice: 105,
    expectedTickIndex: 43,
    destinationAccountKey: A,
    idempotencyKey: "stock-sell-settle-0001",
  });

  assertEquals(client.calls.map((call) => call.functionName), [
    "execute_stock_market_order_calendar_gated",
    "create_stock_buy_quote_v1",
    "settle_stock_buy_quote_v1",
    "settle_stock_sell_v1",
  ]);
  assertEquals(client.calls[1].args.p_allocations, [{
    sourceAccountKey: A,
    targetAmount: 300,
  }]);
  assertEquals(client.calls[3].args.p_destination_account_key, A);
  assertEquals([retained.order.orderId, retained.cash.balance], [ORDER, 9500]);
  assertEquals([quote.quoteKey, quote.listingCurrencyCode, quote.priceTickIndex], [Q, "XAL", 42]);
  assertEquals([buy.holdingQuantityAfter, buy.alreadyCompleted], [8, false]);
  assertEquals([sell.destinationAccountKey, sell.settlementTransactionKey], [A, T]);
  assertNoUuid({ quote, buy, sell });
});

Deno.test("Stock repository preserves retained and C3 conflict errors", async () => {
  const retained = new SupabaseStockMarketTradingRepository(new FakeClient({}, {
    execute_stock_market_order_calendar_gated: { message: "STOCK_TRADING_MARKET_CLOSED" },
  }) as any);
  await expectError(() => retained.executeOrder({
    gameSessionId: G,
    playerSessionId: PS,
    stockAssetId: ASSET,
    side: "buy",
    quantity: 1,
    idempotencyKey: "retained-order-0002",
  }), "stock_market_closed", 409);

  const c3 = new SupabaseStockMarketTradingRepository(new FakeClient({}, {
    create_stock_buy_quote_v1: { message: "STOCK_BUY_QUOTE_PRICE_CHANGED" },
  }) as any);
  await expectError(() => c3.createBuyQuote({
    gameSessionId: G,
    playerId: P,
    ticker: "AURA",
    quantity: 1,
    expectedPrice: 100,
    expectedTickIndex: 42,
    allocations: [{ sourceAccountKey: A, targetAmount: 100 }],
    idempotencyKey: "stock-quote-0002",
  }), "stale_stock_price", 409);
});

function quoteRow(): Record<string, unknown> {
  return {
    quote_key: Q,
    ticker: "AURA",
    listing_currency_code: "XAL",
    quantity: "3.0000",
    quoted_price: "100.0000",
    price_tick_index: 42,
    gross_value: "300.00",
    expires_at: "2026-08-30T13:05:00Z",
    funding: { quote_key: "pfq_44444444444444444444444444444444" },
  };
}

function buyRow(): Record<string, unknown> {
  return {
    quote_key: Q,
    ticker: "AURA",
    listing_currency_code: "XAL",
    quantity: "3.0000",
    execution_price: "100.0000",
    price_tick_index: 42,
    gross_value: "300.00",
    holding_quantity_after: "8.0000",
    average_cost_after: "95.0000",
    filled_at: "2026-08-30T13:04:00Z",
    already_completed: false,
    funding: { receipt_key: "pfr_55555555555555555555555555555555" },
  };
}

function sellRow(): Record<string, unknown> {
  return {
    ticker: "AURA",
    listing_currency_code: "XAL",
    quantity: "2.0000",
    execution_price: "105.0000",
    price_tick_index: 43,
    gross_value: "210.00",
    holding_quantity_after: "6.0000",
    average_cost_after: "95.0000",
    filled_at: "2026-08-30T13:06:00Z",
    destination_account_key: A,
    settlement_transaction_key: T,
    already_completed: false,
  };
}

class FakeClient {
  readonly calls: { functionName: string; args: any }[] = [];

  constructor(
    private readonly data: Record<string, unknown>,
    private readonly errors: Record<string, { code?: string; message: string }> = {},
  ) {}

  async rpc(functionName: string, args: any) {
    this.calls.push({ functionName, args });
    const error = this.errors[functionName] ?? null;
    return error
      ? { data: null, error }
      : { data: this.data[functionName] ?? null, error: null };
  }
}

async function expectError(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketTradingError) {
      assertEquals([error.code, error.status], [code, status]);
      return;
    }
    throw error;
  }
  throw new Error(`Expected ${code}`);
}

function assertNoUuid(value: unknown): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(JSON.stringify(value))) {
    throw new Error("UUID leaked");
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
