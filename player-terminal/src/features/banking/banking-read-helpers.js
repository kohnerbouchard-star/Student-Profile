import { playerSafeErrorMessage } from "../../api/errors.js";

export function list(value) {
  return Array.isArray(value) ? value : [];
}

export function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function mergeBankingPages(currentBanking, incomingBanking) {
  const current = object(currentBanking);
  const incoming = object(incomingBanking);
  const transactions = new Map();
  for (const entry of [...list(current.transactions), ...list(incoming.transactions)]) {
    const id = String(entry?.id || "").trim();
    if (id) transactions.set(id, entry);
  }
  return {
    ...current,
    ...incoming,
    balances: list(incoming.balances).length
      ? list(incoming.balances)
      : list(current.balances),
    transactions: [...transactions.values()],
    pagination: {
      ...object(current.pagination),
      ...object(incoming.pagination),
    },
  };
}

export function mergeBankingFxOrderPage(currentFx, orderPage) {
  const current = object(currentFx);
  const incoming = list(orderPage?.orders);
  const byKey = new Map();
  for (const order of [
    ...list(current.pendingOrders),
    ...list(current.completedOrders),
    ...incoming,
  ]) {
    const key = String(order?.orderKey || "").trim();
    if (key) byKey.set(key, order);
  }
  const pendingOrders = [];
  const completedOrders = [];
  for (const order of byKey.values()) {
    if (new Set(["cancelled", "completed", "failed", "settled"]).has(order.status)) {
      completedOrders.push(order);
    } else {
      pendingOrders.push(order);
    }
  }
  return { ...current, pendingOrders, completedOrders };
}

export function resolveBankingReadFailure(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").trim().toUpperCase();
  if (status === 429) {
    return "Banking activity is being requested too quickly. Try again shortly.";
  }
  if (
    status >= 500 ||
    ["NETWORK_ERROR", "OFFLINE", "REQUEST_TIMEOUT"].includes(code)
  ) {
    return "Banking activity is temporarily unavailable. Loaded transactions remain visible.";
  }
  if (status || code) return playerSafeErrorMessage({ status, code });
  return "The next Banking page could not be loaded safely.";
}

export function resolveBankingFxFailure(error) {
  const code = String(error?.code || error?.body?.code || "").trim().toUpperCase();
  const messages = {
    FX_QUOTE_EXPIRED: "This quote expired. Create a new quote before submitting.",
    FX_RATE_VERSION_STALE: "A new daily fixing is active. Create a new quote to review the current rate.",
    FX_LIQUIDITY_UNAVAILABLE: "The FX liquidity facility cannot complete this conversion right now. No funds moved.",
    FUNDING_INSUFFICIENT: "The selected Checking account does not have enough available funds.",
    FX_ORDER_NOT_CANCELLABLE: "This order has already been claimed and can no longer be cancelled.",
    FX_QUOTE_CONFLICT: "That quote intent conflicts with an earlier request. Create a new quote.",
  };
  if (messages[code]) return messages[code];
  if (Number(error?.status) === 429) {
    return "Currency exchange is being requested too quickly. Try again shortly.";
  }
  if (
    Number(error?.status) >= 500 ||
    ["NETWORK_ERROR", "OFFLINE", "REQUEST_TIMEOUT"].includes(code)
  ) {
    return "Currency exchange is temporarily unavailable. No funds moved.";
  }
  return playerSafeErrorMessage(error);
}

const DECIMAL_AMOUNT = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,18})?$/u;

function canonicalSourceAmount(value, minorUnit) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const precision = Number(minorUnit);
  if (
    !DECIMAL_AMOUNT.test(normalized) ||
    !/[1-9]/u.test(normalized) ||
    !Number.isSafeInteger(precision) ||
    precision < 0 ||
    precision > 18
  ) return "";
  const [whole, fraction = ""] = normalized.split(".");
  const trimmedFraction = fraction.replace(/0+$/u, "");
  if (trimmedFraction.length > precision) return "";
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function decimalStep(minorUnit) {
  const precision = Number(minorUnit);
  if (!Number.isSafeInteger(precision) || precision <= 0) return "1";
  return `0.${"0".repeat(precision - 1)}1`;
}

export function quoteFormIntent(form, state) {
  const sourceAccountKey = String(
    form.elements.namedItem("sourceAccountKey")?.value || "",
  ).trim();
  const targetCurrencyCode = String(
    form.elements.namedItem("targetCurrencyCode")?.value || "",
  ).trim().toUpperCase();
  const sourceAmountValue = String(
    form.elements.namedItem("sourceAmount")?.value || "",
  );
  const product = String(form.elements.namedItem("product")?.value || "").trim();
  const fx = object(state.data?.bankingFx);
  const account = list(fx.balances).find(
    (balance) => balance.accountKey === sourceAccountKey,
  );
  if (!account || account.accountKind !== "checking") {
    return { error: "Choose an authoritative Checking account." };
  }
  if (account.currencyCode === targetCurrencyCode) {
    return { error: "Choose a target currency different from the source account." };
  }
  const sourceCurrency = list(fx.currencies).find(
    (entry) => entry.currencyCode === account.currencyCode,
  );
  const targetCurrency = list(fx.currencies).find(
    (entry) => entry.currencyCode === targetCurrencyCode,
  );
  if (!sourceCurrency || !targetCurrency) {
    return { error: "Choose a currency from the current canonical fixing." };
  }
  const sourceAmount = canonicalSourceAmount(
    sourceAmountValue,
    sourceCurrency.minorUnit,
  );
  if (!sourceAmount) {
    return {
      error: `Enter a positive amount with no more than ${sourceCurrency.minorUnit} decimal places.`,
    };
  }
  if (!new Set(["standard", "instant"]).has(product)) {
    return { error: "Choose Standard or Instant settlement." };
  }
  return { sourceAccountKey, targetCurrencyCode, sourceAmount, product };
}

export function syncFxSourceControls(sourceSelect) {
  const form = sourceSelect.closest?.('[data-player-banking-fx-form="quote"]');
  const selected = sourceSelect.selectedOptions?.[0];
  const sourceCurrencyCode = String(selected?.dataset.currencyCode || "");
  const minorUnit = Number(selected?.dataset.minorUnit);
  const target = form?.elements.namedItem("targetCurrencyCode");
  if (target?.tagName === "SELECT") {
    for (const option of target.options) {
      option.disabled = option.value === sourceCurrencyCode;
    }
    if (target.selectedOptions[0]?.disabled) {
      const next = [...target.options].find((option) => !option.disabled);
      if (next) target.value = next.value;
    }
  }
  const amount = form?.elements.namedItem("sourceAmount");
  if (amount?.tagName === "INPUT") {
    const step = decimalStep(minorUnit);
    amount.step = step;
    amount.min = step;
  }
}
