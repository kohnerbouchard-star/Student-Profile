import type {
  FinancialMarketBondDefinition,
  FinancialMarketYieldCurveVersion,
} from "../contracts/financialMarketContracts.ts";
import * as analytics from "./fixedIncomeAnalytics.ts";

declare const Deno: { test(name: string, run: () => void): void };
const {
  calculateFixedIncomeAnalytics,
  resolveFixedIncomeYield,
  validateVersionedFixedIncomeCurve,
  DEFAULT_FIXED_INCOME_CURVE_POLICY,
  DEFAULT_FIXED_INCOME_YIELD_POLICY,
  NEGATIVE_YIELD_REFERENCE_POLICY,
} = analytics;
const resolution = {
  curve: curve(),
  tenorDays: 365,
  creditSpread: 0.02,
  liquiditySpread: 0.005,
  eventAdjustment: -0.003,
};
const input = {
  bond: bond(),
  settlementDate: "2026-06-30",
  faceQuantity: "3",
  annualYield: 0.055,
};
const cases: readonly [string, () => unknown][] = [
  ["public runtime exports", () => Object.keys(analytics).sort()],
  [
    "frozen policy objects",
    () =>
      [
        DEFAULT_FIXED_INCOME_CURVE_POLICY,
        DEFAULT_FIXED_INCOME_YIELD_POLICY,
        NEGATIVE_YIELD_REFERENCE_POLICY,
      ].map(Object.isFrozen),
  ],
  ...[1, 30, 31, 365, 730, 1825, 3650, 18250].map((
    tenorDays,
  ): [string, () => unknown] => [
    `tenor ${tenorDays}`,
    () => resolveFixedIncomeYield({ ...resolution, tenorDays }),
  ]),
  [
    "slope positive cap",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        curve: curve([[30, 0.01], [31, 0.5]]),
        tenorDays: 100,
      }),
  ],
  [
    "rate maximum clamp",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        curve: curve([[30, 0.5], [31, 0.6]]),
        tenorDays: 18250,
      }),
  ],
  [
    "slope negative cap and minimum clamp",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        curve: curve([[30, 0.4], [31, 0.01]]),
        tenorDays: 18250,
      }),
  ],
  [
    "inversion and deterministic key",
    () =>
      validateVersionedFixedIncomeCurve(
        curve([[30, 0.04], [365, 0.03], [730, 0.02]]),
      ),
  ],
  [
    "curve error sorting deduplication",
    () =>
      validateVersionedFixedIncomeCurve({
        ...curve([[0, -1], [0, -2]]),
        curvePublicId: "",
        gamePublicId: "",
        countryCode: "YRETHIA",
        currencyCode: "bad",
        version: 0,
        observedAt: "bad",
        inputDigestSha256: "bad",
        eventAdjustment: 1,
      }),
  ],
  [
    "invalid policy with invalid points",
    () =>
      validateVersionedFixedIncomeCurve(curve([[30, -1], [20, 2]]), {
        ...DEFAULT_FIXED_INCOME_CURVE_POLICY,
        minimumRate: -1,
        maximumTenorDays: 0,
        maximumExtrapolationSlopePerDay: -1,
      }),
  ],
  [
    "single point",
    () => validateVersionedFixedIncomeCurve(curve([[30, 0.02]])),
  ],
  ["empty points", () => validateVersionedFixedIncomeCurve(curve([]))],
  [
    "129 points",
    () =>
      validateVersionedFixedIncomeCurve(
        curve(Array.from({ length: 129 }, (_, i) => [i + 1, 0.02])),
      ),
  ],
  [
    "curve validation precedes tenor and spreads",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        curve: curve([]),
        tenorDays: 0,
        creditSpread: -1,
        liquiditySpread: -1,
        eventAdjustment: 1,
      }),
  ],
  ...[0, -1, 0.5, 18251, NaN, Infinity].map((
    tenorDays,
  ): [string, () => unknown] => [
    `invalid tenor ${tenorDays}`,
    () =>
      resolveFixedIncomeYield({ ...resolution, tenorDays, creditSpread: -1 }),
  ]),
  [
    "credit validation precedes liquidity",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        creditSpread: -1,
        liquiditySpread: -1,
        eventAdjustment: 1,
      }),
  ],
  [
    "liquidity validation precedes event",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        liquiditySpread: -1,
        eventAdjustment: 1,
      }),
  ],
  [
    "nonfinite credit",
    () => resolveFixedIncomeYield({ ...resolution, creditSpread: NaN }),
  ],
  [
    "nonfinite liquidity",
    () => resolveFixedIncomeYield({ ...resolution, liquiditySpread: Infinity }),
  ],
  [
    "nonfinite yield event",
    () => resolveFixedIncomeYield({ ...resolution, eventAdjustment: NaN }),
  ],
  [
    "event bound",
    () =>
      resolveFixedIncomeYield({ ...resolution, eventAdjustment: 0.20000001 }),
  ],
  [
    "inclusive spread bounds",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        creditSpread: 0.5,
        liquiditySpread: 0.25,
        eventAdjustment: 0.2,
      }),
  ],
  [
    "resolved yield bound",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        curve: curve([[30, 0.5], [365, 0.6]]),
        creditSpread: 0.5,
      }),
  ],
  [
    "negative resolved yield disabled",
    () => resolveFixedIncomeYield({ ...resolution, eventAdjustment: -0.1 }),
  ],
  [
    "negative resolved yield enabled",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        eventAdjustment: -0.1,
        yieldPolicy: NEGATIVE_YIELD_REFERENCE_POLICY,
      }),
  ],
  [
    "curve metadata adjustments not added",
    () =>
      resolveFixedIncomeYield({
        ...resolution,
        curve: {
          ...curve(),
          eventAdjustment: 0.2,
          liquidityAdjustment: 0.2,
          riskFreeBaseline: 0.4,
        },
      }),
  ],
  ["fixed bond numerical snapshot", () => calculateFixedIncomeAnalytics(input)],
  ...["2026-07-01", "2026-07-02", "2031-01-01"].map((
    settlementDate,
  ): [string, () => unknown] => [
    `settlement ${settlementDate}`,
    () => calculateFixedIncomeAnalytics({ ...input, settlementDate }),
  ]),
  ...["annual", "quarterly"].map((
    couponFrequency,
  ): [string, () => unknown] => [
    `frequency ${couponFrequency}`,
    () =>
      calculateFixedIncomeAnalytics({
        ...input,
        bond: {
          ...bond(),
          couponFrequency:
            couponFrequency as FinancialMarketBondDefinition["couponFrequency"],
        },
      }),
  ]),
  [
    "zero coupon numerical snapshot",
    () =>
      calculateFixedIncomeAnalytics({
        ...input,
        bond: { ...bond(), couponType: "zero_coupon", couponRateAnnual: 0 },
      }),
  ],
  [
    "negative bond yield",
    () =>
      calculateFixedIncomeAnalytics({
        ...input,
        annualYield: -0.01,
        yieldPolicy: NEGATIVE_YIELD_REFERENCE_POLICY,
      }),
  ],
  [
    "supplied clean price",
    () => calculateFixedIncomeAnalytics({ ...input, cleanPrice: "2900" }),
  ],
  [
    "zero clean price",
    () => calculateFixedIncomeAnalytics({ ...input, cleanPrice: "0" }),
  ],
  [
    "unbracketed clean price",
    () => calculateFixedIncomeAnalytics({ ...input, cleanPrice: "1" }),
  ],
  [
    "yield before quantity before date",
    () =>
      calculateFixedIncomeAnalytics({
        ...input,
        annualYield: NaN,
        faceQuantity: "0",
        settlementDate: "bad",
      }),
  ],
  [
    "quantity before date",
    () =>
      calculateFixedIncomeAnalytics({
        ...input,
        faceQuantity: "0",
        settlementDate: "bad",
      }),
  ],
  [
    "date format",
    () => calculateFixedIncomeAnalytics({ ...input, settlementDate: "bad" }),
  ],
  [
    "invalid calendar date",
    () =>
      calculateFixedIncomeAnalytics({ ...input, settlementDate: "2026-02-30" }),
  ],
  [
    "negative policy disabled",
    () =>
      calculateFixedIncomeAnalytics({
        ...input,
        annualYield: -0.01,
        yieldPolicy: {
          ...NEGATIVE_YIELD_REFERENCE_POLICY,
          negativeYieldsSupported: false,
        },
      }),
  ],
  [
    "numerically invalid yield",
    () =>
      calculateFixedIncomeAnalytics({
        ...input,
        annualYield: -4,
        yieldPolicy: { ...NEGATIVE_YIELD_REFERENCE_POLICY, minimumYield: -5 },
      }),
  ],
];
function capture(run: () => unknown): unknown {
  try {
    return { value: run() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
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

// Frozen from the unmodified public entrypoint at baseline 874355480e31eafc5b4b3b2fa4f2fbccf14db9e7.
// deno-fmt-ignore
const expected: readonly [string, unknown][] = [
  ["public runtime exports",{"value":["DEFAULT_FIXED_INCOME_CURVE_POLICY","DEFAULT_FIXED_INCOME_YIELD_POLICY","NEGATIVE_YIELD_REFERENCE_POLICY","calculateFixedIncomeAnalytics","resolveFixedIncomeYield","validateVersionedFixedIncomeCurve"]}],
  ["frozen policy objects",{"value":[true,true,true]}],
  ["tenor 1",{"value":{"riskFreeRate":0.0191343284,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.0411343284,"curveVersion":1,"interpolationKind":"extrapolated_short"}}],
  ["tenor 30",{"value":{"riskFreeRate":0.02,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.042,"curveVersion":1,"interpolationKind":"exact"}}],
  ["tenor 31",{"value":{"riskFreeRate":0.0200298507,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.0420298507,"curveVersion":1,"interpolationKind":"interpolated"}}],
  ["tenor 365",{"value":{"riskFreeRate":0.03,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.052,"curveVersion":1,"interpolationKind":"exact"}}],
  ["tenor 730",{"value":{"riskFreeRate":0.03375,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.05575,"curveVersion":1,"interpolationKind":"interpolated"}}],
  ["tenor 1825",{"value":{"riskFreeRate":0.045,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.067,"curveVersion":1,"interpolationKind":"exact"}}],
  ["tenor 3650",{"value":{"riskFreeRate":0.05,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.072,"curveVersion":1,"interpolationKind":"exact"}}],
  ["tenor 18250",{"value":{"riskFreeRate":0.09,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.112,"curveVersion":1,"interpolationKind":"extrapolated_long"}}],
  ["slope positive cap",{"value":{"riskFreeRate":0.50345,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.52545,"curveVersion":1,"interpolationKind":"extrapolated_long"}}],
  ["rate maximum clamp",{"value":{"riskFreeRate":0.6,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.622,"curveVersion":1,"interpolationKind":"extrapolated_long"}}],
  ["slope negative cap and minimum clamp",{"value":{"riskFreeRate":0,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.022,"curveVersion":1,"interpolationKind":"extrapolated_long"}}],
  ["inversion and deterministic key",{"value":{"valid":true,"errors":[],"warnings":["curve_contains_inverted_segments"],"deterministicVersionKey":"curve.northreach.nrc.analytics.v1:game.market.analytics.v1:NORTHREACH:NRC:1:2026-01-01T00:00:00.000Z:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","invertedSegmentCount":2}}],
  ["curve error sorting deduplication",{"value":{"valid":false,"errors":["curve_country_currency_mismatch","curve_currency_invalid","curve_digest_invalid","curve_event_adjustment_out_of_bounds","curve_identity_required","curve_observed_at_invalid","curve_rate_out_of_bounds","curve_tenor_order_invalid","curve_version_invalid","negative_curve_rate_disabled"],"warnings":["curve_contains_inverted_segments"],"deterministicVersionKey":"::YRETHIA:bad:0:bad:bad","invertedSegmentCount":1}}],
  ["invalid policy with invalid points",{"value":{"valid":false,"errors":["curve_policy_invalid","curve_rate_out_of_bounds","curve_tenor_order_invalid","negative_curve_rate_disabled"],"warnings":[],"deterministicVersionKey":"curve.northreach.nrc.analytics.v1:game.market.analytics.v1:NORTHREACH:NRC:1:2026-01-01T00:00:00.000Z:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","invertedSegmentCount":0}}],
  ["single point",{"value":{"valid":false,"errors":["curve_point_count_invalid"],"warnings":[],"deterministicVersionKey":"curve.northreach.nrc.analytics.v1:game.market.analytics.v1:NORTHREACH:NRC:1:2026-01-01T00:00:00.000Z:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","invertedSegmentCount":0}}],
  ["empty points",{"value":{"valid":false,"errors":["curve_point_count_invalid"],"warnings":[],"deterministicVersionKey":"curve.northreach.nrc.analytics.v1:game.market.analytics.v1:NORTHREACH:NRC:1:2026-01-01T00:00:00.000Z:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","invertedSegmentCount":0}}],
  ["129 points",{"value":{"valid":false,"errors":["curve_point_count_invalid"],"warnings":[],"deterministicVersionKey":"curve.northreach.nrc.analytics.v1:game.market.analytics.v1:NORTHREACH:NRC:1:2026-01-01T00:00:00.000Z:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","invertedSegmentCount":0}}],
  ["curve validation precedes tenor and spreads",{"error":"Invalid yield curve: curve_point_count_invalid"}],
  ["invalid tenor 0",{"error":"Requested tenor is invalid."}],
  ["invalid tenor -1",{"error":"Requested tenor is invalid."}],
  ["invalid tenor 0.5",{"error":"Requested tenor is invalid."}],
  ["invalid tenor 18251",{"error":"Requested tenor is invalid."}],
  ["invalid tenor NaN",{"error":"Requested tenor is invalid."}],
  ["invalid tenor Infinity",{"error":"Requested tenor is invalid."}],
  ["credit validation precedes liquidity",{"error":"Credit spread is invalid."}],
  ["liquidity validation precedes event",{"error":"Liquidity spread is invalid."}],
  ["nonfinite credit",{"error":"Credit spread is invalid."}],
  ["nonfinite liquidity",{"error":"Liquidity spread is invalid."}],
  ["nonfinite yield event",{"error":"Yield event adjustment is invalid."}],
  ["event bound",{"error":"Yield event adjustment is invalid."}],
  ["inclusive spread bounds",{"value":{"riskFreeRate":0.03,"creditSpread":0.5,"liquiditySpread":0.25,"eventAdjustment":0.2,"yieldRate":0.98,"curveVersion":1,"interpolationKind":"exact"}}],
  ["resolved yield bound",{"error":"Yield exceeds approved bounds."}],
  ["negative resolved yield disabled",{"error":"Yield exceeds approved bounds."}],
  ["negative resolved yield enabled",{"value":{"riskFreeRate":0.03,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.1,"yieldRate":-0.045,"curveVersion":1,"interpolationKind":"exact"}}],
  ["curve metadata adjustments not added",{"value":{"riskFreeRate":0.03,"creditSpread":0.02,"liquiditySpread":0.005,"eventAdjustment":-0.003,"yieldRate":0.052,"curveVersion":1,"interpolationKind":"exact"}}],
  ["fixed bond numerical snapshot",{"value":{"cleanPrice":"2940.788081","dirtyPrice":"3014.760731","accruedInterest":"73.97265","currentYield":0.0510067356,"yieldToMaturity":0.055,"macaulayDurationYears":3.9876198766,"modifiedDurationYears":3.8808952571,"convexity":18.2907382576,"remainingCashFlowCount":10,"maturityValue":"3000"}}],
  ["settlement 2026-07-01",{"value":{"cleanPrice":"2940.823909","dirtyPrice":"2940.823909","accruedInterest":"0","currentYield":0.0510061142,"yieldToMaturity":0.055,"macaulayDurationYears":4.0856734382,"modifiedDurationYears":3.976324514,"convexity":18.7308403763,"remainingCashFlowCount":9,"maturityValue":"3000"}}],
  ["settlement 2026-07-02",{"value":{"cleanPrice":"2940.850096","dirtyPrice":"2941.261096","accruedInterest":"0.411","currentYield":0.05100566,"yieldToMaturity":0.055,"macaulayDurationYears":4.0829337122,"modifiedDurationYears":3.9736581141,"convexity":18.7083450249,"remainingCashFlowCount":9,"maturityValue":"3000"}}],
  ["settlement 2031-01-01",{"error":"Bond has no remaining cash flows."}],
  ["frequency annual",{"value":{"cleanPrice":"2940.484161","dirtyPrice":"3014.456811","accruedInterest":"73.97265","currentYield":0.0510120075,"yieldToMaturity":0.055,"macaulayDurationYears":4.0494264287,"modifiedDurationYears":3.8383188897,"convexity":19.4434576947,"remainingCashFlowCount":5,"maturityValue":"3000"}}],
  ["frequency quarterly",{"value":{"cleanPrice":"2940.455736","dirtyPrice":"2977.441986","accruedInterest":"36.98625","currentYield":0.0510125006,"yieldToMaturity":0.055,"macaulayDurationYears":4.0092366329,"modifiedDurationYears":3.9548573444,"convexity":17.9066820633,"remainingCashFlowCount":19,"maturityValue":"3000"}}],
  ["zero coupon numerical snapshot",{"value":{"cleanPrice":"2348.869166","dirtyPrice":"2348.869166","accruedInterest":"0","currentYield":0,"yieldToMaturity":0.055,"macaulayDurationYears":4.5095890411,"modifiedDurationYears":4.3888944439,"convexity":21.3981094976,"remainingCashFlowCount":1,"maturityValue":"3000"}}],
  ["negative bond yield",{"value":{"cleanPrice":"3832.440888","dirtyPrice":"3906.413538","accruedInterest":"73.97265","currentYield":0.0391395469,"yieldToMaturity":-0.01,"macaulayDurationYears":4.071256576,"modifiedDurationYears":4.0917151518,"convexity":20.0017413138,"remainingCashFlowCount":10,"maturityValue":"3000"}}],
  ["supplied clean price",{"value":{"cleanPrice":"2900","dirtyPrice":"2973.97265","accruedInterest":"73.97265","currentYield":0.0517241379,"yieldToMaturity":0.0585151076,"macaulayDurationYears":3.9827593115,"modifiedDurationYears":3.8695458652,"convexity":18.2014932987,"remainingCashFlowCount":10,"maturityValue":"3000"}}],
  ["zero clean price",{"error":"cleanPrice must be positive."}],
  ["unbracketed clean price",{"error":"Price does not imply a yield inside approved bounds."}],
  ["yield before quantity before date",{"error":"Yield exceeds approved bounds."}],
  ["quantity before date",{"error":"faceQuantity must be positive."}],
  ["date format",{"error":"Date must use YYYY-MM-DD."}],
  ["invalid calendar date",{"error":"Date is invalid."}],
  ["negative policy disabled",{"error":"Negative yields are disabled by policy."}],
  ["numerically invalid yield",{"error":"Yield is numerically invalid."}],
];
for (const [index, [name, run]] of cases.entries()) {
  Deno.test(`fixed-income characterization: ${name}`, () => {
    const actual = JSON.stringify([name, capture(run)]);
    if (actual !== JSON.stringify(expected[index])) {
      throw new Error(`Unexpected result: ${actual}`);
    }
  });
}
