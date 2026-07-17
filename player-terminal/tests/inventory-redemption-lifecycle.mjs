import assert from "node:assert/strict";
import { PlayerApi } from "../src/api/player-api.js";

const calls = [];
const api = new PlayerApi({
  usePreviewData: false,
  gameSessionId: "game-1",
  playerSessionId: "session-1",
  playerSessionToken: "token-1",
  apiCall: async (context) => {
    calls.push(context);
    if (context.endpointKey === "inventoryUse") {
      return {
        ok: true,
        outcome: "created",
        redemption: { id: "request-1", status: "pending" }
      };
    }
    throw new Error(`Unexpected endpoint ${context.endpointKey}`);
  }
});

api.loadedLazyRoutes.add("inventory");
const result = await api.execute(
  "inventoryUse",
  { quantity: 1, gameSessionId: "game-1" },
  { inventoryItemId: "holding-1" }
);

assert.equal(result.outcome, "created");
assert.equal(api.loadedLazyRoutes.has("inventory"), false, "A committed redemption must invalidate the inventory cache.");
assert.equal(calls.length, 1);
assert.equal(calls[0].endpointKey, "inventoryUse");
assert.equal(calls[0].backendRequest.method, "POST");
assert.equal(calls[0].backendRequest.path, "/players/me/inventory/holding-1/redemptions");
assert.match(calls[0].backendRequest.payload.idempotencyKey, /^inventory-redemption:/);

const failedApi = new PlayerApi({
  usePreviewData: false,
  gameSessionId: "game-1",
  playerSessionId: "session-1",
  playerSessionToken: "token-1",
  apiCall: async () => {
    throw new Error("write failed");
  }
});
failedApi.loadedLazyRoutes.add("inventory");
await assert.rejects(
  failedApi.execute(
    "inventoryUse",
    { quantity: 1, gameSessionId: "game-1" },
    { inventoryItemId: "holding-1" }
  ),
  /write failed/
);
assert.equal(
  failedApi.loadedLazyRoutes.has("inventory"),
  true,
  "A failed redemption must not invalidate authoritative inventory state."
);

console.log("Inventory redemption committed-write boundary passed.");
