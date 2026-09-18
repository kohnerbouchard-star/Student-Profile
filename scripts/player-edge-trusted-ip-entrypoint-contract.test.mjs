import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const functions = ["player-api", "player-web-session-api"];
const isolatedBffAcceptances = [
  "scripts/business-banking-player-commerce-browser-acceptance.mjs",
  "scripts/business-banking-player-inventory-browser-acceptance.mjs",
  "scripts/player-contracts-browser-acceptance.mjs",
  "scripts/business-banking-player-market-browser-acceptance.mjs",
  "scripts/business-banking-player-business-browser-acceptance.mjs",
];

for (const functionName of functions) {
  test(`${functionName} installs trusted-IP binding before statically loading its runtime`, async () => {
    const root = `backend/supabase/functions/${functionName}`;
    const entrypoint = await readFile(`${root}/index.ts`, "utf8");
    const trustedServe = await readFile(`${root}/trustedClientIpServe.ts`, "utf8");
    const runtime = await readFile(`${root}/runtime.ts`, "utf8");

    const trustedServeImport = entrypoint.indexOf(
      'import "./trustedClientIpServe.ts";',
    );
    const runtimeImport = entrypoint.indexOf('import "./runtime.ts";');

    assert.ok(
      trustedServeImport >= 0,
      "entrypoint must statically preload the reviewed trusted-IP serve binding",
    );
    assert.ok(
      runtimeImport > trustedServeImport,
      "runtime must load only after the trusted-IP serve binding",
    );
    assert.doesNotMatch(entrypoint, /await import\(/u);
    assert.match(trustedServe, /bindGatewayTrustedClientIp\(/u);
    assert.match(trustedServe, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/u);
    assert.match(runtime, /Deno\.serve\(/u);
    assert.doesNotMatch(runtime, /raw\.githubusercontent\.com/u);

    if (functionName === "player-web-session-api") {
      assert.match(trustedServe, /materializeBoundedRequestBody/u);
      assert.match(trustedServe, /MAX_MATERIALIZED_BODY_BYTES/u);
    }
  });
}

test("Player read resilience is installed once at the outer client boundary", async () => {
  const entrypoint = await readFile(
    "backend/supabase/functions/player-web-session-api/index.ts",
    "utf8",
  );
  const runtimeIntegration = await readFile(
    "player-terminal/src/integrations/student-profile-runtime.js",
    "utf8",
  );
  const helper = await readFile(
    "player-terminal/src/integrations/student-profile-read-resilience.js",
    "utf8",
  );
  const bffProxy = await readFile("api/_player-bff-proxy.js", "utf8");
  const loadAdapter = await readFile(
    "scripts/player-runtime-load-profile.mjs",
    "utf8",
  );

  assert.doesNotMatch(entrypoint, /ResilientFetch|globalThis\.fetch\s*=/u);
  assert.match(runtimeIntegration, /createStudentProfileReadResilientFetch/u);
  assert.match(runtimeIntegration, /fetchImpl: resilientFetch/u);
  assert.match(runtimeIntegration, /econovaria:player-read-resilience/u);
  assert.match(runtimeIntegration, /retriesScheduled/u);

  assert.match(helper, /new Set\(\[502, 503, 504, 546\]\)/u);
  assert.match(helper, /WorkerAlreadyRetired/u);
  assert.match(helper, /NON_RETRYABLE_503_PATTERNS/u);
  assert.match(helper, /\["GET", "HEAD"\]/u);
  assert.match(helper, /DEFAULT_MAX_ATTEMPTS = 3/u);
  assert.match(helper, /DEFAULT_MAX_RETRY_ELAPSED_MS = 3_000/u);
  assert.match(helper, /Date\.parse\(value\)/u);
  assert.match(helper, /globalThis\.crypto\.getRandomValues/u);
  assert.doesNotMatch(helper, /Math\.random/u);

  assert.match(bffProxy, /X-Econovaria-Retryable/u);
  assert.match(bffProxy, /transientWorkerFailureReason/u);
  assert.match(bffProxy, /new Date\(timestamp\)\.toUTCString\(\)/u);

  assert.match(loadAdapter, /createStudentProfileReadResilientFetch/u);
  assert.match(loadAdapter, /readRetries: playerReadRetryEvents/u);
});

test("connected functional journeys and load handoff use stable isolated Edge runtimes", async () => {
  const orchestrator = await readFile(
    "scripts/business-banking-player-world-browser-acceptance.mjs",
    "utf8",
  );
  const isolation = await readFile(
    "scripts/local-edge-runtime-isolation.mjs",
    "utf8",
  );

  assert.match(orchestrator, /import \{ restartLocalEdgeRuntime \}/u);
  assert.match(
    orchestrator,
    /EDGE_ISOLATION_OPTIONS = Object\.freeze\(\{ stableWaves: 3, settleMs: 1_000 \}\)/u,
  );
  assert.match(
    orchestrator,
    /record\.edgeRuntime = await restartLocalEdgeRuntime\(EDGE_ISOLATION_OPTIONS\)/u,
  );
  assert.match(
    orchestrator,
    /evidence\.loadHandoff = await restartLocalEdgeRuntime\(EDGE_ISOLATION_OPTIONS\)/u,
  );
  assert.match(
    orchestrator,
    /fresh-stable-edge-runtime-per-functional-journey-and-load-handoff/u,
  );

  for (const path of isolatedBffAcceptances) {
    const entrypoint = await readFile(path, "utf8");
    assert.match(entrypoint, /import \{ restartLocalEdgeRuntime \}/u, `${path} must import isolation`);
    const isolationCall = entrypoint.indexOf("await restartLocalEdgeRuntime()");
    const acceptanceCall = entrypoint.indexOf("await runConnectedPlayerBffAcceptance(import.meta.url)");
    assert.ok(isolationCall >= 0, `${path} must isolate the runtime`);
    assert.ok(acceptanceCall > isolationCall, `${path} must isolate before acceptance execution`);
  }

  assert.match(isolation, /docker", \["restart", containerName\]/u);
  assert.match(isolation, /DEFAULT_STABLE_WAVES = 3/u);
  assert.match(isolation, /DEFAULT_SETTLE_MS = 1_000/u);
  assert.match(isolation, /consecutiveReadyWaves/u);
  assert.match(isolation, /\/functions\/v1\/player-api/u);
  assert.match(isolation, /\/functions\/v1\/player-web-session-api/u);
  assert.match(isolation, /status === 204/u);
  assert.match(isolation, /restricted to the local acceptance gateway/u);
  assert.doesNotMatch(isolation, /sb_publishable_[A-Za-z0-9_-]{20,}/u);
});

test("multiplayer workflow warms its disposable runtime before strict startup probes", async () => {
  const workflow = await readFile(".github/workflows/player-multiplayer-load-e2e.yml", "utf8");
  const start = workflow.indexOf("- name: Start same-origin Player gateway");
  const journey = workflow.indexOf("- name: Execute connected two-browser Player journey", start);
  assert.ok(start >= 0 && journey > start);
  const startup = workflow.slice(start, journey);
  const gateway = startup.indexOf("echo $! > /tmp/player-runtime-gateway.pid");
  const staticReady = startup.indexOf('test "$STATIC_READY" = "true"');
  const recovery = startup.indexOf("await restartLocalEdgeRuntime();");
  const probes = startup.indexOf("for ATTEMPT in $(seq 1 90)");
  assert.ok(gateway >= 0 && staticReady > gateway && recovery > staticReady && probes > recovery);
  assert.match(startup, /local-edge-runtime-isolation\.mjs/u);
  assert.match(startup, /\[ "\$PLAYER_STATUS" = "204" \]/u);
  assert.match(startup, /\[ "\$BOOTSTRAP_STATUS" = "204" \]/u);
  assert.match(startup, /exit 1/u);
  assert.match(workflow, /- name: Enforce connected Player results/u);
});
