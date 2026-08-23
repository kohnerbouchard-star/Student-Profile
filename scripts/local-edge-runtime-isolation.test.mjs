import assert from "node:assert/strict";
import test from "node:test";

import {
  restartLocalEdgeRuntime,
} from "./local-edge-runtime-isolation.mjs";

const CONFIG = `window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({
  "supabasePublishableKey": "sb_publishable_local_contract_1234567890"
});\n`;

function executable(names = "supabase_edge_runtime_backend\n") {
  const calls = [];
  const execFile = (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === "ps") return names;
    if (args[0] === "restart") return `${args[1]}\n`;
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
  return { execFile, calls };
}

test("restarts the only local Edge runtime and accepts gateway-normalized Player readiness", async () => {
  const { execFile, calls } = executable();
  const requests = [];
  const sleeps = [];
  const logs = [];
  const result = await restartLocalEdgeRuntime({
    execFile,
    readFileImpl: async () => CONFIG,
    fetchImpl: async (url, init) => {
      requests.push({ url, method: init.method, apikey: init.headers.apikey });
      return new Response(null, { status: 200 });
    },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    log: (value) => logs.push(value),
  });

  assert.equal(result.ready, true);
  assert.equal(result.pathsChecked, 2);
  assert.equal(result.stableWaves, 3);
  assert.equal(result.settleMs, 1_000);
  assert.deepEqual(calls, [
    ["docker", "ps", "--format", "{{.Names}}"],
    ["docker", "restart", "supabase_edge_runtime_backend"],
  ]);
  assert.equal(requests.length, 6);
  assert.deepEqual(
    requests.slice(0, 2).map(({ url, method }) => ({ url, method })),
    [
      { url: "http://127.0.0.1:4173/functions/v1/player-api", method: "OPTIONS" },
      { url: "http://127.0.0.1:4173/functions/v1/player-web-session-api", method: "OPTIONS" },
    ],
  );
  assert.deepEqual(sleeps, [500, 500, 1_000]);
  assert.ok(requests.every(({ apikey }) => apikey.startsWith("sb_publishable_")));
  assert.equal(logs.some((value) => value.includes("sb_publishable_")), false);
});

test("resets the readiness streak after an unhealthy wave while accepting direct and gateway preflights", async () => {
  const { execFile } = executable();
  const statuses = [
    200, 204,
    503, 204,
    204, 200,
    200, 204,
  ];
  const sleeps = [];
  const result = await restartLocalEdgeRuntime({
    execFile,
    timeoutMs: 5_000,
    pollMs: 25,
    stableWaves: 2,
    settleMs: 40,
    readFileImpl: async () => CONFIG,
    fetchImpl: async () => new Response(null, { status: statuses.shift() ?? 204 }),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    log: () => {},
  });

  assert.equal(result.ready, true);
  assert.equal(result.attempts, 4);
  assert.equal(result.stableWaves, 2);
  assert.deepEqual(sleeps, [25, 25, 25, 40]);
});

test("waits for both Player functions after the container restart", async () => {
  const { execFile } = executable();
  let wave = 0;
  const sleeps = [];
  const result = await restartLocalEdgeRuntime({
    execFile,
    timeoutMs: 5_000,
    pollMs: 25,
    stableWaves: 2,
    settleMs: 40,
    readFileImpl: async () => CONFIG,
    fetchImpl: async () => {
      const status = wave < 2 ? 503 : 204;
      wave += 1;
      return new Response(null, { status });
    },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    log: () => {},
  });

  assert.equal(result.ready, true);
  assert.equal(result.attempts, 3);
  assert.deepEqual(sleeps, [25, 25, 40]);
});

test("fails closed when the runtime container identity is ambiguous", async () => {
  const { execFile } = executable(
    "supabase_edge_runtime_one\nsupabase_edge_runtime_two\n",
  );
  await assert.rejects(
    () => restartLocalEdgeRuntime({
      execFile,
      readFileImpl: async () => CONFIG,
      fetchImpl: async () => new Response(null, { status: 204 }),
      log: () => {},
    }),
    /Expected one local Edge runtime container, found 2/u,
  );
});

test("refuses to restart infrastructure through a non-local gateway", async () => {
  const { execFile, calls } = executable();
  await assert.rejects(
    () => restartLocalEdgeRuntime({
      baseUrl: "https://econovaria.example",
      execFile,
      readFileImpl: async () => CONFIG,
      fetchImpl: async () => new Response(null, { status: 204 }),
      log: () => {},
    }),
    /restricted to the local acceptance gateway/u,
  );
  assert.deepEqual(calls, []);
});

test("rejects invalid stability configuration before restarting Docker", async () => {
  const { execFile, calls } = executable();
  await assert.rejects(
    () => restartLocalEdgeRuntime({
      stableWaves: 0,
      execFile,
      readFileImpl: async () => CONFIG,
      fetchImpl: async () => new Response(null, { status: 204 }),
      log: () => {},
    }),
    /stableWaves must be a positive integer/u,
  );
  assert.deepEqual(calls, []);
});
