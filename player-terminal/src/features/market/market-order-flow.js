import { PlayerApi } from "../../api/player-api.js";
import { ApiConnectionPendingError } from "../../api/errors.js";
import { normalizeWritePayload } from "../../api/payload-normalizer.js";
import { marketPositionForAsset } from "../../api/portfolio-market-holdings.js";
import { isEndpointEnabled, isRouteEnabled } from "../../api/capabilities.js";
import { icon } from "../../components/icons.js";
import { renderStatusPill } from "../../components/ui.js";
import { escapeHtml, formatCurrency, formatNumber } from "../../core/format.js";
import { focusFirstInteractive, setButtonProcessing } from "../../core/dom.js";

const ACCOUNT_KEY = /^bac_[0-9a-f]{32}$/;
const QUOTE_KEY = /^sbq_[0-9a-f]{32}$/;

function focusableElements(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function safeMessage(error, fallback) {
  if (error instanceof ApiConnectionPendingError) return "Stock trading is awaiting the authoritative backend connection.";
  return String(error?.message || fallback || "The Stock trade could not be completed.");
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
  try { config.onSessionInvalid?.(detail); } catch {}
  runtime.dispatchEvent?.(new runtime.CustomEvent(String(config.sessionInvalidEvent || "econovaria:player-session-invalid"), { detail }));
  return true;
}

function orderModalElement(mount) {
  return mount.querySelector('[data-player-market-order-dialog]')?.closest(".player-terminal-modal-backdrop") || null;
}

function roundStock(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10_000) / 10_000;
}

function isoLabel(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Unavailable";
}

function listingCurrency(transaction) {
  return String(
    transaction.quote?.listingCurrencyCode ||
    transaction.settlement?.listingCurrencyCode ||
    transaction.currencyCode ||
    "ECO"
  ).toUpperCase();
}

function orderLabel(transaction) {
  return `${transaction.side === "sell" ? "Sell" : "Buy"} ${formatNumber(transaction.quantity)} ${transaction.asset?.symbol || transaction.ticker || "Stock"}`;
}

function authoritativeFundingLines(transaction) {
  if (Array.isArray(transaction.settlement?.funding?.lines)) return transaction.settlement.funding.lines;
  return Array.isArray(transaction.quote?.funding?.lines) ? transaction.quote.funding.lines : [];
}

function authoritativeFundingTotal(transaction) {
  const total = authoritativeFundingLines(transaction)
    .reduce((sum, line) => sum + (Number(line.target_contribution) || 0), 0);
  return total > 0 ? roundStock(total) : Number(transaction.quote?.grossValue || transaction.settlement?.grossValue || 0);
}

function publicFundingLines(transaction) {
  const lines = authoritativeFundingLines(transaction);
  if (!lines.length) return "";
  return `<div class="player-terminal-connector-status"><strong>AUTHORITATIVE FUNDING</strong>${lines.map((line) => {
    const sourceAccountKey = String(line.source_account_key || "").toLowerCase();
    const sourceCurrency = String(line.source_currency_code || "").toUpperCase();
    const targetCurrency = String(line.target_currency_code || listingCurrency(transaction)).toUpperCase();
    const sourceDebit = Number(line.source_debit);
    const targetContribution = Number(line.target_contribution);
    const rate = Number(line.customer_rate);
    return `<p><strong>${escapeHtml(sourceCurrency || "Checking")}</strong>${sourceAccountKey ? ` · ${escapeHtml(sourceAccountKey)}` : ""} · ${escapeHtml(formatCurrency(sourceDebit, sourceCurrency || targetCurrency))} → ${escapeHtml(formatCurrency(targetContribution, targetCurrency))}${line.requires_fx ? ` · FX ${escapeHtml(Number.isFinite(rate) ? String(rate) : "applied")}` : " · no FX"}</p>`;
  }).join("")}</div>`;
}

export function renderMarketOrderDialog(transaction) {
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
          <div class="player-terminal-connector-status">${renderStatusPill("CONFIRMATION REQUIRED", "cyan")}<p>The backend will revalidate price, tick, holdings, market liquidity, destination ownership, and any required Banking FX conversion.</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>QUANTITY</dt><dd>${escapeHtml(formatNumber(transaction.quantity))}</dd></div>
            <div><dt>EXPECTED PRICE</dt><dd>${escapeHtml(formatCurrency(transaction.expectedPrice, code))}</dd></div>
            <div><dt>ESTIMATED PROCEEDS</dt><dd>${escapeHtml(formatCurrency(transaction.estimatedGross, code))}</dd></div>
            <div><dt>PRICE TICK</dt><dd>#${escapeHtml(String(transaction.expectedTickIndex))}</dd></div>
            <div><dt>DESTINATION</dt><dd>${escapeHtml(destination.accountKey || transaction.payload?.destinationAccountKey || "")}</dd></div>
            <div><dt>DESTINATION CURRENCY</dt><dd>${escapeHtml(String(destination.currencyCode || code).toUpperCase())}${String(destination.currencyCode || code).toUpperCase() === code ? " · no FX" : " · Banking FX"}</dd></div>
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

function stateCheckingAccounts(terminal) {
  const balances = terminal.getState()?.data?.bankingFx?.balances;
  return (Array.isArray(balances) ? balances : []).filter((row) => row?.accountKind === "checking" && ACCOUNT_KEY.test(String(row.accountKey || "")));
}

function assetForForm(terminal, form) {
  const ticker = String(form.elements.namedItem("ticker")?.value || "").trim().toUpperCase();
  return terminal.getState()?.data?.market?.assets?.find((asset) => String(asset.symbol || "").toUpperCase() === ticker) || null;
}

function rawFormPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setReviewValue(form, name, value) {
  const input = form.elements.namedItem(name);
  if (input && "value" in input) input.value = String(value);
}

async function readAuthoritativeTradeReview(api, config, asset, form) {
  const ticker = String(asset?.symbol || "").trim().toUpperCase();
  if (!ticker) throw new Error("The selected Stock is unavailable.");
  api.setSession(config);
  const detail = await api.request("marketAsset", {
    params: { assetId: ticker },
    force: true,
  });
  const reviewed = detail?.asset;
  const expectedPrice = Number(reviewed?.currentPrice);
  const expectedTickIndex = Number(detail?.tickIndex);
  if (
    String(reviewed?.ticker || reviewed?.assetId || "").trim().toUpperCase() !== ticker ||
    !Number.isFinite(expectedPrice) || expectedPrice <= 0 ||
    !Number.isSafeInteger(expectedTickIndex) || expectedTickIndex <= 0
  ) throw new Error("The authoritative Stock price review was incomplete.");
  setReviewValue(form, "expectedPrice", expectedPrice);
  setReviewValue(form, "expectedTickIndex", expectedTickIndex);
  return {
    asset: { ...asset, price: expectedPrice },
    expectedPrice,
    expectedTickIndex,
  };
}

function readBuyAllocations(form) {
  const allocations = [];
  for (let index = 1; index <= 3; index += 1) {
    const sourceAccountKey = String(form.elements.namedItem(`sourceAccountKey${index}`)?.value || "").trim().toLowerCase();
    const targetAmountValue = form.elements.namedItem(`targetAmount${index}`)?.value;
    if (!sourceAccountKey && !String(targetAmountValue || "").trim()) continue;
    allocations.push({ sourceAccountKey, targetAmount: Number(targetAmountValue) });
  }
  return allocations;
}

function updateBuySummary(terminal, form) {
  const asset = assetForForm(terminal, form);
  if (!asset) return;
  const code = String(asset.listingCurrencyCode || terminal.getState()?.data?.session?.currencyCode || "ECO").toUpperCase();
  const quantity = Math.max(0, Number(form.elements.namedItem("quantity")?.value) || 0);
  const estimate = roundStock(quantity * Number(asset.price || 0));
  const allocations = readBuyAllocations(form);
  const funded = roundStock(allocations.reduce((sum, row) => sum + (Number.isFinite(row.targetAmount) ? row.targetAmount : 0), 0));
  const remaining = roundStock(Math.max(estimate - funded, 0));
  form.querySelector("[data-player-market-estimated-total]")?.replaceChildren(document.createTextNode(formatCurrency(estimate, code)));
  form.querySelector("[data-player-market-funded-total]")?.replaceChildren(document.createTextNode(formatCurrency(funded, code)));
  form.querySelector("[data-player-market-remaining-total]")?.replaceChildren(document.createTextNode(formatCurrency(remaining, code)));
  const submit = form.querySelector('button[type="submit"]');
  const state = terminal.getState()?.data;
  const fundingValid = allocations.length >= 1 && allocations.length <= 3
    && allocations.every((row) => ACCOUNT_KEY.test(row.sourceAccountKey) && Number.isFinite(row.targetAmount) && row.targetAmount > 0);
  if (submit) submit.disabled = !(state?.market?.status !== "CLOSED" && fundingValid && estimate > 0 && Math.abs(funded - estimate) < 0.00001);
}

function updateSellSummary(terminal, form) {
  const asset = assetForForm(terminal, form);
  if (!asset) return;
  const code = String(asset.listingCurrencyCode || terminal.getState()?.data?.session?.currencyCode || "ECO").toUpperCase();
  const quantity = Math.max(0, Number(form.elements.namedItem("quantity")?.value) || 0);
  form.querySelector("[data-player-market-sell-proceeds]")?.replaceChildren(document.createTextNode(formatCurrency(roundStock(quantity * Number(asset.price || 0)), code)));
}

export function installMarketOrderFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") throw new TypeError("The Market order flow requires an active Player terminal.");

  const api = new PlayerApi(config);
  let transaction = null;
  let opener = null;
  let pending = false;
  let destroyed = false;

  function restoreApplication() {
    const root = mount.querySelector(".player-terminal-app-root");
    if (root) { root.inert = false; root.removeAttribute("aria-hidden"); }
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
    if (root) { root.inert = true; root.setAttribute("aria-hidden", "true"); }
    focusFirstInteractive(modal);
  }

  async function refreshTradeResources() {
    if (typeof terminal.refreshResources === "function") {
      await terminal.refreshResources(["dashboard", "market", "portfolio", "banking", "bankingFx"]);
    } else if (typeof terminal.refresh === "function") {
      await terminal.refresh();
    }
  }

  function refreshSingleLineBuyFunding(payload, reviewedPrice) {
    const previousGross = roundStock(payload.quantity * payload.expectedPrice);
    const previousFunded = roundStock(payload.allocations.reduce((sum, row) => sum + row.targetAmount, 0));
    if (payload.allocations.length !== 1 || Math.abs(previousFunded - previousGross) >= 0.00001) return false;
    const forms = [...mount.querySelectorAll('form[data-player-market-order-form="buy-quote"]')];
    const refreshedForm = forms.find((candidate) => candidate.offsetParent !== null) || forms[0] || null;
    if (!refreshedForm) return false;
    setReviewValue(refreshedForm, "targetAmount1", roundStock(payload.quantity * reviewedPrice));
    refreshedForm.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  async function createBuyQuote(form) {
    if (pending || destroyed) return;
    const state = terminal.getState();
    if (!isRouteEnabled(state.data?.capabilities, "market") || !isEndpointEnabled(state.data?.capabilities, "marketOrder")) return;
    if (state.data?.market?.status === "CLOSED") { terminal.showToast?.("The Stock market is closed.", "red"); return; }
    const asset = assetForForm(terminal, form);
    if (!asset) return;
    let payload;
    try { payload = normalizeWritePayload("marketOrder", rawFormPayload(form)); }
    catch (error) { terminal.showToast?.(safeMessage(error, "Check the funding split."), "red"); return; }
    const canonicalAccounts = new Map(stateCheckingAccounts(terminal).map((row) => [String(row.accountKey).toLowerCase(), row]));
    if (payload.allocations.some((row) => !canonicalAccounts.has(row.sourceAccountKey))) {
      terminal.showToast?.("Every funding source must be a current canonical Checking account.", "red");
      return;
    }
    opener = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(opener, "Reviewing price");
    pending = true;
    try {
      const review = await readAuthoritativeTradeReview(api, config, asset, form);
      if (roundStock(review.expectedPrice) !== roundStock(payload.expectedPrice)) {
        try {
          await refreshTradeResources();
          refreshSingleLineBuyFunding(payload, review.expectedPrice);
        } catch {}
        terminal.showToast?.("The Stock price changed. Review the refreshed price and funding amount before submitting again.", "amber");
        return;
      }
      payload = normalizeWritePayload("marketOrder", rawFormPayload(form));
      const expectedGross = roundStock(payload.quantity * payload.expectedPrice);
      const funded = roundStock(payload.allocations.reduce((sum, row) => sum + row.targetAmount, 0));
      if (Math.abs(funded - expectedGross) >= 0.00001) {
        terminal.showToast?.("Funding allocations must exactly equal the listing-currency gross value.", "red");
        return;
      }
      const operation = await api.execute("marketOrder", payload);
      const quote = operation.result?.quote;
      if (!quote || !QUOTE_KEY.test(String(quote.quoteKey || "")) || !Number.isFinite(Date.parse(quote.expiresAt))) throw new Error("The Stock quote response was invalid.");
      transaction = { stage: "buy-quote", side: "buy", asset: review.asset, quantity: payload.quantity, expectedTickIndex: review.expectedTickIndex, currencyCode: quote.listingCurrencyCode, quote, allocations: payload.allocations, error: "" };
      renderTransaction();
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      if (["stale_stock_tick", "stale_stock_price"].includes(String(error?.code || ""))) {
        try { await refreshTradeResources(); } catch {}
        terminal.showToast?.("The Stock market changed during review. Review the refreshed ticket and submit again.", "amber");
      } else terminal.showToast?.(safeMessage(error, "The exact Stock quote could not be created."), "red");
    } finally { restore(); pending = false; }
  }

  async function prepareSell(form) {
    if (pending || destroyed) return;
    const state = terminal.getState();
    if (!isRouteEnabled(state.data?.capabilities, "market") || !isEndpointEnabled(state.data?.capabilities, "marketOrder")) return;
    if (state.data?.market?.status === "CLOSED") { terminal.showToast?.("The Stock market is closed.", "red"); return; }
    const asset = assetForForm(terminal, form);
    if (!asset) return;
    let payload;
    try { payload = normalizeWritePayload("marketOrder", rawFormPayload(form)); }
    catch (error) { terminal.showToast?.(safeMessage(error, "Check the sale details."), "red"); return; }
    const destinationAccount = stateCheckingAccounts(terminal).find((row) => String(row.accountKey).toLowerCase() === payload.destinationAccountKey);
    if (!destinationAccount) { terminal.showToast?.("Choose a current canonical Checking destination.", "red"); return; }
    const owned = marketPositionForAsset(state.data?.portfolio, asset).owned;
    if (payload.quantity > owned) { terminal.showToast?.(`You currently own ${formatNumber(owned)} shares.`, "red"); return; }
    opener = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(opener, "Reviewing price");
    pending = true;
    try {
      const review = await readAuthoritativeTradeReview(api, config, asset, form);
      payload = normalizeWritePayload("marketOrder", rawFormPayload(form));
      transaction = { stage: "sell-review", side: "sell", asset: review.asset, ticker: payload.ticker, quantity: payload.quantity, expectedPrice: review.expectedPrice, expectedTickIndex: review.expectedTickIndex, estimatedGross: roundStock(payload.quantity * review.expectedPrice), currencyCode: asset.listingCurrencyCode, destinationAccount, payload, error: "" };
      renderTransaction();
    } catch (error) {
      if (!dispatchInvalidSession(error, config)) terminal.showToast?.(safeMessage(error, "The Stock sale review could not be refreshed."), "red");
    } finally { restore(); pending = false; }
  }

  async function confirmOrder(button) {
    if (!transaction || pending || !["buy-quote", "sell-review"].includes(transaction.stage)) return;
    if (transaction.stage === "buy-quote" && Date.parse(transaction.quote.expiresAt) <= Date.now()) {
      transaction = { ...transaction, error: "The Stock quote expired. Close it and create a new quote." };
      renderTransaction();
      return;
    }
    const restore = setButtonProcessing(button, transaction.stage === "buy-quote" ? "Settling purchase" : "Settling sale");
    pending = true;
    try {
      api.setSession(config);
      const payload = transaction.stage === "buy-quote"
        ? normalizeWritePayload("marketOrder", { action: "settle_buy_quote", quoteKey: transaction.quote.quoteKey })
        : transaction.payload;
      const operation = await api.execute("marketOrder", payload);
      const settlement = operation.result?.settlement;
      if (!settlement) throw new Error("The Stock settlement response was invalid.");
      const completed = { ...transaction, stage: "receipt", settlement, error: "", refreshWarning: "" };
      orderModalElement(mount)?.remove();
      restoreApplication();
      try { await refreshTradeResources(); }
      catch { completed.refreshWarning = "The trade completed, but balances, holdings, and market data could not be refreshed. Refresh before another trade."; }
      transaction = completed;
      renderTransaction();
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      const staleReview = ["stale_stock_tick", "stale_stock_price"].includes(String(error?.code || ""));
      transaction = { ...transaction, error: staleReview ? `${safeMessage(error)} Close this review and submit again.` : safeMessage(error, "The Stock settlement could not be completed.") };
      renderTransaction();
    } finally { restore(); pending = false; }
  }

  function handleSubmit(event) {
    const form = event.target.closest?.("[data-player-market-order-form]");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.dataset.playerMarketOrderForm === "buy-quote") void createBuyQuote(form);
    else if (form.dataset.playerMarketOrderForm === "sell-review") void prepareSell(form);
  }

  function handleInput(event) {
    const form = event.target.closest?.("[data-player-market-order-form]");
    if (!form) return;
    if (form.dataset.playerMarketOrderForm === "buy-quote") updateBuySummary(terminal, form);
    else updateSellSummary(terminal, form);
  }

  function handleClick(event) {
    const backdrop = event.target.closest?.(".player-terminal-modal-backdrop");
    const dialog = backdrop?.querySelector?.("[data-player-market-order-dialog]");
    if (!dialog) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.target === backdrop || event.target.closest("[data-player-market-order-close]")) { closeModal(); return; }
    const route = event.target.closest("[data-route]")?.dataset.route;
    if (route) { closeModal({ restoreFocus: false }); terminal.navigate?.(route); return; }
    const confirm = event.target.closest("[data-player-market-order-confirm]");
    if (confirm) void confirmOrder(confirm);
  }

  function handleKeyDown(event) {
    const modal = orderModalElement(mount);
    if (!modal) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeModal(); return; }
    if (event.key !== "Tab") return;
    const focusables = focusableElements(modal);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("input", handleInput, true);
  mount.addEventListener("change", handleInput, true);
  mount.addEventListener("click", handleClick, true);
  mount.addEventListener("keydown", handleKeyDown, true);
  return { destroy() { destroyed = true; closeModal({ restoreFocus: false }); mount.removeEventListener("submit", handleSubmit, true); mount.removeEventListener("input", handleInput, true); mount.removeEventListener("change", handleInput, true); mount.removeEventListener("click", handleClick, true); mount.removeEventListener("keydown", handleKeyDown, true); } };
}
