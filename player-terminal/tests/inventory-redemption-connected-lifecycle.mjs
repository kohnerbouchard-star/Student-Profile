import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const requests = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    requests.push(request);
    if (
      request.method === "POST" &&
      request.path === "/players/me/inventory/meal-pass/redemptions"
    ) {
      return {
        ok: true,
        outcome: "created",
        redemption: {
          id: `red_${"a".repeat(32)}`,
          itemId: "meal-pass",
          quantity: 1,
          status: "pending",
          requestNote: "Lunch",
          resolutionNote: null,
          requestedAt: "2026-07-19T06:00:00.000Z",
          reviewedAt: null,
          fulfilledAt: null,
          updatedAt: "2026-07-19T06:00:00.000Z"
        }
      };
    }
    if (request.method === "GET" && request.path === "/players/me/inventory") {
      throw Object.assign(new Error("authoritative Inventory refresh failed"), {
        status: 503,
        code: "INVENTORY_REFRESH_UNAVAILABLE"
      });
    }
    throw new Error(`Unexpected connected request ${request.method} ${request.path}`);
  }
});

const api = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "player-token",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall
});
api.readCache.set("GET:inventory:cached", { items: [{ id: "meal-pass" }] });
api.readCacheUpdatedAt.set("GET:inventory:cached", Date.now());

const committed = await api.execute(
  "inventoryUse",
  { quantity: 1, note: "Lunch", gameSessionId: "must-not-cross-boundary" },
  { inventoryItemId: "meal-pass" }
);
assert.equal(committed.result.outcome, "created");
assert.equal(committed.result.redemption.id.startsWith("red_"), true);
assert.equal(committed.invalidatedResources.includes("inventory"), true);
assert.equal(api.readCache.has("GET:inventory:cached"), false);

const write = requests[0];
assert.equal(write.method, "POST");
assert.equal(write.path, "/players/me/inventory/meal-pass/redemptions");
assert.deepEqual(Object.keys(write.payload).sort(), ["idempotencyKey", "note", "quantity"]);
assert.equal(typeof write.payload.idempotencyKey, "string");
assert.equal(write.payload.idempotencyKey.length > 0, true);
assert.equal("gameSessionId" in write.payload, false);
assert.equal("playerId" in write.payload, false);
assert.equal("playerUuid" in write.payload, false);

const refresh = await api.refreshResources(["inventory"]);
assert.equal(Boolean(refresh.errors.inventory), true);
assert.equal(committed.result.outcome, "created", "A failed authoritative refresh must not reverse a committed redemption request.");
assert.equal(committed.result.redemption.status, "pending");

const failedRequests = [];
const failedApi = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "player-token",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall: async (context) => {
    failedRequests.push(context);
    throw Object.assign(new Error("redemption write failed"), {
      status: 503,
      code: "REDEMPTION_WRITE_FAILED"
    });
  }
});
failedApi.readCache.set("GET:inventory:cached", { items: [{ id: "meal-pass" }] });
failedApi.readCacheUpdatedAt.set("GET:inventory:cached", Date.now());
await assert.rejects(
  failedApi.execute(
    "inventoryUse",
    { quantity: 1, note: "Lunch" },
    { inventoryItemId: "meal-pass" }
  )
);
assert.equal(failedRequests.length, 1);
assert.equal(failedApi.readCache.has("GET:inventory:cached"), true, "A failed write must not invalidate authoritative Inventory state.");

console.log("Connected Inventory redemption committed-success boundary passed.");
