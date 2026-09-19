import { escapeHtml, formatCurrency, formatNumber, formatPercent, toneFromChange } from "../../core/format.js";
import { icon } from "../../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../../components/ui.js";
import { isResourceUnavailable } from "../../api/resource-status.js";

export function renderPortfolioPositions(data) {
  const rows = data.portfolio.holdings.filter(h => h.quantity > 0);
  const currencies = [...new Set(rows.map(h => h.currencyCode || "UNKNOWN"))].sort();
  const amount = (value, code) => code === "UNKNOWN" ? "Currency unavailable" : formatCurrency(value, code);
  const metrics = currencies.map(code => {
    const positions = rows.filter(h => (h.currencyCode || "UNKNOWN") === code);
    const value = positions.reduce((v,h) => v+h.marketValue,0);
    const gain = positions.reduce((v,h) => v+h.unrealizedPnl,0);
    return `<article class="is-cyan"><span>${icon("portfolio")}</span><div><small>${escapeHtml(code)} INVESTMENTS</small><strong>${escapeHtml(amount(value,code))}</strong><em class="${toneFromChange(gain)}">${escapeHtml(amount(gain,code))} unrealized</em></div></article>`;
  }).join("");
  const stale = isResourceUnavailable(data,"portfolio");
  return `<section class="player-terminal-page player-terminal-portfolio-page" data-page="portfolio">
    <header class="player-terminal-page-heading"><div><small>WEALTH & PERFORMANCE CENTER</small><h2>Portfolio</h2><p>Current positions, cost basis and gains, grouped by their listing currency.</p></div>
      <div class="player-terminal-heading-actions">${renderStatusPill(stale ? "LAST LOADED POSITIONS" : "CURRENT POSITIONS", stale ? "amber" : "purple")}<button class="player-terminal-primary-button" type="button" data-route="market">${icon("market")} Open market</button></div></header>
    ${stale ? '<p class="player-terminal-form-error" role="status">Positions could not be refreshed. These are the last loaded amounts; refresh before making a trading decision.</p>' : ""}
    <div class="player-terminal-portfolio-metrics">${metrics}</div>
    <section class="player-terminal-panel player-terminal-holdings-panel"><header class="player-terminal-panel-header"><div><span>ACTIVE POSITIONS</span><strong>${rows.length} holdings</strong></div><button class="player-terminal-icon-button" type="button" data-player-action="refresh-data" aria-label="Refresh portfolio">${icon("refresh")}</button></header>
      <p class="player-terminal-inline-empty">Amounts in different currencies are shown separately. This view covers investments; open Banking for cash accounts.</p>
      <div class="player-terminal-holdings-table"><div class="player-terminal-holdings-head"><span>ASSET</span><span>SHARES</span><span>VALUE</span><span>GAIN / LOSS</span><span>CURRENCY</span></div>
        ${rows.length ? rows.map(h => {
          const code = h.currencyCode || "UNKNOWN";
          const basis = h.costBasis ?? h.quantity*h.averageCost;
          const pct = basis > 0 ? h.unrealizedPnl/basis*100 : 0;
          return `<button type="button" data-player-market-link="${escapeHtml(h.ticker)}" aria-label="Open ${escapeHtml(h.ticker)} market details"><span class="player-terminal-holding-asset"><b>${escapeHtml(h.ticker)}</b><small>${escapeHtml(h.companyName || h.ticker)}</small></span><span data-label="Shares">${escapeHtml(formatNumber(h.quantity))}<small>avg ${escapeHtml(amount(h.averageCost,code))}</small></span><span data-label="Value">${escapeHtml(amount(h.marketValue,code))}</span><span data-label="Gain / loss" class="${toneFromChange(h.unrealizedPnl)}">${escapeHtml(amount(h.unrealizedPnl,code))}<small>${escapeHtml(formatPercent(pct))}</small></span><span data-label="Currency">${escapeHtml(code)}</span></button>`;
        }).join("") : renderEmptyState({ title: "No active positions", detail: "Issued or purchased shares will appear here with their cost basis.", iconName: "market" })}
      </div>
    </section>
  </section>`;
}
