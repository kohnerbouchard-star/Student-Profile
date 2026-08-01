import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { __test } = require("../api/_player-bff-proxy.js");
const { normalizedRetryAfter, transientWorkerFailureReason } = __test;

function bytes(value) {
  return new TextEncoder().encode(value);
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
