import assert from "node:assert/strict";
import test from "node:test";

import {
  restartLocalEdgeRuntime,
} from "./local-edge-runtime-isolation.mjs";

const EDGE_CONTAINER = "supabase_edge_runtime_backend";
const KONG_CONTAINER = "supabase_kong_backend";
const CONTAINERS = `${EDGE_CONTAINER}\n${KONG_CONTAINER}\n`;
const CONFIG = `window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({
  "supabasePublishableKey": "sb_publishable_local_contract_1234567890"
});\n`;

function executable({
  names = CONTAINERS,
  onRestart = () => {},
  running = () => true,
} = {}) {
  const calls = [];
  let recoveryRestarts = 0;
  const execFile = (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === "ps") return names;
    if (args[0] === "restart") {
      if (args[1] === EDGE_CONTAINER) recoveryRestarts += 1;
      onRestart(recoveryRestarts, args[1]);
      return `${args.slice(1).join("\n")}\n`;
    }
    if (args[0] === "inspect") {
      const containerName = args.at(-1);
      return running({ containerName, restarts: recoveryRestarts }) ? "true\n" : "false\n";
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
  return { execFile, calls, restartCount: () => recoveryRestarts };
}

function readyResponse(url) {
  const pathname = new URL(url).pathname;
  return new Response(null, {
    status: pathname === "/" || pathname.endsWith("/health") ? 200 : 204,
  });
}

test("restarts the exact Edge and Kong containers and proves three stable gateway waves", async () => {
  const { execFile, calls } = executable();
  const requests = [];
  const sleeps = [];
  const logs = [];
  const result = await restartLocalEdgeRuntime({
    execFile,
    readFileImpl: async () => CONFIG,
    fetchImpl: async (url, init) => {
      requests.push({
        url,
        method: init.method,
        apikey: init.headers?.apikey,
        origin: init.headers?.Origin,
      });
      return readyResponse(url);
    },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    log: (value) => logs.push(value),
  });

  assert.equal(result.ready, true);
  assert.equal(result.recoveryAttempt, 1);
  assert.equal(result.recoveryAttempts, 2);
  assert.equal(result.readinessWaves, 3);
  assert.equal(result.pathsChecked, 4);
  assert.equal(result.stableWaves, 3);
  assert.equal(result.settleMs, 1_000);
  assert.deepEqual(calls[0], [
    "docker",
    "ps",
    "-a",
    "--format",
    "{{.Names}}",
  ]);
  assert.deepEqual(
    calls.filter((call) => call[1] === "restart"),
    [
      ["docker", "restart", EDGE_CONTAINER],
      ["docker", "restart", KONG_CONTAINER],
    ],
  );
  assert.deepEqual(
    requests.slice(0, 4).map(({ url, method }) => ({ url, method })),
    [
      { url: "http://127.0.0.1:4173/", method: "GET" },
      { url: "http://127.0.0.1:4173/functions/v1/player-api", method: "OPTIONS" },
      {
        url: "http://127.0.0.1:4173/functions/v1/player-web-session-api",
        method: "OPTIONS",
      },
      {
        url: "http://127.0.0.1:4173/functions/v1/bootstrap-api/health",
        method: "GET",
      },
    ],
  );
  assert.equal(requests.length, 12);
  assert.ok(
    requests
      .filter(({ url }) => new URL(url).pathname !== "/")
      .every(({ apikey }) => apikey?.startsWith("sb_publishable_")),
  );
  assert.ok(
    requests
      .filter(({ url }) => new URL(url).pathname === "/")
      .every(({ apikey, origin }) => apikey === undefined && origin === undefined),
  );
  assert.ok(
    requests
      .filter(({ url }) => new URL(url).pathname.endsWith("/bootstrap-api/health"))
      .every(({ method, origin }) => method === "GET" && origin === undefined),
  );
  assert.equal(requests[1].origin, "http://127.0.0.1:4173");
  assert.equal(requests[2].origin, "http://127.0.0.1:4173");
  assert.deepEqual(sleeps, [500, 500, 1_000]);
  assert.equal(logs.some((value) => value.includes("sb_publishable_")), false);
  assert.equal(logs.some((value) => value.includes(EDGE_CONTAINER)), false);
});

test("performs only one bounded recovery when the first warmup loses Edge runtime", async () => {
  let edgeRunning = true;
  let currentRestart = 0;
  const { execFile, calls } = executable({
    onRestart(restarts) {
      currentRestart = restarts;
      edgeRunning = true;
    },
    running({ containerName }) {
      return containerName === EDGE_CONTAINER ? edgeRunning : true;
    },
  });

  const result = await restartLocalEdgeRuntime({
    execFile,
    pollMs: 0,
    settleMs: 0,
    readFileImpl: async () => CONFIG,
    fetchImpl: async (url) => {
      if (
        currentRestart === 1 &&
        new URL(url).pathname === "/functions/v1/player-api"
      ) {
        edgeRunning = false;
        return new Response(null, { status: 502 });
      }
      return readyResponse(url);
    },
    sleep: async () => {},
    log: () => {},
  });

  assert.equal(result.ready, true);
  assert.equal(result.recoveryAttempt, 2);
  assert.equal(result.recoveryAttempts, 2);
  assert.equal(result.readinessWaves, 4);
  assert.deepEqual(
    calls.filter((call) => call[1] === "restart"),
    [
      ["docker", "restart", EDGE_CONTAINER],
      ["docker", "restart", KONG_CONTAINER],
      ["docker", "restart", EDGE_CONTAINER],
      ["docker", "restart", KONG_CONTAINER],
    ],
  );
});

test("restarts again when running containers retain stale Kong DNS", async () => {
  let currentRecovery = 0;
  const { execFile, calls } = executable({
    onRestart(restarts, containerName) {
      if (containerName === EDGE_CONTAINER) currentRecovery = restarts;
    },
  });

  const result = await restartLocalEdgeRuntime({
    execFile,
    pollMs: 0,
    settleMs: 0,
    readFileImpl: async () => CONFIG,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (
        currentRecovery === 1 &&
        path === "/functions/v1/player-api"
      ) {
        return new Response(null, { status: 503 });
      }
      return readyResponse(url);
    },
    sleep: async () => {},
    log: () => {},
  });

  assert.equal(result.ready, true);
  assert.equal(result.recoveryAttempt, 2);
  assert.equal(result.readinessWaves, 9);
  assert.deepEqual(
    calls.filter((call) => call[1] === "restart"),
    [
      ["docker", "restart", EDGE_CONTAINER],
      ["docker", "restart", KONG_CONTAINER],
      ["docker", "restart", EDGE_CONTAINER],
      ["docker", "restart", KONG_CONTAINER],
    ],
  );
});

test("resets the readiness streak after an unhealthy wave", async () => {
  const { execFile } = executable();
  const playerStatuses = [204, 503, 204, 204];
  const sleeps = [];
  const result = await restartLocalEdgeRuntime({
    execFile,
    pollMs: 25,
    stableWaves: 2,
    settleMs: 40,
    readFileImpl: async () => CONFIG,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path.endsWith("/health")) {
        return new Response(null, { status: 200 });
      }
      if (path === "/functions/v1/player-api") {
        return new Response(null, { status: playerStatuses.shift() ?? 204 });
      }
      return new Response(null, { status: 204 });
    },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    log: () => {},
  });

  assert.equal(result.ready, true);
  assert.equal(result.readinessWaves, 4);
  assert.equal(result.stableWaves, 2);
  assert.deepEqual(sleeps, [25, 25, 25, 40]);
});

test("fails closed when either exact runtime container identity is ambiguous", async () => {
  for (const names of [
    `${EDGE_CONTAINER}\nsupabase_edge_runtime_other\n${KONG_CONTAINER}\n`,
    `${EDGE_CONTAINER}\n${KONG_CONTAINER}\nsupabase_kong_other\n`,
  ]) {
    const { execFile, calls } = executable({ names });
    await assert.rejects(
      () => restartLocalEdgeRuntime({
        execFile,
        readFileImpl: async () => CONFIG,
        fetchImpl: async (url) => readyResponse(url),
        log: () => {},
      }),
      /Expected one local (?:Edge runtime|Kong gateway) container, found 2/u,
    );
    assert.equal(calls.some((call) => call[1] === "restart"), false);
  }
});

test("refuses infrastructure operations through a non-local gateway", async () => {
  const { execFile, calls } = executable();
  await assert.rejects(
    () => restartLocalEdgeRuntime({
      baseUrl: "https://econovaria.example",
      execFile,
      readFileImpl: async () => CONFIG,
      fetchImpl: async (url) => readyResponse(url),
      log: () => {},
    }),
    /restricted to the local acceptance gateway/u,
  );
  assert.deepEqual(calls, []);
});

test("never permits more than two recovery attempts", async () => {
  const { execFile, calls } = executable();
  await assert.rejects(
    () => restartLocalEdgeRuntime({
      recoveryAttempts: 3,
      execFile,
      readFileImpl: async () => CONFIG,
      fetchImpl: async (url) => readyResponse(url),
      log: () => {},
    }),
    /recoveryAttempts must be between 1 and 2/u,
  );
  assert.deepEqual(calls, []);
});

test("fails closed after two bounded unhealthy recoveries without broad Docker actions", async () => {
  let clock = 0;
  const { execFile, calls, restartCount } = executable();
  await assert.rejects(
    () => restartLocalEdgeRuntime({
      timeoutMs: 100,
      pollMs: 50,
      settleMs: 0,
      execFile,
      readFileImpl: async () => CONFIG,
      fetchImpl: async (url) => {
        const status = new URL(url).pathname === "/" ? 200 : 503;
        return new Response(null, { status });
      },
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      now: () => clock,
      log: () => {},
    }),
    /did not become stable after 2 bounded recovery attempts/u,
  );

  assert.equal(restartCount(), 2);
  assert.deepEqual(
    calls.filter((call) => call[1] === "restart"),
    [
      ["docker", "restart", EDGE_CONTAINER],
      ["docker", "restart", KONG_CONTAINER],
      ["docker", "restart", EDGE_CONTAINER],
      ["docker", "restart", KONG_CONTAINER],
    ],
  );
  assert.equal(
    calls.some((call) => ["stop", "rm", "prune"].includes(call[1])),
    false,
  );
});

test("rejects invalid stability configuration before inspecting Docker", async () => {
  const { execFile, calls } = executable();
  await assert.rejects(
    () => restartLocalEdgeRuntime({
      stableWaves: 0,
      execFile,
      readFileImpl: async () => CONFIG,
      fetchImpl: async (url) => readyResponse(url),
      log: () => {},
    }),
    /stableWaves must be a positive integer/u,
  );
  assert.deepEqual(calls, []);
});
