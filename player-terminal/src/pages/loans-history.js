import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

export function loanMoney(value, code) {
  if (typeof code !== "string" || !code.trim()) return "Currency unavailable";
  if (typeof value === "string" && /^(0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/u.test(value)) {
    const [whole, fraction = ""] = value.split(".");
    return `${code} ${whole.replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/gu, ",")}.${fraction.padEnd(2, "0")}`;
  }
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? formatCurrency(value, code) : `${code} Unavailable`;
}
const label = (value) => String(value || "Unavailable").replaceAll("_", " ");
const when = (value) => value ? escapeHtml(value) : "Not recorded";
const money = (value, code) => escapeHtml(loanMoney(value, code));
const status = (value) => renderStatusPill(label(value), ["defaulted", "delinquent", "declined", "reversed"].includes(value) ? "red" : value === "pending_review" ? "amber" : "green");
function coverage(window) {
  return window.complete ? "All recorded entries shown." : window.hasMore === true
    ? "Recent records only. More entries exist; this is not a complete history."
    : "History is incomplete or could not be fully verified.";
}
function section(title, window, content) {
  return `<section class="player-terminal-panel player-terminal-active-loans"><header class="player-terminal-panel-header"><div><span>${title}</span><strong>${window.items.length} recorded entries</strong></div></header><p>${coverage(window)}</p>${content || renderEmptyState({ title: window.complete ? "No recorded entries" : "Records unavailable", detail: window.complete ? "No entries were returned for this history." : "Refresh Loans to check again.", iconName: "document" })}</section>`;
}
export function renderLoanHistory(lifecycle) {
  if (lifecycle?.state !== "available") return `<section class="player-terminal-panel player-terminal-active-loans">${renderEmptyState({ title: "Loan history unavailable", detail: "Recorded applications, facilities, defaults and payments could not be loaded. Existing payment controls remain available. Refresh Loans to try again.", iconName: "document" })}</section>`;
  const debt = lifecycle.recordedDebt;
  // A no-more flag alone does not prove that the facility window returned every row.
  const debtComplete = lifecycle.facilities.complete && debt.complete;
  const totals = `<section class="player-terminal-panel player-terminal-active-loans"><header class="player-terminal-panel-header"><div><span>RECORDED DEBT</span><strong>All facility states, by currency</strong></div></header><p>Includes defaulted facilities. Stored interest is not a payoff quote and may exclude interest accrued since the recorded timestamp.</p>${!debtComplete ? '<p role="status">Total debt unavailable: facility amounts or coverage are incomplete.</p>' : debt.groups.length ? debt.groups.map((row) => `<article><strong>${money(row.outstanding, row.currencyCode)}</strong><p>Principal ${money(row.principalBalance, row.currencyCode)} · Stored interest ${money(row.accruedInterest, row.currencyCode)}</p></article>`).join("") : "<p>No recorded debt.</p>"}</section>`;
  const applications = section("APPLICATION HISTORY", lifecycle.applications, lifecycle.applications.items.map((row) => `<article><div><strong>${escapeHtml(row.currentProduct?.name || "Credit application")}</strong> ${status(row.status)}</div><small>${escapeHtml(row.id)}</small><p>Requested amount: ${escapeHtml(row.amount ?? "Unavailable")} · Application currency not recorded.</p><p>Projected payment at application: ${escapeHtml(row.projectedPayment ?? "Unavailable")} · Currency not recorded.</p>${row.currentProduct ? `<p>Current product currency: ${escapeHtml(row.currentProduct.currencyCode || "Unavailable")} (metadata only, not the application currency).</p>` : ""}<p>Submitted ${when(row.createdAt)} · Updated ${when(row.updatedAt)} · Reviewed ${when(row.reviewedAt)}</p></article>`).join(""));
  const facilities = section("FACILITY HISTORY", lifecycle.facilities, lifecycle.facilities.items.map((row) => `<article><div><strong>${escapeHtml(row.currentProduct?.name || "Credit facility")}</strong> ${status(row.status)}</div><small>${escapeHtml(row.id)}</small><strong>Recorded outstanding: ${money(row.recordedOutstanding, row.currencyCode)}</strong><p>Original principal ${money(row.originalPrincipal, row.currencyCode)} · Remaining principal ${money(row.principalBalance, row.currencyCode)} · Stored interest ${money(row.accruedInterest, row.currencyCode)}</p><p>Interest last recorded ${when(row.lastAccruedAt)}</p>${row.status === "defaulted" ? `<p role="status">Default does not erase this debt. Default recorded ${when(row.defaultedAt)}. Repayment is unavailable for this facility in the current service.</p>` : ""}${row.status === "paid" && row.recordedOutstanding !== "0.00" ? '<p role="status">This paid facility has inconsistent or unavailable recorded debt. Total debt cannot be confirmed.</p>' : ""}<p>Opened ${when(row.createdAt)} · Updated ${when(row.updatedAt)} · Closed ${when(row.closedAt)}</p></article>`).join(""));
  const facilitiesById = new Map(lifecycle.facilities.items.map((row) => [row.id, row]));
  const paymentsByFacility = new Map();
  for (const row of lifecycle.payments.items) {
    if (!paymentsByFacility.has(row.loanId)) paymentsByFacility.set(row.loanId, []);
    paymentsByFacility.get(row.loanId).push(row);
  }
  const payments = section("PAYMENT HISTORY", lifecycle.payments, [...paymentsByFacility].map(([loanId, receipts]) => {
    const facility = facilitiesById.get(loanId);
    return `<details class="player-terminal-disclosure" data-player-loan-payment-history="${escapeHtml(loanId)}"><summary><span>${icon("document")}</span><div><strong>Payments for ${escapeHtml(facility?.currentProduct?.name || "credit facility")}</strong><small>${escapeHtml(loanId)} · ${receipts.length} recorded ${receipts.length === 1 ? "receipt" : "receipts"}</small></div>${icon("chevronRight")}</summary>${facility ? `<p>Facility status: ${status(facility.status)} · Recorded outstanding: ${money(facility.recordedOutstanding, facility.currencyCode)}</p><p>Current product name is reference information, not a snapshot of the original loan terms.</p>` : "<p>Facility details are outside the available history or could not be verified. These payment receipts remain recorded.</p>"}<p>${coverage(lifecycle.payments)} Amounts below are individual receipts, not a payoff quote or a total of all payments.</p>${receipts.map((row) => `<article><div><strong>${money(row.amount, row.currencyCode)}</strong> ${status(row.status)}</div><small>${escapeHtml(row.id)}</small><p>Principal ${money(row.principalAmount, row.currencyCode)} · Interest ${money(row.interestAmount, row.currencyCode)}</p><p>Recorded ${when(row.createdAt)} · Applied installment ${when(row.appliedDueAt)}</p>${row.status === "reversed" ? "<p>Reversed payment; not counted toward installment payments.</p>" : ""}</article>`).join("")}</details>`;
  }).join(""));
  return totals + applications + facilities + payments;
}
function reportedSchedule(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return `<section class="player-terminal-panel player-terminal-loan-schedule"><header class="player-terminal-panel-header"><div><span>REPORTED SCHEDULE</span><strong>Unverified service schedule</strong></div></header><p>The service did not provide a verified remaining-balance forecast. These reported amounts may repeat the full product term and do not account for payments already made. They are not the remaining debt, a payment recommendation or a payoff quote.</p>${rows.slice(0, 24).map((row) => `<article><span>${icon("clock")}</span><div><strong>Reported installment</strong><small>${when(row?.due)}</small></div><div><strong>${money(row?.amount, row?.currencyCode)}</strong><small>Unverified</small></div></article>`).join("")}${rows.length > 24 ? "<p>Only the first 24 reported entries are shown.</p>" : ""}</section>`;
}
export function loanForecastTarget(forecast, id) {
  if (!/^lon_[0-9a-f]{32}$/u.test(String(id || ''))) return null;
  const rows = Array.isArray(forecast?.facilities) ? forecast.facilities.filter((row) => row?.id === id) : [];
  return rows.length === 1 && rows[0].state === 'available' ? `loan-forecast-${id}` : null;
}
export function renderLoanForecastLink(forecast, id) {
  const target = loanForecastTarget(forecast, id);
  return target ? `<button type="button" class="player-terminal-compact-button" data-loan-forecast-link="${id}" aria-controls="${target}">Review repayment plan</button>` : '';
}
function forecastLabel(id, lifecycle) {
  const matches = lifecycle?.state === 'available' && Array.isArray(lifecycle.facilities?.items) ? lifecycle.facilities.items.filter((row) => row?.id === id) : [];
  const name = matches.length === 1 ? matches[0].currentProduct?.name : null;
  return name ? `${escapeHtml(name)} · ${escapeHtml(id)}` : escapeHtml(id);
}
export function renderLoanForecast(forecast, reportedRows = [], lifecycle = null) {
  const rows = forecast?.facilities;
  return `<section class="player-terminal-panel player-terminal-loan-schedule"><header class="player-terminal-panel-header"><div><span>REPAYMENT FORECAST</span><strong>Recorded-balance plan</strong></div></header><p>Based on remaining principal and stored interest, after posted payments toward the current installment. Excludes unrecorded and future interest, so final payoff may be higher. Dates assume the current payment cadence; this is not a payoff quote.</p><div>${!rows ? renderEmptyState({ title: "Forecast unavailable", detail: "The service has not provided verified forecast inputs. Refresh Loans to try again.", iconName: "clock" }) : !rows.length ? renderEmptyState({ title: "No active repayment forecast", detail: "Defaulted and paid facilities are shown in facility history.", iconName: "clock" }) : rows.map((row) => `<details class="player-terminal-disclosure" id="loan-forecast-${escapeHtml(row.id)}" data-loan-forecast="${escapeHtml(row.id)}"><summary><span>${icon("clock")}</span><div><strong>${forecastLabel(row.id, lifecycle)}</strong><small>${row.state === "available" ? `${row.installments.length} projected installments` : "Forecast unavailable"}</small></div>${icon("chevronRight")}</summary>${row.state !== "available" ? `<p>${escapeHtml(row.reason)}. Refresh Loans to check again.</p>` : `<p>Recorded balance ${money(row.recordedOutstanding, row.currencyCode)}</p>${row.installments.map((item, index) => `<article><span>${icon("clock")}</span><div><strong>Payment ${index + 1}</strong><small>${when(item.due)}</small></div><div><strong>${money(item.amount, row.currencyCode)}</strong><small>${escapeHtml(item.status)}</small></div></article>`).join("")}${row.remainingAfterWindow !== "0.00" ? `<p>Shows the first 24 installments. Remaining recorded balance after this window: ${money(row.remainingAfterWindow, row.currencyCode)}.</p>` : "<p>These installments cover the recorded balance only.</p>"}`}</details>`).join("")}</div></section>${!rows ? reportedSchedule(reportedRows) : ""}`;
}
export function forecastPayment(forecast, id) {
  const facility = forecast?.facilities.find((row) => row.id === id);
  return facility?.state === "available" ? facility.installments[0] || null : null;
}
