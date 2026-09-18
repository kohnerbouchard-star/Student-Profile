import assert from "node:assert/strict";
import test from "node:test";
import { renderBusinessFinancialReporting } from "../player-terminal/src/pages/business-financial-reporting.js";

test("reporting shows exact decimals, separate currencies and incomplete evidence", () => {
  const exact = "9007199254740993.123456789123456789";
  const html = renderBusinessFinancialReporting({ truncated: true, unavailableHistoricalPeriods: true, statements: [{
    periodNumber: "9007199254740993", dueAt: "2026-09-08T00:00:00Z", status: "unreconciled",
    currencies: ["ECO", "NRC"].map((currencyCode) => ({ currencyCode,
      incomeStatement: { revenue: exact, netIncome: "-1.000000000000000001" }, balanceSheet: { cash: exact },
      cashFlowStatement: { operating: exact }, reconciliation: { equityDifference: "0.01", cashDifference: "0" } })),
  }] });
  assert.ok(html.includes(exact));
  for (const label of ["Income statement · ECO", "Income statement · NRC", "Balance sheet", "Cash flow statement", "Reconciliation required", "latest 50", "Earlier periods", 'scope="row"']) assert.ok(html.includes(label), label);
});
test("reporting distinguishes empty, stale and unavailable data", () => {
  assert.match(renderBusinessFinancialReporting(null), /unavailable/);
  assert.match(renderBusinessFinancialReporting({ statements: [] }), /No closed-period/);
  assert.match(renderBusinessFinancialReporting({ statements: [] }, "stale"), /unavailable/);
});
