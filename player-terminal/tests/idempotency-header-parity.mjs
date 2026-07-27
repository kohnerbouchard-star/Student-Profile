import assert from "node:assert/strict";

import {
  createStudentProfileApiCall,
  headersFor,
} from "../src/integrations/student-profile-api-call.js";

const IDEMPOTENCY_KEY = "message-thread-create-parity-0001";
const REQUEST_ID = "request-parity-0001";
const CSRF_TOKEN = "c".repeat(43);
const SESSION = Object.freeze({
  authenticated: true,
  csrfToken: CSRF_TOKEN,
});
const CONFIG = Object.freeze({
  deviceId: "123e4567-e89b-42d3-a456-426614174000",
  publishableKey: "sb_publishable_idempotency_parity_1234567890",
});

const headers = headersFor({
  endpointKey: "messageThreadCreate",
  method: "POST",
  idempotencyKey: IDEMPOTENCY_KEY,
  requestId: REQUEST_ID,
  session: SESSION,
  config: CONFIG,
});
assert.equal(headers["idempotency-key"], IDEMPOTENCY_KEY);
assert.equal(headers["x-idempotency-key"], IDEMPOTENCY_KEY);
assert.equal(headers["x-request-id"], REQUEST_ID);
assert.equal(headers["x-econovaria-csrf-token"], CSRF_TOKEN);
assert.equal(headers["x-econovaria-device-id"], CONFIG.deviceId);
assert.equal(headers.apikey, CONFIG.publishableKey);
assert.equal(headers.authorization, undefined);
assert.equal(headers["x-player-session-token"], undefined);
assert.notEqual(headers["x-idempotency-key"], headers["x-request-id"]);

const captured = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    captured.push(structuredClone({
      method: request.method,
      path: request.path,
      payload: request.payload,
      headers: request.headers,
      idempotencyKey: request.idempotencyKey,
    }));
    return { ok: true, data: { accepted: true } };
  },
});

await apiCall({
  endpointKey: "messageThreadCreate",
  method: "POST",
  path: "/messages/threads",
  params: {},
  payload: {
    recipientPlayerId: "PLAYER-BETA",
    title: "Idempotency parity",
    body: "One generated key must be reused in the body and headers.",
  },
  requestId: REQUEST_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  signal: null,
  session: SESSION,
  config: CONFIG,
});

assert.equal(captured.length, 1);
assert.equal(captured[0].method, "POST");
assert.equal(captured[0].path, "/players/me/messages/threads");
assert.equal(captured[0].payload.idempotencyKey, IDEMPOTENCY_KEY);
assert.equal(captured[0].headers["idempotency-key"], IDEMPOTENCY_KEY);
assert.equal(captured[0].headers["x-idempotency-key"], IDEMPOTENCY_KEY);
assert.equal(captured[0].idempotencyKey, IDEMPOTENCY_KEY);
assert.equal(captured[0].headers["x-request-id"], REQUEST_ID);
assert.equal(captured[0].headers["x-econovaria-csrf-token"], CSRF_TOKEN);
assert.equal(captured[0].headers.authorization, undefined);
assert.equal(captured[0].headers["x-player-session-token"], undefined);

const SEND_KEY = "message-send-parity-0002";
await apiCall({
  endpointKey: "messageSend",
  method: "POST",
  path: "/messages/threads/:threadId/messages",
  params: { threadId: `thr_${"a".repeat(32)}` },
  payload: { body: "Reply with the same idempotency key in every request surface." },
  requestId: "request-parity-0002",
  idempotencyKey: SEND_KEY,
  signal: null,
  session: SESSION,
  config: CONFIG,
});

assert.equal(captured.length, 2);
assert.equal(captured[1].payload.idempotencyKey, SEND_KEY);
assert.equal(captured[1].headers["idempotency-key"], SEND_KEY);
assert.equal(captured[1].headers["x-idempotency-key"], SEND_KEY);
assert.equal(captured[1].idempotencyKey, SEND_KEY);
assert.equal(captured[1].headers["x-econovaria-csrf-token"], CSRF_TOKEN);
assert.equal(captured[1].headers.authorization, undefined);
assert.equal(captured[1].headers["x-player-session-token"], undefined);

console.log("Player mutation idempotency keys remain identical in the body and both supported headers across the HttpOnly cookie-session boundary.");
