import type {
  FinancialMarketBondDefinition,
  FinancialMarketYieldCurveVersion,
} from "../contracts/financialMarketContracts.ts";
import {
  calculateFixedIncomeAnalytics,
  DEFAULT_FIXED_INCOME_CURVE_POLICY,
  NEGATIVE_YIELD_REFERENCE_POLICY,
  resolveFixedIncomeYield,
  validateVersionedFixedIncomeCurve,
} from "./fixedIncomeAnalytics.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("fixed-income analytics calculate clean, dirty, yield, duration, and convexity", () => {
  const analytics = calculateFixedIncomeAnalytics({
    bond: bond(),
    settlementDate: "2026-06-30",
    faceQuantity: "3",
    annualYield: 0.055,
  });
  assert(Number(analytics.cleanPrice) > 0);
  assert(Number(analytics.dirtyPrice) >= Number(analytics.cleanPrice));
  assert(analytics.currentYield > 0);
  assert(Math.abs(analytics.yieldToMaturity - 0.055) < 0.00001);
  assert(analytics.macaulayDurationYears > 0);
  assert(analytics.modifiedDurationYears > 0);
  assert(analytics.convexity > 0);
  assertEquals(analytics.maturityValue, "3000");
});

Deno.test("coupon boundary handling is deterministic before, on, and after payment", () => {
  const before = calculateFixedIncomeAnalytics({
    bond: bond(),
    settlementDate: "2026-06-30",
    faceQuantity: "1",
    annualYield: 0.05,
  });
  const onCoupon = calculateFixedIncomeAnalytics({
    bond: bond(),
    settlementDate: "2026-07-01",
    faceQuantity: "1",
    annualYield: 0.05,
  });
  const after = calculateFixedIncomeAnalytics({
    bond: bond(),
    settlementDate: "2026-07-02",
    faceQuantity: "1",
    annualYield: 0.05,
  });
  assert(Number(before.accruedInterest) > 0);
  assertEquals(onCoupon.accruedInterest, "0");
  assert(Number(after.accruedInterest) > 0);
  assertEquals(onCoupon, calculateFixedIncomeAnalytics({
    bond: bond(),
    settlementDate: "2026-07-01",
    faceQuantity: "1",
    annualYield: 0.05,
  }));
});

Deno.test("zero coupon and leap-year references remain numerically stable", () => {
  const zero = {
    ...bond(),
    bondPublicId: "bond.northreach.sovereign.zero.v1",
    instrumentPublicId: "instrument.northreach.sovereign.zero.v1",
    issuerPublicId: "issuer.northreach.government.v1",
    bondKind: "sovereign" as const,
    issueDate: "2024-02-29",
    settlementDate: "2024-03-01",
    maturityDate: "2028-02-29",
    couponType: "zero_coupon" as const,
    couponRateAnnual: 0,
  };
  const analytics = calculateFixedIncomeAnalytics({
    bond: zero,
    settlementDate: "2025-02-28",
    faceQuantity: "1",
    annualYield: 0.03,
  });
  assertEquals(analytics.accruedInterest, "0");
  assertEquals(analytics.currentYield, 0);
  assertEquals(analytics.remainingCashFlowCount, 1);
  assert(Number(analytics.cleanPrice) < 1000);
});

Deno.test("negative yields require explicit policy and zero yields are supported", () => {
  const zeroYield = calculateFixedIncomeAnalytics({
    bond: bond(),
    settlementDate: "2026-01-01",
    faceQuantity: "1",
    annualYield: 0,
  });
  assert(Number(zeroYield.dirtyPrice) > 0);
  assertThrows(() =>
    calculateFixedIncomeAnalytics({
      bond: bond(),
      settlementDate: "2026-01-01",
      faceQuantity: "1",
      annualYield: -0.01,
    })
  );
  const negative = calculateFixedIncomeAnalytics({
    bond: bond(),
    settlementDate: "2026-01-01",
    faceQuantity: "1",
    annualYield: -0.01,
    yieldPolicy: NEGATIVE_YIELD_REFERENCE_POLICY,
  });
  assert(Number(negative.cleanPrice) > 0);
  assert(Math.abs(negative.yieldToMaturity - (-0.01)) < 0.00001);
});

Deno.test("versioned curves validate inversion warnings and resolve bounded spreads", () => {
  const inverted = curve([
    [30, 0.04],
    [365, 0.035],
    [1_825, 0.05],
  ]);
  const validation = validateVersionedFixedIncomeCurve(inverted);
  assertEquals(validation.valid, true);
  assertEquals(validation.invertedSegmentCount, 1);
  assert(validation.warnings.includes("curve_contains_inverted_segments"));
  const resolved = resolveFixedIncomeYield({
    curve: inverted,
    tenorDays: 730,
    creditSpread: 0.02,
    liquiditySpread: 0.005,
    eventAdjustment: -0.003,
  });
  assertEquals(resolved.curveVersion, 1);
  assert(resolved.yieldRate >= DEFAULT_FIXED_INCOME_CURVE_POLICY.minimumRate);
  assert(resolved.interpolationKind === "interpolated");
});

Deno.test("malformed curves, maturities, frequencies, and extreme spreads fail closed", () => {
  const malformed = curve([
    [365, 0.03],
    [30, 0.02],
  ]);
  const validation = validateVersionedFixedIncomeCurve(malformed);
  assertEquals(validation.valid, false);
  assert(validation.errors.includes("curve_tenor_order_invalid"));
  assertThrows(() =>
    calculateFixedIncomeAnalytics({
      bond: { ...bond(), maturityDate: "2025-01-01" },
      settlementDate: "2026-01-01",
      faceQuantity: "1",
      annualYield: 0.05,
    })
  );
  assertThrows(() =>
    calculateFixedIncomeAnalytics({
      bond: { ...bond(), couponFrequency: "monthly" as never },
      settlementDate: "2026-01-01",
      faceQuantity: "1",
      annualYield: 0.05,
    })
  );
  assertThrows(() =>
    resolveFixedIncomeYield({
      curve: curve(),
      tenorDays: 365,
      creditSpread: 0.500001,
      liquiditySpread: 0,
      eventAdjustment: 0,
    })
  );
});

function bond(): FinancialMarketBondDefinition {
  return {
    bondPublicId: "bond.northreach.corporate.analytics.v1",
    instrumentPublicId: "instrument.northreach.corporate.analytics.v1",
    issuerPublicId: "issuer.northreach.corporation.analytics.v1",
    bondKind: "corporate",
    issueDate: "2026-01-01",
    settlementDate: "2026-01-03",
    maturityDate: "2031-01-01",
    faceValue: "1000",
    denominationCurrencyCode: "NRC",
    couponType: "fixed",
    couponRateAnnual: 0.05,
    couponFrequency: "semiannual",
    dayCountConvention: "actual_365",
    businessDayConvention: "following",
    creditRating: "BBB",
    callable: false,
    callSchedulePublicId: null,
    recoveryPolicyPublicId: "recovery.standard.v1",
    status: "approved_inactive",
    sourceVersion: "bond.analytics.v1",
    sourceChecksumSha256: "c".repeat(64),
  };
}

function curve(
  points: readonly [number, number][] = [
    [30, 0.02],
    [365, 0.03],
    [1_825, 0.045],
    [3_650, 0.05],
  ],
): FinancialMarketYieldCurveVersion {
  return {
    curvePublicId: "curve.northreach.nrc.analytics.v1",
    gamePublicId: "game.market.analytics.v1",
    countryCode: "NORTHREACH",
    currencyCode: "NRC",
    observedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    riskFreeBaseline: 0.02,
    liquidityAdjustment: 0,
    eventAdjustment: 0,
    points: points.map(([tenorDays, continuouslyCompoundedZeroRate]) => ({
      tenorDays,
      continuouslyCompoundedZeroRate,
    })),
    inputDigestSha256: "d".repeat(64),
  };
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function assertThrows(run: () => unknown): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected function to throw.");
}
