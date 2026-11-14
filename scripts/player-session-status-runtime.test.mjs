import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { after } from "node:test";
import {
  createWebPlayerSessionPayload,
  sealWebPlayerSession,
  WEB_PLAYER_SESSION_COOKIE,
} from "../backend/src/security/webPlayerSession.ts";

// Execute the production handler and crypto; only the unused remote SDK is stubbed.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "https://esm.sh/@supabase/supabase-js@2.108.2") {
      return { url: "data:text/javascript,export function createClient(){throw new Error('Unexpected SDK call')}", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const originalDeno = globalThis.Deno;
const originalFetch = globalThis.fetch;
const key = new Uint8Array(32).fill(17);
const env = {
  SUPABASE_URL: "https://upstream.example.test",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "synthetic-test-only",
  ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY: Buffer.from(key).toString("base64url"),
};
let handler;
globalThis.Deno = { env: { get: (name) => env[name] }, serve: (value) => { handler = value; } };
await import("../backend/supabase/functions/player-web-session-api/runtime.ts");
hooks.deregister();
after(() => { globalThis.Deno = originalDeno; globalThis.fetch = originalFetch; });

const player = { displayName: "Synthetic Player", rosterLabel: null, playerIdentifier: "synthetic-player", status: "active" };
const gameSession = { name: "Synthetic Game", status: "active" };
const expiresAt = new Date(Date.now() + 3600_000).toISOString();
const payload = createWebPlayerSessionPayload({ sessionToken: "synthetic-session-token", sessionExpiresAt: expiresAt,
  csrfToken: "A".repeat(43), player, gameSession });
const envelope = await sealWebPlayerSession(payload, key);
const bootstrap = { ok: true, player, gameSession, session: { status: "active", expiresAt }, balances: [], availableActions: [] };

function request({ cookie = envelope, clientIp = "203.0.113.3", route = "/status", method = "GET", body } = {}) {
  const headers = new Headers({ origin: "http://localhost:4173", apikey: "sb_publishable_test", "content-type": "application/json" });
  if (cookie) headers.set("cookie", `${WEB_PLAYER_SESSION_COOKIE}=${cookie}`);
  if (clientIp) headers.set("x-real-ip", clientIp);
  return new Request(`https://edge.example.test/functions/v1/player-web-session-api${route}`, { method, headers, body });
}
function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
async function run(upstream, options) {
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    return typeof upstream === "function" ? upstream(req) : upstream;
  };
  const response = await handler(request(options));
  return { response, calls };
}

for (const status of [429, 500, 502, 503, 504, 546]) {
  test(`status preserves the cookie on upstream ${status} and forwards safe retry guidance`, async () => {
    const { response, calls } = await run(jsonResponse(status, { secret: "must-not-leak" }, { "retry-after": "30", "set-cookie": "upstream=unsafe" }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("retry-after"), "30");
    assert.match(response.headers.get("cache-control"), /no-store/);
    const body = await response.json();
    assert.equal(body.error.retryable, true);
    assert.ok(!JSON.stringify(body).includes("must-not-leak"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.get("x-player-session-token"), payload.sessionToken);
  });
}
for (const status of [400, 403, 404, 409, 302]) {
  test(`status does not invalidate a session on non-authentication upstream ${status}`, async () => {
    const { response } = await run(jsonResponse(status, { error: "private diagnostic" }));
    assert.equal(response.status, status >= 400 ? status : 502);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(!(await response.text()).includes("private diagnostic"));
  });
}
for (const [name, upstream] of [
  ["network rejection", () => { throw new TypeError("network unavailable"); }],
  ["malformed JSON", () => new Response("not-json", { status: 200 })],
  ["incomplete bootstrap", () => jsonResponse(200, { ok: true })],
  ["oversized body", () => new Response("x".repeat(1_048_577), { status: 200 })],
  ["body stream rejection", () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("stream unavailable")); } }), { status: 200 })],
]) {
  test(`status preserves the cookie and returns 502 after ${name}`, async () => {
    const { response } = await run(upstream);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal((await response.json()).error.retryable, true);
  });
}

test("status only clears the cookie after confirmed upstream 401", async () => {
  const { response } = await run(jsonResponse(401, { private: "never returned" }));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await response.json()).error.code, "player_session_invalid");
});
for (const cookie of ["", "malformed"]) {
  test(`status rejects ${cookie || "missing"} local session without upstream work`, async () => {
    const { response, calls } = await run(() => assert.fail("Invalid local session must not reach upstream"), { cookie });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(calls.length, 0);
  });
}
test("status preserves the cookie when trusted network metadata is missing", async () => {
  const { response, calls } = await run(() => assert.fail("Untrusted request must not reach upstream"), { clientIp: "" });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 0);
});
test("successful status preserves public projection and does not rotate the cookie", async () => {
  const { response } = await run(jsonResponse(200, bootstrap));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.player, player);
  assert.ok(!JSON.stringify(body).includes(payload.sessionToken));
});
for (const retryAfter of ["not-a-date", "-1", "999999999999999999999"]) {
  test(`status rejects unsafe retry-after ${retryAfter}`, async () => {
    const { response } = await run(jsonResponse(503, {}, { "retry-after": retryAfter }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), null);
  });
}
test("a bootstrap failure during login still revokes its newly issued token", async () => {
  const { response, calls } = await run((req) => {
    if (req.url.endsWith("/players/login")) return jsonResponse(200, { ok: true, player, gameSession, session: { token: payload.sessionToken, expiresAt } });
    if (req.url.endsWith("/players/me")) return jsonResponse(503, {});
    if (req.url.endsWith("/players/logout")) return jsonResponse(200, { ok: true });
    assert.fail(`Unexpected upstream: ${req.url}`);
  }, { route: "/login", method: "POST", body: JSON.stringify({ gameCode: "test", playerIdentifier: "synthetic", accessCode: "test" }) });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 3);
});
