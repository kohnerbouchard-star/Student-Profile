import { escapeHtml, formatCurrency, formatNumber, formatPercent } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState } from "../components/ui.js";

function hiddenBusinessKey(business) {
  return `<input name="businessKey" type="hidden" value="${escapeHtml(business.company.id)}" />`;
}

export function renderBusinessWorkforceMarket(workforce, business, code) {
  const candidates = Array.isArray(workforce?.candidates)
    ? workforce.candidates
    : [];
  if (!candidates.length) {
    return renderEmptyState({
      title: "No candidates available",
      detail: "The server-owned labor market has no matching candidates for this Business country and currency.",
      iconName: "users"
    });
  }
  const groups = new Map();
  for (const candidate of candidates) {
    const key = candidate.roleKey || candidate.roleName || "workforce.other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  return [...groups.entries()].map(([roleKey, entries]) => `<section class="player-terminal-workforce-role-group">
    <header><small>${escapeHtml(roleKey)}</small><strong>${escapeHtml(entries[0]?.roleName || "Workforce")}</strong></header>
    <div>${entries.map((candidate) => `<article class="player-terminal-business-product">
      <span class="player-terminal-product-icon">${icon("users")}</span>
      <div><small>${escapeHtml(candidate.laborClass)} · ${escapeHtml(candidate.contractType)}</small><strong>${escapeHtml(candidate.displayLabel)}</strong><p>${escapeHtml(formatCurrency(candidate.wagePerCycle, candidate.currencyCode || code))} per cycle · ${escapeHtml(formatNumber(candidate.laborMinutesPerCycle))} labor minutes · ${escapeHtml(formatPercent(candidate.skillBasisPoints / 100, 0))} skill</p></div>
      <form data-player-form="business-candidate-hire" data-endpoint="businessCandidateHire" data-candidate-id="${escapeHtml(candidate.candidateKey)}">
        ${hiddenBusinessKey(business)}
        <input name="candidateKey" type="hidden" value="${escapeHtml(candidate.candidateKey)}" />
        <button class="player-terminal-secondary-button" type="submit">${icon("users")} Hire candidate</button>
      </form>
    </article>`).join("")}</div>
  </section>`).join("");
}
