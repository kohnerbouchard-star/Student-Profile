export function loansFixture() {
  const key = (prefix, char) => `${prefix}_${char.repeat(32)}`;
  const due = "2026-11-10T00:00:00.000Z";
  const product = { id: key("lop", "a"), name: "Working capital", currencyCode: "NRC" };
  const window = (items) => ({ items, complete: true, hasMore: false });
  const facility = (char, status, code, balance) => ({ id: key("lon", char), status, currencyCode: code, currentProduct: product,
    originalPrincipal: "100.00", principalBalance: balance, accruedInterest: "0.00", recordedOutstanding: balance,
    lastAccruedAt: due, createdAt: due, updatedAt: due, defaultedAt: status === "defaulted" ? due : null, closedAt: status === "paid" ? due : null });
  return { configured: true, creditScore: 640, onTimeRate: 95, paymentsMade: 2, nextPayment: { amount: 3, due }, offers: [],
    activeLoans: [{ id: key("lon", "a"), name: "Working capital", status: "Active", currencyCode: "NRC", balance: 4.01, originalAmount: 100, nextPayment: 3, nextDue: due, repaidPercent: 96, accruedInterest: 0, businessId: null }],
    schedule: [{ cycle: "Wrong full term", due, amount: 999, status: "Scheduled", currencyCode: "NRC" }],
    currencyProjection: { version: 1, complete: true, unknownCurrencyRows: 0, groups: [{ currencyCode: "NRC", availableCredit: "0.00", outstanding: "4.01", nextPayment: { amount: "3.00", due }, schedule: [] }] },
    lifecycle: { version: 1, state: "available", liabilityKind: "legacy_v1",
      applications: window(["pending_review", "approved", "declined", "cancelled"].map((status, index) => ({ id: key("lna", String(index)), status, amount: "25.00", projectedPayment: "3.00", currencyCode: null, currentProduct: product, createdAt: due, updatedAt: due, reviewedAt: index ? due : null }))),
      facilities: window([facility("a", "active", "NRC", "4.01"), facility("b", "defaulted", "LUM", "99.99"), facility("c", "paid", "NRC", "0.00")]),
      payments: window(["posted", "reversed"].map((status, index) => ({ id: key("pay", String(index)), loanId: key("lon", "a"), status, currencyCode: "NRC", amount: "1.00", principalAmount: "0.80", interestAmount: "0.20", createdAt: due, appliedDueAt: due }))),
      recordedDebt: { complete: true, unknownCurrencyRows: 0, groups: [{ currencyCode: "NRC", principalBalance: "4.01", accruedInterest: "0.00", outstanding: "4.01" }, { currencyCode: "LUM", principalBalance: "99.99", accruedInterest: "0.00", outstanding: "99.99" }] } },
    repaymentForecast: { version: 1, basis: "recorded_balance", excludesUnrecordedInterest: true, facilities: [{ id: key("lon", "a"), state: "available", currencyCode: "NRC", reason: null, recordedOutstanding: "4.01", remainingAfterWindow: "0.00", installments: [{ amount: "2.00", due, status: "Projected" }, { amount: "2.01", due: "2026-11-17T00:00:00.000Z", status: "Projected" }] }] } };
}
