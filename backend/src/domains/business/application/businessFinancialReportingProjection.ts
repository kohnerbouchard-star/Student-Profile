import { PlayerBusinessError } from "../contracts/playerBusinessContracts.ts";

const MONEY = /^-?(?:0|[1-9][0-9]{0,37})(?:\.[0-9]{1,18})?$/u;
const CURRENCY = /^[A-Z0-9_]{3,16}$/u;
const FIELDS = {
  incomeStatement: "revenue costOfGoodsSold grossProfit payrollExpense capitalizedLabor grossReceiptsTaxExpense fundingExchangeExpense interestAndLoanFees netIncome",
  balanceSheet: "cash inventory equipment totalAssets loanPrincipal interestPayable wagesPayable taxPayable totalLiabilities openingEquity cashContributions noncashContributions currencyReallocation periodEarnings totalEquity",
  cashFlowStatement: "openingCash operating investing financing currencyExchange unclassified closingCash",
} as const;
type Row = Record<string, unknown>;
function invalid(): never {
  throw new PlayerBusinessError("business_financial_reporting_invalid", "Financial reporting returned invalid evidence.", 500);
}
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Row;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) invalid();
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function timestamp(value: unknown): string {
  const result = text(value, /^\d{4}-\d\d-\d\dT[0-9:.+Z-]+$/u);
  if (!Number.isFinite(Date.parse(result))) invalid();
  return result;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  return value;
}

// Select every public field explicitly. Money never passes through Number.
export function projectBusinessFinancialReporting(value: unknown): Row {
  const envelope = row(value);
  if (envelope.schemaVersion !== 1 || envelope.readOnly !== true || envelope.periodLimit !== 50) invalid();
  const periods = new Set<string>();
  const statements = list(envelope.statements, 50).map((raw) => {
    const statement = row(raw);
    const periodNumber = text(statement.periodNumber, /^[1-9][0-9]{0,18}$/u);
    if (periods.has(periodNumber)) invalid();
    periods.add(periodNumber);
    if (statement.schemaVersion !== 1 || statement.basis !== "accrual_at_period_due" ||
      statement.currencyPresentation !== "separate_no_fx_consolidation" || statement.laborPolicy !== "capitalize_on_canonical_completion") invalid();
    const status = text(statement.status, /^(complete|incomplete_history|unreconciled)$/u);
    const codes = new Set<string>();
    const currencies = list(statement.currencies, 100).map((rawCurrency) => {
      const currency = row(rawCurrency);
      const currencyCode = text(currency.currencyCode, CURRENCY);
      if (codes.has(currencyCode)) invalid(); codes.add(currencyCode);
      const output: Row = { currencyCode };
      for (const [section, fields] of Object.entries(FIELDS)) {
        const source = row(currency[section]);
        output[section] = Object.fromEntries(fields.split(" ").map((field) => [field, text(source[field], MONEY)]));
      }
      const reconciliation = row(currency.reconciliation);
      const count = reconciliation.unclassifiedCashEntries;
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) invalid();
      const equityDifference = text(reconciliation.equityDifference, MONEY);
      const cashDifference = text(reconciliation.cashDifference, MONEY);
      const inventoryCostKnown = bool(reconciliation.inventoryCostKnown);
      if (status === "complete" && (count !== 0 || !inventoryCostKnown ||
        !/^-?0(?:\.0+)?$/u.test(equityDifference) || !/^-?0(?:\.0+)?$/u.test(cashDifference))) invalid();
      output.reconciliation = { equityDifference, cashDifference, unclassifiedCashEntries: count, inventoryCostKnown };
      return output;
    });
    if (!currencies.length) invalid();
    return { schemaVersion: 1, basis: statement.basis, currencyPresentation: statement.currencyPresentation,
      laborPolicy: statement.laborPolicy, periodNumber, status,
      closeReceiptKey: text(statement.closeReceiptKey, /^bopr_[0-9a-f]{32}$/u),
      startedAt: timestamp(statement.startedAt), dueAt: timestamp(statement.dueAt), currencies };
  });
  return { schemaVersion: 1, businessKey: text(envelope.businessKey, /^biz_[0-9a-f]{32}$/u), readOnly: true,
    reportingCurrencyCode: text(envelope.reportingCurrencyCode, CURRENCY), periodLimit: 50,
    truncated: bool(envelope.truncated), unavailableHistoricalPeriods: bool(envelope.unavailableHistoricalPeriods), statements };
}
