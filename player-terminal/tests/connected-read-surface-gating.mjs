import assert from "node:assert/strict";
import { PlayerApi } from "../src/api/player-api.js";

const advertisedCalls = [];
const advertisedApi = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "token-advertised",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall: async ({ endpointKey }) => {
    advertisedCalls.push(endpointKey);
    if (endpointKey === "session") {
      return {
        displayName: "Manifest Player",
        gameSessionId: "game-public-1",
        currencyCode: "ECO",
        capabilities: {
          routes: { news: true, market: true, inventory: true },
          actions: {}
        },
        capabilityEndpointKeys: [
          "capabilities",
          "countries",
          "country",
          "news",
          "market",
          "marketAsset",
          "inventory",
          "notifications"
        ]
      };
    }
    if (endpointKey === "notifications" || endpointKey === "countries") return [];
    if (endpointKey === "news") return { categories: ["All"], selectedId: "", items: [] };
    if (endpointKey === "market") return { status: "OPEN", nextClose: "", selectedAssetId: "", sectors: ["All"], assets: [] };
    if (endpointKey === "inventory") return { categories: ["All"], items: [], capacityUsed: 0, capacityMax: 0 };
    throw new Error(`Speculative read attempted: ${endpointKey}`);
  }
});

const bootstrap = await advertisedApi.bootstrap({ force: true });
assert.deepEqual(advertisedCalls, ["session", "notifications"]);
assert.equal(bootstrap.dashboard.marketStatus, "UNAVAILABLE");
assert.equal(bootstrap.resourceStatus.dashboard.state, "unavailable");
assert.equal(bootstrap.resourceStatus.dashboard.code, "CAPABILITY_UNAVAILABLE");
assert.equal(bootstrap.resourceStatus.notifications.state, "ready");

const dashboard = await advertisedApi.loadRoute("dashboard", { force: true });
assert.deepEqual(
  advertisedCalls,
  ["session", "notifications", "countries", "news", "market", "inventory"]
);
for (const blocked of ["dashboard", "portfolio", "contracts", "messages", "banking"]) {
  assert.equal(advertisedCalls.includes(blocked), false, `${blocked} must not be requested when absent from the manifest.`);
  assert.equal(dashboard.resourceStatus[blocked].code, "CAPABILITY_UNAVAILABLE");
}
assert.equal(dashboard.resourceStatus.countries.state, "ready");
assert.equal(dashboard.resourceStatus.news.state, "ready");
assert.equal(dashboard.resourceStatus.market.state, "ready");
assert.equal(dashboard.resourceStatus.inventory.state, "ready");

const inventory = await advertisedApi.loadRoute("inventory", { force: true });
assert.equal(inventory.resourceStatus.inventory.state, "ready");
assert.equal(advertisedCalls.at(-1), "inventory");

const explicitCalls = [];
const explicitAdapterApi = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "token-explicit",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall: async ({ endpointKey }) => {
    explicitCalls.push(endpointKey);
    if (endpointKey === "session") {
      return {
        displayName: "Explicit Adapter Player",
        gameSessionId: "game-public-2",
        currencyCode: "ECO",
        capabilities: { routes: {}, actions: {} }
      };
    }
    if (endpointKey === "dashboard") {
      return {
        marketStatus: "OPEN",
        netWorth: 0,
        dailyChange: 0,
        contractsActive: 0,
        contractsDueSoon: 0,
        worldEvents: [],
        liquidBalance: 0,
        savingsBalance: 0,
        portfolioValue: 0,
        inventoryValue: 0,
        marketPulse: []
      };
    }
    if (endpointKey === "notifications") return [];
    throw new Error(`Unexpected explicit-adapter read: ${endpointKey}`);
  }
});
await explicitAdapterApi.bootstrap({ force: true });
assert.deepEqual(explicitCalls, ["session", "dashboard", "notifications"]);

console.log("Connected read gating passed: manifest-bound mode suppresses speculative reads and explicit adapters remain compatible.");
