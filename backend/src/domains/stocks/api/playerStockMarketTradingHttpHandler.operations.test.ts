import { handlePlayerStockMarketTradingRequest } from "./playerStockMarketTradingHttpHandler.ts";
import { StockMarketTradingError } from "../contracts/stockMarketTradingContracts.ts";
import {
  A,
  assertEquals,
  assertNoUuid,
  B,
  deps,
  expectError,
  G,
  MockRepository,
  P,
  Q,
  quoteBody,
  req,
} from "./playerStockMarketTradingHttpHandlerTestSupport.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("player Stock gateway derives scope and creates C3B quotes", async () => {
  const repo = new MockRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    req(quoteBody({
      ticker: "aura",
      allocations: [
        { sourceAccountKey: A, targetAmount: 200 },
        { sourceAccountKey: B, targetAmount: 100 },
      ],
    })),
    deps({ repo }),
  );
  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(repo.inputs[0], {
    operation: "quote", gameSessionId: G, playerId: P, ticker: "AURA",
    quantity: 3, expectedPrice: 100, expectedTickIndex: 42,
    allocations: [
      { sourceAccountKey: A, targetAmount: 200 },
      { sourceAccountKey: B, targetAmount: 100 },
    ],
    idempotencyKey: "stock-op-0001",
  });
  assertEquals([body.action, body.quote.quoteKey], ["create_buy_quote", Q]);
  assertEquals(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assertNoUuid(body);
});

Deno.test("player Stock gateway settles C3C buys and C3D sells with public keys", async () => {
  const repo = new MockRepository();
  const buy = await handlePlayerStockMarketTradingRequest(req({
    action: "settle_buy_quote", quoteKey: Q.toUpperCase(),
    idempotencyKey: "stock-buy-settle-0001",
  }), deps({ repo }));
  const sell = await handlePlayerStockMarketTradingRequest(req({
    action: "settle_sell", ticker: "aura", quantity: 2,
    expectedPrice: 105, expectedTickIndex: 43,
    destinationAccountKey: A.toUpperCase(),
  }, { idempotency: "stock-sell-settle-0001" }), deps({ repo }));
  assertEquals([buy.status, sell.status], [200, 200]);
  assertEquals(repo.inputs.slice(0, 2), [
    { operation: "buy", gameSessionId: G, playerId: P, quoteKey: Q, idempotencyKey: "stock-buy-settle-0001" },
    {
      operation: "sell", gameSessionId: G, playerId: P, ticker: "AURA",
      quantity: 2, expectedPrice: 105, expectedTickIndex: 43,
      destinationAccountKey: A, idempotencyKey: "stock-sell-settle-0001",
    },
  ]);
  assertNoUuid(await buy.json());
  assertNoUuid(await sell.json());
});

Deno.test("player Stock gateway preserves certified repository conflicts", async () => {
  for (const code of ["stock_market_closed", "insufficient_cash", "insufficient_shares", "stock_quote_expired"] as const) {
    const error = new StockMarketTradingError(code, "conflict", 409);
    await expectError(await handlePlayerStockMarketTradingRequest(
      req(quoteBody()), deps({ repo: new MockRepository(error) })), 409, code);
  }
});
