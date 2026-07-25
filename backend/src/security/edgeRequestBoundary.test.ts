import assert from "node:assert/strict";
import test from "node:test";
import { enforceEdgeRequestBoundary } from "./edgeRequestBoundary.ts";

const policy = {
  allowedMethods: ["GET", "POST"],
  maxBodyBytes: 32,
  requireJsonBody: true,
} as const;

test("accepts and reconstructs a bounded JSON request", async () => {
  const result = await enforceEdgeRequestBoundary(new Request("https://example.test/route", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  }), policy);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(await result.request.json(), { ok: true });
});

test("rejects wrong methods and media types", async () => {
  const wrongMethod = await enforceEdgeRequestBoundary(new Request("https://example.test", {
    method: "DELETE",
  }), policy);
  assert.equal(wrongMethod.ok, false);
  if (!wrongMethod.ok) assert.equal(wrongMethod.response.status, 405);

  const wrongType = await enforceEdgeRequestBoundary(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "hello",
  }), policy);
  assert.equal(wrongType.ok, false);
  if (!wrongType.ok) assert.equal(wrongType.response.status, 415);
});

test("rejects bodies above the actual byte limit", async () => {
  const result = await enforceEdgeRequestBoundary(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(64) }),
  }), policy);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 413);
});

test("rejects a body on a GET request", async () => {
  const result = await enforceEdgeRequestBoundary(new Request("https://example.test", {
    method: "GET",
    headers: { "content-length": "1" },
  }), policy);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 400);
});
