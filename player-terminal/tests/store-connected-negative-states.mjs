import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { ApiRequestError } from "../src/api/errors.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const quoteKey = "quote_11111111111111111111111111111111";
const receiptKey = "receipt_22222222222222222222222222222222";

const failureCodes = [
  "STORE_QUOTE_EXPIRED",
  "STORE_INSUFFICIENT_BALANCE",
  "STORE_INSUFFICIENT_STOCK",
  "STORE_IDEMPOTENCY_CONFLICT",
  "STORE_GAME_PAUSED",
  "STORE_GAME_ENDED"
];

for (const expectedCode of failureCodes) {
  const calls = [];
  const api = createApi({
    calls,
    purchase: () => {
      throw new ApiRequestError("The Store purchase could not be completed.", {
        status: 409,
        code: expectedCode
      });
    }
  });

  await api.bootstrap({ force: true });
  await assert.rejects(
    api.execute("storePurchase", {
      quoteKey,
      clientSubmittedAt: "2026-07-19T03:30:00.000Z"
    }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, expectedCode);
      assert.equal(error.endpointKey, "storePurchase");
      return true;
    }
  );

  const purchaseRequest = calls.find((request) => request.endpointKey === "storePurchase");
  assert.ok(purchaseRequest, `${expectedCode} did not reach the reviewed Store purchase route.`);
  assert.equal(purchaseRequest.path, "/players/me/store/purchases");
  assert.equal(purchaseRequest.payload.quoteKey, quoteKey);
  assert.match(purchaseRequest.payload.idempotencyKey, /^ptr_storePurchase_/);
  for (const privateField of ["gameSessionId", "playerId", "playerSessionId", "quoteId", "itemId"]) {
    assert.equal(privateField in purchaseRequest.payload, false);
  }
  assert.equal("x-game-session-id" in purchaseRequest.headers, false);
  assert.equal("x-player-id" in purchaseRequest.headers, false);
}

{
  const calls = [];
  const api = createApi({
    calls,
    purchase: () => ({
      ok: true,
      message: "Purchase was already completed.",
      receipt: {
        receiptKey,
        quoteKey,
        itemKey: "field_permit",
        itemName: "Field Permit",
        quantity: 2,
        finalUnitPrice: 50,
        finalTotalPrice: 100,
        currencyCode: "NRC",
        inventoryQuantityOwned: 2,
        completedAt: "2026-07-19T03:30:01.000Z",
        alreadyCompleted: true
      },
      refreshRequired: true
    })
  });

  await api.bootstrap({ force: true });
  const replay = await api.execute("storePurchase", {
    quoteKey,
    clientSubmittedAt: "2026-07-19T03:30:00.000Z"
  });

  assert.equal(replay.result.receipt.receiptKey, receiptKey);
  assert.equal(replay.result.receipt.alreadyCompleted, true);
  assert.deepEqual(replay.invalidatedResources, ["dashboard", "store", "inventory", "banking"]);
  assert.equal(calls.filter((request) => request.endpointKey === "storePurchase").length, 1);
}

console.log("Connected Store negative states passed: precise failure codes, UUID-private payloads, and completed replay semantics are preserved.");

function createApi({ calls, purchase }) {
  const apiCall = createStudentProfileApiCall({
    request: async (request) => {
      calls.push(structuredClone({ ...request, signal: undefined }));
      if (request.path === "/players/me") {
        return {
          gameSession: { id: "private-game-uuid", name: "Econovaria", status: "active" },
          player: { id: "private-player-uuid", playerIdentifier: "CARD-100", displayName: "Alex Rivera" },
          session: { id: "private-session-uuid", status: "active" },
          balances: [{ accountType: "cash", currencyCode: "NRC", balance: 500 }]
        };
      }
      if (request.path === "/players/me/capabilities") return manifest();
      if (request.method === "POST" && request.path === "/players/me/store/purchases") {
        return purchase(request);
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }
  });

  return new PlayerApi({
    usePreviewData: false,
    playerSessionToken: "token-1",
    gameSessionId: "must-not-be-forwarded",
    playerSessionId: "must-not-be-forwarded",
    requestTimeoutMs: 1000,
    writeCooldownMs: 0,
    apiCall
  });
}

function manifest() {
  return {
    ok: true,
    schemaVersion: 1,
    manifestVersion: "2026-07-19.3",
    service: "classroom-api",
    capabilities: {
      routes: {
        dashboard: false,
        news: false,
        market: false,
        portfolio: false,
        business: false,
        contracts: false,
        store: true,
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
        contractAccept: false,
        contractSubmit: false,
        craftItem: false,
        inventoryUse: false,
        loanApply: false,
        loanRepay: false,
        logout: false,
        marketOrder: false,
        marketSearch: false,
        marketWatchlist: false,
        marketplaceCancel: false,
        marketplaceListing: false,
        marketplacePurchase: false,
        messageAttachment: false,
        messageSearch: false,
        messageSend: false,
        notificationsRead: false,
        progressionClaim: false,
        progressionUnlock: false,
        savingsTransfer: false,
        storePurchase: true
      }
    },
    endpoints: [
      { key: "capabilities", operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }] },
      { key: "store", operations: [{ method: "GET", pathTemplate: "/players/me/store/items" }] },
      { key: "storeQuote", operations: [{ method: "POST", pathTemplate: "/players/me/store/quotes" }] },
      { key: "storePurchase", operations: [
        { method: "GET", pathTemplate: "/players/me/store/purchases" },
        { method: "POST", pathTemplate: "/players/me/store/purchases" }
      ] },
      { key: "inventory", operations: [{ method: "GET", pathTemplate: "/players/me/inventory" }] }
    ]
  };
}
