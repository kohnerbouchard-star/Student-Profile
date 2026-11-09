import { projectLoanRepaymentForecast } from "../backend/src/domains/business-banking/domain/loanRepaymentForecast.ts";
import type { LoanLifecycleDto } from "../backend/src/domains/business-banking/contracts/playerBusinessBankingContracts.ts";
const equal = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const id = `lon_${"a".repeat(32)}`;
const loan = { public_key: id, loan_product_id: "internal-product", currency_code: "NRC", status: "active", principal_balance_exact: "9.00", accrued_interest_exact: "1.00", scheduled_payment_exact: "3.00", next_due_at: "2026-11-09T00:00:00.000001Z" };
const product = { id: "internal-product", payment_frequency_cycles: 2, term_cycles: 240 };
const history = (payments: unknown[] = [], row = loan): LoanLifecycleDto => ({ version: 1, state: "available", liabilityKind: "legacy_v1",
  applications: { items: [], complete: true, hasMore: false },
  facilities: { items: [{ id, status: row.status, currencyCode: row.currency_code, principalBalance: row.principal_balance_exact, accruedInterest: row.accrued_interest_exact }], complete: true, hasMore: false },
  payments: { items: payments, complete: true, hasMore: false }, recordedDebt: { complete: true, unknownCurrencyRows: 0, groups: [] },
} as unknown as LoanLifecycleDto);
const payment = { loanId: id, status: "posted", amount: "1.00", currencyCode: "NRC", appliedDueAt: loan.next_due_at };
const forecast = (row = loan, h = history([], row), p = [product]) => projectLoanRepaymentForecast([row], p, h).facilities[0];
Deno.test("caps final installment at actual recorded balance instead of repeating original term", () => {
  const result = forecast(); equal(result.installments.map((row) => row.amount), ["3.00", "3.00", "3.00", "1.00"]);
  equal(result.remainingAfterWindow, "0.00"); equal(result.recordedOutstanding, "10.00");
  equal(result.installments[1].due, "2026-11-23T00:00:00.000Z");
});
Deno.test("deducts posted current-installment payments without subtracting debt twice", () => {
  equal(forecast(loan, history([payment])).installments.map((row) => row.amount), ["2.00", "3.00", "3.00", "2.00"]);
});
Deno.test("ignores reversed, other-loan and different due allocations, preserving microseconds", () => {
  const rows = [{ ...payment, status: "reversed" }, { ...payment, loanId: `lon_${"b".repeat(32)}` }, { ...payment, appliedDueAt: "2026-11-09T00:00:00.000002Z" }];
  equal(forecast(loan, history(rows)).installments[0].amount, "3.00");
  equal(forecast(loan, history([{ ...payment, appliedDueAt: "2026-11-09T07:00:00.000001+07:00" }])).installments[0].amount, "2.00");
});
Deno.test("one-cent final payment, zero balances and long debt horizon stay bounded and exact", () => {
  equal(forecast({ ...loan, principal_balance_exact: "0.01", accrued_interest_exact: "0.00" }).installments.map((row) => row.amount), ["0.01"]);
  equal(forecast({ ...loan, principal_balance_exact: "0.00", accrued_interest_exact: "0.00" }).installments, []);
  const result = forecast({ ...loan, principal_balance_exact: "999999999999.99", accrued_interest_exact: "0.00", scheduled_payment_exact: "0.01" });
  equal(result.installments.length, 24); equal(result.remainingAfterWindow, "999999999999.75");
});
Deno.test("paid and defaulted facilities never get an active payment forecast", () => {
  equal(projectLoanRepaymentForecast([{ ...loan, status: "paid" }, { ...loan, status: "defaulted" }], [product], history()).facilities, []);
});
Deno.test("delinquent first installment retains late status", () => {
  equal(forecast({ ...loan, status: "delinquent" }).installments[0].status, "Late");
});
for (const [name, row] of Object.entries({ invalidMoney: { ...loan, principal_balance_exact: "1e2" }, zeroPayment: { ...loan, scheduled_payment_exact: "0.00" }, invalidDate: { ...loan, next_due_at: "invalid" }, missingCurrency: { ...loan, currency_code: "" } })) {
  Deno.test(`unavailable: ${name}`, () => equal(forecast(row).state, "unavailable"));
}
Deno.test("missing or changed product cadence is never guessed", () => {
  equal(forecast(loan, history(), []).state, "unavailable");
  equal(forecast(loan, history(), [{ ...product, payment_frequency_cycles: 0 }]).state, "unavailable");
});
Deno.test("unavailable, incomplete and unallocated history cannot claim a forecast", () => {
  equal(forecast(loan, { version: 1, state: "unavailable" }).state, "unavailable");
  const partial = history() as Extract<LoanLifecycleDto, { state: "available" }>;
  equal(forecast(loan, { ...partial, payments: { ...partial.payments, complete: false, hasMore: true } }).state, "unavailable");
  equal(forecast(loan, history([{ ...payment, appliedDueAt: null }])).state, "unavailable");
});
Deno.test("inconsistent reads fail closed rather than advancing a due date or showing stale debt", () => {
  equal(forecast(loan, history([{ ...payment, amount: "3.00" }])).state, "unavailable");
  equal(forecast(loan, history([], { ...loan, principal_balance_exact: "8.00" })).state, "unavailable");
});
Deno.test("declares recorded-balance assumptions and does not expose internal keys", () => {
  const result = projectLoanRepaymentForecast([loan], [product], history());
  equal([result.basis, result.excludesUnrecordedInterest], ["recorded_balance", true]);
  equal(JSON.stringify(result).includes("internal-product"), false);
});
