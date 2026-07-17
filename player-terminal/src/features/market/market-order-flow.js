import { PlayerApi } from "../../api/player-api.js";
import { ApiConnectionPendingError } from "../../api/errors.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { icon } from "../../components/icons.js";
import { renderStatusPill } from "../../components/ui.js";
import { escapeHtml, formatCurrency, formatNumber } from "../../core/format.js";
import { focusFirstInteractive, setButtonProcessing } from "../../core/dom.js";

function focusableElements(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function safeMessage(error, fallback) {
  if (error instanceof ApiConnectionPendingError) return "Market order execution is awaiting the authoritative backend connection.";
  return String(error?.message || fallback || "The market order could not be completed.");
}

function orderModalElement(mount) {
  return mount.querySelector('[data-player-market-order-dialog]')?.closest(".player-terminal-modal-backdrop") || null;
}

function orderLabel(transaction) {
  return `${transaction.side === "sell" ? "Sell" : "Buy"} ${formatNumber(transaction.quantity)} ${transaction.asset.symbol}`;
}

export function renderMarketOrderDialog(transaction) {
  const asset = transaction.asset || {};
  const code = transaction.currencyCode || "ECO";

  if (transaction.stage === "limit-pending") {
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" data-player-market-order-dialog role="dialog" aria-modal="true" aria-labelledby="marketOrderModalTitle">
        <header class="player-terminal-modal-head"><div><small>LIMIT ORDER</small><h3 id="marketOrderModalTitle">${escapeHtml(orderLabel(transaction))}</h3></div><button class="player-terminal-icon-button" type="button" data-player-market-order-close aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill("BACKEND INTEGRATION PENDING", "amber")}<p>The approved limit-order interface remains available, but the current stock backend supports immediate market orders only. No order was sent.</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>SIDE</dt><dd>${escapeHtml(transaction.side.toUpperCase())}</dd></div>
            <div><dt>QUANTITY</dt><dd>${escapeHtml(transaction.quantity)}</dd></div>
            <div><dt>LIMIT PRICE</dt><dd>${escapeHtml(formatCurrency(transaction.limitPrice, code))}</dd></div>
            <div><dt>ESTIMATED VALUE</dt><dd>${escapeHtml(formatCurrency(transaction.quantity * transaction.limitPrice, code))}</dd></div>
          </dl>
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-primary-button" type="button" data-player-market-order-close>Acknowledge</button></footer>
      </section>
    </div>`;
  }

  if (transaction.stage === "receipt") {
    const result = transaction.receipt || {};
    const order = result.order || {};
    const cash = result.cash || {};
    const holding = result.holding || {};
    const rejected = String(order.status || "").toLowerCase() === "rejected";
    const detail = transaction.refreshWarning
      ? transaction.refreshWarning
      : rejected
        ? order.rejectionReason || "The backend rejected this order."
        : "The order completed and current market, portfolio, and balance data was refreshed.";
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" data-player-market-order-dialog role="dialog" aria-modal="true" aria-labelledby="marketOrderModalTitle">
        <header class="player-terminal-modal-head"><div><small>ORDER RECEIPT</small><h3 id="marketOrderModalTitle">${escapeHtml(order.ticker || asset.symbol || "Market order")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-market-order-close aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill(rejected ? "REJECTED" : transaction.refreshWarning ? "FILLED · REFRESH PENDING" : "FILLED", rejected ? "red" : transaction.refreshWarning ? "amber" : "green")}<p>${escapeHtml(detail)}</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>ORDER ID</dt><dd><code>${escapeHtml(order.orderId || "Recorded")}</code></dd></div>
            <div><dt>SIDE</dt><dd>${escapeHtml(String(order.side || transaction.side).toUpperCase())}</dd></div>
            <div><dt>QUANTITY</dt><dd>${escapeHtml(order.quantity ?? transaction.quantity)}</dd></div>
            <div><dt>EXECUTION PRICE</dt><dd>${escapeHtml(formatCurrency(order.executionPrice, cash.currencyCode || code))}</dd></div>
            <div><dt>GROSS VALUE</dt><dd>${escapeHtml(formatCurrency(order.grossValue, cash.currencyCode || code))}</dd></div>
            <div><dt>CASH BALANCE</dt><dd>${escapeHtml(formatCurrency(cash.balance, cash.currencyCode || code))}</dd></div>
            <div><dt>RESULTING HOLDING</dt><dd>${escapeHtml(formatNumber(holding.quantity))} shares</dd></div>
            <div><dt>AVERAGE COST</dt><dd>${escapeHtml(formatCurrency(holding.averageCost, cash.currencyCode || code))}</dd></div>
          </dl>
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-route="portfolio">${icon("portfolio")} Open portfolio</button><button class="player-terminal-primary-button" type="button" data-player-market-order-close>Close receipt</button></footer>
      </section>
    </div>`;
  }

  return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
    <section class="player-terminal-modal player-terminal-connector-modal" data-player-market-order-dialog role="dialog" aria-modal="true" aria-labelledby="marketOrderModalTitle">
      <header class="player-terminal-modal-head"><div><small>MARKET ORDER REVIEW</small><h3 id="marketOrderModalTitle">${escapeHtml(orderLabel(transaction))}</h3></div><button class="player-terminal-icon-button" type="button" data-player-market-order-close aria-label="Close">${icon("close")}</button></header>
      <div class="player-terminal-modal-body">
        <div class="player-terminal-connector-status">${renderStatusPill("CONFIRMATION REQUIRED", "cyan")}<p>Current price and gross value are estimates. The backend determines the final execution price, validates cash or holdings, and returns the authoritative result.</p></div>
        <dl class="player-terminal-connector-meta">
          <div><dt>ASSET</dt><dd>${escapeHtml(asset.symbol)} · ${escapeHtml(asset.name)}</dd></div>
          <div><dt>SIDE</dt><dd>${escapeHtml(transaction.side.toUpperCase())}</dd></div>
          <div><dt>QUANTITY</dt><dd>${escapeHtml(transaction.quantity)}</dd></div>
          <div><dt>CURRENT PRICE</dt><dd>${escapeHtml(formatCurrency(asset.price, code))}</dd></div>
          <div><dt>ESTIMATED GROSS</dt><dd>${escapeHtml(formatCurrency(transaction.estimatedGross, code))}</dd></div>
          <div><dt>${transaction.side === "buy" ? "AVAILABLE CASH" : "SHARES OWNED"}</dt><dd>${transaction.side === "buy" ? escapeHtml(transaction.availableCashLabel) : escapeHtml(formatNumber(asset.owned))}</dd></div>
        </dl>
        ${transaction.error ? `<p class="player-terminal-form-error" role="alert">${escapeHtml(transaction.error)}</p>` : ""}
      </div>
      <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-player-market-order-close>Cancel</button><button class="player-terminal-primary-button" type="button" data-player-market-order-confirm>${icon("send")} Confirm market order</button></footer>
    </section>
  </div>`;
}

export function installMarketOrderFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.refresh !== "function") {
    throw new TypeError("The Market order flow requires an active player terminal.");
  }

  const api = new PlayerApi(config);
  let transaction = null;
  let opener = null;
  let destroyed = false;

  function restoreApplication() {
    const root = mount.querySelector(".player-terminal-app-root");
    if (root) {
      root.inert = false;
      root.removeAttribute("aria-hidden");
    }
  }

  function closeModal({ restoreFocus = true } = {}) {
    orderModalElement(mount)?.remove();
    restoreApplication();
    if (restoreFocus) opener?.focus?.({ preventScroll: true });
    opener = null;
    transaction = null;
  }

  function renderTransaction() {
    if (destroyed || !transaction) return;
    orderModalElement(mount)?.remove();
    const template = document.createElement("template");
    template.innerHTML = renderMarketOrderDialog(transaction).trim();
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

  function prepareOrder(form) {
    const state = terminal.getState();
    if (!isEndpointEnabled(state.data?.capabilities, "marketOrder")) return;
    const assetId = String(form.elements.namedItem("assetId")?.value || "");
    const asset = state.data?.market?.assets?.find((candidate) => String(candidate.id) === assetId);
    const side = String(form.elements.namedItem("side")?.value || "buy").toLowerCase();
    const orderType = String(form.elements.namedItem("orderType")?.value || "market").toLowerCase();
    const quantity = Number(form.elements.namedItem("quantity")?.value);
    const limitPrice = Number(form.elements.namedItem("limitPrice")?.value);
    if (!asset || !["buy", "sell"].includes(side) || !Number.isInteger(quantity) || quantity < 1) return;

    opener = form.querySelector('button[type="submit"]');
    const bankingUnavailable = state.data?.resourceStatus?.banking?.state === "unavailable";
    const availableCash = Number(state.data?.banking?.checking?.available);
    const availableCashLabel = bankingUnavailable || !Number.isFinite(availableCash)
      ? "Unavailable · backend validation required"
      : formatCurrency(availableCash, state.data.session.currencyCode);

    if (orderType === "limit") {
      transaction = {
        stage: "limit-pending",
        asset,
        side,
        orderType,
        quantity,
        limitPrice: Number.isFinite(limitPrice) && limitPrice > 0 ? limitPrice : asset.price,
        currencyCode: state.data.session.currencyCode
      };
      renderTransaction();
      return;
    }

    let error = "";
    const estimatedGross = quantity * Number(asset.price || 0);
    if (side === "sell" && quantity > Number(asset.owned || 0)) error = `You currently own ${Number(asset.owned || 0)} shares.`;
    if (side === "buy" && Number.isFinite(availableCash) && estimatedGross > availableCash) error = "The estimated gross value exceeds available cash. The backend will make the final balance decision.";

    transaction = {
      stage: "review",
      asset,
      side,
      orderType: "market",
      quantity,
      estimatedGross,
      availableCashLabel,
      currencyCode: state.data.session.currencyCode,
      error,
      receipt: null,
      refreshWarning: ""
    };
    renderTransaction();
  }

  async function confirmOrder(button) {
    if (!transaction || transaction.stage !== "review") return;
    const restoreButton = setButtonProcessing(button, "Executing order");
    let operation;
    try {
      api.setSession(config);
      operation = await api.execute("marketOrder", {
        assetId: transaction.asset.id,
        side: transaction.side,
        orderType: "market",
        quantity: transaction.quantity
      });
    } catch (error) {
      restoreButton();
      transaction = { ...transaction, error: safeMessage(error, "The market order could not be executed.") };
      renderTransaction();
      return;
    }

    transaction = { ...transaction, stage: "receipt", receipt: operation.result, error: "", refreshWarning: "" };
    orderModalElement(mount)?.remove();
    restoreApplication();
    try {
      await terminal.refresh();
    } catch {
      transaction = {
        ...transaction,
        refreshWarning: "The order completed, but current balances, holdings, and market data could not be refreshed. Retry the terminal refresh before placing another order."
      };
    }
    renderTransaction();
  }

  function handleSubmit(event) {
    const form = event.target.closest?.('[data-player-form="market-order"][data-endpoint="marketOrder"]');
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    prepareOrder(form);
  }

  function handleClick(event) {
    const backdrop = event.target.closest?.(".player-terminal-modal-backdrop");
    const dialog = backdrop?.querySelector?.("[data-player-market-order-dialog]");
    if (!dialog) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.target === backdrop || event.target.closest("[data-player-market-order-close]")) {
      closeModal();
      return;
    }
    const route = event.target.closest("[data-route]")?.dataset.route;
    if (route) {
      closeModal({ restoreFocus: false });
      terminal.navigate(route);
      return;
    }
    const confirm = event.target.closest("[data-player-market-order-confirm]");
    if (confirm) void confirmOrder(confirm);
  }

  function handleKeyDown(event) {
    const modal = orderModalElement(mount);
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

  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("click", handleClick, true);
  mount.addEventListener("keydown", handleKeyDown, true);

  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("submit", handleSubmit, true);
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("keydown", handleKeyDown, true);
      closeModal({ restoreFocus: false });
    }
  };
}
