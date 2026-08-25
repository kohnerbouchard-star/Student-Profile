import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isEndpointEnabled, resolveCapabilities } from "../src/api/capabilities.js";
import { mergeTerminalRead } from "../src/api/read-model.js";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { renderModal } from "../src/components/modal.js";
import { createEmptyReadModels } from "../src/data/empty-read-models.js";
import {
  validateBusinessOfferQuote,
  validateImmutableBusinessOfferReceipt
} from "../src/features/store/store-purchase-flow.js";
import { renderStorePage } from "../src/pages/store-page.js";

const capabilities = resolveCapabilities({
  config: { usePreviewData: false, capabilities: { actions: { storePurchase: true } } },
  session: {},
  dashboard: {}
});
assert.equal(isEndpointEnabled(capabilities, "storeQuote"), true, "Store quotes must use the Store purchase capability boundary.");
assert.equal(isEndpointEnabled(capabilities, "storeOfferQuote"), true, "Business offer quotes must use the Store purchase capability boundary.");
assert.equal(isEndpointEnabled(capabilities, "storeOfferPurchase"), true, "Business offer purchases must use the Store purchase capability boundary.");
assert.equal(isEndpointEnabled(capabilities, "storeOfferReceipt"), true, "Business offer receipts must use the Store purchase capability boundary.");

const item = { id: "market-lens", itemKey: "market-lens", name: "Market Lens", price: 50, stock: 8, owned: 1 };
const select = renderModal({ type: "storePurchase", stage: "select", item, quantity: 1, currencyCode: "ECO" });
assert.ok(select.includes("QUOTE REQUIRED"));
assert.ok(select.includes("data-player-store-quantity"));
assert.ok(select.includes("data-player-store-review"));
assert.ok(!select.includes("data-player-store-confirm"), "Purchase confirmation must not exist before an authoritative quote.");

const quote = {
  quoteKey: "quote_11111111111111111111111111111111",
  itemName: "Market Lens",
  quantity: 2,
  finalUnitPrice: 55,
  finalTotalPrice: 110,
  currencyCode: "ECO",
  expiresAt: "2026-07-18T12:05:00.000Z"
};
const review = renderModal({ type: "storePurchase", stage: "review", item, quantity: 2, quote });
assert.ok(review.includes("AUTHORITATIVE QUOTE"));
assert.ok(review.includes("CONFIRMATION REQUIRED"));
assert.ok(review.includes("data-player-store-confirm"));
assert.ok(review.includes("quote_11111111111111111111111111111111"));
const processingReview = renderModal({
  type: "storePurchase",
  stage: "review",
  item,
  quantity: 2,
  quote,
  processing: true
});
assert.ok(processingReview.includes("SETTLEMENT IN PROGRESS"));
assert.ok(processingReview.includes('aria-busy="true"'));
assert.ok(processingReview.includes('tabindex="-1"'));
assert.match(processingReview, /data-player-local-action="close-modal" aria-label="Close" disabled/);
assert.match(processingReview, /data-player-store-edit disabled/);
assert.match(processingReview, /data-player-store-confirm disabled/);
assert.ok(processingReview.includes("Completing purchase…"));

const receipt = renderModal({
  type: "storePurchase",
  stage: "receipt",
  item,
  quantity: 2,
  quote,
  receipt: { receiptKey: "receipt_22222222222222222222222222222222", quoteKey: "quote_11111111111111111111111111111111", finalTotalPrice: 110, currencyCode: "ECO" }
});
assert.ok(receipt.includes("PURCHASE RECEIPT"));
assert.ok(receipt.includes("COMPLETED"));
assert.ok(receipt.includes("receipt_22222222222222222222222222222222"));

const refreshPendingReceipt = renderModal({
  type: "storePurchase",
  stage: "receipt",
  item,
  quantity: 2,
  quote,
  receipt: { receiptKey: "receipt_22222222222222222222222222222222", quoteKey: "quote_11111111111111111111111111111111", finalTotalPrice: 110, currencyCode: "ECO" },
  refreshState: "pending",
  refreshWarning: "Purchase completed, refresh pending."
});
assert.ok(refreshPendingReceipt.includes("COMPLETED · REFRESH PENDING"));
assert.ok(refreshPendingReceipt.includes("Purchase completed, refresh pending."));
assert.ok(refreshPendingReceipt.includes("data-player-store-refresh-retry"));
assert.ok(refreshPendingReceipt.includes("Retry refresh"));
const refreshingReceipt = renderModal({
  type: "storePurchase",
  stage: "receipt",
  item,
  quantity: 2,
  quote,
  receipt: { receiptKey: "receipt_22222222222222222222222222222222", quoteKey: "quote_11111111111111111111111111111111", finalTotalPrice: 110, currencyCode: "ECO" },
  refreshState: "refreshing",
  refreshWarning: ""
});
assert.match(refreshingReceipt, /data-player-store-refresh-retry disabled/);
assert.ok(refreshingReceipt.includes("Refreshing…"));

const liveStoreResponse = {
  ok: true,
  items: [{
    itemKey: "market-lens", name: "Market Lens", description: "Market intelligence.",
    category: "equipment", price: 55, currencyCode: "NRC", stockQuantity: 4,
    status: "active", visibility: "visible", sortOrder: 1,
    updatedAt: "2026-08-25T01:00:00.000Z"
  }],
  products: [{
    catalogItemKey: "itm_11111111111111111111111111111111",
    canonicalItemKey: "market-lens", storeItemKey: "market-lens", name: "Market Lens",
    description: "Market intelligence.", category: "equipment", currencyCode: "NRC",
    bestOfferKey: "sof_22222222222222222222222222222222", bestUnitPrice: 50,
    totalAvailableQuantity: 7, sellerCount: 2, offerCount: 3,
    updatedAt: "2026-08-25T01:00:00.000Z",
    offers: [
      { offerKey: "sof_33333333333333333333333333333333", sellerKind: "npc", sellerPartyKey: "pty_33333333333333333333333333333333", sellerName: "Crescent Exchange", businessKey: null, businessName: null, unitPrice: 45, currencyCode: "NRC", availableQuantity: 2, status: "active", purchasability: "unsupported", purchasable: false, version: 2 },
      { offerKey: "sof_22222222222222222222222222222222", sellerKind: "business", sellerPartyKey: "pty_22222222222222222222222222222222", sellerName: "Crescent Dynamics", businessKey: "biz_22222222222222222222222222222222", businessName: "Crescent Dynamics", unitPrice: 50, currencyCode: "NRC", availableQuantity: 3, status: "active", purchasability: "business_offer", purchasable: true, version: 4 },
      { offerKey: "sof_11111111111111111111111111111111", sellerKind: "seeded", sellerPartyKey: "pty_11111111111111111111111111111111", sellerName: "Econovaria Store", businessKey: null, businessName: null, unitPrice: 55, currencyCode: "NRC", availableQuantity: 4, status: "active", purchasability: "seeded_offer", purchasable: true, version: 1 }
    ]
  }]
};

const safeRawStore = normalizeApiResponse("store", liveStoreResponse, { path: "/store/items", requestId: "store-live-shape", config: {} });
const canonicalStore = mergeTerminalRead(createEmptyReadModels(), "store", safeRawStore).store;
assert.equal(canonicalStore.items.length, 1, "Retained and offer projections for one canonical item must become one card.");
const canonicalItem = canonicalStore.items[0];
assert.equal(canonicalItem.offers.length, 3);
const businessOffer = canonicalItem.offers.find((offer) => offer.purchasability === "business_offer");
assert.equal(businessOffer.sellerPartyKey, "pty_22222222222222222222222222222222");
assert.equal(businessOffer.businessKey, "biz_22222222222222222222222222222222");
assert.equal(canonicalItem.offers.find((offer) => offer.purchasability === "seeded_offer").purchasable, true);
assert.equal(canonicalItem.offers.find((offer) => offer.purchasability === "unsupported").purchasable, false);

const unavailableBusinessStoreResponse = structuredClone(liveStoreResponse);
unavailableBusinessStoreResponse.products[0].offers[1].purchasable = false;
unavailableBusinessStoreResponse.products[0].bestOfferKey = "sof_11111111111111111111111111111111";
unavailableBusinessStoreResponse.products[0].bestUnitPrice = 55;
unavailableBusinessStoreResponse.products[0].totalAvailableQuantity = 4;
unavailableBusinessStoreResponse.products[0].sellerCount = 1;
const unavailableBusinessStore = mergeTerminalRead(
  createEmptyReadModels(),
  "store",
  normalizeApiResponse("store", unavailableBusinessStoreResponse, {
    path: "/store/items",
    requestId: "store-business-unavailable",
    config: {},
  }),
).store;
assert.equal(unavailableBusinessStore.items[0].totalAvailableQuantity, 4);
assert.equal(unavailableBusinessStore.items[0].bestUnitPrice, 55);
assert.equal(
  unavailableBusinessStore.items[0].offers.find((offer) => offer.purchasability === "business_offer").purchasable,
  false,
  "A Buyer-specific unavailable Business offer must remain visible but disabled.",
);

const dishonestUnavailableAggregate = structuredClone(unavailableBusinessStoreResponse);
dishonestUnavailableAggregate.products[0].totalAvailableQuantity = 7;
assert.throws(
  () => normalizeApiResponse("store", dishonestUnavailableAggregate, {
    path: "/store/items",
    requestId: "store-business-unavailable-aggregate",
    config: {},
  }),
  (error) => error.code === "INVALID_RESPONSE",
  "Buyer-facing Store aggregates must exclude unavailable Business offers.",
);

const businessQuote = validateBusinessOfferQuote({ quote: {
  quoteKey: "quote_22222222222222222222222222222222", quoteStatus: "created",
  offerKey: businessOffer.offerKey, offerVersion: businessOffer.version,
  businessKey: businessOffer.businessKey, businessName: businessOffer.businessName,
  sellerPartyKey: businessOffer.sellerPartyKey, sellerName: businessOffer.sellerName,
  catalogItemKey: canonicalItem.catalogItemKey, canonicalItemKey: canonicalItem.canonicalItemKey,
  storeItemKey: canonicalItem.storeItemKey, quantity: 2, availableQuantityAtQuote: 3,
  unitPrice: 50, totalPrice: 100, currencyCode: "NRC",
  expiresAt: "2099-08-25T01:02:00.000Z", pricingVersion: "business-offer-fixed-price-v2",
  replayed: false
} }, { item: canonicalItem, offer: businessOffer, quantity: 2 });
assert.equal(businessQuote.offerKey, businessOffer.offerKey);
const businessReview = renderModal({
  type: "storePurchase",
  stage: "review",
  item: canonicalItem,
  offer: businessOffer,
  purchaseMode: "business_offer",
  quantity: 2,
  quote: businessQuote
});
assert.match(businessReview, /SELLER STOCK AT QUOTE<\/dt><dd>3<\/dd>/);
assert.match(businessReview, /OFFER VERSION<\/dt><dd>4<\/dd>/);
assert.throws(
  () => validateBusinessOfferQuote({ quote: { ...businessQuote, sellerPartyKey: "pty_99999999999999999999999999999999" } }, { item: canonicalItem, offer: businessOffer, quantity: 2 }),
  (error) => error.code === "INVALID_RESPONSE",
  "A quote from any identity other than the explicitly selected seller must fail closed."
);
for (const invalidQuote of [
  { ...businessQuote, unitPrice: "50", totalPrice: "100" },
  { ...businessQuote, unitPrice: 50.00001, totalPrice: 100.00002 },
  { ...businessQuote, expiresAt: Date.parse(businessQuote.expiresAt) }
]) {
  assert.throws(
    () => validateBusinessOfferQuote({ quote: invalidQuote }, { item: canonicalItem, offer: businessOffer, quantity: 2 }),
    (error) => error.code === "INVALID_RESPONSE",
    "Business quotes must reject coerced, overprecision, or non-string typed public fields."
  );
}
const committedBusinessReceipt = {
  receiptKey: "spr_22222222222222222222222222222222",
  quoteKey: businessQuote.quoteKey,
  offerKey: businessQuote.offerKey,
  businessKey: businessQuote.businessKey,
  businessName: businessQuote.businessName,
  sellerPartyKey: businessQuote.sellerPartyKey,
  sellerName: businessQuote.sellerName,
  catalogItemKey: businessQuote.catalogItemKey,
  canonicalItemKey: businessQuote.canonicalItemKey,
  storeItemKey: businessQuote.storeItemKey,
  quantity: businessQuote.quantity,
  unitPrice: businessQuote.unitPrice,
  totalPrice: businessQuote.totalPrice,
  currencyCode: businessQuote.currencyCode,
  offerVersionBefore: businessQuote.offerVersion,
  offerVersionAfter: businessQuote.offerVersion + 1,
  remainingListedQuantity: 1,
  completedAt: "2026-08-25T01:00:30.000Z",
  alreadyCompleted: false
};
const rereadBusinessReceipt = validateImmutableBusinessOfferReceipt(
  { receipt: { ...committedBusinessReceipt, alreadyCompleted: true } },
  { item: canonicalItem, offer: businessOffer, quote: businessQuote, committedReceipt: committedBusinessReceipt }
);
assert.equal(rereadBusinessReceipt.receiptKey, committedBusinessReceipt.receiptKey);
assert.equal(rereadBusinessReceipt.alreadyCompleted, true, "An immutable receipt reread may report the committed operation as already completed.");
for (const invalidReceipt of [
  { ...committedBusinessReceipt, unitPrice: "50" },
  { ...committedBusinessReceipt, totalPrice: 100.00001 },
  { ...committedBusinessReceipt, completedAt: Date.parse(committedBusinessReceipt.completedAt) }
]) {
  assert.throws(
    () => validateImmutableBusinessOfferReceipt(
      { receipt: { ...invalidReceipt, alreadyCompleted: true } },
      { item: canonicalItem, offer: businessOffer, quote: businessQuote, committedReceipt: committedBusinessReceipt }
    ),
    (error) => error.code === "INVALID_RESPONSE",
    "Business receipts must reject coerced, overprecision, or non-string typed public fields."
  );
}
assert.throws(
  () => validateImmutableBusinessOfferReceipt(
    { receipt: { ...committedBusinessReceipt, receiptKey: "spr_99999999999999999999999999999999", alreadyCompleted: true } },
    { item: canonicalItem, offer: businessOffer, quote: businessQuote, committedReceipt: committedBusinessReceipt }
  ),
  (error) => error.code === "INVALID_RESPONSE",
  "The immutable reread must be the exact receipt returned by settlement, not merely another receipt bound to the same quote."
);
assert.throws(
  () => validateImmutableBusinessOfferReceipt(
    { receipt: { ...committedBusinessReceipt, remainingListedQuantity: 0, alreadyCompleted: true } },
    { item: canonicalItem, offer: businessOffer, quote: businessQuote, committedReceipt: committedBusinessReceipt }
  ),
  (error) => error.code === "INVALID_RESPONSE",
  "The immutable reread must match every committed receipt identity and economics field."
);

const storeHtml = renderStorePage({
  ...createEmptyReadModels(),
  session: { currencyCode: "NRC" },
  store: canonicalStore,
  inventory: { items: [] },
  banking: { balances: [], checking: { currencyCode: "NRC", available: 500 } },
  resourceStatus: {}
}, { storeCategory: "All" });
assert.equal((storeHtml.match(/player-terminal-store-card/g) || []).length, 1);
assert.match(storeHtml, /data-player-store-purchase-mode="business_offer"/);
assert.match(storeHtml, /data-player-store-purchase-mode="seeded_offer"/);
assert.match(storeHtml, /data-player-store-purchase-mode="unsupported"[^>]*disabled/);
assert.doesNotMatch(storeHtml, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

const malformedStore = structuredClone(liveStoreResponse);
malformedStore.products[0].offers[1].gameSessionId = "11111111-1111-4111-8111-111111111111";
assert.throws(
  () => normalizeApiResponse("store", malformedStore, { path: "/store/items", requestId: "store-private-shape", config: {} }),
  (error) => error.code === "INVALID_RESPONSE",
  "Raw Store products must reject UUID scope and non-public offer fields before read-model merge."
);

const businessStoreSales = {
  configured: true,
  company: {},
  operations: {},
  products: [],
  suppliers: [],
  manufacturingJobs: [],
  workforceUtilization: null,
  storeSales: {
    businessKey: "biz_22222222222222222222222222222222",
    currencyCode: "NRC",
    recentReceiptCount: 1,
    recentQuantitySold: 2,
    recentGrossRevenue: 100,
    recentCostOfGoodsSold: 60,
    recentGrossMargin: 40,
    sales: [{
      receiptKey: "spr_22222222222222222222222222222222",
      quoteKey: "quote_22222222222222222222222222222222",
      offerKey: "sof_22222222222222222222222222222222",
      itemKey: "market-lens",
      quantity: 2,
      grossRevenue: 100,
      costOfGoodsSold: 60,
      grossMargin: 40,
      currencyCode: "NRC",
      completedAt: "2026-08-25T01:00:30.000Z"
    }],
    activity: [{
      activityKey: "bae_22222222222222222222222222222222",
      eventType: "business.store.sale.completed",
      reasonCode: "business_store_offer_purchase",
      receiptKey: "spr_22222222222222222222222222222222",
      quoteKey: "quote_22222222222222222222222222222222",
      offerKey: "sof_22222222222222222222222222222222",
      quantity: 2,
      grossRevenue: 100,
      costOfGoodsSold: 60,
      grossMargin: 40,
      currencyCode: "NRC",
      occurredAt: "2026-08-25T01:00:30.000Z"
    }]
  }
};
const safeBusiness = normalizeApiResponse("business", businessStoreSales, { path: "/business", requestId: "business-store-sales", config: {} });
assert.equal(safeBusiness.storeSales.sales[0].receiptKey, "spr_22222222222222222222222222222222");
const malformedBusiness = structuredClone(businessStoreSales);
malformedBusiness.storeSales.recentGrossMargin = 39;
assert.throws(
  () => normalizeApiResponse("business", malformedBusiness, { path: "/business", requestId: "business-store-sales-invalid", config: {} }),
  (error) => error.code === "INVALID_RESPONSE",
  "Business Store sales summaries must reconcile to public immutable receipts."
);
const duplicateSalesBusiness = structuredClone(businessStoreSales);
duplicateSalesBusiness.storeSales.sales.push(structuredClone(duplicateSalesBusiness.storeSales.sales[0]));
Object.assign(duplicateSalesBusiness.storeSales, {
  recentReceiptCount: 2,
  recentQuantitySold: 4,
  recentGrossRevenue: 200,
  recentCostOfGoodsSold: 120,
  recentGrossMargin: 80
});
assert.throws(
  () => normalizeApiResponse("business", duplicateSalesBusiness, { path: "/business", requestId: "business-store-sales-duplicate", config: {} }),
  (error) => error.code === "INVALID_RESPONSE",
  "Business Store sales must reject duplicate public receipt or quote keys even when the summary totals reconcile."
);
const duplicateActivityBusiness = structuredClone(businessStoreSales);
duplicateActivityBusiness.storeSales.activity.push(structuredClone(duplicateActivityBusiness.storeSales.activity[0]));
assert.throws(
  () => normalizeApiResponse("business", duplicateActivityBusiness, { path: "/business", requestId: "business-store-activity-duplicate", config: {} }),
  (error) => error.code === "INVALID_RESPONSE",
  "Business Store activity must reject duplicate public activity or receipt keys."
);
const mismatchedActivityBusiness = structuredClone(businessStoreSales);
Object.assign(mismatchedActivityBusiness.storeSales.activity[0], {
  grossRevenue: 99,
  grossMargin: 39
});
assert.throws(
  () => normalizeApiResponse("business", mismatchedActivityBusiness, { path: "/business", requestId: "business-store-activity-mismatch", config: {} }),
  (error) => error.code === "INVALID_RESPONSE",
  "Business Store activity must reconcile its economics and public identifiers to the matching immutable receipt."
);
const missingActivityBusiness = structuredClone(businessStoreSales);
missingActivityBusiness.storeSales.activity = [];
assert.throws(
  () => normalizeApiResponse("business", missingActivityBusiness, { path: "/business", requestId: "business-store-activity-missing", config: {} }),
  (error) => error.code === "INVALID_RESPONSE",
  "Every projected committed Store receipt must retain exactly one matching Business activity event."
);
const unconfiguredBusiness = structuredClone(businessStoreSales);
unconfiguredBusiness.configured = false;
unconfiguredBusiness.storeSales = {
  businessKey: "", currencyCode: "", recentReceiptCount: 0,
  recentQuantitySold: 0, recentGrossRevenue: 0, recentCostOfGoodsSold: 0,
  recentGrossMargin: 0, sales: [], activity: []
};
assert.equal(
  normalizeApiResponse("business", unconfiguredBusiness, { path: "/business", requestId: "business-store-sales-empty", config: {} }).storeSales.businessKey,
  "",
  "An unconfigured Business must retain an explicit empty Store-sales snapshot without inventing public keys."
);

const purchaseSourcePaths = [
  "../src/features/store/store-purchase-flow.js",
  "../src/features/store/store-purchase-contract.js",
  "../src/features/store/store-purchase-convergence.js",
];
const purchaseSources = await Promise.all(purchaseSourcePaths.map((path) =>
  readFile(new URL(path, import.meta.url), "utf8")
));
for (const [index, moduleSource] of purchaseSources.entries()) {
  assert.ok(
    moduleSource.split("\n").length < 500,
    `${purchaseSourcePaths[index]} must remain below the architecture large-file threshold.`,
  );
}
const source = purchaseSources.join("\n");
const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
assert.ok(main.includes("installStorePurchaseFlow"), "The standalone entrypoint must install the Store transaction controller.");
assert.ok(source.includes('api.execute("storeQuote"'), "The flow must obtain a quote before purchase.");
assert.ok(source.includes('api.execute("storePurchase"'), "The flow must settle only after explicit confirmation.");
assert.ok(source.indexOf('api.execute("storeQuote"') < source.indexOf('api.execute("storePurchase"'));
assert.ok(source.includes("quoteExpired"), "Expired quotes must be rejected before settlement.");
assert.ok(source.includes("await terminal.refreshResources(current.invalidatedResources)"), "Successful purchases and safe retries must refresh the same bounded authoritative resources without a page reload.");
assert.ok(!source.includes("await terminal.refresh()"), "Store settlement refresh must remain bounded to invalidated resources.");
assert.ok(source.includes('api.execute("storeOfferQuote"'), "The flow must use the explicit Business offer quote route.");
assert.ok(source.includes('api.execute("storeOfferPurchase"'), "The flow must use the explicit Business offer purchase route.");
assert.ok(source.includes('api.request("storeOfferReceipt"'), "The flow must verify immutable Business receipts through the explicit receipt route.");
assert.ok(source.includes("validateImmutableBusinessOfferReceipt(immutable"), "The receipt reread must be compared to the exact receipt returned by settlement.");
assert.ok(source.includes("refresh?.errors?.store"), "A failed authoritative Store refresh must be detected before stale offer data can be reused.");
assert.ok(source.includes("purchasable: false"), "A stale offer must fail closed when authoritative refresh evidence is unavailable.");
assert.ok(source.includes("purchase completed, but current balances and inventory could not be refreshed"), "A committed purchase must remain completed even when refresh fails.");
const retryStart = source.indexOf("async function retryCommittedRefresh");
const retryEnd = source.indexOf("function editQuantity", retryStart);
assert.ok(retryStart > 0 && retryEnd > retryStart, "The receipt must retain a dedicated post-commit refresh retry path.");
const retrySource = source.slice(retryStart, retryEnd);
assert.ok(retrySource.includes("convergeCommittedStorePurchase"));
assert.ok(!retrySource.includes('api.execute("storeOfferPurchase"'), "Refresh retry must never resubmit Business settlement.");
assert.ok(!retrySource.includes('api.execute("storePurchase"'), "Refresh retry must never resubmit seeded settlement.");
assert.equal((source.match(/api\.execute\("storeOfferPurchase"/g) || []).length, 1, "The controller must contain only one Business settlement call site.");
assert.ok(source.includes("data-player-store-refresh-retry"), "The safe refresh retry control must be handled by the Store controller.");
assert.ok(source.includes("transaction?.processing === true && !force"), "The economic POST must block modal dismissal until its authoritative result is known.");
assert.ok(source.includes("transaction = { ...current, processing: true"), "Settlement processing must be explicit before the economic POST begins.");
assert.ok(source.includes("transaction.processing === true"), "The processing dialog must receive focus when all transaction controls are disabled.");
assert.ok(source.includes('addEventListener("click", handleClick, true)'), "The feature controller must intercept seeded one-click purchase handling before the application controller.");

console.log("Store purchase flow passed: quote, review, confirmation, settlement, refresh, receipt, and failure semantics are valid.");
