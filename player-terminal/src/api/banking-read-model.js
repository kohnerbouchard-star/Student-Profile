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
  const balances = list(body.currentBalances);
  const accountKind = (item) => text(item?.accountKind || item?.accountType).toLowerCase();
  const postedAmount = (item) => number(item?.postedAmount ?? item?.balance);
  const heldAmount = (item) => Math.max(0, number(item?.heldAmount ?? item?.held));
  const availableAmount = (item) => number(
    item?.availableAmount ?? item?.available,
    postedAmount(item) - heldAmount(item),
  );
  const localCurrency = text(currencyCode).toUpperCase();
  const localAccount = (kind) => balances.find((item) =>
    localCurrency && accountKind(item) === kind && text(item.currencyCode).toUpperCase() === localCurrency);
  const checking = localAccount("checking");
  const savings = localAccount("savings");
  const checkingBalance = checking ? postedAmount(checking) : null;
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
    balances: balances.map((balance) => ({
      accountKey: text(balance.accountKey),
      accountKind: accountKind(balance),
      accountType: accountKind(balance),
      postedAmount: postedAmount(balance),
      heldAmount: heldAmount(balance),
      availableAmount: availableAmount(balance),
      balance: postedAmount(balance),
      available: availableAmount(balance),
      currencyCode: text(balance.currencyCode).toUpperCase()
    })),
    checking: {
      configured: Boolean(checking),
      accountId: checking ? text(checking.accountKey || checking.accountType, "CHECKING") : "NOT CONFIGURED",
      balance: checkingBalance,
      postedAmount: checkingBalance,
      heldAmount: checking ? heldAmount(checking) : null,
      available: checking ? availableAmount(checking) : null,
      availableAmount: checking ? availableAmount(checking) : null,
      pending: checking ? heldAmount(checking) : null,
      currencyCode: localCurrency
    },
    savings: savings ? {
      configured: true,
      accountId: text(savings.accountKey || savings.accountType, "SAVINGS"),
      balance: postedAmount(savings),
      postedAmount: postedAmount(savings),
      heldAmount: heldAmount(savings),
      available: availableAmount(savings),
      availableAmount: availableAmount(savings),
      interestRate: null,
      interestEarned: null,
      currencyCode: text(savings.currencyCode).toUpperCase()
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
