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

function diagnosticExecutable({ role = "edge", inspectThrows = false, invalidRunning = false, targetProject = "econovaria", snapshot = {}, diagnosticFailure = "", events = [] } = {}) {
  const edge = `supabase_edge_runtime_${targetProject}`, kong = `supabase_kong_${targetProject}`;
  const failed = role === "edge" ? edge : kong;
  const base = executable({ names: `${edge}\n${kong}\n`, running: ({ containerName }) => containerName !== failed,
    onRestart: (_attempt, name) => events.push(`restart:${name}`) });
  const diagnosticCalls = [];
  let attempts = 0;
  const execFile = (command, args, options) => {
    const diagnostic = args[0] === "context" || (args[0] === "inspect" && args[2] !== "{{.State.Running}}");
    if (diagnostic) {
      diagnosticCalls.push([command, ...args]);
      assert.equal(options.timeout, 1_000); assert.equal(options.maxBuffer, 4_096);
      assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
      if (diagnosticFailure === "timeout") throw Object.assign(new Error("PRIVATE_DIAGNOSTIC_ERROR"), { code: "ETIMEDOUT", stderr: "PRIVATE_STDERR" });
      if (diagnosticFailure === "hostile-error") throw Object.defineProperty({}, "code", { get() { throw new Error("PRIVATE_ERROR_GETTER"); } });
      if (args[0] === "context") return JSON.stringify(diagnosticFailure === "remote" ? "tcp://foreign:2375" : "unix:///var/run/docker.sock");
      assert.equal(args.at(-1), failed); assert(!args[2].includes("json .Config.Env")); assert(!args[2].includes("json .State}")); assert(!args[2].includes(".State.Error"));
      if (diagnosticFailure === "malformed") return "PRIVATE_INVALID_JSON";
      if (diagnosticFailure === "oversized") return "PRIVATE_".repeat(1_000);
      return JSON.stringify({ id: "a".repeat(64), name: `/${failed}`, project: "econovaria", running: false, status: "exited", exitCode: 137, oomKilled: true,
        startedAt: "2026-11-02T00:00:00Z", finishedAt: "2026-11-02T00:00:01.123456789Z", error: "", ...snapshot });
    }
    if (args[0] === "restart" && args[1] === edge) attempts += 1;
    if (args[0] === "inspect") {
      assert.equal(options.timeout, 30_000, "Original running-check timeout must remain unchanged.");
      if (invalidRunning && args.at(-1) === failed) return "PRIVATE_INVALID_STATE";
      if (inspectThrows && args.at(-1) === failed) {
        base.calls.push([command, ...args]);
        throw Object.assign(new Error("PRIVATE_INSPECT_ERROR"), { code: "ETIMEDOUT", status: 1, signal: "SIGTERM", stdout: "PRIVATE_STDOUT" });
      }
    }
    return base.execFile(command, args, options);
  };
  return { ...base, execFile, diagnosticCalls, events, restartCount: () => attempts };
}

async function runFailedGate(fixture, { log = () => {} } = {}) {
  let requests = 0;
  await assert.rejects(restartLocalEdgeRuntime({ execFile: fixture.execFile, readFileImpl: async () => CONFIG,
    fetchImpl: async () => { requests += 1; return new Response(null, { status: 200 }); }, sleep: async () => {}, log }),
  { message: "Local Edge runtime did not become stable after 2 bounded recovery attempts; reason=container_not_running; statuses=; readyWaves=0/3." });
  assert.equal(requests, 0); assert.equal(fixture.restartCount(), 2);
  assert.equal(fixture.calls.filter((call) => call[1] === "restart").length, 4);
}

test("failed running checks identify Edge or Kong state before the next bounded recovery", async () => {
  for (const role of ["edge", "kong"]) {
    const records = [], events = [];
    const fixture = diagnosticExecutable({ role, events });
    await runFailedGate(fixture, { log: (text) => { const record = JSON.parse(text); records.push(record); events.push(`receipt:${record.recoveryAttempt}`); } });
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((record) => record.recoveryAttempt), [1, 2]);
    for (const record of records) {
      assert.equal(record.role, role); assert.equal(record.phase, "before_probe"); assert.equal(record.condition, "reported_not_running");
      assert.equal(record.available, true); assert.equal(record.errorClass, "none");
      assert.equal(record.postCheckState.exitCode, 137); assert.equal(record.postCheckState.oomKilled, true);
      assert.equal(record.postCheckState.status, "exited"); assert.equal(record.postCheckState.running, false);
      assert(Buffer.byteLength(JSON.stringify(record)) <= 4_096);
    }
    const edgeRestart = "restart:supabase_edge_runtime_econovaria";
    assert(events.indexOf("receipt:1") < events.lastIndexOf(edgeRestart));
    assert.equal(events.at(-1), "receipt:2");
    assert.equal(fixture.diagnosticCalls.length, 4);
  }
});

test("inspect exceptions stay distinct and a later running snapshot cannot admit the failed gate", async () => {
  const records = [], fixture = diagnosticExecutable({ inspectThrows: true, snapshot: { running: true, status: "running", exitCode: 0, oomKilled: false } });
  await runFailedGate(fixture, { log: (text) => records.push(JSON.parse(text)) });
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.condition, "inspect_failure"); assert.equal(record.postCheckState.running, true);
    assert.deepEqual(record.inspectFailure, { code: "ETIMEDOUT", status: 1, signal: "SIGTERM" });
    assert(!JSON.stringify(record).includes("PRIVATE"));
  }
});

test("unrecognized running output is classified without disclosing its contents", async () => {
  const records = [], fixture = diagnosticExecutable({ invalidRunning: true });
  await runFailedGate(fixture, { log: (text) => records.push(JSON.parse(text)) });
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.condition, "unrecognized_running_state");
    assert(!JSON.stringify(record).includes("PRIVATE"));
  }
});

test("only allowlisted scalar state is emitted; free-text Error and unexpected fields are omitted", async () => {
  const records = [], fixture = diagnosticExecutable({ snapshot: {
    error: "PRIVATE_ERROR", status: "PRIVATE_STATUS", startedAt: "PRIVATE_DATE",
    exitCode: 256, oomKilled: "PRIVATE_OOM", unexpected: "PRIVATE_FIELD", Config: { Env: ["PRIVATE_ENV"] },
  } });
  await runFailedGate(fixture, { log: (text) => records.push(JSON.parse(text)) });
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.available, true);
    assert.deepEqual(record.postCheckState, { running: false, status: null, exitCode: null,
      oomKilled: null, startedAt: null, finishedAt: "2026-11-02T00:00:01.123456789Z" });
    assert(!JSON.stringify(record).includes("PRIVATE"));
  }
});

test("foreign targets and unverified ownership never expose state or error text", async () => {
  for (const scenario of [{ targetProject: "foreign" }, { snapshot: { project: "foreign", error: "PRIVATE_OWNER_ERROR" } }, { snapshot: { name: "/foreign", error: "PRIVATE_OWNER_ERROR" } }, { snapshot: { id: "invalid", error: "PRIVATE_OWNER_ERROR" } }]) {
    const records = [], fixture = diagnosticExecutable(scenario);
    await runFailedGate(fixture, { log: (text) => records.push(JSON.parse(text)) });
    assert.equal(records.length, 2);
    records.forEach((record) => { assert.equal(record.errorClass, "ownership_unverified"); assert.equal(record.available, false); assert.equal(record.postCheckState, undefined); assert(!JSON.stringify(record).includes("PRIVATE")); });
    if (scenario.targetProject) assert.equal(fixture.diagnosticCalls.length, 0);
  }
});

test("diagnostic failures and logger exceptions preserve the exact primary readiness error", async () => {
  for (const diagnosticFailure of ["timeout", "hostile-error", "malformed", "oversized", "remote"]) {
    const records = [], fixture = diagnosticExecutable({ diagnosticFailure });
    await runFailedGate(fixture, { log: (text) => records.push(JSON.parse(text)) });
    assert.equal(records.length, 2);
    records.forEach((record) => { assert.equal(record.available, false); assert.equal(record.postCheckState, undefined); assert(!JSON.stringify(record).includes("PRIVATE")); });
  }
  await runFailedGate(diagnosticExecutable(), { log: () => { throw new Error("PRIVATE_LOGGER_ERROR"); } });
});

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
