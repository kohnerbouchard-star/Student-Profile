import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const CSRF_TOKEN = "C".repeat(43);
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const PUBLISHABLE_KEY = "sb_publishable_store_fixture";
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
        balances: [{ accountType: "checking", currencyCode: "NRC", balance: purchased ? 400 : 500 }]
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
        currentBalances: [{ accountType: "checking", currencyCode: "NRC", balance: purchased ? 400 : 500 }],
        ledgerEntries: purchased ? [{
          id: "ledger_public_reference",
          accountType: "checking",
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
  authenticated: true,
  csrfToken: CSRF_TOKEN,
  publishableKey: PUBLISHABLE_KEY,
  deviceId: DEVICE_ID,
  gameSessionId: "must-not-be-forwarded",
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
assert.equal(quoteRequest.headers["x-econovaria-csrf-token"], CSRF_TOKEN);

const purchaseRequest = calls.find((request) => request.endpointKey === "storePurchase");
assert.equal(purchaseRequest.path, "/players/me/store/purchases");
assert.equal(purchaseRequest.payload.quoteKey, quoteKey);
assert.equal(purchaseRequest.headers.apikey, PUBLISHABLE_KEY);
assert.equal(purchaseRequest.headers["x-econovaria-device-id"], DEVICE_ID);
assert.equal(purchaseRequest.headers["x-econovaria-csrf-token"], CSRF_TOKEN);
assert.equal(purchaseRequest.headers["x-player-session-token"], undefined);
assert.equal(purchaseRequest.headers.Authorization, undefined);
for (const privateField of ["quoteId", "gameSessionId", "playerId", "playerSessionId", "itemId"]) {
  assert.equal(privateField in purchaseRequest.payload, false);
}
assert.equal("x-game-session-id" in purchaseRequest.headers, false);
assert.equal("x-player-id" in purchaseRequest.headers, false);

const OFFER_KEY = "sof_33333333333333333333333333333333";
const OFFER_QUOTE_KEY = "quote_33333333333333333333333333333333";
const OFFER_RECEIPT_KEY = "spr_33333333333333333333333333333333";
const BUSINESS_KEY = "biz_33333333333333333333333333333333";
const SELLER_PARTY_KEY = "pty_33333333333333333333333333333333";
const CATALOG_ITEM_KEY = "itm_33333333333333333333333333333333";
const businessCalls = [];

const businessApiCall = createStudentProfileApiCall({
  request: async (request) => {
    businessCalls.push(structuredClone({ ...request, signal: undefined }));
    if (request.path === "/players/me") {
      return {
        gameSession: { id: "server-owned-game", name: "Econovaria", status: "active" },
        player: { id: "server-owned-player", playerIdentifier: "CARD-200", displayName: "Buyer" },
        session: { id: "server-owned-session", status: "active" },
        balances: [{ accountType: "checking", currencyCode: "NRC", balance: 500 }]
      };
    }
    if (request.path === "/players/me/capabilities") return manifest;
    if (request.path === "/players/me/store/items") {
      return {
        ok: true,
        items: [{
          itemKey: "market_lens", name: "Market Lens", description: "Market intelligence.",
          category: "equipment", price: 50, currencyCode: "NRC", stockQuantity: 4,
          status: "active", visibility: "visible", sortOrder: 1,
          updatedAt: "2026-08-25T01:00:00.000Z"
        }],
        products: [{
          catalogItemKey: CATALOG_ITEM_KEY, canonicalItemKey: "market_lens", storeItemKey: "market_lens",
          name: "Market Lens", description: "Market intelligence.", category: "equipment", currencyCode: "NRC",
          bestOfferKey: OFFER_KEY, bestUnitPrice: 48, totalAvailableQuantity: 7,
          sellerCount: 2, offerCount: 2, updatedAt: "2026-08-25T01:00:00.000Z",
          offers: [
            { offerKey: OFFER_KEY, sellerKind: "business", sellerPartyKey: SELLER_PARTY_KEY, sellerName: "Northstar Optics", businessKey: BUSINESS_KEY, businessName: "Northstar Optics", unitPrice: 48, currencyCode: "NRC", availableQuantity: 3, status: "active", purchasability: "business_offer", purchasable: true, version: 3 },
            { offerKey: "sof_44444444444444444444444444444444", sellerKind: "seeded", sellerPartyKey: "pty_44444444444444444444444444444444", sellerName: "Econovaria Store", businessKey: null, businessName: null, unitPrice: 50, currencyCode: "NRC", availableQuantity: 4, status: "active", purchasability: "seeded_offer", purchasable: true, version: 1 }
          ]
        }]
      };
    }
    if (request.path === "/players/me/store/offer-quotes") {
      assert.deepEqual(request.payload, {
        offerKey: OFFER_KEY,
        quantity: 2,
        expectedVersion: 3,
        idempotencyKey: request.payload.idempotencyKey
      });
      assert.match(request.payload.idempotencyKey, /^ptr_storeOfferQuote_/);
      return { ok: true, quote: {
        quoteKey: OFFER_QUOTE_KEY, quoteStatus: "created", offerKey: OFFER_KEY, offerVersion: 3,
        businessKey: BUSINESS_KEY, businessName: "Northstar Optics", sellerPartyKey: SELLER_PARTY_KEY,
        sellerName: "Northstar Optics", catalogItemKey: CATALOG_ITEM_KEY, canonicalItemKey: "market_lens",
        storeItemKey: "market_lens", quantity: 2, availableQuantityAtQuote: 3,
        unitPrice: 48, totalPrice: 96, currencyCode: "NRC",
        expiresAt: "2099-08-25T01:02:00.000Z", pricingVersion: "business-offer-fixed-price-v2",
        replayed: false
      } };
    }
    if (request.path === "/players/me/store/offer-purchases") {
      assert.deepEqual(request.payload, {
        offerKey: OFFER_KEY,
        quoteKey: OFFER_QUOTE_KEY,
        quantity: 2,
        expectedVersion: 3,
        idempotencyKey: request.payload.idempotencyKey
      });
      assert.match(request.payload.idempotencyKey, /^ptr_storeOfferPurchase_/);
      return { ok: true, receipt: {
        receiptKey: OFFER_RECEIPT_KEY, quoteKey: OFFER_QUOTE_KEY, offerKey: OFFER_KEY,
        businessKey: BUSINESS_KEY, businessName: "Northstar Optics", sellerPartyKey: SELLER_PARTY_KEY,
        sellerName: "Northstar Optics", catalogItemKey: CATALOG_ITEM_KEY, canonicalItemKey: "market_lens",
        storeItemKey: "market_lens", quantity: 2, unitPrice: 48, totalPrice: 96,
        currencyCode: "NRC", offerVersionBefore: 3, offerVersionAfter: 4,
        remainingListedQuantity: 1, completedAt: "2026-08-25T01:00:30.000Z",
        alreadyCompleted: false
      }, refreshRequired: true };
    }
    if (request.path === `/players/me/store/receipts/${OFFER_RECEIPT_KEY}`) {
      return { ok: true, receipt: {
        receiptKey: OFFER_RECEIPT_KEY, quoteKey: OFFER_QUOTE_KEY, offerKey: OFFER_KEY,
        businessKey: BUSINESS_KEY, businessName: "Northstar Optics", sellerPartyKey: SELLER_PARTY_KEY,
        sellerName: "Northstar Optics", catalogItemKey: CATALOG_ITEM_KEY, canonicalItemKey: "market_lens",
        storeItemKey: "market_lens", quantity: 2, unitPrice: 48, totalPrice: 96,
        currencyCode: "NRC", offerVersionBefore: 3, offerVersionAfter: 4,
        remainingListedQuantity: 1, completedAt: "2026-08-25T01:00:30.000Z",
        alreadyCompleted: true
      } };
    }
    throw new Error(`Unexpected Business Store request ${request.method} ${request.path}`);
  }
});

const businessApi = new PlayerApi({
  usePreviewData: false,
  authenticated: true,
  csrfToken: CSRF_TOKEN,
  publishableKey: PUBLISHABLE_KEY,
  deviceId: DEVICE_ID,
  gameSessionId: "must-not-be-forwarded",
  requestTimeoutMs: 1000,
  writeCooldownMs: 0,
  apiCall: businessApiCall
});
await businessApi.bootstrap({ force: true });
const offerStore = await businessApi.loadResources(["store"], { force: true });
assert.equal(offerStore.data.store.items.length, 1, "Retained and Business offers must share one canonical card.");
const connectedBusinessOffer = offerStore.data.store.items[0].offers.find((offer) => offer.offerKey === OFFER_KEY);
assert.equal(connectedBusinessOffer.purchasability, "business_offer");
assert.equal(connectedBusinessOffer.sellerPartyKey, SELLER_PARTY_KEY);
assert.equal(connectedBusinessOffer.businessKey, BUSINESS_KEY);

const offerQuote = await businessApi.execute("storeOfferQuote", {
  offerKey: OFFER_KEY,
  quantity: 2,
  expectedVersion: 3,
  sellerName: "browser-must-not-forward",
  unitPrice: 1,
  businessKey: "browser-must-not-forward",
  gameSessionId: "browser-must-not-forward"
});
assert.equal(offerQuote.result.quote.quoteKey, OFFER_QUOTE_KEY);
assert.equal(offerQuote.idempotencyKey.startsWith("ptr_storeOfferQuote_"), true);

const offerPurchase = await businessApi.execute("storeOfferPurchase", {
  offerKey: OFFER_KEY,
  quoteKey: OFFER_QUOTE_KEY,
  quantity: 2,
  expectedVersion: 3,
  sellerPartyKey: "browser-must-not-forward",
  itemKey: "browser-must-not-forward",
  totalPrice: 1
});
assert.equal(offerPurchase.result.receipt.receiptKey, OFFER_RECEIPT_KEY);
assert.deepEqual(offerPurchase.invalidatedResources, ["dashboard", "store", "inventory", "banking"]);
assert.equal(offerPurchase.idempotencyKey.startsWith("ptr_storeOfferPurchase_"), true);

const immutableReceipt = await businessApi.request("storeOfferReceipt", {
  params: { receiptKey: OFFER_RECEIPT_KEY },
  force: true
});
assert.equal(immutableReceipt.receipt.receiptKey, OFFER_RECEIPT_KEY);
assert.equal(immutableReceipt.receipt.alreadyCompleted, true);

for (const endpointKey of ["storeOfferQuote", "storeOfferPurchase"]) {
  const request = businessCalls.find((call) => call.endpointKey === endpointKey);
  assert.ok(request, `${endpointKey} must reach the explicit Backend route.`);
  for (const privateField of ["gameSessionId", "playerId", "sellerName", "sellerPartyKey", "businessKey", "itemKey", "unitPrice", "totalPrice"]) {
    assert.equal(privateField in request.payload, false, `${endpointKey} must not forward browser-owned ${privateField}.`);
  }
  assert.equal(request.headers["x-econovaria-csrf-token"], CSRF_TOKEN);
  assert.equal(request.headers["x-game-session-id"], undefined);
  const { idempotencyKey: opaqueRetryKey, ...publicIntent } = request.payload;
  assert.ok(opaqueRetryKey, "The transport may add only its opaque retry key to public intent.");
  assert.doesNotMatch(JSON.stringify(publicIntent), /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
}
const receiptRequest = businessCalls.find((call) => call.endpointKey === "storeOfferReceipt");
assert.equal(receiptRequest.method, "GET");
assert.equal(receiptRequest.path, `/players/me/store/receipts/${OFFER_RECEIPT_KEY}`);
assert.equal(receiptRequest.payload, undefined);

console.log("Connected Store purchase passed: retained and Business explicit routes, cookie-session binding, manifest gating, browser-safe public intent, idempotent settlement, immutable receipt access, and authoritative refresh are valid.");
