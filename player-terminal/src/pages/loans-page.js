import { loanMoney, renderLoanHistory, renderLoanForecast, forecastPayment } from "./loans-history.js";
import { escapeHtml } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderMetric, renderStatusPill } from "../components/ui.js";

function loanTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("default") || value.includes("delinquent")) return "red";
  if (value.includes("restructur")) return "amber";
  return "green";
}

function repaymentAccountOptions(selected, businessKey) {
  if (selected?.borrowerType === "business") {
    return businessKey
      ? [{ value: `business:${businessKey}`, label: "Business operating account" }]
      : [];
  }
  return [
    { value: "checking", label: "Checking account" },
    { value: "savings", label: "Savings account" },
  ];
}

function forecastNextPayment(forecast, currency) {
  if (!forecast) return "Unavailable";
  const rows = forecast.facilities.filter((row) => row.currencyCode === currency || !row.currencyCode);
  if (rows.some((row) => row.state !== "available")) return "Unavailable";
  const next = rows.flatMap((row) => row.installments.slice(0, 1)).sort((a, b) => a.due.localeCompare(b.due));
  if (!next.length) return "None scheduled";
  const sum = next.filter((row) => row.due === next[0].due).reduce((value, row) => value + BigInt(row.amount.replace(".", "")), 0n);
  const digits = sum.toString().padStart(3, "0");
  return loanMoney(`${digits.slice(0, -2)}.${digits.slice(-2)}`, currency);
}

function currencyMetrics(projection, forecast) {
  const groups = projection?.complete === true ? projection.groups : [];
  if (!groups?.length) return ["Available credit", "Outstanding", "Next payment"].map((label) =>
    renderMetric({ label, value: "Unavailable", meta: projection?.complete ? "No currency obligations or offers" :
      projection ? "Currency totals incomplete" : "Currency totals unavailable", iconName: "banking" })).join("");
  return groups.map((group) => [
    renderMetric({ label: "Available credit", value: loanMoney(group.availableCredit, group.currencyCode), meta: "Across eligible offers", tone: "cyan", iconName: "banking" }),
    renderMetric({ label: "Active recorded debt", value: loanMoney(group.outstanding, group.currencyCode), meta: "Excludes defaulted facilities; see recorded debt", tone: "amber", iconName: "wallet" }),
    renderMetric({ label: "Next payment", value: forecastNextPayment(forecast, group.currencyCode),
      meta: "Recorded-balance estimate; excludes new interest", tone: "purple", iconName: "clock" }),
  ].join("")).join("");
}

export function renderLoansPage(data, ui) {
  const loans = data.loans;
  const selected = loans.offers.find((item) => item.id === ui.loanOfferId) || loans.offers[0] || null;
  const activeLoan = loans.activeLoans[0] || null;
  const businessKey = data.business?.configured ? String(data.business.company?.id || "") : "";
  const selectedNeedsBusiness = selected?.borrowerType === "business";
  const selectedCanApply = Boolean(selected) && (!selectedNeedsBusiness || Boolean(businessKey));
  const repaymentAccounts = repaymentAccountOptions(selected, businessKey);
  const repaymentOptions = repaymentAccounts.map((account, index) => `<option value="${escapeHtml(account.value)}"${index === 0 ? " selected" : ""}>${escapeHtml(account.label)}</option>`).join("");
  return `<section class="player-terminal-page player-terminal-loans-page">
    <div class="player-terminal-page-heading"><div><small>CREDIT CENTER</small><h2>Loans</h2><p>Review economic-only eligibility, disclosures, applications, and repayment schedules.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`SCORE ${loans.creditScore}`, loans.creditScore >= 700 ? "green" : "amber")}</div></div>

    <div class="player-terminal-loan-metrics">
      ${currencyMetrics(loans.currencyProjection, loans.repaymentForecast)}
      ${renderMetric({ label: "On-time rate", value: `${loans.onTimeRate}%`, meta: `${loans.paymentsMade} payments recorded`, tone: "green", iconName: "check" })}
    </div>

    <div class="player-terminal-loans-layout">
      <section class="player-terminal-panel player-terminal-loan-offers">
        <header class="player-terminal-panel-header"><div><span>ELIGIBLE OFFERS</span><strong>${escapeHtml(loans.offers.length)} options</strong></div>${renderStatusPill("NO AUTO-APPROVAL", "amber")}</header>
        <div>${loans.offers.length ? loans.offers.map((offer) => `<button class="player-terminal-loan-offer${offer.id === selected?.id ? " active" : ""}" type="button" data-player-loan-offer="${escapeHtml(offer.id)}"><span>${icon(offer.icon)}</span><div><small>${escapeHtml(offer.purpose)}</small><strong>${escapeHtml(offer.name)}</strong><p>${escapeHtml(offer.description)}</p></div><dl><div><dt>LIMIT</dt><dd>${escapeHtml(loanMoney(offer.limit, offer.currencyCode))}</dd></div><div><dt>RATE</dt><dd>${escapeHtml(offer.apr.toFixed(2))}%</dd></div><div><dt>TERM</dt><dd>${escapeHtml(offer.termCycles)} cycles</dd></div></dl></button>`).join("") : renderEmptyState({ title: "No eligible offers", detail: "Credit offers appear only when economic behavior and borrower requirements pass.", iconName: "banking" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-loan-application">
        ${selected ? `<header class="player-terminal-panel-header"><div><span>APPLICATION</span><strong>${escapeHtml(selected.name)}</strong></div>${renderStatusPill(selected.risk, selected.risk === "Low" ? "green" : "amber")}</header>
        <div class="player-terminal-loan-review"><p>${escapeHtml(selected.disclosure || selected.description)}</p><dl><div><dt>MINIMUM</dt><dd>${escapeHtml(loanMoney(selected.minimumAmount, selected.currencyCode))}</dd></div><div><dt>MAXIMUM</dt><dd>${escapeHtml(loanMoney(selected.limit, selected.currencyCode))}</dd></div><div><dt>APR</dt><dd>${escapeHtml(selected.apr.toFixed(2))}%</dd></div><div><dt>ORIGINATION FEE</dt><dd>${escapeHtml(selected.fee.toFixed(1))}%</dd></div></dl>${selectedNeedsBusiness && !businessKey ? `<p class="player-terminal-inline-error" role="alert">Create or recover an active business before applying for this business facility.</p>` : ""}</div>
        <details class="player-terminal-disclosure"><summary><span>${icon("document")}</span><div><strong>Apply for this offer</strong><small>Submission creates a reviewable application, not automatic approval</small></div>${icon("chevronRight")}</summary><form data-player-form="loan-apply" data-endpoint="loanApply" data-offer-id="${escapeHtml(selected.id)}">
          ${selectedNeedsBusiness && businessKey ? `<input name="businessKey" type="hidden" value="${escapeHtml(businessKey)}" />` : ""}
          <label>AMOUNT<input name="amount" type="number" min="${escapeHtml(selected.minimumAmount)}" max="${escapeHtml(selected.limit)}" step="0.01" required value="${escapeHtml(Math.min(selected.limit, Math.max(selected.minimumAmount, 5000)))}" /></label>
          <label>PURPOSE<select name="purpose"><option>Inventory purchase</option><option>Business expansion</option><option>Equipment investment</option><option>Working capital</option></select></label>
          <label>REPAYMENT ACCOUNT<select name="repaymentSource" required>${repaymentOptions}</select><small>Approved payments will debit this account in the loan currency.</small></label>
          <button class="player-terminal-primary-button" type="submit" ${selectedCanApply && repaymentAccounts.length ? "" : "disabled"}>${icon("document")} Submit application</button>
        </form></details>` : renderEmptyState({ title: "No credit offers", detail: "Your eligibility and available facilities will appear after the banking service completes its review.", iconName: "banking" })}
      </section>

      <section class="player-terminal-panel player-terminal-active-loans">
        ${activeLoan ? `<header class="player-terminal-panel-header"><div><span>ACTIVE FACILITIES</span><strong>${escapeHtml(activeLoan.name)}</strong></div>${renderStatusPill(activeLoan.status, loanTone(activeLoan.status))}</header>
        ${loans.activeLoans.map((loan) => `<article><div class="player-terminal-active-loan-head"><div><small>${escapeHtml(loan.id)}</small><strong>${escapeHtml(loanMoney(loan.balance, loan.currencyCode))}</strong><span>of ${escapeHtml(loanMoney(loan.originalAmount, loan.currencyCode))}</span></div><div><small>NEXT DUE</small><strong>${escapeHtml(forecastPayment(loans.repaymentForecast, loan.id) ? loanMoney(forecastPayment(loans.repaymentForecast, loan.id).amount, loan.currencyCode) : "Unavailable")}</strong><span>${escapeHtml(loan.nextDue)}</span></div></div><div class="player-terminal-progress-track"><i style="width:${escapeHtml(loan.repaidPercent)}%"></i></div><p>${escapeHtml(loanMoney(loan.accruedInterest, loan.currencyCode))} accrued interest${loan.businessId ? ` · Business ${escapeHtml(loan.businessId)}` : ""}</p><details class="player-terminal-disclosure"><summary><span>${icon("send")}</span><div><strong>Make a payment</strong><small>Recorded-balance estimate: ${escapeHtml(forecastPayment(loans.repaymentForecast, loan.id) ? loanMoney(forecastPayment(loans.repaymentForecast, loan.id).amount, loan.currencyCode) : "Unavailable")}</small></div>${icon("chevronRight")}</summary><form data-player-form="loan-repay" data-endpoint="loanRepay" data-loan-id="${escapeHtml(loan.id)}"><label>PAYMENT AMOUNT<input name="amount" type="number" min="0.01" max="${escapeHtml(loan.balance)}" step="0.01" value="${escapeHtml(forecastPayment(loans.repaymentForecast, loan.id)?.amount ?? Math.min(Number(loan.nextPayment) || 0, Number(loan.balance) || 0))}" required /></label><button class="player-terminal-secondary-button" type="submit">${icon("send")} Make payment</button></form></details></article>`).join("")}` : renderEmptyState({ title: "No active loans", detail: "Approved facilities and repayment controls will appear here.", iconName: "wallet" })}
      </section>

      ${renderLoanForecast(loans.repaymentForecast)}
      ${renderLoanHistory(loans.lifecycle)}
    </div>
  </section>`;
}
