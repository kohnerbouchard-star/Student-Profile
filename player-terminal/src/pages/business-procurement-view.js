import { escapeHtml, formatCurrency, formatNumber } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderStatusPill } from "../components/ui.js";
import { isEndpointEnabled } from "../api/capabilities.js";

export function renderProcurementFundingLines(lines, { businessMoney, formatBusinessRatePercent }) {
  return `<div role="group" aria-label="Checking account contributions">${lines.map((line, index) => `<p data-business-procurement-funding-line><strong>Checking ${index + 1} · ${escapeHtml(line.sourceCurrencyCode)}</strong> ${escapeHtml(businessMoney(line.sourceDebit))} debit → ${escapeHtml(businessMoney(line.targetContribution))} contribution · reference ${escapeHtml(line.referenceRate)} · customer ${escapeHtml(line.customerRate)} · spread ${escapeHtml(formatBusinessRatePercent(line.spreadRate))} · ${escapeHtml(line.roundingDisclosure)}</p>`).join("")}</div>`;
}

function procurementAllocationRows(accounts, reportingCurrencyCode, reportingPrecision, { businessMoney, businessDecimalStep }) {
  const options = accounts.map((account) => `<option value="${escapeHtml(account.accountKey)}">${escapeHtml(account.currencyCode)} · ${escapeHtml(businessMoney(account.available))} available</option>`).join("");
  const step = businessDecimalStep(reportingPrecision);
  return [0, 1, 2].map((index) => `<div class="player-terminal-business-procurement-allocation" data-business-procurement-allocation data-allocation-index="${index}">
    <label>ACCOUNT ${index + 1}<select name="sourceAccountKey" ${index === 0 ? "required" : ""} ${index > 0 ? "disabled" : ""}><option value="">${index === 0 ? "Choose Checking account" : "Not used"}</option>${options}</select></label>
    <label><span data-business-procurement-allocation-label>${index === 0 ? "SERVER-DERIVED REMAINDER" : `FIXED CONTRIBUTION · ${escapeHtml(reportingCurrencyCode)}`}</span><input name="targetAmount" type="number" min="${escapeHtml(step)}" step="${escapeHtml(step)}" inputmode="decimal" placeholder="${index === 0 ? "Server derives the full bill" : "Enter fixed amount"}" disabled /></label>
  </div>`).join("");
}

export function renderBusinessProcurementPanel(data, formatting) {
  const { businessMoney, businessTimestamp, shortBusinessKey } = formatting;
  const treasury = data.businessTreasury;
  if (!treasury || treasury.businessKey !== data.business?.company?.id) return "";
  const accounts = treasury.accounts.filter((entry) => new Set(["active", "open"]).has(entry.status));
  const reportingPrecision = accounts.find((entry) =>
    entry.currencyCode === treasury.reportingCurrencyCode
  )?.precision;
  const items = Array.isArray(data.store?.items)
    ? data.store.items.filter((entry) => /^[a-z0-9_-]{1,64}$/u.test(String(entry.itemKey || entry.id || "")) && Number(entry.stock) > 0)
    : [];
  const quote = treasury.currentProcurementQuote;
  const receipt = treasury.lastProcurementReceipt;
  const expired = quote ? Date.parse(quote.expiresAt) <= Date.now() : false;
  return `<section class="player-terminal-panel player-terminal-business-procurement" data-business-procurement-state="${quote ? expired ? "expired" : "quoted" : receipt ? "settled" : "ready"}" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>FUNDED STORE PROCUREMENT</span><strong>Quote, fund, and deliver atomically</strong></div>${renderStatusPill("WAREHOUSE DELIVERY", "cyan")}</header>
    <form data-player-business-procurement-form="quote" data-endpoint="businessStoreQuote">
      <div class="player-terminal-business-procurement-intent"><label>STORE ITEM<select name="itemKey" required ${items.length ? "" : "disabled"}>${items.map((item) => `<option value="${escapeHtml(item.itemKey || item.id)}">${escapeHtml(item.name)} · ${escapeHtml(formatCurrency(item.price, item.currencyCode))} · ${escapeHtml(item.stock)} available</option>`).join("") || `<option value="">No Store input is available</option>`}</select></label><label>QUANTITY<input name="quantity" type="number" min="1" max="100000" step="1" value="1" required /></label></div>
      <div class="player-terminal-business-procurement-summary"><span><small>AUTHORITATIVE BILL</small><strong data-business-procurement-estimate>Server-derived at quote</strong></span><span><small>FIXED ALLOCATIONS</small><strong data-business-procurement-funded>None</strong></span><span><small>REMAINDER</small><strong data-business-procurement-remaining>Choose the final account</strong></span></div>
      <p>Choose one to three ordered, unique Business Checking accounts. Enter exact reporting-currency amounts only for accounts before the last; the server derives the entire authoritative Store bill and assigns its remaining amount to the final account.</p>
      <div class="player-terminal-business-procurement-allocations">${procurementAllocationRows(accounts, treasury.reportingCurrencyCode, reportingPrecision, formatting)}</div>
      <button class="player-terminal-primary-button" type="submit" data-business-procurement-quote-submit disabled>${icon("eye")} Review funded procurement quote</button>
    </form>
    <p class="player-terminal-inline-error" role="alert" tabindex="-1" data-business-procurement-error hidden></p>
    <div class="player-terminal-business-procurement-quote${quote ? expired ? " is-expired" : "" : " is-empty"}" data-business-procurement-quote>
      ${quote ? `<header><div><small>${expired ? "FUNDED QUOTE EXPIRED" : "IMMUTABLE FUNDED QUOTE"}</small><strong>${escapeHtml(quote.itemName)} · ${escapeHtml(quote.quantity)} units</strong></div>${renderStatusPill(quote.replayed ? "REPLAYED" : expired ? "EXPIRED" : "READY", quote.replayed ? "purple" : expired ? "amber" : "cyan")}</header><dl><div><dt>TARGET BILL</dt><dd>${escapeHtml(businessMoney(quote.fundingQuote.targetAmount))}</dd></div><div><dt>FUNDING LINES</dt><dd>${escapeHtml(quote.fundingQuote.lines.length)}</dd></div><div><dt>EXPIRES</dt><dd>${escapeHtml(businessTimestamp(quote.expiresAt))}</dd></div></dl>${renderProcurementFundingLines(quote.fundingQuote.lines, formatting)}<form data-player-business-procurement-form="purchase" data-endpoint="businessStorePurchase"><button class="player-terminal-primary-button" type="submit" ${expired || !isEndpointEnabled(data.capabilities, "businessStorePurchase") ? "disabled" : ""}>${icon("cart")} Confirm atomic procurement</button></form>` : `<small>IMMUTABLE FUNDED QUOTE</small><strong>No quote under review</strong><p>Create a current quote before stock, money, or Warehouse state can change.</p>`}
    </div>
    ${receipt ? `<article class="player-terminal-business-procurement-receipt" data-business-procurement-receipt="${escapeHtml(receipt.receiptKey)}"><header><div><small>IMMUTABLE PROCUREMENT RECEIPT</small><strong>${escapeHtml(receipt.itemName)} · ${escapeHtml(receipt.quantity)} units delivered</strong></div>${renderStatusPill(receipt.alreadyCompleted ? "REPLAYED" : "COMMITTED", receipt.alreadyCompleted ? "purple" : "green")}</header><dl><div><dt>TOTAL PAID</dt><dd>${escapeHtml(businessMoney(receipt.fundingReceipt.targetAmount))}</dd></div><div><dt>WAREHOUSE QUANTITY</dt><dd>${escapeHtml(formatNumber(receipt.warehouseQuantityOwned, 4))}</dd></div><div><dt>AVERAGE COST</dt><dd>${escapeHtml(businessMoney(receipt.warehouseAverageUnitCostMoney))}</dd></div></dl><p>Funding ${escapeHtml(shortBusinessKey(receipt.fundingReceipt.receiptKey))} · Banking ${escapeHtml(shortBusinessKey(receipt.fundingReceipt.bankTransactionKey))} · ${escapeHtml(businessTimestamp(receipt.completedAt))}</p></article>` : ""}
    ${treasury.procurementRefreshPending && receipt ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Procurement committed; refresh pending</strong><p>The receipt above is authoritative. Refresh Warehouse, Store, and treasury projections without resubmitting.</p><button class="player-terminal-secondary-button" type="button" data-business-procurement-refresh>Refresh committed result</button></div>` : ""}
  </section>`;
}
