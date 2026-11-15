import {
  calculateBondHoldingCashFlow,
  calculateDayCountFraction,
  generateBondCouponSchedule,
  valueBond,
} from "./bondMath.ts";
import type { FinancialMarketBondDefinition } from "../contracts/financialMarketContracts.ts";
import {
  calculateIndexValue,
  rebalanceIndexDeterministically,
} from "./collectiveInvestmentAnalytics.ts";
import {
  assertFinancialMarketMetricsBounded,
  buildEventAdjustedFinancialStatementPolicy,
  calculateFinancialMarketStatementMetrics,
  generateBoundedFinancialMarketStatementSeries,
} from "./financialStatementAnalytics.ts";
import {
  DEFAULT_FINANCIAL_STATEMENT_POLICY,
  generateFinancialMarketStatement,
} from "./financialStatements.ts";
declare const Deno: { test(name: string, run: () => void): void };

for (
  const [convention, expected] of [["actual_360", 1.016666666667], [
    "actual_365",
    1.002739726027,
  ], ["thirty_360", 1]] as const
) {
  Deno.test(`analytical extraction: leap year ${convention}`, () =>
    equal(
      calculateDayCountFraction("2024-01-01", "2025-01-01", convention),
      expected,
    ));
}
for (
  const [date, message] of [["2026-02-30", "startDate is not a valid date."], [
    "2026-2-01",
    "startDate must use YYYY-MM-DD.",
  ]]
) {
  Deno.test(`analytical extraction: date error ${date}`, () =>
    error(
      () => calculateDayCountFraction(date, "2026-03-01", "actual_365"),
      message,
    ));
}
Deno.test("analytical extraction: clamped coupon dates remain backwards generated", () => {
  const schedule = generateBondCouponSchedule({
    ...baseBond(),
    issueDate: "2023-08-31",
    settlementDate: "2023-09-01",
    maturityDate: "2024-08-31",
  });
  equal(
    schedule.map((row) => row.paymentDate),
    ["2023-08-29", "2024-02-29", "2024-08-31"].filter((date) =>
      date > "2023-08-31"
    ),
  );
  equal(schedule[0].accrualStartDate, "2023-08-31");
});
Deno.test("analytical extraction: schedule validation precedes yield and quantity", () => {
  error(
    () =>
      valueBond({
        bond: { ...baseBond(), issueDate: "bad" },
        settlementDate: "bad",
        faceQuantity: "0",
        annualYield: -1,
      }),
    "issueDate must use YYYY-MM-DD.",
  );
});
Deno.test("analytical extraction: final holding flow ordering and amounts", () => {
  const bond = baseBond();
  const scheduleEntry = generateBondCouponSchedule(bond).at(-1)!;
  const flows = calculateBondHoldingCashFlow({
    bond,
    scheduleEntry,
    faceQuantity: "2",
    gamePublicId: "g",
    playerPublicId: "p",
    releaseVersion: "v",
  });
  equal(flows.map((row) => row.kind), ["coupon", "maturity"]);
  equal(flows[1].amount, "2000");
  equal(
    flows[1].idempotencyKey,
    `bond-cash-flow|g|p|${scheduleEntry.couponSchedulePublicId}|maturity|v`,
  );
});
const methodology = {
  indexPublicId: "index.test.v1",
  weightingMethod: "equal_weight" as const,
  baseDate: "2026-01-01",
  baseValue: "100",
  divisor: "0.5",
  maximumConstituentWeight: 0.5,
  minimumConstituents: 2,
  maximumConstituents: 2,
  methodologyVersion: "v1",
};
function component(id: string, price: string) {
  return {
    componentPublicId: id,
    currentPrice: price,
    basePrice: "1",
    marketCapitalization: "10",
    floatFactor: 1,
    fundamentalScore: 1,
    targetWeight: 0.5,
    eligible: true,
    suspended: false,
    delisted: false,
  };
}
Deno.test("analytical extraction: index sorting, filtering and input immutability", () => {
  const components = [component("b", "30"), component("a", "10"), {
    ...component("c", "bad"),
    suspended: true,
  }];
  const before = JSON.stringify(components);
  const result = calculateIndexValue(methodology, components);
  equal(result.value, "40");
  equal(result.constituentWeights, { a: 0.5, b: 0.5 });
  equal(result.constituentPublicIds, ["a", "b"]);
  equal(JSON.stringify(components), before);
});
Deno.test("analytical extraction: rebalance tie ordering and null continuity", () => {
  const candidates = [
    component("c", "30"),
    component("b", "20"),
    component("a", "10"),
  ];
  const result = rebalanceIndexDeterministically({
    methodology,
    candidates,
    effectiveAt: "2026-01-01T00:00:00Z",
  });
  equal(result.selected.map((row) => row.componentPublicId), ["a", "b"]);
  equal(result.continuityValueBefore, null);
  equal(result.continuityValueAfter, null);
  equal(result.addedComponentPublicIds, ["a", "b"]);
});
Deno.test("analytical extraction: methodology validation precedes constituent count", () =>
  error(
    () => calculateIndexValue({ ...methodology, indexPublicId: "" }, []),
    "Index identity and methodology version are required.",
  ));
Deno.test("analytical extraction: duplicate index component exact error", () =>
  error(
    () =>
      calculateIndexValue(methodology, [
        component("a", "1"),
        component("a", "1"),
      ]),
    "Index component is duplicated.",
  ));
for (
  const key of [
    "revenueGrowthDelta",
    "grossMarginDelta",
    "operatingExpenseRatioDelta",
    "debtToRevenueDelta",
    "interestRateDelta",
    "distributionRateDelta",
  ] as const
) {
  for (const value of [0.200001, -0.200001, NaN]) {
    Deno.test(`analytical extraction: event ${key} rejects ${value}`, () =>
      error(
        () =>
          buildEventAdjustedFinancialStatementPolicy(
            DEFAULT_FINANCIAL_STATEMENT_POLICY,
            { [key]: value },
          ),
        `${key} exceeds the bounded event-adjustment range.`,
      ));
  }
}
Deno.test("analytical extraction: inverted growth intersection collapses at bounded midpoint", () => {
  const result = buildEventAdjustedFinancialStatementPolicy(
    DEFAULT_FINANCIAL_STATEMENT_POLICY,
    null,
    { minimum: 0.3, maximum: -0.3 },
  );
  equal(result.minimumRevenueGrowth, 0);
  equal(result.maximumRevenueGrowth, 0);
});
Deno.test("analytical extraction: empty series check precedes invalid revenue bounds", () =>
  error(() =>
    generateBoundedFinancialMarketStatementSeries({
      gamePublicId: "g",
      issuerPublicId: "i",
      reportingCurrencyCode: "NRC",
      generatorVersion: "v1",
      deterministicSeed: "seed",
      policy: DEFAULT_FINANCIAL_STATEMENT_POLICY,
      periods: [],
      minimumRevenueMultiple: -1,
    }), "Statement series must contain 1-120 periods."));
Deno.test("analytical extraction: zero denominators and metric error precedence", () => {
  const statement = generateFinancialMarketStatement({
    statementPublicId: "statement.test.v1",
    gamePublicId: "game.test.v1",
    issuerPublicId: "issuer.test.v1",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    reportingCurrencyCode: "NRC",
    generatorVersion: "v1",
    inputDigestSha256: "a".repeat(64),
    generatedAt: "2026-04-01T00:00:00Z",
    deterministicSeed: "seed",
    policy: DEFAULT_FINANCIAL_STATEMENT_POLICY,
  });
  const zero = {
    ...statement,
    sharesOutstanding: "0",
    incomeStatement: Object.fromEntries(
      Object.keys(statement.incomeStatement).map((key) => [key, "0"]),
    ) as unknown as typeof statement.incomeStatement,
    balanceSheet: Object.fromEntries(
      Object.keys(statement.balanceSheet).map((key) => [key, "0"]),
    ) as unknown as typeof statement.balanceSheet,
    cashFlowStatement: Object.fromEntries(
      Object.keys(statement.cashFlowStatement).map((key) => [key, "0"]),
    ) as unknown as typeof statement.cashFlowStatement,
  };
  const metrics = calculateFinancialMarketStatementMetrics(zero, zero);
  equal(metrics.bookValuePerShare, "0");
  equal(metrics.revenueGrowth, 0);
  equal(metrics.currentRatio, 99);
  equal(metrics.interestCoverage, 99);
  equal(metrics.debtToAssets, 0);
  assertFinancialMarketMetricsBounded(metrics);
  error(
    () =>
      assertFinancialMarketMetricsBounded({
        ...metrics,
        grossMargin: 3,
        currentRatio: -1,
        creditMetricScore: 101,
      }),
    "Statement ratio exceeded the bounded analytics range.",
  );
  error(
    () =>
      assertFinancialMarketMetricsBounded({
        ...metrics,
        currentRatio: -1,
        creditMetricScore: 101,
      }),
    "Statement non-negative credit metric exceeded the bounded range.",
  );
  error(
    () =>
      assertFinancialMarketMetricsBounded({
        ...metrics,
        debtToEquity: 100,
        creditMetricScore: 101,
      }),
    "Statement signed credit metric exceeded the bounded range.",
  );
  error(
    () =>
      assertFinancialMarketMetricsBounded({
        ...metrics,
        creditMetricScore: 101,
      }),
    "Statement credit score exceeded 0-100.",
  );
});
function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}
function error(run: () => unknown, expected: string): void {
  try {
    run();
  } catch (e) {
    equal((e as Error).message, expected);
    return;
  }
  throw new Error(`Expected error: ${expected}`);
}
function baseBond(): FinancialMarketBondDefinition {
  return {
    bondPublicId: "bond.northreach.corporate.0001.v1",
    instrumentPublicId: "instrument.northreach.corporate_bond.0001.v1",
    issuerPublicId: "issuer.northreach.corporate.0001.v1",
    bondKind: "corporate",
    issueDate: "2026-01-01",
    settlementDate: "2026-01-03",
    maturityDate: "2028-01-01",
    faceValue: "1000",
    denominationCurrencyCode: "NRC",
    couponType: "fixed",
    couponRateAnnual: 0.06,
    couponFrequency: "semiannual",
    dayCountConvention: "actual_365",
    businessDayConvention: "following",
    creditRating: "A",
    callable: false,
    callSchedulePublicId: null,
    recoveryPolicyPublicId: "recovery.standard.corporate.v1",
    status: "approved_inactive",
    sourceVersion: "market-universe.1.0.0-draft",
    sourceChecksumSha256: "c".repeat(64),
  };
}
