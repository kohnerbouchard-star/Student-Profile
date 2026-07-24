import {
  DEFAULT_FINANCIAL_STATEMENT_POLICY,
  validateFinancialMarketStatement,
} from "./financialStatements.ts";
import {
  assertFinancialMarketMetricsBounded,
  buildEventAdjustedFinancialStatementPolicy,
  calculateFinancialMarketStatementMetrics,
  generateBoundedFinancialMarketStatementSeries,
} from "./financialStatementAnalytics.ts";
import {
  compareMarketDecimals,
} from "./decimalMath.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("bounded statement series is deterministic and reconciles across periods", () => {
  for (let seedIndex = 0; seedIndex < 20; seedIndex += 1) {
    const input = seriesInput(`seed-${seedIndex}`, 24);
    const first = generateBoundedFinancialMarketStatementSeries(input);
    const second = generateBoundedFinancialMarketStatementSeries(input);
    assertEquals(first, second);
    assertEquals(first.activationAuthorized, false);
    assertEquals(first.statements.length, 24);
    for (let index = 0; index < first.statements.length; index += 1) {
      const statement = first.statements[index];
      const prior = index === 0 ? null : first.statements[index - 1];
      const validation = validateFinancialMarketStatement(statement, prior);
      assertEquals(validation.valid, true);
      assert(validation.checks.balanceSheetBalances);
      assert(validation.checks.cashFlowReconciles);
      assert(validation.checks.retainedEarningsReconciles);
      assert(validation.checks.debtChangeReconciles);
      if (prior) {
        assertEquals(
          statement.sharesOutstanding,
          prior.sharesOutstanding,
        );
      }
      assert(
        compareMarketDecimals(
          statement.incomeStatement.revenue,
          first.minimumRevenue,
        ) >= 0,
      );
      assert(
        compareMarketDecimals(
          statement.incomeStatement.revenue,
          first.maximumRevenue,
        ) <= 0,
      );
      assertFinancialMarketMetricsBounded(first.metrics[index]);
    }
  }
});

Deno.test("statement analytics expose all required derived metrics", () => {
  const result = generateBoundedFinancialMarketStatementSeries(
    seriesInput("metrics", 2),
  );
  const metrics = calculateFinancialMarketStatementMetrics(
    result.statements[1],
    result.statements[0],
  );
  for (const field of [
    "grossProfit",
    "totalAssets",
    "totalDebt",
    "totalLiabilities",
    "totalEquity",
    "currentAssets",
    "currentLiabilities",
    "workingCapital",
    "bookValuePerShare",
  ] as const) {
    assert(typeof metrics[field] === "string");
  }
  for (const field of [
    "revenueGrowth",
    "grossMargin",
    "operatingMargin",
    "netMargin",
    "operatingCashFlowMargin",
    "currentRatio",
    "quickRatio",
    "debtToEquity",
    "debtToAssets",
    "interestCoverage",
    "returnOnAssets",
    "returnOnEquity",
    "cashToDebt",
    "creditMetricScore",
  ] as const) {
    assert(metrics[field] === null || Number.isFinite(metrics[field]));
  }
  assert(
    metrics.creditMetricScore >= 0 && metrics.creditMetricScore <= 100,
  );
});

Deno.test("event adjustments remain bounded and reject adversarial inputs", () => {
  const adjusted = buildEventAdjustedFinancialStatementPolicy(
    DEFAULT_FINANCIAL_STATEMENT_POLICY,
    {
      revenueGrowthDelta: -0.2,
      grossMarginDelta: -0.2,
      operatingExpenseRatioDelta: 0.2,
      debtToRevenueDelta: 0.2,
      interestRateDelta: 0.2,
      distributionRateDelta: -0.2,
    },
  );
  assert(adjusted.minimumRevenueGrowth >= -0.35);
  assert(adjusted.maximumRevenueGrowth <= 0.35);
  assert(adjusted.minimumGrossMargin >= 0.05);
  assert(adjusted.maximumOperatingExpenseRatio <= 0.7);
  assert(adjusted.maximumDebtToRevenue <= 1.5);
  assert(adjusted.maximumInterestRate <= 0.4);
  assertThrows(() =>
    buildEventAdjustedFinancialStatementPolicy(
      DEFAULT_FINANCIAL_STATEMENT_POLICY,
      { revenueGrowthDelta: 0.200001 },
    )
  );
  assertThrows(() =>
    generateBoundedFinancialMarketStatementSeries({
      ...seriesInput("too-long", 1),
      periods: Array.from({ length: 121 }, (_, index) => period(index)),
    })
  );
});

Deno.test("tampered statement relationships fail closed", () => {
  const result = generateBoundedFinancialMarketStatementSeries(
    seriesInput("tamper", 2),
  );
  const prior = result.statements[0];
  const current = result.statements[1];
  const tampered = {
    ...current,
    balanceSheet: {
      ...current.balanceSheet,
      cash: "999999999999",
    },
  };
  const validation = validateFinancialMarketStatement(tampered, prior);
  assertEquals(validation.valid, false);
  assert(validation.errors.includes("balance_sheet_mismatch"));
  assert(validation.errors.includes("cash_flow_mismatch"));
});

function seriesInput(seed: string, periodCount: number) {
  return {
    gamePublicId: "game.market.analytics.v1",
    issuerPublicId: "issuer.northreach.analytics.v1",
    reportingCurrencyCode: "NRC",
    generatorVersion: "statement.analytics.v1",
    deterministicSeed: seed,
    policy: {
      ...DEFAULT_FINANCIAL_STATEMENT_POLICY,
      minimumGrossMargin: 0.5,
      maximumGrossMargin: 0.62,
      minimumOperatingExpenseRatio: 0.12,
      maximumOperatingExpenseRatio: 0.2,
      minimumDebtToRevenue: 0.3,
      maximumDebtToRevenue: 0.7,
      minimumInterestRate: 0.05,
      maximumInterestRate: 0.11,
      minimumDistributionRate: 0,
      maximumDistributionRate: 0.2,
    },
    periods: Array.from(
      { length: periodCount },
      (_, index) => period(index),
    ),
    minimumRevenueMultiple: 0.4,
    maximumRevenueMultiple: 2.5,
  } as const;
}

function period(index: number) {
  const year = 2026 + Math.floor(index / 4);
  const quarter = index % 4;
  const startMonth = quarter * 3 + 1;
  const endMonth = startMonth + 2;
  const periodStart = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(endMonth).padStart(2, "0")}-${
    endMonth === 3 || endMonth === 12 ? "31" : "30"
  }`;
  const eventAdjustment = index % 6 === 0
    ? {
      revenueGrowthDelta: -0.08,
      grossMarginDelta: -0.04,
      operatingExpenseRatioDelta: 0.03,
      debtToRevenueDelta: 0.05,
      interestRateDelta: 0.02,
    }
    : null;
  return {
    statementPublicId:
      `statement.northreach.analytics.${index + 1}.v1`,
    periodStart,
    periodEnd,
    generatedAt: `${periodEnd}T23:59:59.000Z`,
    inputDigestSha256: (index % 10).toString(16).repeat(64),
    eventAdjustment,
  } as const;
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
