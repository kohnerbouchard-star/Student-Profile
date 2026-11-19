import assert from "node:assert/strict";
import test from "node:test";
import { createAdminApiClient } from "../admin/v2/src/api/admin-api-client.js";

const gameId = "10000000-0000-4000-8000-000000000001";
const playerId = "20000000-0000-4000-8000-000000000002";
const base = { gameId, playerId, itemId: playerId, idempotencyKey: "mutation-characterization-0001" };
const store = { ok: true, item: {} };
const player = { ok: true, player: {}, accessCode: {} };
const settings = { data: { saved: true, settings: {} } };
const response = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
function fixture() {
  const calls = [];
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    calls.push({ url, init, resolve: (value = store) => resolve(response(value)), reject });
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  return { calls, fetchImpl, api: createAdminApiClient({ fetchImpl }) };
}
const create = (api, extra = {}) => api.createStoreItem({ ...base, item: { name: "One" }, ...extra });

test("same pending fingerprint shares identity; settlement permits explicit retry", async () => {
  const { api, calls } = fixture();
  const first = create(api);
  assert.equal(first, create(api));
  assert.equal(calls.length, 1);
  calls[0].resolve(); await first;
  const retry = create(api); assert.notEqual(first, retry);
  assert.equal(calls.length, 2); calls[1].resolve(); await retry;
});
test("same key rejects changed body, path, method and cross-domain operation", async () => {
  const { api, calls } = fixture(); const first = create(api);
  for (const attempt of [
    () => create(api, { item: { name: "Two" } }),
    () => create(api, { gameId: playerId }),
    () => api.archiveStoreItem(base),
    () => api.createPlayer({ ...base, player: { displayName: "Example" } }),
  ]) await assert.rejects(attempt(), { code: "CONFLICT" });
  assert.equal(calls.length, 1); calls[0].resolve(); await first;
});
test("distinct keys and distinct client instances do not share pending state", async () => {
  const { api, calls, fetchImpl } = fixture();
  const requests = [create(api), create(api, { idempotencyKey: "mutation-characterization-0002" }), create(createAdminApiClient({ fetchImpl }))];
  assert.equal(calls.length, 3); calls.forEach((call) => call.resolve()); await Promise.all(requests);
});
for (const failure of ["network", "abort", "invalid"]) test(`${failure} clears pending state for explicit retry`, async () => {
  const { api, calls } = fixture(); const controller = new AbortController();
  const first = create(api, { signal: controller.signal });
  const rejected = assert.rejects(first);
  if (failure === "network") calls[0].reject(new TypeError("network"));
  if (failure === "abort") controller.abort();
  if (failure === "invalid") calls[0].resolve({});
  await rejected; const retry = create(api); assert.equal(calls.length, 2);
  calls[1].resolve(); await retry;
});
test("follower cancellation does not cancel leader; leader cancellation rejects shared promise", async () => {
  const { api, calls } = fixture(); const leader = new AbortController(); const follower = new AbortController();
  const first = create(api, { signal: leader.signal });
  assert.equal(first, create(api, { signal: follower.signal }));
  follower.abort(); assert.equal(calls[0].init.signal.aborted, false);
  const rejected = assert.rejects(first, { code: "REQUEST_ABORTED" }); leader.abort(); await rejected;
});
test("already aborted request never fetches and permits retry", async () => {
  const { api, calls } = fixture(); const signal = AbortSignal.abort();
  await assert.rejects(create(api, { signal }), { code: "REQUEST_ABORTED" });
  assert.equal(calls.length, 0); const retry = create(api); calls[0].resolve(); await retry;
});
test("field allowlist order normalizes top-level input, not nested JSON property order", async () => {
  const { api, calls } = fixture();
  const first = create(api, { item: { price: 2, name: "One" } });
  assert.equal(first, create(api, { item: { name: "One", price: 2 } }));
  calls[0].resolve(); await first;
  const nested = create(api, { item: { name: { a: 1, b: 2 } } });
  await assert.rejects(create(api, { item: { name: { b: 2, a: 1 } } }), { code: "CONFLICT" });
  calls[1].resolve(); await nested;
});
test("archive omits body/content-type; transport owns credentials and caller cannot inject headers", async () => {
  const { api, calls } = fixture();
  const pending = api.archiveStoreItem({ ...base, headers: { Authorization: "untrusted" }, credentials: "omit" });
  const { init } = calls[0]; const headers = new Headers(init.headers);
  assert.equal(init.body, undefined); assert.equal(headers.has("Content-Type"), false);
  assert.equal(headers.has("Authorization"), false); assert.equal(headers.get("Idempotency-Key"), base.idempotencyKey);
  assert.equal(init.credentials, "include"); assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error"); assert.equal(init.referrerPolicy, "no-referrer");
  calls[0].resolve(); await pending;
});
for (const [operation, input, valid, invalid] of [
  ["createStoreItem", { item: { name: "One" } }, store, player],
  ["createPlayer", { player: { displayName: "Example" } }, player, store],
  ["updatePlayerSettings", { settings: { displayName: "Example" } }, settings, player],
  ["updatePlayerCredentials", { credentials: { playerIdentifier: "example" } }, player, settings],
]) test(`${operation} retains its response validator and JSON header`, async () => {
  const { api, calls } = fixture(); const first = api[operation]({ ...base, ...input });
  const rejected = assert.rejects(first); calls[0].resolve(invalid); await rejected;
  const retry = api[operation]({ ...base, ...input });
  assert.equal(new Headers(calls[1].init.headers).get("Content-Type"), "application/json");
  calls[1].resolve(valid); assert.deepEqual(await retry, valid);
});
