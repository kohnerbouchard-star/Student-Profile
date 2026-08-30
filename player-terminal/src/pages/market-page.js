import { escapeHtml, formatCompact, formatCurrency, formatNumber, formatPercent, toneFromChange } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderChange, renderEmptyState, renderStatusPill } from "../components/ui.js";
import { isResourceUnavailable } from "../api/resource-status.js";
import { marketPositionForAsset } from "../api/portfolio-market-holdings.js";

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

function listingCurrencyForAsset(asset, countries, defaultCurrency) {
  const country = countries.find((entry) => entry.id === asset.countryId);
  return String(asset.listingCurrencyCode || country?.currencyCode || defaultCurrency || "ECO").toUpperCase();
}

function renderAssetRow(asset, selectedId, countries, defaultCurrency) {
  const listingCurrency = listingCurrencyForAsset(asset, countries, defaultCurrency);
  return `<button class="player-terminal-asset-row${asset.id === selectedId ? " is-selected" : ""}" type="button" data-player-market-select="${escapeHtml(asset.id)}">
    <span class="player-terminal-asset-symbol">${escapeHtml(asset.symbol.slice(0, 2))}</span>
    <span><strong>${escapeHtml(asset.symbol)}</strong><small>${escapeHtml(asset.name)}</small></span>
    <span><strong>${escapeHtml(formatCurrency(asset.price, listingCurrency))}</strong><small>${escapeHtml(asset.type)} · ${escapeHtml(asset.sector)} · ${escapeHtml(listingCurrency)}</small></span>
    ${renderChange(asset.change)}
  </button>`;
}

function checkingAccountOptions(accounts, selectedKey = "") {
  return accounts.map((account) => `<option value="${escapeHtml(account.accountKey)}"${account.accountKey === selectedKey ? " selected" : ""}>${escapeHtml(account.currencyCode)} · ${escapeHtml(formatCurrency(account.availableAmount, account.currencyCode))} available</option>`).join("");
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
  const chartHistory = escapeHtml(JSON.stringify(Array.isArray(selected.history) ? selected.history : []));
  const sessionCurrencyCode = data.session.currencyCode;
  const selectedCountry = data.countries.find((country) => country.id === selected.countryId);
  const listingCurrencyCode = listingCurrencyForAsset(selected, data.countries, sessionCurrencyCode);
  const position = marketPositionForAsset(data.portfolio, selected);
  const positionValue = position.owned * selected.price;
  const gain = position.owned ? positionValue - position.owned * position.averageCost : 0;
  const bankingUnavailable = isResourceUnavailable(data, "banking");
  const bankingFxUnavailable = isResourceUnavailable(data, "bankingFx");
  const newsUnavailable = isResourceUnavailable(data, "news");
  const relatedNews = newsUnavailable ? [] : data.news.items.filter((item) => selected.newsIds?.includes(item.id)).slice(0, 3);
  const marketVolume = market.assets.reduce((sum, asset) => sum + asset.volume, 0);
  const composite = market.assets.find((asset) => asset.id === "cel-index");
  const compositeChange = Number(composite?.change) || 0;
  const checkingAccounts = bankingFxUnavailable
    ? []
    : (Array.isArray(data.bankingFx?.balances) ? data.bankingFx.balances : [])
      .filter((account) => account.accountKind === "checking" && account.accountKey);
  const matchingListingAccount = checkingAccounts.find((account) => account.currencyCode === listingCurrencyCode);
  const primaryFundingKey = matchingListingAccount?.accountKey || checkingAccounts[0]?.accountKey || "";
  const accountOptions = checkingAccountOptions(checkingAccounts, primaryFundingKey);
  const defaultTargetAmount = Math.round(Number(selected.price || 0) * 10_000) / 10_000;
  const accountSummary = checkingAccounts.length
    ? checkingAccounts.map((account) => `${account.currencyCode} ${formatCurrency(account.availableAmount, account.currencyCode)}`).join(" · ")
    : "Unavailable";
  const tradeDisabled = !checkingAccounts.length || market.status === "CLOSED";

  return `<section class="player-terminal-page player-terminal-market-page" data-page="market">
    <header class="player-terminal-page-heading">
      <div><small>CELESTIAL EXCHANGE</small><h2>Market Terminal</h2><p>Research assets, fund immediate purchases from canonical Checking accounts, and route sale proceeds to the Checking account you choose.</p></div>
      <div class="player-terminal-heading-actions"><button class="player-terminal-secondary-button" type="button" data-route="portfolio">${icon("portfolio")} Portfolio</button>${renderStatusPill(`${market.status} · ${market.nextClose}`, "green")}<button class="player-terminal-icon-button" type="button" data-player-action="refresh-data" aria-label="Refresh market data">${icon("refresh")}</button></div>
    </header>

    <div class="player-terminal-market-summary">
      <article><small>COMPOSITE INDEX</small><strong>${escapeHtml(formatNumber(composite?.price || 0, 2))}</strong><span class="${toneFromChange(compositeChange)}">${escapeHtml(formatPercent(compositeChange))}</span></article>
      <article><small>YOUR PORTFOLIO</small><strong>${escapeHtml(formatCurrency(data.dashboard.portfolioValue, sessionCurrencyCode))}</strong><span class="${toneFromChange(data.dashboard.dailyChange)}">${escapeHtml(formatPercent(data.dashboard.dailyChange))}</span></article>
      <article><small>CHECKING FUNDING</small><strong>${escapeHtml(checkingAccounts.length ? `${checkingAccounts.length} account${checkingAccounts.length === 1 ? "" : "s"}` : "Unavailable")}</strong><span>${escapeHtml(accountSummary)}</span></article>
      <article><small>MARKET VOLUME</small><strong>${escapeHtml(formatCompact(marketVolume))}</strong><span>Across listed assets</span></article>
    </div>

    <div class="player-terminal-market-layout">
      <section class="player-terminal-panel player-terminal-asset-browser">
        <header class="player-terminal-panel-header"><div><span>ASSET DIRECTORY</span><strong>${escapeHtml(assets.length)} instruments</strong></div><button class="player-terminal-icon-button" type="button" aria-label="Search assets" aria-expanded="false" aria-controls="playerMarketSearchPanel" data-player-local-action="market-search">${icon("eye")}</button></header>
        <div id="playerMarketSearchPanel" class="player-terminal-filter-row" data-player-market-search-panel hidden>
          <label><span class="sr-only">Search listed assets</span><input type="search" data-player-market-search autocomplete="off" placeholder="Search symbol, company, or sector"></label>
          <small data-player-market-search-status>${escapeHtml(assets.length)} listed instruments</small>
        </div>
        <div class="player-terminal-filter-row">
          ${market.sectors.map((item) => `<button type="button" class="${item === sector ? "active" : ""}" data-player-market-sector="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}
        </div>
        <div class="player-terminal-asset-list">${assets.length ? assets.map((asset) => renderAssetRow(asset, selected.id, data.countries, sessionCurrencyCode)).join("") : renderEmptyState({ title: "No assets in this sector", detail: "Select another sector to continue browsing.", iconName: "market" })}<p class="player-terminal-inline-empty" data-player-market-search-empty hidden>No listed assets match this search.</p></div>
      </section>

      <section class="player-terminal-panel player-terminal-chart-panel">
        <header class="player-terminal-selected-asset-head">
          <div class="player-terminal-selected-symbol">${escapeHtml(selected.symbol.slice(0, 2))}</div>
          <div><small>${escapeHtml(selected.type)} · ${escapeHtml(selected.sector)} · LISTED IN ${escapeHtml(listingCurrencyCode)}</small><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.symbol)} · ${escapeHtml(selectedCountry?.name || "Celestial Exchange")}</p></div>
          <div class="player-terminal-selected-price"><strong>${escapeHtml(formatCurrency(selected.price, listingCurrencyCode))}</strong>${renderChange(selected.change)}<button class="player-terminal-watchlist-button${selected.watchlisted ? " is-active" : ""}" type="button" data-player-market-watchlist="${escapeHtml(selected.id)}" data-watchlisted="${String(selected.watchlisted)}">${icon("star")} ${selected.watchlisted ? "Watching" : "Watch"}</button></div>
        </header>
        <div class="player-terminal-chart-toolbar"><button type="button" data-player-local-action="chart-range" data-range="1D" aria-pressed="false">1D</button><button class="active" type="button" data-player-local-action="chart-range" data-range="1M" aria-pressed="true">1M</button><button type="button" data-player-local-action="chart-range" data-range="3M" aria-pressed="false">3M</button><button type="button" data-player-local-action="chart-range" data-range="1Y" aria-pressed="false">1Y</button><button type="button" data-player-local-action="chart-range" data-range="ALL" aria-pressed="false">ALL</button><small data-player-market-chart-range-label>1M SERIES</small></div>
        <div class="player-terminal-chart-frame" data-player-market-chart-history="${chartHistory}">
          <svg viewBox="0 0 720 260" preserveAspectRatio="none" role="img" aria-label="Price chart for ${escapeHtml(selected.name)}">
            <defs><linearGradient id="marketArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
            <g class="player-terminal-chart-grid"><path d="M18 52H702M18 104H702M18 156H702M18 208H702"/><path d="M155 18V242M292 18V242M429 18V242M566 18V242"/></g>
            <path class="player-terminal-chart-area" d="${path} L702,242 L18,242 Z"/>
            <path class="player-terminal-chart-line" d="${path}"/>
          </svg>
        </div>
        <div class="player-terminal-asset-facts player-terminal-asset-facts-expanded">
          <span><small>OPEN</small><strong>${escapeHtml(formatCurrency(selected.open, listingCurrencyCode))}</strong></span>
          <span><small>DAY HIGH</small><strong>${escapeHtml(formatCurrency(selected.dayHigh, listingCurrencyCode))}</strong></span>
          <span><small>DAY LOW</small><strong>${escapeHtml(formatCurrency(selected.dayLow, listingCurrencyCode))}</strong></span>
          <span><small>VOLUME</small><strong>${escapeHtml(formatCompact(selected.volume))}</strong></span>
          <span><small>MARKET CAP</small><strong>${selected.marketCap ? escapeHtml(formatCompact(selected.marketCap)) : "—"}</strong></span>
          <span><small>P/E RATIO</small><strong>${selected.pe ? escapeHtml(selected.pe.toFixed(1)) : "—"}</strong></span>
          <span><small>DIVIDEND</small><strong>${selected.yield ? `${escapeHtml(selected.yield.toFixed(1))}%` : "—"}</strong></span>
          <span><small>RISK / OUTLOOK</small><strong>${escapeHtml(selected.risk)} · ${escapeHtml(selected.outlook)}</strong></span>
        </div>
        <div class="player-terminal-position-strip">
          <div><small>YOUR POSITION</small><strong>${escapeHtml(formatNumber(position.owned))} shares</strong></div>
          <div><small>AVERAGE COST</small><strong>${position.owned ? escapeHtml(formatCurrency(position.averageCost, listingCurrencyCode)) : "—"}</strong></div>
          <div><small>POSITION VALUE</small><strong>${escapeHtml(formatCurrency(positionValue, listingCurrencyCode))}</strong></div>
          <div><small>UNREALIZED GAIN</small><strong class="${toneFromChange(gain)}">${escapeHtml(formatCurrency(gain, listingCurrencyCode))}</strong></div>
        </div>
        <div class="player-terminal-market-news-strip"><header><small>RELATED INTELLIGENCE</small><button type="button" data-route="news">Open news ${icon("chevronRight")}</button></header><div>${newsUnavailable ? "<p>Related intelligence is unavailable.</p>" : relatedNews.map((item) => `<button type="button" data-player-news-link="${escapeHtml(item.id)}"><span class="is-${escapeHtml(item.tone)}">${icon("news")}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.time)} · ${escapeHtml(item.severity)} impact</small></div></button>`).join("") || "<p>No active stories for this asset.</p>"}</div></div>
      </section>

      <section class="player-terminal-panel player-terminal-order-ticket">
        <header class="player-terminal-panel-header"><div><span>IMMEDIATE TRADING</span><strong>${escapeHtml(selected.symbol)} · ${escapeHtml(listingCurrencyCode)}</strong></div>${renderStatusPill("C3 QUOTE + SETTLEMENT", "cyan")}</header>
        <div class="player-terminal-order-estimate"><span>Authoritative funding</span><small>${bankingFxUnavailable ? "Canonical Banking FX account data is unavailable; trading is disabled." : "Only canonical Checking accounts are eligible. Foreign-currency accounts are converted through Banking FX; allocation amounts below are target amounts in the Stock listing currency."}</small></div>

        <form data-player-form="market-buy" data-endpoint="marketOrder">
          <input type="hidden" name="action" value="buy_now" />
          <input type="hidden" name="ticker" value="${escapeHtml(selected.symbol)}" />
          <input type="hidden" name="expectedPrice" value="${escapeHtml(String(selected.price))}" />
          <input type="hidden" name="expectedTickIndex" value="${escapeHtml(String(market.tickIndex || 0))}" />
          <label>BUY QUANTITY<input name="quantity" type="number" min="0.0001" step="0.0001" value="1" required /></label>
          <fieldset>
            <legend>FUNDING SPLIT · TARGET ${escapeHtml(listingCurrencyCode)}</legend>
            <label>CHECKING ACCOUNT 1<select name="sourceAccountKey1" required><option value="">Select Checking account</option>${accountOptions}</select></label>
            <label>TARGET AMOUNT 1<input name="targetAmount1" type="number" min="0.0001" step="0.0001" value="${escapeHtml(String(defaultTargetAmount))}" required /></label>
            <label>CHECKING ACCOUNT 2<select name="sourceAccountKey2"><option value="">Optional second account</option>${checkingAccountOptions(checkingAccounts)}</select></label>
            <label>TARGET AMOUNT 2<input name="targetAmount2" type="number" min="0.0001" step="0.0001" placeholder="Optional" /></label>
            <label>CHECKING ACCOUNT 3<select name="sourceAccountKey3"><option value="">Optional third account</option>${checkingAccountOptions(checkingAccounts)}</select></label>
            <label>TARGET AMOUNT 3<input name="targetAmount3" type="number" min="0.0001" step="0.0001" placeholder="Optional" /></label>
          </fieldset>
          <div class="player-terminal-order-review">
            <span><small>CURRENT PRICE</small><strong>${escapeHtml(formatCurrency(selected.price, listingCurrencyCode))}</strong></span>
            <span><small>PRICE TICK</small><strong>#${escapeHtml(String(market.tickIndex || 0))}</strong></span>
            <span><small>DEFAULT TARGET</small><strong>${escapeHtml(formatCurrency(defaultTargetAmount, listingCurrencyCode))}</strong></span>
          </div>
          <div class="player-terminal-order-estimate"><span>Buy settlement</span><small>The server creates a locked C3B quote and settles that exact quote through C3C. Price, tick, account ownership, available funds, and FX are revalidated before settlement; any mismatch fails closed.</small></div>
          <button class="player-terminal-primary-button" type="submit"${tradeDisabled ? " disabled" : ""}>${icon("send")} Buy now</button>
        </form>

        <form data-player-form="market-sell" data-endpoint="marketOrder">
          <input type="hidden" name="action" value="settle_sell" />
          <input type="hidden" name="ticker" value="${escapeHtml(selected.symbol)}" />
          <input type="hidden" name="expectedPrice" value="${escapeHtml(String(selected.price))}" />
          <input type="hidden" name="expectedTickIndex" value="${escapeHtml(String(market.tickIndex || 0))}" />
          <label>SELL QUANTITY<input name="quantity" type="number" min="0.0001" step="0.0001" max="${escapeHtml(String(position.owned || 0))}" value="${position.owned > 0 ? "1" : "0"}" required /></label>
          <label>PROCEEDS DESTINATION<select name="destinationAccountKey" required><option value="">Select Checking account</option>${accountOptions}</select></label>
          <div class="player-terminal-order-review">
            <span><small>OWNED</small><strong>${escapeHtml(formatNumber(position.owned))} shares</strong></span>
            <span><small>LISTING CURRENCY</small><strong>${escapeHtml(listingCurrencyCode)}</strong></span>
            <span><small>DESTINATION FX</small><strong>${checkingAccounts.some((account) => account.currencyCode !== listingCurrencyCode) ? "B2 enabled" : "Not required"}</strong></span>
          </div>
          <div class="player-terminal-order-estimate"><span>Sell settlement</span><small>C3D debits shares once, settles proceeds through canonical market liquidity, and credits the selected Checking account. A destination in another currency is converted by the authoritative Banking FX boundary.</small></div>
          <button class="player-terminal-secondary-button" type="submit"${tradeDisabled || position.owned <= 0 ? " disabled" : ""}>${icon("send")} Sell now</button>
        </form>

        ${bankingUnavailable ? "<p class=\"player-terminal-inline-empty\">Banking summary is unavailable; Stock funding still relies only on the canonical Banking FX account model.</p>" : ""}
      </section>
    </div>
  </section>`;
}