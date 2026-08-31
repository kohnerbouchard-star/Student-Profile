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
import {
  validateSystemOfferQuote,
  validateSystemOfferReceipt,
} from "../src/features/store/store-purchase-contract.js";
import { convergeCommittedStorePurchase } from "../src/features/store/store-purchase-convergence.js";
import { renderStorePage } from "../src/pages/store-page.js";

const FUNDING_SOURCE_ACCOUNT = `bac_${"a".repeat(32)}`;
const FUNDING_TARGET_ACCOUNT = `bac_${"b".repeat(32)}`;
const STORE_CONTEXT_DIGEST = "1".repeat(64);
const STORE_INVENTORY_TRANSACTION = `itx_${"2".repeat(32)}`;

function fundingQuoteEvidence({ commercialQuoteKey, contextKind, targetCurrencyCode, targetAmount, expiresAt }) {
  const requiresFx = targetCurrencyCode !== "ECO";
  return {
    quoteKey: `pfq_${"c".repeat(32)}`,
    fundingContextKind: contextKind,
    fundingContextKey: commercialQuoteKey,
    targetCurrencyCode,
    targetMinorUnit: 2,
    targetAmount: String(targetAmount),
    fixingKey: `fxf_${"d".repeat(32)}`,
    policyVersion: "player-retail-funding-v1",
    requiresFx,
    expiresAt,
    lines: [{
      lineNumber: 1, sourceAccountKey: FUNDING_SOURCE_ACCOUNT,
      sourceCurrencyCode: "ECO", sourceMinorUnit: 2,
      targetCurrencyCode, targetMinorUnit: 2,
      postedAmount: "500", heldAmount: "0", availableAmount: "500",
      targetContribution: String(targetAmount), sourceDebit: requiresFx ? "101.02" : String(targetAmount),
      referenceRate: requiresFx ? "1" : "1", customerRate: requiresFx ? "0.99" : "1",
      effectiveRate: requiresFx ? "0.989902989506" : "1", spreadRate: requiresFx ? "0.01" : "0",
      requiresFx, roundingDisclosure: "Source debit rounds up; target contribution is exact.",
    }],
  };
}

function fundingReceiptEvidence(quote, sourceAction) {
  return {
    receiptKey: `pfr_${"e".repeat(32)}`, quoteKey: quote.quoteKey,
    bankTransactionKey: `btx_${"f".repeat(32)}`, targetAccountKey: FUNDING_TARGET_ACCOUNT,
    fundingContextKind: quote.fundingContextKind, fundingContextKey: quote.fundingContextKey,
    targetCurrencyCode: quote.targetCurrencyCode, targetMinorUnit: quote.targetMinorUnit,
    targetAmount: quote.targetAmount, targetReserveDrawAmount: "0",
    sourceDomain: "store", sourceAction, createdAt: "2026-08-25T01:00:30.000Z",
    lines: quote.lines.map(({ roundingDisclosure, postedAmount, heldAmount, availableAmount, ...line }) => line),
  };
}

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
    bestOfferKey: "sof_33333333333333333333333333333333", bestUnitPrice: 45,
    totalAvailableQuantity: 9, sellerCount: 3, offerCount: 3,
    updatedAt: "2026-08-25T01:00:00.000Z",
    offers: [
      { offerKey: "sof_33333333333333333333333333333333", sellerKind: "npc", sellerPartyKey: "pty_33333333333333333333333333333333", sellerName: "Crescent Exchange", businessKey: null, businessName: null, unitPrice: 45, currencyCode: "NRC", availableQuantity: 2, status: "active", purchasability: "system_offer", purchasable: true, version: 2 },
      { offerKey: "sof_22222222222222222222222222222222", sellerKind: "business", sellerPartyKey: "pty_22222222222222222222222222222222", sellerName: "Crescent Dynamics", businessKey: "biz_22222222222222222222222222222222", businessName: "Crescent Dynamics", unitPrice: 50, currencyCode: "NRC", availableQuantity: 3, status: "active", purchasability: "business_offer", purchasable: true, version: 4 },
      { offerKey: "sof_11111111111111111111111111111111", sellerKind: "seeded", sellerPartyKey: "pty_11111111111111111111111111111111", sellerName: "Econovaria Store", businessKey: null, businessName: null, unitPrice: 55, currencyCode: "NRC", availableQuantity: 4, status: "active", purchasability: "system_offer", purchasable: true, version: 1 }
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
const seededOffer = canonicalItem.offers.find((offer) => offer.sellerKind === "seeded");
const npcOffer = canonicalItem.offers.find((offer) => offer.sellerKind === "npc");
assert.equal(seededOffer.purchasability, "system_offer");
assert.equal(seededOffer.purchasable, true);
assert.equal(npcOffer.purchasability, "system_offer");
assert.equal(npcOffer.purchasable, true);

const mixedCurrencyStoreResponse = structuredClone(liveStoreResponse);
mixedCurrencyStoreResponse.products[0].offers[2].currencyCode = "ECO";
mixedCurrencyStoreResponse.products[0].bestOfferKey = null;
mixedCurrencyStoreResponse.products[0].bestUnitPrice = null;
const mixedCurrencyStore = mergeTerminalRead(
  createEmptyReadModels(),
  "store",
  normalizeApiResponse("store", mixedCurrencyStoreResponse, {
    path: "/store/items",
    requestId: "store-mixed-currency",
    config: {},
  }),
).store;
assert.equal(mixedCurrencyStore.items[0].bestOfferKey, null);
assert.equal(mixedCurrencyStore.items[0].bestUnitPrice, null, "Mixed-currency offers must not synthesize a numeric best price.");
const dishonestMixedCurrencyAggregate = structuredClone(mixedCurrencyStoreResponse);
dishonestMixedCurrencyAggregate.products[0].bestOfferKey = "sof_22222222222222222222222222222222";
dishonestMixedCurrencyAggregate.products[0].bestUnitPrice = 50;
assert.throws(
  () => normalizeApiResponse("store", dishonestMixedCurrencyAggregate, {
    path: "/store/items",
    requestId: "store-mixed-currency-best-claim",
    config: {},
  }),
  (error) => error.code === "INVALID_RESPONSE",
  "A cross-currency aggregate best-price claim must fail closed.",
);

const unavailableBusinessStoreResponse = structuredClone(liveStoreResponse);
unavailableBusinessStoreResponse.products[0].offers[1].purchasable = false;
unavailableBusinessStoreResponse.products[0].bestOfferKey = "sof_33333333333333333333333333333333";
unavailableBusinessStoreResponse.products[0].bestUnitPrice = 45;
unavailableBusinessStoreResponse.products[0].totalAvailableQuantity = 6;
unavailableBusinessStoreResponse.products[0].sellerCount = 2;
const unavailableBusinessStore = mergeTerminalRead(
  createEmptyReadModels(),
  "store",
  normalizeApiResponse("store", unavailableBusinessStoreResponse, {
    path: "/store/items",
    requestId: "store-business-unavailable",
    config: {},
  }),
).store;
assert.equal(unavailableBusinessStore.items[0].totalAvailableQuantity, 6);
assert.equal(unavailableBusinessStore.items[0].bestUnitPrice, 45);
assert.equal(
  unavailableBusinessStore.items[0].offers.find((offer) => offer.purchasability === "business_offer").purchasable,
  false,
  "A Buyer-specific unavailable Business offer must remain visible but disabled.",
);

const dishonestUnavailableAggregate = structuredClone(unavailableBusinessStoreResponse);
dishonestUnavailableAggregate.products[0].totalAvailableQuantity = 9;
assert.throws(
  () => normalizeApiResponse("store", dishonestUnavailableAggregate, {
    path: "/store/items",
    requestId: "store-business-unavailable-aggregate",
    config: {},
  }),
  (error) => error.code === "INVALID_RESPONSE",
  "Buyer-facing Store aggregates must exclude unavailable Business offers.",
);

const systemContextDigest = "4".repeat(64);
const npcQuote = validateSystemOfferQuote({ quote: {
  quoteKey: "quote_44444444444444444444444444444444", quoteStatus: "created",
  itemKey: canonicalItem.itemKey, itemName: canonicalItem.name, quantity: 1,
  baseUnitPrice: 45, inflationMultiplier: 1, locationMultiplier: 1,
  scarcityMultiplier: 1, discountAmount: 0, finalUnitPrice: 45,
  finalTotalPrice: 45, currencyCode: "NRC", itemCurrencyCode: "NRC",
  playerCurrencyCode: "NRC", exchangeRate: 1, itemLocalFinalUnitPrice: 45,
  itemLocalFinalTotalPrice: 45, expiresAt: "2099-08-25T01:02:00.000Z",
  pricingVersion: "store-system-offer-funded-v2:npc:country:nrc", replayed: false,
  offerKey: npcOffer.offerKey, offerVersion: npcOffer.version,
  sellerKind: npcOffer.sellerKind, sellerPartyKey: npcOffer.sellerPartyKey,
  sellerName: npcOffer.sellerName, availableQuantityAtQuote: npcOffer.availableQuantity,
  contextDigest: systemContextDigest,
  fundingQuote: fundingQuoteEvidence({
    commercialQuoteKey: "quote_44444444444444444444444444444444",
    contextKind: "store.system-offer", targetCurrencyCode: "NRC", targetAmount: "45",
    expiresAt: "2099-08-25T01:02:00.000Z",
  }),
} }, { item: canonicalItem, offer: npcOffer, quantity: 1 });
const npcReceiptPayload = {
  receiptKey: "receipt_44444444444444444444444444444444",
  quoteKey: npcQuote.quoteKey, itemKey: npcQuote.itemKey,
  itemName: npcQuote.itemName, quantity: npcQuote.quantity,
  finalUnitPrice: npcQuote.finalUnitPrice, finalTotalPrice: npcQuote.finalTotalPrice,
  currencyCode: npcQuote.currencyCode, inventoryQuantityOwned: 2,
  offerKey: npcQuote.offerKey, sellerKind: npcQuote.sellerKind,
  sellerPartyKey: npcQuote.sellerPartyKey, sellerName: npcQuote.sellerName,
  offerVersionBefore: npcQuote.offerVersion, offerVersionAfter: npcQuote.offerVersion + 1,
  remainingSellerQuantity: 1, sellerProceeds: npcQuote.finalTotalPrice,
  inventoryTransactionKey: `itx_${"4".repeat(32)}`,
  completedAt: "2026-08-25T01:00:30.000Z", alreadyCompleted: false,
  contextDigest: npcQuote.contextDigest,
  fundingReceipt: fundingReceiptEvidence(npcQuote.fundingQuote, "system_offer_purchase_funding"),
};
assert.equal(
  validateSystemOfferReceipt(
    { receipt: npcReceiptPayload },
    { item: canonicalItem, offer: npcOffer, quote: npcQuote },
  ).inventoryTransactionKey,
  npcReceiptPayload.inventoryTransactionKey,
);
for (const invalidSystemEvidence of [
  { ...npcReceiptPayload, contextDigest: "5".repeat(64) },
  { ...npcReceiptPayload, inventoryTransactionKey: "itx_invalid" },
  { ...npcReceiptPayload, offerVersionAfter: npcQuote.offerVersion },
]) {
  assert.throws(
    () => validateSystemOfferReceipt(
      { receipt: invalidSystemEvidence },
      { item: canonicalItem, offer: npcOffer, quote: npcQuote },
    ),
    (error) => error.code === "INVALID_RESPONSE",
    "System-offer receipts must bind seller version, context, and Inventory evidence to the quote.",
  );
}
assert.throws(
  () => validateSystemOfferQuote(
    { quote: { ...npcQuote, contextDigest: "invalid" } },
    { item: canonicalItem, offer: npcOffer, quantity: 1 },
  ),
  (error) => error.code === "INVALID_RESPONSE",
  "System-offer quotes must require a lowercase SHA-256 context digest.",
);

const seededQuote = validateSystemOfferQuote({ quote: {
  ...npcQuote,
  quoteKey: "quote_55555555555555555555555555555555",
  baseUnitPrice: seededOffer.unitPrice,
  finalUnitPrice: seededOffer.unitPrice,
  finalTotalPrice: seededOffer.unitPrice,
  itemLocalFinalUnitPrice: seededOffer.unitPrice,
  itemLocalFinalTotalPrice: seededOffer.unitPrice,
  pricingVersion: "store-system-offer-funded-v2:seeded:country:nrc",
  offerKey: seededOffer.offerKey,
  offerVersion: seededOffer.version,
  sellerKind: seededOffer.sellerKind,
  sellerPartyKey: seededOffer.sellerPartyKey,
  sellerName: seededOffer.sellerName,
  availableQuantityAtQuote: seededOffer.availableQuantity,
  contextDigest: "7".repeat(64),
  fundingQuote: fundingQuoteEvidence({
    commercialQuoteKey: "quote_55555555555555555555555555555555",
    contextKind: "store.system-offer",
    targetCurrencyCode: "NRC",
    targetAmount: String(seededOffer.unitPrice),
    expiresAt: "2099-08-25T01:02:00.000Z",
  }),
} }, { item: canonicalItem, offer: seededOffer, quantity: 1 });
assert.equal(validateSystemOfferReceipt({ receipt: {
  ...npcReceiptPayload,
  receiptKey: "receipt_55555555555555555555555555555555",
  quoteKey: seededQuote.quoteKey,
  finalUnitPrice: seededQuote.finalUnitPrice,
  finalTotalPrice: seededQuote.finalTotalPrice,
  offerKey: seededQuote.offerKey,
  sellerKind: seededQuote.sellerKind,
  sellerPartyKey: seededQuote.sellerPartyKey,
  sellerName: seededQuote.sellerName,
  offerVersionBefore: seededQuote.offerVersion,
  offerVersionAfter: seededQuote.offerVersion,
  remainingSellerQuantity: 3,
  sellerProceeds: seededQuote.finalTotalPrice,
  contextDigest: seededQuote.contextDigest,
  fundingReceipt: fundingReceiptEvidence(seededQuote.fundingQuote, "system_offer_purchase_funding"),
} }, { item: canonicalItem, offer: seededOffer, quote: seededQuote }).offerVersionAfter, seededOffer.version);

const businessQuote = validateBusinessOfferQuote({ quote: {
  quoteKey: "quote_22222222222222222222222222222222", quoteStatus: "created",
  offerKey: businessOffer.offerKey, offerVersion: businessOffer.version,
  businessKey: businessOffer.businessKey, businessName: businessOffer.businessName,
  sellerPartyKey: businessOffer.sellerPartyKey, sellerName: businessOffer.sellerName,
  catalogItemKey: canonicalItem.catalogItemKey, canonicalItemKey: canonicalItem.canonicalItemKey,
  storeItemKey: canonicalItem.storeItemKey, quantity: 2, availableQuantityAtQuote: 3,
  unitPrice: 50, totalPrice: 100, currencyCode: "NRC",
  expiresAt: "2099-08-25T01:02:00.000Z", pricingVersion: "business-offer-fixed-price-v2",
  replayed: false, contextDigest: STORE_CONTEXT_DIGEST,
  fundingQuote: fundingQuoteEvidence({
    commercialQuoteKey: "quote_22222222222222222222222222222222",
    contextKind: "store.business-offer", targetCurrencyCode: "NRC", targetAmount: "100",
    expiresAt: "2099-08-25T01:02:00.000Z",
  }),
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
  { ...businessQuote, expiresAt: Date.parse(businessQuote.expiresAt) },
  { ...businessQuote, contextDigest: "not-a-context-digest" },
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
  inventoryTransactionKey: STORE_INVENTORY_TRANSACTION,
  quantity: businessQuote.quantity,
  unitPrice: businessQuote.unitPrice,
  totalPrice: businessQuote.totalPrice,
  sellerProceeds: businessQuote.totalPrice,
  currencyCode: businessQuote.currencyCode,
  offerVersionBefore: businessQuote.offerVersion,
  offerVersionAfter: businessQuote.offerVersion + 1,
  remainingListedQuantity: 1,
  completedAt: "2026-08-25T01:00:30.000Z",
  alreadyCompleted: false,
  contextDigest: businessQuote.contextDigest,
  fundingReceipt: fundingReceiptEvidence(businessQuote.fundingQuote, "business_offer_purchase_funding"),
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
  { ...committedBusinessReceipt, completedAt: Date.parse(committedBusinessReceipt.completedAt) },
  { ...committedBusinessReceipt, contextDigest: "3".repeat(64) },
  { ...committedBusinessReceipt, inventoryTransactionKey: "itx_invalid" },
  { ...committedBusinessReceipt, sellerProceeds: 99 },
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

let convergenceReceiptReads = 0;
let convergenceSettlementSubmissions = 0;
const convergenceResourceAttempts = [];
const convergenceApi = {
  setSession() {},
  async request(endpointKey, options) {
    assert.equal(endpointKey, "storeOfferReceipt");
    assert.equal(options.params.receiptKey, committedBusinessReceipt.receiptKey);
    convergenceReceiptReads += 1;
    return { receipt: { ...committedBusinessReceipt, alreadyCompleted: true } };
  },
  async execute() {
    convergenceSettlementSubmissions += 1;
    throw new Error("Committed refresh must not submit settlement.");
  },
};
const convergenceTerminal = {
  async refreshResources(resources) {
    convergenceResourceAttempts.push([...resources]);
    return convergenceResourceAttempts.length === 1
      ? { data: {}, errors: { dashboard: { code: "REQUEST_TIMEOUT" } } }
      : { data: {}, errors: {} };
  },
};
const convergenceCurrent = {
  purchaseMode: "business_offer",
  item: canonicalItem,
  offer: businessOffer,
  quote: businessQuote,
  receipt: committedBusinessReceipt,
  invalidatedResources: ["dashboard", "store", "inventory", "banking", "bankingFx"],
};
const convergenceContext = {
  current: convergenceCurrent,
  api: convergenceApi,
  config: {},
  terminal: convergenceTerminal,
  requestGeneration: 1,
  requestIsCurrent: () => true,
  signal: null,
};
const timedOutConvergence = await convergeCommittedStorePurchase(convergenceContext);
assert.equal(timedOutConvergence.length, 1);
assert.match(timedOutConvergence[0], /Checking, Banking FX, Store stock, or inventory evidence could not be refreshed/u);
const completedConvergence = await convergeCommittedStorePurchase(convergenceContext);
assert.deepEqual(completedConvergence, []);
assert.equal(convergenceReceiptReads, 2, "Each safe refresh attempt must reread the immutable receipt exactly once.");
assert.equal(convergenceSettlementSubmissions, 0, "Safe refresh attempts must never resubmit settlement.");
assert.deepEqual(convergenceResourceAttempts, [
  convergenceCurrent.invalidatedResources,
  convergenceCurrent.invalidatedResources,
]);

const storeHtml = renderStorePage({
  ...createEmptyReadModels(),
  session: { currencyCode: "NRC" },
  store: canonicalStore,
  inventory: { items: [] },
  banking: { balances: [], checking: { currencyCode: "NRC", available: 500 } },
  bankingFx: {
    currencies: [{ currencyCode: "NRC", minorUnit: 2 }],
    balances: [{ accountKey: FUNDING_SOURCE_ACCOUNT, accountKind: "checking", currencyCode: "ECO", availableAmount: 500 }],
  },
  resourceStatus: {}
}, { storeCategory: "All" });
assert.equal((storeHtml.match(/player-terminal-store-card/g) || []).length, 1);
assert.match(storeHtml, /data-player-store-purchase-mode="business_offer"/);
assert.equal((storeHtml.match(/data-player-store-purchase-mode="system_offer"/g) || []).length, 2);
assert.match(storeHtml, /NPC[\s\S]*data-player-store-purchase-mode="system_offer"/);
assert.doesNotMatch(storeHtml, /data-player-store-purchase-mode="seeded_offer"|data-player-store-purchase-mode="unsupported"/);
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
assert.ok(source.includes("purchase completed, but current Checking, Banking FX, Store, and inventory evidence could not be refreshed"), "A committed purchase must remain completed even when refresh fails.");
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
