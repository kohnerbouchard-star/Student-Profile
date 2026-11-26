import { escapeHtml } from "../core/format.js";

export function renderProcurementFundingLines(lines, { businessMoney, formatBusinessRatePercent }) {
  return `<div role="group" aria-label="Checking account contributions">${lines.map((line, index) => `<p data-business-procurement-funding-line><strong>Checking ${index + 1} · ${escapeHtml(line.sourceCurrencyCode)}</strong> ${escapeHtml(businessMoney(line.sourceDebit))} debit → ${escapeHtml(businessMoney(line.targetContribution))} contribution · reference ${escapeHtml(line.referenceRate)} · customer ${escapeHtml(line.customerRate)} · spread ${escapeHtml(formatBusinessRatePercent(line.spreadRate))} · ${escapeHtml(line.roundingDisclosure)}</p>`).join("")}</div>`;
}
