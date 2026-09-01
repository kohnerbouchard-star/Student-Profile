import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { isEndpointEnabled, resolveCapabilities } from "../src/api/capabilities.js";
import { PlayerApi } from "../src/api/player-api.js";
import { validInvalidationResources } from "../src/api/freshness.js";
import { WRITE_INVALIDATIONS, dependentResourcesForRoute, resourcesForRoute } from "../src/api/resource-plan.js";
import { previewData } from "../src/data/preview-data.js";
import { resourcesVisibleOnRoute } from "../src/realtime/player-invalidation-controller.js";
import {
  normalizeBusinessProcurementQuote,
  normalizeBusinessProcurementReceipt,
  normalizeBusinessTreasuryOpenResult,
  normalizeBusinessTreasuryOrderResult,
  normalizeBusinessTreasuryQuote,
  normalizeBusinessTreasurySnapshot,
} from "../src/features/business-treasury/business-treasury-read-model.js";
import {
  formatBusinessRatePercent,
  renderBusinessPage,
} from "../src/pages/business-page.js";

const key = Object.freeze({
  business: "biz_11111111111111111111111111111111",
  eco: "bac_11111111111111111111111111111111",
  tok: "bac_22222222222222222222222222222222",
  target: "bac_33333333333333333333333333333333",
  fixing: "fxf_11111111111111111111111111111111",
  quote: "fxq_11111111111111111111111111111111",
  order: "fxo_11111111111111111111111111111111",
  receipt: "fxr_11111111111111111111111111111111",
  storeQuote: "bsq_11111111111111111111111111111111",
  storeReceipt: "bsr_11111111111111111111111111111111",
  fundingQuote: "pfq_11111111111111111111111111111111",
  fundingReceipt: "pfr_11111111111111111111111111111111",
  transaction: "btx_11111111111111111111111111111111",
});

const BUSINESS_ROUTE_DEPENDENCIES = Object.freeze([
  "businessTreasury",
  "businessStockroom",
  "businessRecipes",
  "businessEquipment",
]);

function money(amount, currencyCode, precision) {
  return { amount, currencyCode, precision };
}

const snapshotRaw = {
  businessKey: key.business,
  reportingCurrencyCode: "ECO",
  generatedAt: "2026-08-31T08:01:00.000Z",
  accounts: [
    {
      accountKey: key.tok,
      accountKind: "checking",
      status: "active",
      currencyCode: "TOK",
      precision: 18,
      posted: money("1.000000000000000001", "TOK", 18),
      held: money("0.000000000000000001", "TOK", 18),
      available: money("1", "TOK", 18),
    },
    {
      accountKey: key.eco,
      accountKind: "checking",
      status: "active",
      currencyCode: "ECO",
      precision: 2,
      posted: money("1000", "ECO", 2),
      held: money("10", "ECO", 2),
      available: money("990", "ECO", 2),
    },
    {
      accountKey: key.target,
      accountKind: "checking",
      status: "active",
      currencyCode: "ELD",
      precision: 3,
      posted: money("0", "ELD", 3),
      held: money("0", "ELD", 3),
      available: money("0", "ELD", 3),
    },
  ],
  rates: [{
    fixingKey: key.fixing,
    sourceCurrencyCode: "TOK",
    targetCurrencyCode: "ECO",
    referenceRate: "100.000000000000000001",
    effectiveAt: "2026-08-31T08:00:00.000Z",
    calculatedAt: "2026-08-31T08:00:01.000Z",
    policyVersion: "fx-policy-v1",
  }],
  orders: [{
    orderKey: key.order,
    quoteKey: key.quote,
    product: "standard",
    status: "pending",
    sourceAccountKey: key.tok,
    targetAccountKey: key.eco,
    sourceAmount: money("0.1", "TOK", 18),
    feeAmount: money("0", "TOK", 18),
    targetAmount: money("9.95", "ECO", 2),
    referenceRate: "100",
    customerRate: "99.5",
    spreadRate: "0.005",
    feeRate: "0",
    fixingKey: key.fixing,
    submittedAt: "2026-08-31T08:01:00.000Z",
    settlesAt: "2026-09-01T08:00:00.000Z",
    completedAt: null,
    receiptKey: null,
  }],
  receipts: [{
    receiptKey: key.receipt,
    orderKey: key.order,
    quoteKey: key.quote,
    bankTransactionKey: key.transaction,
    product: "standard",
    sourceAccountKey: key.tok,
    targetAccountKey: key.eco,
    sourceAmount: money("0.1", "TOK", 18),
    feeAmount: money("0", "TOK", 18),
    targetAmount: money("9.95", "ECO", 2),
    referenceRate: "100",
    customerRate: "99.5",
    spreadRate: "0.005",
    feeRate: "0",
    reserveDrawAmount: money("0", "ECO", 2),
    reserveRepaymentAmount: money("0", "TOK", 18),
    fixingKey: key.fixing,
    completedAt: "2026-09-01T08:00:00.000Z",
  }],
};

const treasury = normalizeBusinessTreasurySnapshot(snapshotRaw);
assert.equal(treasury.accounts[0].available.amount, "1");
assert.equal(treasury.orders[0].status, "pending");
assert.equal(treasury.receipts[0].reserveDrawAmount.currencyCode, "ECO");
assert.equal(treasury.receipts[0].reserveRepaymentAmount.currencyCode, "TOK");
assert.throws(
  () => normalizeBusinessTreasurySnapshot({
    ...snapshotRaw,
    orders: [],
    receipts: [{
      ...snapshotRaw.receipts[0],
      reserveRepaymentAmount: money("0", "ECO", 2),
    }],
  }),
  /incomplete data/,
  "Reserve repayment must remain source-currency evidence.",
);

assert.throws(
  () => normalizeBusinessTreasurySnapshot({
    ...snapshotRaw,
    accounts: [{
      ...snapshotRaw.accounts[0],
      available: money("1.000000000000000001", "TOK", 18),
    }],
    orders: [],
  }),
  /incomplete data/,
  "Posted, held, and available balances must reconcile with scaled integers.",
);
assert.throws(
  () => normalizeBusinessTreasurySnapshot({
    ...snapshotRaw,
    diagnostic: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }),
  /incomplete data/,
  "Internal UUIDs must fail closed before entering the Treasury UI.",
);

const fxQuoteRaw = {
  ok: true,
  outcome: "applied",
  refreshRequired: false,
  quote: {
    quoteKey: key.quote,
    product: "instant",
    sourceAccountKey: key.tok,
    targetAccountKey: key.eco,
    sourceAmount: money("0.1", "TOK", 18),
    referenceRate: "100",
    customerRate: "99.5",
    spreadRate: "0.005000000000000000",
    feeRate: "0.02",
    feeAmount: money("0.002", "TOK", 18),
    targetAmount: money("9.95", "ECO", 2),
    fixingKey: key.fixing,
    policyVersion: "fx-policy-v1",
    expiresAt: "2099-08-31T08:02:00.000Z",
    settlesAt: "2099-08-31T08:01:01.000Z",
    requiresFx: true,
    roundingDisclosure: "Target credit is rounded once to ECO precision.",
  },
};
const fxQuote = normalizeBusinessTreasuryQuote(fxQuoteRaw);
assert.equal(fxQuote.quote.spreadRate, "0.005000000000000000");
assert.equal(fxQuote.refreshRequired, false);
assert.throws(
  () => normalizeBusinessTreasuryQuote({ ...fxQuoteRaw, refreshRequired: true }),
  /incomplete data/,
  "A quote response cannot claim committed-state refresh semantics.",
);
assert.throws(
  () => normalizeBusinessTreasuryQuote({
    ...fxQuoteRaw,
    quote: { ...fxQuoteRaw.quote, spreadRate: "0.005000000000000001" },
  }),
  /incomplete data/,
  "The treasury spread must be exact without Number coercion.",
);

const opened = normalizeBusinessTreasuryOpenResult({
  ok: true,
  outcome: "replayed",
  refreshRequired: true,
  account: snapshotRaw.accounts[2],
});
assert.equal(opened.outcome, "replayed");
assert.equal(opened.refreshRequired, true);
const orderResult = normalizeBusinessTreasuryOrderResult({
  ok: true,
  outcome: "applied",
  refreshRequired: true,
  order: snapshotRaw.orders[0],
}, "businessTreasuryFxStandard");
assert.equal(orderResult.order.orderKey, key.order);

const fundingQuote = {
  quoteKey: key.fundingQuote,
  fundingContextKind: "business.store-procurement",
  fundingContextKey: key.storeQuote,
  targetAmount: money("150", "ECO", 2),
  fixingKey: key.fixing,
  policyVersion: "retail-checkout-v1",
  requiresFx: true,
  expiresAt: "2099-08-31T08:05:00.000Z",
  lines: [
    {
      lineNumber: 1,
      sourceAccountKey: key.eco,
      sourceCurrencyCode: "ECO",
      sourcePrecision: 2,
      targetCurrencyCode: "ECO",
      targetPrecision: 2,
      posted: money("1000", "ECO", 2),
      held: money("10", "ECO", 2),
      available: money("990", "ECO", 2),
      targetContribution: money("50", "ECO", 2),
      sourceDebit: money("50", "ECO", 2),
      referenceRate: "1",
      customerRate: "1",
      effectiveRate: "1",
      spreadRate: "0",
      requiresFx: false,
      roundingDisclosure: "No FX rounding is required.",
    },
    {
      lineNumber: 2,
      sourceAccountKey: key.tok,
      sourceCurrencyCode: "TOK",
      sourcePrecision: 18,
      targetCurrencyCode: "ECO",
      targetPrecision: 2,
      posted: money("1.000000000000000001", "TOK", 18),
      held: money("0.000000000000000001", "TOK", 18),
      available: money("1", "TOK", 18),
      targetContribution: money("100", "ECO", 2),
      sourceDebit: money("1.010101010101010102", "TOK", 18),
      referenceRate: "100.000000000000000001",
      customerRate: "99.000000000000000001",
      effectiveRate: "98.999999999999999999",
      spreadRate: "0.010000000000000000",
      requiresFx: true,
      roundingDisclosure: "Source debit is ceiled once to TOK precision.",
    },
  ],
};

const procurementQuoteRaw = {
  ok: true,
  refreshRequired: false,
  quote: {
    businessKey: key.business,
    quoteKey: key.storeQuote,
    itemKey: "refined-alloy",
    itemName: "Refined Alloy",
    quantity: 3,
    countryCode: "ECO",
    itemCurrencyCode: "ELD",
    settlementCurrencyCode: "ECO",
    baseUnitPrice: 40,
    baseUnitPriceMoney: money("40", "ELD", 3),
    inflationMultiplier: 1,
    locationMultiplier: 1,
    scarcityMultiplier: 1,
    itemLocalFinalUnitPrice: 40,
    itemLocalFinalTotalPrice: 120,
    itemLocalFinalUnit: money("40", "ELD", 3),
    itemLocalFinalTotal: money("120", "ELD", 3),
    exchangeRate: 1.25,
    finalUnitPrice: 50,
    finalTotalPrice: 150,
    finalUnit: money("50", "ECO", 2),
    finalTotal: money("150", "ECO", 2),
    pricingVersion: "business-store-v2",
    expiresAt: "2099-08-31T08:04:00.000Z",
    replayed: false,
    fundingTargetAccountKey: key.target,
    fundingQuote,
  },
};
const procurementQuote = normalizeBusinessProcurementQuote(procurementQuoteRaw);
assert.equal(procurementQuote.finalTotal.amount, "150");
assert.equal(procurementQuote.fundingQuote.lines[1].sourceDebit.precision, 18);
assert.throws(
  () => normalizeBusinessProcurementQuote({
    ...procurementQuoteRaw,
    quote: {
      ...procurementQuoteRaw.quote,
      fundingQuote: {
        ...fundingQuote,
        lines: [
          fundingQuote.lines[0],
          {
            ...fundingQuote.lines[1],
            targetContribution: money("99.99", "ECO", 2),
          },
        ],
      },
    },
  }),
  /incomplete data/,
  "Funding contributions must reconcile exactly to the server-derived bill.",
);

const fundingReceipt = {
  receiptKey: key.fundingReceipt,
  quoteKey: key.fundingQuote,
  bankTransactionKey: key.transaction,
  targetAccountKey: key.target,
  fundingContextKind: "business.store-procurement",
  fundingContextKey: key.storeQuote,
  targetAmount: money("150", "ECO", 2),
  targetReserveDrawAmount: money("0", "ECO", 2),
  sourceDomain: "business",
  sourceAction: "store-procurement",
  createdAt: "2099-08-31T08:03:00.000Z",
  lines: fundingQuote.lines.map(({ posted, held, available, roundingDisclosure, ...line }) => line),
};
const procurementReceiptRaw = {
  ok: true,
  refreshRequired: true,
  receipt: {
    businessKey: key.business,
    receiptKey: key.storeReceipt,
    quoteKey: key.storeQuote,
    itemKey: "refined-alloy",
    itemName: "Refined Alloy",
    quantity: 3,
    finalUnitPrice: 50,
    finalTotalPrice: 150,
    finalUnit: money("50", "ECO", 2),
    finalTotal: money("150", "ECO", 2),
    currencyCode: "ECO",
    warehouseQuantityOwned: 3,
    warehouseAverageUnitCost: 50,
    warehouseAverageUnitCostMoney: money("50", "ECO", 2),
    completedAt: "2099-08-31T08:03:00.000Z",
    alreadyCompleted: false,
    fundingReceipt,
  },
};
const procurementReceipt = normalizeBusinessProcurementReceipt(procurementReceiptRaw);
assert.equal(procurementReceipt.fundingReceipt.bankTransactionKey, key.transaction);
assert.equal(procurementReceipt.warehouseAverageUnitCostMoney.amount, "50");

const routeContext = { method: "POST", path: "", params: {}, session: { authenticated: true } };
const treasuryRoute = resolvePlayerBackendRequest({
  ...routeContext,
  endpointKey: "businessTreasuryFxQuote",
  payload: {
    sourceAccountKey: key.tok,
    targetAccountKey: key.eco,
    targetCurrencyCode: "ECO",
    sourceAmount: "0.100000000000000000",
    product: "instant",
    idempotencyKey: "business-fx-quote-0001",
    referenceRate: "attacker-authored",
    playerId: "attacker-authored",
  },
});
assert.deepEqual(treasuryRoute.payload, {
  sourceAccountKey: key.tok,
  targetAccountKey: key.eco,
  targetCurrencyCode: "ECO",
  sourceAmount: "0.1",
  product: "instant",
  idempotencyKey: "business-fx-quote-0001",
});
assert.equal(Object.hasOwn(treasuryRoute.payload, "referenceRate"), false);
assert.equal(Object.hasOwn(treasuryRoute.payload, "playerId"), false);

const procurementRoute = resolvePlayerBackendRequest({
  ...routeContext,
  endpointKey: "businessStoreQuote",
  payload: {
    itemKey: "refined-alloy",
    quantity: 3,
    allocations: [
      { sourceAccountKey: key.eco, targetAmount: "50.000" },
      { sourceAccountKey: key.tok, targetAmount: null },
    ],
    idempotencyKey: "business-store-quote-0001",
    finalTotal: "attacker-authored",
    gameSessionId: "attacker-authored",
  },
});
assert.deepEqual(procurementRoute.payload.allocations, [
  { sourceAccountKey: key.eco, targetAmount: "50" },
  { sourceAccountKey: key.tok, targetAmount: null },
]);
assert.equal(Object.hasOwn(procurementRoute.payload, "finalTotal"), false);
assert.equal(Object.hasOwn(procurementRoute.payload, "gameSessionId"), false);
for (const invalidAllocations of [
  [{ sourceAccountKey: key.eco, targetAmount: "50" }],
  [
    { sourceAccountKey: key.eco, targetAmount: null },
    { sourceAccountKey: key.tok, targetAmount: null },
  ],
]) {
  assert.throws(() => resolvePlayerBackendRequest({
    ...routeContext,
    endpointKey: "businessStoreQuote",
    payload: {
      itemKey: "refined-alloy",
      quantity: 3,
      allocations: invalidAllocations,
      idempotencyKey: "business-store-invalid-0001",
    },
  }), /invalid/);
}

const fullEndpointKeys = [
  "businessTreasuryAccountOpen", "businessTreasuryFxQuote",
  "businessTreasuryFxStandard", "businessTreasuryFxInstant",
  "businessTreasuryFxCancel", "businessStoreQuote", "businessStorePurchase",
];
const capabilityInput = {
  config: {},
  session: {
    capabilities: {
      routes: { business: true },
      actions: {
        businessTreasuryAccountOpen: true,
        businessTreasuryFxQuote: true,
        businessTreasuryFxStandard: true,
        businessTreasuryFxInstant: true,
        businessTreasuryFxCancel: true,
        storePurchase: true,
      },
    },
    capabilityEndpointKeys: fullEndpointKeys,
  },
  dashboard: {},
};
const capabilities = resolveCapabilities(capabilityInput);
assert.equal(isEndpointEnabled(capabilities, "businessStoreQuote"), true);
assert.equal(isEndpointEnabled(capabilities, "businessStorePurchase"), true);
const missingBusinessPurchase = resolveCapabilities({
  ...capabilityInput,
  session: {
    ...capabilityInput.session,
    capabilityEndpointKeys: fullEndpointKeys.filter((entry) => entry !== "businessStorePurchase"),
  },
});
assert.equal(
  isEndpointEnabled(missingBusinessPurchase, "businessStorePurchase"),
  false,
  "Connected mode must fail closed when the exact Business endpoint descriptor is absent.",
);

function pageData(state = "ready", includeTreasury = true) {
  const data = structuredClone(previewData);
  data.business.configured = true;
  data.business.company.id = key.business;
  data.businessTreasury = includeTreasury
    ? {
      ...treasury,
      currentQuote: fxQuote.quote,
      currentQuoteOutcome: "applied",
      currentProcurementQuote: procurementQuote,
      lastProcurementReceipt: procurementReceipt,
    }
    : null;
  data.resourceStatus = {
    ...(data.resourceStatus || {}),
    businessTreasury: { state, status: state === "ready" ? 200 : 503, code: "" },
  };
  data.capabilities = capabilities;
  data.store = {
    categories: ["All"],
    items: [{
      itemKey: "refined-alloy",
      name: "Refined Alloy",
      price: 40,
      currencyCode: "ELD",
      stock: 10,
    }],
  };
  return data;
}

const rendered = renderBusinessPage(pageData());
assert.match(rendered, /TOK 1\.000000000000000000/u);
assert.match(rendered, /step="0\.000000000000000001"/u);
assert.match(rendered, /SERVER-DERIVED REMAINDER/u);
assert.match(rendered, /Server-derived at quote/u);
assert.match(rendered, /spread 1\.00%/u);
assert.equal(
  formatBusinessRatePercent("0.010000000000000001"),
  "1.0000000000000001%",
  "High-precision rates must format without Number coercion or rounding.",
);
assert.match(rendered, /ECO 50\.00/u);
assert.doesNotMatch(rendered, /aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/u);

const refreshing = renderBusinessPage(pageData("refreshing"));
assert.match(refreshing, /data-business-treasury-state="refreshing"/u);
assert.match(refreshing, /REFRESHING/u);
assert.match(refreshing, /data-business-treasury-account=/u);
const stale = renderBusinessPage(pageData("stale"));
assert.match(stale, /data-business-treasury-state="stale"/u);
assert.match(stale, />STALE</u);
assert.match(stale, /data-business-treasury-account=/u);
const loading = renderBusinessPage(pageData("loading", false));
assert.match(loading, /data-business-treasury-state="loading"/u);
assert.match(loading, /Loading Business treasury/u);
const empty = renderBusinessPage(pageData("empty", false));
assert.match(empty, /No canonical treasury snapshot/u);
const error = renderBusinessPage(pageData("unavailable", false));
assert.match(error, /Current balances could not be refreshed/u);
assert.match(error, /Retry treasury/u);

assert.deepEqual(
  resourcesForRoute("business").dependent,
  BUSINESS_ROUTE_DEPENDENCIES,
  "Business treasury and Phase 12 physical reads must remain deferred route dependencies without speculative fetches.",
);
assert.deepEqual(
  dependentResourcesForRoute("business", { business: { configured: false } }),
  [],
  "A Player without a Business must not resolve owner-scoped Business dependencies.",
);
assert.deepEqual(
  dependentResourcesForRoute("business", { business: { configured: true } }),
  BUSINESS_ROUTE_DEPENDENCIES,
  "A configured Business must retain Treasury plus Phase 12 physical read dependencies.",
);
assert.equal(
  resourcesVisibleOnRoute("business", { business: { configured: false } }).has("businessTreasury"),
  false,
  "Realtime visibility must not reintroduce speculative treasury reads for a Player without a Business.",
);
assert.equal(
  resourcesVisibleOnRoute("business", { business: { configured: true } }).has("businessTreasury"),
  true,
  "Realtime visibility must retain treasury for an active Business.",
);

function emptyBusinessStockroom() {
  return {
    businessKey: key.business,
    locations: [
      { accountKey: "iac_11111111111111111111111111111111", locationKey: "warehouse", label: "Warehouse", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
      { accountKey: "iac_22222222222222222222222222222222", locationKey: "work_in_progress", label: "Work in Progress", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
      { accountKey: "iac_33333333333333333333333333333333", locationKey: "finished_goods", label: "Finished Goods", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
      { accountKey: "iac_44444444444444444444444444444444", locationKey: "in_transit", label: "In Transit", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
    ],
    items: [],
  };
}

function businessRouteApi(configuredSource, calls) {
  return new PlayerApi({
    usePreviewData: false,
    requestTimeoutMs: 1000,
    writeCooldownMs: 250,
    allowedImageHosts: [],
    authenticated: true,
    csrfToken: "C".repeat(43),
    gameSessionId: "game_business_treasury_route",
    apiCall: async ({ endpointKey }) => {
      calls.push(endpointKey);
      const configured = typeof configuredSource === "object"
        ? configuredSource.configured === true
        : configuredSource === true;
      if (endpointKey === "business") {
        const business = structuredClone(previewData.business);
        business.configured = configured;
        business.company.id = configured ? key.business : "";
        business.storeSales.businessKey = configured ? key.business : "";
        business.storeSales.currencyCode = configured ? "ELD" : "";
        return business;
      }
      if (endpointKey === "dashboard") return structuredClone(previewData.dashboard);
      if (endpointKey === "banking") return structuredClone(previewData.banking);
      if (endpointKey === "countries") return structuredClone(previewData.countries);
      if (endpointKey === "store") return structuredClone(previewData.store);
      if (endpointKey === "businessTreasury") return structuredClone(snapshotRaw);
      if (endpointKey === "businessStockroom") return emptyBusinessStockroom();
      if (endpointKey === "businessRecipes") return { recipes: [] };
      if (endpointKey === "businessEquipment") return { equipment: [] };
      throw Object.assign(new Error(`Unexpected Business route read: ${endpointKey}`), { status: 404 });
    },
  });
}

const unconfiguredCalls = [];
const unconfiguredRoute = await businessRouteApi(false, unconfiguredCalls).loadRoute("business", { force: true });
assert.equal(unconfiguredCalls.includes("businessTreasury"), false);
assert.equal(unconfiguredRoute.data.businessTreasury, null);
assert.equal(unconfiguredRoute.resourceStatus.businessTreasury.state, "empty");
assert.equal(unconfiguredRoute.resourceStatus.businessTreasury.code, "RESOURCE_PREREQUISITE_NOT_MET");
assert.doesNotMatch(
  renderBusinessPage({ ...pageData(), ...unconfiguredRoute.data }),
  /data-business-treasury-state=/u,
  "The no-Business page must render formation without a synthetic treasury error panel.",
);

const configuredCalls = [];
const configuredRoute = await businessRouteApi(true, configuredCalls).loadRoute("business", { force: true });
assert.equal(configuredCalls.filter((entry) => entry === "businessTreasury").length, 1);
assert.ok(
  configuredCalls.indexOf("businessTreasury") > configuredCalls.indexOf("business"),
  "Treasury may be requested only after the canonical Business prerequisite resolves.",
);
for (const dependency of BUSINESS_ROUTE_DEPENDENCIES) {
  assert.equal(
    configuredCalls.filter((entry) => entry === dependency).length,
    1,
    `${dependency} must resolve exactly once after the configured Business prerequisite.`,
  );
}
assert.equal(configuredRoute.resourceStatus.businessTreasury.state, "ready");
assert.equal(configuredRoute.data.businessTreasury.businessKey, key.business);

assert.equal(
  WRITE_INVALIDATIONS.businessCreate.includes("businessTreasury"),
  true,
  "Formation must refresh the Treasury dependency immediately after the Business commit.",
);
assert.deepEqual(
  validInvalidationResources(["businessTreasury"]),
  ["businessTreasury"],
  "Treasury must remain eligible for authenticated realtime invalidation and refresh.",
);
const transition = { configured: false };
const transitionCalls = [];
const transitionApi = businessRouteApi(transition, transitionCalls);
const beforeFormation = await transitionApi.loadRoute("business", { force: true });
assert.equal(beforeFormation.data.businessTreasury, null);
transition.configured = true;
const afterFormation = await transitionApi.refreshResources(
  WRITE_INVALIDATIONS.businessCreate,
);
assert.equal(afterFormation.errors.businessTreasury, undefined);
assert.equal(afterFormation.resourceStatus.businessTreasury.state, "ready");
assert.equal(afterFormation.data.businessTreasury.businessKey, key.business);
assert.equal(
  transitionCalls.filter((entry) => entry === "businessTreasury").length,
  1,
  "The false-to-true formation transition must fetch Treasury exactly once without route re-entry.",
);

console.log("Business C4 Treasury, exact funding DTO, server-derived remainder, Phase 12 deferred dependencies, capability, state, and precision contracts passed.");
