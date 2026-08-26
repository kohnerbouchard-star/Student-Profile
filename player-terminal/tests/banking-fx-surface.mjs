import assert from "node:assert/strict";
import fs from "node:fs";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import {
  normalizeBankingFxHistory,
  normalizeBankingFxOrders,
  normalizeBankingFxOverview,
  normalizeBankingFxQuote,
} from "../src/features/banking/banking-fx-read-model.js";
import {
  mergeBankingFxOrderPage,
  resolveBankingFxFailure,
} from "../src/features/banking/banking-read-flow.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { previewData } from "../src/data/preview-data.js";

const keys = Object.freeze({
  source: "bac_11111111111111111111111111111111",
  target: "bac_22222222222222222222222222222222",
  savings: "bac_33333333333333333333333333333333",
  fixing: "fxf_11111111111111111111111111111111",
  quote: "fxq_11111111111111111111111111111111",
  order: "fxo_11111111111111111111111111111111",
  receipt: "fxr_11111111111111111111111111111111",
});

const overviewRaw = {
  generatedAt: "2026-08-26T08:01:00.000Z",
  currencies: [
    { currencyCode: "ECO", minorUnit: 2 },
    { currencyCode: "ELD", minorUnit: 2 },
    { currencyCode: "LUM", minorUnit: 2 },
    { currencyCode: "XAL", minorUnit: 2 },
  ],
  accounts: [
    { accountKey: keys.source, accountKind: "checking", currencyCode: "ECO", postedAmount: "1000.00", heldAmount: "125.00", availableAmount: "875.00" },
    { accountKey: keys.target, accountKind: "checking", currencyCode: "ELD", postedAmount: "200.00", heldAmount: "0.00", availableAmount: "200.00" },
    { accountKey: keys.savings, accountKind: "savings", currencyCode: "ECO", postedAmount: "500.00", heldAmount: "0.00", availableAmount: "500.00" },
  ],
  fixing: {
    fixingKey: keys.fixing,
    effectiveAt: "2026-08-26T08:00:00.000Z",
    calculatedAt: "2026-08-26T08:00:03.000Z",
    nextFixingAt: "2026-08-27T08:00:00.000Z",
    overdue: false,
    policyVersion: "fx-policy-v1",
  },
  pendingOrders: [],
  completedOrders: [],
};

const quoteRaw = {
  quote: {
    quoteKey: keys.quote,
    product: "instant",
    sourceAccountKey: keys.source,
    targetAccountKey: keys.target,
    sourceCurrencyCode: "ECO",
    targetCurrencyCode: "ELD",
    sourceMinorUnit: 2,
    targetMinorUnit: 2,
    sourceAmountMode: "source_debit",
    sourceAmount: "100.00",
    referenceRate: "1.50000000",
    customerRate: "1.49250000",
    spreadRate: "0.005",
    feeAmount: "2.00",
    targetAmount: "149.25",
    fixingKey: keys.fixing,
    policyVersion: "fx-policy-v1",
    expiresAt: "2026-08-26T08:02:00.000Z",
    settlesAt: "2026-08-26T08:01:01.000Z",
    requiresFx: true,
    roundingDisclosure: "The expected credit is rounded once to ELD minor units.",
  },
};

const orderRaw = {
  orderKey: keys.order,
  quoteKey: keys.quote,
  product: "instant",
  status: "settled",
  sourceCurrencyCode: "ECO",
  targetCurrencyCode: "ELD",
  sourceAmount: "100",
  feeAmount: "2",
  targetAmount: "149.25",
  submittedAt: "2026-08-26T08:01:00.000Z",
  settlesAt: "2026-08-26T08:01:01.000Z",
  completedAt: "2026-08-26T08:01:01.000Z",
  receiptKey: keys.receipt,
};

const overview = normalizeBankingFxOverview(overviewRaw);
assert.equal(overview.balances.length, 3);
assert.deepEqual(overview.currencies.at(-1), {
  currencyCode: "XAL",
  minorUnit: 2,
});
assert.deepEqual(overview.balances[0], {
  accountKey: keys.source,
  accountKind: "checking",
  currencyCode: "ECO",
  postedAmount: 1000,
  heldAmount: 125,
  availableAmount: 875,
});
assert.equal(overview.fixing.fixingKey, keys.fixing);
assert.equal(overview.fixing.nextFixingAt, "2026-08-27T08:00:00.000Z");

const quote = normalizeBankingFxQuote(quoteRaw);
assert.equal(quote.referenceRate, "1.50000000");
assert.equal(quote.customerRate, "1.49250000");
assert.equal(quote.spreadRate, "0.005");
assert.equal(quote.feeAmount, "2.00");
assert.equal(quote.targetAmount, "149.25");

const history = normalizeBankingFxHistory({
  range: "30d",
  points: [
    { fixingKey: keys.fixing, effectiveAt: "2026-08-26T08:00:00.000Z", sourceCurrencyCode: "ECO", targetCurrencyCode: "ELD", referenceRate: "1.5" },
  ],
  pagination: { cursor: null, nextCursor: null, hasMore: false, limit: 100 },
});
assert.equal(history.range, "30d");
assert.equal(history.points[0].referenceRate, "1.5");

const orderPage = normalizeBankingFxOrders({
  orders: [orderRaw],
  pagination: { cursor: null, nextCursor: null, hasMore: false, limit: 25 },
});
const mergedOrders = mergeBankingFxOrderPage(
  {
    ...overview,
    pendingOrders: [{ ...orderRaw, status: "pending", completedAt: "", receiptKey: "" }],
  },
  orderPage,
);
assert.equal(mergedOrders.pendingOrders.length, 0);
assert.equal(mergedOrders.completedOrders.length, 1);
assert.equal(mergedOrders.completedOrders[0].receiptKey, keys.receipt);

assert.throws(
  () => normalizeBankingFxOverview({
    ...overviewRaw,
    diagnosticId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }),
  /incomplete data/,
  "Internal UUIDs must fail closed before entering the browser read model.",
);
assert.throws(
  () => normalizeBankingFxOverview({
    ...overviewRaw,
    accounts: [{ ...overviewRaw.accounts[0], availableAmount: 1001 }],
  }),
  /incomplete data/,
  "Available funds cannot exceed the posted projection.",
);

const routeContext = {
  method: "GET",
  path: "/banking/fx",
  params: {},
  session: { authenticated: true },
};
assert.deepEqual(
  resolvePlayerBackendRequest({ ...routeContext, endpointKey: "bankingFx" }),
  {
    endpointKey: "bankingFx",
    method: "GET",
    path: "/players/me/banking/fx",
    payload: undefined,
  },
);

const historyRoute = resolvePlayerBackendRequest({
  ...routeContext,
  endpointKey: "bankingFxHistory",
  payload: {
    sourceCurrencyCode: "ECO",
    targetCurrencyCode: "ELD",
    range: "30d",
    limit: 50,
    cursor: "offset_50",
  },
});
assert.equal(
  historyRoute.path,
  "/players/me/banking/fx/history?sourceCurrencyCode=ECO&targetCurrencyCode=ELD&range=30d&limit=50&cursor=offset_50",
);

const ordersRoute = resolvePlayerBackendRequest({
  ...routeContext,
  endpointKey: "bankingFxOrders",
  payload: { status: "all", limit: 25 },
});
assert.equal(
  ordersRoute.path,
  "/players/me/banking/fx/orders?status=all&limit=25",
);

const quoteRoute = resolvePlayerBackendRequest({
  ...routeContext,
  endpointKey: "bankingFxQuote",
  method: "POST",
  payload: {
    sourceAccountKey: keys.source,
    targetCurrencyCode: "ELD",
    sourceAmount: "100.00",
    product: "instant",
    idempotencyKey: "idem-quote-1",
    referenceRate: 99,
    playerId: "must-not-pass",
    gameSessionId: "must-not-pass",
  },
});
assert.deepEqual(quoteRoute.payload, {
  sourceAccountKey: keys.source,
  targetCurrencyCode: "ELD",
  sourceAmount: "100",
  product: "instant",
  idempotencyKey: "idem-quote-1",
});
for (const forbidden of [
  "referenceRate",
  "customerRate",
  "spreadRate",
  "feeAmount",
  "targetAmount",
  "balance",
  "playerId",
  "gameSessionId",
  "targetAccountKey",
]) {
  assert.equal(Object.hasOwn(quoteRoute.payload, forbidden), false, `${forbidden} must remain server-derived.`);
}

assert.throws(
  () => resolvePlayerBackendRequest({
    ...routeContext,
    endpointKey: "bankingFxQuote",
    method: "POST",
    payload: {
      sourceAccountKey: keys.source,
      targetCurrencyCode: "ELD",
      sourceAmount: "0.0000000000000000001",
      product: "instant",
      idempotencyKey: "idem-invalid-precision",
    },
  }),
  /sourceAmount is invalid/,
  "FX amounts must remain bounded canonical decimal strings.",
);

for (const [endpointKey, path] of [
  ["bankingFxStandard", "/players/me/banking/fx/orders/standard"],
  ["bankingFxInstant", "/players/me/banking/fx/orders/instant"],
]) {
  const route = resolvePlayerBackendRequest({
    ...routeContext,
    endpointKey,
    method: "POST",
    payload: { quoteKey: keys.quote, idempotencyKey: `idem-${endpointKey}` },
  });
  assert.equal(route.path, path);
  assert.deepEqual(Object.keys(route.payload).sort(), ["idempotencyKey", "quoteKey"]);
}

const cancelRoute = resolvePlayerBackendRequest({
  ...routeContext,
  endpointKey: "bankingFxCancel",
  method: "POST",
  params: { orderKey: keys.order },
  payload: { orderKey: keys.order, idempotencyKey: "idem-cancel-1" },
});
assert.equal(
  cancelRoute.path,
  `/players/me/banking/fx/orders/${keys.order}/cancel`,
);
assert.deepEqual(cancelRoute.payload, { idempotencyKey: "idem-cancel-1" });

const data = structuredClone(previewData);
data.capabilities = {
  routes: { banking: true },
  actions: {
    bankingFxQuote: true,
    bankingFxStandard: true,
    bankingFxInstant: true,
    bankingFxCancel: true,
    bankTransfer: false,
    savingsTransfer: false,
  },
};
data.resourceStatus = { bankingFx: { state: "ready" } };
data.banking = {
  ...data.banking,
  checking: { accountId: keys.source, balance: 1000, postedAmount: 1000, heldAmount: 125, available: 875, availableAmount: 875, pending: 125, currencyCode: "ECO" },
  balances: overview.balances.map((balance) => ({
    ...balance,
    accountType: balance.accountKind,
    balance: balance.postedAmount,
    available: balance.availableAmount,
  })),
  pagination: { cursor: null, nextCursor: null, hasMore: false, limit: 50 },
};
data.bankingFx = {
  ...overview,
  history,
  currentQuote: quote,
  pendingOrders: [{
    ...orderRaw,
    status: "pending",
    completedAt: "",
    receiptKey: "",
    cancellable: true,
  }],
  completedOrders: [orderRaw],
};
const html = renderBankingPage(data);
assert.match(html, /Posted[\s\S]*ECO 1,000/);
assert.match(html, /Held[\s\S]*ECO 125/);
assert.match(html, /Available[\s\S]*ECO 875/);
assert.ok(html.includes(keys.source), "The full public account key must be submitted by the source selector.");
assert.ok(!html.includes(`value="${keys.savings}"`), "Savings must never appear in the FX source selector.");
assert.ok(html.includes('value="XAL"'), "A canonical fixing currency must remain selectable before a foreign account exists.");
assert.ok(html.includes("LAST FIXING") && html.includes("NEXT FIXING"));
assert.ok(html.includes("7 days") && html.includes("30 days") && html.includes("Game to date"));
assert.ok(html.includes("Reference rate") && html.includes("Customer rate") && html.includes("Bank spread"));
assert.ok(html.includes("2.00% separate fee"), "Instant fee must be separate from the customer rate.");
assert.ok(html.includes("Expected credit") && html.includes("Settlement"));
assert.ok(html.includes('data-endpoint="bankingFxInstant"'));
assert.ok(html.includes('data-endpoint="bankingFxCancel"'));
assert.ok(html.includes("Pending orders") && html.includes("Completed orders"));
assert.ok(!html.includes("referenceRate\" value="), "No server-derived rate may be posted from a form.");

const errorData = structuredClone(data);
errorData.resourceStatus.bankingFx.state = "unavailable";
const errorHtml = renderBankingPage(errorData);
assert.ok(errorHtml.includes('data-player-banking-fx-state="error"'));
assert.ok(errorHtml.includes("Balances and posted ledger activity remain visible"));

assert.equal(
  resolveBankingFxFailure({ code: "FX_LIQUIDITY_UNAVAILABLE" }),
  "The FX liquidity facility cannot complete this conversion right now. No funds moved.",
);
assert.equal(
  resolveBankingFxFailure({ code: "FX_QUOTE_EXPIRED" }),
  "This quote expired. Create a new quote before submitting.",
);

const adapterSource = fs.readFileSync(
  new URL("../src/api/banking-fx-backend-routes.js", import.meta.url),
  "utf8",
);
const flowSource = fs.readFileSync(
  new URL("../src/features/banking/banking-read-flow.js", import.meta.url),
  "utf8",
);
assert.doesNotMatch(adapterSource, /gameSessionId|playerId|playerUuid|referenceRate:\s*payload|customerRate:\s*payload/);
assert.doesNotMatch(flowSource, /\bfetch\s*\(/);
assert.match(flowSource, /api\.execute\("bankingFxQuote", intent\)/);
assert.match(flowSource, /\{ quoteKey: quote\.quoteKey \}/);

console.log("Banking FX surface passed: public-account routes, canonical balance/fixing/history/order read models, quote disclosure, server-derived pricing, and safe failure states are valid.");
