import { SupabaseStockMarketTradingRepository } from "./supabaseStockMarketTradingRepository.ts";
import { StockMarketTradingError } from "../contracts/stockMarketTradingContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const G = "00000000-0000-4000-8000-000000000001";
const P = "00000000-0000-4000-8000-000000000021";
const Q = "sbq_11111111111111111111111111111111";
const A = "bac_22222222222222222222222222222222";
const T = "btx_33333333333333333333333333333333";

Deno.test("Stock repository preserves retained calendar-gated order execution", async () => {
  const orderId = "00000000-0000-4000-8000-000000000201";
  const stockAssetId = "00000000-0000-4000-8000-000000000101";
  const playerSessionId = "00000000-0000-4000-8000-000000000011";
  const client = new FakeClient({
    execute_stock_market_order_calendar_gated: [{
      order_id: orderId, game_session_id: G, player_session_id: playerSessionId,
      player_id: P, stock_asset_id: stockAssetId, ticker: "AURA", side: "buy",
      quantity: "5.0000", execution_price: "100.0000", gross_value: "500.00",
      status: "filled", rejection_reason: null, cash_balance: "9500.00",
      cash_currency_code: "ECO", holding_quantity: "5.0000", average_cost: "100.0000",
    }],
  });
  const repo = new SupabaseStockMarketTradingRepository(client as any);
  const result = await repo.executeOrder({
    gameSessionId: G, playerSessionId, stockAssetId, side: "buy", quantity: 5,
    idempotencyKey: "retained-order-0001",
  });

  assertEquals(client.calls[0], {
    functionName: "execute_stock_market_order_calendar_gated",
    args: {
      p_game_session_id: G, p_player_session_id: playerSessionId,
      p_stock_asset_id: stockAssetId, p_side: "buy", p_quantity: 5,
      p_idempotency_key: "retained-order-0001",
    },
  });
  assertEquals([result.order.orderId, result.cash.balance, result.holding.quantity], [orderId, 9500, 5]);
});

Deno.test("Stock repository routes C3B, C3C, and C3D public commands", async () => {
  const client = new FakeClient({
    create_stock_buy_quote_v1: quoteRow(),
    settle_stock_buy_quote_v1: buyRow(),
    settle_stock_sell_v1: sellRow(),
  });
  const repo = new SupabaseStockMarketTradingRepository(client as any);
  const quote = await repo.createBuyQuote({
    gameSessionId: G, playerId: P, ticker: "AURA", quantity: 3,
    expectedPrice: 100, expectedTickIndex: 42,
    allocations: [{ sourceAccountKey: A, targetAmount: 300 }],
    idempotencyKey: "stock-quote-0001",
  });
  const buy = await repo.settleBuyQuote({
    gameSessionId: G, playerId: P, quoteKey: Q,
    idempotencyKey: "stock-buy-settle-0001",
  });
  const sell = await repo.settleSell({
    gameSessionId: G, playerId: P, ticker: "AURA", quantity: 2,
    expectedPrice: 105, expectedTickIndex: 43, destinationAccountKey: A,
    idempotencyKey: "stock-sell-settle-0001",
  });

  assertEquals(client.calls.map((call) => call.functionName), [
    "create_stock_buy_quote_v1", "settle_stock_buy_quote_v1", "settle_stock_sell_v1",
  ]);
  assertEquals(client.calls[0].args.p_allocations, [{ sourceAccountKey: A, targetAmount: 300 }]);
  assertEquals(client.cal|s[2].args.p_destination_account_key, A);
  assertEquals([quote.quoteKey, quote.listingCurrencyCode, quote.priceTickIndex], [Q, "XAL", 42]);
  assertEquals([buy.holdingQuantityAfter, buy.alreadyCompleted], [8, false]);
  assertEquals([sell.destinationAccountKey, sell.settlementTransactionKey], [A, T]);
  assertNoUuid({ quote, buy, sell });
});

Deno.test("Stock repository maps certified quote and settlement conflicts", async () => {
  const cases: readonly [string, "quote" | "buy" | "sell", string, number][] = [
    ["STOCK_BUY_QUOTE_PRICE_CHANGED", "quote", "stale_stock_price", 409],
    ["STOCK_BUY_SETTLEMENT_TICK_CHANGED", "buy", "stale_stock_tick", 409],
    ["STOCK_BUY_SETTLEMENT_QUOTE_EXPIRED", "buy", "stock_quote_expired", 409],
    ["PURCHASE_FUNDING_AVAILABLE_BALANCE_INSUFFICIENT", "buy", "insufficient_cash", 409],
    ["STOCK_SELL_SETTLEMENT_SHARES_INSUFFICIENT", "sell", "insufficient_shares", 409],
    ["BANK_AVAILABLE_BALANCE_INSUFFICIENT", "sell", "stock_market_liquidity_insufficient", 409],
    ["STOCK_SELL_SETTLEMENT_DESTINATION_INVALID", "sell", "stock_destination_account_invalid", 409],
  ];
  for (const [message, operation, code, status] of cases) {
    const repo = new SupabaseStockMarketTradingRepository(new FakeClient({}, { message }) as any);
    const run = operation === "quote"
      ? () => repo.createBuyQuote({
        gameSessionId: G, playerId: P, ticker: "AURA", quantity: 3,
        expectedPrice: 100, expectedTickIndex: 42,
        allocations: [{ sourceAccountKey: A, targetAmount: 300 }], idempotencyKey: "stock-quote-0001",
      })
      : operation === "buy"
      ? () => repo.settleBuyQuote({ gameSessionId: G, playerId: P, quoteKey: Q, idempotencyKey: "stock-buy-settle-0001" })
      : () => repo.settleSell({
        gameSessionId: G, playerId: P, ticker: "AURA", quantity: 2,
        expectedPrice: 105, expectedTickIndex: 43, destinationAccountKey: A,
        idempotencyKey: "stock-sell-settle-0001",
      });
    await rejects(run, code, status);
  }
});

Deno.test("Stock repository rejects missing schema and UUID-leaking evidence", async () => {
  const missing = new SupabaseStockMarketTradingRepository(
    new FakeClient({}, { code: "PGRST202", message: "function missing from schema cache" }) as any,
  );
  await rejects(
    () => missing.settleBuyQuote({ gameSessionId: G, playerId: P, quoteKey: Q, idempotencyKey: "stock-buy-settle-0001" }),
    "stock_market_trading_schema_not_applied",
    500,
  );
  const leaking = quoteRow();
  leaking.funding = { quote_key: "pfq_44444444444444444444444444444444", internal_id: G };
  await rejects(
    () => new SupabaseStockMarketTradingRepository(
      new FakeClient({ create_stock_buy_quote_v1: leaking }) as any,
    ).createBuyQuote({
      gameSessionId: G, playerId: P, ticker: "AURA", quantity: 3,
      expectedPrice: 100, expectedTickIndex: 42,
      allocations: [{ sourceAccountKey: A, targetAmount: 300 }], idempotencyKey: "stock-quote-0001",
    }),
    "stock_market_trading_failed",
    500,
  );
});

function quoteRow(): Record<string, any> {
  return {
    quote_key: Q, ticker: "AURA", listing_currency_code: "XAL", quantity: "3.0000",
    quoted_price: "100.0000", price_tick_index: 42, gross_value: "300.00",
    expires_at: "2026-08-30T13:05:00Z",
    funding: {
      quote_key: "pfq_44444444444444444444444444444444",
      funding_context_kind: "stocks.immediate-buy", funding_context_key: Q,
      target_currency_code: "XAL", target_amount: "300.00",
      lines: [{ source_account_key: A, target_contribution: "300.00" }],
    },
  };
}
function buyRow(): Record<string, any> {
  return {
    quote_key: Q, ticker: "AURA", listing_currency_code: "XAL", quantity: "3.0000",
    execution_price: "100.0000", price_tick_index: 42, gross_value: "300.00",
    holding_quantity_after: "8.0000", average_cost_after: "95.0000",
    filled_at: "2026-08-30T13:04:00Z", already_completed: false,
    funding: {
      receipt_key: "pfr_55555555555555555555555555555555",
      quote_key: "pfq_44444444444444444444444444444444",
      bank_transaction_key: "btx_66666666666666666666666666666666",
      target_currency_code: "XAL", target_amount: "300.00",
    },
  };
}
function sellRow(): Record<string, any> {
  return {
    ticker: "AURA", listing_currency_code: "XAL", quantity: "2.0000",
    execution_price: "105.0000", price_tick_index: 43, gross_value: "210.00",
    holding_quantity_after: "6.0000", average_cost_after: "95.0000",
    filled_at: "2026-08-30T13:06:00Z", destination_account_key: A,
    settlement_transaction_key: T, already_completed: false,
  };
}

class FakeClient {
  readonly calls: { functionName: string; args: any }[] = [];
  constructor(
    private readonly data: Record<string, unknown>,
    private readonly error: { code?: string; message: string } | null = null,
  ) {}
  async rpc(functionName: string, args: any) {
    this.calls.push({ functionName, args });
    return this.error
      ? { data: null, error: this.error }
      : { data: this.data[functionName] ?? null, error: null };
  }
}
async function rejects(run: () => Promise<unknown>, code: string, status: number) {
  try { await run(); } catch (error) {
    if (error instanceof StockMarketTradingError) {
      assertEquals([error.code, error.status], [code, status]);
      return;
    }
    throw error;
  }
  throw new Error(`Expected ${code}`);
}
function assertNoUuid(value: unknown) {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(JSON.stringify(value))) {
    throw new Error("UUID leaked");
  }
}
function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
