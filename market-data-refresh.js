/* Market Data refresh loaded after app.js. */

window.normalizeMarketRow = function normalizeMarketRow(row) {
  return {
    ticker: pick(row, ["ticker", "Ticker"]),
    companyName: pick(row, ["companyName", "Company_Name", "Company Name", "Name", "name"]),
    sector: pick(row, ["sector", "Sector"]),
    currentPrice: toNumber(pick(row, ["currentPrice", "Current_Price", "Current Price", "Price", "price"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change", "change"]),
    trend: pick(row, ["trend", "Trend"]),
    assetType: pick(row, ["assetType", "Asset_Type", "Asset Type", "Type", "type"]),
    previousClose: toNumber(pick(row, ["previousClose", "Previous_Close", "Previous Close", "Prev Close", "prevClose"])),
    openPrice: toNumber(pick(row, ["openPrice", "Open_Price", "Open Price", "Open", "open"])),
    dayHigh: toNumber(pick(row, ["dayHigh", "Day_High", "Day High", "High", "high"])),
    dayLow: toNumber(pick(row, ["dayLow", "Day_Low", "Day Low", "Low", "low"])),
    volume: toNumber(pick(row, ["volume", "Volume", "Trading Volume", "Trading_Volume"])),
    marketCap: toNumber(pick(row, ["marketCap", "Market_Cap", "Market Cap", "Market Value", "Market_Value"])),
    peRatio: pick(row, ["peRatio", "PE_Ratio", "P/E", "PE", "P E"]),
    dividendYield: pick(row, ["dividendYield", "Dividend_Yield", "Dividend Yield", "Yield", "yield"]),
    beta: pick(row, ["beta", "Beta"]),
    description: pick(row, ["description", "Description", "Company_Description", "Company Description", "Notes", "notes"]),
    notes: pick(row, ["notes", "Notes"]),
    history: pick(row, ["history", "History", "priceHistory", "Price_History", "Price History", "Sparkline", "sparkline"]),
    lastUpdated: pick(row, ["lastUpdated", "Last_Updated", "Last Updated", "Timestamp", "timestamp"])
  };
};

window.renderStockProfile = function renderStockProfile() {
  const rows = state.market || [];
  const defaultTicker = rows[0]?.ticker || "";
  const sectorCount = new Set(rows.map((m) => m.sector).filter(Boolean)).size;
  const avgChange = rows.length
    ? rows.reduce((total, row) => total + parseMarketPercent(row.changePct), 0) / rows.length
    : 0;
  const topMover = rows
    .slice()
    .sort((a, b) => Math.abs(parseMarketPercent(b.changePct)) - Math.abs(parseMarketPercent(a.changePct)))[0];

  document.getElementById("stockProfile").innerHTML = `
    <div class="grid cols-4 market-overview-grid">
      ${metric("Listed Stocks", rows.length, "Available companies", "Stocks currently available in the classroom market.")}
      ${metric("Sectors", sectorCount, "Market categories", "Number of sectors represented in the market list.")}
      ${metric("Average Move", formatSignedPercent(avgChange), avgChange >= 0 ? "Market trending up" : "Market trending down", "Average percent change across all listed stocks.")}
      ${metric("Top Mover", topMover?.ticker || "—", topMover ? formatMarketPercent(topMover.changePct) : "No movement", "Stock with the largest absolute price movement.")}
    </div>

    <div class="card market-control-card" style="margin-top:16px;">
      <div>
        <h2 class="card-title">Market Data</h2>
        ${help("Select a stock to review price movement, company details, sector peers, and your current holding.")}
      </div>

      <label class="market-select-wrap">
        <span class="field-label">Choose a Stock</span>
        <select id="stockProfileTicker" onchange="renderStockProfileDetail()">
          ${rows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)} · ${money(m.currentPrice)}</option>`).join("")}
        </select>
      </label>
    </div>

    <div id="stockProfileDetail" style="margin-top:16px;"></div>`;

  if (defaultTicker) {
    document.getElementById("stockProfileTicker").value = defaultTicker;
  }

  renderStockProfileDetail();
};

window.renderStockProfileDetail = function renderStockProfileDetail() {
  const ticker = document.getElementById("stockProfileTicker")?.value;
  const m = findMarket(ticker) || (state.market || [])[0];

  if (!m) {
    document.getElementById("stockProfileDetail").innerHTML = `<div class="empty">No market data is available right now.</div>`;
    return;
  }

  const change = parseMarketPercent(m.changePct);
  const trendClass = change >= 0 ? "positive" : "negative";
  const currentPrice = Number(m.currentPrice || 0);
  const previousClose = Number(m.previousClose || 0);
  const priceMove = previousClose ? currentPrice - previousClose : 0;

  document.getElementById("stockProfileDetail").innerHTML = `
    <div class="market-data-layout">
      <div class="card market-main-card">
        <div class="market-stock-header">
          <div>
            <div class="eyebrow">${sanitize(m.sector || "Market")} · ${sanitize(m.assetType || "Stock")}</div>
            <h2>${sanitize(m.companyName || m.ticker)} <span class="badge">${sanitize(m.ticker)}</span></h2>
          </div>
          <div class="market-price-block">
            <div class="large-price">${money(m.currentPrice)}</div>
            <span class="market-change-pill ${trendClass}">${formatMarketPercent(m.changePct)}</span>
          </div>
        </div>

        ${renderMarketSparkline(m)}

        <div class="market-fact-grid">
          ${marketFact("Sector", m.sector || "—")}
          ${marketFact("Trend", m.trend || (change >= 0 ? "Up" : "Down"))}
          ${marketFact("Asset Type", m.assetType || "—")}
          ${marketFact("Updated", formatDateTime(m.lastUpdated))}
          ${marketFact("Previous Close", previousClose ? money(previousClose) : "—")}
          ${marketFact("Price Move", previousClose ? money(priceMove) : "—", trendClass)}
          ${marketFact("Day Range", formatMarketRange(m.dayLow, m.dayHigh))}
          ${marketFact("Volume", formatCompactNumber(m.volume))}
          ${marketFact("Market Cap", formatCompactMoney(m.marketCap))}
          ${marketFact("P/E", formatPlainNumber(m.peRatio))}
          ${marketFact("Dividend Yield", formatMarketPercent(m.dividendYield))}
          ${marketFact("Beta", formatPlainNumber(m.beta))}
        </div>
      </div>

      <div class="market-side-stack">
        <div class="card">
          <h2 class="card-title">My Holding</h2>
          ${help("This shows whether you currently own this stock.")}
          <div class="mini-list">
            ${holdingSummary(m.ticker)}
          </div>
        </div>

        <div class="card">
          <h2 class="card-title">Sector Peers</h2>
          ${help("A quick comparison against other stocks in the same sector.")}
          ${renderSectorPeers(m)}
        </div>

        <div class="card">
          <h2 class="card-title">Company Note</h2>
          <p class="market-company-note">${sanitize(m.description || m.notes || "No company description has been added yet.")}</p>
        </div>
      </div>
    </div>`;
};

window.holdingSummary = function holdingSummary(ticker) {
  const holding = (state.portfolio || []).find((p) => p.ticker === ticker);

  if (!holding) {
    return mini("Shares", "0") + mini("Status", "No current position");
  }

  const market = findMarket(ticker);
  const currentPrice = Number(market?.currentPrice || holding.currentPrice || holding.avgBuyPrice || 0);
  const marketValue = Number(holding.sharesOwned || 0) * currentPrice;
  const gainLoss = marketValue - Number(holding.totalCost || 0);

  return [
    mini("Shares", holding.sharesOwned),
    mini("Average Buy", money(holding.avgBuyPrice)),
    mini("Current Price", money(currentPrice)),
    mini("Market Value", money(marketValue)),
    mini("Gain / Loss", money(gainLoss)),
    mini("Last Updated", formatDateTime(holding.lastUpdated))
  ].join("");
};

function marketFact(label, value, tone = "") {
  const toneClass = tone ? ` ${tone}` : "";
  return `
    <div class="market-fact${toneClass}">
      <span>${sanitize(label)}</span>
      <strong>${sanitize(value ?? "—")}</strong>
    </div>`;
}

function renderSectorPeers(stock) {
  const peers = (state.market || [])
    .filter((row) => row.ticker !== stock.ticker && row.sector && row.sector === stock.sector)
    .slice(0, 6);

  if (!peers.length) {
    return `<div class="empty">No sector peers are available yet.</div>`;
  }

  return `
    <div class="market-peer-list">
      ${peers.map((peer) => {
        const change = parseMarketPercent(peer.changePct);
        const cls = change >= 0 ? "positive" : "negative";
        return `
          <div class="market-peer-row">
            <div>
              <strong>${sanitize(peer.ticker)}</strong>
              <span>${sanitize(peer.companyName || peer.ticker)}</span>
            </div>
            <div>
              <strong>${money(peer.currentPrice)}</strong>
              <span class="${cls}">${formatMarketPercent(peer.changePct)}</span>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

function renderMarketSparkline(stock) {
  const points = buildMarketChartPoints(stock);
  const currentPrice = Number(stock.currentPrice || 0);
  const change = parseMarketPercent(stock.changePct);
  const trendClass = change >= 0 ? "positive" : "negative";

  if (!points.length || !currentPrice) {
    return `<div class="market-chart-empty">No chart data is available for this stock yet.</div>`;
  }

  const width = 720;
  const height = 260;
  const paddingX = 28;
  const paddingY = 28;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords = points.map((point, index) => {
    const x = paddingX + (index / Math.max(points.length - 1, 1)) * (width - paddingX * 2);
    const y = paddingY + ((max - point.price) / range) * (height - paddingY * 2);
    return { ...point, x, y };
  });

  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${height - paddingY} L ${coords[0].x.toFixed(2)} ${height - paddingY} Z`;

  return `
    <div class="market-chart-panel">
      <div class="market-chart-topline">
        <div>
          <span>Price movement</span>
          <strong>${money(min)} – ${money(max)}</strong>
        </div>
        <div>
          <span>Current</span>
          <strong>${money(currentPrice)}</strong>
        </div>
      </div>

      <svg class="market-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price chart for ${sanitize(stock.ticker)}">
        <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" class="market-chart-axis"></line>
        <path d="${areaPath}" class="market-chart-area ${trendClass}"></path>
        <path d="${linePath}" class="market-chart-line ${trendClass}"></path>
        ${coords.map((point) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" class="market-chart-dot ${trendClass}"><title>${sanitize(point.label)} · ${money(point.price)}</title></circle>`).join("")}
      </svg>

      <div class="market-chart-caption">
        Chart uses supplied price history when available; otherwise it estimates a simple intraday path from current price and change.
      </div>
    </div>`;
}

function buildMarketChartPoints(stock) {
  const parsed = parseMarketHistory(stock.history);

  if (parsed.length >= 2) {
    return parsed.map((price, index) => ({
      label: index === parsed.length - 1 ? "Now" : `Point ${index + 1}`,
      price
    }));
  }

  const current = Number(stock.currentPrice || 0);
  if (!current) return [];

  const change = parseMarketPercent(stock.changePct);
  const start = change ? current / (1 + change / 100) : current * 0.985;
  const steps = 8;
  const volatility = Math.min(Math.max(Math.abs(change || 2), 1), 8);

  return Array.from({ length: steps }, (_, index) => {
    const progress = index / (steps - 1);
    const wave = Math.sin(index * 1.35) * current * (volatility / 100) * 0.12;
    const price = start + (current - start) * progress + (index === steps - 1 ? 0 : wave);

    return {
      label: index === steps - 1 ? "Now" : `T-${steps - index - 1}`,
      price: Math.max(price, 0)
    };
  });
}

function parseMarketHistory(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => typeof entry === "object" ? entry.price ?? entry.value ?? entry.close : entry)
      .map(toNumber)
      .filter((number) => number > 0);
  }

  const text = String(value).trim();

  if (text.startsWith("[")) {
    try {
      return parseMarketHistory(JSON.parse(text));
    } catch (_) {}
  }

  return text
    .split(/[,|;\s]+/)
    .map(toNumber)
    .filter((number) => number > 0);
}

function parseMarketPercent(value) {
  if (value === undefined || value === null || value === "") return 0;

  const raw = String(value).trim();
  const number = Number(raw.replace("%", ""));

  if (!Number.isFinite(number)) return 0;
  if (!raw.includes("%") && Math.abs(number) <= 1) return number * 100;

  return number;
}

function formatSignedPercent(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatMarketPercent(value) {
  if (value === undefined || value === null || value === "") return "—";
  return formatSignedPercent(parseMarketPercent(value));
}

function formatPlainNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return "—";
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return "—";
  return number.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1
  });
}

function formatCompactMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return "—";

  return number.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  });
}

function formatMarketRange(low, high) {
  const lowNumber = Number(low || 0);
  const highNumber = Number(high || 0);

  if (!lowNumber && !highNumber) return "—";
  if (!lowNumber) return `High ${money(highNumber)}`;
  if (!highNumber) return `Low ${money(lowNumber)}`;

  return `${money(lowNumber)} – ${money(highNumber)}`;
}
