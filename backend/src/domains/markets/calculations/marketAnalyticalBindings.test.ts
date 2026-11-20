import * as collective from "./collectiveInvestmentAnalytics.ts";
import * as index from "./indexMethodology.ts";
import * as statements from "./financialStatementAnalytics.ts";
import * as metrics from "./financialStatementMetrics.ts";
import * as bonds from "./bondMath.ts";
import * as calendar from "./bondCouponCalendar.ts";

declare const Deno: { test(name: string, run: () => void): void };

Deno.test("analytical public entrypoints retain moved function identities", () => {
  const pairs = [
    [collective.calculateIndexValue, index.calculateIndexValue],
    [
      collective.rebalanceIndexDeterministically,
      index.rebalanceIndexDeterministically,
    ],
    [
      statements.calculateFinancialMarketStatementMetrics,
      metrics.calculateFinancialMarketStatementMetrics,
    ],
    [
      statements.assertFinancialMarketMetricsBounded,
      metrics.assertFinancialMarketMetricsBounded,
    ],
    [bonds.generateBondCouponSchedule, calendar.generateBondCouponSchedule],
    [bonds.calculateDayCountFraction, calendar.calculateDayCountFraction],
  ];
  for (const [entrypoint, owner] of pairs) {
    if (entrypoint !== owner) {
      throw new Error("Public binding was wrapped or duplicated.");
    }
  }
});
