import { isEndpointEnabled, isRouteEnabled } from "../../api/capabilities.js";
import { createBankingReadOwner } from "./banking-read-owner.js";
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

function invalidateDisplayedQuote(mount, owner) {
  owner.changeIntent();
  if (!owner.clearQuote()) return;
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

  const owner = createBankingReadOwner({ mount, terminal, config });
  const { api } = owner;

  async function refreshCommittedOperation(request, message) {
    if (!owner.current(request)) return;
    try {
      await terminal.refreshResources?.(["banking", "bankingFx"]);
    } catch (error) {
      if (!owner.acceptsError(request, error)) return;
      // The server already confirmed the financial command. A failed follow-up
      // read must not turn that committed result into a "No funds moved" error.
    }
    if (owner.current(request)) terminal.showToast?.(message, "green");
  }

  async function loadNextPage(button) {
    const state = terminal.getState();
    const banking = state?.data?.banking;
    const cursor = String(banking?.pagination?.nextCursor || "").trim();
    if (
      state?.route !== "banking" ||
      !cursor ||
      banking?.pagination?.hasMore !== true ||
      !isRouteEnabled(state.data?.capabilities, "banking")
    ) return;

    const operation = owner.begin("banking", ["banking"], button, "Loading activity");
    if (!operation) return;
    try {
      const nextPage = await api.request("banking", {
        payload: {
          limit: Number(banking.pagination.limit) || 50,
          cursor,
        },
        force: true,
        signal: operation.controller.signal,
      });
      const merged = mergeBankingPages(banking, nextPage);
      owner.publish(
        operation,
        { banking: merged },
        "[data-player-banking-load-more]",
      );
    } catch (error) {
      if (!owner.acceptsError(operation, error)) return;
      if (dispatchInvalidSession(error, config)) return;
      showPageError(mount, resolveBankingReadFailure(error));
      button.focus?.({ preventScroll: true });
    } finally {
      owner.finish(operation);
    }
  }

  async function createQuote(form) {
    const state = terminal.getState();
    const intent = quoteFormIntent(form, state);
    if (intent.error) {
      showFxError(mount, intent.error);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const request = owner.begin("fx", ["banking", "bankingFx"], button, "Pricing quote", { intent: true });
    if (!request) return;
    try {
      const operation = await api.execute("bankingFxQuote", intent);
      if (!owner.current(request)) return;
      const quote = normalizeBankingFxQuote(operation.result);
      const currentFx = object(terminal.getState()?.data?.bankingFx);
      if (!owner.publish(
        request,
        { bankingFx: { ...currentFx, currentQuote: quote, error: "" } },
        '[data-player-banking-fx-form="order"] button[type="submit"]',
      )) return;
      terminal.showToast?.("Exact FX quote ready for review.", "cyan");
    } catch (error) {
      if (!owner.acceptsError(request, error)) return;
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      owner.finish(request);
    }
  }

  async function submitOrder(form) {
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
    const request = owner.begin(
      "fx", [],
      button,
      quote.product === "instant" ? "Converting" : "Submitting order",
    );
    if (!request) return;
    try {
      const operation = await api.execute(endpointKey, { quoteKey: quote.quoteKey });
      normalizeBankingFxOrder(
        object(operation.result).order || operation.result,
        endpointKey,
      );
      await refreshCommittedOperation(request,
        quote.product === "instant"
          ? "Instant conversion settled."
          : "Standard conversion reserved for the next fixing.",
      );
    } catch (error) {
      if (!owner.acceptsError(request, error)) return;
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      owner.finish(request);
    }
  }

  async function cancelOrder(form) {
    const orderKey = String(form.dataset.orderKey || "").trim();
    const button = form.querySelector('button[type="submit"]');
    const request = owner.begin("fx", [], button, "Cancelling");
    if (!request) return;
    try {
      const operation = await api.execute(
        "bankingFxCancel",
        { orderKey },
        { orderKey },
      );
      normalizeBankingFxOrder(
        object(operation.result).order || operation.result,
        "bankingFxCancel",
      );
      await refreshCommittedOperation(request, "Pending FX order cancelled; reservations released.");
    } catch (error) {
      if (!owner.acceptsError(request, error)) return;
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      owner.finish(request);
    }
  }

  async function loadHistory(button) {
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
    const operation = owner.begin("fx", ["bankingFx"], button, "Loading history", { intent: true });
    if (!operation) return;
    try {
      const raw = await api.request("bankingFxHistory", {
        payload: {
          sourceCurrencyCode: source.currencyCode,
          targetCurrencyCode,
          range,
          limit: 100,
        },
        force: true,
        signal: operation.controller.signal,
      });
      if (!owner.current(operation)) return;
      const history = normalizeBankingFxHistory(raw);
      const currentFx = object(terminal.getState()?.data?.bankingFx);
      owner.publish(
        operation,
        { bankingFx: { ...currentFx, history } },
        `[data-player-banking-fx-range="${range}"]`,
      );
    } catch (error) {
      if (!owner.acceptsError(operation, error)) return;
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      owner.finish(operation);
    }
  }

  async function refreshOrders(button) {
    const operation = owner.begin("fx", ["bankingFx"], button, "Refreshing orders");
    if (!operation) return;
    try {
      const raw = await api.request("bankingFxOrders", {
        payload: { status: "all", limit: 100 },
        force: true,
        signal: operation.controller.signal,
      });
      if (!owner.current(operation)) return;
      const orderPage = normalizeBankingFxOrders(raw);
      const currentFx = object(terminal.getState()?.data?.bankingFx);
      owner.publish(
        operation,
        { bankingFx: mergeBankingFxOrderPage(currentFx, orderPage) },
        "[data-player-banking-fx-refresh-orders]",
      );
    } catch (error) {
      if (!owner.acceptsError(operation, error)) return;
      if (dispatchInvalidSession(error, config)) return;
      showFxError(mount, resolveBankingFxFailure(error));
    } finally {
      owner.finish(operation);
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
      invalidateDisplayedQuote(mount, owner);
    }
  }

  function handleInput(event) {
    if (event.target.closest?.("#player-banking-fx-amount")) {
      invalidateDisplayedQuote(mount, owner);
    }
  }

  mount.addEventListener("click", handleClick, true);
  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("change", handleChange, true);
  mount.addEventListener("input", handleInput, true);
  return {
    destroy() {
      owner.destroy();
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("submit", handleSubmit, true);
      mount.removeEventListener("change", handleChange, true);
      mount.removeEventListener("input", handleInput, true);
    },
  };
}
