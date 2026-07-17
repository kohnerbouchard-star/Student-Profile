import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function optionalCurrency(value, currencyCode, fallback = "Not configured") {
  return Number.isFinite(Number(value)) ? formatCurrency(Number(value), currencyCode) : fallback;
}

function optionalPercent(value, fallback = "Not configured") {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : fallback;
}

function renderTransaction(transaction, fallbackCurrencyCode) {
  const positive = transaction.amount >= 0;
  const currencyCode = transaction.currencyCode || fallbackCurrencyCode;
  return `<article class="player-terminal-transaction-row">
    <span class="is-${positive ? "good" : "cyan"}">${icon(positive ? "contracts" : "arrowSwap")}</span>
    <div><strong>${escapeHtml(transaction.description)}</strong><small>${escapeHtml(transaction.date)} · ${escapeHtml(transaction.category)}</small></div>
    <div><strong class="${positive ? "is-good" : ""}">${positive ? "+" : ""}${escapeHtml(formatCurrency(transaction.amount, currencyCode))}</strong><small>${escapeHtml(transaction.status)}</small></div>
  </article>`;
}

export function renderBankingPage(data) {
  const bank = data.banking;
  const currencyCode = data.session.currencyCode;
  const savingsConfigured = bank.savings?.configured !== false && Number.isFinite(Number(bank.savings?.balance));
  const creditConfigured = bank.creditConfigured === true && Number.isFinite(Number(bank.creditScore));
  const transfersConfigured = bank.transfersConfigured === true;
  const transferLimit = Number(bank.transferLimit);
  const transferMax = Number.isFinite(transferLimit) && transferLimit > 0 ? ` max="${escapeHtml(transferLimit)}"` : "";

  return `<section class="player-terminal-page player-terminal-banking-page" data-page="banking">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER LEDGER & BANKING</small><h2>Banking</h2><p>Review authoritative cash balances and posted ledger activity. Additional account and transfer tools remain visible as backend capabilities are added.</p></div>
      <div class="player-terminal-heading-actions">${creditConfigured ? renderStatusPill(`CREDIT ${bank.creditScore}`, "green") : renderStatusPill("CREDIT NOT CONFIGURED", "amber")}</div>
    </header>

    <div class="player-terminal-bank-accounts">
      <article class="player-terminal-bank-card is-checking"><div>${icon("wallet")}<span><small>CASH ACCOUNT</small><strong>${escapeHtml(bank.checking.accountId || "CASH")}</strong></span></div><h3>${escapeHtml(optionalCurrency(bank.checking.balance, currencyCode, "Unavailable"))}</h3><p>${escapeHtml(optionalCurrency(bank.checking.available, currencyCode, "Unavailable"))} available</p></article>
      <article class="player-terminal-bank-card is-savings"><div>${icon("banking")}<span><small>SAVINGS ACCOUNT</small><strong>${escapeHtml(savingsConfigured ? bank.savings.accountId : "NOT CONFIGURED")}</strong></span></div><h3>${escapeHtml(optionalCurrency(bank.savings?.balance, currencyCode))}</h3><p>${savingsConfigured ? `${escapeHtml(optionalPercent(bank.savings.interestRate, "Yield unavailable"))} annual yield · ${escapeHtml(optionalCurrency(bank.savings.interestEarned, currencyCode, "Interest unavailable"))} earned` : "The current backend has not provisioned a savings account for this player."}</p></article>
      <article class="player-terminal-bank-card is-credit"><div>${icon("chart")}<span><small>FINANCIAL PROFILE</small><strong>PLAYER CREDIT</strong></span></div><h3>${creditConfigured ? escapeHtml(bank.creditScore) : "Not configured"}</h3><p>${Number.isFinite(transferLimit) ? `${escapeHtml(formatCurrency(transferLimit, currencyCode))} transfer limit` : "Credit and transfer limits are not yet available."}</p></article>
    </div>

    <div class="player-terminal-bank-layout">
      <section class="player-terminal-panel player-terminal-transfer-panel">
        <header class="player-terminal-panel-header"><div><span>INTERNAL TRANSFER</span><strong>Move funds</strong></div>${renderStatusPill(savingsConfigured && transfersConfigured ? "CONFIRMATION REQUIRED" : "BACKEND INTEGRATION PENDING", savingsConfigured && transfersConfigured ? "cyan" : "amber")}</header>
        <details class="player-terminal-disclosure" open><summary><span>${icon("arrowSwap")}</span><div><strong>Transfer between your accounts</strong><small>${savingsConfigured ? "Move funds between cash and savings" : "Savings account support is not configured"}</small></div>${icon("chevronRight")}</summary><form data-player-form="savings-transfer" data-endpoint="savingsTransfer">
          <label>FROM ACCOUNT<select name="fromAccount" ${savingsConfigured ? "" : "disabled"}><option value="checking">Cash · ${escapeHtml(bank.checking.accountId || "CASH")}</option><option value="savings">Savings · ${escapeHtml(bank.savings?.accountId || "NOT CONFIGURED")}</option></select></label>
          <label>TO ACCOUNT<select name="toAccount" ${savingsConfigured ? "" : "disabled"}><option value="savings">Savings · ${escapeHtml(bank.savings?.accountId || "NOT CONFIGURED")}</option><option value="checking">Cash · ${escapeHtml(bank.checking.accountId || "CASH")}</option></select></label>
          <label>AMOUNT<input name="amount" type="number" min="1"${transferMax} step="1" required placeholder="0" ${savingsConfigured ? "" : "disabled"}/></label>
          <label>NOTE<input name="note" type="text" maxlength="100" placeholder="Optional transfer note" ${savingsConfigured ? "" : "disabled"}/></label>
          <button class="player-terminal-primary-button" type="submit" ${savingsConfigured && transfersConfigured ? "" : "disabled"}>${icon("arrowSwap")} Transfer funds</button>
        </form></details>
      </section>

      <section class="player-terminal-panel player-terminal-external-transfer-panel">
        <header class="player-terminal-panel-header"><div><span>PLAYER TRANSFER</span><strong>Send funds</strong></div>${renderStatusPill(transfersConfigured ? "CONFIRMATION REQUIRED" : "BACKEND INTEGRATION PENDING", "amber")}</header>
        <details class="player-terminal-disclosure"><summary><span>${icon("send")}</span><div><strong>Send money to a player</strong><small>The mutable Player ID will be resolved to the recipient UUID by the backend before funds move</small></div>${icon("chevronRight")}</summary><form data-player-form="bank-transfer" data-endpoint="bankTransfer">
          <label>RECIPIENT PLAYER ID<input name="recipientPlayerIdentifier" type="text" required maxlength="160" autocomplete="off" autocapitalize="characters" placeholder="Enter the current Player ID" /></label>
          <label>AMOUNT<input name="amount" type="number" min="1"${transferMax} step="1" required placeholder="0" /></label>
          <label>MEMO<input name="memo" type="text" maxlength="120" placeholder="Payment description" /></label>
          <button class="player-terminal-primary-button" type="submit" ${transfersConfigured ? "" : "disabled"}>${icon("send")} Send transfer</button>
        </form></details>
      </section>

      <section class="player-terminal-panel player-terminal-transactions-panel">
        <header class="player-terminal-panel-header"><div><span>POSTED LEDGER ACTIVITY</span><strong>${escapeHtml(bank.transactions.length)} transactions</strong></div><button class="player-terminal-compact-button" type="button" data-player-local-action="download-transactions">Export</button></header>
        <div class="player-terminal-transaction-list">${bank.transactions.length ? bank.transactions.map((transaction) => renderTransaction(transaction, currencyCode)).join("") : renderEmptyState({ title: "No transactions yet", detail: "Posted purchases, rewards, trades, and future transfers will appear here.", iconName: "banking" })}</div>
      </section>
    </div>
  </section>`;
}
