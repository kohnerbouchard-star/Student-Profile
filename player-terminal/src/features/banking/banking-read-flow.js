import { isEndpointEnabled, isRouteEnabled } from "../../api/capabilities.js";
import { playerSafeErrorMessage } from "../../api/errors.js";
import { PlayerApi } from "../../api/player-api.js";
import { setButtonProcessing } from "../../core/dom.js";
import { renderBankingPage } from "../../pages/banking-page.js";
import {
  normalizeBankingFxHistory,
  normalizeBankingFxOrder,
  normalizeBankingFxOrders,
  normalizeBankingFxQuote,
} from "./banking-fx-read-model.js";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
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

function dispatchInvalidSession(error, config, runtime = globalThis) {
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

function replaceBankingPage(
  mount,
  terminal,
  { banking = null, bankingFx = null },
  focusSelector = "",
) {
  const state = terminal.getState();
  if (state?.route !== "banking" || !state.data) return;
  if (banking) state.data.banking = banking;
  if (bankingFx) state.data.bankingFx = bankingFx;
  const currentPage = mount.querySelector('[data-page="banking"]');
  if (!currentPage) return;
  const template = document.createElement("template");
  template.innerHTML = renderBankingPage(state.data).trim();
  const nextPage = template.content.firstElementChild;
  if (!nextPage) return;
  currentPage.replaceWith(nextPage);
  if (focusSelector) {
    requestAnimationFrame(() => {
      mount.querySelector(focusSelector)?.focus?.({ preventScroll: true });
    });
  }
}

function showPageError(mount, message) {
  const host = mount.querySelector("[data-player-banking-page-error]");
  if (!host) return;
  host.textContent = message;
  host.hidden = false;
}

function showFxError(mount, message) {
  const host = mount.querySelector("[data-player-banking-fx-error]");
  if (!host) return;
  host.textContent = message;
  host.hidden = false;
  host.focus?.({ preventScroll: true });
}

function setFxBusy(mount, busy) {
  const panel = mount.querySelector(".player-terminal-fx-panel");
  if (!panel) return;
  if (busy) panel.setAttribute("aria-busy", "true");
  else panel.removeAttribute("aria-busy");
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

function quoteFormIntent(form, state) {
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

function syncFxSourceControls(sourceSelect) {
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

function invalidateDisplayedQuote(mount, terminal) {
  const state = terminal.getState();
  const fx = object(state?.data?.bankingFx);
  if (!fx.currentQuote) return;
  state.data.bankingFx = { ...fx, currentQuote: null };
  const quote = mount.querySelector("[data-player-banking-fx-quote]");
  if (!quote) return;
  quote.className = "player-terminal-fx-quote-empty";
  quote.replaceChildren();
  const eyebrow = document.createElement("small");
  eyebrow.textContent = "IMMUTABLE QUOTE";
  const title = document.createElement("strong");
  title.textContent = "Selections changed";
  const detail = document.createElement("p");
  detail.textContent = "Review a new exact quote before submitting this conversion.";
  quote.append(eyebrow, title, detail);
}

export function installBankingReadFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") {
    throw new TypeError("The Banking read flow requires an active player terminal.");
  }

  const api = new PlayerApi(config);
  let loading = false;
  let fxLoading = false;
  let destroyed = false;

  async function loadNextPage(button) {
    if (destroyed || loading) return;
    const state = terminal.getState();
    const banking = state?.data?.banking;
    const cursor = String(banking?.pagination?.nextCursor || "").trim();
    if (
      state?.route !== "banking" ||
      !cursor ||
      banking?.pagination?.hasMore !== true ||
      !isRouteEnabled(state.data?.capabilities, "banking")
    ) return;

    loading = true;
    const restore = setButtonProcessing(button, "Loading activity");
    try {
      api.setSession(config);
      const nextPage = await api.request("banking", {
        payload: {
          limit: Number(banking.pagination.limit) || 50,
          cursor,
        },
        force: true,
      });
      const merged = mergeBankingPages(banking, nextPage);
      replaceBankingPage(
        mount,
        terminal,
        { banking: merged },
        "[data-player-banking-load-more]",
      );
      restore("Completed");
      setTimeout(() => restore(), 900);
    } catch (error) {
      restore();
      if (dispatchInvalidSession(error, config)) return;
      showPageError(mount, resolveBankingReadFailure(error));
      button.focus?.({ preventScroll: true });
    } finally {
      loading = false;
    }
  }

  async function createQuote(form) {
    if (destroyed || fxLoading) return;
    const state = terminal.getState();
    const intent = quoteFormIntent(form, state);
    if (intent.error) {
      showFxError(mount, intent.error);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Pricing quote");
    fxLoading = true;
    setFxBusy(mount, true);
    try {
      api.setSession(config);
      const operation = await api.execute("bankingFxQuote", intent);
      const quote = normalizeBankingFxQuote(operation.result);
      const currentFx = object(terminal.getState()?.data?.bankingFx);
      replaceBankingPage(
        mount,
        terminal,
        { bankingFx: { ...currentFx, currentQuote: quote, error: "" } },
        '[data-player-banking-fx-form="order"] button[type="submit"]',
      );
      terminal.showToast?.("Exact FX quote ready for review.", "cyan");
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      restore();
      fxLoading = false;
      setFxBusy(mount, false);
    }
  }

  async function submitOrder(form) {
    if (destroyed || fxLoading) return;
    const state = terminal.getState();
    const quote = object(state?.data?.bankingFx?.currentQuote);
    const endpointKey = quote.product === "instant"
      ? "bankingFxInstant"
      : "bankingFxStandard";
    if (!quote.quoteKey || form.dataset.endpoint !== endpointKey) {
      showFxError(mount, "Create a current quote before submitting an order.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(
      button,
      quote.product === "instant" ? "Converting" : "Submitting order",
    );
    fxLoading = true;
    setFxBusy(mount, true);
    try {
      api.setSession(config);
      const operation = await api.execute(endpointKey, { quoteKey: quote.quoteKey });
      normalizeBankingFxOrder(
        object(operation.result).order || operation.result,
        endpointKey,
      );
      await terminal.refreshResources?.(["banking", "bankingFx"]);
      terminal.showToast?.(
        quote.product === "instant"
          ? "Instant conversion settled."
          : "Standard conversion reserved for the next fixing.",
        "green",
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      restore();
      fxLoading = false;
      setFxBusy(mount, false);
    }
  }

  async function cancelOrder(form) {
    if (destroyed || fxLoading) return;
    const orderKey = String(form.dataset.orderKey || "").trim();
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Cancelling");
    fxLoading = true;
    setFxBusy(mount, true);
    try {
      api.setSession(config);
      const operation = await api.execute(
        "bankingFxCancel",
        { orderKey },
        { orderKey },
      );
      normalizeBankingFxOrder(
        object(operation.result).order || operation.result,
        "bankingFxCancel",
      );
      await terminal.refreshResources?.(["banking", "bankingFx"]);
      terminal.showToast?.("Pending FX order cancelled; reservations released.", "green");
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      restore();
      fxLoading = false;
      setFxBusy(mount, false);
    }
  }

  async function loadHistory(button) {
    if (destroyed || fxLoading) return;
    const state = terminal.getState();
    const form = mount.querySelector('[data-player-banking-fx-form="quote"]');
    const sourceAccountKey = String(
      form?.elements.namedItem("sourceAccountKey")?.value || "",
    );
    const targetCurrencyCode = String(
      form?.elements.namedItem("targetCurrencyCode")?.value || "",
    ).toUpperCase();
    const source = list(state?.data?.bankingFx?.balances).find(
      (balance) => balance.accountKey === sourceAccountKey,
    );
    if (!source || source.currencyCode === targetCurrencyCode) {
      showFxError(mount, "Choose a valid source and target pair before loading history.");
      return;
    }
    const range = String(button.dataset.playerBankingFxRange || "7d");
    const restore = setButtonProcessing(button, "Loading history");
    fxLoading = true;
    setFxBusy(mount, true);
    try {
      api.setSession(config);
      const raw = await api.request("bankingFxHistory", {
        payload: {
          sourceCurrencyCode: source.currencyCode,
          targetCurrencyCode,
          range,
          limit: 100,
        },
        force: true,
      });
      const history = normalizeBankingFxHistory(raw);
      const currentFx = object(terminal.getState()?.data?.bankingFx);
      replaceBankingPage(
        mount,
        terminal,
        { bankingFx: { ...currentFx, history } },
        `[data-player-banking-fx-range="${range}"]`,
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      restore();
      fxLoading = false;
      setFxBusy(mount, false);
    }
  }

  async function refreshOrders(button) {
    if (destroyed || fxLoading) return;
    const restore = setButtonProcessing(button, "Refreshing orders");
    fxLoading = true;
    setFxBusy(mount, true);
    try {
      api.setSession(config);
      const raw = await api.request("bankingFxOrders", {
        payload: { status: "all", limit: 100 },
        force: true,
      });
      const orderPage = normalizeBankingFxOrders(raw);
      const currentFx = object(terminal.getState()?.data?.bankingFx);
      replaceBankingPage(
        mount,
        terminal,
        { bankingFx: mergeBankingFxOrderPage(currentFx, orderPage) },
        "[data-player-banking-fx-refresh-orders]",
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      restore();
      fxLoading = false;
      setFxBusy(mount, false);
    }
  }

  function handleClick(event) {
    const loadMore = event.target.closest?.("[data-player-banking-load-more]");
    if (loadMore) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!loadMore.disabled && loadMore.getAttribute("aria-disabled") !== "true") {
        void loadNextPage(loadMore);
      }
      return;
    }
    const range = event.target.closest?.("[data-player-banking-fx-range]");
    if (range) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!range.disabled) void loadHistory(range);
      return;
    }
    const refresh = event.target.closest?.("[data-player-banking-fx-refresh-orders]");
    if (refresh) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!refresh.disabled) void refreshOrders(refresh);
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest?.("[data-player-banking-fx-form]");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.dataset.playerBankingFxForm === "quote") void createQuote(form);
    if (form.dataset.playerBankingFxForm === "order") void submitOrder(form);
    if (form.dataset.playerBankingFxForm === "cancel") void cancelOrder(form);
  }

  function handleChange(event) {
    const source = event.target.closest?.("#player-banking-fx-source");
    if (source) syncFxSourceControls(source);
    if (event.target.closest?.('[data-player-banking-fx-form="quote"]')) {
      invalidateDisplayedQuote(mount, terminal);
    }
  }

  function handleInput(event) {
    if (event.target.closest?.("#player-banking-fx-amount")) {
      invalidateDisplayedQuote(mount, terminal);
    }
  }

  mount.addEventListener("click", handleClick, true);
  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("change", handleChange, true);
  mount.addEventListener("input", handleInput, true);
  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("submit", handleSubmit, true);
      mount.removeEventListener("change", handleChange, true);
      mount.removeEventListener("input", handleInput, true);
    },
  };
}
