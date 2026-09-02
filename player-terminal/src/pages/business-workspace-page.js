import { isEndpointEnabled } from "../api/capabilities.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderMetric, renderStatusPill } from "../components/ui.js";
import { escapeHtml, formatCurrency, formatNumber, formatPercent } from "../core/format.js";
import { renderBusinessWorkforceMarket } from "./business-workforce-market.js";

const STOCKROOM_ORDER = Object.freeze([
  "warehouse",
  "work_in_progress",
  "finished_goods",
  "in_transit",
]);
const STOCKROOM_LABEL = Object.freeze({
  warehouse: "Warehouse",
  work_in_progress: "Work in Progress",
  finished_goods: "Finished Goods",
  in_transit: "In Transit",
});

function resourceReady(data, key) {
  return data?.resourceStatus?.[key]?.state === "ready";
}

function playerBusinessCurrencyCode(data) {
  const countries = Array.isArray(data.countries) ? data.countries : [];
  const playerCountry = countries.find((country) => country?.isPlayerCountry === true);
  const candidate = String(playerCountry?.currencyCode || data.session?.currencyCode || "ECO").trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,15}$/.test(candidate) ? candidate : "ECO";
}

function hiddenBusinessKey(business) {
  return `<input name="businessKey" type="hidden" value="${escapeHtml(business.company.id)}" />`;
}

function businessWorkspaceNavigation() {
  const links = [
    ["overview", "Overview"],
    ["products", "Products / Recipes"],
    ["stockroom", "Stockroom"],
    ["procurement", "Procurement"],
    ["production", "Production"],
    ["workforce", "Workforce"],
    ["equipment", "Equipment"],
    ["sales", "Sales"],
    ["finance", "Finance"],
    ["governance", "Ownership / Governance"],
    ["activity", "Activity"],
  ];
  return `<nav class="player-terminal-panel player-terminal-business-workspace-nav" aria-label="Business workspace">
    <header class="player-terminal-panel-header"><div><span>BUSINESS WORKSPACE</span><strong>Canonical operating evidence</strong></div>${renderStatusPill("PHASE 12", "cyan")}</header>
    <div class="player-terminal-heading-actions">${links.map(([key, label]) => `<a class="player-terminal-compact-button" href="#business-workspace-${escapeHtml(key)}" data-business-workspace-link="${escapeHtml(key)}">${escapeHtml(label)}</a>`).join("")}</div>
  </nav>`;
}

function businessMoney(value) {
  const amount = typeof value?.amount === "string" ? value.amount.trim() : "";
  const precision = Number(value?.precision);
  const currencyCode = String(value?.currencyCode || "").trim().toUpperCase();
  if (!/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(amount) || !Number.isSafeInteger(precision) || precision < 0 || precision > 18 || !/^[A-Z0-9_]{3,16}$/u.test(currencyCode)) return "Unavailable";
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > precision) return "Unavailable";
  const groupedWhole = whole.replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/gu, ",");
  const fixedFraction = fraction.padEnd(precision, "0");
  return `${currencyCode} ${groupedWhole}${precision ? `.${fixedFraction}` : ""}`;
}

function positiveBusinessAmount(value) {
  const amount = typeof value?.amount === "string" ? value.amount.trim() : "";
  return /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(amount) && /[1-9]/u.test(amount);
}

function businessDecimalStep(value) {
  const precision = Number(value);
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 18) return "any";
  return precision === 0 ? "1" : `0.${"0".repeat(precision - 1)}1`;
}

function formatBusinessRatePercent(value) {
  const rate = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(rate)) return "Unavailable";
  const [whole, fraction = ""] = rate.split(".");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + 2;
  const padded = decimalIndex >= digits.length ? digits.padEnd(decimalIndex + 1, "0") : digits;
  const percentWhole = padded.slice(0, decimalIndex).replace(/^0+(?=[0-9])/u, "") || "0";
  const rawFraction = padded.slice(decimalIndex).replace(/0+$/u, "");
  return `${percentWhole}.${rawFraction.padEnd(2, "0")}%`;
}

function businessTimestamp(value, fallback = "Unavailable") {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fallback;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(parsed));
}

function shortBusinessKey(value) {
  const key = String(value || "");
  return key.length > 17 ? `${key.slice(0, 8)}…${key.slice(-6)}` : key;
}

function treasuryCurrencies(treasury) {
  const currencies = new Set([treasury.reportingCurrencyCode]);
  for (const account of treasury.accounts || []) currencies.add(account.currencyCode);
  for (const rate of treasury.rates || []) {
    currencies.add(rate.sourceCurrencyCode);
    currencies.add(rate.targetCurrencyCode);
  }
  return [...currencies].filter(Boolean).sort();
}

function treasuryAccountCard(account) {
  const usable = account.status === "active" || account.status === "open";
  return `<article class="player-terminal-business-treasury-account${usable ? "" : " is-restricted"}" data-business-treasury-account="${escapeHtml(account.accountKey)}">
    <header><div><small>${escapeHtml(account.currencyCode)} BUSINESS CHECKING</small><strong>${escapeHtml(shortBusinessKey(account.accountKey))}</strong></div>${renderStatusPill(String(account.status || "unknown").toUpperCase(), usable ? "green" : "amber")}</header>
    <dl><div><dt>POSTED</dt><dd>${escapeHtml(businessMoney(account.posted))}</dd></div><div><dt>HELD</dt><dd>${escapeHtml(businessMoney(account.held))}</dd></div><div><dt>AVAILABLE</dt><dd>${escapeHtml(businessMoney(account.available))}</dd></div></dl>
  </article>`;
}

function treasuryQuoteReview(treasury, capabilities) {
  const quote = treasury.currentQuote;
  if (!quote) return `<div class="player-terminal-business-treasury-quote is-empty" data-business-treasury-quote aria-live="polite"><small>IMMUTABLE FX QUOTE</small><strong>Review required before conversion</strong><p>Select a funded Checking account, target currency, source amount, and settlement product.</p></div>`;
  const expired = Date.parse(quote.expiresAt) <= Date.now();
  const endpointKey = quote.product === "instant" ? "businessTreasuryFxInstant" : "businessTreasuryFxStandard";
  const enabled = isEndpointEnabled(capabilities, endpointKey) && !expired;
  return `<div class="player-terminal-business-treasury-quote${expired ? " is-expired" : ""}" data-business-treasury-quote aria-live="polite">
    <header><div><small>${expired ? "QUOTE EXPIRED" : "IMMUTABLE FX QUOTE"}</small><strong>${escapeHtml(quote.sourceAmount.currencyCode)} → ${escapeHtml(quote.targetAmount.currencyCode)} · ${escapeHtml(String(quote.product || "").toUpperCase())}</strong></div>${renderStatusPill(treasury.currentQuoteOutcome === "replayed" ? "REPLAYED" : expired ? "EXPIRED" : "READY", treasury.currentQuoteOutcome === "replayed" ? "purple" : expired ? "amber" : "cyan")}</header>
    <dl><div><dt>SOURCE DEBIT</dt><dd>${escapeHtml(businessMoney(quote.sourceAmount))}</dd></div><div><dt>REFERENCE RATE</dt><dd>${escapeHtml(quote.referenceRate)}</dd></div><div><dt>CUSTOMER RATE</dt><dd>${escapeHtml(quote.customerRate)}</dd></div><div><dt>BANK SPREAD</dt><dd>${escapeHtml(formatBusinessRatePercent(quote.spreadRate))}</dd></div><div><dt>FEE</dt><dd>${escapeHtml(businessMoney(quote.feeAmount))}</dd></div><div><dt>TARGET CREDIT</dt><dd>${escapeHtml(businessMoney(quote.targetAmount))}</dd></div></dl>
    <p>${escapeHtml(quote.roundingDisclosure)} · fixing ${escapeHtml(shortBusinessKey(quote.fixingKey))} · ${quote.product === "standard" ? `settles ${escapeHtml(businessTimestamp(quote.settlesAt))}` : "settles immediately after confirmation"} · expires ${escapeHtml(businessTimestamp(quote.expiresAt))}</p>
    <form data-player-business-treasury-form="order" data-endpoint="${escapeHtml(endpointKey)}"><button class="player-terminal-primary-button" type="submit" ${enabled ? "" : "disabled"}>${icon("arrowSwap")} ${quote.product === "instant" ? "Convert instantly" : "Reserve standard order"}</button></form>
  </div>`;
}

function treasuryOrderRow(order, capabilities) {
  const canCancel = order.product === "standard" && order.completedAt === null && !new Set(["cancelled", "failed", "settled", "completed"]).has(order.status) && isEndpointEnabled(capabilities, "businessTreasuryFxCancel");
  return `<article class="player-terminal-business-treasury-evidence" data-business-treasury-order="${escapeHtml(order.orderKey)}"><div><small>${escapeHtml(String(order.product || "").toUpperCase())} · ${escapeHtml(String(order.status || "").toUpperCase())}</small><strong>${escapeHtml(businessMoney(order.sourceAmount))} → ${escapeHtml(businessMoney(order.targetAmount))}</strong><p>${escapeHtml(shortBusinessKey(order.orderKey))} · submitted ${escapeHtml(businessTimestamp(order.submittedAt))} · settles ${escapeHtml(businessTimestamp(order.settlesAt))}</p></div>${canCancel ? `<form data-player-business-treasury-form="cancel" data-endpoint="businessTreasuryFxCancel" data-order-key="${escapeHtml(order.orderKey)}"><button class="player-terminal-compact-button" type="submit">Cancel pending order</button></form>` : renderStatusPill(String(order.status || "unknown").toUpperCase(), order.status === "settled" || order.status === "completed" ? "green" : order.status === "failed" ? "red" : "cyan")}</article>`;
}

function treasuryReceiptRow(receipt) {
  return `<article class="player-terminal-business-treasury-evidence" data-business-treasury-receipt="${escapeHtml(receipt.receiptKey)}"><div><small>IMMUTABLE ${escapeHtml(String(receipt.product || "").toUpperCase())} RECEIPT</small><strong>${escapeHtml(businessMoney(receipt.sourceAmount))} → ${escapeHtml(businessMoney(receipt.targetAmount))}</strong><p>${escapeHtml(shortBusinessKey(receipt.receiptKey))} · ${escapeHtml(businessTimestamp(receipt.completedAt))} · fee ${escapeHtml(businessMoney(receipt.feeAmount))}</p></div>${renderStatusPill("COMMITTED", "green")}</article>`;
}

function renderTreasuryPanel(data) {
  const treasury = data.businessTreasury;
  const resource = data.resourceStatus?.businessTreasury;
  const capabilities = data.capabilities || { actions: {} };
  const state = resource?.state || (treasury ? "ready" : "loading");
  const hasSnapshot = treasury && treasury.businessKey === data.business.company.id;
  if (!hasSnapshot) {
    const unsupported = resource?.code === "CAPABILITY_UNAVAILABLE";
    return `<section class="player-terminal-panel player-terminal-business-treasury" data-business-treasury-state="${escapeHtml(state)}" aria-live="polite"><header class="player-terminal-panel-header"><div><span>BUSINESS TREASURY</span><strong>${state === "loading" || state === "refreshing" ? "Loading canonical accounts" : unsupported ? "Treasury not enabled" : "Treasury unavailable"}</strong></div>${renderStatusPill(state === "loading" || state === "refreshing" ? "LOADING" : unsupported ? "NOT ENABLED" : "ERROR", state === "loading" || state === "refreshing" ? "cyan" : "amber")}</header>${state === "loading" || state === "refreshing" ? `<div class="player-terminal-business-treasury-loading" aria-label="Loading Business treasury"><i></i><i></i><i></i></div>` : renderEmptyState({ title: unsupported ? "Treasury capability unavailable" : "Current balances could not be refreshed", detail: unsupported ? "This game has not enabled Business treasury controls." : "No cached amount is treated as current.", iconName: "wallet" })}${state === "loading" || state === "refreshing" || unsupported ? "" : `<button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>${icon("refresh")} Retry treasury</button>`}</section>`;
  }
  const accounts = Array.isArray(treasury.accounts) ? treasury.accounts : [];
  const currencies = treasuryCurrencies(treasury);
  const ownedCurrencies = new Set(accounts.map((entry) => entry.currencyCode));
  const openCurrencies = currencies.filter((currency) => !ownedCurrencies.has(currency));
  const sourceAccounts = accounts.filter((entry) => new Set(["active", "open"]).has(entry.status) && positiveBusinessAmount(entry.available));
  const quoteTargets = currencies.filter((currency) => sourceAccounts.some((account) => account.currencyCode !== currency));
  const sourcePrecision = sourceAccounts[0]?.precision;
  return `<section class="player-terminal-panel player-terminal-business-treasury" data-business-treasury-state="${escapeHtml(state)}" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>BUSINESS CHECKING & FX</span><strong>Canonical Banking authority</strong></div>${renderStatusPill(state === "ready" ? "BANKING AUTHORITY" : "STALE", state === "ready" ? "green" : "amber")}</header>
    <div class="player-terminal-business-treasury-meta"><span>Reporting currency <strong>${escapeHtml(treasury.reportingCurrencyCode)}</strong></span><span>Generated <strong>${escapeHtml(businessTimestamp(treasury.generatedAt))}</strong></span><button class="player-terminal-compact-button" type="button" data-business-treasury-refresh>${icon("refresh")} Refresh</button></div>
    <div class="player-terminal-business-treasury-accounts">${accounts.length ? accounts.map(treasuryAccountCard).join("") : renderEmptyState({ title: "No Business Checking accounts", detail: "Open the reporting-currency account before procurement or treasury FX.", iconName: "wallet" })}</div>
    <div class="player-terminal-business-treasury-actions">
      <details class="player-terminal-disclosure"><summary><span>${icon("banking")}</span><div><strong>Open a currency account</strong><small>One canonical Business Checking account per currency</small></div>${icon("chevronRight")}</summary><form data-player-business-treasury-form="account" data-endpoint="businessTreasuryAccountOpen"><label>CURRENCY<select name="currencyCode" required ${openCurrencies.length ? "" : "disabled"}>${openCurrencies.map((currency) => `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`).join("") || `<option value="">All active currencies are open</option>`}</select></label><button class="player-terminal-secondary-button" type="submit" ${openCurrencies.length && isEndpointEnabled(capabilities, "businessTreasuryAccountOpen") ? "" : "disabled"}>Open Checking account</button></form></details>
      <details class="player-terminal-disclosure"><summary><span>${icon("arrowSwap")}</span><div><strong>Convert treasury currency</strong><small>Review exact server-owned FX terms before settlement</small></div>${icon("chevronRight")}</summary><form data-player-business-treasury-form="quote" data-endpoint="businessTreasuryFxQuote"><label>SOURCE CHECKING<select name="sourceAccountKey" required ${sourceAccounts.length ? "" : "disabled"}>${sourceAccounts.map((account) => `<option value="${escapeHtml(account.accountKey)}" data-currency-code="${escapeHtml(account.currencyCode)}" data-precision="${escapeHtml(account.precision)}">${escapeHtml(account.currencyCode)} · ${escapeHtml(businessMoney(account.available))} available</option>`).join("") || `<option value="">No funded account available</option>`}</select></label><label>TARGET CURRENCY<select name="targetCurrencyCode" required ${quoteTargets.length ? "" : "disabled"}>${quoteTargets.map((currency) => `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`).join("") || `<option value="">Open another currency first</option>`}</select></label><label>SOURCE AMOUNT<input name="sourceAmount" type="number" min="${escapeHtml(businessDecimalStep(sourcePrecision))}" step="${escapeHtml(businessDecimalStep(sourcePrecision))}" inputmode="decimal" required /></label><label>PRODUCT<select name="product" required><option value="standard">Standard</option><option value="instant">Instant</option></select></label><button class="player-terminal-primary-button" type="submit" ${sourceAccounts.length && quoteTargets.length && isEndpointEnabled(capabilities, "businessTreasuryFxQuote") ? "" : "disabled"}>${icon("eye")} Review exact quote</button></form><p class="player-terminal-inline-error" role="alert" tabindex="-1" data-business-treasury-error hidden></p>${treasuryQuoteReview(treasury, capabilities)}</details>
    </div>
    ${treasury.refreshPending && treasury.lastCommittedOrder ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Conversion committed; refresh pending</strong><p>Receipt ${escapeHtml(shortBusinessKey(treasury.lastCommittedOrder.receiptKey || treasury.lastCommittedOrder.orderKey))} is authoritative.</p><button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>Refresh committed result</button></div>` : ""}
    <div class="player-terminal-business-treasury-ledger"><section><header><small>PENDING & RECENT ORDERS</small><strong>${escapeHtml(formatNumber(treasury.orders?.length || 0))} orders</strong></header>${treasury.orders?.length ? treasury.orders.map((entry) => treasuryOrderRow(entry, capabilities)).join("") : renderEmptyState({ title: "No treasury orders", detail: "Standard reservations and instant results will appear here after server confirmation.", iconName: "arrowSwap" })}</section><section><header><small>IMMUTABLE FX RECEIPTS</small><strong>${escapeHtml(formatNumber(treasury.receipts?.length || 0))} receipts</strong></header>${treasury.receipts?.length ? treasury.receipts.map(treasuryReceiptRow).join("") : renderEmptyState({ title: "No FX receipts", detail: "Committed conversions appear here as immutable evidence.", iconName: "document" })}</section></div>
  </section>`;
}

function procurementAllocationRows(accounts, reportingCurrencyCode, reportingPrecision) {
  const options = accounts.map((account) => `<option value="${escapeHtml(account.accountKey)}">${escapeHtml(account.currencyCode)} · ${escapeHtml(businessMoney(account.available))} available</option>`).join("");
  const step = businessDecimalStep(reportingPrecision);
  return [0, 1, 2].map((index) => `<div class="player-terminal-business-procurement-allocation" data-business-procurement-allocation data-allocation-index="${index}"><label>ACCOUNT ${index + 1}<select name="sourceAccountKey" ${index === 0 ? "required" : ""} ${index > 0 ? "disabled" : ""}><option value="">${index === 0 ? "Choose Checking account" : "Not used"}</option>${options}</select></label><label><span data-business-procurement-allocation-label>${index === 0 ? "SERVER-DERIVED REMAINDER" : `FIXED CONTRIBUTION · ${escapeHtml(reportingCurrencyCode)}`}</span><input name="targetAmount" type="number" min="${escapeHtml(step)}" step="${escapeHtml(step)}" inputmode="decimal" placeholder="${index === 0 ? "Server derives the full bill" : "Enter fixed amount"}" disabled /></label></div>`).join("");
}

function renderProcurementPanel(data) {
  const treasury = data.businessTreasury;
  if (!treasury || treasury.businessKey !== data.business?.company?.id) return `<section id="business-workspace-procurement" class="player-terminal-panel" data-business-workspace-section="procurement">${renderEmptyState({ title: "Procurement unavailable", detail: "Canonical Business Treasury must load before funded Store procurement can be quoted.", iconName: "warning" })}</section>`;
  const accounts = treasury.accounts.filter((entry) => new Set(["active", "open"]).has(entry.status));
  const reportingPrecision = accounts.find((entry) => entry.currencyCode === treasury.reportingCurrencyCode)?.precision;
  const items = Array.isArray(data.store?.items) ? data.store.items.filter((entry) => /^[a-z0-9_-]{1,64}$/u.test(String(entry.itemKey || entry.id || "")) && Number(entry.stock) > 0) : [];
  const quote = treasury.currentProcurementQuote;
  const receipt = treasury.lastProcurementReceipt;
  const expired = quote ? Date.parse(quote.expiresAt) <= Date.now() : false;
  return `<section id="business-workspace-procurement" class="player-terminal-panel player-terminal-business-procurement" data-business-workspace-section="procurement" data-business-procurement-state="${quote ? expired ? "expired" : "quoted" : receipt ? "settled" : "ready"}" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>PROCUREMENT</span><strong>Store quote → funded settlement → Warehouse</strong></div>${renderStatusPill("CANONICAL STORE", "cyan")}</header>
    <form data-player-business-procurement-form="quote" data-endpoint="businessStoreQuote"><div class="player-terminal-business-procurement-intent"><label>STORE ITEM<select name="itemKey" required ${items.length ? "" : "disabled"}>${items.map((item) => `<option value="${escapeHtml(item.itemKey || item.id)}">${escapeHtml(item.name)} · ${escapeHtml(formatCurrency(item.price, item.currencyCode))} · ${escapeHtml(item.stock)} available</option>`).join("") || `<option value="">No Store input is available</option>`}</select></label><label>QUANTITY<input name="quantity" type="number" min="1" max="100000" step="1" value="1" required /></label></div><div class="player-terminal-business-procurement-summary"><span><small>AUTHORITATIVE BILL</small><strong data-business-procurement-estimate>Server-derived at quote</strong></span><span><small>FIXED ALLOCATIONS</small><strong data-business-procurement-funded>None</strong></span><span><small>REMAINDER</small><strong data-business-procurement-remaining>Choose the final account</strong></span></div><p>Choose one to three ordered, unique Business Checking accounts. The server derives the authoritative bill and exact final remainder.</p><div class="player-terminal-business-procurement-allocations">${procurementAllocationRows(accounts, treasury.reportingCurrencyCode, reportingPrecision)}</div><button class="player-terminal-primary-button" type="submit" data-business-procurement-quote-submit disabled>${icon("eye")} Review funded procurement quote</button></form>
    <p class="player-terminal-inline-error" role="alert" tabindex="-1" data-business-procurement-error hidden></p>
    <div class="player-terminal-business-procurement-quote${quote ? expired ? " is-expired" : "" : " is-empty"}" data-business-procurement-quote>${quote ? `<header><div><small>${expired ? "FUNDED QUOTE EXPIRED" : "IMMUTABLE FUNDED QUOTE"}</small><strong>${escapeHtml(quote.itemName)} · ${escapeHtml(quote.quantity)} units</strong></div>${renderStatusPill(quote.replayed ? "REPLAYED" : expired ? "EXPIRED" : "READY", quote.replayed ? "purple" : expired ? "amber" : "cyan")}</header><dl><div><dt>TARGET BILL</dt><dd>${escapeHtml(businessMoney(quote.fundingQuote.targetAmount))}</dd></div><div><dt>FUNDING LINES</dt><dd>${escapeHtml(quote.fundingQuote.lines.length)}</dd></div><div><dt>EXPIRES</dt><dd>${escapeHtml(businessTimestamp(quote.expiresAt))}</dd></div></dl><form data-player-business-procurement-form="purchase" data-endpoint="businessStorePurchase"><button class="player-terminal-primary-button" type="submit" ${expired || !isEndpointEnabled(data.capabilities, "businessStorePurchase") ? "disabled" : ""}>${icon("cart")} Confirm atomic procurement</button></form>` : `<small>IMMUTABLE FUNDED QUOTE</small><strong>No quote under review</strong><p>Create a current quote before stock, money, or Warehouse state can change.</p>`}</div>
    ${receipt ? `<article class="player-terminal-business-procurement-receipt" data-business-procurement-receipt="${escapeHtml(receipt.receiptKey)}"><header><div><small>IMMUTABLE PROCUREMENT RECEIPT</small><strong>${escapeHtml(receipt.itemName)} · ${escapeHtml(receipt.quantity)} units delivered</strong></div>${renderStatusPill(receipt.alreadyCompleted ? "REPLAYED" : "COMMITTED", receipt.alreadyCompleted ? "purple" : "green")}</header><dl><div><dt>TOTAL PAID</dt><dd>${escapeHtml(businessMoney(receipt.fundingReceipt.targetAmount))}</dd></div><div><dt>WAREHOUSE QUANTITY</dt><dd>${escapeHtml(formatNumber(receipt.warehouseQuantityOwned, 4))}</dd></div><div><dt>AVERAGE COST</dt><dd>${escapeHtml(businessMoney(receipt.warehouseAverageUnitCostMoney))}</dd></div></dl><p>Funding ${escapeHtml(shortBusinessKey(receipt.fundingReceipt.receiptKey))} · Banking ${escapeHtml(shortBusinessKey(receipt.fundingReceipt.bankTransactionKey))} · ${escapeHtml(businessTimestamp(receipt.completedAt))}</p></article>` : ""}
    ${treasury.procurementRefreshPending && receipt ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Procurement committed; refresh pending</strong><p>The receipt above is authoritative.</p><button class="player-terminal-secondary-button" type="button" data-business-procurement-refresh>Refresh committed result</button></div>` : ""}
  </section>`;
}

function renderRecipesPanel(data) {
  const ready = resourceReady(data, "businessRecipes");
  const recipes = ready && Array.isArray(data.businessRecipes?.recipes) ? data.businessRecipes.recipes : [];
  return `<section class="player-terminal-panel player-terminal-business-products"><header class="player-terminal-panel-header"><div><span>CANONICAL RECIPES</span><strong>${ready ? `${escapeHtml(formatNumber(recipes.length))} accessible` : "Read unavailable"}</strong></div>${renderStatusPill(ready ? "SERVER READ" : "NO SUBSTITUTE", ready ? "green" : "amber")}</header><div>${ready ? recipes.length ? recipes.map((recipe) => `<article class="player-terminal-business-product" data-business-recipe="${escapeHtml(recipe.recipeKey || "")}"><div><small>${escapeHtml(recipe.category || "recipe")} · tier ${escapeHtml(formatNumber(recipe.tier || 0))}</small><strong>${escapeHtml(recipe.name || "Recipe")}</strong><p>${escapeHtml(recipe.description || "")}</p><p>${escapeHtml(formatNumber(recipe.baseDurationSeconds || 0))} sec base · scarcity ${escapeHtml(recipe.availability?.scarcityBand || "normal")}</p></div>${renderStatusPill(recipe.availability?.availableNow ? "READY" : "UNAVAILABLE", recipe.availability?.availableNow ? "green" : "amber")}</article>`).join("") : renderEmptyState({ title: "No Business recipes", detail: "Recipe access is server-owned.", iconName: "factory" }) : renderEmptyState({ title: "Canonical recipes unavailable", detail: "No alternate recipe data is substituted.", iconName: "warning" })}</div></section>`;
}

function renderProductsPanel(data) {
  const business = data.business;
  const code = playerBusinessCurrencyCode(data);
  const products = Array.isArray(business.products) ? business.products : [];
  return `<section id="business-workspace-products" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="products"><header class="player-terminal-panel-header"><div><span>PRODUCTS / RECIPES</span><strong>${escapeHtml(formatNumber(products.length))} active products</strong></div>${renderStatusPill("CONSTRAINED", "cyan")}</header><p>Physical production uses existing canonical products and recipe access. Browser-authored product economics are not exposed.</p><div>${products.length ? products.map((product) => `<article class="player-terminal-business-product"><span class="player-terminal-product-icon">${icon("factory")}</span><div><small>${escapeHtml(product.category)}</small><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.description)}</p></div><dl><div><dt>PRICE</dt><dd>${escapeHtml(formatCurrency(product.price, code))}</dd></div><div><dt>MARGIN</dt><dd>${escapeHtml(formatPercent(product.margin, 1))}</dd></div><div><dt>VERSION</dt><dd>v${escapeHtml(formatNumber(product.version || 1))}</dd></div></dl><form data-player-form="business-price" data-endpoint="businessPrice" data-product-id="${escapeHtml(product.id)}">${hiddenBusinessKey(business)}<input name="productKey" type="hidden" value="${escapeHtml(product.id)}" /><input name="expectedVersion" type="hidden" value="${escapeHtml(product.version)}" /><label>NEW PRICE<input name="price" type="number" min="0.01" max="1000000" step="0.01" value="${escapeHtml(product.price)}" required /></label><button class="player-terminal-compact-button" type="submit">${icon("edit")} Update price</button></form></article>`).join("") : renderEmptyState({ title: "No active products", detail: "No canonical physical product is available for manufacturing.", iconName: "business" })}</div>${renderRecipesPanel(data)}</section>`;
}

function renderStockroomItem(item) {
  const currency = String(item.costCurrencyCode || "").trim().toUpperCase();
  return `<article class="player-terminal-business-product" data-business-stockroom-item="${escapeHtml(item.itemKey || "")}" data-business-stockroom-location="${escapeHtml(item.locationKey || "")}"><div><small>${escapeHtml(item.itemClass || "item")} · ${escapeHtml(item.subtype || "stock")}</small><strong>${escapeHtml(item.name || item.canonicalKey || "Stock item")}</strong><p>${escapeHtml(formatNumber(item.quantityAvailable || 0, 4))} available · ${escapeHtml(formatNumber(item.quantityReserved || 0, 4))} reserved · ${escapeHtml(formatNumber(item.quantityOwned || 0, 4))} owned</p></div><dl><div><dt>AVG COST</dt><dd>${escapeHtml(currency ? formatCurrency(item.averageUnitCost || 0, currency) : "Cost unavailable")}</dd></div><div><dt>VERSION</dt><dd>v${escapeHtml(formatNumber(item.version || 0))}</dd></div></dl></article>`;
}

function renderStockroomPanel(data) {
  const ready = resourceReady(data, "businessStockroom");
  const locations = ready && Array.isArray(data.businessStockroom?.locations) ? data.businessStockroom.locations : [];
  const items = ready && Array.isArray(data.businessStockroom?.items) ? data.businessStockroom.items : [];
  const byLocation = new Map(locations.map((location) => [String(location.locationKey), location]));
  return `<section id="business-workspace-stockroom" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="stockroom"><header class="player-terminal-panel-header"><div><span>STOCKROOM</span><strong>Warehouse → WIP → Finished Goods → In Transit</strong></div>${renderStatusPill(ready ? "INVENTORY AUTHORITY" : "NO SUBSTITUTE", ready ? "green" : "amber")}</header>${ready ? STOCKROOM_ORDER.map((locationKey) => { const location = byLocation.get(locationKey); const locationItems = items.filter((item) => item.locationKey === locationKey); return `<section class="player-terminal-business-stockroom-location"><header class="player-terminal-panel-header"><div><span>${escapeHtml(location?.label || STOCKROOM_LABEL[locationKey])}</span><strong>${escapeHtml(formatNumber(location?.quantityAvailable || 0, 4))} available</strong></div><small>${escapeHtml(formatNumber(location?.quantityOwned || 0, 4))} owned · ${escapeHtml(formatNumber(location?.quantityReserved || 0, 4))} reserved</small></header><div>${locationItems.length ? locationItems.map(renderStockroomItem).join("") : renderEmptyState({ title: `No ${STOCKROOM_LABEL[locationKey]} stock`, detail: "Canonical Inventory reports no stock at this location.", iconName: "inventory" })}</div></section>`; }).join("") : renderEmptyState({ title: "Canonical Stockroom unavailable", detail: "Historical aggregate Business inventory is not substituted.", iconName: "warning" })}</section>`;
}

function manufacturingJobsPanel(business) {
  const jobs = Array.isArray(business.manufacturingJobs) ? business.manufacturingJobs : [];
  return jobs.length ? jobs.map((job) => `<article class="player-terminal-business-product" data-business-manufacturing-job="${escapeHtml(job.jobKey)}"><span class="player-terminal-product-icon">${icon("factory")}</span><div><small>${escapeHtml(String(job.status || "queued").replace(/_/gu, " ").toUpperCase())} · ${escapeHtml(job.priority || "standard")}</small><strong>${escapeHtml(job.productName || job.productKey)}</strong><p>${escapeHtml(formatNumber(job.quantity))} units · ${escapeHtml(String(job.resourceState || "").replace(/_/gu, " "))}</p></div>${job.canCancel ? `<form data-player-form="business-manufacturing-cancel" data-endpoint="businessManufacturingCancel" data-business-id="${escapeHtml(job.businessKey)}" data-job-id="${escapeHtml(job.jobKey)}"><button class="player-terminal-compact-button" type="submit">Cancel job</button></form>` : renderStatusPill(String(job.status || "").toUpperCase(), job.status === "completed" ? "green" : job.status === "failed" ? "red" : "cyan")}</article>`).join("") : renderEmptyState({ title: "No manufacturing jobs", detail: "Start an exact catalog product when materials, labor, and equipment are ready.", iconName: "factory" });
}

function readinessRow(entry) {
  const bottlenecks = Array.isArray(entry.bottlenecks) && entry.bottlenecks.length ? entry.bottlenecks.join(" · ") : "none";
  return `<article class="player-terminal-business-product" data-business-production-readiness="${escapeHtml(entry.productKey)}"><div><small>${escapeHtml(entry.recipeKey || "recipe unavailable")}</small><strong>${escapeHtml(entry.productName)}</strong><p>Next planned run: ${escapeHtml(formatNumber(entry.plannedQuantity))} units · max runnable ${escapeHtml(formatNumber(entry.maxRunnableUnits))} · bottleneck ${escapeHtml(bottlenecks)}</p></div><dl><div><dt>MATERIAL</dt><dd>${escapeHtml(formatNumber(entry.materialAvailable, 2))} / ${escapeHtml(formatNumber(entry.materialRequired, 2))}</dd></div><div><dt>LABOR</dt><dd>${escapeHtml(formatNumber(entry.laborAvailableMinutes))} / ${escapeHtml(formatNumber(entry.laborRequiredMinutes))} min</dd></div><div><dt>EQUIPMENT</dt><dd>${escapeHtml(formatNumber(entry.equipmentAvailableMinutes))} / ${escapeHtml(formatNumber(entry.equipmentRequiredMinutes))} min</dd></div></dl>${renderStatusPill(entry.nextRunReady ? "READY" : "BLOCKED", entry.nextRunReady ? "green" : "amber")}</article>`;
}

function renderProductionPanel(data) {
  const business = data.business;
  const readiness = Array.isArray(business.productionReadiness) ? business.productionReadiness : [];
  const products = Array.isArray(business.products) ? business.products : [];
  return `<section id="business-workspace-production" class="player-terminal-panel player-terminal-business-actions" data-business-workspace-section="production"><header class="player-terminal-panel-header"><div><span>PRODUCTION</span><strong>Server-derived readiness and timed manufacturing</strong></div>${renderStatusPill("CANONICAL HOLDS", "cyan")}</header><div>${readiness.length ? readiness.map(readinessRow).join("") : renderEmptyState({ title: "No production readiness evidence", detail: "A canonical physical product and unique accessible recipe are required.", iconName: "factory" })}</div><details class="player-terminal-disclosure" open><summary><span>${icon("factory")}</span><div><strong>Start manufacturing</strong><small>The server atomically reserves exact materials, labor, and equipment</small></div>${icon("chevronRight")}</summary><form data-player-form="business-manufacturing-start" data-endpoint="businessManufacturingStart" data-business-id="${escapeHtml(business.company.id)}"><label>PRODUCT<select name="productKey" required ${products.length ? "" : "disabled"}>${products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join("") || `<option value="">No exact catalog products available</option>`}</select></label><label>RUN SIZE<input name="quantity" type="number" min="1" max="10000" value="10" required /></label><label>PRIORITY<select name="priority"><option value="standard">Standard</option><option value="expedite">Expedite</option></select></label><button class="player-terminal-primary-button" type="submit" ${products.length ? "" : "disabled"}>${icon("factory")} Start manufacturing</button></form></details><div data-business-manufacturing-jobs>${manufacturingJobsPanel(business)}</div></section>`;
}

function workforceUtilization(business, code) {
  const utilization = business.workforceUtilization;
  const employees = Array.isArray(utilization?.employees) ? utilization.employees : [];
  const payroll = utilization?.payroll;
  if (!utilization?.businessKey || !utilization?.payrollPeriodKey || !payroll) return renderEmptyState({ title: "Workforce utilization unavailable", detail: "Production still uses server-authoritative labor checks.", iconName: "users" });
  const currency = payroll.currencyCode || code;
  return `<div data-business-workforce-utilization><div class="player-terminal-business-metrics">${renderMetric({ label: "Payroll period", value: utilization.payrollPeriodKey, meta: String(payroll.status || "not_settled").replace(/[_-]+/gu, " "), tone: "cyan", iconName: "users" })}${renderMetric({ label: "Wages due", value: formatCurrency(payroll.wageDue || 0, currency), meta: `${formatCurrency(payroll.wagePaid || 0, currency)} paid`, tone: "amber", iconName: "wallet" })}${renderMetric({ label: "Unpaid wages", value: formatCurrency(payroll.wageUnpaid || 0, currency), meta: `${formatNumber(payroll.employeeCount || 0)} workers`, tone: payroll.wageUnpaid > 0 ? "red" : "green", iconName: "warning" })}</div><div>${employees.length ? employees.map((employee) => `<article class="player-terminal-business-product"><div><small>${escapeHtml(employee.roleKey)} · ${escapeHtml(employee.latestPayrollStatus)}</small><strong>${escapeHtml(employee.roleName || "Workforce")}</strong><p>${escapeHtml(formatNumber(employee.utilizedMinutes))} / ${escapeHtml(formatNumber(employee.capacityMinutes))} minutes used · ${escapeHtml(formatNumber(employee.availableMinutes))} available</p></div></article>`).join("") : renderEmptyState({ title: "No active workers", detail: "Hire a server-listed candidate before running labor-dependent recipes.", iconName: "users" })}</div></div>`;
}

function renderWorkforcePanel(data) {
  const business = data.business;
  const code = playerBusinessCurrencyCode(data);
  const activeEmployees = (business.employees || []).filter((employee) => String(employee.status).toLowerCase() === "active");
  return `<section id="business-workspace-workforce" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="workforce"><header class="player-terminal-panel-header"><div><span>WORKFORCE</span><strong>${escapeHtml(formatNumber(activeEmployees.length))} active employees</strong></div>${renderStatusPill("FINITE LABOR", "cyan")}</header>${workforceUtilization(business, code)}<div>${activeEmployees.length ? activeEmployees.map((employee) => `<article class="player-terminal-business-product"><div><small>${escapeHtml(employee.contractType)}</small><strong>${escapeHtml(employee.role)}</strong><p>${escapeHtml(formatCurrency(employee.wage, code))} per payroll period</p></div><form data-player-form="business-terminate" data-endpoint="businessTerminate" data-employee-id="${escapeHtml(employee.id)}">${hiddenBusinessKey(business)}<input name="employeeKey" type="hidden" value="${escapeHtml(employee.id)}" /><label>REASON<input name="reason" minlength="2" maxlength="500" required /></label><button class="player-terminal-compact-button" type="submit">Terminate</button></form></article>`).join("") : ""}</div><details class="player-terminal-disclosure"><summary><span>${icon("users")}</span><div><strong>Workforce candidates</strong><small>Select from server-priced, role-grouped candidates</small></div>${icon("chevronRight")}</summary><div class="player-terminal-workforce-market">${renderBusinessWorkforceMarket(data.businessWorkforce, business, code)}</div></details></section>`;
}

function renderEquipmentPanel(data) {
  const ready = resourceReady(data, "businessEquipment");
  const equipment = ready && Array.isArray(data.businessEquipment?.equipment) ? data.businessEquipment.equipment : [];
  const installed = equipment.filter((entry) => entry.installationStatus === "installed");
  return `<section id="business-workspace-equipment" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="equipment"><header class="player-terminal-panel-header"><div><span>EQUIPMENT</span><strong>${ready ? `${escapeHtml(formatNumber(installed.length))} online · ${escapeHtml(formatNumber(equipment.length - installed.length))} offline` : "Read unavailable"}</strong></div>${renderStatusPill(ready ? "SERVER CAPACITY" : "NO SUBSTITUTE", ready ? "green" : "amber")}</header><div>${ready ? equipment.length ? equipment.map((entry) => `<article class="player-terminal-business-product" data-business-equipment-installation="${escapeHtml(entry.installationKey || "")}"><div><small>${escapeHtml(entry.equipmentSlot || "equipment")} · ${escapeHtml(entry.periodKey || "")}</small><strong>${escapeHtml(entry.itemName || entry.canonicalKey || "Equipment")}</strong><p>${escapeHtml((entry.capabilityKeys || []).join(" · ") || "No capability keys")}</p></div><dl><div><dt>AVAILABLE</dt><dd>${escapeHtml(formatNumber(entry.availableMinutes || 0))} min</dd></div><div><dt>RESERVED</dt><dd>${escapeHtml(formatNumber(entry.reservedMinutes || 0))} min</dd></div><div><dt>UTILIZATION</dt><dd>${escapeHtml(formatNumber((entry.utilizationBasisPoints || 0) / 100, 2))}%</dd></div></dl>${renderStatusPill(entry.installationStatus === "installed" ? "ONLINE" : "OFFLINE", entry.installationStatus === "installed" ? "green" : "amber")}</article>`).join("") : renderEmptyState({ title: "No installed Business equipment", detail: "Production remains constrained until canonical Business equipment is installed.", iconName: "factory" }) : renderEmptyState({ title: "Equipment capacity unavailable", detail: "No inferred machine capacity is shown.", iconName: "warning" })}</div></section>`;
}

function renderSalesPanel(data) {
  const business = data.business;
  const offers = Array.isArray(business.salesOffers) ? business.salesOffers : [];
  const sales = Array.isArray(business.storeSales?.sales) ? business.storeSales.sales : [];
  return `<section id="business-workspace-sales" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="sales"><header class="player-terminal-panel-header"><div><span>SALES</span><strong>Finished inventory, Store offers & withdrawal lifecycle</strong></div>${renderStatusPill("STORE AUTHORITY", "green")}</header><div>${offers.length ? offers.map((offer) => `<article class="player-terminal-business-product" data-business-sales-offer="${escapeHtml(offer.offerKey)}"><div><small>${escapeHtml(offer.canonicalKey)}</small><strong>${escapeHtml(offer.itemName)}</strong><p>${escapeHtml(formatNumber(offer.quantityAvailable))} available · ${escapeHtml(formatCurrency(offer.unitPrice, offer.currencyCode))} · v${escapeHtml(formatNumber(offer.version))}</p>${offer.withdrawal ? `<p>Withdrawal ${escapeHtml(offer.withdrawal.mode)} · effective ${escapeHtml(businessTimestamp(offer.withdrawal.effectiveAt))}${offer.withdrawal.lastBlockReason ? ` · blocked: ${escapeHtml(offer.withdrawal.lastBlockReason)}` : ""}</p>` : ""}</div>${renderStatusPill(offer.status === "withdrawal_pending" ? "WITHDRAWAL PENDING" : String(offer.status || "").toUpperCase(), offer.purchaseAllowed ? "green" : "amber")}</article>`).join("") : renderEmptyState({ title: "No current Business Store offers", detail: "Canonical seller offers will appear here after listing stock.", iconName: "store" })}</div><section><header class="player-terminal-panel-header"><div><span>COMMITTED SALES</span><strong>${escapeHtml(formatNumber(sales.length))} receipts</strong></div></header><div>${sales.length ? sales.map((sale) => `<article class="player-terminal-business-product"><div><small>${escapeHtml(sale.offerKey)} · ${escapeHtml(businessTimestamp(sale.completedAt))}</small><strong>${escapeHtml(sale.itemKey)}</strong><p>${escapeHtml(formatNumber(sale.quantity))} units · receipt ${escapeHtml(sale.receiptKey)}</p></div><dl><div><dt>REVENUE</dt><dd>${escapeHtml(formatCurrency(sale.grossRevenue, sale.currencyCode))}</dd></div><div><dt>COGS</dt><dd>${escapeHtml(formatCurrency(sale.costOfGoodsSold, sale.currencyCode))}</dd></div><div><dt>MARGIN</dt><dd>${escapeHtml(formatCurrency(sale.grossMargin, sale.currencyCode))}</dd></div></dl></article>`).join("") : renderEmptyState({ title: "No committed Store sales", detail: "Receipt-backed Business sales will appear here.", iconName: "store" })}</div></section></section>`;
}

function renderGovernancePanel(data) {
  const governance = data.business?.governance;
  if (!governance) return `<section id="business-workspace-governance" class="player-terminal-panel" data-business-workspace-section="governance">${renderEmptyState({ title: "Governance evidence unavailable", detail: "No ownership state is inferred in the browser.", iconName: "warning" })}</section>`;
  const position = governance.currentPosition || {};
  const structure = governance.corporateShareStructure;
  const proposals = Array.isArray(governance.openProposals) ? governance.openProposals : [];
  return `<section id="business-workspace-governance" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="governance"><header class="player-terminal-panel-header"><div><span>OWNERSHIP / GOVERNANCE</span><strong>Canonical read-only evidence</strong></div>${renderStatusPill("READ ONLY", "cyan")}</header><div class="player-terminal-business-metrics">${renderMetric({ label: "Ownership", value: `${formatNumber((position.ownershipBasisPoints || 0) / 100, 2)}%`, meta: `${position.units || "0"} ${position.ownershipKind || "units"}`, tone: "cyan", iconName: "business" })}${renderMetric({ label: "Voting power", value: `${formatNumber((position.votingBasisPoints || 0) / 100, 2)}%`, meta: `${position.votingUnits || "0"} voting units`, tone: "purple", iconName: "users" })}${renderMetric({ label: "Owners", value: formatNumber(governance.ownerCount || 0), meta: `${governance.entityType} · ${governance.taxClassification}`, tone: "green", iconName: "users" })}</div>${structure ? `<dl class="player-terminal-company-facts"><div><dt>AUTHORIZED SHARES</dt><dd>${escapeHtml(structure.authorizedShares)}</dd></div><div><dt>ISSUED</dt><dd>${escapeHtml(structure.issuedShares)}</dd></div><div><dt>TREASURY</dt><dd>${escapeHtml(structure.treasuryShares)}</dd></div><div><dt>OUTSTANDING</dt><dd>${escapeHtml(structure.outstandingShares)}</dd></div></dl>` : ""}<div>${proposals.length ? proposals.map((proposal) => `<article class="player-terminal-business-product"><div><small>${escapeHtml(proposal.proposalType)} · threshold ${escapeHtml(formatNumber(proposal.approvalThresholdBasisPoints / 100, 2))}%</small><strong>${escapeHtml(proposal.proposalKey)}</strong><p>${escapeHtml(String(proposal.status).toUpperCase())} · expires ${escapeHtml(businessTimestamp(proposal.expiresAt))}</p></div>${renderStatusPill(String(proposal.status).toUpperCase(), "cyan")}</article>`).join("") : renderEmptyState({ title: "No open governance proposals", detail: "Phase 12 displays canonical governance evidence but does not add IPO or issuance controls.", iconName: "document" })}</div></section>`;
}

function renderActivityPanel(data) {
  const activity = Array.isArray(data.business?.activity) ? data.business.activity : [];
  return `<section id="business-workspace-activity" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="activity"><header class="player-terminal-panel-header"><div><span>ACTIVITY</span><strong>Immutable Business activity evidence</strong></div>${renderStatusPill("CANONICAL JOURNAL", "green")}</header><div>${activity.length ? activity.map((entry) => `<article class="player-terminal-business-product" data-business-activity="${escapeHtml(entry.activityKey)}"><div><small>${escapeHtml(entry.actorType)} · ${escapeHtml(businessTimestamp(entry.occurredAt))}</small><strong>${escapeHtml(entry.eventType)}</strong><p>${escapeHtml(entry.reasonCode)}${entry.referenceKey ? ` · ${escapeHtml(entry.referenceKey)}` : ""}</p></div></article>`).join("") : renderEmptyState({ title: "No Business activity yet", detail: "Authoritative Business events will appear here without creating a browser-authored journal.", iconName: "document" })}</div></section>`;
}

function renderFinancePanel(data) {
  const sales = data.business?.storeSales || {};
  const code = sales.currencyCode || playerBusinessCurrencyCode(data);
  return `<section id="business-workspace-finance" class="player-terminal-business-products" data-business-workspace-section="finance"><div class="player-terminal-business-metrics">${renderMetric({ label: "Store revenue", value: formatCurrency(sales.recentGrossRevenue || 0, code), meta: `${formatNumber(sales.recentReceiptCount || 0)} committed receipts`, tone: "green", iconName: "wallet" })}${renderMetric({ label: "Store COGS", value: formatCurrency(sales.recentCostOfGoodsSold || 0, code), meta: "Canonical seller receipts", tone: "amber", iconName: "chart" })}${renderMetric({ label: "Gross margin", value: formatCurrency(sales.recentGrossMargin || 0, code), meta: "Revenue less COGS", tone: "cyan", iconName: "chart" })}</div>${renderTreasuryPanel(data)}</section>`;
}

function renderOverviewPanel(data) {
  const business = data.business;
  const readiness = Array.isArray(business.productionReadiness) ? business.productionReadiness : [];
  const blocked = readiness.filter((entry) => entry.nextRunReady !== true);
  const ready = readiness.filter((entry) => entry.nextRunReady === true);
  const bottlenecks = [...new Set(blocked.flatMap((entry) => Array.isArray(entry.bottlenecks) ? entry.bottlenecks : []))];
  return `<section id="business-workspace-overview" class="player-terminal-panel player-terminal-company-overview" data-business-workspace-section="overview"><header class="player-terminal-panel-header"><div><span>OVERVIEW</span><strong>${escapeHtml(business.company.name)}</strong></div>${renderStatusPill(String(business.company.status || "").toUpperCase(), "green")}</header><div class="player-terminal-company-identity"><span>${icon("business")}</span><div><small>${escapeHtml(business.company.registration)}</small><h3>${escapeHtml(business.company.name)}</h3><p>${escapeHtml(business.company.summary)}</p></div></div><dl class="player-terminal-company-facts"><div><dt>HEADQUARTERS</dt><dd>${escapeHtml(business.company.headquarters)}</dd></div><div><dt>EMPLOYEES</dt><dd>${escapeHtml(formatNumber(business.operations.employees))}</dd></div><div><dt>COMPLETED OUTPUT</dt><dd>${escapeHtml(formatNumber(business.operations.output))}</dd></div><div><dt>FINISHED BACKLOG</dt><dd>${escapeHtml(formatNumber(business.operations.backlog))}</dd></div></dl><div class="player-terminal-business-metrics">${renderMetric({ label: "Ready products", value: formatNumber(ready.length), meta: `${formatNumber(readiness.length)} evaluated`, tone: ready.length ? "green" : "amber", iconName: "factory" })}${renderMetric({ label: "Blocked products", value: formatNumber(blocked.length), meta: bottlenecks.length ? bottlenecks.join(" · ") : "No active bottleneck", tone: blocked.length ? "amber" : "green", iconName: "warning" })}${renderMetric({ label: "Owners", value: formatNumber(business.governance?.ownerCount || 0), meta: business.governance?.formationState || "ownership unavailable", tone: "cyan", iconName: "users" })}</div></section>`;
}

function renderStatusControls(data) {
  const business = data.business;
  return `<section class="player-terminal-panel player-terminal-business-actions"><header class="player-terminal-panel-header"><div><span>BUSINESS STATUS</span><strong>Bounded legal-state transition</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "amber")}</header><details class="player-terminal-disclosure"><summary><span>${icon("warning")}</span><div><strong>Change business status</strong><small>Restructure, recover, or permanently close</small></div>${icon("chevronRight")}</summary><form data-player-form="business-status" data-endpoint="businessStatus">${hiddenBusinessKey(business)}<label>TRANSITION<select name="transition"><option value="restructure">Restructure</option><option value="recover">Recover</option><option value="close">Close permanently</option></select></label><label>REASON<textarea name="reason" minlength="2" maxlength="500" required></textarea></label><button class="player-terminal-secondary-button" type="submit">Apply status change</button></form></details></section>`;
}

export function renderBusinessWorkspacePage(data) {
  const business = data.business;
  if (!business?.configured) return "";
  return `<section class="player-terminal-page player-terminal-business-page" data-page="business" data-business-workspace-v2>
    <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Operate from canonical Inventory, Banking, Store, Workforce, Equipment, manufacturing, governance, and receipt evidence.</p></div><div class="player-terminal-heading-actions"><button class="player-terminal-icon-button" type="button" data-player-action="refresh-data" aria-label="Refresh Business data">${icon("refresh")}</button></div></div>
    ${businessWorkspaceNavigation()}
    <div class="player-terminal-business-layout">
      ${renderOverviewPanel(data)}
      ${renderProductsPanel(data)}
      ${renderStockroomPanel(data)}
      ${renderProcurementPanel(data)}
      ${renderProductionPanel(data)}
      ${renderWorkforcePanel(data)}
      ${renderEquipmentPanel(data)}
      ${renderSalesPanel(data)}
      ${renderFinancePanel(data)}
      ${renderGovernancePanel(data)}
      ${renderActivityPanel(data)}
      ${renderStatusControls(data)}
    </div>
  </section>`;
}
