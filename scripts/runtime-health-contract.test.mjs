import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const adminProxy = require("../api/admin-proxy.js");
const { checkRuntimeHealth, readHealthConfiguration } = adminProxy.__healthTest;

const PRODUCTION_REF = "cgiukdjwicykrmtkhudh";
const PRODUCTION_URL = `https://${PRODUCTION_REF}.supabase.co`;
const SOURCE_SHA = "a".repeat(40);

function environment(overrides = {}) {
  return {
    ECONOVARIA_ENVIRONMENT: "production",
    ECONOVARIA_PROJECT_REF: PRODUCTION_REF,
    ECONOVARIA_SUPABASE_URL: PRODUCTION_URL,
    VERCEL_GIT_COMMIT_SHA: SOURCE_SHA,
    ...overrides,
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("runtime health requires exact environment and Supabase project binding", () => {
  const parsed = readHealthConfiguration(environment());
  assert.equal(parsed.environment, "production");
  assert.equal(parsed.projectRef, PRODUCTION_REF);
  assert.equal(parsed.supabaseUrl, PRODUCTION_URL);
  assert.equal(parsed.sourceCommit, SOURCE_SHA);

  assert.throws(
    () => readHealthConfiguration(environment({ ECONOVARIA_SUPABASE_URL: "https://example.com" })),
    /does not match/u,
  );
  assert.throws(
    () => readHealthConfiguration(environment({ ECONOVARIA_PROJECT_REF: "wrong" })),
    /project ref is invalid/u,
  );
});

test("runtime health reports ready only when every dependency confirms ready", async () => {
  const calls = [];
  const result = await checkRuntimeHealth({
    environment: environment(),
    timeoutMs: 500,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { ok: true, status: "ready" });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.services.length, 2);
  assert.deepEqual(
    calls.map((entry) => entry.url).sort(),
    [
      `${PRODUCTION_URL}/functions/v1/player-web-session-api/health`,
      `${PRODUCTION_URL}/functions/v1/web-session-api/health`,
    ],
  );
  assert.ok(calls.every((entry) => entry.options.method === "GET"));
  assert.ok(calls.every((entry) => entry.options.cache === "no-store"));
  assert.ok(calls.every((entry) => entry.options.redirect === "error"));
});

test("runtime health fails closed when one dependency is unavailable", async () => {
  const result = await checkRuntimeHealth({
    environment: environment(),
    timeoutMs: 500,
    fetchImpl: async (url) => {
      if (url.includes("player-web-session-api")) {
        return response(503, { ok: false, status: "degraded" });
      }
      return response(200, { ok: true, status: "ready" });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "degraded");
  assert.equal(result.services.find((entry) => entry.service === "player-web-session-api").ok, false);
});

test("runtime health rejects oversized and malformed dependency responses", async () => {
  const oversized = await checkRuntimeHealth({
    environment: environment(),
    timeoutMs: 500,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return "x".repeat(8_193);
      },
    }),
  });
  assert.equal(oversized.ok, false);

  const malformed = await checkRuntimeHealth({
    environment: environment(),
    timeoutMs: 500,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return "not-json";
      },
    }),
  });
  assert.equal(malformed.ok, false);
});
