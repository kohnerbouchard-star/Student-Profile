import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const quoteKey = "quote_11111111111111111111111111111111";
const receiptKey = "receipt_22222222222222222222222222222222";
let purchased = false;
const calls = [];

const manifest = {
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

const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    calls.push(structuredClone({ ...request, signal: undefined }));
    if (request.path === "/players/me") {
      return {
        gameSession: { id: "private-game-uuid", name: "Econovaria", status: "active" },
        player: { id: "private-player-uuid", playerIdentifier: "CARD-100", displayName: "Alex Rivera" },
        session: { id: "private-session-uuid", status: "active" },
        balances: [{ accountType: "cash", currencyCode: "NRC", balance: purchased ? 400 : 500 }]
      };
    }
    if (request.path === "/players/me/capabilities") return manifest;
    if (request.path === "/players/me/store/items") {
      return {
        ok: true,
        items: [{
          itemKey: "field_permit",
          name: "Field Permit",
          description: "Access permit",
          category: "license",
          price: 50,
          currencyCode: "NRC",
          stockQuantity: purchased ? 3 : 5,
          status: "active",
          visibility: "visible",
          sortOrder: 1,
          updatedAt: "2026-07-19T03:00:00.000Z"
        }]
      };
    }
    if (request.path === "/players/me/store/quotes") {
      assert.deepEqual(request.payload, { itemKey: "field_permit", quantity: 2 });
      return {
        ok: true,
        quote: {
          quoteKey,
          itemKey: "field_permit",
          itemName: "Field Permit",
          quantity: 2,
          finalUnitPrice: 50,
          finalTotalPrice: 100,
          currencyCode: "NRC",
          expiresAt: "2099-07-19T03:03:00.000Z"
        }
      };
    }
    if (request.method === "POST" && request.path === "/players/me/store/purchases") {
      assert.equal(request.payload.quoteKey, quoteKey);
      assert.match(request.payload.idempotencyKey, /^ptr_storePurchase_/);
      assert.equal("quoteId" in request.payload, false);
      assert.equal("gameSessionId" in request.payload, false);
      purchased = true;
      return {
        ok: true,
        message: "Purchase complete.",
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
          completedAt: "2026-07-19T03:00:31.000Z",
          alreadyCompleted: false
        },
        refreshRequired: true
      };
    }
    if (request.path === "/players/me/inventory") {
      return {
        ok: true,
        categories: ["All", "license"],
        summary: {},
        items: purchased ? [{
          id: "inv_field_permit",
          storeItemId: "field_permit",
          name: "Field Permit",
          category: "license",
          quantityOwned: 2,
          quantityReserved: 0,
          quantityAvailable: 2,
          unitValue: 50,
          totalOwnedValue: 100,
          currencyCode: "NRC",
          availableActions: []
        }] : []
      };
    }
    if (request.path === "/players/me/ledger") {
      return {
        ok: true,
        currentBalances: [{ accountType: "cash", currencyCode: "NRC", balance: purchased ? 400 : 500 }],
        ledgerEntries: purchased ? [{
          id: "ledger_public_reference",
          accountType: "cash",
          amount: 100,
          currencyCode: "NRC",
          entryType: "debit",
          sourceDomain: "store",
          sourceAction: "store_purchase",
          createdAt: "2026-07-19T03:00:31.000Z"
        }] : []
      };
    }
    throw new Error(`Unexpected request ${request.method} ${request.path}`);
  }
});

const api = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "token-1",
  gameSessionId: "must-not-be-forwarded",
  playerSessionId: "must-not-be-forwarded",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall
});

const shell = await api.bootstrap({ force: true });
assert.equal(shell.session.capabilities.routes.store, true);
assert.equal(shell.session.capabilities.actions.storePurchase, true);

const storeRead = await api.loadResources(["store"], { force: true });
assert.equal(storeRead.data.store.items[0].id, "field_permit");
assert.equal(storeRead.data.store.items[0].itemKey, "field_permit");
assert.equal(storeRead.data.store.items[0].stock, 5);

const quote = await api.execute("storeQuote", {
  itemKey: "field_permit",
  quantity: 2,
  gameSessionId: "browser-owned-game",
  itemId: "browser-owned-item"
});
assert.equal(quote.result.quote.quoteKey, quoteKey);

await assert.rejects(
  api.execute("storePurchase", {
    quoteKey,
    playerId: "browser-owned-player"
  }),
  (error) => error.code === "INVALID_REQUEST"
);

const purchase = await api.execute("storePurchase", {
  quoteKey,
  clientSubmittedAt: "2026-07-19T03:00:30.000Z",
  quoteId: "browser-owned-quote"
});
assert.equal(purchase.result.receipt.receiptKey, receiptKey);
assert.deepEqual(purchase.invalidatedResources, ["dashboard", "store", "inventory", "banking"]);

const refreshed = await api.refreshResources(["store", "inventory"]);
assert.equal(Object.keys(refreshed.errors).length, 0);
assert.equal(refreshed.data.store.items[0].stock, 3);
assert.equal(refreshed.data.inventory.items[0].storeItemId, "field_permit");
assert.equal(refreshed.data.inventory.items[0].quantity, 2);
assert.equal("banking" in refreshed.data, false, "Banking remains manifest-disabled and must not receive speculative traffic.");

const quoteRequest = calls.find((request) => request.endpointKey === "storeQuote");
assert.equal(quoteRequest.path, "/players/me/store/quotes");
assert.deepEqual(quoteRequest.payload, { itemKey: "field_permit", quantity: 2 });

const purchaseRequest = calls.find((request) => request.endpointKey === "storePurchase");
assert.equal(purchaseRequest.path, "/players/me/store/purchases");
assert.equal(purchaseRequest.payload.quoteKey, quoteKey);
for (const privateField of ["quoteId", "gameSessionId", "playerId", "playerSessionId", "itemId"]) {
  assert.equal(privateField in purchaseRequest.payload, false);
}
assert.equal("x-game-session-id" in purchaseRequest.headers, false);
assert.equal("x-player-id" in purchaseRequest.headers, false);

console.log("Connected Store purchase passed: manifest gating, ownership rejection, public item/quote/receipt keys, committed settlement, and authoritative Store/Inventory refresh are valid.");
