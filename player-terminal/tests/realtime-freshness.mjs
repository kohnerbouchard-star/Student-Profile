import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { PlayerApi } from "../src/api/player-api.js";
import { resourceFreshnessMs, validInvalidationResources } from "../src/api/freshness.js";
import {
  clearAllResourceInvalidations,
  isResourceInvalidated,
  markResourceInvalidations,
  pendingResourceInvalidations
} from "../src/api/invalidation-registry.js";
import { createStore } from "../src/core/store.js";
import {
  DEFAULT_PLAYER_INVALIDATION_EVENT,
  installPlayerInvalidationController,
  normalizePlayerInvalidationEvent,
  shouldRefreshCurrentRoute
} from "../src/realtime/player-invalidation-controller.js";
import { previewData } from "../src/data/preview-data.js";

const CSRF_TOKEN = "C".repeat(43);
const ROTATED_CSRF_TOKEN = "D".repeat(43);
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";

assert.equal(resourceFreshnessMs("market"), 5000);
assert.equal(resourceFreshnessMs("countries"), 300000);
assert.equal(resourceFreshnessMs("news", { news: 7 }), 7);
assert.deepEqual(validInvalidationResources(["market", "unknown", "market", "banking"]), ["market", "banking"]);
assert.deepEqual(normalizePlayerInvalidationEvent({ resources: ["contracts", "banking"], gameSessionId: "game-1" }, "game-1"), ["contracts", "banking"]);
assert.deepEqual(normalizePlayerInvalidationEvent({ resources: ["contracts"], gameSessionId: "game-other" }, "game-1"), []);
assert.equal(shouldRefreshCurrentRoute("store", ["banking"]), true);
assert.equal(shouldRefreshCurrentRoute("store", ["contracts"]), false);
assert.equal(shouldRefreshCurrentRoute("market", ["dashboard"]), true, "Shell/dashboard invalidations affect every active route.");

let newsReads = 0;
const api = new PlayerApi({
  usePreviewData: false,
  authenticated: true,
  csrfToken: CSRF_TOKEN,
  publishableKey: "sb_publishable_realtime_fixture",
  deviceId: DEVICE_ID,
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  resourceFreshnessMs: { news: 5 },
  allowedImageHosts: [],
  gameSessionId: "game-1",
  apiCall: async ({ endpointKey }) => {
    assert.equal(endpointKey, "news");
    newsReads += 1;
    return structuredClone(previewData.news);
  }
});

clearAllResourceInvalidations();
await api.request("news");
await api.request("news");
assert.equal(newsReads, 1, "A fresh read should use the resource cache.");
await delay(8);
await api.request("news");
assert.equal(newsReads, 2, "An expired resource must be refetched.");
markResourceInvalidations(["news"]);
assert.equal(isResourceInvalidated("news"), true);
await api.request("news");
assert.equal(newsReads, 3, "A realtime invalidation must bypass an otherwise fresh cache entry.");
assert.equal(isResourceInvalidated("news"), false, "A successful authenticated refetch clears the invalidation.");

markResourceInvalidations(["market", "banking"]);
assert.deepEqual(pendingResourceInvalidations().sort(), ["banking", "market"]);
api.setSession({ authenticated: true, csrfToken: ROTATED_CSRF_TOKEN, gameSessionId: "game-1" });
assert.deepEqual(pendingResourceInvalidations(), [], "Session replacement must clear old-session invalidations.");
assert.equal(api.config.csrfToken, ROTATED_CSRF_TOKEN);
assert.equal("playerSessionToken" in api.config, false);

const eventTarget = new EventTarget();
const documentRef = new EventTarget();
documentRef.visibilityState = "visible";
let route = "store";
let navigations = 0;
const terminal = {
  getState: () => ({ status: "ready", route }),
  navigate(nextRoute) {
    assert.equal(nextRoute, route);
    navigations += 1;
    return true;
  }
};
const controller = installPlayerInvalidationController({
  terminal,
  config: { gameSessionId: "game-1" },
  eventTarget,
  documentRef,
  debounceMs: 5
});
assert.equal(controller.eventName, DEFAULT_PLAYER_INVALIDATION_EVENT);

function invalidationEvent(detail) {
  const event = new Event(DEFAULT_PLAYER_INVALIDATION_EVENT);
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

clearAllResourceInvalidations();
eventTarget.dispatchEvent(invalidationEvent({ resources: ["store", "banking"], gameSessionId: "game-1", ignoredPayload: { balance: 999999 } }));
eventTarget.dispatchEvent(invalidationEvent({ resources: ["store"], gameSessionId: "game-1" }));
await delay(15);
assert.equal(navigations, 0, "Realtime reconciliation must not force route navigation or a page-style refresh.");
assert.equal(isResourceInvalidated("store"), true, "The registry remains marked until the authenticated resource request completes.");

eventTarget.dispatchEvent(invalidationEvent({ resources: ["contracts"], gameSessionId: "game-1" }));
await delay(15);
assert.equal(navigations, 0, "Off-route invalidations must not force an unrelated route navigation.");
assert.equal(isResourceInvalidated("contracts"), true, "Off-route data stays stale until its next authenticated load.");

eventTarget.dispatchEvent(invalidationEvent({ resources: ["store"], gameSessionId: "game-other" }));
await delay(15);
assert.equal(navigations, 0, "Cross-session invalidation signals must be ignored.");
controller.destroy();
clearAllResourceInvalidations();

const idleEventTarget = new EventTarget();
const idleDocumentRef = new EventTarget();
idleDocumentRef.visibilityState = "visible";
const idleStore = createStore({
  status: "ready",
  route: "profile",
  data: { session: {}, dashboard: {}, notifications: {} },
  live: { status: "connected", updatedAt: 1, error: "" }
});
let idleStoreWrites = 0;
const unsubscribeIdleWrites = idleStore.subscribe(() => { idleStoreWrites += 1; });
const idleTerminal = {
  getState: idleStore.getState,
  subscribe: idleStore.subscribe,
  navigate(nextRoute) {
    assert.equal(nextRoute, "profile");
    return true;
  }
};
const idleController = installPlayerInvalidationController({
  terminal: idleTerminal,
  config: { gameSessionId: "game-1" },
  eventTarget: idleEventTarget,
  documentRef: idleDocumentRef,
  debounceMs: 5,
  checkIntervalMs: 500
});
const writesAfterInstall = idleStoreWrites;
assert.equal(writesAfterInstall, 1, "Installing the live controller should publish its initial live timestamp once.");
await delay(650);
assert.equal(idleStoreWrites, writesAfterInstall, "An idle connected heartbeat must not write the terminal store or trigger a page rerender.");
idleController.destroy();
unsubscribeIdleWrites();

const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const controllerSource = await readFile(new URL("../src/realtime/player-invalidation-controller.js", import.meta.url), "utf8");
assert.ok(mainSource.includes("installPlayerInvalidationController"));
assert.ok(controllerSource.includes("markResourceInvalidations"));
assert.ok(controllerSource.includes("api.refreshResources(targets)"), "Realtime updates must use targeted resource reconciliation.");
assert.ok(controllerSource.includes("updateStoreFromSnapshot"), "Targeted resource results must merge into the existing Player store.");
assert.ok(controllerSource.includes("MutationObserver"), "Opened transactional disclosures must be observed so live reconciliation cannot replace an active form.");
assert.ok(controllerSource.includes("data-player-live-refresh-active"), "Opened form disclosures must receive an interaction guard until they close.");
assert.ok(!controllerSource.includes("supabase") && !controllerSource.includes("postgres_changes"), "The frontend invalidation boundary must not subscribe directly to economic tables.");
assert.ok(!controllerSource.includes("balance") && !controllerSource.includes("playerUuid"), "Invalidation signals must contain no sensitive or authoritative economic data.");

console.log("Realtime freshness passed: TTLs, allowlisted signals, cookie-session scope rotation, targeted resource reconciliation, authenticated refetch, interaction-safe disclosure deferral, idle-heartbeat stability, and payload privacy are valid.");

// Real API/coordinator and store; transport and terminal navigation are fixtures.
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
function held() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function until(predicate) {
  for (let count = 0; count < 600; count++) {
    if (predicate()) return;
    await delay(2);
  }
  throw new Error("Realtime fixture did not settle");
}
class TrackedTarget extends EventTarget {
  listeners = new Set();
  addEventListener(type, listener) { this.listeners.add(listener); super.addEventListener(type, listener); }
  removeEventListener(type, listener) { this.listeners.delete(listener); super.removeEventListener(type, listener); }
}
function sharedFixture() {
  const freshness = createResourceFreshnessCoordinator(), target = new TrackedTarget(), doc = new TrackedTarget();
  doc.visibilityState = "visible";
  const requests = [], holds = new Map();
  let version = 0, refreshes = 0, paused = false;
  const config = {
    usePreviewData: false, authenticated: true, csrfToken: CSRF_TOKEN, deviceId: DEVICE_ID,
    publishableKey: "sb_publishable_realtime_shared_fixture", gameSessionId: "game-1",
    requestTimeoutMs: 5000, writeCooldownMs: 0, allowedImageHosts: [], resourceFreshnessMs: { inventory: 60000 },
    apiCall: async ({ endpointKey, method }) => {
      requests.push({ endpointKey, method });
      if (method === "POST") { version++; return { ok: true, outcome: "created" }; }
      const data = { ...structuredClone(previewData[endpointKey]), marker: version };
      const hold = holds.get(endpointKey);
      if (hold) {
        holds.delete(endpointKey);
        hold.started = true;
        await hold.promise;
        if (hold.error) throw hold.error;
      }
      return data;
    }
  };
  const api = new PlayerApi(config, { freshness, deferFreshnessSettlement: true });
  const store = createStore({ status: "ready", route: "inventory", data: { ...structuredClone(previewData), inventory: { ...previewData.inventory, marker: 0 }, resourceStatus: {} } });
  const terminal = { freshness, getState: store.getState, subscribe: store.subscribe, navigate() {}, refresh() { refreshes++; } };
  const mount = { contains: () => true, querySelector: () => paused ? {} : null };
  const install = (options = {}) => installPlayerInvalidationController({ terminal, config, mount, eventTarget: target, documentRef: doc, debounceMs: 5, checkIntervalMs: 60000, ...options });
  const controller = install();
  return {
    freshness, api, store, terminal, config, controller, install, requests, target, doc,
    hold(key, error) { const value = { ...held(), error }; holds.set(key, value); return value; },
    signal(keys) { target.dispatchEvent(invalidationEvent({ resources: keys, gameSessionId: config.gameSessionId })); },
    pause(value) { paused = value; },
    refreshes: () => refreshes,
    close() { controller.destroy(); api.abortSessionRequests(); }
  };
}
{
  const f = sharedFixture(), other = sharedFixture();
  const old = f.hold("inventory");
  f.controller.refreshNow(["inventory"]);
  await until(() => old.started);
  const equivalent = f.api.request("inventory", { force: true }).catch((error) => error);
  await delay(5);
  assert.equal(f.requests.length, 1, "Equivalent reads share one current-generation transport");
  const otherTicket = other.freshness.capture(["inventory"]);
  const mutation = await f.api.execute("itemEffectUse", { itemKey: "fixture", idempotencyKey: "realtime-held-write" });
  const refreshed = await f.api.refreshResources(mutation.invalidatedResources);
  f.store.setState((state) => ({ ...state, data: { ...state.data, ...refreshed.data } }));
  for (const resource of mutation.invalidatedResources) f.freshness.settle(f.freshness.ticketFor(refreshed), resource);
  assert.equal(f.store.getState().data.inventory.marker, 1);
  f.pause(true);
  f.signal(["inventory"]);
  const stateAfterWrite = f.store.getState();
  old.resolve();
  assert.equal((await equivalent).code, "REQUEST_SUPERSEDED");
  await delay(15);
  assert.equal(f.store.getState().data, stateAfterWrite.data, "Old realtime completion cannot overwrite post-write values/status/capabilities");
  assert.equal(f.freshness.isPending("inventory"), true, "Old completion cannot settle a newer invalidation");
  assert.equal(other.freshness.isCurrent(otherTicket), true, "Independent terminal generations are isolated");
  assert.equal(other.requests.length, 0);
  f.pause(false);
  f.controller.refreshNow(["inventory"]);
  await until(() => !f.freshness.isPending("inventory"));
  assert.equal(f.requests.filter((r) => r.endpointKey === "inventory").length, 3, "Post-write/new-generation reads exclude the old read");
  f.close(); other.close();
}
{
  const f = sharedFixture(), old = f.hold("inventory");
  f.controller.refreshNow(["inventory"]);
  await until(() => old.started);
  const newer = f.hold("inventory");
  f.signal(["inventory"]);
  await until(() => newer.started);
  old.resolve();
  await delay(10);
  assert.equal(f.terminal.getState().live.status, "updating");
  f.signal(["contracts"]);
  await delay(60);
  assert.equal(f.requests.length, 2, "Old finally cannot release the newer refresh owner");
  newer.resolve();
  await until(() => f.terminal.getState().live.status === "connected");
  f.close();
}
for (const failureFirst of [false, true]) {
  const f = sharedFixture(), failure = f.hold("inventory", Object.assign(new Error("unavailable"), { status: 400 }));
  const success = f.hold("dashboard");
  f.controller.refreshNow(["inventory", "dashboard"]);
  await until(() => failure.started && success.started);
  (failureFirst ? failure : success).resolve();
  await delay(10);
  assert.equal(f.freshness.isPending("dashboard"), true, "Read completion alone cannot settle unpublished data");
  (failureFirst ? success : failure).resolve();
  await until(() => f.terminal.getState().live.error === "partial_refresh");
  assert.equal(f.terminal.getState().data.inventory.marker, 0);
  assert.equal(f.terminal.getState().data.resourceStatus.inventory.state, "unavailable");
  assert.equal(f.freshness.isPending("inventory"), true);
  assert.equal(f.freshness.isPending("dashboard"), false);
  f.controller.refreshNow(["inventory"]);
  await until(() => !f.freshness.isPending("inventory"));
  assert.equal(f.terminal.getState().data.resourceStatus.inventory.state, "ready");
  f.close();
}
{
  const f = sharedFixture();
  await f.api.execute("itemEffectUse", { itemKey: "fixture", idempotencyKey: "mixed-sibling-write" });
  const oldDashboard = f.hold("dashboard");
  f.controller.refreshNow(["dashboard", "inventory"]);
  await until(() => oldDashboard.started && f.requests.some((r) => r.endpointKey === "inventory"));
  await delay(10);
  f.signal(["dashboard"]);
  await until(() => f.store.getState().data.dashboard.marker === 1);
  oldDashboard.resolve();
  await delay(10);
  assert.equal(f.store.getState().data.inventory.marker, 1, "Superseded sibling batch cannot lose unpublished Inventory");
  assert.equal(f.freshness.isPending("inventory"), false, "Only published Inventory settles pending");
  f.close();
}
for (const kind of ["session", "abort", "destroy", "stale401"]) {
  const f = sharedFixture(), read = f.hold("inventory", kind === "stale401" ? { status: 401, code: "UNAUTHORIZED" } : null);
  f.controller.refreshNow(["inventory", "dashboard"]);
  await until(() => read.started);
  if (kind === "destroy") f.controller.destroy();
  else if (kind === "abort") f.api.abortSessionRequests();
  else f.api.setSession({ authenticated: true, csrfToken: ROTATED_CSRF_TOKEN, gameSessionId: "game-2" });
  const snapshot = f.store.getState();
  read.resolve();
  await delay(20);
  assert.equal(f.store.getState(), snapshot, `${kind}: retired completion cannot publish errors/live/data`);
  assert.equal(f.refreshes(), 0, "Stale 401 cannot refresh the current session");
  if (kind === "destroy") assert.equal(f.freshness.isPending("inventory"), true, "Destroyed publisher cannot settle unpublished data");
  f.close();
}
{
  const f = sharedFixture(), old = f.hold("inventory");
  assert.equal(f.target.listeners.size, 4);
  assert.equal(f.doc.listeners.size, 1);
  f.controller.refreshNow(["inventory"]);
  await until(() => old.started);
  f.controller.destroy();
  assert.equal(f.target.listeners.size + f.doc.listeners.size, 0);
  const replacement = f.install(), newer = f.hold("inventory");
  replacement.refreshNow(["inventory"]);
  await until(() => newer.started);
  old.resolve();
  await delay(10);
  assert.equal(f.terminal.getState().live.status, "updating");
  newer.resolve();
  await until(() => f.terminal.getState().live.status === "connected");
  replacement.destroy();
  assert.equal(f.target.listeners.size + f.doc.listeners.size, 0);
  const snapshot = f.store.getState(), count = f.requests.length;
  f.signal(["inventory"]);
  replacement.refreshNow(["inventory"]);
  await delay(15);
  assert.equal(f.requests.length, count);
  assert.equal(f.store.getState(), snapshot);
  f.close();
}
{
  const f = sharedFixture();
  f.signal(["inventory"]);
  f.api.abortSessionRequests();
  await delay(15);
  assert.equal(f.requests.length, 0, "Retired-session debounce cannot start a read");
  f.store.setState({ modal: {} });
  f.controller.refreshNow(["inventory"]);
  await delay(15);
  assert.equal(f.requests.length, 0, "Modal/interaction deferral is retained");
  f.store.setState({ modal: null });
  f.controller.refreshNow(["inventory"]);
  await until(() => f.requests.length === 1);
  f.close();
}
{
  const f = sharedFixture(), original = PlayerApi.prototype.loadResources;
  PlayerApi.prototype.loadResources = async function (...args) {
    const result = await original.apply(this, args);
    f.freshness.invalidate(["inventory"]);
    return result;
  };
  try {
    const before = f.store.getState().data;
    f.controller.refreshNow(["inventory"]);
    await until(() => f.requests.length === 1);
    await delay(10);
    assert.equal(f.store.getState().data, before, "Final publication rechecks the settled result ticket");
    assert.equal(f.freshness.isPending("inventory"), true);
  } finally { PlayerApi.prototype.loadResources = original; f.close(); }
}
for (const releaseBeforePoll of [true, false]) {
  const f = sharedFixture();
  await f.api.execute("itemEffectUse", { itemKey: "fixture", idempotencyKey: "automatic-remount-write" });
  const old = f.hold("inventory");
  f.controller.refreshNow(["inventory"]);
  await until(() => old.started);
  f.controller.destroy();
  const replacement = f.install({ checkIntervalMs: 500 });
  const count = f.requests.length;
  if (!releaseBeforePoll) await delay(550);
  old.resolve();
  await delay(750);
  assert.equal(f.store.getState().data.inventory.marker, 1, "Automatic remount must recover unpublished pending Inventory");
  assert.ok(f.requests.length > count, "Remount uses its existing cadence without manual refreshNow");
  assert.equal(f.requests.filter((r) => r.endpointKey === "inventory").length, releaseBeforePoll ? 2 : 1, "A remounted publisher can own a coalesced current-generation read");
  assert.equal(f.freshness.isPending("inventory"), false);
  replacement.destroy(); f.close();
}
{
  const f = sharedFixture(), before = f.store.getState();
  f.terminal.getState = () => ({ ...f.store.getState() });
  f.controller.refreshNow(["inventory"]);
  await until(() => f.requests.length === 1);
  await delay(10);
  assert.equal(f.store.getState(), before, "An unowned snapshot cannot publish to the terminal store");
  assert.equal(f.freshness.isPending("inventory"), true, "Failed store admission cannot settle pending");
  f.close();
}
console.log("Optional realtime generations, coalescing, publication and lifecycle boundaries passed.");
