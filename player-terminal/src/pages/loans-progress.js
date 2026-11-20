import { escapeHtml } from "../core/format.js";
import { loanMoney } from "./loans-history.js";

const cents = (value) => typeof value === "string" && /^(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/u.test(value)
  ? BigInt(value.replace(".", "")) : null;
const money = (value, code) => escapeHtml(loanMoney(value, code));
const decimal = (value) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
const currency = (value) => typeof value === "string" && /^[A-Z][A-Z0-9]{2,15}$/u.test(value);

function facility(loan, lifecycle) {
  if (lifecycle?.state !== "available" || !currency(loan.currencyCode)) return null;
  const rows = lifecycle.facilities.items.filter((row) => row.id === loan.id);
  return rows.length === 1 && rows[0].currencyCode === loan.currencyCode ? rows[0] : null;
}

export function renderLoanPrincipalProgress(loan, lifecycle) {
  const row = facility(loan, lifecycle);
  if (!row) return '<div data-loan-principal-progress><p>Principal progress unavailable. Exact original and remaining principal could not be verified for this facility.</p><p>Stored accrued interest and its recording timestamp are unavailable.</p></div>';
  const original = cents(row.originalPrincipal), remaining = cents(row.principalBalance);
  let progress = '<p>Principal progress unavailable. Exact original and remaining principal could not be verified for this facility.</p>';
  if (original !== null && remaining !== null && original > 0n && remaining <= original) {
    const repaid = original - remaining;
    // Floor to tenths: a remaining cent must never display as 100% repaid.
    const tenths = repaid * 1000n / original;
    const percent = `${tenths / 10n}.${tenths % 10n}`;
    progress = `<p><strong>Principal repaid: ${money(decimal(repaid), row.currencyCode)} of ${money(row.originalPrincipal, row.currencyCode)}</strong> (${percent}%)</p><div class="player-terminal-progress-track" role="progressbar" aria-label="Principal repaid" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${escapeHtml(loanMoney(decimal(repaid), row.currencyCode))} of ${escapeHtml(loanMoney(row.originalPrincipal, row.currencyCode))} original principal repaid; interest excluded"><i style="width:${percent}%"></i></div><p>Remaining principal ${money(row.principalBalance, row.currencyCode)}. This progress excludes interest and is not a payoff quote.</p>`;
  }
  const interest = cents(row.accruedInterest), outstanding = cents(row.recordedOutstanding);
  const consistentDebt = remaining !== null && interest !== null && outstanding !== null && remaining + interest === outstanding;
  return `<div data-loan-principal-progress>${progress}<p>Stored accrued interest ${money(row.accruedInterest, row.currencyCode)} · Interest last recorded ${escapeHtml(row.lastAccruedAt || "Not recorded")}.</p><p>Recorded outstanding ${consistentDebt ? money(row.recordedOutstanding, row.currencyCode) : "unavailable: principal and interest could not be reconciled"}. Unrecorded and future interest are excluded.</p></div>`;
}

export function renderLoanPaidMilestones(lifecycle) {
  if (lifecycle?.state !== "available") return "";
  // Per-facility server status and exact zero debt only. Receipt windows never
  // establish payoff, lifetime totals, or a debt-free player/account state.
  const paid = lifecycle.facilities.items.filter((row) => row.status === "paid" && currency(row.currencyCode) &&
    cents(row.recordedOutstanding) === 0n && cents(row.principalBalance) === 0n && cents(row.accruedInterest) === 0n);
  if (!paid.length) return "";
  return `<section class="player-terminal-panel player-terminal-active-loans" data-loan-paid-milestones><header class="player-terminal-panel-header"><div><span>RECORDED LOAN MILESTONES</span><strong>Paid facilities</strong></div></header>${paid.map((row) => `<article><strong>Loan paid · ${escapeHtml(row.currentProduct?.name || "Credit facility")}</strong><p>${escapeHtml(row.id)} · Server status: paid · Recorded outstanding ${money(row.recordedOutstanding, row.currencyCode)}</p><p>Closed ${escapeHtml(row.closedAt || "date not recorded")}.</p></article>`).join("")}<p>Based on recorded facility status, not payment-history totals.${lifecycle.facilities.complete ? "" : " Facility history is incomplete; these are only the returned records."} This does not mean all your debt is paid.</p></section>`;
}
