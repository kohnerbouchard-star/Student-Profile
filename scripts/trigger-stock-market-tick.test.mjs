import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStockMarketTickRequest,
  triggerStockMarketTick,
} from "./trigger-stock-market-tick.mjs";

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

function environment(overrides = {}) {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    STOCK_MARKET_RUNNER_SECRET: "runner-secret",
    STOCK_MARKET_GAME_SESSION_ID: GAME_SESSION_ID,
    ...overrides,
  };
}

test("builds one secret-protected, game-scoped runner request", () => {
  const request = buildStockMarketTickRequest(environment({
    STOCK_MARKET_TICK_INDEX: "42",
    STOCK_MARKET_TICK_SEED: "staging-minute-42",
  }));

  assert.equal(
    request.url,
    "https://example.supabase.co/functions/v1/stock-market-runner",
  );
  assert.equal(request.headers.authorization, "Bearer anon-key");
  assert.equal(request.headers["x-stock-market-runner-secret"], "runner-secret");
  assert.deepEqual(request.body, {
    action: "run_tick",
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 42,
    seed: "staging-minute-42",
  });
});

test("rejects missing secrets and invalid game scope before network activity", async () => {
  for (const overrides of [
    { STOCK_MARKET_RUNNER_SECRET: "" },
    { SUPABASE_ANON_KEY: "" },
    { STOCK_MARKET_GAME_SESSION_ID: "not-a-uuid" },
  ]) {
    let called = false;
    await assert.rejects(
      triggerStockMarketTick({
        environment: environment(overrides),
        fetchImpl: async () => {
          called = true;
          return new Response();
        },
      }),
    );
    assert.equal(called, false);
  }
});

test("returns bounded tick evidence without exposing configured secrets", async () => {
  const result = await triggerStockMarketTick({
    environment: environment(),
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(
        options.headers["x-stock-market-runner-secret"],
        "runner-secret",
      );
      return new Response(JSON.stringify({
        ok: true,
        gameSessionId: GAME_SESSION_ID,
        tickIndex: 17,
        assetsProcessed: 24,
        ticksInserted: 24,
        generatedAt: "2026-07-20T03:30:00.000Z",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(result, {
    ok: true,
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 17,
    assetsProcessed: 24,
    ticksInserted: 24,
    generatedAt: "2026-07-20T03:30:00.000Z",
  });
  assert.equal(JSON.stringify(result).includes("runner-secret"), false);
  assert.equal(JSON.stringify(result).includes("anon-key"), false);
});

test("preserves closed-market and duplicate-tick failures as machine-readable errors", async () => {
  for (const [status, code] of [
    [409, "stock_market_closed"],
    [409, "duplicate_stock_market_tick"],
  ]) {
    await assert.rejects(
      triggerStockMarketTick({
        environment: environment(),
        fetchImpl: async () => new Response(JSON.stringify({
          error: {
            code,
            message: `Runner rejected ${code}.`,
            retryable: false,
          },
        }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      }),
      (error) => error.code === code && error.status === status,
    );
  }
});
