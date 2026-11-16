import { handlePlayerStockMarketTradingRequest } from "./playerStockMarketTradingHttpHandler.ts";
import {
  A,
  deps,
  expectError,
  G,
  retiredOrderBody,
  MockRepository,
  quoteBody,
  req,
} from "./playerStockMarketTradingHttpHandlerTestSupport.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("player Stock gateway enforces method, session, runner, and auth-before-cutover", async () => {
  await expectError(await handlePlayerStockMarketTradingRequest(
    req(quoteBody(), { method: "GET" }), deps()), 405, "method_not_allowed");
  await expectError(await handlePlayerStockMarketTradingRequest(
    req(quoteBody(), { token: null }), deps()), 401, "invalid_player_session");
  await expectError(await handlePlayerStockMarketTradingRequest(
    req(quoteBody(), { runner: true }), deps()), 400, "stock_runner_secret_not_allowed");
  await expectError(await handlePlayerStockMarketTradingRequest(
    req(retiredOrderBody()),
    deps({ resolve: () => Promise.resolve({
      ok: false, status: 401,
      error: { code: "invalid_player_session", message: "invalid", retryable: false },
    }) }),
  ), 401, "invalid_player_session");
  const repo = new MockRepository();
  await expectError(await handlePlayerStockMarketTradingRequest(
    req(retiredOrderBody()), deps({ repo })), 410, "stock_market_trading_retired");
  if (repo.inputs.length) throw new Error("Retired command reached repository");
});

Deno.test("player Stock gateway rejects private scope, UUIDs, query scope, and bad funding", async () => {
  const invalid = [
    quoteBody({ gameSessionId: "private" }),
    quoteBody({ note: G }),
    quoteBody({ ticker: "bad ticker" }),
    quoteBody({ expectedTickIndex: -1 }),
    quoteBody({ allocations: [] }),
    quoteBody({ allocations: [
      { sourceAccountKey: A, targetAmount: 100 },
      { sourceAccountKey: A, targetAmount: 200 },
    ] }),
    quoteBody({ allocations: [{ sourceAccountKey: "bad", targetAmount: 300 }] }),
    quoteBody({ idempotencyKey: "short" }),
  ];
  for (const body of invalid) {
    await expectError(await handlePlayerStockMarketTradingRequest(
      req(body), deps()), 400, "invalid_stock_market_trading_request");
  }
  await expectError(await handlePlayerStockMarketTradingRequest(
    req(quoteBody(), { query: "?playerId=private" }), deps()),
  400, "invalid_stock_market_trading_request");
});
