#!/usr/bin/env node

import assert from "node:assert/strict";

const RETAIL_NUMERATOR = 99n;
const RETAIL_DENOMINATOR = 100n;

function pow10(decimals) {
  assert.ok(Number.isInteger(decimals) && decimals >= 0 && decimals <= 18);
  return 10n ** BigInt(decimals);
}

function ceilDiv(numerator, denominator) {
  assert.ok(numerator >= 0n && denominator > 0n);
  return (numerator + denominator - 1n) / denominator;
}

function targetCreditSourceMinorUnits({
  targetMinorCount,
  sourceDecimals,
  targetDecimals,
  sourceUnitsPerEco,
  targetUnitsPerEco,
}) {
  assert.ok(targetMinorCount > 0n);
  assert.ok(sourceUnitsPerEco > 0n && targetUnitsPerEco > 0n);
  const numerator = targetMinorCount *
    sourceUnitsPerEco *
    RETAIL_DENOMINATOR *
    pow10(sourceDecimals);
  const denominator = pow10(targetDecimals) *
    targetUnitsPerEco *
    RETAIL_NUMERATOR;
  return ceilDiv(numerator, denominator);
}

function deliveredTargetNumerator({
  sourceMinorCount,
  sourceDecimals,
  targetDecimals,
  sourceUnitsPerEco,
  targetUnitsPerEco,
}) {
  return sourceMinorCount *
    targetUnitsPerEco *
    RETAIL_NUMERATOR *
    pow10(targetDecimals);
}

function deliveredTargetDenominator({ sourceDecimals, sourceUnitsPerEco }) {
  return pow10(sourceDecimals) * sourceUnitsPerEco * RETAIL_DENOMINATOR;
}

function assertMinimalTargetCredit(caseInput) {
  const sourceMinorCount = targetCreditSourceMinorUnits(caseInput);
  const deliveredNumerator = deliveredTargetNumerator({
    ...caseInput,
    sourceMinorCount,
  });
  const deliveredDenominator = deliveredTargetDenominator(caseInput);
  const requiredNumerator = caseInput.targetMinorCount * deliveredDenominator;
  assert.ok(
    deliveredNumerator >= requiredNumerator,
    `${caseInput.label} rounded source debit did not fully fund the target credit`,
  );
  if (sourceMinorCount > 1n) {
    const previousNumerator = deliveredTargetNumerator({
      ...caseInput,
      sourceMinorCount: sourceMinorCount - 1n,
    });
    assert.ok(
      previousNumerator < requiredNumerator,
      `${caseInput.label} source debit was not the minimal source-minor-unit ceiling`,
    );
  }
  return sourceMinorCount;
}

const cases = [
  {
    label: "USD to KRW, zero-decimal target",
    targetMinorCount: 10000n,
    sourceDecimals: 2,
    targetDecimals: 0,
    sourceUnitsPerEco: 1n,
    targetUnitsPerEco: 1300n,
  },
  {
    label: "KRW to USD, zero-decimal source",
    targetMinorCount: 2500n,
    sourceDecimals: 0,
    targetDecimals: 2,
    sourceUnitsPerEco: 1300n,
    targetUnitsPerEco: 1n,
  },
  {
    label: "three-decimal source to two-decimal target",
    targetMinorCount: 1999n,
    sourceDecimals: 3,
    targetDecimals: 2,
    sourceUnitsPerEco: 3n,
    targetUnitsPerEco: 2n,
  },
  {
    label: "two-decimal source to three-decimal target",
    targetMinorCount: 12345n,
    sourceDecimals: 2,
    targetDecimals: 3,
    sourceUnitsPerEco: 7n,
    targetUnitsPerEco: 11n,
  },
];

const sourceDebits = cases.map((item) => ({
  label: item.label,
  sourceMinorCount: assertMinimalTargetCredit(item).toString(),
}));

function validateAllocation(targetMinorTotal, contributions) {
  assert.ok(contributions.length >= 1 && contributions.length <= 3);
  assert.ok(contributions.every((value) => value > 0n));
  const funded = contributions.reduce((sum, value) => sum + value, 0n);
  if (funded !== targetMinorTotal) throw new Error("PURCHASE_FUNDING_TOTAL_MISMATCH");
  return funded;
}

assert.equal(validateAllocation(10000n, [10000n]), 10000n);
assert.equal(validateAllocation(10000n, [2500n, 7500n]), 10000n);
assert.equal(validateAllocation(10000n, [2000n, 3000n, 5000n]), 10000n);
assert.throws(() => validateAllocation(10000n, [9999n]), /PURCHASE_FUNDING_TOTAL_MISMATCH/u);
assert.throws(() => validateAllocation(10000n, [5000n, 5001n]), /PURCHASE_FUNDING_TOTAL_MISMATCH/u);
assert.throws(() => validateAllocation(10000n, [1n, 2n, 3n, 9994n]), /AssertionError/u);
assert.throws(() => validateAllocation(10000n, [0n, 10000n]), /AssertionError/u);

// Same-currency funding never pays an FX spread or a separate fee.
const sameCurrency = Object.freeze({
  targetMinorCount: 12345n,
  sourceMinorCount: 12345n,
  referenceRate: "1",
  customerRate: "1",
  spreadRate: "0",
  feeAmount: "0",
});
assert.equal(sameCurrency.sourceMinorCount, sameCurrency.targetMinorCount);
assert.equal(sameCurrency.spreadRate, "0");
assert.equal(sameCurrency.feeAmount, "0");

process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "10A4C0",
  policy: "retail-checkout-v1",
  spread: "1.00%",
  sourceDebits,
  exactFundingShapes: [1, 2, 3],
})}\n`);
