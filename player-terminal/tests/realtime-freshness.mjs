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
