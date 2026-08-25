import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { renderModal } from "../../components/modal.js";
import { focusFirstInteractive, setButtonProcessing } from "../../core/dom.js";
import {
  createSeededStoreOffer,
  dispatchStoreSessionInvalid,
  quoteExpired,
  resolveStorePurchaseFailure,
  validateBusinessOfferQuote,
  validateBusinessOfferReceipt,
  validateSeededQuote,
  validateSeededReceipt,
} from "./store-purchase-contract.js";
import {
  convergeCommittedStorePurchase,
  refreshStaleStoreOffer,
} from "./store-purchase-convergence.js";

export {
  dispatchStoreSessionInvalid,
  resolveStorePurchaseFailure,
  storeQuoteFromOperation,
  validateBusinessOfferQuote,
  validateImmutableBusinessOfferReceipt,
} from "./store-purchase-contract.js";

function storeModalElement(root) {
  const dialog = root?.querySelector?.('[aria-labelledby="storePurchaseModalTitle"]');
  return dialog?.closest(".player-terminal-modal-backdrop") || null;
}

function focusableElements(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

export function installStorePurchaseFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.refreshResources !== "function") {
    throw new TypeError("The Store purchase flow requires an active player terminal with bounded resource refresh.");
  }

  const api = new PlayerApi(config);
  const overlayHost = document.createElement("div");
  overlayHost.className = "player-terminal-transaction-overlay-host";
  overlayHost.dataset.playerTerminalTransactionOverlayHost = "true";
  document.body.append(overlayHost);

  let opener = null;
  let openerItemKey = "";
  let openerOfferKey = "";
  let transaction = null;
  let destroyed = false;
  let generation = 0;
  let activeController = null;

  function applicationRoot() {
    return mount.querySelector(".player-terminal-app-root");
  }

  function restoreApplication() {
    const root = applicationRoot();
    if (root) {
      root.inert = false;
      root.removeAttribute("aria-hidden");
    }
  }

  function restoreOpenerFocus() {
    const offerSelector = openerOfferKey
      ? `[data-player-store-offer="${openerOfferKey}"]`
      : "";
    let current = opener?.isConnected ? opener : (
      offerSelector ? mount.querySelector(offerSelector) :
        openerItemKey ? mount.querySelector(`[data-player-purchase="${openerItemKey}"]`) : null
    );
    if (current?.disabled || current?.getAttribute?.("aria-disabled") === "true") {
      current = mount.querySelector(`[data-player-purchase="${openerItemKey}"]:not([disabled]):not([aria-disabled="true"])`) ||
        current.closest?.(".player-terminal-store-card") ||
        mount.querySelector(".player-terminal-store-page h2");
    }
    if (current && !current.matches?.('a[href], button:not([disabled]), input:not([disabled]), [tabindex]')) {
      current.setAttribute?.("tabindex", "-1");
    }
    current?.focus?.({ preventScroll: true });
  }

  function cancelActiveRequest() {
    generation += 1;
    activeController?.abort();
    activeController = null;
  }

  function closeModal({ restoreFocus = true, force = false } = {}) {
    if (transaction?.processing === true && !force) return false;
    cancelActiveRequest();
    storeModalElement(overlayHost)?.remove();
    restoreApplication();
    if (restoreFocus) restoreOpenerFocus();
    opener = null;
    openerItemKey = "";
    openerOfferKey = "";
    transaction = null;
    return true;
  }

  function renderTransaction() {
    if (destroyed || !transaction) return;
    storeModalElement(overlayHost)?.remove();
    const template = document.createElement("template");
    template.innerHTML = renderModal({ type: "storePurchase", ...transaction }, config).trim();
    const modal = template.content.firstElementChild;
    if (!modal) return;
    overlayHost.append(modal);
    const root = applicationRoot();
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    const quantity = modal.querySelector("[data-player-store-quantity]");
    if (quantity) quantity.focus({ preventScroll: true });
    else if (transaction.processing === true) {
      modal.querySelector('[aria-labelledby="storePurchaseModalTitle"]')
        ?.focus({ preventScroll: true });
    } else focusFirstInteractive(modal);
  }

  function beginRequest() {
    activeController?.abort();
    activeController = new AbortController();
    return { requestGeneration: generation, signal: activeController.signal };
  }

  function requestIsCurrent(requestGeneration) {
    return !destroyed && transaction && requestGeneration === generation;
  }

  function convergenceRequestIsCurrent() {
    return !destroyed;
  }

  function openPurchase(button) {
    const state = terminal.getState();
    if (!isEndpointEnabled(state.data?.capabilities, "storeQuote")) return;
    const itemId = button.dataset.playerPurchase;
    const item = state.data?.store?.items?.find((candidate) => String(candidate.itemKey || candidate.id) === String(itemId));
    if (!item) return;
    const offerKey = String(button.dataset.playerStoreOffer || "");
    const offer = (Array.isArray(item.offers) && offerKey
      ? item.offers.find((candidate) => candidate.offerKey === offerKey)
      : null) || createSeededStoreOffer(item);
    const purchasability = String(button.dataset.playerStorePurchaseMode || offer.purchasability || "seeded_offer");
    if (!offer.purchasable || purchasability === "unsupported") return;
    cancelActiveRequest();
    opener = button;
    openerItemKey = String(itemId || "");
    openerOfferKey = offerKey;
    transaction = {
      stage: "select",
      item,
      offer,
      purchaseMode: purchasability,
      quantity: 1,
      quote: null,
      receipt: null,
      error: "",
      refreshState: "idle",
      refreshWarning: "",
      invalidatedResources: [],
      processing: false,
      currencyCode: offer.currencyCode || state.data?.session?.currencyCode || "ECO",
    };
    renderTransaction();
  }

  async function requestQuote(button) {
    const current = transaction;
    if (!current) return;
    const input = storeModalElement(overlayHost)?.querySelector("[data-player-store-quantity]");
    const quantity = Number(input?.value);
    const stock = Number(current.offer?.availableQuantity ?? current.item?.stock);
    if (!current.offer?.purchasable || current.purchaseMode === "unsupported") {
      transaction = { ...current, error: "This seller offer is no longer available. Refresh the Store and choose another offer." };
      renderTransaction();
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(stock) || quantity > stock) {
      transaction = { ...current, error: `Enter a whole-number quantity between 1 and ${Math.max(1, stock || 1)}.` };
      renderTransaction();
      return;
    }

    const restoreButton = setButtonProcessing(button, "Requesting quote");
    const { requestGeneration, signal } = beginRequest();
    try {
      api.setSession(config);
      const businessOffer = current.purchaseMode === "business_offer";
      const operation = businessOffer
        ? await api.execute("storeOfferQuote", {
          offerKey: current.offer.offerKey,
          quantity,
          expectedVersion: current.offer.version,
        }, {}, { signal })
        : await api.execute("storeQuote", {
          itemKey: current.item.itemKey || current.item.id,
          quantity,
        }, {}, { signal });
      if (!requestIsCurrent(requestGeneration)) return;
      const quote = businessOffer
        ? validateBusinessOfferQuote(operation.result, { item: current.item, offer: current.offer, quantity })
        : validateSeededQuote(operation.result, { item: current.item, quantity });
      transaction = {
        ...current,
        stage: "review",
        quantity,
        quote,
        receipt: null,
        error: "",
        refreshState: "idle",
        refreshWarning: "",
      };
      renderTransaction();
    } catch (error) {
      restoreButton();
      if (!requestIsCurrent(requestGeneration)) return;
      const failure = resolveStorePurchaseFailure(error, "The Store quote could not be created.");
      if (failure.sessionInvalid) {
        closeModal({ restoreFocus: false });
        dispatchStoreSessionInvalid(error, config);
        return;
      }
      transaction = { ...current, quantity, error: failure.message };
      renderTransaction();
    }
  }

  async function confirmPurchase(button) {
    const current = transaction;
    const quote = current?.quote;
    if (current?.processing === true) return;
    if (!current || !quote?.quoteKey) {
      if (current) {
        transaction = { ...current, stage: "select", error: "Request a current Store quote before confirming the purchase." };
        renderTransaction();
      }
      return;
    }
    if (quoteExpired(quote)) {
      transaction = { ...current, stage: "select", quote: null, error: "This quote expired. Request a new authoritative quote." };
      renderTransaction();
      return;
    }

    void button;
    transaction = { ...current, processing: true, error: "" };
    renderTransaction();
    const { requestGeneration, signal } = beginRequest();
    let operation;
    let receipt;
    try {
      api.setSession(config);
      if (current.purchaseMode === "business_offer") {
        operation = await api.execute("storeOfferPurchase", {
          offerKey: quote.offerKey,
          quoteKey: quote.quoteKey,
          quantity: quote.quantity,
          expectedVersion: quote.offerVersion,
        }, {}, { signal });
        if (!requestIsCurrent(requestGeneration)) return;
        receipt = validateBusinessOfferReceipt(operation.result, {
          item: current.item,
          offer: current.offer,
          quote,
        });
      } else {
        operation = await api.execute("storePurchase", {
          quoteKey: quote.quoteKey,
          clientSubmittedAt: new Date().toISOString(),
        }, {}, { signal });
        if (!requestIsCurrent(requestGeneration)) return;
        receipt = validateSeededReceipt(operation.result, { item: current.item, quote });
      }
    } catch (error) {
      if (!requestIsCurrent(requestGeneration)) return;
      const failure = resolveStorePurchaseFailure(error);
      if (failure.sessionInvalid) {
        transaction = { ...current, processing: false };
        closeModal({ restoreFocus: false });
        dispatchStoreSessionInvalid(error, config);
        return;
      }
      if (failure.resetQuote) {
        const refreshed = await refreshStaleStoreOffer({
          current,
          terminal,
          requestGeneration,
          requestIsCurrent,
        });
        if (!refreshed) return;
        transaction = {
          ...current,
          item: refreshed.item,
          offer: refreshed.offer,
          stage: "select",
          quote: null,
          receipt: null,
          error: refreshed.refreshPending
            ? `${failure.message} The authoritative Store refresh is still pending, so this offer remains unavailable.`
            : failure.message,
          refreshState: refreshed.refreshPending ? "pending" : "idle",
          refreshWarning: refreshed.refreshPending
            ? "Authoritative Store refresh pending."
            : "",
          processing: false,
        };
      } else {
        transaction = { ...current, error: failure.message, processing: false };
      }
      renderTransaction();
      return;
    }

    transaction = {
      ...current,
      stage: "receipt",
      receipt,
      error: "",
      refreshState: "refreshing",
      refreshWarning: "",
      processing: false,
      invalidatedResources: Object.freeze([
        ...new Set(Array.isArray(operation.invalidatedResources)
          ? operation.invalidatedResources
          : ["dashboard", "store", "inventory", "banking"]),
      ]),
    };
    renderTransaction();

    let warnings;
    try {
      warnings = await convergeCommittedStorePurchase({
        current: transaction,
        api,
        config,
        terminal,
        requestGeneration,
        requestIsCurrent: convergenceRequestIsCurrent,
        signal: null,
      });
    } catch (error) {
      if (destroyed) return;
      if (requestIsCurrent(requestGeneration)) closeModal({ restoreFocus: false });
      dispatchStoreSessionInvalid(error, config);
      return;
    }
    if (!warnings || !requestIsCurrent(requestGeneration)) return;
    transaction = {
      ...transaction,
      refreshState: warnings.length ? "pending" : "complete",
      refreshWarning: warnings.join(" "),
    };
    renderTransaction();
  }

  async function retryCommittedRefresh() {
    const current = transaction;
    if (
      !current || current.stage !== "receipt" || !current.receipt ||
      current.refreshState !== "pending"
    ) return;
    transaction = {
      ...current,
      refreshState: "refreshing",
      refreshWarning: "",
    };
    renderTransaction();
    const { requestGeneration, signal } = beginRequest();
    let warnings;
    try {
      warnings = await convergeCommittedStorePurchase({
        current: transaction,
        api,
        config,
        terminal,
        requestGeneration,
        requestIsCurrent: convergenceRequestIsCurrent,
        signal: null,
      });
    } catch (error) {
      if (destroyed) return;
      if (requestIsCurrent(requestGeneration)) closeModal({ restoreFocus: false });
      dispatchStoreSessionInvalid(error, config);
      return;
    }
    if (!warnings || !requestIsCurrent(requestGeneration)) return;
    transaction = {
      ...transaction,
      refreshState: warnings.length ? "pending" : "complete",
      refreshWarning: warnings.join(" "),
    };
    renderTransaction();
  }

  function editQuantity() {
    if (!transaction) return;
    cancelActiveRequest();
    transaction = { ...transaction, stage: "select", quote: null, receipt: null, error: "", refreshState: "idle", refreshWarning: "", invalidatedResources: [], processing: false };
    renderTransaction();
  }

  function handleClick(event) {
    const purchase = event.target.closest?.("[data-player-purchase]");
    if (purchase && mount.contains(purchase)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!purchase.disabled && purchase.getAttribute("aria-disabled") !== "true") openPurchase(purchase);
      return;
    }

    const backdrop = event.target.closest?.(".player-terminal-modal-backdrop");
    if (!backdrop || !overlayHost.contains(backdrop)) return;
    const modal = backdrop.querySelector?.('[aria-labelledby="storePurchaseModalTitle"]');
    if (!modal) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.target === backdrop) {
      closeModal();
      return;
    }
    if (event.target.closest('[data-player-local-action="close-modal"]')) {
      const route = event.target.closest("[data-route]")?.dataset.route;
      const closed = closeModal({ restoreFocus: !route });
      if (closed && route) terminal.navigate(route);
      return;
    }
    const review = event.target.closest("[data-player-store-review]");
    if (review) {
      void requestQuote(review);
      return;
    }
    if (event.target.closest("[data-player-store-edit]")) {
      editQuantity();
      return;
    }
    if (event.target.closest("[data-player-store-refresh-retry]")) {
      void retryCommittedRefresh();
      return;
    }
    const confirm = event.target.closest("[data-player-store-confirm]");
    if (confirm) void confirmPurchase(confirm);
  }

  function handleKeyDown(event) {
    const modal = storeModalElement(overlayHost);
    if (!modal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = focusableElements(modal);
    if (!focusables.length) {
      event.preventDefault();
      modal.querySelector('[aria-labelledby="storePurchaseModalTitle"]')
        ?.focus({ preventScroll: true });
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  mount.addEventListener("click", handleClick, true);
  overlayHost.addEventListener("click", handleClick, true);
  overlayHost.addEventListener("keydown", handleKeyDown, true);

  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleClick, true);
      overlayHost.removeEventListener("click", handleClick, true);
      overlayHost.removeEventListener("keydown", handleKeyDown, true);
      closeModal({ restoreFocus: false, force: true });
      overlayHost.remove();
    },
  };
}
