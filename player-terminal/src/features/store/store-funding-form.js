import { normalizeStoreFundingIntent, storeDecimalStep } from "./store-funding-intent.js";

export function readStoreFundingRows(root) {
  return [...(root?.querySelectorAll?.("[data-player-store-funding-row]") || [])].map((row) => {
    const sourceAccountKey = String(row.querySelector("[data-player-store-funding-account]")?.value || "").trim().toLowerCase();
    const amount = row.querySelector("[data-player-store-funding-amount]");
    return Object.freeze({
      sourceAccountKey,
      targetAmount: sourceAccountKey && !amount?.disabled ? String(amount.value || "").trim() : null,
    });
  });
}

export function syncStoreFundingForm(root, { accounts, targetCurrencyCode, targetPrecision }) {
  const rows = [...(root?.querySelectorAll?.("[data-player-store-funding-row]") || [])];
  const selected = rows.map((row) => String(row.querySelector("[data-player-store-funding-account]")?.value || "").trim().toLowerCase());
  for (let index = 1; index < selected.length; index += 1) {
    if (selected[index - 1]) continue;
    selected[index] = "";
    const account = rows[index].querySelector("[data-player-store-funding-account]");
    if (account) account.value = "";
  }
  rows.forEach((row, index) => {
    const account = row.querySelector("[data-player-store-funding-account]");
    const amount = row.querySelector("[data-player-store-funding-amount]");
    const label = row.querySelector("[data-player-store-funding-allocation-label]");
    if (!account || !amount) return;
    account.disabled = index > 0 && !selected[index - 1];
    [...account.options].forEach((option) => {
      option.disabled = Boolean(option.value && option.value !== selected[index] && selected.includes(option.value));
    });
    const isSelected = Boolean(selected[index]);
    const isFinal = isSelected && !selected[index + 1];
    amount.disabled = !isSelected || isFinal;
    amount.required = isSelected && !isFinal;
    amount.step = storeDecimalStep(targetPrecision) || "any";
    amount.placeholder = isFinal ? "SERVER REMAINDER" : isSelected ? "Fixed target amount" : "Select an account first";
    if (!isSelected || isFinal) amount.value = "";
    if (label) label.textContent = isFinal
      ? `Final ${targetCurrencyCode} remainder is derived by the server`
      : isSelected
        ? `Fixed ${targetCurrencyCode} contribution`
        : "Optional additional Checking account";
  });
  const allocationDraft = readStoreFundingRows(root);
  const result = normalizeStoreFundingIntent(allocationDraft, { accounts, targetCurrencyCode, targetPrecision });
  const summary = root?.querySelector?.("[data-player-store-funding-fixed-total]");
  if (summary) summary.textContent = result.error
    ? "Complete each non-final fixed contribution before requesting the quote."
    : `${targetCurrencyCode} ${result.fixedTotal} fixed · final remainder server-derived`;
  return Object.freeze({ allocationDraft: Object.freeze(allocationDraft), intent: result.error ? null : result, error: result.error || "" });
}

export function storeFundingRequestFromModal(root, current) {
  const quantity = Number(root?.querySelector?.("[data-player-store-quantity]")?.value);
  const stock = Number(current?.offer?.availableQuantity ?? current?.item?.stock);
  const funding = syncStoreFundingForm(root, {
    accounts: current?.fundingAccounts,
    targetCurrencyCode: current?.currencyCode,
    targetPrecision: current?.targetPrecision,
  });
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(stock) || quantity > stock) {
    return Object.freeze({ ...funding, quantity, error: `Enter a whole-number quantity between 1 and ${Math.max(1, stock || 1)}.` });
  }
  return Object.freeze({ ...funding, quantity });
}

export function handleStoreFundingModalKeyDown(event, root, closeModal) {
  if (!root) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusables = [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  if (!focusables.length) {
    event.preventDefault();
    root.querySelector('[aria-labelledby="storePurchaseModalTitle"]')?.focus({ preventScroll: true });
    return;
  }
  const first = focusables[0];
  const last = focusables.at(-1);
  if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
