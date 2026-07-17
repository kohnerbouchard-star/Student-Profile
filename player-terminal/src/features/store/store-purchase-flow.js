import { PlayerApi } from "../../api/player-api.js";
import { ApiConnectionPendingError } from "../../api/errors.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { renderModal } from "../../components/modal.js";
import { focusFirstInteractive, setButtonProcessing } from "../../core/dom.js";

function storeModalElement(mount) {
  const dialog = mount.querySelector('[aria-labelledby="storePurchaseModalTitle"]');
  return dialog?.closest(".player-terminal-modal-backdrop") || null;
}

function focusableElements(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function safeMessage(error, fallback) {
  if (error instanceof ApiConnectionPendingError) return "Store purchasing is awaiting the authoritative backend connection.";
  return String(error?.message || fallback || "The Store request could not be completed.");
}

export function installStorePurchaseFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.refresh !== "function") {
    throw new TypeError("The Store purchase flow requires an active player terminal.");
  }

  const api = new PlayerApi(config);
  let opener = null;
  let transaction = null;
  let destroyed = false;

  function restoreApplication() {
    const root = mount.querySelector(".player-terminal-app-root");
    if (root) {
      root.inert = false;
      root.removeAttribute("aria-hidden");
    }
  }

  function closeModal({ restoreFocus = true } = {}) {
    storeModalElement(mount)?.remove();
    restoreApplication();
    if (restoreFocus) opener?.focus?.({ preventScroll: true });
    opener = null;
    transaction = null;
  }

  function renderTransaction() {
    if (destroyed || !transaction) return;
    storeModalElement(mount)?.remove();
    const template = document.createElement("template");
    template.innerHTML = renderModal({ type: "storePurchase", ...transaction }, config).trim();
    const modal = template.content.firstElementChild;
    if (!modal) return;
    mount.append(modal);
    const root = mount.querySelector(".player-terminal-app-root");
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    focusFirstInteractive(modal);
  }

  function openPurchase(button) {
    const state = terminal.getState();
    if (!isEndpointEnabled(state.data?.capabilities, "storeQuote")) return;
    const itemId = button.dataset.playerPurchase;
    const item = state.data?.store?.items?.find((candidate) => String(candidate.id) === String(itemId));
    if (!item) return;
    opener = button;
    transaction = {
      stage: "select",
      item,
      quantity: 1,
      quote: null,
      receipt: null,
      error: "",
      refreshWarning: "",
      currencyCode: state.data?.session?.currencyCode || "ECO"
    };
    renderTransaction();
  }

  async function requestQuote(button) {
    const input = storeModalElement(mount)?.querySelector("[data-player-store-quantity]");
    const quantity = Number(input?.value);
    const stock = Number(transaction?.item?.stock);
    if (!Number.isInteger(quantity) || quantity < 1 || (Number.isFinite(stock) && quantity > stock)) {
      transaction = { ...transaction, error: `Enter a whole-number quantity between 1 and ${Math.max(1, stock || 1)}.` };
      renderTransaction();
      return;
    }

    const restoreButton = setButtonProcessing(button, "Requesting quote");
    try {
      api.setSession(config);
      const operation = await api.execute("storeQuote", {
        storeItemId: transaction.item.id,
        quantity
      });
      transaction = {
        ...transaction,
        stage: "review",
        quantity,
        quote: operation.result,
        receipt: null,
        error: "",
        refreshWarning: ""
      };
      renderTransaction();
    } catch (error) {
      restoreButton();
      transaction = { ...transaction, quantity, error: safeMessage(error, "The Store quote could not be created.") };
      renderTransaction();
    }
  }

  function quoteExpired(quote) {
    const expiresAt = Date.parse(String(quote?.expiresAt || ""));
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
  }

  async function confirmPurchase(button) {
    const quote = transaction?.quote;
    if (!quote?.quoteId) {
      transaction = { ...transaction, stage: "select", error: "Request a current Store quote before confirming the purchase." };
      renderTransaction();
      return;
    }
    if (quoteExpired(quote)) {
      transaction = { ...transaction, stage: "select", quote: null, error: "This quote expired. Request a new authoritative quote." };
      renderTransaction();
      return;
    }

    const restoreButton = setButtonProcessing(button, "Completing purchase");
    let operation;
    try {
      api.setSession(config);
      operation = await api.execute("storePurchase", {
        quoteId: quote.quoteId,
        clientSubmittedAt: new Date().toISOString()
      });
    } catch (error) {
      restoreButton();
      transaction = { ...transaction, error: safeMessage(error, "The Store purchase could not be completed.") };
      renderTransaction();
      return;
    }

    transaction = {
      ...transaction,
      stage: "receipt",
      receipt: operation.result,
      error: "",
      refreshWarning: ""
    };

    storeModalElement(mount)?.remove();
    restoreApplication();
    try {
      await terminal.refresh();
    } catch {
      transaction = {
        ...transaction,
        refreshWarning: "The purchase completed, but current balances and inventory could not be refreshed. Reopen this section or retry the terminal refresh."
      };
    }
    renderTransaction();
  }

  function editQuantity() {
    transaction = { ...transaction, stage: "select", quote: null, receipt: null, error: "", refreshWarning: "" };
    renderTransaction();
  }

  function handleClick(event) {
    const purchase = event.target.closest?.("[data-player-purchase]");
    if (purchase) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!purchase.disabled && purchase.getAttribute("aria-disabled") !== "true") openPurchase(purchase);
      return;
    }

    const backdrop = event.target.closest?.(".player-terminal-modal-backdrop");
    const modal = backdrop?.querySelector?.('[aria-labelledby="storePurchaseModalTitle"]');
    if (!modal) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.target === backdrop) {
      closeModal();
      return;
    }
    if (event.target.closest('[data-player-local-action="close-modal"]')) {
      closeModal();
      return;
    }
    const route = event.target.closest("[data-route]")?.dataset.route;
    if (route) {
      closeModal({ restoreFocus: false });
      terminal.navigate(route);
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
    const confirm = event.target.closest("[data-player-store-confirm]");
    if (confirm) void confirmPurchase(confirm);
  }

  function handleKeyDown(event) {
    const modal = storeModalElement(mount);
    if (!modal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = focusableElements(modal);
    if (!focusables.length) return;
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
  mount.addEventListener("keydown", handleKeyDown, true);

  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("keydown", handleKeyDown, true);
      closeModal({ restoreFocus: false });
    }
  };
}
