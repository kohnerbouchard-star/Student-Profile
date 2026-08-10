import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const { checkRuntimeHealth, readConfiguration } = require("../api/_runtime-health.js").__test;

const productionEnvironment = Object.freeze({
  ECONOVARIA_ENVIRONMENT: "production",
  ECONOVARIA_PROJECT_REF: "cgiukdjwicykrmtkhudh",
  ECONOVARIA_SUPABASE_URL: "https://cgiukdjwicykrmtkhudh.supabase.co",
  ECONOVARIA_SOURCE_SHA: "a".repeat(40),
});

test("runtime health binds the exact environment, project ref, URL, and source SHA", () => {
  assert.deepEqual(readConfiguration(productionEnvironment), {
    environment: "production",
    projectRef: "cgiukdjwicykrmtkhudh",
    supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
    sourceCommit: "a".repeat(40),
  });
  assert.throws(
    () => readConfiguration({
      ...productionEnvironment,
      ECONOVARIA_SUPABASE_URL: "https://eecvbssdvarfcykcfrny.supabase.co",
    }),
    /does not match the project ref/u,
  );
});

test("runtime health prefers the explicitly promoted source SHA", () => {
  const environment = {
    ...productionEnvironment,
    ECONOVARIA_SOURCE_SHA: "b".repeat(40),
    VERCEL_GIT_COMMIT_SHA: "c".repeat(40),
  };
  assert.equal(readConfiguration(environment).sourceCommit, "b".repeat(40));
});

test("runtime health requires both Staff and Player session boundaries", async () => {
  const requests = [];
  const result = await checkRuntimeHealth({
    environment: productionEnvironment,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({ ok: true, status: "ready" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.deepEqual(requests, [
    "https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/web-session-api/health",
    "https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/player-web-session-api/health",
  ]);
});

test("runtime health fails closed when either boundary is unavailable", async () => {
  const result = await checkRuntimeHealth({
    environment: productionEnvironment,
    fetchImpl: async (url) => new Response(
      JSON.stringify({ ok: !String(url).includes("player-web-session-api"), status: "ready" }),
      { status: String(url).includes("player-web-session-api") ? 503 : 200 },
    ),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "degraded");
});

test("login connectivity indicator consumes only the same-origin health route", async () => {
  const source = await readFile(
    new URL("../frontend/src/core/constants.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /window\.fetch\("\/api\/health"/u);
  assert.match(source, /CHECKING CONNECTION/u);
  assert.match(source, /RUNTIME READY/u);
  assert.match(source, /RUNTIME DEGRADED/u);
  assert.match(source, /RUNTIME UNAVAILABLE/u);
  assert.doesNotMatch(source, /functions\/v1\/.*health/u);
});
