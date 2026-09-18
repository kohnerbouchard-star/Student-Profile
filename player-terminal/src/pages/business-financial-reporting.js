import { escapeHtml } from "./format.js";

const HEADINGS = {
  incomeStatement: "Income statement",
  balanceSheet: "Balance sheet",
  cashFlowStatement: "Cash flow statement",
};
const LABELS = {
  revenue: "Store revenue", costOfGoodsSold: "Cost of goods sold", grossProfit: "Gross profit",
  payrollExpense: "Wages accrued", capitalizedLabor: "Labor added to completed inventory",
  grossReceiptsTaxExpense: "Gross receipts tax", fundingExchangeExpense: "Funding exchange costs",
  interestAndLoanFees: "Interest and loan fees", netIncome: "Net income",
  cash: "Cash", inventory: "Inventory", equipment: "Equipment", totalAssets: "Total assets",
  loanPrincipal: "Loan principal", interestPayable: "Interest payable", wagesPayable: "Wages payable",
  taxPayable: "Tax payable", totalLiabilities: "Total liabilities", openingEquity: "Opening equity",
  cashContributions: "Cash contributions", noncashContributions: "Inventory contributions",
  currencyReallocation: "Currency reallocation", periodEarnings: "Period earnings", totalEquity: "Total equity",
  openingCash: "Opening cash", operating: "Operating activities", investing: "Investing activities",
  financing: "Financing activities", currencyExchange: "Cash exchanged", unclassified: "Unclassified cash",
  closingCash: "Closing cash",
};
const decimal = (value) => typeof value === "string" && /^-?\d+(?:\.\d+)?$/u.test(value)
  ? escapeHtml(value) : "Unavailable";

export function renderBusinessFinancialReporting(model, resourceState = "ready") {
  const title = '<header class="player-terminal-panel-header"><div><span>FINANCIAL REPORTS</span><strong>Closed operating periods</strong></div></header>';
  if (!model || resourceState !== "ready") {
    return `<section class="player-terminal-panel" data-business-financial-reporting>${title}<p role="status">Financial reports are unavailable. Refresh Business data to load current evidence.</p></section>`;
  }
  const statements = Array.isArray(model.statements) ? model.statements : [];
  const historical = model.unavailableHistoricalPeriods ? "<p>Earlier periods have no accounting snapshots. Historical balances have not been estimated.</p>" : "";
  const content = statements.map((statement) => {
    const complete = statement.status === "complete";
    const state = complete ? "Reconciled" : statement.status === "incomplete_history" ? "Opening history incomplete" : "Reconciliation required";
    const currencies = (statement.currencies || []).map((currency) => {
      const tables = Object.entries(HEADINGS).map(([key, label]) => {
        const rows = Object.entries(currency[key] || {}).filter(([field]) => LABELS[field])
          .map(([field, value]) => `<tr><th scope="row">${LABELS[field]}</th><td>${decimal(value)}</td></tr>`).join("");
        return `<div class="player-terminal-holdings-table" tabindex="0" role="region" aria-label="${label} ${escapeHtml(currency.currencyCode)}"><table><caption>${label} · ${escapeHtml(currency.currencyCode)}</caption><tbody>${rows}</tbody></table></div>`;
      }).join("");
      const reconciliation = currency.reconciliation || {};
      return `<section aria-label="${escapeHtml(currency.currencyCode)} financial statements">${tables}<p>Equity difference: ${decimal(reconciliation.equityDifference)}. Cash difference: ${decimal(reconciliation.cashDifference)}.</p></section>`;
    }).join("");
    return `<details class="player-terminal-disclosure" data-business-statement><summary>Period ${escapeHtml(statement.periodNumber)} · <time datetime="${escapeHtml(statement.dueAt)}">${escapeHtml(String(statement.dueAt).slice(0, 10))}</time> · ${state}</summary>${complete ? "" : '<p role="status">These figures need reconciliation before they can support an IPO.</p>'}${currencies}</details>`;
  }).join("");
  return `<section class="player-terminal-panel" data-business-financial-reporting>${title}<p>Accrual statements at each period due date. Later cash payments appear in the next period. Currencies are shown separately; amounts retain their recorded precision.</p>${historical}${content || '<p role="status">No closed-period financial statements yet.</p>'}${model.truncated ? "<p>Showing the latest 50 periods.</p>" : ""}</section>`;
}
