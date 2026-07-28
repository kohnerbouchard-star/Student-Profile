import assert from "node:assert/strict";

import { AdapterTransport } from "../src/api/adapter-transport.js";

const config = {
  authenticated: true,
  csrfToken: "C".repeat(43),
  gameSessionId: "game-retry-contract",
  requestTimeoutMs: 2_000,
};

function context(method, endpointKey = "stockAssets") {
  return {
    endpointKey,
    method,
    path: "/players/me/stocks/assets",
    requestId: `req-${method.toLowerCase()}`,
    signal: null,
  };
}

let readCalls = 0;
const readTransport = new AdapterTransport(async () => {
  readCalls += 1;
  if (readCalls === 1) {
    return {
      ok: false,
      status: 500,
      error: { code: "worker_retired", message: "Transient worker rotation." },
    };
  }
  return { ok: true, status: 200, items: [] };
}, config);

const recoveredRead = await readTransport.request(context("GET"));
assert.equal(readCalls, 2, "A transient safe-read failure should be retried exactly once.");
assert.equal(recoveredRead.ok, true);

let validationCalls = 0;
const validationTransport = new AdapterTransport(async () => {
  validationCalls += 1;
  return {
    ok: false,
    status: 400,
    error: { code: "invalid_request", message: "Invalid request." },
  };
}, config);

await assert.rejects(validationTransport.request(context("GET", "invalidRead")));
assert.equal(validationCalls, 1, "Client errors must not be retried.");

let mutationCalls = 0;
const mutationTransport = new AdapterTransport(async () => {
  mutationCalls += 1;
  return {
    ok: false,
    status: 503,
    error: { code: "service_unavailable", message: "Unavailable." },
  };
}, config);

await assert.rejects(mutationTransport.request(context("POST", "marketOrder")));
assert.equal(mutationCalls, 1, "Mutations must never be retried by the transport.");

console.log("Adapter transport retry passed: one bounded retry is limited to transient safe-read failures.");
