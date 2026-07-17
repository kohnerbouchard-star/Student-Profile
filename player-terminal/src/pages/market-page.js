import { escapeHtml, formatCompact, formatCurrency, formatNumber, formatPercent, toneFromChange } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderChange, renderEmptyState, renderStatusPill } from "../components/ui.js";

function chartPath(values, width = 720, height = 260, padding = 18) {
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

function renderAssetRow(asset, selectedId) {
  return `<button class="player-terminal-asset-row${asset.id === selectedId ? " is-selected" : ""}" type="button" data-player-market-select="${escapeHtml(asset.id)}">
    <span class="player-terminal-asset-symbol">${escapeHtml(asset.symbol.slice(0, 2))}</span>
    <span><strong>${escapeHtml(asset.symbol)}</strong><small>${escapeHtml(asset.name)}</small></span>
    <span><strong>${escapeHtml(formatCurrency(asset.price, ""))}</strong><small>${escapeHtml(asset.type)} · ${escapeHtml(asset.sector)}</small></span>
    ${renderChange(asset.change)}
  </button>`;
}

export function renderMarketPage(data, ui) {
  const market = data.market;
  if (!Array.isArray(market?.assets) || !market.assets.length) {
    return `<section class="player-terminal-page player-terminal-market-page" data-page="market"><header class="player-terminal-page-heading"><div><small>CELESTIAL EXCHANGE</small><h2>Market Terminal</h2><p>Research assets and prepare market orders.</p></div></header>${renderEmptyState({ title: "No assets are listed", detail: "The exchange directory will populate when tradable instruments become available.", iconName: "market" })}</section>`;
  }
  const selectedId = ui.marketAssetId || market.selectedAssetId;
  const selected = market.assets.find((asset) => asset.id === selectedId) || market.assets[0];
  const sector = ui.marketSector || "All";
  const assets = market.assets.filter((asset) => sector === "All" || asset.sector === sector);
  const path = chartPath(selected.history);
  const currencyCode = data.session.currencyCode;
  const positionValue = selected.owned * selected.price;
  const gain = selected.owned ? positionValue - selected.owned * selected.averageCost : 0;
  const selectedCountry = data.countries.find((country) => country.id === selected.countryId);
  const relatedNews = data.news.items.filter((item) => selected.newsIds?.includes(item.id)).slice(0, 3);
  const marketVolume = market.assets.reduce((sum, asset) => sum + asset.volume, 0);

  return `<section class="player-terminal-page player-terminal-market-page" data-page="market">
    <header class="player-terminal-page-heading">
      <div><small>CELESTIAL EXCHANGE</small><h2>Market Terminal</h2><p>Research assets, understand event exposure, inspect your positions, and place market orders.</p></div>
      <div class="player-terminal-heading-actions"><button class="player-terminal-secondary-button" type="button" data-route="portfolio">${icon("portfolio")} Portfolio</button>${renderStatusPill(`${market.status} · ${market.nextClose}`, "green")}<button class="player-terminal-icon-button" type="button" data-player-action="refresh-data" aria-label="Refresh market data">${icon("refresh")}</button></div>
    </header>

    <div class="player-terminal-market-summary">
      <article><small>COMPOSITE INDEX</small><strong>${escapeHtml(formatNumber(market.assets.find((asset) => asset.id === "cel-index")?.price || 0, 2))}</strong><span class="is-good">+1.36%</span></article>
      <article><small>YOUR PORTFOLIO</small><strong>${escapeHtml(formatCurrency(data.dashboard.portfolioValue, currencyCode))}</strong><span class="is-good">${escapeHtml(formatPercent(data.dashboard.dailyChange))}</span></article>
      <article><small>AVAILABLE CASH</small><strong>${escapeHtml(formatCurrency(data.banking.checking.available, currencyCode))}</strong><span>Ready to trade</span></article>
      <article><small>MARKET VOLUME</small><strong>${escapeHtml(formatCompact(marketVolume))}</strong><span>Across listed assets</span></article>
    </div>

    <div class="player-terminal-market-layout">
      <section class="player-terminal-panel player-terminal-asset-browser">
        <header class="player-terminal-panel-header"><div><span>ASSET DIRECTORY</span><strong>${escapeHtml(assets.length)} instruments</strong></div><button class="player-terminal-icon-button" type="button" aria-label="Search assets" data-player-local-action="market-search">${icon("eye")}</button></header>
        <div class="player-terminal-filter-row">
          ${market.sectors.map((item) => `<button type="button" class="${item === sector ? "active" : ""}" data-player-market-sector="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}
        </div>
        <div class="player-terminal-asset-list">${assets.length ? assets.map((asset) => renderAssetRow(asset, selected.id)).join("") : renderEmptyState({ title: "No assets in this sector", detail: "Select another sector to continue browsing.", iconName: "market" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-chart-panel">
        <header class="player-terminal-selected-asset-head">
          <div class="player-terminal-selected-symbol">${escapeHtml(selected.symbol.slice(0, 2))}</div>
          <div><small>${escapeHtml(selected.type)} · ${escapeHtml(selected.sector)}</small><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.symbol)} · ${escapeHtml(selectedCountry?.name || "Celestial Exchange")}</p></div>
          <div class="player-terminal-selected-price"><strong>${escapeHtml(formatCurrency(selected.price, currencyCode))}</strong>${renderChange(selected.change)}<button class="player-terminal-watchlist-button${selected.watchlisted ? " is-active" : ""}" type="button" data-player-market-watchlist="${escapeHtml(selected.id)}" data-watchlisted="${String(selected.watchlisted)}">${icon("star")} ${selected.watchlisted ? "Watching" : "Watch"}</button></div>
        </header>
        <div class="player-terminal-chart-toolbar"><button type="button" data-player-local-action="chart-range" data-range="1D">1D</button><button class="active" type="button" data-player-local-action="chart-range" data-range="1M">1M</button><button type="button" data-player-local-action="chart-range" data-range="3M">3M</button><button type="button" data-player-local-action="chart-range" data-range="1Y">1Y</button><button type="button" data-player-local-action="chart-range" data-range="ALL">ALL</button><small>CURRENT SERIES</small></div>
        <div class="player-terminal-chart-frame">
          <svg viewBox="0 0 720 260" preserveAspectRatio="none" role="img" aria-label="Preview price chart for ${escapeHtml(selected.name)}">
            <defs><linearGradient id="marketArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
            <g class="player-terminal-chart-grid"><path d="M18 52H702M18 104H702M18 156H702M18 208H702"/><path d="M155 18V242M292 18V242M429 18V242M566 18V242"/></g>
            <path class="player-terminal-chart-area" d="${path} L702,242 L18,242 Z"/>
            <path class="player-terminal-chart-line" d="${path}"/>
          </svg>
        </div>
        <div class="player-terminal-asset-facts player-terminal-asset-facts-expanded">
          <span><small>OPEN</small><strong>${escapeHtml(formatCurrency(selected.open, currencyCode))}</strong></span>
          <span><small>DAY HIGH</small><strong>${escapeHtml(formatCurrency(selected.dayHigh, currencyCode))}</strong></span>
          <span><small>DAY LOW</small><strong>${escapeHtml(formatCurrency(selected.dayLow, currencyCode))}</strong></span>
          <span><small>VOLUME</small><strong>${escapeHtml(formatCompact(selected.volume))}</strong></span>
          <span><small>MARKET CAP</small><strong>${selected.marketCap ? escapeHtml(formatCompact(selected.marketCap)) : "—"}</strong></span>
          <span><small>P/E RATIO</small><strong>${selected.pe ? escapeHtml(selected.pe.toFixed(1)) : "—"}</strong></span>
          <span><small>DIVIDEND</small><strong>${selected.yield ? `${escapeHtml(selected.yield.toFixed(1))}%` : "—"}</strong></span>
          <span><small>RISK / OUTLOOK</small><strong>${escapeHtml(selected.risk)} · ${escapeHtml(selected.outlook)}</strong></span>
        </div>
        <div class="player-terminal-position-strip">
          <div><small>YOUR POSITION</small><strong>${escapeHtml(formatNumber(selected.owned))} shares</strong></div>
          <div><small>AVERAGE COST</small><strong>${selected.owned ? escapeHtml(formatCurrency(selected.averageCost, currencyCode)) : "—"}</strong></div>
          <div><small>POSITION VALUE</small><strong>${escapeHtml(formatCurrency(positionValue, currencyCode))}</strong></div>
          <div><small>UNREALIZED GAIN</small><strong class="${toneFromChange(gain)}">${escapeHtml(formatCurrency(gain, currencyCode))}</strong></div>
        </div>
        <div class="player-terminal-market-news-strip"><header><small>RELATED INTELLIGENCE</small><button type="button" data-route="news">Open news ${icon("chevronRight")}</button></header><div>${relatedNews.map((item) => `<button type="button" data-player-news-link="${escapeHtml(item.id)}"><span class="is-${escapeHtml(item.tone)}">${icon("news")}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.time)} · ${escapeHtml(item.severity)} impact</small></div></button>`).join("") || "<p>No active stories for this asset.</p>"}</div></div>
      </section>

      <section class="player-terminal-panel player-terminal-order-ticket">
        <header class="player-terminal-panel-header"><div><span>ORDER TICKET</span><strong>${escapeHtml(selected.symbol)}</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "cyan")}</header>
        <form data-player-form="market-order" data-endpoint="marketOrder">
          <input type="hidden" name="assetId" value="${escapeHtml(selected.id)}" />
          <label>ORDER SIDE<div class="player-terminal-segmented"><label><input type="radio" name="side" value="buy" checked /><span>Buy</span></label><label><input type="radio" name="side" value="sell" /><span>Sell</span></label></div></label>
          <label>ORDER TYPE<select name="orderType"><option value="market">Market</option><option value="limit">Limit</option></select></label>
          <label>QUANTITY<input name="quantity" type="number" min="1" step="1" value="10" required /></label>
          <label>LIMIT PRICE<input name="limitPrice" type="number" min="0" step="0.01" placeholder="Optional for limit order" /></label>
          <div class="player-terminal-order-review">
            <span><small>ESTIMATED VALUE</small><strong data-player-market-estimated-value>${escapeHtml(formatCurrency(selected.price * 10, currencyCode))}</strong></span>
            <span><small>AVAILABLE CASH</small><strong>${escapeHtml(formatCurrency(data.banking.checking.available, currencyCode))}</strong></span>
            <span><small>ESTIMATED FEES</small><strong data-player-market-estimated-fees>${escapeHtml(formatCurrency(selected.price * 10 * 0.0025, currencyCode))}</strong></span>
          </div>
          <div class="player-terminal-order-estimate"><span>Execution notice</span><small>Price, fees, available funds, and final holdings update only after the order is confirmed.</small></div>
          <button class="player-terminal-primary-button" type="submit">${icon("send")} Send order for processing</button>
        </form>
      </section>
    </div>
  </section>`;
}
