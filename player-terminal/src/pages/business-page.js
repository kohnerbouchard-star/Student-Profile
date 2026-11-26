import { escapeHtml } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { isEndpointEnabled } from "../api/capabilities.js";

function playerBusinessCurrencyCode(data) {
  const countries = Array.isArray(data.countries) ? data.countries : [];
  const playerCountry = countries.find((country) => country?.isPlayerCountry === true);
  const candidate = String(playerCountry?.currencyCode || data.session?.currencyCode || "ECO").trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,15}$/.test(candidate) ? candidate : "ECO";
}

function createBusinessPanel(code) {
  return `<section class="player-terminal-panel player-terminal-business-actions">
    <header class="player-terminal-panel-header"><div><span>BUSINESS FORMATION</span><strong>Create an enterprise</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "amber")}</header>
    <form data-player-form="business-create" data-endpoint="businessCreate">
      <label>LEGAL NAME<input name="legalName" maxlength="120" required /></label>
      <label>ENTITY TYPE<select name="entityType"><option value="sole_proprietorship">Sole proprietorship</option><option value="partnership">Partnership</option><option value="corporation">Corporation</option><option value="cooperative">Cooperative</option></select></label>
      <label>INDUSTRY CODE<input name="industryCode" maxlength="80" placeholder="manufacturing" required /></label>
      <label>STARTING CAPITAL (${escapeHtml(code)})<input name="capitalization" type="number" min="0" max="10000000" step="0.01" value="0" required /></label>
      <button class="player-terminal-primary-button" type="submit">${icon("business")} Submit formation</button>
    </form>
  </section>`;
}

function businessMoney(value) {
  const amount = typeof value?.amount === "string" ? value.amount.trim() : "";
  const precision = Number(value?.precision);
  const currencyCode = String(value?.currencyCode || "").trim().toUpperCase();
  if (
    !/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(amount) ||
    !Number.isSafeInteger(precision) || precision < 0 || precision > 18 ||
    !/^[A-Z0-9_]{3,16}$/u.test(currencyCode)
  ) {
    return "Unavailable";
  }
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > precision) return "Unavailable";
  const groupedWhole = whole.replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/gu, ",");
  const fixedFraction = fraction.padEnd(precision, "0");
  return `${currencyCode} ${groupedWhole}${precision ? `.${fixedFraction}` : ""}`;
}

function positiveBusinessAmount(value) {
  const amount = typeof value?.amount === "string" ? value.amount.trim() : "";
  return /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(amount) &&
    /[1-9]/u.test(amount);
}

function businessDecimalStep(value) {
  const precision = Number(value);
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 18) return "any";
  return precision === 0 ? "1" : `0.${"0".repeat(precision - 1)}1`;
}

export function formatBusinessRatePercent(value) {
  const rate = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(rate)) {
    return "Unavailable";
  }
  const [whole, fraction = ""] = rate.split(".");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + 2;
  const padded = decimalIndex >= digits.length
    ? digits.padEnd(decimalIndex + 1, "0")
    : digits;
  const percentWhole = padded.slice(0, decimalIndex).replace(/^0+(?=[0-9])/u, "") || "0";
  const rawFraction = padded.slice(decimalIndex).replace(/0+$/u, "");
  const percentFraction = rawFraction.padEnd(2, "0");
  return `${percentWhole}.${percentFraction}%`;
}

function businessTimestamp(value, unavailableText = "Unavailable") {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return unavailableText;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(parsed));
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
    <header><div><small>${escapeHtml(account.currencyCode)} BUSINESS CHECKING</small><strong>${escapeHtml(shortBusinessKey(account.accountKey))}</strong></div>${renderStatusPill(account.status.toUpperCase(), usable ? "green" : "amber")}</header>
    <dl>
      <div><dt>POSTED</dt><dd>${escapeHtml(businessMoney(account.posted))}</dd></div>
      <div><dt>HELD</dt><dd>${escapeHtml(businessMoney(account.held))}</dd></div>
      <div><dt>AVAILABLE</dt><dd>${escapeHtml(businessMoney(account.available))}</dd></div>
    </dl>
  </article>`;
}

function treasuryQuoteReview(treasury, capabilities) {
  const quote = treasury.currentQuote;
  if (!quote) {
    return `<div class="player-terminal-business-treasury-quote is-empty" data-business-treasury-quote aria-live="polite"><small>IMMUTABLE FX QUOTE</small><strong>Review required before conversion</strong><p>Select the source, destination currency, amount, and product to request exact server-owned terms.</p></div>`;
  }
  const expired = Date.parse(quote.expiresAt) <= Date.now();
  const endpointKey = quote.product === "instant"
    ? "businessTreasuryFxInstant"
    : "businessTreasuryFxStandard";
  const enabled = isEndpointEnabled(capabilities, endpointKey) && !expired;
  return `<div class="player-terminal-business-treasury-quote${expired ? " is-expired" : ""}" data-business-treasury-quote aria-live="polite">
    <header><div><small>${expired ? "QUOTE EXPIRED" : "IMMUTABLE FX QUOTE"}</small><strong>${escapeHtml(quote.sourceAmount.currencyCode)} → ${escapeHtml(quote.targetAmount.currencyCode)} · ${escapeHtml(quote.product.toUpperCase())}</strong></div>${renderStatusPill(treasury.currentQuoteOutcome === "replayed" ? "REPLAYED" : expired ? "EXPIRED" : "READY", treasury.currentQuoteOutcome === "replayed" ? "purple" : expired ? "amber" : "cyan")}</header>
    <dl>
      <div><dt>SOURCE DEBIT</dt><dd>${escapeHtml(businessMoney(quote.sourceAmount))}</dd></div>
      <div><dt>REFERENCE RATE</dt><dd>${escapeHtml(quote.referenceRate)}</dd></div>
      <div><dt>CUSTOMER RATE</dt><dd>${escapeHtml(quote.customerRate)}</dd></div>
      <div><dt>BANK SPREAD</dt><dd>${escapeHtml(formatBusinessRatePercent(quote.spreadRate))}</dd></div>
      <div><dt>${quote.product === "instant" ? `INSTANT FEE · ${escapeHtml(formatBusinessRatePercent(quote.feeRate))}` : "SEPARATE FEE"}</dt><dd>${escapeHtml(businessMoney(quote.feeAmount))}</dd></div>
      <div><dt>TARGET CREDIT</dt><dd>${escapeHtml(businessMoney(quote.targetAmount))}</dd></div>
    </dl>
    <p>${escapeHtml(quote.roundingDisclosure)} · Fixing ${escapeHtml(shortBusinessKey(quote.fixingKey))} · ${quote.product === "standard" ? `settles ${escapeHtml(businessTimestamp(quote.settlesAt))}` : "settles immediately after confirmation"} · expires ${escapeHtml(businessTimestamp(quote.expiresAt))}</p>
    <form data-player-business-treasury-form="order" data-endpoint="${escapeHtml(endpointKey)}">
      <button class="player-terminal-primary-button" type="submit" ${enabled ? "" : "disabled"}>${icon("arrowSwap")} ${quote.product === "instant" ? "Convert instantly" : "Reserve standard order"}</button>
    </form>
  </div>`;
}

function treasuryOrderRow(order, capabilities) {
  const canCancel = order.product === "standard" && order.completedAt === null &&
    !new Set(["cancelled", "failed", "settled", "completed"]).has(order.status) &&
    isEndpointEnabled(capabilities, "businessTreasuryFxCancel");
  return `<article class="player-terminal-business-treasury-evidence" data-business-treasury-order="${escapeHtml(order.orderKey)}">
    <div><small>${escapeHtml(order.product.toUpperCase())} · ${escapeHtml(order.status.toUpperCase())}</small><strong>${escapeHtml(businessMoney(order.sourceAmount))} → ${escapeHtml(businessMoney(order.targetAmount))}</strong><p>${escapeHtml(shortBusinessKey(order.orderKey))} · submitted ${escapeHtml(businessTimestamp(order.submittedAt))} · settles ${escapeHtml(businessTimestamp(order.settlesAt))}</p></div>
    ${canCancel ? `<form data-player-business-treasury-form="cancel" data-endpoint="businessTreasuryFxCancel" data-order-key="${escapeHtml(order.orderKey)}"><button class="player-terminal-compact-button" type="submit">Cancel pending order</button></form>` : renderStatusPill(order.status.toUpperCase(), order.status === "settled" || order.status === "completed" ? "green" : order.status === "failed" ? "red" : "cyan")}
  </article>`;
}

function treasuryReceiptRow(receipt) {
  return `<article class="player-terminal-business-treasury-evidence" data-business-treasury-receipt="${escapeHtml(receipt.receiptKey)}">
    <div><small>IMMUTABLE ${escapeHtml(receipt.product.toUpperCase())} RECEIPT</small><strong>${escapeHtml(businessMoney(receipt.sourceAmount))} → ${escapeHtml(businessMoney(receipt.targetAmount))}</strong><p>${escapeHtml(shortBusinessKey(receipt.receiptKey))} · ${escapeHtml(businessTimestamp(receipt.completedAt))} · fee ${escapeHtml(businessMoney(receipt.feeAmount))} · target reserve draw ${escapeHtml(businessMoney(receipt.reserveDrawAmount))} · source reserve repayment ${escapeHtml(businessMoney(receipt.reserveRepaymentAmount))}</p></div>${renderStatusPill("COMMITTED", "green")}
  </article>`;
}

export function businessTreasuryPanel(data) {
  const treasury = data.businessTreasury;
  const resource = data.resourceStatus?.businessTreasury;
  const capabilities = data.capabilities || { actions: {} };
  const state = resource?.state || (treasury ? "ready" : "loading");
  const hasSnapshot = treasury && treasury.businessKey === data.business.company.id;
  if (!hasSnapshot) {
    const unsupported = resource?.code === "CAPABILITY_UNAVAILABLE";
    return `<section class="player-terminal-panel player-terminal-business-treasury" data-business-treasury-state="${escapeHtml(state)}" aria-live="polite">
      <header class="player-terminal-panel-header"><div><span>BUSINESS TREASURY</span><strong>${state === "loading" || state === "refreshing" ? "Loading canonical accounts" : unsupported ? "Treasury not enabled" : state === "empty" ? "No treasury snapshot" : "Treasury unavailable"}</strong></div>${renderStatusPill(state === "loading" || state === "refreshing" ? "LOADING" : unsupported ? "NOT ENABLED" : state === "empty" ? "EMPTY" : "ERROR", state === "loading" || state === "refreshing" ? "cyan" : "amber")}</header>
      ${state === "loading" || state === "refreshing" ? `<div class="player-terminal-business-treasury-loading" aria-label="Loading Business treasury"><i></i><i></i><i></i></div>` : renderEmptyState({ title: unsupported ? "Treasury capability unavailable" : state === "empty" ? "No canonical treasury snapshot" : "Current balances could not be refreshed", detail: unsupported ? "This game has not enabled Business treasury controls." : "No cached amount is treated as current. Retry the public-key treasury read.", iconName: "wallet" })}
      <p class="player-terminal-inline-error" role="alert" tabindex="-1" data-business-treasury-error hidden></p>
      ${state === "loading" || state === "refreshing" || unsupported ? "" : `<button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>${icon("refresh")} Retry treasury</button>`}
    </section>`;
  }

  const accounts = Array.isArray(treasury.accounts) ? treasury.accounts : [];
  const currencies = treasuryCurrencies(treasury);
  const ownedCurrencies = new Set(accounts.map((entry) => entry.currencyCode));
  const openCurrencies = currencies.filter((currency) => !ownedCurrencies.has(currency));
  const sourceAccounts = accounts.filter((entry) =>
    new Set(["active", "open"]).has(entry.status) && positiveBusinessAmount(entry.available)
  );
  const quoteTargets = currencies.filter((currency) =>
    sourceAccounts.some((account) => account.currencyCode !== currency)
  );
  const freshness = state === "ready"
    ? { label: "BANKING AUTHORITY", tone: "green", message: "" }
    : state === "refreshing"
    ? { label: "REFRESHING", tone: "cyan", message: "A canonical refresh is in progress. Existing evidence remains visible; submit controls use the last validated snapshot." }
    : { label: "STALE", tone: "amber", message: "The last validated treasury snapshot is preserved, but current balances could not be confirmed. Refresh before starting a new economic action." };
  const sourcePrecision = sourceAccounts[0]?.precision;
  return `<section class="player-terminal-panel player-terminal-business-treasury" data-business-treasury-state="${escapeHtml(state)}" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>BUSINESS TREASURY</span><strong>Canonical Checking accounts & FX</strong></div>${renderStatusPill(freshness.label, freshness.tone)}</header>
    ${freshness.message ? `<div class="player-terminal-business-treasury-freshness" role="status"><p>${escapeHtml(freshness.message)}</p><button class="player-terminal-compact-button" type="button" data-business-treasury-refresh>${icon("refresh")} Refresh canonical state</button></div>` : ""}
    <div class="player-terminal-business-treasury-meta"><span>Reporting currency <strong>${escapeHtml(treasury.reportingCurrencyCode)}</strong></span><span>Generated <strong>${escapeHtml(businessTimestamp(treasury.generatedAt))}</strong></span><button class="player-terminal-compact-button" type="button" data-business-treasury-refresh>${icon("refresh")} Refresh</button></div>
    <div class="player-terminal-business-treasury-accounts">${accounts.length ? accounts.map(treasuryAccountCard).join("") : renderEmptyState({ title: "No Business Checking accounts", detail: "Open the reporting-currency account before procurement or treasury FX.", iconName: "wallet" })}</div>
    <div class="player-terminal-business-treasury-actions">
      <details class="player-terminal-disclosure"><summary><span>${icon("banking")}</span><div><strong>Open a currency account</strong><small>One canonical zero-balance Business Checking account per currency</small></div>${icon("chevronRight")}</summary>
        <form data-player-business-treasury-form="account" data-endpoint="businessTreasuryAccountOpen">
          <label>CURRENCY<select name="currencyCode" required ${openCurrencies.length ? "" : "disabled"}>${openCurrencies.map((currency) => `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`).join("") || `<option value="">All active currencies are open</option>`}</select></label>
          <button class="player-terminal-secondary-button" type="submit" ${openCurrencies.length && isEndpointEnabled(capabilities, "businessTreasuryAccountOpen") ? "" : "disabled"}>Open Checking account</button>
        </form>
      </details>
      <details class="player-terminal-disclosure" open><summary><span>${icon("arrowSwap")}</span><div><strong>Convert treasury currency</strong><small>Review the exact accepted fixing, 0.50% spread, and product timing</small></div>${icon("chevronRight")}</summary>
        <form data-player-business-treasury-form="quote" data-endpoint="businessTreasuryFxQuote">
          <label>SOURCE CHECKING<select name="sourceAccountKey" required ${sourceAccounts.length ? "" : "disabled"}>${sourceAccounts.map((account) => `<option value="${escapeHtml(account.accountKey)}" data-currency-code="${escapeHtml(account.currencyCode)}" data-precision="${escapeHtml(account.precision)}">${escapeHtml(account.currencyCode)} · ${escapeHtml(businessMoney(account.available))} available</option>`).join("") || `<option value="">No funded account available</option>`}</select></label>
          <label>TARGET CURRENCY<select name="targetCurrencyCode" required ${quoteTargets.length ? "" : "disabled"}>${quoteTargets.map((currency) => `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`).join("") || `<option value="">Open another currency first</option>`}</select></label>
          <label>SOURCE AMOUNT<input name="sourceAmount" type="number" min="${escapeHtml(businessDecimalStep(sourcePrecision))}" step="${escapeHtml(businessDecimalStep(sourcePrecision))}" inputmode="decimal" required /></label>
          <label>PRODUCT<select name="product" required><option value="standard">Standard · next game-local 08:00</option><option value="instant">Instant · separate 2.00% fee</option></select></label>
          <button class="player-terminal-primary-button" type="submit" ${sourceAccounts.length && quoteTargets.length && isEndpointEnabled(capabilities, "businessTreasuryFxQuote") ? "" : "disabled"}>${icon("eye")} Review exact quote</button>
        </form>
        <p class="player-terminal-inline-error" role="alert" tabindex="-1" data-business-treasury-error hidden></p>
        ${treasuryQuoteReview(treasury, capabilities)}
      </details>
    </div>
    ${treasury.refreshPending && treasury.lastCommittedOrder ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Conversion committed; refresh pending</strong><p>Receipt ${escapeHtml(shortBusinessKey(treasury.lastCommittedOrder.receiptKey || treasury.lastCommittedOrder.orderKey))} is authoritative. Balances will refresh without resubmitting.</p><button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>Refresh committed result</button></div>` : ""}
    ${treasury.accountRefreshPending && treasury.lastAccountOpen ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Account opened; refresh pending</strong><p>${escapeHtml(treasury.lastAccountOpen.currencyCode)} Business Checking ${escapeHtml(shortBusinessKey(treasury.lastAccountOpen.accountKey))} is authoritative. Refresh the treasury projection without resubmitting.</p><button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>Refresh opened account</button></div>` : ""}
    <div class="player-terminal-business-treasury-ledger"><section><header><small>PENDING & RECENT ORDERS</small><strong>${escapeHtml(treasury.orders.length)} orders</strong></header>${treasury.orders.length ? treasury.orders.map((entry) => treasuryOrderRow(entry, capabilities)).join("") : renderEmptyState({ title: "No treasury orders", detail: "Standard reservations and instant results will appear here after server confirmation.", iconName: "arrowSwap" })}</section><section><header><small>IMMUTABLE FX RECEIPTS</small><strong>${escapeHtml(treasury.receipts.length)} receipts</strong></header>${treasury.receipts.length ? treasury.receipts.map(treasuryReceiptRow).join("") : renderEmptyState({ title: "No FX receipts", detail: "Committed conversions will appear here as immutable public-key evidence.", iconName: "document" })}</section></div>
  </section>`;
}

export function renderBusinessPage(data) {
  const code = playerBusinessCurrencyCode(data);
  if (data.business.configured === true) return "";
  return `<section class="player-terminal-page player-terminal-business-page" data-page="business">
    <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Create one game-scoped enterprise using your authoritative country and currency.</p></div></div>
    <div class="player-terminal-business-layout">${createBusinessPanel(code)}</div>
  </section>`;
}
