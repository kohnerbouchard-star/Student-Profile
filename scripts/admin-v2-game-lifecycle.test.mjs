import assert from "node:assert/strict";
import test from "node:test";
import { createAdminApiClient } from "../admin/v2/src/api/admin-api-client.js";
import { normalizeGameLifecycle, normalizeGameLifecycleResult } from "../admin/v2/src/api/game-lifecycle-model.js";
import { createGameLifecycleController } from "../admin/v2/src/routes/overview/GameLifecycleController.js";
import { createAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";

const GAME = "10000000-0000-4000-8000-000000000001";
const KEY = "admin.lifecycle.pause.20000000-0000-4000-8000-000000000002";
const model = (extra = {}) => ({ state: "active", operationalStatus: "active", version: 3,
  joinCodeStatus: "active", allowedActions: ["pause", "end", "revoke_sessions"], activePlayerSessions: 2, ...extra });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const create = (api = {}, extra = {}) => createGameLifecycleController({
  gameId: GAME, hasPermission: () => true,
  api: { readGameLifecycle: async () => model(), transitionGameLifecycle: async ({ action }) => ({ action, outcome: "applied", lifecycle: model({ version: 4 }) }), ...api }, ...extra,
});

test("lifecycle normalization fails closed and omits identifiers and diagnostics", () => {
  assert.deepEqual(normalizeGameLifecycle({ ...model(), internalId: GAME, token: "private" }), { ...model(), sessionsRevoked: null });
  for (const patch of [{ state: "__proto__" }, { version: "3" }, { version: 0 }, { allowedActions: ["delete"] }, { allowedActions: ["constructor"] }, { joinCodeStatus: "unknown" }, { operationalStatus: "unknown" }]) {
    assert.throws(() => normalizeGameLifecycle(model(patch)), (e) => e.code === "INVALID_RESPONSE");
  }
  assert.equal(normalizeGameLifecycle(model({ activePlayerSessions: -1 })).activePlayerSessions, null);
  assert.throws(() => normalizeGameLifecycleResult({ data: { action: "end", outcome: "applied", lifecycle: model() } }, "pause"));
});

test("API binds all six exact routes to version and idempotency using cookie-safe transport", async () => {
  const calls = [];
  const api = createAdminApiClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    const action = url.endsWith("/sessions/revoke") ? "revoke_sessions" : url.split("/").at(-1);
    return response({ data: { lifecycle: model(), action, outcome: "applied" } });
  } });
  await api.readGameLifecycle({ gameId: GAME });
  assert.equal(calls[0].url, `/api/admin/games/${GAME}/lifecycle`);
  for (const action of ["start", "pause", "resume", "end", "archive", "revoke_sessions"]) {
    await api.transitionGameLifecycle({ gameId: GAME, action, expectedVersion: 3, idempotencyKey: KEY });
    const { url, init } = calls.at(-1);
    assert.equal(url, `/api/admin/games/${GAME}/${action === "revoke_sessions" ? "sessions/revoke" : `lifecycle/${action}`}`);
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "include");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers["Idempotency-Key"], KEY);
    assert.equal(init.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(init.body), { idempotencyKey: KEY, expectedVersion: 3 });
  }
});

test("API rejects bad game/action/version/keys before fetch and redacts HTTP failures", async () => {
  let calls = 0;
  const api = createAdminApiClient({ fetchImpl: async () => { ++calls; return response({ error: { code: "game_lifecycle_version_conflict", message: "private SQL" } }, 409); } });
  for (const patch of [{ gameId: "../other" }, { action: "delete" }, { expectedVersion: null }, { expectedVersion: "3" }, { expectedVersion: 0 }, { idempotencyKey: "x".repeat(129) }]) {
    await assert.rejects(api.transitionGameLifecycle({ gameId: GAME, action: "pause", expectedVersion: 3, idempotencyKey: KEY, ...patch }));
  }
  assert.equal(calls, 0);
  await assert.rejects(api.transitionGameLifecycle({ gameId: GAME, action: "pause", expectedVersion: 3, idempotencyKey: KEY }), (e) => e.code === "CONFLICT" && !JSON.stringify(e).includes("private"));
});

test("client coalesces identical in-flight identity and rejects mismatched payload reuse", async () => {
  const gate = deferred(); let calls = 0;
  const api = createAdminApiClient({ fetchImpl: async () => { ++calls; await gate.promise; return response({ data: { action: "pause", outcome: "applied", lifecycle: model() } }); } });
  const input = { gameId: GAME, action: "pause", expectedVersion: 3, idempotencyKey: KEY };
  const a = api.transitionGameLifecycle(input); const b = api.transitionGameLifecycle(input);
  assert.equal(a, b);
  await assert.rejects(api.transitionGameLifecycle({ ...input, action: "end" }), (e) => e.code === "CONFLICT");
  gate.resolve(); await a; assert.equal(calls, 1);
});

test("read and write capability gates fail closed independently", async () => {
  let calls = 0;
  const api = { readGameLifecycle: async () => { ++calls; return model(); } };
  const denied = create(api, { hasPermission: () => false });
  await denied.load(); assert.equal(calls, 0); assert.equal(denied.prepare("pause"), null);
  const readonly = create(api, { hasPermission: (p) => p === "game.read" });
  await readonly.load(); assert.equal(calls, 1); assert.equal(readonly.prepare("pause"), null);
});

test("only server-allowed, current reviewed intent can write and cancel sends nothing", async () => {
  let calls = 0;
  const c = create({ transitionGameLifecycle: async () => { ++calls; return { outcome: "applied", lifecycle: model() }; } });
  await c.load(); assert.equal(c.prepare("archive"), null);
  const intent = c.prepare("pause");
  assert.equal(await c.apply({ ...intent }), false);
  c.cancelReview(); assert.equal(await c.apply(intent), false); assert.equal(calls, 0);
  assert.equal(await c.apply(c.prepare("pause")), true); assert.equal(calls, 1);
});

test("pending transition blocks all repeats, refreshes and alternative actions", async () => {
  const gate = deferred(); let calls = 0;
  const c = create({ transitionGameLifecycle: async () => { ++calls; return gate.promise; } });
  await c.load(); const intent = c.prepare("pause"); const pending = c.apply(intent);
  assert.equal(await c.apply(intent), false); assert.equal(await c.load(), false); assert.equal(c.prepare("end"), null);
  gate.resolve({ outcome: "applied", lifecycle: model({ version: 4 }) }); await pending;
  assert.equal(calls, 1); assert.equal(c.getState().lifecycle.version, 4);
});

test("ambiguous failure retains exact identity through repeat review until acknowledged", async () => {
  const calls = [];
  const c = create({ transitionGameLifecycle: async (input) => {
    calls.push(input);
    if (calls.length === 1) throw createAdminErrorEnvelope({ code: "REQUEST_TIMEOUT", retryable: true });
    return { outcome: "replayed", lifecycle: model({ version: 4 }) };
  } });
  await c.load(); const intent = c.prepare("revoke_sessions"); assert.equal(await c.apply(intent), false);
  assert.equal(c.getState().status, "uncertain"); assert.equal(c.prepare("end"), null);
  c.cancelReview(); assert.equal(c.prepare("revoke_sessions"), intent);
  assert.equal(await c.apply(intent), true);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.equal(calls[0].expectedVersion, calls[1].expectedVersion);
  assert.equal(c.getState().intent, null);
});

test("version conflict requires fresh state and a new review, never blind retry", async () => {
  const c = create({ transitionGameLifecycle: async () => { throw createAdminErrorEnvelope({ code: "CONFLICT" }); } });
  await c.load(); const old = c.prepare("pause"); await c.apply(old);
  assert.equal(c.getState().status, "failed"); assert.equal(c.prepare("pause"), null);
  await c.load(); const next = c.prepare("pause"); assert.notEqual(old.idempotencyKey, next.idempotencyKey);
  assert.equal(await c.apply(old), false);
});

test("stale reads cannot replace newer lifecycle and destruction suppresses late writes", async () => {
  const gate = deferred(); let reads = 0; let changed = 0; let applied = 0;
  const c = create({ readGameLifecycle: async () => ++reads === 1 ? gate.promise : model({ version: 9 }) }, { onChange: () => ++changed, onApplied: () => ++applied });
  const old = c.load(); await c.load(); gate.resolve(model()); await old;
  assert.equal(c.getState().lifecycle.version, 9);
  const mutation = deferred();
  const writer = create({ transitionGameLifecycle: () => mutation.promise }, { onChange: () => ++changed, onApplied: () => ++applied });
  await writer.load(); const pending = writer.apply(writer.prepare("end")); writer.destroy();
  const last = changed; mutation.resolve({ outcome: "applied", lifecycle: model() }); await pending;
  assert.equal(changed, last); assert.equal(applied, 0);
});

test("reviewed action is rejected if write permission is withdrawn before confirmation", async () => {
  let writeAllowed = true; let calls = 0;
  const c = create({ transitionGameLifecycle: async () => { ++calls; } }, { hasPermission: (p) => p !== "game.update" || writeAllowed });
  await c.load(); const intent = c.prepare("end"); writeAllowed = false;
  assert.equal(await c.apply(intent), false); assert.equal(calls, 0);
});

test("lifecycle API honors abort and sanitizes expired/revoked server sessions", async () => {
  let calls = 0;
  const api = createAdminApiClient({ fetchImpl: async () => { ++calls; return response({ error: { code: "SESSION_EXPIRED", message: "private owner data" } }, 401); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.readGameLifecycle({ gameId: GAME, signal: controller.signal }), (e) => e.code === "REQUEST_ABORTED");
  assert.equal(calls, 0);
  await assert.rejects(api.transitionGameLifecycle({ gameId: GAME, action: "end", expectedVersion: 3, idempotencyKey: KEY }), (e) => e.code === "SESSION_REQUIRED" && !JSON.stringify(e).includes("private owner"));
});
