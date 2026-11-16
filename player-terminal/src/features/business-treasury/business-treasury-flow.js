import { isEndpointEnabled, isRouteEnabled } from "../../api/capabilities.js";
import { ApiRequestError } from "../../api/errors.js";
import { PlayerApi } from "../../api/player-api.js";
import { setButtonProcessing } from "../../core/dom.js";
import { normalizeBusinessProcurementQuote, normalizeBusinessProcurementReceipt, normalizeBusinessTreasuryOpenResult, normalizeBusinessTreasuryOrderResult, normalizeBusinessTreasuryQuote, resolveBusinessProcurementFailure, resolveBusinessTreasuryFailure } from "./business-treasury-read-model.js";
import { ORDER_KEY, amountsEqual, assertProcurementQuoteMatchesIntent, assertQuoteMatchesIntent, clearError, currentTreasury, dispatchInvalidSession, invalidateProcurementQuote, invalidateQuote, patchTreasury, procurementIntent, quoteIntent, refreshAndCheck, setBusy, showError, syncProcurementControls, syncQuoteControls } from "./business-treasury-flow-support.js";

export function installBusinessTreasuryFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") {
    throw new TypeError("The Business treasury flow requires an active Player terminal.");
  }
  const api = new PlayerApi(config);
  let pending = false;
  let destroyed = false;

  function enabled(endpointKey) {
    const state = terminal.getState();
    return state?.route === "business" &&
      isRouteEnabled(state.data?.capabilities, "business") &&
      isEndpointEnabled(state.data?.capabilities, endpointKey);
  }

  async function openAccount(form) {
    if (destroyed || pending || !enabled("businessTreasuryAccountOpen")) return;
    const currencyCode = String(form.elements.namedItem("currencyCode")?.value || "")
      .trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,16}$/u.test(currencyCode)) {
      showError(mount, "[data-business-treasury-error]", "Choose an active currency.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Opening account");
    pending = true;
    setBusy(mount, ".player-terminal-business-treasury", true);
    clearError(mount, "[data-business-treasury-error]");
    try {
      api.setSession(config);
      const operation = await api.execute("businessTreasuryAccountOpen", { currencyCode });
      const result = normalizeBusinessTreasuryOpenResult(operation.result);
      if (result.account.currencyCode !== currencyCode) {
        throw new ApiRequestError("Business treasury returned a different account currency.", {
          code: "INVALID_RESPONSE",
          endpointKey: "businessTreasuryAccountOpen",
        });
      }
      const refreshed = result.refreshRequired
        ? await refreshAndCheck(terminal, ["businessTreasury"])
        : true;
      patchTreasury(terminal, {
        lastAccountOpen: result.account,
        lastAccountOpenOutcome: result.outcome,
        accountRefreshPending: !refreshed,
      });
      terminal.showToast?.(
        result.outcome === "replayed"
          ? `${currencyCode} Business Checking account replayed from its original result.`
          : `${currencyCode} Business Checking account opened with zero posted balance.`,
        "green",
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showError(mount, "[data-business-treasury-error]", resolveBusinessTreasuryFailure(error));
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-treasury", false);
    }
  }

  async function createQuote(form) {
    if (destroyed || pending || !enabled("businessTreasuryFxQuote")) return;
    const intent = quoteIntent(form, terminal);
    if (intent.error) {
      showError(mount, "[data-business-treasury-error]", intent.error);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Pricing quote");
    pending = true;
    setBusy(mount, ".player-terminal-business-treasury", true);
    clearError(mount, "[data-business-treasury-error]");
    try {
      api.setSession(config);
      const operation = await api.execute("businessTreasuryFxQuote", intent);
      const result = normalizeBusinessTreasuryQuote(operation.result);
      assertQuoteMatchesIntent(result.quote, intent);
      patchTreasury(terminal, {
        currentQuote: result.quote,
        currentQuoteOutcome: result.outcome,
        refreshPending: false,
      });
      terminal.showToast?.("Exact Business FX quote ready for review.", "cyan");
      requestAnimationFrame(() => {
        mount.querySelector('[data-player-business-treasury-form="order"] button[type="submit"]')
          ?.focus?.({ preventScroll: true });
      });
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showError(mount, "[data-business-treasury-error]", resolveBusinessTreasuryFailure(error));
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-treasury", false);
    }
  }

  async function submitOrder(form) {
    if (destroyed || pending) return;
    const quote = currentTreasury(terminal).currentQuote;
    const endpointKey = quote?.product === "instant"
      ? "businessTreasuryFxInstant"
      : "businessTreasuryFxStandard";
    if (!quote?.quoteKey || !enabled(endpointKey) || form.dataset.endpoint !== endpointKey) {
      showError(mount, "[data-business-treasury-error]", "Create a current FX quote before submitting.");
      return;
    }
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      showError(mount, "[data-business-treasury-error]", "This FX quote expired. Create a new quote.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(
      button,
      quote.product === "instant" ? "Converting" : "Reserving order",
    );
    pending = true;
    setBusy(mount, ".player-terminal-business-treasury", true);
    clearError(mount, "[data-business-treasury-error]");
    try {
      api.setSession(config);
      const operation = await api.execute(endpointKey, { quoteKey: quote.quoteKey });
      const result = normalizeBusinessTreasuryOrderResult(operation.result, endpointKey);
      if (result.order.quoteKey !== quote.quoteKey || result.order.product !== quote.product) {
        throw new ApiRequestError("Business treasury returned an order for a different quote.", {
          code: "INVALID_RESPONSE",
          endpointKey,
        });
      }
      const refreshed = result.refreshRequired
        ? await refreshAndCheck(terminal, ["businessTreasury"])
        : true;
      patchTreasury(terminal, {
        currentQuote: null,
        currentQuoteOutcome: null,
        lastCommittedOrder: result.order,
        lastCommittedOrderOutcome: result.outcome,
        refreshPending: !refreshed,
      });
      terminal.showToast?.(
        result.outcome === "replayed"
          ? "Business FX returned the original immutable order."
          : quote.product === "instant"
          ? "Instant Business conversion committed."
          : "Standard Business conversion reserved for the disclosed settlement.",
        "green",
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showError(mount, "[data-business-treasury-error]", resolveBusinessTreasuryFailure(error));
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-treasury", false);
    }
  }

  async function cancelOrder(form) {
    if (destroyed || pending || !enabled("businessTreasuryFxCancel")) return;
    const orderKey = String(form.dataset.orderKey || "").trim().toLowerCase();
    if (!ORDER_KEY.test(orderKey)) {
      showError(mount, "[data-business-treasury-error]", "Choose a current pending order.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Cancelling order");
    pending = true;
    setBusy(mount, ".player-terminal-business-treasury", true);
    clearError(mount, "[data-business-treasury-error]");
    try {
      api.setSession(config);
      const operation = await api.execute(
        "businessTreasuryFxCancel",
        { orderKey },
        { orderKey },
      );
      const result = normalizeBusinessTreasuryOrderResult(
        operation.result,
        "businessTreasuryFxCancel",
      );
      if (result.order.orderKey !== orderKey) {
        throw new ApiRequestError("Business treasury returned a different cancelled order.", {
          code: "INVALID_RESPONSE",
          endpointKey: "businessTreasuryFxCancel",
        });
      }
      const refreshed = result.refreshRequired
        ? await refreshAndCheck(terminal, ["businessTreasury"])
        : true;
      patchTreasury(terminal, {
        currentQuote: null,
        currentQuoteOutcome: null,
        lastCommittedOrder: result.order,
        lastCommittedOrderOutcome: result.outcome,
        refreshPending: !refreshed,
      });
      terminal.showToast?.(
        result.outcome === "replayed"
          ? "Business FX cancellation replayed from its original result."
          : "Pending Business FX order cancelled and its hold released.",
        "green",
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showError(mount, "[data-business-treasury-error]", resolveBusinessTreasuryFailure(error));
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-treasury", false);
    }
  }

  async function createProcurementQuote(form) {
    if (destroyed || pending || !enabled("businessStoreQuote")) return;
    const intent = procurementIntent(form, terminal);
    if (intent.error) {
      showError(mount, "[data-business-procurement-error]", intent.error);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Pricing & funding quote");
    pending = true;
    setBusy(mount, ".player-terminal-business-procurement", true);
    clearError(mount, "[data-business-procurement-error]");
    try {
      api.setSession(config);
      const operation = await api.execute("businessStoreQuote", intent);
      const quote = normalizeBusinessProcurementQuote(operation.result);
      assertProcurementQuoteMatchesIntent(quote, intent, terminal);
      patchTreasury(terminal, {
        currentProcurementQuote: quote,
        procurementRefreshPending: false,
      });
      terminal.showToast?.("Exact funded procurement quote ready for review.", "cyan");
      requestAnimationFrame(() => {
        mount.querySelector('[data-player-business-procurement-form="purchase"] button')
          ?.focus?.({ preventScroll: true });
      });
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showError(
        mount,
        "[data-business-procurement-error]",
        resolveBusinessProcurementFailure(error),
      );
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-procurement", false);
    }
  }

  async function purchaseProcurement(form) {
    if (destroyed || pending || !enabled("businessStorePurchase")) return;
    const quote = currentTreasury(terminal).currentProcurementQuote;
    if (!quote?.quoteKey) {
      showError(
        mount,
        "[data-business-procurement-error]",
        "Create a current funded procurement quote before confirming.",
      );
      return;
    }
    if (
      Date.parse(quote.expiresAt) <= Date.now() ||
      Date.parse(quote.fundingQuote.expiresAt) <= Date.now()
    ) {
      showError(
        mount,
        "[data-business-procurement-error]",
        "This funded procurement quote expired. Create a new quote.",
      );
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Committing procurement");
    pending = true;
    setBusy(mount, ".player-terminal-business-procurement", true);
    clearError(mount, "[data-business-procurement-error]");
    try {
      api.setSession(config);
      const operation = await api.execute("businessStorePurchase", {
        quoteKey: quote.quoteKey,
        clientSubmittedAt: new Date().toISOString(),
      });
      const receipt = normalizeBusinessProcurementReceipt(operation.result);
      if (
        receipt.businessKey !== quote.businessKey ||
        receipt.quoteKey !== quote.quoteKey ||
        receipt.itemKey !== quote.itemKey ||
        receipt.quantity !== quote.quantity ||
        receipt.fundingReceipt.quoteKey !== quote.fundingQuote.quoteKey ||
        receipt.fundingReceipt.targetAccountKey !== quote.fundingTargetAccountKey ||
        !amountsEqual(
          receipt.fundingReceipt.targetAmount.amount,
          quote.fundingQuote.targetAmount.amount,
          quote.fundingQuote.targetAmount.precision,
        )
      ) {
        throw new ApiRequestError("Business procurement returned a receipt for different terms.", {
          code: "INVALID_RESPONSE",
          endpointKey: "businessStorePurchase",
        });
      }
      const resources = operation.invalidatedResources?.length
        ? operation.invalidatedResources
        : ["business", "businessTreasury", "store", "inventory"];
      const refreshed = await refreshAndCheck(terminal, resources);
      patchTreasury(terminal, {
        currentProcurementQuote: null,
        lastProcurementReceipt: receipt,
        procurementRefreshPending: !refreshed,
      });
      terminal.showToast?.(
        receipt.alreadyCompleted
          ? "Procurement replay returned the original immutable receipt."
          : "Funding, Store stock, and Warehouse delivery committed atomically.",
        "green",
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      const code = String(error?.code || error?.body?.code || "").toUpperCase();
      if (/EXPIRED|STALE|STOCK_CHANGED|CONFLICT/u.test(code)) {
        patchTreasury(terminal, { currentProcurementQuote: null });
      }
      showError(
        mount,
        "[data-business-procurement-error]",
        resolveBusinessProcurementFailure(error),
      );
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-procurement", false);
    }
  }

  async function refreshProcurement(button) {
    if (destroyed || pending) return;
    const receipt = currentTreasury(terminal).lastProcurementReceipt;
    const restore = setButtonProcessing(button, "Refreshing committed result");
    pending = true;
    setBusy(mount, ".player-terminal-business-procurement", true);
    try {
      const refreshed = await refreshAndCheck(
        terminal,
        ["business", "businessTreasury", "store", "inventory"],
      );
      patchTreasury(terminal, {
        lastProcurementReceipt: receipt || null,
        procurementRefreshPending: !refreshed,
      });
      if (refreshed) {
        terminal.showToast?.("Committed procurement projections refreshed.", "green");
      }
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-procurement", false);
    }
  }

  async function refreshTreasury(button) {
    if (destroyed || pending) return;
    const restore = setButtonProcessing(button, "Refreshing treasury");
    pending = true;
    setBusy(mount, ".player-terminal-business-treasury", true);
    try {
      const refreshed = await refreshAndCheck(terminal, ["businessTreasury"]);
      if (!refreshed) {
        showError(mount, "[data-business-treasury-error]", "Current treasury projections are still unavailable. No action was resubmitted.");
      } else {
        terminal.showToast?.("Business treasury refreshed from canonical Banking evidence.", "green");
      }
    } finally {
      restore();
      pending = false;
      setBusy(mount, ".player-terminal-business-treasury", false);
    }
  }

  function handleSubmit(event) {
    const procurementForm = event.target.closest?.("[data-player-business-procurement-form]");
    if (procurementForm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const kind = procurementForm.dataset.playerBusinessProcurementForm;
      if (kind === "quote") void createProcurementQuote(procurementForm);
      if (kind === "purchase") void purchaseProcurement(procurementForm);
      return;
    }
    const form = event.target.closest?.("[data-player-business-treasury-form]");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const kind = form.dataset.playerBusinessTreasuryForm;
    if (kind === "account") void openAccount(form);
    if (kind === "quote") void createQuote(form);
    if (kind === "order") void submitOrder(form);
    if (kind === "cancel") void cancelOrder(form);
  }

  function handleClick(event) {
    const procurementRefresh = event.target.closest?.("[data-business-procurement-refresh]");
    if (procurementRefresh) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!procurementRefresh.disabled) void refreshProcurement(procurementRefresh);
      return;
    }
    const button = event.target.closest?.("[data-business-treasury-refresh]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!button.disabled) void refreshTreasury(button);
  }

  function handleChange(event) {
    const procurementForm = event.target.closest?.('[data-player-business-procurement-form="quote"]');
    if (procurementForm) {
      invalidateProcurementQuote(mount, terminal);
      syncProcurementControls(
        procurementForm,
        terminal,
        enabled("businessStoreQuote"),
      );
      return;
    }
    const form = event.target.closest?.('[data-player-business-treasury-form="quote"]');
    if (!form) return;
    invalidateQuote(mount, terminal);
    syncQuoteControls(form, terminal);
  }

  function handleInput(event) {
    const procurementForm = event.target.closest?.('[data-player-business-procurement-form="quote"]');
    if (procurementForm) {
      invalidateProcurementQuote(mount, terminal);
      syncProcurementControls(
        procurementForm,
        terminal,
        enabled("businessStoreQuote"),
      );
      return;
    }
    if (!event.target.closest?.('[data-player-business-treasury-form="quote"]')) return;
    invalidateQuote(mount, terminal);
  }

  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("click", handleClick, true);
  mount.addEventListener("change", handleChange, true);
  mount.addEventListener("input", handleInput, true);
  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("submit", handleSubmit, true);
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("change", handleChange, true);
      mount.removeEventListener("input", handleInput, true);
    },
  };
}
