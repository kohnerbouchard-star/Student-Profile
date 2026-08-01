import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const functions = ["player-api", "player-web-session-api"];

for (const functionName of functions) {
  test(`${functionName} binds gateway client IP before loading its runtime`, async () => {
    const root = `backend/supabase/functions/${functionName}`;
    const entrypoint = await readFile(`${root}/index.ts`, "utf8");
    const runtime = await readFile(`${root}/runtime.ts`, "utf8");

    const binder = entrypoint.indexOf("bindGatewayTrustedClientIp(");
    const runtimeImport = entrypoint.indexOf('await import("./runtime.ts")');

    assert.ok(binder >= 0, "entrypoint must bind the reviewed gateway client IP");
    assert.ok(runtimeImport > binder, "runtime must load only after trusted-IP binding is installed");
    assert.match(entrypoint, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/u);
    assert.match(runtime, /Deno\.serve\(/u);
    assert.doesNotMatch(runtime, /raw\.githubusercontent\.com/u);
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

test("connected functional journeys and load handoff use isolated Edge runtimes", async () => {
  const orchestrator = await readFile(
    "scripts/business-banking-player-world-browser-acceptance.mjs",
    "utf8",
  );
  const isolation = await readFile(
    "scripts/local-edge-runtime-isolation.mjs",
    "utf8",
  );

  assert.match(orchestrator, /import \{ restartLocalEdgeRuntime \}/u);
  assert.match(orchestrator, /record\.edgeRuntime = await restartLocalEdgeRuntime\(\)/u);
  assert.match(orchestrator, /evidence\.loadHandoff = await restartLocalEdgeRuntime\(\)/u);
  assert.match(
    orchestrator,
    /fresh-warmed-edge-runtime-per-functional-journey-and-load-handoff/u,
  );

  assert.match(isolation, /docker", \["restart", containerName\]/u);
  assert.match(isolation, /\/functions\/v1\/player-api/u);
  assert.match(isolation, /\/functions\/v1\/player-web-session-api/u);
  assert.match(isolation, /status === 204/u);
  assert.match(isolation, /restricted to the local acceptance gateway/u);
  assert.doesNotMatch(isolation, /sb_publishable_[A-Za-z0-9_-]{20,}/u);
});
