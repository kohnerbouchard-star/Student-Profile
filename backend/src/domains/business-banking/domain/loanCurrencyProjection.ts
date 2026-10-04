import type { LoanCurrencyProjectionDto } from "../contracts/playerBusinessBankingContracts.ts";

type Row = Readonly<Record<string, unknown>>;
export type LoanCurrencyScheduleInput = {
  currencyCode: string | null;
  due: string;
  exactAmount: unknown;
};
type Amount = bigint | null;
const add = (a: Amount, b: Amount): Amount =>
  a === null || b === null ? null : a + b;
const format = (value: Amount): string | null => {
  if (value === null) return null;
  const digits = value.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
};

// The loan columns are numeric(14,2); accept their text casts, never rounded JS numbers.
export function projectLoanCurrencies(
  offers: readonly Row[],
  loans: readonly Row[],
  schedule: readonly LoanCurrencyScheduleInput[],
): LoanCurrencyProjectionDto {
  let complete = true;
  let unknownCurrencyRows = 0;
  const amount = (value: unknown): Amount => {
    if (
      typeof value === "string" &&
      /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u.test(value)
    ) {
      return BigInt(value.replace(".", ""));
    }
    complete = false;
    return null;
  };
  const groups = new Map<
    string,
    {
      credit: Amount;
      debt: Amount;
      next: Amount;
      due: string | null;
      hasLoans: boolean;
      invalidDue: boolean;
      schedule: Map<string, Amount>;
    }
  >();
  const group = (value: unknown) => {
    const currency = typeof value === "string" ? value.trim() : "";
    if (!currency) {
      complete = false;
      unknownCurrencyRows++;
      return null;
    }
    if (!groups.has(currency)) {
      groups.set(currency, {
        credit: 0n,
        debt: 0n,
        next: 0n,
        due: null,
        hasLoans: false,
        invalidDue: false,
        schedule: new Map(),
      });
    }
    return groups.get(currency)!;
  };
  for (const row of offers) {
    const target = group(row.currency_code);
    if (target) {
      target.credit = add(target.credit, amount(row.maximum_amount_exact));
    }
  }
  for (const row of loans) {
    const target = group(row.currency_code);
    if (!target) continue;
    target.hasLoans = true;
    target.debt = add(
      target.debt,
      add(
        amount(row.principal_balance_exact),
        amount(row.accrued_interest_exact),
      ),
    );
    const payment = amount(row.scheduled_payment_exact);
    const time = typeof row.next_due_at === "string"
      ? Date.parse(row.next_due_at)
      : NaN;
    if (!Number.isFinite(time)) {
      complete = false;
      target.invalidDue = true;
      continue;
    }
    const due = new Date(time).toISOString();
    if (target.due === null || due < target.due) {
      target.due = due;
      target.next = payment;
    } else if (due === target.due) target.next = add(target.next, payment);
  }
  for (const row of schedule) {
    // Unknown currencies were counted once per source row above, not per installment.
    const target = row.currencyCode ? groups.get(row.currencyCode) : undefined;
    if (target) {
      target.schedule.set(
        row.due,
        add(
          target.schedule.has(row.due) ? target.schedule.get(row.due)! : 0n,
          amount(row.exactAmount),
        ),
      );
    }
  }
  return {
    version: 1,
    complete,
    unknownCurrencyRows,
    groups: [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map((
      [currencyCode, row],
    ) => ({
      currencyCode,
      availableCredit: format(row.credit),
      outstanding: format(row.debt),
      nextPayment: !row.hasLoans
        ? null
        : row.invalidDue
        ? { amount: null, due: null }
        : { amount: format(row.next), due: row.due },
      schedule: [...row.schedule].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([due, value]) => ({ due, amount: format(value) })),
    })),
  };
}
