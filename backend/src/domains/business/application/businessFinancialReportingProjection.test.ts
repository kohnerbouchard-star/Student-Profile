import { projectBusinessFinancialReporting } from "./businessFinancialReportingProjection.ts";
declare const Deno: { test(name: string, run: () => void): void };
function assert(value: unknown): asserts value { if (!value) throw new Error("Assertion failed"); }
function rejects(value: unknown) {
  let failed = false;
  try { projectBusinessFinancialReporting(value); } catch { failed = true; }
  assert(failed);
}
function fixture() {
  const exact = "9007199254740993.123456789123456789";
  return { schemaVersion: 1, readOnly: true, businessKey: `biz_${"a".repeat(32)}`, reportingCurrencyCode: "ECO",
    periodLimit: 50, truncated: false, unavailableHistoricalPeriods: false, private: "SECRET",
    statements: [{ schemaVersion: 1, basis: "accrual_at_period_due", currencyPresentation: "separate_no_fx_consolidation",
      laborPolicy: "capitalize_on_canonical_completion", periodNumber: "9007199254740993", status: "complete",
      closeReceiptKey: `bopr_${"b".repeat(32)}`, startedAt: "2026-09-01T00:00:00+00:00", dueAt: "2026-09-08T00:00:00+00:00",
      currencies: [{ currencyCode: "ECO", metadata: "SECRET",
        incomeStatement: { revenue: exact, costOfGoodsSold: "2", grossProfit: "9007199254740991.123456789123456789",
          payrollExpense: "0", capitalizedLabor: "0", grossReceiptsTaxExpense: "0", fundingExchangeExpense: "0", interestAndLoanFees: "0", netIncome: exact },
        balanceSheet: { cash: exact, inventory: "0", equipment: "0", totalAssets: exact, loanPrincipal: "0", interestPayable: "0",
          wagesPayable: "0", taxPayable: "0", totalLiabilities: "0", openingEquity: "0", cashContributions: "0", noncashContributions: "0",
          currencyReallocation: "0", periodEarnings: exact, totalEquity: exact },
        cashFlowStatement: { openingCash: "0", operating: exact, investing: "0", financing: "0", currencyExchange: "0", unclassified: "0", closingCash: exact },
        reconciliation: { equityDifference: "0.000000000000000000", cashDifference: "0", unclassifiedCashEntries: 0, inventoryCostKnown: true },
      }],
    }],
  };
}
Deno.test("financial reporting preserves decimal strings and projects only public fields", () => {
  const result = projectBusinessFinancialReporting(fixture());
  const serialized = JSON.stringify(result);
  assert(serialized.includes('"9007199254740993.123456789123456789"'));
  assert(!serialized.includes("SECRET") && !serialized.includes("metadata"));
  assert(projectBusinessFinancialReporting({ ...fixture(), statements: [] }).readOnly === true);
});
Deno.test("financial reporting rejects false complete, duplicate scope and unsafe precision", () => {
  const mismatch = fixture(); mismatch.statements[0].currencies[0].reconciliation.equityDifference = "0.01"; rejects(mismatch);
  const unknown = fixture(); unknown.statements[0].currencies[0].reconciliation.unclassifiedCashEntries = 1; rejects(unknown);
  const duplicate = fixture(); duplicate.statements.push(duplicate.statements[0]); rejects(duplicate);
  const currency = fixture(); currency.statements[0].currencies.push(currency.statements[0].currencies[0]); rejects(currency);
  const uuid = fixture(); uuid.businessKey = "10000000-0000-4000-8000-000000000001"; rejects(uuid);
  const numeric = fixture() as any; numeric.statements[0].currencies[0].incomeStatement.revenue = 9007199254740993; rejects(numeric);
  const overlong = fixture(); overlong.statements = Array.from({ length: 51 }, () => overlong.statements[0]); rejects(overlong);
});
