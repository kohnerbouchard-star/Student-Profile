import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { previewData } from "../src/data/preview-data.js";

const CSRF_TEST = "R".repeat(43);
let readCount = 0;
let releaseStaleRead;
let markStaleReadStarted;
const staleReadGate = new Promise((resolve) => { releaseStaleRead = resolve; });
const staleReadStarted = new Promise((resolve) => { markStaleReadStarted = resolve; });

const api = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 0,
  allowedImageHosts: [],
  capabilities: null,
  authenticated: true,
  csrfToken: CSRF_TEST,
  gameSessionId: "game_read_ordering",
  apiCall: async ({ endpointKey }) => {
    assert.equal(endpointKey, "news");
    readCount += 1;
    const model = structuredClone(previewData.news);
    const marker = readCount === 1 ? "stale-before-mutation" : "fresh-after-mutation";
    model.items[0] = { ...model.items[0], title: marker };
    if (readCount === 1) {
      markStaleReadStarted();
      await staleReadGate;
    }
    return model;
  }
});

const staleRead = api.request("news", { force: true });
await staleReadStarted;
api.invalidateResources(["news"]);

const freshRead = await api.request("news", { force: true });
assert.equal(freshRead.items[0].title, "fresh-after-mutation", "Invalidation must start a fresh authoritative read.");

releaseStaleRead();
await assert.rejects(
  staleRead,
  (error) => error.code === "REQUEST_SUPERSEDED",
  "A pre-invalidation read must not resolve into newer player state."
);

const cachedRead = await api.request("news");
assert.equal(cachedRead.items[0].title, "fresh-after-mutation", "A late stale completion must not overwrite the refreshed cache.");
assert.equal(readCount, 2, "The fresh response should remain cacheable after the stale read is superseded.");
assert.equal(api.inFlightReads.size, 0, "All read bookkeeping should settle after both generations complete.");

console.log("Player read ordering passed: invalidation supersedes stale in-flight reads without overwriting newer state.");

const { createResourceFreshnessCoordinator } = await import("../src/api/resource-freshness-coordinator.js");
const { markResourceInvalidations, isResourceInvalidated, clearAllResourceInvalidations } = await import("../src/api/invalidation-registry.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const freshness = createResourceFreshnessCoordinator(), calls = [], holds = new Map();
  let version = 0, outcome = "created";
  const config = { ...api.config, resourceFreshnessMs: { inventory: 60000 }, apiCall: async (context) => {
    calls.push(context.endpointKey);
    if (context.method !== "GET") {
      if (outcome === "rejected") throw { status: 409, code: "CONFLICT" };
      const gate = holds.get("write"); holds.delete("write");
      if (gate) await gate.promise;
      if (outcome !== "replayed") version++;
      return { ok: true, outcome };
    }
    const value = structuredClone(previewData[context.endpointKey]);
    if (context.endpointKey === "inventory") value.marker = version;
    const gate = holds.get(context.endpointKey); holds.delete(context.endpointKey);
    if (gate) await gate.promise;
    return value;
  } };
  const first = new PlayerApi(config, { freshness }), second = new PlayerApi(config, { freshness });
  return { freshness, config, first, second, calls, hold(key) { const gate = deferred(); holds.set(key, gate); return gate; },
    outcome(value) { outcome = value; }, write: () => second.execute("itemEffectUse", {}, { itemKey: "fixture-item" }) };
}
const superseded = (error) => error.code === "REQUEST_SUPERSEDED" && error.status !== 401;
const aborted = (error) => error.code === "REQUEST_ABORTED" && error.status !== 401;

// Shared equivalent reads coalesce; invalidation cannot reuse pre-write work or sibling cache.
for (const outcome of ["created", "replayed"]) {
  const f = fixture(); f.outcome(outcome);
  await f.first.request("inventory");
  const hold = f.hold("inventory");
  const old = f.first.request("inventory", { force: true });
  const equivalent = f.second.request("inventory", { force: true });
  await tick(); assert.equal(f.calls.length, 2);
  await f.write();
  assert.equal(f.freshness.isPending("inventory"), true);
  const latest = await f.second.request("inventory");
  assert.equal(latest.marker, outcome === "created" ? 1 : 0);
  hold.resolve(); await assert.rejects(old, superseded); await assert.rejects(equivalent, superseded);
  assert.equal((await f.first.request("inventory")).marker, latest.marker);
  assert.deepEqual(f.calls, ["inventory", "inventory", "itemEffectUse", "inventory", "inventory"]);
}
{
  const f = fixture(); await f.first.request("inventory");
  const ticket = f.freshness.capture(["inventory"]); f.outcome("rejected");
  await assert.rejects(f.write(), (error) => error.status === 409);
  assert.equal(f.freshness.isCurrent(ticket), true);
  await f.first.request("inventory"); assert.deepEqual(f.calls, ["inventory", "itemEffectUse"]);
}
// Settled early values AND errors must be fenced again after the slow batch member.
for (const failEarly of [false, true]) {
  const f = fixture(), slow = f.hold("news");
  if (failEarly) { const bad = f.hold("inventory"); bad.reject({ status: 401 }); }
  const batch = f.first.loadResources(["inventory", "news"]);
  await tick(); f.second.invalidateResources(["inventory"]); slow.resolve();
  await assert.rejects(batch, superseded);
  assert.equal(f.freshness.isPending("inventory"), true, "Old batch must not clear new invalidation.");
}
// Late 401 and refresh failures cannot escape with an obsolete generation/session.
for (const reset of [false, true]) {
  const f = fixture(), hold = f.hold("inventory");
  const old = f.first.loadRoute("inventory");
  await tick();
  if (reset) f.second.setSession({ gameSessionId: "next-game" });
  else f.second.invalidateResources(["inventory"]);
  hold.reject({ status: 401 }); await assert.rejects(old, reset ? aborted : superseded);
}
{
  const f = fixture(), hold = f.hold("inventory");
  const refresh = f.first.refreshResources(["inventory"]); await tick(); hold.reject({ status: 409 });
  const failed = await refresh;
  assert.equal(failed.errors.inventory.status, 409);
  assert.equal(f.freshness.isPending("inventory"), true);
  assert.equal(f.freshness.isCurrent(f.freshness.ticketFor(failed)), true);
  f.second.invalidateResources(["inventory"]);
  assert.equal(f.freshness.isCurrent(f.freshness.ticketFor(failed)), false, "Consumer must recheck even an already-returned error batch.");
}
// Bootstrap may not publish stale session/capability/status after optional reads settle.
{
  const f = fixture(), hold = f.hold("notifications"), support = f.first.resourceSupport;
  const bootstrap = f.first.bootstrap(); await tick();
  f.second.setSession({ gameSessionId: "next-game" }); hold.resolve();
  await assert.rejects(bootstrap, aborted); assert.equal(f.first.resourceSupport, support);
  const fresh = await f.second.bootstrap();
  const ticket = f.freshness.ticketFor(fresh); assert.equal(f.freshness.isCurrent(ticket), true);
  f.freshness.reset(); assert.equal(f.freshness.isCurrent(ticket), false);
}
// Independent terminals and request parameters never share pending reads or epochs.
{
  const f = fixture(), isolated = new PlayerApi(f.config, { freshness: createResourceFreshnessCoordinator() });
  assert.equal(isolated.freshness.isCurrent(f.freshness.capture(["inventory"])), false);
  const hold = f.hold("inventory"), pending = f.first.request("inventory"); await tick();
  await isolated.request("inventory"); assert.equal(f.calls.length, 2);
  isolated.abortSessionRequests(); hold.resolve(); await pending;
  const before = f.freshness.capture(["inventory"]);
  markResourceInvalidations(["inventory"]);
  await f.first.request("inventory"); assert.equal(f.calls.length, 2);
  assert.equal(isResourceInvalidated("inventory"), true, "Injected coordinator does not acknowledge another terminal's global registry.");
  clearAllResourceInvalidations(); assert.equal(f.freshness.isCurrent(before), true);
  await Promise.all([f.first.request("news", { params: { page: 1 } }), f.second.request("news", { params: { page: 2 } })]);
  assert.equal(f.calls.filter((key) => key === "news").length, 2);
  await f.first.request("news", { params: { page: 2 } });
  assert.equal(f.calls.filter((key) => key === "news").length, 3, "A different query cannot use page 1 cache.");
  const otherConfig = new PlayerApi({ ...f.config }, { freshness: f.freshness });
  await Promise.all([f.first.request("news", { force: true }), otherConfig.request("news", { force: true })]);
  assert.equal(f.calls.filter((key) => key === "news").length, 5);
}
// Session changes fence pending writes; sibling adoption of the same session is idempotent.
{
  const f = fixture(), hold = f.hold("write");
  const write = f.write(); await tick(); f.first.setSession({ gameSessionId: "next-game" });
  const ticket = f.freshness.capture(["inventory"]);
  await f.second.request("inventory");
  assert.equal(f.freshness.isCurrent(ticket), true); hold.resolve(); await assert.rejects(write, aborted);
  assert.equal(f.freshness.isPending("inventory"), false);
}
{
  const f = fixture(), hold = f.hold("inventory"), controller = new AbortController();
  const cancelled = f.first.request("inventory", { signal: controller.signal }); await tick();
  await f.second.request("inventory"); controller.abort(); hold.resolve();
  await assert.rejects(cancelled, aborted);
  assert.equal((await f.second.request("inventory")).marker, 0);
}
// A primary result can age while dependent route reads are still pending.
{
  const f = fixture(), hold = f.hold("businessTreasury");
  const route = f.first.loadRoute("business"); await tick();
  assert.equal(f.calls.includes("businessTreasury"), true);
  f.second.invalidateResources(["business"]); hold.resolve();
  await assert.rejects(route, superseded);
}
{
  const f = fixture(), hold = f.hold("inventory");
  const old = f.first.request("inventory"); await tick();
  f.second.invalidateResources(["inventory"]); hold.resolve();
  await assert.rejects(old, superseded);
  assert.equal(f.freshness.isPending("inventory"), true);
  const batch = await f.first.loadResources(["inventory", "news"]);
  const ticket = f.freshness.ticketFor(batch);
  assert.equal(f.freshness.isCurrent(ticket), true);
  f.second.invalidateResources(["inventory"]);
  assert.equal(f.freshness.isCurrent(ticket), false, "Final terminal publisher must check returned tickets again.");
}
console.log("Injected freshness passed: shared reads, mutation/replay/rejection, batch/error tickets, session/terminal isolation and cancellation.");
