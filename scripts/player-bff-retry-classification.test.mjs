import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  recoverRetiredPlayerRead,
} from "../backend/supabase/functions/player-web-session-api/retiredWorkerReadRecovery.ts";

import {
  createStudentProfileReadResilientFetch,
} from "../player-terminal/src/integrations/student-profile-read-resilience.js";

const require = createRequire(import.meta.url);
const { __test } = require("../api/_player-bff-proxy.js");
const { normalizedRetryAfter, transientWorkerFailureReason } = __test;

function bytes(value) {
  return new TextEncoder().encode(value);
}

const retiredTrace = "WorkerAlreadyRetired: request cannot be handled because the worker has already retired\n    at async UserWorker.fetch (ext:user_workers/user_workers.js:85:63)";
const retiredResult = () => ({ status: 500, body: bytes(JSON.stringify({
  code: "Internal Server Error",
  message: "Request failed due to an internal server error",
  trace: JSON.stringify(retiredTrace),
})) });

for (const method of ["GET", "HEAD"]) {
  test(`Player session proxy recovers one explicitly retired-worker ${method} before forwarding`, async () => {
    let calls = 0;
    const delays = [];
    const success = { status: 200, body: bytes('{"ok":true}'), marker: "unchanged-result" };
    const result = await recoverRetiredPlayerRead(method, async () => ++calls === 1 ? retiredResult() : success,
      async (delay) => { delays.push(delay); });
    assert.equal(result, success);
    assert.equal(calls, 2);
    assert.deepEqual(delays, [150]);
  });
}

test("Player session proxy stops after one retry and returns the exact final failure", async () => {
  let calls = 0;
  const failure = retiredResult();
  assert.equal(await recoverRetiredPlayerRead("GET", async () => { calls += 1; return failure; }, async () => {}), failure);
  assert.equal(calls, 2);
});

for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  test(`Player session proxy never replays ${method} even on explicit worker retirement`, async () => {
    let calls = 0;
    const failure = retiredResult();
    assert.equal(await recoverRetiredPlayerRead(method, async () => { calls += 1; return failure; },
      async () => { assert.fail("Mutation must never enter retry backoff"); }), failure);
    assert.equal(calls, 1);
  });
}

for (const [label, failure] of [
  ["ordinary application 500", { status: 500, body: bytes('{"code":"APPLICATION_BUG"}') }],
  ["unclassified internal error", { status: 500, body: bytes('{"code":"Internal Server Error","trace":"Error: application failure"}') }],
  ["untrusted message mention", { status: 500, body: bytes(JSON.stringify({ code: "Internal Server Error", message: retiredTrace, trace: "Error: app" })) }],
  ["boot failure", { status: 503, body: bytes('{"code":"BOOT_ERROR"}') }],
  ["network failure", { status: 0, body: bytes("") }],
  ["unauthenticated response", { status: 401, body: retiredResult().body }],
  ["forbidden response", { status: 403, body: retiredResult().body }],
  ["rate limit", { status: 429, body: retiredResult().body }],
  ["oversized diagnostic", { status: 500, body: bytes(JSON.stringify({ code: "Internal Server Error", trace: retiredTrace, padding: "x".repeat(8192) })) }],
  ["malformed JSON", { status: 500, body: bytes("not JSON") }],
]) {
  test(`Player session proxy does not retry ${label}`, async () => {
    let calls = 0;
    assert.equal(await recoverRetiredPlayerRead("GET", async () => { calls += 1; return failure; },
      async () => { assert.fail("Unclassified response must not enter retry backoff"); }), failure);
    assert.equal(calls, 1);
  });
}

test("Player session recovery remains behind authorization and preserves upstream request identity", async () => {
  const source = await readFile(new URL("../backend/supabase/functions/player-web-session-api/runtime.ts", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function handleProxy("), source.indexOf("async function loadPlayerBootstrap("));
  const recovery = handler.indexOf("recoverRetiredPlayerRead(request.method");
  for (const guard of ["resolveSession(request, key)", "constantTimePlayerTextEqual(suppliedCsrf", "trustedClientIp(request)", "readBoundedBody(request", "resolved.payload.sessionToken"]) {
    assert.ok(handler.indexOf(guard) >= 0 && handler.indexOf(guard) < recovery, guard);
  }
  assert.match(handler.slice(recovery), /method: request\.method,[\s\S]*headers,[\s\S]*cache: "no-store",[\s\S]*redirect: "manual"/u);
  assert.match(handler.slice(recovery), /readBoundedResponse\(request, upstream\)/u);
});

function response(status, headers = {}) {
  return new Response(JSON.stringify({ status }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("Player BFF preserves both valid Retry-After formats", () => {
  assert.equal(normalizedRetryAfter("120"), "120");
  assert.equal(
    normalizedRetryAfter("Fri, 31 Dec 2038 23:59:59 GMT"),
    "Fri, 31 Dec 2038 23:59:59 GMT",
  );
  assert.equal(normalizedRetryAfter("-1"), "");
  assert.equal(normalizedRetryAfter("not-a-date"), "");
});

test("Player client rejects ambiguous dates and uses bounded local backoff", async () => {
  const delays = [];
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return calls === 1
        ? response(503, { "retry-after": "not-a-date" })
        : response(200);
    },
    {
      baseDelayMs: 200,
      maxJitterMs: 0,
      sleep: async (milliseconds) => delays.push(milliseconds),
    },
  );

  assert.equal(
    (await resilientFetch("https://econovaria.example/api/player/players/me")).status,
    200,
  );
  assert.deepEqual(delays, [200]);
  assert.equal(calls, 2);
});

test("Player BFF marks only explicit worker failures as retryable 500s", () => {
  assert.equal(
    transientWorkerFailureReason(
      500,
      bytes("WorkerAlreadyRetired: request cannot be handled because the worker has already retired"),
    ),
    "worker-retired",
  );
  assert.equal(
    transientWorkerFailureReason(500, bytes("Internal Server Error")),
    "",
  );
  assert.equal(
    transientWorkerFailureReason(500, bytes('{"code":"APPLICATION_BUG"}')),
    "",
  );
});

test("Player BFF marks Supabase resource-limit status without exposing diagnostics", () => {
  assert.equal(
    transientWorkerFailureReason(546, bytes("sensitive upstream diagnostics")),
    "worker-resource-limit",
  );
  assert.equal(transientWorkerFailureReason(503, bytes("BOOT_ERROR")), "");
});
