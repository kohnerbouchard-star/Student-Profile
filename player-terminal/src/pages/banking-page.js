import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function renderTransaction(transaction, currencyCode) {
  const positive = transaction.amount >= 0;
  return `<article class="player-terminal-transaction-row">
    <span class="is-${positive ? "good" : "cyan"}">${icon(positive ? "contracts" : "arrowSwap")}</span>
    <div><strong>${escapeHtml(transaction.description)}</strong><small>${escapeHtml(transaction.date)} · ${escapeHtml(transaction.category)}</small></div>
    <div><strong class="${positive ? "is-good" : ""}">${positive ? "+" : ""}${escapeHtml(formatCurrency(transaction.amount, currencyCode))}</strong><small>${escapeHtml(transaction.status)}</small></div>
  </article>`;
}

export function renderBankingPage(data) {
  const bank = data.banking;
  const currencyCode = data.session.currencyCode;
  const savingsConfigured = bank.savings?.configured !== false;
  const savingsInterestConfigured = savingsConfigured &&
    bank.savings?.interestRate !== null &&
    bank.savings?.interestRate !== undefined &&
    Number.isFinite(Number(bank.savings.interestRate));
  const creditConfigured = bank.creditConfigured !== false && Number.isFinite(Number(bank.creditScore));
  const transfersConfigured = bank.transfersConfigured !== false && Number(bank.transferLimit) > 0;
  const transferDisabled = transfersConfigured ? "" : "disabled";
  const transferLimit = transfersConfigured ? Number(bank.transferLimit) : 0;

  return `<section class="player-terminal-page player-terminal-banking-page" data-page="banking">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER BANKING NETWORK</small><h2>Banking</h2><p>Review connected account balances, transaction history, and transfer availability.</p></div>
      <div class="player-terminal-heading-actions">${renderStatusPill(creditConfigured ? `CREDIT ${bank.creditScore}` : "CREDIT UNAVAILABLE", creditConfigured ? "green" : "amber")}</div>
    </header>

    <div class="player-terminal-bank-accounts">
      <article class="player-terminal-bank-card is-checking"><div>${icon("wallet")}<span><small>CHECKING ACCOUNT</small><strong>${escapeHtml(bank.checking.accountId)}</strong></span></div><h3>${escapeHtml(formatCurrency(bank.checking.balance, currencyCode))}</h3><p>${escapeHtml(formatCurrency(bank.checking.available, currencyCode))} available</p></article>
      <article class="player-terminal-bank-card is-savings"><div>${icon("banking")}<span><small>SAVINGS ACCOUNT</small><strong>${escapeHtml(bank.savings.accountId)}</strong></span></div><h3>${savingsConfigured ? escapeHtml(formatCurrency(bank.savings.balance, currencyCode)) : "Unavailable"}</h3><p>${savingsInterestConfigured ? `${escapeHtml(Number(bank.savings.interestRate).toFixed(2))}% annual yield · ${escapeHtml(formatCurrency(bank.savings.interestEarned, currencyCode))} earned` : savingsConfigured ? "Interest policy is not configured for this game." : "Savings is not configured for this game."}</p></article>
      <article class="player-terminal-bank-card is-credit"><div>${icon("chart")}<span><small>FINANCIAL PROFILE</small><strong>PLAYER CREDIT</strong></span></div><h3>${creditConfigured ? escapeHtml(bank.creditScore) : "Unavailable"}</h3><p>${transfersConfigured ? `${escapeHtml(formatCurrency(transferLimit, currencyCode))} transfer limit` : "Transfers are not configured for this game."}</p></article>
    </div>

    <div class="player-terminal-bank-layout">
      <section class="player-terminal-panel player-terminal-transfer-panel">
        <header class="player-terminal-panel-header"><div><span>INTERNAL TRANSFER</span><strong>Move funds</strong></div>${renderStatusPill(transfersConfigured ? "API READY" : "NOT CONFIGURED", transfersConfigured ? "cyan" : "amber")}</header>
        <details class="player-terminal-disclosure" open><summary><span>${icon("arrowSwap")}</span><div><strong>Transfer between your accounts</strong><small>Move funds between checking and savings</small></div>${icon("chevronRight")}</summary><form data-player-form="savings-transfer" data-endpoint="savingsTransfer">
          <label>FROM ACCOUNT<select name="fromAccount" ${transferDisabled}><option value="checking">Checking · ${escapeHtml(bank.checking.accountId)}</option><option value="savings">Savings · ${escapeHtml(bank.savings.accountId)}</option></select></label>
          <label>TO ACCOUNT<select name="toAccount" ${transferDisabled}><option value="savings">Savings · ${escapeHtml(bank.savings.accountId)}</option><option value="checking">Checking · ${escapeHtml(bank.checking.accountId)}</option></select></label>
          <label>AMOUNT<input name="amount" type="number" min="1" max="${escapeHtml(transferLimit)}" step="1" required placeholder="0" ${transferDisabled} /></label>
          <label>NOTE<input name="note" type="text" maxlength="100" placeholder="Optional transfer note" ${transferDisabled} /></label>
          <button class="player-terminal-primary-button" type="submit" ${transferDisabled}>${icon("arrowSwap")} Transfer funds</button>
        </form></details>
      </section>

      <section class="player-terminal-panel player-terminal-external-transfer-panel">
        <header class="player-terminal-panel-header"><div><span>PLAYER TRANSFER</span><strong>Send funds</strong></div>${renderStatusPill("REQUIRES API", "amber")}</header>
        <details class="player-terminal-disclosure"><summary><span>${icon("send")}</span><div><strong>Send money to a player</strong><small>Recipient verification occurs after API connection</small></div>${icon("chevronRight")}</summary><form data-player-form="bank-transfer" data-endpoint="bankTransfer">
          <label>RECIPIENT PLAYER ID<input name="recipientPlayerId" type="text" required pattern="[A-Za-z]{2}-[0-9]{4}-[0-9]{3}" title="Use the format EN-0000-000" autocomplete="off" autocapitalize="characters" placeholder="EN-0000-000" ${transferDisabled} /></label>
          <label>AMOUNT<input name="amount" type="number" min="1" max="${escapeHtml(transferLimit)}" step="1" required placeholder="0" ${transferDisabled} /></label>
          <label>MEMO<input name="memo" type="text" maxlength="120" placeholder="Payment description" ${transferDisabled} /></label>
          <button class="player-terminal-primary-button" type="submit" ${transferDisabled}>${icon("send")} Send transfer</button>
        </form></details>
      </section>

      <section class="player-terminal-panel player-terminal-transactions-panel">
        <header class="player-terminal-panel-header"><div><span>RECENT ACTIVITY</span><strong>${escapeHtml(bank.transactions.length)} transactions</strong></div><button class="player-terminal-compact-button" type="button" data-player-local-action="download-transactions">Export</button></header>
        <div class="player-terminal-transaction-list">${bank.transactions.length ? bank.transactions.map((transaction) => renderTransaction(transaction, currencyCode)).join("") : renderEmptyState({ title: "No transactions yet", detail: "Posted transfers, purchases, rewards, and interest will appear here.", iconName: "banking" })}</div>
      </section>
    </div>
  </section>`;
}
