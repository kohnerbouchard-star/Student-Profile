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
import {
  DEFAULT_PLAYER_INVALIDATION_EVENT,
  installPlayerInvalidationController,
  normalizePlayerInvalidationEvent,
  shouldRefreshCurrentRoute
} from "../src/realtime/player-invalidation-controller.js";
import { previewData } from "../src/data/preview-data.js";

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
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  resourceFreshnessMs: { news: 5 },
  allowedImageHosts: [],
  playerSessionToken: "token-freshness",
  gameSessionId: "game-1",
  playerSessionId: "session-1",
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
api.setSession({ playerSessionToken: "token-new-session", gameSessionId: "game-1", playerSessionId: "session-2" });
assert.deepEqual(pendingResourceInvalidations(), [], "Session replacement must clear old-session invalidations.");

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
assert.equal(navigations, 1, "Burst invalidations must debounce into one current-route refresh.");
assert.equal(isResourceInvalidated("store"), true, "The registry remains marked until the authenticated request completes.");

eventTarget.dispatchEvent(invalidationEvent({ resources: ["contracts"], gameSessionId: "game-1" }));
await delay(15);
assert.equal(navigations, 1, "Off-route invalidations must not force an unrelated route refresh.");
assert.equal(isResourceInvalidated("contracts"), true, "Off-route data stays stale until its next authenticated load.");

eventTarget.dispatchEvent(invalidationEvent({ resources: ["store"], gameSessionId: "game-other" }));
await delay(15);
assert.equal(navigations, 1, "Cross-session invalidation signals must be ignored.");
controller.destroy();
clearAllResourceInvalidations();

const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const controllerSource = await readFile(new URL("../src/realtime/player-invalidation-controller.js", import.meta.url), "utf8");
assert.ok(mainSource.includes("installPlayerInvalidationController"));
assert.ok(controllerSource.includes("markResourceInvalidations"));
assert.ok(!controllerSource.includes("supabase") && !controllerSource.includes("postgres_changes"), "The frontend invalidation boundary must not subscribe directly to economic tables.");
assert.ok(!controllerSource.includes("balance") && !controllerSource.includes("playerUuid"), "Invalidation signals must contain no sensitive or authoritative economic data.");

console.log("Realtime freshness passed: TTLs, allowlisted signals, session scope, debouncing, targeted route refresh, authenticated refetch, and payload privacy are valid.");
