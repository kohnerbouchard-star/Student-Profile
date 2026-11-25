import { projectBankingBalanceAmounts } from "./banking-balance-values.js";
import { list, object, text, number, shortDate } from "./read-model-values.js";

function transactionDescription(entry) {
  const source = text(entry.sourceAction || entry.sourceDomain, "Ledger entry");
  return source
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeBankingRead(response, currentBanking, currencyCode) {
  const body = object(response);
  const current = object(currentBanking);
  const balances = list(body.currentBalances).map((value) => {
    const balance = object(value);
    const accountKind = text(balance.accountKind || balance.accountType).toLowerCase();
    return {
      accountKey: text(balance.accountKey), accountKind, accountType: accountKind,
      ...projectBankingBalanceAmounts(balance),
      currencyCode: text(balance.currencyCode).toUpperCase()
    };
  });
  const localCurrency = text(currencyCode).toUpperCase();
  const localAccount = (kind) => balances.find((item) =>
    localCurrency && item.accountKind === kind && item.currencyCode === localCurrency);
  const checking = localAccount("checking");
  const savings = localAccount("savings");
  const page = object(body.pagination);
  const incoming = list(body.ledgerEntries).map((entry) => {
    const amount = number(entry.amount);
    const entryType = text(entry.entryType).toLowerCase();
    return {
      id: text(entry.entryKey),
      description: transactionDescription(entry),
      date: shortDate(entry.createdAt, "Recorded"),
      category: text(entry.sourceDomain, "Ledger"),
      amount: entryType === "debit" ? -Math.abs(amount) : entryType === "credit" ? Math.abs(amount) : amount,
      status: "Posted",
      accountType: text(entry.accountType),
      currencyCode: text(entry.currencyCode)
    };
  });
  const append = Boolean(text(page.cursor));
  const transactions = append ? [...list(current.transactions), ...incoming] : incoming;
  const uniqueTransactions = [...new Map(transactions.map((entry) => [entry.id, entry])).values()];
  const staleAt = text(body.staleAt);
  const staleTimestamp = Date.parse(staleAt);
  return {
    ...current,
    balances,
    checking: {
      configured: Boolean(checking),
      accountId: checking ? (checking.accountKey || "CHECKING") : "NOT CONFIGURED",
      balance: checking?.postedAmount ?? null,
      postedAmount: checking?.postedAmount ?? null,
      heldAmount: checking?.heldAmount ?? null,
      available: checking?.availableAmount ?? null,
      availableAmount: checking?.availableAmount ?? null,
      pending: checking?.heldAmount ?? null,
      currencyCode: localCurrency
    },
    savings: savings ? {
      configured: true,
      accountId: savings.accountKey || "SAVINGS",
      balance: savings.postedAmount,
      postedAmount: savings.postedAmount,
      heldAmount: savings.heldAmount,
      available: savings.availableAmount,
      availableAmount: savings.availableAmount,
      interestRate: null,
      interestEarned: null,
      currencyCode: savings.currencyCode
    } : {
      configured: false,
      accountId: "NOT CONFIGURED",
      balance: null,
      available: null,
      interestRate: null,
      interestEarned: null,
      currencyCode: ""
    },
    creditConfigured: false,
    transfersConfigured: false,
    creditScore: null,
    transferLimit: null,
    generatedAt: text(body.generatedAt),
    staleAt,
    stale: body.stale === true || (Number.isFinite(staleTimestamp) && staleTimestamp <= Date.now()),
    pagination: {
      cursor: text(page.cursor) || null,
      nextCursor: text(page.nextCursor) || null,
      hasMore: page.hasMore === true,
      limit: number(page.limit, 50)
    },
    transactions: uniqueTransactions
  };
}
