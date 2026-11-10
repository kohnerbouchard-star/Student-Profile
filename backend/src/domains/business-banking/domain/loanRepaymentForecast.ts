import type { LoanLifecycleDto, LoanRepaymentForecastDto } from "../contracts/playerBusinessBankingContracts.ts";

type Row = Readonly<Record<string, unknown>>;
const cents = (value: unknown): bigint | null => typeof value === "string" &&
  /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u.test(value) ? BigInt(value.replace(".", "")) : null;
const money = (value: bigint) => {
  const digits = value.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
};
const instant = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}${match[3]}`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().replace("000Z", `${(match[2] ?? "").padEnd(6, "0")}Z`) : null;
};
const time = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

// A bounded allocation of stored debt, not accrual, a payoff quote, or a new payment rule.
// The repayment RPC applies posted payments to applied_due_at, interest first, and
// advances that due date only when scheduled_payment is satisfied (20260812113000).
export function projectLoanRepaymentForecast(
  loans: readonly Row[], products: readonly Row[], lifecycle: LoanLifecycleDto,
): LoanRepaymentForecastDto {
  const productById = new Map(products.map((row) => [row.id, row]));
  return { version: 1, basis: "recorded_balance", excludesUnrecordedInterest: true,
    facilities: loans.filter((row) => ["active", "delinquent", "restructured"].includes(String(row.status)))
      .filter((row) => typeof row.public_key === "string" && /^lon_[0-9a-f]{32}$/u.test(row.public_key))
      .map((row) => {
        const id = String(row.public_key);
        const currencyCode = typeof row.currency_code === "string" && /^[A-Z][A-Z0-9]{2,15}$/u.test(row.currency_code)
          ? row.currency_code : null;
        const unavailable = (reason: string) => ({ id, state: "unavailable" as const, currencyCode, reason,
          recordedOutstanding: null, remainingAfterWindow: null, installments: [] });
        const principal = cents(row.principal_balance_exact);
        const interest = cents(row.accrued_interest_exact);
        const scheduled = cents(row.scheduled_payment_exact);
        const due = time(row.next_due_at);
        const dueIdentity = instant(row.next_due_at);
        const frequency = productById.get(row.loan_product_id)?.payment_frequency_cycles;
        if (!currencyCode || principal === null || interest === null || scheduled === null || scheduled <= 0n || due === null || dueIdentity === null)
          return unavailable("Recorded balance or payment terms unavailable");
        if (!Number.isSafeInteger(frequency) || Number(frequency) < 1 || Number(frequency) > 240)
          return unavailable("Payment cadence unavailable");
        // A truncated history cannot prove how much of the current installment was paid.
        if (lifecycle.state !== "available" || !lifecycle.payments.complete)
          return unavailable("Complete payment allocation history unavailable");
        const recorded = lifecycle.facilities.items.find((item) => item.id === id);
        if (!recorded || recorded.status !== row.status || recorded.currencyCode !== currencyCode ||
          cents(recorded.principalBalance) !== principal || cents(recorded.accruedInterest) !== interest)
          return unavailable("Facility changed or recorded balance unavailable; refresh Loans");
        let paid = 0n;
        for (const payment of lifecycle.payments.items) {
          if (payment.loanId !== id || payment.status !== "posted") continue;
          if (payment.appliedDueAt === null) return unavailable("Payment allocation unavailable");
          if (instant(payment.appliedDueAt) !== dueIdentity) continue;
          const amount = cents(payment.amount);
          if (amount === null || payment.currencyCode !== currencyCode) return unavailable("Payment allocation unavailable");
          paid += amount;
        }
        const outstanding = principal + interest;
        // Separate reads are not atomic. Do not invent an advancement during a payment race.
        if (paid >= scheduled && outstanding > 0n) return unavailable("Payment changed; refresh for the updated due date");
        let remaining = outstanding;
        const installments: { due: string; amount: string; status: "Late" | "Projected" }[] = [];
        for (let index = 0; index < 24 && remaining > 0n; index++) {
          const requested = index === 0 ? scheduled - paid : scheduled;
          const amount = requested < remaining ? requested : remaining;
          const date = new Date(due + index * Number(frequency) * 7 * 86_400_000);
          if (!Number.isFinite(date.getTime())) return unavailable("Payment date unavailable");
          installments.push({ due: date.toISOString(), amount: money(amount),
            status: index === 0 && row.status === "delinquent" ? "Late" : "Projected" });
          remaining -= amount;
        }
        return { id, state: "available" as const, currencyCode, reason: null,
          recordedOutstanding: money(outstanding), remainingAfterWindow: money(remaining), installments };
      }),
  };
}
