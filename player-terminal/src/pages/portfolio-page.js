import { escapeHtml, formatCurrency, formatNumber, formatPercent, toneFromChange } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function chartPath(values, width = 760, height = 250, padding = 18) {
  const safeValues = Array.isArray(values) && values.length ? values : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;
  return safeValues.map((value, index) => {
    const x = padding + (index / Math.max(1, safeValues.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function renderPortfolioPage(data) {
  const currencyCode = data.session.currencyCode;
  const portfolio = data.portfolio;
  const holdings = data.market.assets.filter((asset) => asset.owned > 0).map((asset) => {
    const value = asset.owned * asset.price;
    const cost = asset.owned * asset.averageCost;
    return { ...asset, value, gain: value - cost, gainPercent: cost ? ((value - cost) / cost) * 100 : 0 };
  }).sort((a, b) => b.value - a.value);
  const path = chartPath(portfolio.history);

  return `<section class="player-terminal-page player-terminal-portfolio-page" data-page="portfolio">
    <header class="player-terminal-page-heading">
      <div><small>WEALTH & PERFORMANCE CENTER</small><h2>Portfolio</h2><p>See your complete financial position without adding another complex management system.</p></div>
      <div class="player-terminal-heading-actions">${renderStatusPill("READ MODEL", "purple")}<button class="player-terminal-primary-button player-terminal-portfolio-trade" type="button" data-route="market">${icon("market")} Open market</button></div>
    </header>

    <div class="player-terminal-portfolio-metrics">
      <article class="is-cyan"><span>${icon("portfolio")}</span><div><small>NET WORTH</small><strong>${escapeHtml(formatCurrency(portfolio.netWorth, currencyCode))}</strong><em class="${toneFromChange(portfolio.dailyChange)}">${escapeHtml(formatPercent(portfolio.dailyChange))} today</em></div></article>
      <article class="is-green"><span>${icon("chart")}</span><div><small>TOTAL GAIN</small><strong>${escapeHtml(formatCurrency(portfolio.totalGain, currencyCode))}</strong><em class="is-good">${escapeHtml(formatPercent(portfolio.totalGainPercent))} all time</em></div></article>
      <article class="is-purple"><span>${icon("market")}</span><div><small>INVESTMENTS</small><strong>${escapeHtml(formatCurrency(data.dashboard.portfolioValue, currencyCode))}</strong><em>${escapeHtml(holdings.length)} active positions</em></div></article>
      <article class="is-amber"><span>${icon("wallet")}</span><div><small>LIQUID FUNDS</small><strong>${escapeHtml(formatCurrency(data.dashboard.liquidBalance + data.dashboard.savingsBalance, currencyCode))}</strong><em>Checking + savings</em></div></article>
    </div>

    <div class="player-terminal-portfolio-layout">
      <section class="player-terminal-panel player-terminal-networth-chart">
        <header class="player-terminal-panel-header"><div><span>NET-WORTH HISTORY</span><strong>Last 12 periods</strong></div>${renderStatusPill("+25.2%", "green")}</header>
        <div class="player-terminal-portfolio-chart-frame">
          <svg viewBox="0 0 760 250" preserveAspectRatio="none" role="img" aria-label="Net worth history">
            <defs><linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".3"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
            <g class="player-terminal-chart-grid"><path d="M18 50H742M18 100H742M18 150H742M18 200H742"/><path d="M163 18V232M308 18V232M453 18V232M598 18V232"/></g>
            <path class="player-terminal-portfolio-chart-area" d="${path} L742,232 L18,232 Z"/>
            <path class="player-terminal-portfolio-chart-line" d="${path}"/>
          </svg>
        </div>
        <div class="player-terminal-allocation-grid">${portfolio.allocation.length ? portfolio.allocation.map((item) => `<article class="is-${escapeHtml(item.tone)}"><span style="--allocation:${Number(item.percent)}%"></span><div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(formatCurrency(item.value, currencyCode))}</strong><em>${escapeHtml(item.percent.toFixed(1))}%</em></div></article>`).join("") : renderEmptyState({ title: "No allocation data", detail: "Asset allocation will appear after portfolio data is connected.", iconName: "portfolio" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-exposure-panel">
        <header class="player-terminal-panel-header"><div><span>COUNTRY EXPOSURE</span><strong>Invested assets</strong></div></header>
        <div class="player-terminal-exposure-list">${portfolio.countryExposure.length ? portfolio.countryExposure.map((item) => {
          const country = data.countries.find((entry) => entry.id === item.countryId);
          return `<button type="button" data-player-country="${escapeHtml(item.countryId)}"><span><strong>${escapeHtml(country?.name || item.countryId)}</strong><small>${escapeHtml(formatCurrency(item.value, currencyCode))}</small></span><i><b style="width:${Number(item.percent)}%"></b></i><em>${escapeHtml(item.percent.toFixed(1))}%</em></button>`;
        }).join("") : renderEmptyState({ title: "No country exposure", detail: "Country exposure will appear after holdings are available.", iconName: "globe" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-holdings-panel">
        <header class="player-terminal-panel-header"><div><span>ACTIVE POSITIONS</span><strong>${escapeHtml(holdings.length)} holdings</strong></div><button class="player-terminal-icon-button" type="button" data-route="market" aria-label="Open market">${icon("chevronRight")}</button></header>
        <div class="player-terminal-holdings-table">
          <div class="player-terminal-holdings-head"><span>ASSET</span><span>SHARES</span><span>VALUE</span><span>GAIN / LOSS</span><span>DAY</span></div>
          ${holdings.length ? holdings.map((asset) => `<button type="button" data-player-market-link="${escapeHtml(asset.id)}" aria-label="Open ${escapeHtml(asset.symbol)} market details"><span class="player-terminal-holding-asset"><b>${escapeHtml(asset.symbol)}</b><small>${escapeHtml(asset.name)}</small></span><span data-label="Shares">${escapeHtml(formatNumber(asset.owned))}</span><span data-label="Value">${escapeHtml(formatCurrency(asset.value, currencyCode))}</span><span data-label="Gain / loss" class="${toneFromChange(asset.gain)}">${escapeHtml(formatCurrency(asset.gain, currencyCode))}<small>${escapeHtml(formatPercent(asset.gainPercent))}</small></span><span data-label="Day" class="player-terminal-market-change ${toneFromChange(asset.change)}">${escapeHtml(formatPercent(asset.change))}</span></button>`).join("") : renderEmptyState({ title: "No active positions", detail: "Purchased assets will appear here with cost basis and performance.", iconName: "market" })}
        </div>
      </section>
    </div>
  </section>`;
}
