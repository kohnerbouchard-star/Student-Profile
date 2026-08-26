import { isEndpointEnabled, isRouteEnabled } from "../../api/capabilities.js";
import { PlayerApi } from "../../api/player-api.js";
import { setButtonProcessing } from "../../core/dom.js";
import { renderBankingPage } from "../../pages/banking-page.js";
import {
  normalizeBankingFxHistory,
  normalizeBankingFxOrder,
  normalizeBankingFxOrders,
  normalizeBankingFxQuote,
} from "./banking-fx-read-model.js";
import {
  list,
  mergeBankingFxOrderPage,
  mergeBankingPages,
  object,
  quoteFormIntent,
  resolveBankingFxFailure,
  resolveBankingReadFailure,
  syncFxSourceControls,
} from "./banking-read-helpers.js";
export {
  mergeBankingFxOrderPage,
  mergeBankingPages,
  resolveBankingFxFailure,
  resolveBankingReadFailure,
};

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
