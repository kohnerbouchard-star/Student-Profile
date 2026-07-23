import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TRANSIENT_READ_ATTEMPTS,
  nextStableZeroScanCount,
  rateLimitDeltaRows,
  retryDelayMs,
  shouldRetryTransientFetchError,
  shouldRetryTransientRead,
} from "./pr295-connected-resilience-policy.mjs";

test("only unexpected idempotent transient reads are retried", () => {
  assert.equal(shouldRetryTransientRead({
    method: "GET",
    status: 503,
    code: "BOOT_ERROR",
    expectedStatuses: [200],
    attempt: 1,
  }), true);
  assert.equal(shouldRetryTransientRead({
    method: "POST",
    status: 503,
    code: "BOOT_ERROR",
    expectedStatuses: [200],
    attempt: 1,
  }), false);
  assert.equal(shouldRetryTransientRead({
    method: "GET",
    status: 503,
    code: "BOOT_ERROR",
    expectedStatuses: [503],
    attempt: 1,
  }), false);
  assert.equal(shouldRetryTransientRead({
    method: "GET",
    status: 400,
    code: "INVALID_REQUEST",
    expectedStatuses: [200],
    attempt: 1,
  }), false);
  assert.equal(shouldRetryTransientRead({
    method: "GET",
    status: 503,
    code: "BOOT_ERROR",
    expectedStatuses: [200],
    attempt: MAX_TRANSIENT_READ_ATTEMPTS,
  }), false);
});

test("GET transport failures receive the same bounded attempt policy", () => {
  assert.equal(shouldRetryTransientFetchError({ method: "GET", attempt: 1 }), true);
  assert.equal(shouldRetryTransientFetchError({ method: "POST", attempt: 1 }), false);
  assert.equal(shouldRetryTransientFetchError({ method: "GET", attempt: MAX_TRANSIENT_READ_ATTEMPTS }), false);
});

test("retry delay honors bounded Retry-After and exponential fallback", () => {
  assert.equal(retryDelayMs({ attempt: 1, retryAfter: "0.5" }), 500);
  assert.equal(retryDelayMs({ attempt: 1, retryAfter: "10" }), 2000);
  assert.equal(retryDelayMs({ attempt: 1, retryAfter: null }), 250);
  assert.equal(retryDelayMs({ attempt: 3, retryAfter: null }), 1000);
});

test("rate cleanup removes only rows absent from the captured baseline", () => {
  const baseline = [{
    dimension: "ip",
    keyHash: "existing",
    windowStartedAt: "2026-07-23T22:00:00.000Z",
    windowSeconds: 60,
  }];
  const added = {
    dimension: "identity",
    keyHash: "acceptance",
    windowStartedAt: "2026-07-23T22:01:00.000Z",
    windowSeconds: 60,
  };
  assert.deepEqual(rateLimitDeltaRows([...baseline, added], baseline), [added]);
  assert.deepEqual(rateLimitDeltaRows(baseline, baseline), []);
});

test("cleanup requires consecutive stable zero scans", () => {
  assert.equal(nextStableZeroScanCount(0, 3), 0);
  assert.equal(nextStableZeroScanCount(0, 0), 1);
  assert.equal(nextStableZeroScanCount(1, 0), 2);
  assert.equal(nextStableZeroScanCount(2, 1), 0);
});
