import { icon } from "../../components/icons.js";
import { renderStatusPill } from "../../components/ui.js";
import { escapeHtml, formatCurrency, formatNumber } from "../../core/format.js";

export function renderMarketOrderDialogView(transaction, {
  listingCurrency, authoritativeFundingTotal, roundStock, orderLabel, isoLabel, publicFundingLines,
}) {
  const code = listingCurrency(transaction);
  const error = transaction.error ? `<p class="player-terminal-form-error" role="alert">${escapeHtml(transaction.error)}</p>` : "";

  if (transaction.stage === "buy-quote") {
    const quote = transaction.quote || {};
    const funded = authoritativeFundingTotal(transaction);
    const remaining = roundStock(Math.max(Number(quote.grossValue || 0) - funded, 0));
    const expired = Number.isFinite(Date.parse(quote.expiresAt)) && Date.parse(quote.expiresAt) <= Date.now();
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" data-player-market-order-dialog role="dialog" aria-modal="true" aria-labelledby="marketOrderModalTitle">
        <header class="player-terminal-modal-head"><div><small>IMMUTABLE BUY QUOTE</small><h3 id="marketOrderModalTitle">${escapeHtml(orderLabel(transaction))}</h3></div><button class="player-terminal-icon-button" type="button" data-player-market-order-close aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill(expired ? "QUOTE EXPIRED" : "CONFIRMATION REQUIRED", expired ? "red" : "cyan")}<p>${expired ? "This quote is no longer executable. Close it and create a new exact quote." : "Review the locked price, funding split, FX evidence, and expiry before authorizing settlement."}</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>QUOTE</dt><dd>${escapeHtml(quote.quoteKey || "")}</dd></div>
            <div><dt>QUANTITY</dt><dd>${escapeHtml(formatNumber(quote.quantity ?? transaction.quantity))}</dd></div>
            <div><dt>LOCKED PRICE</dt><dd>${escapeHtml(formatCurrency(quote.quotedPrice, code))}</dd></div>
            <div><dt>GROSS VALUE</dt><dd>${escapeHtml(formatCurrency(quote.grossValue, code))}</dd></div>
            <div><dt>FUNDED</dt><dd>${escapeHtml(formatCurrency(funded, code))}</dd></div>
            <div><dt>REMAINING</dt><dd>${escapeHtml(formatCurrency(remaining, code))}</dd></div>
            <div><dt>PRICE TICK</dt><dd>#${escapeHtml(String(quote.priceTickIndex ?? transaction.expectedTickIndex ?? 0))}</dd></div>
            <div><dt>EXPIRES</dt><dd>${escapeHtml(isoLabel(quote.expiresAt))}</dd></div>
          </dl>
          ${publicFundingLines(transaction)}${error}
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-player-market-order-close>Cancel</button><button class="player-terminal-primary-button" type="button" data-player-market-order-confirm${expired ? " disabled" : ""}>${icon("send")} Confirm settlement</button></footer>
      </section>
    </div>`;
  }

  if (transaction.stage === "sell-review") {
    const destination = transaction.destinationAccount || {};
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" data-player-market-order-dialog role="dialog" aria-modal="true" aria-labelledby="marketOrderModalTitle">
        <header class="player-terminal-modal-head"><div><small>IMMEDIATE SELL REVIEW</small><h3 id="marketOrderModalTitle">${escapeHtml(orderLabel(transaction))}</h3></div><button class="player-terminal-icon-button" type="button" data-player-market-order-close aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill("CONFIRMATION REQUIRED", "cyan")}<p>The backend will revalidate price, tick, holdings, market liquidity, destination ownership, and an exact listing-currency Checking destination. Stock sale proceeds do not auto-convert.</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>QUANTITY</dt><dd>${escapeHtml(formatNumber(transaction.quantity))}</dd></div>
            <div><dt>EXPECTED PRICE</dt><dd>${escapeHtml(formatCurrency(transaction.expectedPrice, code))}</dd></div>
            <div><dt>ESTIMATED PROCEEDS</dt><dd>${escapeHtml(formatCurrency(transaction.estimatedGross, code))}</dd></div>
            <div><dt>PRICE TICK</dt><dd>#${escapeHtml(String(transaction.expectedTickIndex))}</dd></div>
            <div><dt>DESTINATION</dt><dd>${escapeHtml(destination.accountKey || transaction.payload?.destinationAccountKey || "")}</dd></div>
            <div><dt>DESTINATION CURRENCY</dt><dd>${escapeHtml(String(destination.currencyCode || code).toUpperCase())} · no sell-side FX</dd></div>
          </dl>${error}
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-player-market-order-close>Cancel</button><button class="player-terminal-primary-button" type="button" data-player-market-order-confirm>${icon("send")} Confirm immediate sale</button></footer>
      </section>
    </div>`;
  }

  const settlement = transaction.settlement || {};
  const isSell = transaction.side === "sell";
  const replayed = settlement.alreadyCompleted === true;
  const status = transaction.refreshWarning ? "FILLED · REFRESH PENDING" : replayed ? "REPLAYED RECEIPT" : "FILLED";
  return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
    <section class="player-terminal-modal player-terminal-connector-modal" data-player-market-order-dialog role="dialog" aria-modal="true" aria-labelledby="marketOrderModalTitle">
      <header class="player-terminal-modal-head"><div><small>IMMUTABLE STOCK RECEIPT</small><h3 id="marketOrderModalTitle">${escapeHtml(settlement.ticker || transaction.asset?.symbol || "Stock trade")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-market-order-close aria-label="Close">${icon("close")}</button></header>
      <div class="player-terminal-modal-body">
        <div class="player-terminal-connector-status">${renderStatusPill(status, transaction.refreshWarning ? "amber" : "green")}<p>${escapeHtml(transaction.refreshWarning || (replayed ? "The committed result was returned without executing the trade twice." : "The trade settled and the authoritative receipt is shown below."))}</p></div>
        <dl class="player-terminal-connector-meta">
          <div><dt>SIDE</dt><dd>${escapeHtml(transaction.side.toUpperCase())}</dd></div>
          <div><dt>QUANTITY</dt><dd>${escapeHtml(formatNumber(settlement.quantity ?? transaction.quantity))}</dd></div>
          <div><dt>EXECUTION PRICE</dt><dd>${escapeHtml(formatCurrency(settlement.executionPrice, code))}</dd></div>
          <div><dt>GROSS VALUE</dt><dd>${escapeHtml(formatCurrency(settlement.grossValue, code))}</dd></div>
          <div><dt>PRICE TICK</dt><dd>#${escapeHtml(String(settlement.priceTickIndex ?? 0))}</dd></div>
          <div><dt>RESULTING HOLDING</dt><dd>${escapeHtml(formatNumber(settlement.holdingQuantityAfter))} shares</dd></div>
          <div><dt>AVERAGE COST</dt><dd>${escapeHtml(formatCurrency(settlement.averageCostAfter, code))}</dd></div>
          <div><dt>FILLED AT</dt><dd>${escapeHtml(isoLabel(settlement.filledAt))}</dd></div>
          ${isSell ? `<div><dt>DESTINATION</dt><dd>${escapeHtml(settlement.destinationAccountKey || "")}</dd></div><div><dt>SETTLEMENT</dt><dd>${escapeHtml(settlement.settlementTransactionKey || "")}</dd></div>` : `<div><dt>QUOTE</dt><dd>${escapeHtml(settlement.quoteKey || transaction.quote?.quoteKey || "")}</dd></div>`}
        </dl>${isSell ? "" : publicFundingLines(transaction)}
      </div>
      <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-route="portfolio">${icon("portfolio")} Open portfolio</button><button class="player-terminal-primary-button" type="button" data-player-market-order-close>Close receipt</button></footer>
    </section>
  </div>`;
}
