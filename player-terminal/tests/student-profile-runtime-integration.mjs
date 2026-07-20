import assert from "node:assert/strict";
import { PlayerApi } from "../src/api/player-api.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";
import { validateStudentProfileCapabilityManifest } from "../src/integrations/student-profile-capability-manifest.js";
import {
  installStudentProfileRuntime,
  STUDENT_PROFILE_CLASSROOM_API_BASE
} from "../src/integrations/student-profile-runtime.js";
import { renderInventoryPage } from "../src/pages/inventory-page.js";

const capabilityManifest = {
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-18.3",
  service: "classroom-api",
  capabilities: {
    routes: {
      dashboard: false,
      news: true,
      market: true,
      portfolio: false,
      business: false,
      contracts: false,
      store: false,
      marketplace: false,
      inventory: true,
      crafting: false,
      banking: false,
      loans: false,
      messages: false,
      progression: false,
      profile: false
    },
    actions: {
      bankingExport: false,
      bankTransfer: false,
      businessHire: false,
      businessPrice: false,
      businessProduction: false,
      chartRange: false,
      contractAccept: true,
      contractSubmit: false,
      craftItem: false,
      inventoryUse: true,
      loanApply: false,
      loanRepay: false,
      logout: true,
      marketOrder: false,
      marketSearch: false,
      marketWatchlist: true,
      marketplaceCancel: false,
      marketplaceListing: false,
      marketplacePurchase: false,
      messageAttachment: false,
      messageSearch: false,
      messageSend: false,
      notificationsRead: true,
      progressionClaim: false,
      progressionUnlock: false,
      savingsTransfer: false,
      storePurchase: false
    }
  },
  endpoints: [
    { key: "capabilities", operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }] },
    { key: "contractAccept", operations: [{ method: "POST", pathTemplate: "/players/me/contracts/:contractKey/accept" }] },
    { key: "countries", operations: [{ method: "GET", pathTemplate: "/players/me/world/countries" }] },
    { key: "country", operations: [{ method: "GET", pathTemplate: "/players/me/world/countries/:countryCode" }] },
    { key: "inventory", operations: [{ method: "GET", pathTemplate: "/players/me/inventory" }] },
    {
      key: "inventoryRedemptions",
      operations: [
        { method: "GET", pathTemplate: "/players/me/inventory/redemptions" },
        { method: "POST", pathTemplate: "/players/me/inventory/:itemId/redemptions" },
        { method: "GET", pathTemplate: "/players/me/inventory/redemptions/:requestId" }
      ]
    },
    { key: "logout", operations: [{ method: "POST", pathTemplate: "/players/me/session/logout" }] },
    { key: "market", operations: [{ method: "GET", pathTemplate: "/players/me/stocks/assets" }] },
    { key: "marketAsset", operations: [{ method: "GET", pathTemplate: "/players/me/stocks/assets/:ticker" }] },
    {
      key: "marketWatchlist",
      operations: [
        { method: "GET", pathTemplate: "/players/me/stocks/watchlist" },
        { method: "PUT", pathTemplate: "/players/me/stocks/watchlist/:ticker" },
        { method: "DELETE", pathTemplate: "/players/me/stocks/watchlist/:ticker" }
      ]
    },
    { key: "news", operations: [{ method: "GET", pathTemplate: "/players/me/world/news" }] },
    { key: "notifications", operations: [{ method: "GET", pathTemplate: "/players/me/notifications" }] },
    { key: "notificationsRead", operations: [{ method: "POST", pathTemplate: "/players/me/notifications/read" }] }
  ]
};

const validated = validateStudentProfileCapabilityManifest(capabilityManifest);
assert.equal(validated.schemaVersion, 1);
assert.equal(validated.manifestVersion, "2026-07-18.3");
assert.equal(validated.capabilities.actions.inventoryUse, true);

assert.throws(
  () => validateStudentProfileCapabilityManifest({
    ...capabilityManifest,
    capabilities: {
      ...capabilityManifest.capabilities,
      actions: { ...capabilityManifest.capabilities.actions, storePurchase: true }
    }
  }),
  (error) => error?.code === "CAPABILITY_CONTRACT_MISMATCH"
);

const runtimeConfig = installStudentProfileRuntime({
  usePreviewData: false,
  apiBaseUrl: "/api/player",
  playerSessionToken: "token-1",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250
}, {
  fetchImpl: async () => { throw new Error("not called"); }
});
assert.equal(runtimeConfig.apiBaseUrl, STUDENT_PROFILE_CLASSROOM_API_BASE);
assert.equal(typeof runtimeConfig.apiCall, "function");
assert.equal(new PlayerApi(runtimeConfig).transport.constructor.name, "AdapterTransport");

const requests = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    requests.push(request);
    if (request.path === "/players/me") {
      return {
        playerId: "P-100",
        displayName: "Test Player",
        gameSessionId: "game-public-1",
        currencyCode: "ECO"
      };
    }
    if (request.path === "/players/me/capabilities") return capabilityManifest;
    if (request.path === "/players/me/inventory/meal-pass/redemptions") {
      return {
        outcome: "created",
        redemption: { id: `red_${"a".repeat(32)}`, itemId: "meal-pass", status: "pending" }
      };
    }
    throw new Error(`Unexpected path ${request.path}`);
  }
});

const session = await apiCall({
  endpointKey: "session",
  method: "GET",
  path: "/session",
  payload: undefined,
  params: {},
  requestId: "req-session",
  session: { playerSessionToken: "token-1" }
});
assert.equal(requests[0].path, "/players/me");
assert.equal(requests[1].path, "/players/me/capabilities");
assert.equal(session.capabilitySchemaVersion, 1);
assert.equal(session.capabilityManifestVersion, "2026-07-18.3");
assert.equal(session.capabilities.actions.inventoryUse, true);

const redemption = await apiCall({
  endpointKey: "inventoryUse",
  method: "POST",
  path: "/inventory/meal-pass/redemptions",
  payload: { quantity: 1, note: "Lunch", gameSessionId: "must-not-cross-boundary" },
  params: { inventoryItemId: "meal-pass" },
  requestId: "req-redemption",
  idempotencyKey: "inventoryUse:test-key",
  session: { playerSessionToken: "token-1" }
});
assert.equal(redemption.outcome, "created");
const redemptionRequest = requests.at(-1);
assert.equal(redemptionRequest.method, "POST");
assert.equal(redemptionRequest.path, "/players/me/inventory/meal-pass/redemptions");
assert.deepEqual(
  Object.keys(redemptionRequest.payload).sort(),
  ["idempotencyKey", "note", "quantity"]
);
assert.equal(redemptionRequest.payload.idempotencyKey, "inventoryUse:test-key");
assert.equal("gameSessionId" in redemptionRequest.payload, false);

const committedCalls = [];
const committedApi = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "token-2",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall: async (context) => {
    committedCalls.push(context);
    if (context.endpointKey === "inventoryUse") return { outcome: "created" };
    if (context.endpointKey === "inventory") throw new Error("authoritative refresh failed");
    if (context.endpointKey === "dashboard") throw new Error("dashboard refresh failed");
    throw new Error(`Unexpected endpoint ${context.endpointKey}`);
  }
});
committedApi.readCache.set("GET:inventory:cached", { items: [{ id: "meal-pass" }] });
committedApi.readCacheUpdatedAt.set("GET:inventory:cached", Date.now());
const committed = await committedApi.execute(
  "inventoryUse",
  { quantity: 1, note: "Lunch" },
  { inventoryItemId: "meal-pass" }
);
assert.equal(committed.result.outcome, "created");
assert.equal(committed.invalidatedResources.includes("inventory"), true);
assert.equal(committedApi.readCache.has("GET:inventory:cached"), false);
const refresh = await committedApi.refreshResources(committed.invalidatedResources);
assert.equal(Boolean(refresh.errors.inventory), true);
assert.equal(committed.result.outcome, "created");

const failedApi = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "token-3",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall: async () => { throw new Error("redemption write failed"); }
});
failedApi.readCache.set("GET:inventory:cached", { items: [{ id: "meal-pass" }] });
failedApi.readCacheUpdatedAt.set("GET:inventory:cached", Date.now());
await assert.rejects(
  failedApi.execute("inventoryUse", { quantity: 1 }, { inventoryItemId: "meal-pass" })
);
assert.equal(failedApi.readCache.has("GET:inventory:cached"), true);

const inventoryData = {
  session: { currencyCode: "ECO" },
  inventory: {
    capacityUsed: null,
    capacityMax: null,
    categories: ["All"],
    summary: {},
    items: [{
      id: "meal-pass",
      image: "./assets/store-items/store-item-consumable.svg",
      quantityOwned: 1,
      quantityAvailable: 1,
      quantityReserved: 0,
      category: "Consumable",
      state: "Available",
      itemVisibility: "player",
      name: "Meal Pass",
      description: "Redeemable classroom item.",
      totalOwnedValue: 1,
      availableActions: ["inventory.use"]
    }]
  }
};
const enabledHtml = renderInventoryPage(inventoryData, { inventoryCategory: "All" });
assert.match(enabledHtml, /Request use/);
assert.match(enabledHtml, /data-player-inventory-use="meal-pass"/);
const disabledHtml = renderInventoryPage({
  ...inventoryData,
  inventory: {
    ...inventoryData.inventory,
    items: [{ ...inventoryData.inventory.items[0], availableActions: [] }]
  }
}, { inventoryCategory: "All" });
assert.doesNotMatch(disabledHtml, /data-player-inventory-use=/);
assert.doesNotMatch(disabledHtml, /data-capability-status="integration-pending"/);
assert.match(disabledHtml, /Available/);

console.log("Student-Profile runtime integration and Inventory redemption boundary passed.");
