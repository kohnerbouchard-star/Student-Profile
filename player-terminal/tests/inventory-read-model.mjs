import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { createResourceSupport } from "../src/api/resource-support.js";
import { isResourceReady, isResourceUnavailable } from "../src/api/resource-status.js";
import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { normalizePlayerInventory } from "../src/features/inventory/inventory-read-model.js";
import { renderInventoryPage } from "../src/pages/inventory-page.js";
import { previewData } from "../src/data/preview-data.js";

const response = {
  ok: true,
  gameSession: { id: "game-1", name: "Econovaria", status: "active" },
  player: {
    id: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    displayName: "Alex Rivera",
    rosterLabel: "Team A",
    status: "active"
  },
  generatedAt: "2026-07-18T12:00:00.000Z",
  capacity: null,
  categories: ["Consumables", "Equipment"],
  summary: {
    itemTypes: 3,
    quantityOwned: 9,
    quantityReserved: 2,
    quantityAvailable: 7,
    values: [
      { currencyCode: "ECO", totalOwnedValue: 100 },
      { currencyCode: "LUM", totalOwnedValue: 30 }
    ]
  },
  items: [
    {
      id: "holding-consumable",
      storeItemId: "item-consumable",
      itemKey: "energy-cell-pack",
      name: "Energy Cell Pack",
      description: "Restores field equipment.",
      category: "Consumables",
      quantityOwned: 5,
      quantityReserved: 2,
      quantityAvailable: 3,
      unitValue: 10,
      totalOwnedValue: 50,
      currencyCode: "ECO",
      itemStatus: "active",
      itemVisibility: "player",
      availableActions: [],
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    },
    {
      id: "holding-usable",
      storeItemId: "item-usable",
      itemKey: "priority-processing-token",
      name: "Priority Processing Token",
      description: "Authoritatively usable test item.",
      category: "Consumables",
      quantityOwned: 1,
      quantityReserved: 0,
      quantityAvailable: 1,
      unitValue: 50,
      totalOwnedValue: 50,
      currencyCode: "ECO",
      itemStatus: "active",
      itemVisibility: "player",
      availableActions: ["inventory.use"],
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    },
    {
      id: "holding-equipment",
      storeItemId: "item-equipment",
      itemKey: "market-lens",
      name: "Market Lens",
      description: "Teacher-supervised classroom equipment.",
      category: "Equipment",
      quantityOwned: 3,
      quantityReserved: 0,
      quantityAvailable: 3,
      unitValue: 10,
      totalOwnedValue: 30,
      currencyCode: "LUM",
      itemStatus: "active",
      itemVisibility: "player",
      availableActions: ["inventory.redeem"],
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    }
  ]
};

const inventory = normalizePlayerInventory(response);
assert.equal(inventory.items.length, 3);
assert.equal(inventory.items[0].quantityOwned, 5);
assert.equal(inventory.items[0].quantityReserved, 2);
assert.equal(inventory.items[0].quantityAvailable, 3);
assert.equal(inventory.items[0].state, "Partially Reserved");
assert.deepEqual(inventory.items[0].availableActions, []);
assert.deepEqual(inventory.items[1].availableActions, ["inventory.use"]);
assert.deepEqual(inventory.items[2].availableActions, ["inventory.redeem"]);
assert.equal(inventory.items[2].currencyCode, "LUM");
assert.equal(inventory.capacity, null);
assert.equal(inventory.summary.quantityAvailable, 7);
assert.ok(!JSON.stringify(inventory).includes("0c80fe6d-e1d9-4e90-90f4-1b174be727f1"), "The canonical player UUID must not be copied into the UI inventory model.");

const data = structuredClone(previewData);
data.inventory = inventory;
data.session.currencyCode = "ECO";
const html = renderInventoryPage(data, { inventoryCategory: "All" });
assert.ok(html.includes("Server managed"));
assert.ok(html.includes("NO PLAYER LIMIT"));
assert.ok(html.includes("AVAILABLE UNITS"));
assert.ok(html.includes(">7<"));
assert.ok(html.includes("RESERVED UNITS"));
assert.ok(html.includes(">2<"));
assert.ok(html.includes("Partially Reserved"));
assert.ok(html.includes("ECO 50"));
assert.ok(html.includes("LUM 30"), "Inventory values must use each item’s authoritative currency code.");
assert.ok(!html.includes('data-player-inventory-effect-use="energy-cell-pack"'), "Items without an authoritative availableActions policy must not expose use controls.");
assert.match(html, /data-player-inventory-effect-use="priority-processing-token"(?![^>]*disabled)/, "Effect-enabled items must expose direct use by canonical item key.");
assert.match(html, /data-player-inventory-redeem="holding-equipment"(?![^>]*disabled)/, "Teacher-supervised items must expose a redemption request control.");
assert.ok(html.includes("> Use</button>"), "Direct effect actions must be labeled Use.");
assert.ok(html.includes("Request redemption</button>"), "Teacher-supervised actions must be labeled Request redemption.");
assert.ok(html.includes("Item actions execute only when the backend publishes a supported policy"));

const route = resolvePlayerBackendRequest({
  endpointKey: "inventory",
  method: "GET",
  path: "/inventory",
  payload: {},
  params: {},
  session: { playerSessionToken: "token-1", gameSessionId: "game-1", playerSessionId: "session-1" }
});
assert.equal(route.method, "GET");
assert.equal(route.path, "/players/me/inventory");
assert.equal(route.payload, undefined);

console.log("Inventory read model passed: authoritative quantities, reservations, currencies, split item actions, and UUID privacy are valid.");

// REF-041: exercise Inventory through its existing shared owner, without a
// second loader/cache or relying on another resource's ordering coverage.
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function inventoryApi(apiCall) {
  return new PlayerApi({
    usePreviewData: false, authenticated: true, csrfToken: "I".repeat(43),
    gameSessionId: "inventory-game-one", requestTimeoutMs: 1000,
    resourceFreshnessMs: { inventory: 60000 }, allowedImageHosts: [], apiCall
  });
}
const model = (id) => ({ categories: ["All"], items: id ? [{ id }] : [] });
const cacheKey = "GET:inventory:/inventory";
const gate = deferred();
const started = deferred();
let reads = 0;
const lifecycle = inventoryApi(async ({ endpointKey, method, path }) => {
  assert.deepEqual([endpointKey, method, path], ["inventory", "GET", "/inventory"]);
  reads += 1;
  if (reads === 1) { started.resolve(); await gate.promise; }
  return model("held-item");
});
const first = lifecycle.loadResources(["inventory", "inventory"]);
await started.promise;
const duplicate = lifecycle.loadResources(["inventory"]);
assert.equal(lifecycle.inFlightReads.size, 1, "One pending Inventory operation owns loading bookkeeping.");
gate.resolve();
const [loaded, concurrent] = await Promise.all([first, duplicate]);
assert.deepEqual(loaded.data.inventory, concurrent.data.inventory);
assert.equal(reads, 1, "Duplicate resource keys and simultaneous consumers share one request.");
assert.equal(isResourceReady(loaded.data, "inventory"), true);
assert.equal(Object.isFrozen(loaded.resourceStatus), true);
assert.deepEqual(loaded.resourceStatus.inventory, { state: "ready", status: 200, code: "", retryAfterMs: 0 });
assert.deepEqual([...lifecycle.readCache.keys()], [cacheKey]);
await lifecycle.loadResources(["inventory"]);
assert.equal(reads, 1, "Fresh Inventory uses the same cached response without extra I/O.");
assert.equal(lifecycle.inFlightReads.size, 0);

// A stale completion cannot replace the post-invalidation authoritative value.
const staleGate = deferred();
const staleStarted = deferred();
let orderedReads = 0;
const ordered = inventoryApi(async () => {
  const sequence = ++orderedReads;
  if (sequence === 1) { staleStarted.resolve(); await staleGate.promise; }
  return model(sequence === 1 ? "old-item" : "new-item");
});
const stale = ordered.request("inventory");
const staleRejected = assert.rejects(stale, { code: "REQUEST_SUPERSEDED" });
await staleStarted.promise;
ordered.invalidateResources(["inventory"]);
assert.deepEqual(await ordered.request("inventory", { force: true }), model("new-item"));
staleGate.resolve();
await staleRejected;
assert.deepEqual(await ordered.request("inventory"), model("new-item"));
assert.equal(orderedReads, 2);
assert.equal(ordered.inFlightReads.size, 0);

// Cancellation is shared transport policy, including logout and game switch.
for (const boundary of ["caller", "logout", "game-switch"]) {
  const pending = deferred();
  const begun = deferred();
  const caller = new AbortController();
  let observedSignal;
  let count = 0;
  const cancelled = inventoryApi(async ({ signal }) => {
    count += 1;
    if (count === 1) {
      observedSignal = signal;
      begun.resolve();
      await pending.promise;
      return model("previous-session-item");
    }
    return model("current-session-item");
  });
  const read = cancelled.request("inventory", { signal: caller.signal });
  const rejection = assert.rejects(read, { code: "REQUEST_ABORTED" });
  await begun.promise;
  if (boundary === "caller") caller.abort();
  else if (boundary === "logout") cancelled.abortSessionRequests();
  else cancelled.setSession({ authenticated: true, gameSessionId: "inventory-game-two" });
  await rejection;
  assert.equal(observedSignal.aborted, true, boundary);
  assert.equal(cancelled.readCache.size, 0, boundary);
  assert.equal(cancelled.inFlightReads.size, 0, boundary);
  assert.deepEqual(await cancelled.request("inventory"), model("current-session-item"));
  pending.resolve();
  await Promise.resolve();
  assert.deepEqual(await cancelled.request("inventory"), model("current-session-item"));
  assert.equal(count, 2, "Late cancelled responses neither cache nor trigger extra reads.");
}

// Even a transport that ignores cancellation cannot repopulate a new session.
const ignoredAbort = inventoryApi(async () => model(""));
const oldCompletion = deferred();
const newCompletion = deferred();
let ignoredAbortReads = 0;
ignoredAbort.transport = { request: () => ++ignoredAbortReads === 1 ? oldCompletion.promise : newCompletion.promise };
const oldSessionRead = ignoredAbort.request("inventory");
const oldSessionRejected = assert.rejects(oldSessionRead, { code: "REQUEST_ABORTED" });
ignoredAbort.setSession({ authenticated: true, gameSessionId: "another-inventory-game" });
const newSessionRead = ignoredAbort.request("inventory");
oldCompletion.resolve(model("old-session-item"));
await oldSessionRejected;
assert.equal(ignoredAbort.readCache.size, 0);
assert.equal(ignoredAbort.inFlightReads.size, 1, "Old cleanup cannot remove the new session's pending operation.");
newCompletion.resolve(model("new-session-item"));
await newSessionRead;
assert.deepEqual(await ignoredAbort.request("inventory"), model("new-session-item"));
assert.equal(ignoredAbortReads, 2);
assert.equal(ignoredAbort.inFlightReads.size, 0);

// Backend absence must not substitute preview Inventory or mark an empty success.
let recoveryReads = 0;
const recovering = inventoryApi(async () => {
  recoveryReads += 1;
  if (recoveryReads === 1) throw { code: "OFFLINE", status: 0 };
  return model("");
});
const failed = await recovering.loadResources(["inventory"]);
assert.equal(isResourceUnavailable(failed.data, "inventory"), true);
assert.equal(failed.resourceStatus.inventory.code, "OFFLINE");
assert.equal(failed.data.inventory, undefined);
assert.equal(recovering.readCache.size, 0);
const recovered = await recovering.loadResources(["inventory"]);
assert.equal(isResourceReady(recovered.data, "inventory"), true);
assert.deepEqual(recovered.data.inventory.items, []);
assert.deepEqual(recovered.errors, {});
assert.equal(recoveryReads, 2);

let deniedReads = 0;
const denied = inventoryApi(async () => { deniedReads += 1; throw new Error("Unexpected read"); });
denied.resourceSupport = createResourceSupport({ session: { capabilityEndpointKeys: [] } });
const unavailable = await denied.loadResources(["inventory", "inventory"]);
assert.equal(unavailable.resourceStatus.inventory.code, "CAPABILITY_UNAVAILABLE");
assert.equal(isResourceUnavailable(unavailable.data, "inventory"), true);
assert.equal(deniedReads, 0, "Manifest denial performs no Inventory request.");
assert.equal(denied.readCache.size, 0);
console.log("Inventory shared lifecycle passed: dedup/cache 1 read; invalidation 2; each abort boundary 2; recovery 2; denied 0.");
