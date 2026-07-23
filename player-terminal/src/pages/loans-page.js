import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderMetric, renderStatusPill } from "../components/ui.js";

function loanTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("default") || value.includes("delinquent")) return "red";
  if (value.includes("restructur")) return "amber";
  return "green";
}

export function renderLoansPage(data, ui) {
  const loans = data.loans;
  const code = data.session.currencyCode;
  const selected = loans.offers.find((item) => item.id === ui.loanOfferId) || loans.offers[0] || null;
  const activeLoan = loans.activeLoans[0] || null;
  const nextPayment = loans.nextPayment || { amount: 0, due: "No payment scheduled" };
  const businessKey = data.business?.configured ? String(data.business.company?.id || "") : "";
  const selectedNeedsBusiness = selected?.borrowerType === "business";
  const selectedCanApply = Boolean(selected) && (!selectedNeedsBusiness || Boolean(businessKey));
  return `<section class="player-terminal-page player-terminal-loans-page">
    <div class="player-terminal-page-heading"><div><small>CREDIT CENTER</small><h2>Loans</h2><p>Review economic-only eligibility, disclosures, applications, and repayment schedules.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`SCORE ${loans.creditScore}`, loans.creditScore >= 700 ? "green" : "amber")}</div></div>

    <div class="player-terminal-loan-metrics">
      ${renderMetric({ label: "Available credit", value: formatCurrency(loans.availableCredit, code), meta: "Across eligible offers", tone: "cyan", iconName: "banking" })}
      ${renderMetric({ label: "Outstanding", value: formatCurrency(loans.outstanding, code), meta: `${loans.activeLoans.length} active loan`, tone: loans.outstanding ? "amber" : "green", iconName: "wallet" })}
      ${renderMetric({ label: "Next payment", value: formatCurrency(nextPayment.amount, code), meta: nextPayment.due, tone: "purple", iconName: "clock" })}
      ${renderMetric({ label: "On-time rate", value: `${loans.onTimeRate}%`, meta: `${loans.paymentsMade} payments recorded`, tone: "green", iconName: "check" })}
    </div>

    <div class="player-terminal-loans-layout">
      <section class="player-terminal-panel player-terminal-loan-offers">
        <header class="player-terminal-panel-header"><div><span>ELIGIBLE OFFERS</span><strong>${escapeHtml(loans.offers.length)} options</strong></div>${renderStatusPill("NO AUTO-APPROVAL", "amber")}</header>
        <div>${loans.offers.length ? loans.offers.map((offer) => `<button class="player-terminal-loan-offer${offer.id === selected?.id ? " active" : ""}" type="button" data-player-loan-offer="${escapeHtml(offer.id)}"><span>${icon(offer.icon)}</span><div><small>${escapeHtml(offer.purpose)}</small><strong>${escapeHtml(offer.name)}</strong><p>${escapeHtml(offer.description)}</p></div><dl><div><dt>LIMIT</dt><dd>${escapeHtml(formatCurrency(offer.limit, code))}</dd></div><div><dt>RATE</dt><dd>${escapeHtml(offer.apr.toFixed(2))}%</dd></div><div><dt>TERM</dt><dd>${escapeHtml(offer.termCycles)} cycles</dd></div></dl></button>`).join("") : renderEmptyState({ title: "No eligible offers", detail: "Credit offers appear only when economic behavior and borrower requirements pass.", iconName: "banking" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-loan-application">
        ${selected ? `<header class="player-terminal-panel-header"><div><span>APPLICATION</span><strong>${escapeHtml(selected.name)}</strong></div>${renderStatusPill(selected.risk, selected.risk === "Low" ? "green" : "amber")}</header>
        <div class="player-terminal-loan-review"><p>${escapeHtml(selected.disclosure || selected.description)}</p><dl><div><dt>MINIMUM</dt><dd>${escapeHtml(formatCurrency(selected.minimumAmount, code))}</dd></div><div><dt>MAXIMUM</dt><dd>${escapeHtml(formatCurrency(selected.limit, code))}</dd></div><div><dt>APR</dt><dd>${escapeHtml(selected.apr.toFixed(2))}%</dd></div><div><dt>ORIGINATION FEE</dt><dd>${escapeHtml(selected.fee.toFixed(1))}%</dd></div></dl>${selectedNeedsBusiness && !businessKey ? `<p class="player-terminal-inline-error" role="alert">Create or recover an active business before applying for this business facility.</p>` : ""}</div>
        <details class="player-terminal-disclosure"><summary><span>${icon("document")}</span><div><strong>Apply for this offer</strong><small>Submission creates a reviewable application, not automatic approval</small></div>${icon("chevronRight")}</summary><form data-player-form="loan-apply" data-endpoint="loanApply" data-offer-id="${escapeHtml(selected.id)}">
          ${selectedNeedsBusiness && businessKey ? `<input name="businessKey" type="hidden" value="${escapeHtml(businessKey)}" />` : ""}
          <label>AMOUNT<input name="amount" type="number" min="${escapeHtml(selected.minimumAmount)}" max="${escapeHtml(selected.limit)}" step="0.01" required value="${escapeHtml(Math.min(selected.limit, Math.max(selected.minimumAmount, 5000)))}" /></label>
          <label>PURPOSE<select name="purpose"><option>Inventory purchase</option><option>Business expansion</option><option>Equipment investment</option><option>Working capital</option></select></label>
          <label>REPAYMENT SOURCE<textarea name="repaymentSource" rows="3" required placeholder="Describe expected repayment source"></textarea></label>
          <button class="player-terminal-primary-button" type="submit" ${selectedCanApply ? "" : "disabled"}>${icon("document")} Submit application</button>
        </form></details>` : renderEmptyState({ title: "No credit offers", detail: "Your eligibility and available facilities will appear after the banking service completes its review.", iconName: "banking" })}
      </section>

      <section class="player-terminal-panel player-terminal-active-loans">
        ${activeLoan ? `<header class="player-terminal-panel-header"><div><span>ACTIVE FACILITIES</span><strong>${escapeHtml(activeLoan.name)}</strong></div>${renderStatusPill(activeLoan.status, loanTone(activeLoan.status))}</header>
        ${loans.activeLoans.map((loan) => `<article><div class="player-terminal-active-loan-head"><div><small>${escapeHtml(loan.id)}</small><strong>${escapeHtml(formatCurrency(loan.balance, code))}</strong><span>of ${escapeHtml(formatCurrency(loan.originalAmount, code))}</span></div><div><small>NEXT DUE</small><strong>${escapeHtml(formatCurrency(loan.nextPayment, code))}</strong><span>${escapeHtml(loan.nextDue)}</span></div></div><div class="player-terminal-progress-track"><i style="width:${escapeHtml(loan.repaidPercent)}%"></i></div><p>${escapeHtml(formatCurrency(loan.accruedInterest, code))} accrued interest${loan.businessId ? ` · Business ${escapeHtml(loan.businessId)}` : ""}</p><details class="player-terminal-disclosure"><summary><span>${icon("send")}</span><div><strong>Make a payment</strong><small>Next scheduled payment: ${escapeHtml(formatCurrency(loan.nextPayment, code))}</small></div>${icon("chevronRight")}</summary><form data-player-form="loan-repay" data-endpoint="loanRepay" data-loan-id="${escapeHtml(loan.id)}"><label>PAYMENT AMOUNT<input name="amount" type="number" min="0.01" max="${escapeHtml(loan.balance)}" step="0.01" value="${escapeHtml(loan.nextPayment)}" required /></label><button class="player-terminal-secondary-button" type="submit">${icon("send")} Make payment</button></form></details></article>`).join("")}` : renderEmptyState({ title: "No active loans", detail: "Approved facilities and repayment controls will appear here.", iconName: "wallet" })}
      </section>

      <section class="player-terminal-panel player-terminal-loan-schedule">
        <header class="player-terminal-panel-header"><div><span>PAYMENT SCHEDULE</span><strong>Upcoming installments</strong></div></header>
        <div>${loans.schedule.length ? loans.schedule.map((item) => `<article><span class="${item.status === "Paid" ? "is-paid" : ""}">${icon(item.status === "Paid" ? "check" : "clock")}</span><div><strong>${escapeHtml(item.cycle)}</strong><small>${escapeHtml(item.due)}</small></div><div><strong>${escapeHtml(formatCurrency(item.amount, code))}</strong><small>${escapeHtml(item.status)}</small></div></article>`).join("") : renderEmptyState({ title: "No scheduled payments", detail: "The payment schedule will appear after a facility is activated.", iconName: "clock" })}</div>
      </section>
    </div>
  </section>`;
}
