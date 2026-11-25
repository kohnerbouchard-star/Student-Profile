function currencyCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{3,16}$/.test(normalized) ? normalized : "";
}

export function explicitSessionCurrency(rawSession) {
  const player = rawSession?.player && typeof rawSession.player === "object"
    ? rawSession.player
    : {};
  const country = player.country && typeof player.country === "object"
    ? player.country
    : {};
  for (const value of [
    rawSession?.countryCurrencyCode,
    rawSession?.localCurrencyCode,
    player.countryCurrencyCode,
    player.localCurrencyCode,
    player.currencyCode,
    country.currencyCode,
  ]) {
    const code = currencyCode(value);
    if (code) return code;
  }
  const checkingCurrencies = [...new Set(
    (Array.isArray(rawSession?.balances) ? rawSession.balances : [])
      .filter((row) => String(row?.accountType || "").trim().toLowerCase() === "checking")
      .map((row) => currencyCode(row?.currencyCode))
      .filter(Boolean),
  )];
  return checkingCurrencies.length === 1 ? checkingCurrencies[0] : "";
}

export function dashboardCurrency(rawDashboard) {
  return currencyCode(
    rawDashboard?.me?.netWorthValuation?.currencyCode ||
    rawDashboard?.me?.cash?.primaryCurrencyCode,
  );
}

export function bindSessionCurrency(snapshot, code) {
  const resolved = currencyCode(code);
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      currencyCode: resolved,
      currencyName: resolved || "Unavailable",
      currencyResolved: Boolean(resolved),
    },
  };
}

function accountBalanceForCurrency(balances, accountType, preferredCurrencyCode) {
  const type = String(accountType || "").trim().toLowerCase();
  const preferred = currencyCode(preferredCurrencyCode);
  const rows = (Array.isArray(balances) ? balances : []).filter((row) =>
    String(row?.accountKind || row?.accountType || "").trim().toLowerCase() === type
  );
  if (preferred) {
    return rows.find((row) => currencyCode(row?.currencyCode) === preferred) || null;
  }
  return rows.length === 1 ? rows[0] : null;
}

export function bindBankingCurrency(snapshot) {
  const preferredCurrencyCode = snapshot.session?.currencyResolved === true
    ? currencyCode(snapshot.session.currencyCode)
    : "";
  // The ledger has already reconciled posted, held and available amounts.
  // Resolve currency/account without recalculating or overriding that snapshot.
  const balances = snapshot.banking?.balances;
  const checking = accountBalanceForCurrency(
    balances,
    "checking",
    preferredCurrencyCode,
  );
  const savings = accountBalanceForCurrency(
    balances,
    "savings",
    preferredCurrencyCode,
  );
  const checkingAmount = checking?.postedAmount ?? null;
  const savingsAmount = savings?.postedAmount ?? null;
  return {
    ...snapshot,
    banking: {
      ...snapshot.banking,
      checking: checking
        ? {
          configured: true,
          accountId: String(checking.accountKey || "CHECKING"),
          balance: checkingAmount,
          postedAmount: checkingAmount,
          heldAmount: checking.heldAmount,
          available: checking.availableAmount,
          availableAmount: checking.availableAmount,
          pending: checking.heldAmount,
          currencyCode: currencyCode(checking.currencyCode),
        }
        : {
          configured: false,
          accountId: "CHECKING",
          balance: null,
          available: null,
          pending: null,
          currencyCode: preferredCurrencyCode,
        },
      savings: savings
        ? {
          configured: true,
          accountId: String(savings.accountKey || "SAVINGS"),
          balance: savingsAmount,
          postedAmount: savingsAmount,
          heldAmount: savings.heldAmount,
          available: savings.availableAmount,
          availableAmount: savings.availableAmount,
          interestRate: snapshot.banking?.savings?.interestRate ?? null,
          interestEarned: snapshot.banking?.savings?.interestEarned ?? null,
          currencyCode: currencyCode(savings.currencyCode),
        }
        : {
          configured: false,
          accountId: "NOT CONFIGURED",
          balance: null,
          available: null,
          interestRate: null,
          interestEarned: null,
          currencyCode: preferredCurrencyCode,
        },
    },
    dashboard: {
      ...snapshot.dashboard,
      liquidBalance: checkingAmount,
      savingsBalance: savingsAmount,
    },
  };
}
