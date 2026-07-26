import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInternalRunnerSignaturePayload,
  buildStockMarketTickRequest,
  triggerStockMarketTick,
} from "./trigger-stock-market-tick.mjs";

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const NONCE = "00000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-07-26T08:00:00.000Z");

function environment(overrides = {}) {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_market_contract",
    STOCK_MARKET_RUNNER_SECRET: "runner-secret",
    STOCK_MARKET_GAME_SESSION_ID: GAME_SESSION_ID,
    ...overrides,
  };
}

function deterministicOptions() {
  return {
    now: () => NOW,
    nonceFactory: () => NONCE,
  };
}

test("builds one project-bound, timestamped HMAC runner request", () => {
  const request = buildStockMarketTickRequest(environment({
    STOCK_MARKET_TICK_INDEX: "42",
    STOCK_MARKET_TICK_SEED: "staging-minute-42",
  }), deterministicOptions());

  assert.equal(
    request.url,
    "https://example.supabase.co/functions/v1/stock-market-runner",
  );
  assert.equal(request.headers.apikey, "sb_publishable_market_contract");
  assert.equal(request.headers.authorization, undefined);
  assert.equal(request.headers["x-stock-market-runner-secret"], undefined);
  assert.equal(request.headers["x-econovaria-runner-timestamp"], "1785052800");
  assert.equal(request.headers["x-econovaria-runner-nonce"], NONCE);
  assert.deepEqual(request.body, {
    action: "run_tick",
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 42,
    seed: "staging-minute-42",
  });
  assert.equal(request.bodyText, JSON.stringify(request.body));

  const bodyHash = createHash("sha256").update(request.bodyText).digest("hex");
  const canonical = buildInternalRunnerSignaturePayload({
    runnerName: "stock-market-runner",
    timestampSeconds: 1785052800,
    nonce: NONCE,
    method: "POST",
    url: request.url,
    bodyHash,
  });
  const expected = createHmac("sha256", "runner-secret")
    .update(canonical)
    .digest("base64url");
  assert.equal(
    request.headers["x-econovaria-runner-signature"],
    `v1=${expected}`,
  );
});

test("signature changes when project, route, body, timestamp, or nonce changes", () => {
  const baseline = buildStockMarketTickRequest(environment(), deterministicOptions());
  const variants = [
    buildStockMarketTickRequest(environment({
      SUPABASE_URL: "https://other.supabase.co",
    }), deterministicOptions()),
    buildStockMarketTickRequest(environment({
      STOCK_MARKET_TICK_INDEX: "1",
    }), deterministicOptions()),
    buildStockMarketTickRequest(environment(), {
      now: () => new Date(NOW.getTime() + 1000),
      nonceFactory: () => NONCE,
    }),
    buildStockMarketTickRequest(environment(), {
      now: () => NOW,
      nonceFactory: () => "00000000-0000-4000-8000-000000000005",
    }),
  ];
  for (const variant of variants) {
    assert.notEqual(
      variant.headers["x-econovaria-runner-signature"],
      baseline.headers["x-econovaria-runner-signature"],
    );
  }
});

test("rejects missing secrets and invalid game or nonce scope before network activity", async () => {
  for (const overrides of [
    { STOCK_MARKET_RUNNER_SECRET: "" },
    { SUPABASE_PUBLISHABLE_KEY: "" },
    { SUPABASE_PUBLISHABLE_KEY: "legacy-anon-key" },
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
        ...deterministicOptions(),
      }),
    );
    assert.equal(called, false);
  }

  await assert.rejects(
    triggerStockMarketTick({
      environment: environment(),
      fetchImpl: async () => new Response(),
      now: () => NOW,
      nonceFactory: () => "not-a-uuid",
    }),
  );
});

test("returns bounded tick evidence without exposing configured secrets", async () => {
  const result = await triggerStockMarketTick({
    environment: environment(),
    ...deterministicOptions(),
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.apikey, "sb_publishable_market_contract");
      assert.equal(options.headers.authorization, undefined);
      assert.equal(options.headers["x-stock-market-runner-secret"], undefined);
      assert.equal(options.headers["x-econovaria-runner-timestamp"], "1785052800");
      assert.equal(options.headers["x-econovaria-runner-nonce"], NONCE);
      assert.match(
        options.headers["x-econovaria-runner-signature"],
        /^v1=[A-Za-z0-9_-]{43}$/,
      );
      assert.equal(options.body, JSON.stringify({
        action: "run_tick",
        gameSessionId: GAME_SESSION_ID,
      }));
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
  assert.equal(JSON.stringify(result).includes("sb_publishable_market_contract"), false);
});

test("preserves closed-market, duplicate-tick, and replay failures as machine-readable errors", async () => {
  for (const [status, code] of [
    [409, "stock_market_closed"],
    [409, "duplicate_stock_market_tick"],
    [409, "internal_runner_replay_denied"],
  ]) {
    await assert.rejects(
      triggerStockMarketTick({
        environment: environment(),
        ...deterministicOptions(),
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
