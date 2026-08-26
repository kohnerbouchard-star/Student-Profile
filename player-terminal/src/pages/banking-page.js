import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { isEndpointEnabled } from "../api/capabilities.js";
import { isResourceUnavailable } from "../api/resource-status.js";

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" &&
    Number.isFinite(Number(value));
}

function optionalCurrency(value, currencyCode, fallback = "Not configured") {
  return hasNumericValue(value)
    ? formatCurrency(Number(value), currencyCode)
    : fallback;
}

function optionalPercent(value, fallback = "Not configured") {
  return hasNumericValue(value) ? `${Number(value).toFixed(2)}%` : fallback;
}

function publicAccountType(value) {
  const normalized = String(value || "checking").trim().toLowerCase();
  return normalized === "cash" ? "checking" : normalized || "checking";
}

function publicCheckingAccountId(value) {
  const normalized = String(value || "").trim();
  const semanticAccountId = normalized.toLowerCase();
  if (!normalized || semanticAccountId === "checking" || semanticAccountId === "cash") {
    return "CHECKING";
  }
  return normalized;
}

function displayDateTime(value, fallback = "Unavailable") {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function displayRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate)
    ? rate.toLocaleString(undefined, { maximumFractionDigits: 8 })
    : "Unavailable";
}

function displaySpread(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? `${(rate * 100).toFixed(2)}%` : "Unavailable";
}

function shortPublicKey(value) {
  const key = String(value || "");
  if (key.length <= 15) return key || "Not provided";
  return `${key.slice(0, 7)}…${key.slice(-6)}`;
}

function decimalStep(minorUnit) {
  const precision = Number(minorUnit);
  if (!Number.isSafeInteger(precision) || precision <= 0) return "1";
  return `0.${"0".repeat(precision - 1)}1`;
}

function canonicalBalance(balance) {
  const accountType = publicAccountType(balance.accountKind || balance.accountType);
  const postedAmount = balance.postedAmount ?? balance.balance;
  const heldAmount = balance.heldAmount ?? balance.held ?? 0;
  const availableAmount = balance.availableAmount ?? balance.available ??
    (hasNumericValue(postedAmount) && hasNumericValue(heldAmount)
      ? Number(postedAmount) - Number(heldAmount)
      : null);
  return {
    ...balance,
    accountType,
    accountKind: accountType,
    accountKey: String(balance.accountKey || balance.accountId || "").trim(),
    postedAmount,
    heldAmount,
    availableAmount,
    balance: postedAmount,
    available: availableAmount,
    currencyCode: String(balance.currencyCode || "ECO").trim().toUpperCase() || "ECO",
  };
}

function renderTransaction(transaction, fallbackCurrencyCode) {
  const positive = transaction.amount >= 0;
  const currencyCode = transaction.currencyCode || fallbackCurrencyCode;
  return `<article class="player-terminal-transaction-row ${positive ? "is-credit" : "is-debit"}">
    <span class="is-${positive ? "good" : "cyan"}">${icon(positive ? "contracts" : "arrowSwap")}</span>
    <div>
      <strong>${escapeHtml(transaction.description)}</strong>
      <small>${escapeHtml(transaction.date)} · ${escapeHtml(transaction.category)}</small>
      <span class="player-terminal-transaction-direction">${positive ? "CREDIT" : "DEBIT"} · ${escapeHtml(transaction.status)}</span>
    </div>
    <div>
      <strong class="${positive ? "is-good" : "is-bad"}">${positive ? "+" : ""}${escapeHtml(formatCurrency(transaction.amount, currencyCode))}</strong>
      ${hasNumericValue(transaction.balanceAfter) ? `<small class="player-terminal-transaction-balance">Balance ${escapeHtml(formatCurrency(transaction.balanceAfter, currencyCode))}</small>` : ""}
    </div>
  </article>`;
}

function renderBalanceCard(rawBalance, bank) {
  const balance = canonicalBalance(rawBalance);
  const accountLabel = balance.accountType.replace(/[_-]+/g, " ").toUpperCase();
  const isSavings = balance.accountType === "savings";
  const detail = isSavings && bank.savings?.configured !== false
    ? `${escapeHtml(optionalPercent(bank.savings?.interestRate, "Yield unavailable"))} annual yield · ${escapeHtml(optionalCurrency(bank.savings?.interestEarned, balance.currencyCode, "Interest unavailable"))} earned`
    : balance.accountType === "checking"
    ? `Authoritative ${escapeHtml(balance.currencyCode)} checking account`
    : `Authoritative ${escapeHtml(balance.currencyCode)} account`;
  return `<article class="player-terminal-bank-card ${isSavings ? "is-savings" : "is-checking"}" data-player-banking-balance="${escapeHtml(`${balance.accountType}:${balance.currencyCode}`)}">
    <div>${icon(isSavings ? "banking" : "wallet")}<span><small>${escapeHtml(accountLabel)} ACCOUNT</small><strong>${escapeHtml(balance.currencyCode)}</strong></span></div>
    <h3>${escapeHtml(optionalCurrency(balance.postedAmount, balance.currencyCode, "Unavailable"))}</h3>
    <dl class="player-terminal-bank-balance-breakdown">
      <div><dt>Posted</dt><dd>${escapeHtml(optionalCurrency(balance.postedAmount, balance.currencyCode, "Unavailable"))}</dd></div>
      <div><dt>Held</dt><dd>${escapeHtml(optionalCurrency(balance.heldAmount, balance.currencyCode, "Unavailable"))}</dd></div>
      <div><dt>Available</dt><dd>${escapeHtml(optionalCurrency(balance.availableAmount, balance.currencyCode, "Unavailable"))}</dd></div>
    </dl>
    ${balance.accountKey ? `<p class="player-terminal-bank-account-key"><span>Account</span> <code title="${escapeHtml(balance.accountKey)}">${escapeHtml(shortPublicKey(balance.accountKey))}</code></p>` : ""}
    <p>${detail}</p>
  </article>`;
}

function renderFixing(fixing) {
  if (!fixing) {
    return renderEmptyState({
      title: "Reference fixing unavailable",
      detail: "A quote cannot be created until Banking receives a canonical daily fixing.",
      iconName: "arrowSwap",
    });
  }
  return `<div class="player-terminal-fx-fixing-grid" aria-label="Current reference fixing">
    <article><small>LAST FIXING</small><strong>${escapeHtml(displayDateTime(fixing.effectiveAt))}</strong><span>${escapeHtml(fixing.policyVersion)}</span></article>
    <article><small>NEXT FIXING</small><strong>${escapeHtml(displayDateTime(fixing.nextFixingAt))}</strong><span>Daily at game-local 08:00</span></article>
    <article><small>CALCULATED</small><strong>${escapeHtml(displayDateTime(fixing.calculatedAt))}</strong><span>${fixing.overdue ? "Next fixing overdue" : "Reference current"}</span></article>
  </div>`;
}

function renderAccountOptions(checkingBalances, currencies) {
  const minorUnits = new Map(currencies.map((entry) => [
    entry.currencyCode,
    entry.minorUnit,
  ]));
  return checkingBalances.map((balance) => `<option value="${escapeHtml(balance.accountKey)}" data-currency-code="${escapeHtml(balance.currencyCode)}" data-minor-unit="${escapeHtml(minorUnits.get(balance.currencyCode) ?? 0)}">${escapeHtml(balance.currencyCode)} · ${escapeHtml(optionalCurrency(balance.availableAmount, balance.currencyCode, "Unavailable"))} available · ${escapeHtml(shortPublicKey(balance.accountKey))}</option>`).join("");
}

function renderTargetOptions(currencies, sourceCurrencyCode) {
  return currencies.map((entry) => `<option value="${escapeHtml(entry.currencyCode)}" ${entry.currencyCode === sourceCurrencyCode ? "disabled" : ""}>${escapeHtml(entry.currencyCode)} · ${escapeHtml(entry.minorUnit)} decimal${entry.minorUnit === 1 ? "" : "s"}</option>`).join("");
}

function renderQuote(quote, capabilities) {
  if (!quote) {
    return `<section class="player-terminal-fx-quote-empty" data-player-banking-fx-quote aria-live="polite">
      <small>IMMUTABLE QUOTE</small>
      <strong>No active quote</strong>
      <p>Choose a source account, target currency, amount, and settlement product to review exact terms before committing.</p>
    </section>`;
  }
  const endpointKey = quote.product === "instant" ? "bankingFxInstant" : "bankingFxStandard";
  const actionEnabled = isEndpointEnabled(capabilities, endpointKey);
  return `<section class="player-terminal-fx-quote" data-player-banking-fx-quote aria-live="polite">
    <header><div><small>IMMUTABLE QUOTE</small><strong>${escapeHtml(quote.sourceCurrencyCode)} → ${escapeHtml(quote.targetCurrencyCode)}</strong></div>${renderStatusPill(quote.product === "instant" ? "INSTANT" : "STANDARD", quote.product === "instant" ? "amber" : "cyan")}</header>
    <dl>
      <div><dt>Source debit</dt><dd>${escapeHtml(formatCurrency(quote.sourceAmount, quote.sourceCurrencyCode))}</dd></div>
      <div><dt>Reference rate</dt><dd>${escapeHtml(displayRate(quote.referenceRate))}</dd></div>
      <div><dt>Customer rate</dt><dd>${escapeHtml(displayRate(quote.customerRate))}</dd></div>
      <div><dt>Bank spread</dt><dd>${escapeHtml(displaySpread(quote.spreadRate))}</dd></div>
      <div class="is-fee"><dt>Instant fee</dt><dd>${escapeHtml(formatCurrency(quote.feeAmount, quote.sourceCurrencyCode))}${quote.product === "instant" ? " · 2.00% separate fee" : " · no separate fee"}</dd></div>
      <div class="is-credit"><dt>Expected credit</dt><dd>${escapeHtml(formatCurrency(quote.targetAmount, quote.targetCurrencyCode))}</dd></div>
      <div><dt>Quote expires</dt><dd>${escapeHtml(displayDateTime(quote.expiresAt))}</dd></div>
      <div><dt>Settlement</dt><dd>${escapeHtml(displayDateTime(quote.settlesAt))}</dd></div>
    </dl>
    ${quote.roundingDisclosure ? `<p>${escapeHtml(quote.roundingDisclosure)}</p>` : ""}
    <form data-player-banking-fx-form="order" data-player-form="banking-fx-order" data-endpoint="${endpointKey}">
      <input type="hidden" name="quoteKey" value="${escapeHtml(quote.quoteKey)}" />
      <button class="player-terminal-primary-button" type="submit" ${actionEnabled ? "" : "disabled"}>${icon("arrowSwap")} ${quote.product === "instant" ? "Convert instantly" : "Submit standard order"}</button>
    </form>
  </section>`;
}

function renderHistory(history) {
  const points = Array.isArray(history?.points) ? history.points : [];
  const range = new Set(["7d", "30d", "game"]).has(history?.range) ? history.range : "7d";
  return `<section class="player-terminal-fx-history" aria-labelledby="player-banking-fx-history-title">
    <header>
      <div><small>REFERENCE HISTORY</small><strong id="player-banking-fx-history-title">Fixing history</strong></div>
      <div class="player-terminal-fx-range" role="group" aria-label="FX history range">
        ${[["7d", "7 days"], ["30d", "30 days"], ["game", "Game to date"]].map(([value, label]) => `<button class="player-terminal-compact-button ${range === value ? "is-active" : ""}" type="button" data-player-banking-fx-range="${value}" aria-pressed="${range === value}">${label}</button>`).join("")}
      </div>
    </header>
    <p class="player-terminal-inline-error" role="alert" aria-live="assertive" tabindex="-1" data-player-banking-fx-error ${history?.error ? "" : "hidden"}>${escapeHtml(history?.error || "")}</p>
    <div class="player-terminal-fx-history-list" data-player-banking-fx-history-list>
      ${points.length ? points.map((point) => `<article><time datetime="${escapeHtml(point.effectiveAt)}">${escapeHtml(displayDateTime(point.effectiveAt))}</time><span>${escapeHtml(point.sourceCurrencyCode)} → ${escapeHtml(point.targetCurrencyCode)}</span><strong>${escapeHtml(displayRate(point.referenceRate))}</strong></article>`).join("") : renderEmptyState({ title: "No history loaded", detail: "Choose 7 days, 30 days, or game to date to load this account pair's canonical reference history.", iconName: "chart" })}
    </div>
  </section>`;
}

function renderOrder(order, capabilities) {
  const canCancel = order.cancellable === true && isEndpointEnabled(capabilities, "bankingFxCancel");
  const completion = order.completedAt || order.settlesAt;
  return `<article class="player-terminal-fx-order" data-player-banking-fx-order="${escapeHtml(order.orderKey)}">
    <header><div><small>${escapeHtml(order.product.toUpperCase())}</small><strong>${escapeHtml(order.sourceCurrencyCode)} → ${escapeHtml(order.targetCurrencyCode)}</strong></div>${renderStatusPill(order.status.toUpperCase(), new Set(["settled", "completed"]).has(order.status) ? "green" : order.status === "failed" || order.status === "cancelled" ? "amber" : "cyan")}</header>
    <dl>
      <div><dt>Debit</dt><dd>${escapeHtml(formatCurrency(order.sourceAmount, order.sourceCurrencyCode))}</dd></div>
      <div><dt>Fee</dt><dd>${escapeHtml(formatCurrency(order.feeAmount, order.sourceCurrencyCode))}</dd></div>
      <div><dt>Credit</dt><dd>${escapeHtml(formatCurrency(order.targetAmount, order.targetCurrencyCode))}</dd></div>
      <div><dt>${order.completedAt ? "Completed" : "Settles"}</dt><dd>${escapeHtml(displayDateTime(completion))}</dd></div>
    </dl>
    ${canCancel ? `<form data-player-banking-fx-form="cancel" data-player-form="banking-fx-cancel" data-endpoint="bankingFxCancel" data-order-key="${escapeHtml(order.orderKey)}"><button class="player-terminal-compact-button" type="submit">Cancel pending order</button></form>` : ""}
  </article>`;
}

function renderOrders(fx, capabilities) {
  const pending = Array.isArray(fx.pendingOrders) ? fx.pendingOrders : [];
  const completed = Array.isArray(fx.completedOrders) ? fx.completedOrders : [];
  return `<section class="player-terminal-fx-orders" aria-labelledby="player-banking-fx-orders-title">
    <header><div><small>ORDER HISTORY</small><strong id="player-banking-fx-orders-title">Pending and completed conversions</strong></div><button class="player-terminal-compact-button" type="button" data-player-banking-fx-refresh-orders>Refresh orders</button></header>
    <div class="player-terminal-fx-order-columns">
      <section aria-labelledby="player-banking-fx-pending-title"><h4 id="player-banking-fx-pending-title">Pending orders <span>${pending.length}</span></h4>${pending.length ? pending.map((order) => renderOrder(order, capabilities)).join("") : renderEmptyState({ title: "No pending orders", detail: "Standard conversions waiting for the next eligible fixing will appear here.", iconName: "arrowSwap" })}</section>
      <section aria-labelledby="player-banking-fx-completed-title"><h4 id="player-banking-fx-completed-title">Completed orders <span>${completed.length}</span></h4>${completed.length ? completed.map((order) => renderOrder(order, capabilities)).join("") : renderEmptyState({ title: "No completed orders", detail: "Settled, cancelled, and failed conversions will appear here.", iconName: "banking" })}</section>
    </div>
  </section>`;
}

function renderFxPanel(data, checkingBalances) {
  const fx = data.bankingFx || {};
  const currencies = Array.isArray(fx.currencies) ? fx.currencies : [];
  const unavailable = isResourceUnavailable(data, "bankingFx");
  const quoteEnabled = isEndpointEnabled(data.capabilities, "bankingFxQuote");
  const source = checkingBalances[0] || null;
  const sourceCurrency = currencies.find(
    (entry) => entry.currencyCode === source?.currencyCode,
  );
  const distinctCurrencies = new Set(currencies.map((entry) => entry.currencyCode));
  const canQuote = !unavailable && fx.configured !== false && Boolean(fx.fixing) &&
    Boolean(source?.accountKey) && distinctCurrencies.size > 1 && quoteEnabled;

  if (unavailable) {
    return `<section class="player-terminal-panel player-terminal-fx-panel" data-player-banking-fx-state="error"><header class="player-terminal-panel-header"><div><span>CURRENCY EXCHANGE</span><strong>Canonical FX</strong></div>${renderStatusPill("TEMPORARILY UNAVAILABLE", "amber")}</header>${renderEmptyState({ title: "FX service unavailable", detail: "Balances and posted ledger activity remain visible. Retry Banking when the canonical fixing service is available.", iconName: "arrowSwap" })}</section>`;
  }

  if (!checkingBalances.length || distinctCurrencies.size < 2) {
    return `<section class="player-terminal-panel player-terminal-fx-panel" data-player-banking-fx-state="empty"><header class="player-terminal-panel-header"><div><span>CURRENCY EXCHANGE</span><strong>Canonical FX</strong></div>${renderStatusPill("ACCOUNT SETUP REQUIRED", "amber")}</header>${renderFixing(fx.fixing)}${renderEmptyState({ title: "No exchange pair available", detail: "At least two authoritative Checking currencies are required. Savings accounts cannot fund FX.", iconName: "wallet" })}</section>`;
  }

  return `<section class="player-terminal-panel player-terminal-fx-panel" data-player-banking-fx-state="ready">
    <header class="player-terminal-panel-header"><div><span>CURRENCY EXCHANGE</span><strong>Canonical FX</strong></div>${renderStatusPill(fx.fixing?.overdue ? "FIXING OVERDUE" : "REFERENCE CURRENT", fx.fixing?.overdue ? "amber" : "green")}</header>
    ${renderFixing(fx.fixing)}
    <div class="player-terminal-fx-workspace">
      <form data-player-banking-fx-form="quote" data-player-form="banking-fx-quote" data-endpoint="bankingFxQuote">
        <fieldset><legend>Create an exchange quote</legend>
          <label>SOURCE CHECKING ACCOUNT<select id="player-banking-fx-source" name="sourceAccountKey" required>${renderAccountOptions(checkingBalances, currencies)}</select></label>
          <label>TARGET CURRENCY<select id="player-banking-fx-target" name="targetCurrencyCode" required>${renderTargetOptions(currencies, source?.currencyCode)}</select></label>
          <label>SOURCE AMOUNT<input id="player-banking-fx-amount" name="sourceAmount" type="number" min="${escapeHtml(decimalStep(sourceCurrency?.minorUnit))}" max="999999999999999" step="${escapeHtml(decimalStep(sourceCurrency?.minorUnit))}" inputmode="decimal" required aria-describedby="player-banking-fx-amount-help" placeholder="0.00" /></label>
          <small id="player-banking-fx-amount-help">Amount precision follows the selected source currency. The server rechecks posted, held, and available funds before accepting an order.</small>
          <label>SETTLEMENT PRODUCT<select id="player-banking-fx-product" name="product" required><option value="standard">Standard · 0.50% spread · next fixing</option><option value="instant">Instant · 0.50% spread + separate 2.00% fee</option></select></label>
          <button class="player-terminal-primary-button" type="submit" ${canQuote ? "" : "disabled"}>${icon("arrowSwap")} Review exact quote</button>
        </fieldset>
      </form>
      ${renderQuote(fx.currentQuote, data.capabilities)}
    </div>
    ${renderHistory(fx.history)}
    ${renderOrders(fx, data.capabilities)}
  </section>`;
}

export function renderBankingPage(data) {
  const bank = data.banking;
  const currencyCode = data.session.currencyCode;
  const savingsConfigured = bank.savings?.configured !== false &&
    hasNumericValue(bank.savings?.balance);
  const creditConfigured = bank.creditConfigured === true &&
    hasNumericValue(bank.creditScore);
  const bankTransferConfigured = isEndpointEnabled(data.capabilities, "bankTransfer");
  const savingsTransferConfigured = savingsConfigured &&
    isEndpointEnabled(data.capabilities, "savingsTransfer");
  const transferLimitAvailable = hasNumericValue(bank.transferLimit);
  const transferLimit = transferLimitAvailable ? Number(bank.transferLimit) : null;
  const transferMax = transferLimitAvailable && transferLimit > 0
    ? ` max="${escapeHtml(transferLimit)}"`
    : "";
  const canonicalFxBalances = Array.isArray(data.bankingFx?.balances)
    ? data.bankingFx.balances.map(canonicalBalance)
    : [];
  const ledgerBalances = Array.isArray(bank.balances) && bank.balances.length
    ? bank.balances.map(canonicalBalance)
    : [canonicalBalance({
      accountType: "checking",
      accountKey: bank.checking?.accountId,
      postedAmount: bank.checking?.postedAmount ?? bank.checking?.balance,
      heldAmount: bank.checking?.heldAmount ?? bank.checking?.pending ?? 0,
      availableAmount: bank.checking?.availableAmount ?? bank.checking?.available,
      currencyCode: bank.checking?.currencyCode || currencyCode,
    })];
  const balances = ledgerBalances;
  const hasSavingsBalance = balances.some((balance) => balance.accountType === "savings");
  const checkingBalances = balances.filter((balance) => balance.accountType === "checking");
  const fxCheckingBalances = canonicalFxBalances.filter(
    (balance) => balance.accountType === "checking",
  );
  const canLoadMore = bank.pagination?.hasMore === true &&
    Boolean(bank.pagination?.nextCursor);
  const checkingAccountId = publicCheckingAccountId(
    bank.checking?.accountId || checkingBalances[0]?.accountKey,
  );

  return `<section class="player-terminal-page player-terminal-banking-page" data-page="banking">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER LEDGER & BANKING</small><h2>Banking</h2><p>Review authoritative posted, held, and available balances; exchange currencies against the daily reference fixing; and inspect posted ledger activity.</p></div>
      <div class="player-terminal-heading-actions">${bank.stale ? renderStatusPill("STALE DATA", "amber") : ""}${creditConfigured ? renderStatusPill(`CREDIT ${bank.creditScore}`, "green") : renderStatusPill("CREDIT NOT CONFIGURED", "amber")}</div>
    </header>
    <div class="player-terminal-bank-accounts" aria-label="Current balances">
      ${balances.map((balance) => renderBalanceCard(balance, bank)).join("")}
      ${hasSavingsBalance ? "" : `<article class="player-terminal-bank-card is-savings"><div>${icon("banking")}<span><small>SAVINGS ACCOUNT</small><strong>NOT CONFIGURED</strong></span></div><h3>Not configured</h3><p>The current backend has not provisioned a savings account for this player.</p></article>`}
      <article class="player-terminal-bank-card is-credit"><div>${icon("chart")}<span><small>FINANCIAL PROFILE</small><strong>PLAYER CREDIT</strong></span></div><h3>${creditConfigured ? escapeHtml(bank.creditScore) : "Not configured"}</h3><p>${transferLimitAvailable ? `${escapeHtml(formatCurrency(transferLimit, currencyCode))} transfer limit` : "Credit and transfer limits are not yet available."}</p></article>
    </div>
    ${renderFxPanel(data, fxCheckingBalances.length ? fxCheckingBalances : checkingBalances)}
    <div class="player-terminal-bank-layout">
      <section class="player-terminal-panel player-terminal-transfer-panel">
        <header class="player-terminal-panel-header"><div><span>INTERNAL TRANSFER</span><strong>Move funds</strong></div>${renderStatusPill(savingsTransferConfigured ? "CONFIRMATION REQUIRED" : "BACKEND INTEGRATION PENDING", savingsTransferConfigured ? "cyan" : "amber")}</header>
        <details class="player-terminal-disclosure" open><summary><span>${icon("arrowSwap")}</span><div><strong>Transfer between your accounts</strong><small>${savingsConfigured ? "Move funds between checking and savings" : "Savings account support is not configured"}</small></div>${icon("chevronRight")}</summary>
          <form data-player-form="savings-transfer" data-endpoint="savingsTransfer">
            <label>FROM ACCOUNT<select name="fromAccount" ${savingsConfigured ? "" : "disabled"}><option value="checking">Checking · ${escapeHtml(checkingAccountId)}</option><option value="savings">Savings · ${escapeHtml(bank.savings?.accountId || "NOT CONFIGURED")}</option></select></label>
            <label>TO ACCOUNT<select name="toAccount" ${savingsConfigured ? "" : "disabled"}><option value="savings">Savings · ${escapeHtml(bank.savings?.accountId || "NOT CONFIGURED")}</option><option value="checking">Checking · ${escapeHtml(checkingAccountId)}</option></select></label>
            <label>AMOUNT<input name="amount" type="number" min="1"${transferMax} step="1" required placeholder="0" ${savingsConfigured ? "" : "disabled"}/></label>
            <label>NOTE<input name="note" type="text" maxlength="100" placeholder="Optional transfer note" ${savingsConfigured ? "" : "disabled"}/></label>
            <button class="player-terminal-primary-button" type="submit" ${savingsTransferConfigured ? "" : "disabled"}>${icon("arrowSwap")} Transfer funds</button>
          </form>
        </details>
      </section>
      <section class="player-terminal-panel player-terminal-external-transfer-panel">
        <header class="player-terminal-panel-header"><div><span>PLAYER TRANSFER</span><strong>Send funds</strong></div>${renderStatusPill(bankTransferConfigured ? "CONFIRMATION REQUIRED" : "BACKEND INTEGRATION PENDING", bankTransferConfigured ? "cyan" : "amber")}</header>
        <details class="player-terminal-disclosure" data-player-live-refresh-pause><summary><span>${icon("send")}</span><div><strong>Send money to a player</strong><small>The mutable Player ID will be resolved to the recipient UUID by the backend before funds move</small></div>${icon("chevronRight")}</summary>
          <form data-player-form="bank-transfer" data-endpoint="bankTransfer">
            <label>RECIPIENT PLAYER ID<input name="recipientPlayerIdentifier" type="text" required maxlength="160" autocomplete="off" autocapitalize="characters" placeholder="Enter the current Player ID" /></label>
            <label>AMOUNT<input name="amount" type="number" min="1"${transferMax} step="1" required placeholder="0" /></label>
            <label>MEMO<input name="memo" type="text" maxlength="120" placeholder="Payment description" /></label>
            <button class="player-terminal-primary-button" type="submit" ${bankTransferConfigured ? "" : "disabled"}>${icon("send")} Send transfer</button>
          </form>
        </details>
      </section>
      <section class="player-terminal-panel player-terminal-transactions-panel">
        <header class="player-terminal-panel-header"><div><span>POSTED LEDGER ACTIVITY</span><strong>${escapeHtml(bank.transactions.length)} transactions</strong></div><button class="player-terminal-compact-button" type="button" data-player-local-action="download-transactions">Export</button></header>
        <div class="player-terminal-transaction-list">${bank.transactions.length ? bank.transactions.map((transaction) => renderTransaction(transaction, currencyCode)).join("") : renderEmptyState({ title: "No transactions yet", detail: "Posted purchases, rewards, trades, and future transfers will appear here.", iconName: "banking" })}</div>
        <footer class="player-terminal-panel-footer"><p class="player-terminal-inline-error" role="alert" aria-live="assertive" data-player-banking-page-error hidden></p>${canLoadMore ? `<button class="player-terminal-compact-button" type="button" data-player-banking-load-more>Load more activity</button>` : `<small>All available activity loaded</small>`}</footer>
      </section>
    </div>
  </section>`;
}
