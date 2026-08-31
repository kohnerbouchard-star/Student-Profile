import { ApiRequestError } from "../../api/errors.js";

export const ORDER_KEY = /^fxo_[0-9a-f]{32}$/u;

export function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function list(value) {
  return Array.isArray(value) ? value : [];
}

export function dispatchInvalidSession(error, config, runtime = globalThis) {
  if (Number(error?.status) !== 401) return false;
  const detail = Object.freeze({
    reason: "invalid_player_session",
    terminal: "player",
    status: 401,
    code: String(error?.code || "SESSION_INVALID"),
    requestId: String(error?.requestId || ""),
  });
  try {
    config.onSessionInvalid?.(detail);
  } catch {
    // Host callbacks cannot block the reviewed safe-exit event.
  }
  const eventName = String(
    config.sessionInvalidEvent || "econovaria:player-session-invalid",
  );
  runtime.dispatchEvent?.(new runtime.CustomEvent(eventName, { detail }));
  return true;
}

export function currentTreasury(terminal) {
  return object(terminal.getState()?.data?.businessTreasury);
}

export function patchTreasury(terminal, patch, { render = true } = {}) {
  const state = terminal.getState();
  if (!state?.data) return;
  state.data.businessTreasury = { ...currentTreasury(terminal), ...patch };
  if (render) terminal.requestRender?.();
}

export function showError(mount, selector, message) {
  const host = mount.querySelector(selector);
  if (!host) return;
  host.textContent = message;
  host.hidden = false;
  host.focus?.({ preventScroll: true });
}

export function clearError(mount, selector) {
  const host = mount.querySelector(selector);
  if (!host) return;
  host.textContent = "";
  host.hidden = true;
}

export function setBusy(mount, selector, busy) {
  const panel = mount.querySelector(selector);
  if (!panel) return;
  if (busy) panel.setAttribute("aria-busy", "true");
  else panel.removeAttribute("aria-busy");
}

export function canonicalAmount(value, precision) {
  const candidate = String(value || "").trim();
  const places = Number(precision);
  if (
    !/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,18})?$/u.test(candidate) ||
    !/[1-9]/u.test(candidate) ||
    !Number.isSafeInteger(places) || places < 0 || places > 18
  ) return "";
  const [whole, fraction = ""] = candidate.split(".");
  const canonicalFraction = fraction.replace(/0+$/u, "");
  if (canonicalFraction.length > places) return "";
  return canonicalFraction ? `${whole}.${canonicalFraction}` : whole;
}

export function decimalStep(precision) {
  const places = Number(precision);
  if (!Number.isSafeInteger(places) || places <= 0) return "1";
  return `0.${"0".repeat(places - 1)}1`;
}

export function canonicalTargetAmount(value, precision) {
  const candidate = String(value || "").trim();
  const places = Number(precision);
  if (
    !/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(candidate) ||
    !/[1-9]/u.test(candidate) ||
    !Number.isSafeInteger(places) || places < 0 || places > 18
  ) return "";
  const [whole, fraction = ""] = candidate.split(".");
  const canonicalFraction = fraction.replace(/0+$/u, "");
  if (canonicalFraction.length > places) return "";
  return canonicalFraction ? `${whole}.${canonicalFraction}` : whole;
}

export function scaledAmount(value, precision) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(`${whole}${fraction.padEnd(precision, "0")}`);
}

export function amountsEqual(left, right, precision) {
  return scaledAmount(left, precision) === scaledAmount(right, precision);
}

export function formatScaledAmount(value, precision, currencyCode) {
  const padded = value.toString().padStart(precision + 1, "0");
  const whole = precision ? padded.slice(0, -precision) : padded;
  const fraction = precision ? padded.slice(-precision) : "";
  const grouped = whole.replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/gu, ",");
  return `${currencyCode} ${grouped}${precision ? `.${fraction}` : ""}`;
}

export function procurementRows(form) {
  return [...form.querySelectorAll("[data-business-procurement-allocation]")];
}

export function procurementPrecision(terminal) {
  const treasury = currentTreasury(terminal);
  const reportingAccount = list(treasury.accounts).find((entry) =>
    entry.currencyCode === treasury.reportingCurrencyCode &&
    entry.accountKind === "checking"
  );
  return Number.isSafeInteger(reportingAccount?.precision)
    ? reportingAccount.precision
    : null;
}

export function syncProcurementControls(form, terminal, canSubmit) {
  const rows = procurementRows(form);
  let previousSelected = true;
  for (const [index, row] of rows.entries()) {
    const account = row.querySelector('select[name="sourceAccountKey"]');
    if (!account) continue;
    account.disabled = index > 0 && !previousSelected;
    if (account.disabled) account.value = "";
    previousSelected = Boolean(account.value);
  }

  const selected = rows.filter((row) =>
    Boolean(row.querySelector('select[name="sourceAccountKey"]')?.value)
  );
  const precision = procurementPrecision(terminal);
  const currencyCode = String(currentTreasury(terminal).reportingCurrencyCode || "");
  const seen = new Set();
  let valid = selected.length >= 1 && selected.length <= 3 && precision !== null;
  let fixedTotal = 0n;

  for (const row of rows) {
    const account = row.querySelector('select[name="sourceAccountKey"]');
    const amount = row.querySelector('input[name="targetAmount"]');
    const label = row.querySelector("[data-business-procurement-allocation-label]");
    const isSelected = Boolean(account?.value);
    const isRemainder = isSelected && row === selected.at(-1);
    if (label) {
      label.textContent = isRemainder
        ? "SERVER-DERIVED REMAINDER"
        : `FIXED CONTRIBUTION · ${currencyCode}`;
    }
    if (!amount) continue;
    amount.disabled = !isSelected || isRemainder;
    amount.required = isSelected && !isRemainder;
    amount.placeholder = isRemainder
      ? "Server derives the exact remainder"
      : "Enter fixed amount";
    if (isRemainder || !isSelected) amount.value = "";
    if (!isSelected) continue;
    if (seen.has(account.value)) valid = false;
    seen.add(account.value);
    if (!isRemainder) {
      const canonical = canonicalTargetAmount(amount.value, precision);
      if (!canonical) valid = false;
      else fixedTotal += scaledAmount(canonical, precision);
    }
  }

  const fixed = form.querySelector("[data-business-procurement-funded]");
  const remaining = form.querySelector("[data-business-procurement-remaining]");
  if (fixed) {
    fixed.textContent = precision === null
      ? "Reporting precision unavailable"
      : fixedTotal === 0n
      ? "None"
      : formatScaledAmount(fixedTotal, precision, currencyCode);
  }
  if (remaining) {
    remaining.textContent = selected.length
      ? seen.size !== selected.length
        ? "Use unique accounts"
        : `Account ${rows.indexOf(selected.at(-1)) + 1} · server-derived`
      : "Choose the final account";
  }
  const button = form.querySelector("[data-business-procurement-quote-submit]");
  if (button) button.disabled = !canSubmit || !valid;
}

export function procurementIntent(form, terminal) {
  const treasury = currentTreasury(terminal);
  const precision = procurementPrecision(terminal);
  if (precision === null) {
    return { error: "The reporting-currency precision is unavailable. Refresh Business treasury." };
  }
  const itemKey = String(form.elements.namedItem("itemKey")?.value || "")
    .trim().toLowerCase();
  const quantity = Number(form.elements.namedItem("quantity")?.value);
  const item = list(terminal.getState()?.data?.store?.items).find((entry) =>
    String(entry.itemKey || entry.id || "").trim().toLowerCase() === itemKey
  );
  const stock = Number(item?.stock ?? item?.stockQuantity);
  if (!item || !/^[a-z0-9_-]{1,64}$/u.test(itemKey)) {
    return { error: "Choose a current Store input." };
  }
  if (
    !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000 ||
    !Number.isSafeInteger(stock) || quantity > stock
  ) return { error: `Enter a whole-number quantity between 1 and ${Math.max(1, stock || 1)}.` };

  const rows = procurementRows(form);
  const selected = rows.filter((row) =>
    Boolean(row.querySelector('select[name="sourceAccountKey"]')?.value)
  );
  if (selected.length < 1 || selected.length > 3) {
    return { error: "Choose one to three Business Checking accounts." };
  }
  const accounts = new Set();
  const allocations = [];
  for (const [index, row] of selected.entries()) {
    if (rows.indexOf(row) !== index) {
      return { error: "Choose funding accounts in order without an empty row." };
    }
    const sourceAccountKey = String(
      row.querySelector('select[name="sourceAccountKey"]')?.value || "",
    ).trim().toLowerCase();
    const account = list(treasury.accounts).find((entry) =>
      entry.accountKey === sourceAccountKey && entry.accountKind === "checking" &&
      new Set(["active", "open"]).has(entry.status)
    );
    if (!account) return { error: "Choose only active Business Checking accounts." };
    if (accounts.has(sourceAccountKey)) {
      return { error: "Each funding account may be selected only once." };
    }
    accounts.add(sourceAccountKey);
    const remainder = index === selected.length - 1;
    const targetAmount = remainder
      ? null
      : canonicalTargetAmount(
        row.querySelector('input[name="targetAmount"]')?.value,
        precision,
      );
    if (!remainder && !targetAmount) {
      return {
        error: `Enter a positive fixed contribution with no more than ${precision} decimal places.`,
      };
    }
    allocations.push({ sourceAccountKey, targetAmount });
  }
  return { itemKey, quantity, allocations, precision };
}

export function assertProcurementQuoteMatchesIntent(quote, intent, terminal) {
  const state = terminal.getState();
  const businessKey = String(state?.data?.business?.company?.id || "");
  if (
    quote.businessKey !== businessKey || quote.itemKey !== intent.itemKey ||
    quote.quantity !== intent.quantity ||
    quote.fundingQuote.lines.length !== intent.allocations.length
  ) {
    throw new ApiRequestError("Business procurement returned a quote for different intent.", {
      code: "INVALID_RESPONSE",
      endpointKey: "businessStoreQuote",
    });
  }
  for (const [index, allocation] of intent.allocations.entries()) {
    const line = quote.fundingQuote.lines[index];
    if (
      line.lineNumber !== index + 1 ||
      line.sourceAccountKey !== allocation.sourceAccountKey ||
      (allocation.targetAmount !== null && !amountsEqual(
        line.targetContribution.amount,
        allocation.targetAmount,
        intent.precision,
      ))
    ) {
      throw new ApiRequestError("Business procurement changed the reviewed allocation intent.", {
        code: "INVALID_RESPONSE",
        endpointKey: "businessStoreQuote",
      });
    }
  }
}

export function quoteIntent(form, terminal) {
  const treasury = currentTreasury(terminal);
  const sourceAccountKey = String(
    form.elements.namedItem("sourceAccountKey")?.value || "",
  ).trim().toLowerCase();
  const targetCurrencyCode = String(
    form.elements.namedItem("targetCurrencyCode")?.value || "",
  ).trim().toUpperCase();
  const product = String(form.elements.namedItem("product")?.value || "")
    .trim().toLowerCase();
  const account = list(treasury.accounts).find((entry) =>
    entry.accountKey === sourceAccountKey && entry.accountKind === "checking"
  );
  if (!account || !new Set(["active", "open"]).has(account.status)) {
    return { error: "Choose an active Business Checking account." };
  }
  if (account.currencyCode === targetCurrencyCode) {
    return { error: "Choose a destination currency different from the source account." };
  }
  const targetAccount = list(treasury.accounts).find((entry) =>
    entry.currencyCode === targetCurrencyCode && entry.accountKind === "checking" &&
    new Set(["active", "open"]).has(entry.status)
  );
  if (!targetCurrencyCode) return { error: "Choose a destination currency." };
  const sourceAmount = canonicalAmount(
    form.elements.namedItem("sourceAmount")?.value,
    account.precision,
  );
  if (!sourceAmount) {
    return {
      error: `Enter a positive source amount with no more than ${account.precision} decimal places.`,
    };
  }
  if (!new Set(["standard", "instant"]).has(product)) {
    return { error: "Choose Standard or Instant settlement." };
  }
  return {
    sourceAccountKey,
    targetAccountKey: targetAccount?.accountKey || null,
    targetCurrencyCode,
    sourceAmount,
    product,
  };
}

export function assertQuoteMatchesIntent(quote, intent) {
  if (
    quote.sourceAccountKey !== intent.sourceAccountKey ||
    quote.sourceAmount.amount !== intent.sourceAmount ||
    quote.targetAmount.currencyCode !== intent.targetCurrencyCode ||
    quote.product !== intent.product ||
    (intent.targetAccountKey && quote.targetAccountKey !== intent.targetAccountKey)
  ) {
    throw new ApiRequestError("Business treasury returned a quote for different intent.", {
      code: "INVALID_RESPONSE",
      endpointKey: "businessTreasuryFxQuote",
    });
  }
}

export function invalidateQuote(mount, terminal) {
  const treasury = currentTreasury(terminal);
  if (!treasury.currentQuote) return;
  patchTreasury(terminal, { currentQuote: null, currentQuoteOutcome: null }, { render: false });
  const host = mount.querySelector("[data-business-treasury-quote]");
  if (!host) return;
  host.className = "player-terminal-business-treasury-quote is-empty";
  host.replaceChildren();
  const eyebrow = document.createElement("small");
  eyebrow.textContent = "QUOTE INVALIDATED";
  const title = document.createElement("strong");
  title.textContent = "Selections changed";
  const detail = document.createElement("p");
  detail.textContent = "Create a new exact quote before submitting a conversion.";
  host.append(eyebrow, title, detail);
}

export function invalidateProcurementQuote(mount, terminal) {
  const treasury = currentTreasury(terminal);
  if (!treasury.currentProcurementQuote) return;
  patchTreasury(terminal, { currentProcurementQuote: null }, { render: false });
  const host = mount.querySelector("[data-business-procurement-quote]");
  if (!host) return;
  host.className = "player-terminal-business-procurement-quote is-empty";
  host.replaceChildren();
  const eyebrow = document.createElement("small");
  eyebrow.textContent = "FUNDED QUOTE INVALIDATED";
  const title = document.createElement("strong");
  title.textContent = "Procurement intent changed";
  const detail = document.createElement("p");
  detail.textContent = "Create a new server-priced quote before confirming procurement.";
  host.append(eyebrow, title, detail);
}

export function syncQuoteControls(form, terminal) {
  const treasury = currentTreasury(terminal);
  const source = form.elements.namedItem("sourceAccountKey");
  const target = form.elements.namedItem("targetCurrencyCode");
  const amount = form.elements.namedItem("sourceAmount");
  const account = list(treasury.accounts).find((entry) =>
    entry.accountKey === String(source?.value || "")
  );
  if (!account) return;
  if (target?.tagName === "SELECT") {
    for (const option of target.options) {
      option.disabled = option.value === account.currencyCode;
    }
    if (target.selectedOptions[0]?.disabled) {
      const next = [...target.options].find((option) => !option.disabled && option.value);
      if (next) target.value = next.value;
    }
  }
  if (amount?.tagName === "INPUT") {
    amount.step = decimalStep(account.precision);
    amount.min = amount.step;
  }
}

export async function refreshAndCheck(terminal, resources) {
  try {
    const result = await terminal.refreshResources?.(resources);
    return !result || Object.keys(result.errors || {}).length === 0;
  } catch {
    return false;
  }
}
