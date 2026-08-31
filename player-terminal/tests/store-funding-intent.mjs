import assert from "node:assert/strict";

import {
  canonicalStoreAmountFromScaled,
  canonicalStoreTargetAmount,
  normalizeStoreFundingIntent,
  scaledStoreAmount,
  storeAmountsEqual,
  storeCheckingAccounts,
  storeCurrencyPrecision,
  storeDecimalStep,
  storeFundingAvailability,
  validateStoreFundingQuoteEvidence,
  validateStoreFundingReceiptEvidence,
} from "../src/features/store/store-funding-intent.js";

const ACCOUNT = Object.freeze({
  eco: `bac_${"1".repeat(32)}`,
  lum: `bac_${"2".repeat(32)}`,
  nrc: `bac_${"3".repeat(32)}`,
});
const data = {
  bankingFx: {
    currencies: [
      { currencyCode: "JPY", minorUnit: 0 },
      { currencyCode: "NRC", minorUnit: 3 },
      { currencyCode: "X18", minorUnit: 18 },
    ],
    balances: [
      { accountKey: ACCOUNT.eco, accountKind: "checking", currencyCode: "ECO", availableAmount: 500 },
      { accountKey: ACCOUNT.lum, accountKind: "checking", currencyCode: "LUM", availableAmount: 400 },
      { accountKey: ACCOUNT.nrc, accountKind: "checking", currencyCode: "NRC", availableAmount: 300 },
      { accountKey: `bac_${"4".repeat(32)}`, accountKind: "savings", currencyCode: "NRC", availableAmount: 900 },
      { accountKey: "private-account", accountKind: "checking", currencyCode: "NRC", availableAmount: 900 },
    ],
  },
};

const accounts = storeCheckingAccounts(data);
assert.deepEqual(accounts.map((entry) => entry.accountKey), [ACCOUNT.eco, ACCOUNT.lum, ACCOUNT.nrc]);
assert.equal(storeCurrencyPrecision(data, "JPY"), 0);
assert.equal(storeCurrencyPrecision(data, "NRC"), 3);
assert.equal(storeCurrencyPrecision(data, "X18"), 18);
assert.equal(storeCurrencyPrecision(data, "BAD"), null);
assert.equal(storeDecimalStep(0), "1");
assert.equal(storeDecimalStep(3), "0.001");
assert.equal(storeDecimalStep(18), `0.${"0".repeat(17)}1`);
assert.deepEqual(storeFundingAvailability(data, "NRC"), {
  accounts,
  targetCurrencyCode: "NRC",
  targetPrecision: 3,
  ready: true,
});
const unavailableFundingData = structuredClone(data);
unavailableFundingData.resourceStatus = { bankingFx: { state: "unavailable" } };
assert.equal(
  storeFundingAvailability(unavailableFundingData, "NRC").ready,
  false,
  "A failed Banking FX read must disable funding even when stale account rows remain in memory.",
);

assert.equal(canonicalStoreTargetAmount("001", 3), "", "Leading-zero ambiguity must fail closed.");
assert.equal(canonicalStoreTargetAmount("1.230", 3), "1.23");
assert.equal(canonicalStoreTargetAmount("1.0001", 3), "");
assert.equal(canonicalStoreTargetAmount("1e-3", 3), "");
assert.equal(canonicalStoreTargetAmount("0", 3), "");
assert.equal(canonicalStoreTargetAmount("0", 3, { allowZero: true }), "0");
assert.equal(canonicalStoreTargetAmount("0.000000000000000001", 18), "0.000000000000000001");
assert.equal(scaledStoreAmount("123.456", 3), 123456n);
assert.equal(canonicalStoreAmountFromScaled(123456n, 3), "123.456");
assert.equal(storeAmountsEqual("1.230", "1.23", 3), true);
assert.equal(storeAmountsEqual("1.231", "1.23", 3), false);

const one = normalizeStoreFundingIntent([
  { sourceAccountKey: ACCOUNT.eco, targetAmount: null },
], { accounts, targetCurrencyCode: "NRC", targetPrecision: 3 });
assert.deepEqual(one.allocations, [{ sourceAccountKey: ACCOUNT.eco, targetAmount: null }]);
assert.equal(one.fixedTotal, "0");

const two = normalizeStoreFundingIntent([
  { sourceAccountKey: ACCOUNT.eco, targetAmount: "40.125" },
  { sourceAccountKey: ACCOUNT.lum, targetAmount: null },
], { accounts, targetCurrencyCode: "NRC", targetPrecision: 3 });
assert.deepEqual(two.allocations, [
  { sourceAccountKey: ACCOUNT.eco, targetAmount: "40.125" },
  { sourceAccountKey: ACCOUNT.lum, targetAmount: null },
]);
assert.equal(two.fixedTotal, "40.125");

const three = normalizeStoreFundingIntent([
  { sourceAccountKey: ACCOUNT.eco, targetAmount: "10.001" },
  { sourceAccountKey: ACCOUNT.lum, targetAmount: "20.002" },
  { sourceAccountKey: ACCOUNT.nrc, targetAmount: null },
], { accounts, targetCurrencyCode: "NRC", targetPrecision: 3 });
assert.deepEqual(three.allocations, [
  { sourceAccountKey: ACCOUNT.eco, targetAmount: "10.001" },
  { sourceAccountKey: ACCOUNT.lum, targetAmount: "20.002" },
  { sourceAccountKey: ACCOUNT.nrc, targetAmount: null },
]);
assert.equal(three.fixedTotal, "30.003");

for (const [rows, message] of [
  [[{ sourceAccountKey: ACCOUNT.eco, targetAmount: "1" }, { sourceAccountKey: "", targetAmount: "" }, { sourceAccountKey: ACCOUNT.nrc, targetAmount: null }], /in order/u],
  [[{ sourceAccountKey: ACCOUNT.eco, targetAmount: "1" }, { sourceAccountKey: ACCOUNT.eco, targetAmount: null }], /only once/u],
  [[{ sourceAccountKey: ACCOUNT.eco, targetAmount: "1.0001" }, { sourceAccountKey: ACCOUNT.lum, targetAmount: null }], /decimal places/u],
  [[{ sourceAccountKey: ACCOUNT.eco, targetAmount: "1" }], /final Checking account/u],
  [[{ sourceAccountKey: "private-account", targetAmount: null }], /canonical Player Checking/u],
]) {
  assert.match(normalizeStoreFundingIntent(rows, {
    accounts,
    targetCurrencyCode: "NRC",
    targetPrecision: 3,
  }).error, message);
}

const exact18 = normalizeStoreFundingIntent([
  { sourceAccountKey: ACCOUNT.eco, targetAmount: "0.000000000000000001" },
  { sourceAccountKey: ACCOUNT.lum, targetAmount: null },
], { accounts, targetCurrencyCode: "X18", targetPrecision: 18 });
assert.equal(exact18.allocations[0].targetAmount, "0.000000000000000001");

const commercialQuoteKey = `quote_${"5".repeat(32)}`;
const quoteEvidence = {
  quoteKey: `pfq_${"6".repeat(32)}`, fundingContextKind: "store.business-offer",
  fundingContextKey: commercialQuoteKey, targetCurrencyCode: "NRC", targetMinorUnit: 3,
  targetAmount: "100.003", fixingKey: `fxf_${"7".repeat(32)}`,
  policyVersion: "player-retail-funding-v1", requiresFx: true,
  expiresAt: "2099-08-25T01:02:00.000Z",
  lines: [
    { lineNumber: 1, sourceAccountKey: ACCOUNT.eco, sourceCurrencyCode: "ECO", sourceMinorUnit: 2, targetCurrencyCode: "NRC", targetMinorUnit: 3, postedAmount: "500", heldAmount: "0", availableAmount: "500", targetContribution: "10.001", sourceDebit: "10.11", referenceRate: "1", customerRate: "0.99", effectiveRate: "0.989", spreadRate: "0.01", requiresFx: true, roundingDisclosure: "Source debit rounds up; target contribution is exact." },
    { lineNumber: 2, sourceAccountKey: ACCOUNT.lum, sourceCurrencyCode: "LUM", sourceMinorUnit: 2, targetCurrencyCode: "NRC", targetMinorUnit: 3, postedAmount: "400", heldAmount: "5", availableAmount: "395", targetContribution: "20.002", sourceDebit: "20.21", referenceRate: "1", customerRate: "0.99", effectiveRate: "0.989", spreadRate: "0.01", requiresFx: true, roundingDisclosure: "Source debit rounds up; target contribution is exact." },
    { lineNumber: 3, sourceAccountKey: ACCOUNT.nrc, sourceCurrencyCode: "NRC", sourceMinorUnit: 3, targetCurrencyCode: "NRC", targetMinorUnit: 3, postedAmount: "300", heldAmount: "0", availableAmount: "300", targetContribution: "70", sourceDebit: "70", referenceRate: "1", customerRate: "1", effectiveRate: "1", spreadRate: "0", requiresFx: false, roundingDisclosure: "No currency conversion was required." },
  ],
};
const nonSortedIntent = normalizeStoreFundingIntent([
  { sourceAccountKey: ACCOUNT.nrc, targetAmount: "70" },
  { sourceAccountKey: ACCOUNT.eco, targetAmount: "10.001" },
  { sourceAccountKey: ACCOUNT.lum, targetAmount: null },
], { accounts, targetCurrencyCode: "NRC", targetPrecision: 3 });
assert.deepEqual(nonSortedIntent.allocations.map((entry) => entry.sourceAccountKey), [
  ACCOUNT.nrc, ACCOUNT.eco, ACCOUNT.lum,
]);
const validatedQuote = validateStoreFundingQuoteEvidence(quoteEvidence, {
  commercialQuoteKey, targetCurrencyCode: "NRC", targetAmount: "100.003",
  fundingContextKind: "store.business-offer", commercialExpiresAt: quoteEvidence.expiresAt,
  allocationIntent: nonSortedIntent,
});
assert.equal(validatedQuote.targetAmount, "100.003");

const receiptEvidence = {
  receiptKey: `pfr_${"8".repeat(32)}`, quoteKey: validatedQuote.quoteKey,
  bankTransactionKey: `btx_${"9".repeat(32)}`, targetAccountKey: `bac_${"a".repeat(32)}`,
  fundingContextKind: validatedQuote.fundingContextKind,
  fundingContextKey: validatedQuote.fundingContextKey,
  targetCurrencyCode: "NRC", targetMinorUnit: 3, targetAmount: "100.003",
  targetReserveDrawAmount: "0", sourceDomain: "store",
  sourceAction: "business_offer_purchase_funding", createdAt: "2026-08-25T01:00:30.000Z",
  lines: validatedQuote.lines.map(({ postedAmount, heldAmount, availableAmount, roundingDisclosure, ...line }) => line),
};
const validatedReceipt = validateStoreFundingReceiptEvidence(receiptEvidence, {
  quote: validatedQuote, sourceAction: "business_offer_purchase_funding",
});
assert.equal(validatedReceipt.receiptKey, receiptEvidence.receiptKey);

for (const invalid of [
  { ...quoteEvidence, targetAmount: 100.003 },
  { ...quoteEvidence, generatedAt: "2026-08-25T01:00:00.000Z" },
  { ...quoteEvidence, lines: quoteEvidence.lines.map((line, index) => index ? line : { ...line, targetContribution: "10.002" }) },
  { ...quoteEvidence, lines: quoteEvidence.lines.map((line, index) => index === 2 ? { ...line, sourceMinorUnit: 2 } : line) },
]) {
  assert.throws(
    () => validateStoreFundingQuoteEvidence(invalid, {
      commercialQuoteKey, targetCurrencyCode: "NRC", targetAmount: "100.003",
      fundingContextKind: "store.business-offer", commercialExpiresAt: quoteEvidence.expiresAt,
      allocationIntent: nonSortedIntent,
    }),
    (error) => error.code === "INVALID_RESPONSE",
  );
}

console.log("Store funding intent passed: ordered 1–3 Checking allocations, exact 0/3/18 precision, and immutable quote/receipt evidence are enforced.");
