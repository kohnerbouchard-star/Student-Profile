import {
  LOAN_LIFECYCLE_LIMIT,
  LOAN_LIFECYCLE_SCOPE,
  type LoanCurrencyProjectionDto,
  type LoanLifecycleDto,
  type LoanRecordWindowDto,
} from "../contracts/playerBusinessBankingContracts.ts";

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

// Normalize whole seconds with Date; preserve PostgreSQL's microseconds outside Date.
const instant = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match =
    /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u
      .exec(value);
  if (!match) return null;
  const time = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().replace(
    "000Z",
    `${(match[2] ?? "").padEnd(6, "0")}Z`,
  );
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
    const due = instant(row.next_due_at);
    if (due === null) {
      complete = false;
      target.invalidDue = true;
      continue;
    }
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
        : {
          amount: format(row.next),
          due: row.due?.replace(/000Z$/u, "Z") ?? null,
        },
      schedule: [...row.schedule].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([due, value]) => ({ due, amount: format(value) })),
    })),
  };
}


// These are recorded amounts. This projection neither accrues interest nor quotes payoff.
export function projectLoanLifecycle(input: {
  readonly applications: readonly Row[];
  readonly facilities: readonly Row[];
  readonly payments: readonly Row[];
  readonly products: readonly Row[];
  readonly paymentLoans: readonly Row[];
  readonly applicationCount: number | null;
  readonly facilityCount: number | null;
  readonly paymentCount: number | null;
}): LoanLifecycleDto {
  type Invalid = () => void;
  const key = (value: unknown, prefix: string) => typeof value === "string" &&
      new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(value) ? value : null;
  const currency = (value: unknown) => typeof value === "string" &&
      /^[A-Z][A-Z0-9]{2,15}$/u.test(value) ? value : null;
  const cents = (value: unknown, invalid: Invalid): Amount => {
    if (typeof value === "string" && /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u.test(value)) {
      return BigInt(value.replace(".", ""));
    }
    invalid();
    return null;
  };
  const date = (value: unknown, invalid: Invalid, optional = false) => {
    if (optional && value == null) return null;
    const result = instant(value);
    if (result === null) invalid();
    return result;
  };
  const products = new Map(input.products.map((row) => [row.id, row]));
  const product = (id: unknown, invalid: Invalid) => {
    const row = products.get(id);
    const publicKey = key(row?.public_key, "lop");
    if (!row || !publicKey) { invalid(); return null; }
    const code = currency(row.currency_code);
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 160) : null;
    if (!code || !name) invalid();
    return { id: publicKey, name, currencyCode: code };
  };
  const countMatches = (source: readonly Row[], count: number | null) =>
    count !== null && Number.isSafeInteger(count) && count >= 0 &&
    source.length === Math.min(count, LOAN_LIFECYCLE_LIMIT + 1);
  const window = <T>(source: readonly Row[], count: number | null,
    project: (row: Row, invalid: Invalid) => T | null): LoanRecordWindowDto<T> => {
    let valid = countMatches(source, count);
    const invalid = () => { valid = false; };
    const seen = new Set<unknown>();
    const items: T[] = [];
    for (const row of source.slice(0, LOAN_LIFECYCLE_LIMIT)) {
      if (seen.has(row.public_key)) { invalid(); continue; }
      seen.add(row.public_key);
      const item = project(row, invalid);
      if (item === null) invalid();
      else items.push(item);
    }
    const hasMore = source.length > LOAN_LIFECYCLE_LIMIT ? true :
      count !== null && Number.isSafeInteger(count) && count >= 0 ? count > LOAN_LIFECYCLE_LIMIT : null;
    return { items, hasMore, complete: valid && hasMore === false };
  };
  const applications = window(input.applications, input.applicationCount, (row, invalid) => {
    const id = key(row.public_key, "lna");
    const status = String(row.status);
    if (!id || row.liability_kind !== LOAN_LIFECYCLE_SCOPE ||
      !["pending_review", "approved", "declined", "cancelled"].includes(status)) return null;
    return { id, status, amount: format(cents(row.amount_exact, invalid)),
      projectedPayment: format(cents(row.projected_payment_exact, invalid)),
      currencyCode: null, currentProduct: product(row.loan_product_id, invalid),
      createdAt: date(row.created_at, invalid), updatedAt: date(row.updated_at, invalid),
      reviewedAt: date(row.reviewed_at, invalid, true) };
  });
  let debtComplete = countMatches(input.facilities, input.facilityCount) &&
    input.facilities.length <= LOAN_LIFECYCLE_LIMIT;
  let unknownCurrencyRows = 0;
  const debt = new Map<string, { principal: bigint; interest: bigint }>();
  const facilities = window(input.facilities, input.facilityCount, (row, invalid) => {
    const invalidDebt = () => { debtComplete = false; invalid(); };
    const id = key(row.public_key, "lon");
    const status = String(row.status);
    if (!id || row.liability_kind !== LOAN_LIFECYCLE_SCOPE ||
      !["active", "delinquent", "restructured", "defaulted", "paid"].includes(status)) {
      invalidDebt(); return null;
    }
    const code = currency(row.currency_code);
    if (!code) { unknownCurrencyRows++; invalidDebt(); }
    const principal = cents(row.principal_balance_exact, invalidDebt);
    const interest = cents(row.accrued_interest_exact, invalidDebt);
    const outstanding = add(principal, interest);
    if (status === "paid" && outstanding !== 0n) invalidDebt();
    if (code && principal !== null && interest !== null) {
      const total = debt.get(code) ?? { principal: 0n, interest: 0n };
      debt.set(code, { principal: total.principal + principal, interest: total.interest + interest });
    }
    return { id, status, currencyCode: code, currentProduct: product(row.loan_product_id, invalid),
      originalPrincipal: format(cents(row.original_principal_exact, invalid)),
      principalBalance: format(principal), accruedInterest: format(interest), recordedOutstanding: format(outstanding),
      lastAccruedAt: date(row.last_accrued_at, invalid), createdAt: date(row.created_at, invalid),
      updatedAt: date(row.updated_at, invalid), defaultedAt: date(row.defaulted_at, invalid, true),
      closedAt: date(row.closed_at, invalid, true) };
  });
  // Duplicate/malformed facility records cannot support a total-debt claim.
  if (facilities.items.length !== Math.min(input.facilities.length, LOAN_LIFECYCLE_LIMIT)) debtComplete = false;
  const paymentLoans = new Map(input.paymentLoans.map((row) => [row.id, row]));
  const payments = window(input.payments, input.paymentCount, (row, invalid) => {
    const id = key(row.public_key, "pay");
    const loan = paymentLoans.get(row.loan_id);
    const loanId = key(loan?.public_key, "lon");
    const status = String(row.status);
    if (!id || !loanId || loan?.liability_kind !== LOAN_LIFECYCLE_SCOPE ||
      !["posted", "reversed"].includes(status)) return null;
    const code = currency(loan.currency_code);
    if (!code) invalid();
    const amount = cents(row.amount_exact, invalid);
    const principal = cents(row.principal_amount_exact, invalid);
    const interest = cents(row.interest_amount_exact, invalid);
    if (amount !== add(principal, interest)) invalid();
    return { id, loanId, status, currencyCode: code, amount: format(amount),
      principalAmount: format(principal), interestAmount: format(interest),
      createdAt: date(row.created_at, invalid), appliedDueAt: date(row.applied_due_at, invalid, true) };
  });
  return { version: 1, state: "available", liabilityKind: LOAN_LIFECYCLE_SCOPE,
    applications, facilities, payments, recordedDebt: { complete: debtComplete, unknownCurrencyRows,
      groups: [...debt].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, total]) => ({ currencyCode,
        principalBalance: debtComplete ? format(total.principal) : null,
        accruedInterest: debtComplete ? format(total.interest) : null,
        outstanding: debtComplete ? format(total.principal + total.interest) : null })) } };
}
