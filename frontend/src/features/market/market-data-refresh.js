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
    history: pick(row, ["history", "History", "priceHistory", "Price_History", "Price History", "Price_History_JSON", "Price History JSON", "Sparkline", "sparkline"]),
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
    <div class="market-page-v2">
      <div class="market-page-top">
        <div>
          <div class="eyebrow">Market data</div>
          <h2>Market Data</h2>
          <p>Review price movement, compare company details, and connect market signals to portfolio decisions.</p>
        </div>

        <label class="market-select-card">
          <span>Choose stock</span>
          <select id="stockProfileTicker" onchange="renderStockProfileDetail()">
            ${rows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)} · ${money(m.currentPrice)}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="market-snapshot-row">
        ${marketSnapshot("Listed stocks", rows.length, "Available companies")}
        ${marketSnapshot("Sectors", sectorCount, "Market categories")}
        ${marketSnapshot("Average move", formatSignedPercent(avgChange), avgChange >= 0 ? "Broad market up" : "Broad market down")}
        ${marketSnapshot("Top mover", topMover?.ticker || "—", topMover ? formatMarketPercent(topMover.changePct) : "No movement")}
      </div>

      <div id="stockProfileDetail"></div>
    </div>`;

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

  const pane = document.getElementById("stockProfile");
  const range = pane?.dataset.marketRange || "1D";
  const change = parseMarketPercent(m.changePct);
  const trendClass = change >= 0 ? "positive" : "negative";
  const previousClose = Number(m.previousClose || 0);
  const priceMove = previousClose ? Number(m.currentPrice || 0) - previousClose : 0;

  document.getElementById("stockProfileDetail").innerHTML = `
    <div class="market-detail-v2">
      <section class="market-chart-card-v2">
        <div class="market-stock-bar">
          <div>
            <div class="market-stock-meta">${sanitize(m.sector || "Market")} · ${sanitize(m.assetType || "Stock")}</div>
            <h2>${sanitize(m.companyName || m.ticker)} <span>${sanitize(m.ticker)}</span></h2>
          </div>

          <div class="market-price-cluster">
            <strong>${money(m.currentPrice)}</strong>
            <span class="market-move ${trendClass}">${formatMarketPercent(m.changePct)}</span>
          </div>
        </div>

        <div class="market-chart-actions" aria-label="Chart range">
          ${["1D", "1W", "1M"].map((label) => `
            <button type="button" class="${range === label ? "active" : ""}" onclick="setMarketChartRange('${label}')">${label}</button>
          `).join("")}
        </div>

        ${renderMarketChart(m, range)}
      </section>

      <aside class="market-info-panel-v2">
        <div class="card market-holding-card">
          <h2 class="card-title">My Position</h2>
          <div class="mini-list">${holdingSummary(m.ticker)}</div>
        </div>

        <div class="market-stat-stack">
          ${marketStat("Previous close", previousClose ? money(previousClose) : "—")}
          ${marketStat("Price move", previousClose ? money(priceMove) : "—", trendClass)}
          ${marketStat("Day range", formatMarketRange(m.dayLow, m.dayHigh))}
          ${marketStat("Volume", formatCompactNumber(m.volume))}
          ${marketStat("Market cap", formatCompactMoney(m.marketCap))}
          ${marketStat("Updated", formatDateTime(m.lastUpdated))}
        </div>
      </aside>
    </div>

    <div class="market-lower-grid">
      <div class="card">
        <h2 class="card-title">Sector Peers</h2>
        ${renderSectorPeers(m)}
      </div>

      <div class="card">
        <h2 class="card-title">Company Note</h2>
        <p class="market-company-note">${sanitize(m.description || m.notes || "No company description has been added yet.")}</p>
      </div>

      <div class="card market-news-briefing" id="marketImportedNewsCard">
        <h2 class="card-title">Market Briefing</h2>
        ${renderMarketCompanyNews(m)}
      </div>

    </div>`;
};

window.setMarketChartRange = function setMarketChartRange(range) {
  const pane = document.getElementById("stockProfile");
  if (pane) pane.dataset.marketRange = range;
  renderStockProfileDetail();
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

function marketSnapshot(label, value, note) {
  return `
    <div class="market-snapshot-card">
      <span>${sanitize(label)}</span>
      <strong>${sanitize(value)}</strong>
      <small>${sanitize(note || "")}</small>
    </div>`;
}

function marketStat(label, value, tone = "") {
  return `
    <div class="market-stat ${tone}">
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
    <div class="market-peer-list-v2">
      ${peers.map((peer) => {
        const change = parseMarketPercent(peer.changePct);
        const cls = change >= 0 ? "positive" : "negative";
        return `
          <button type="button" class="market-peer-chip" onclick="selectMarketPeer('${sanitize(peer.ticker)}')">
            <span>
              <strong>${sanitize(peer.ticker)}</strong>
              <small>${sanitize(peer.companyName || peer.ticker)}</small>
            </span>
            <span>
              <strong>${money(peer.currentPrice)}</strong>
              <small class="${cls}">${formatMarketPercent(peer.changePct)}</small>
            </span>
          </button>`;
      }).join("")}
    </div>`;
}

window.selectMarketPeer = function selectMarketPeer(ticker) {
  const select = document.getElementById("stockProfileTicker");
  if (!select) return;

  select.value = ticker;
  renderStockProfileDetail();
};

function renderMarketChart(stock, range) {
  const points = buildMarketChartPoints(stock, range);
  const currentPrice = Number(stock.currentPrice || 0);
  const change = parseMarketPercent(stock.changePct);
  const trendClass = change >= 0 ? "positive" : "negative";

  if (!points.length || !currentPrice) {
    return `<div class="market-chart-empty">No chart data is available for this stock yet.</div>`;
  }

  const width = 920;
  const height = 420;
  const left = 72;
  const right = 28;
  const top = 26;
  const bottom = 58;
  const chartW = width - left - right;
  const chartH = height - top - bottom;

  const prices = points.map((p) => p.price);
  const minRaw = Math.min(...prices);
  const maxRaw = Math.max(...prices);
  const pad = Math.max((maxRaw - minRaw) * 0.16, currentPrice * 0.006, 1);
  const min = Math.max(0, minRaw - pad);
  const max = maxRaw + pad;
  const rangeValue = max - min || 1;

  const coords = points.map((point, index) => {
    const x = left + (index / Math.max(points.length - 1, 1)) * chartW;
    const y = top + ((max - point.price) / rangeValue) * chartH;
    return { ...point, x, y };
  });

  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${height - bottom} L ${coords[0].x.toFixed(2)} ${height - bottom} Z`;

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = max - (rangeValue * index / 4);
    const y = top + (chartH * index / 4);
    return { value, y };
  });

  const xTickIndexes = [0, Math.floor((coords.length - 1) / 2), coords.length - 1]
    .filter((value, index, arr) => arr.indexOf(value) === index);

  return `
    <div class="market-chart-shell">
      <div class="market-chart-heading">
        <div>
          <span>Price chart</span>
          <strong>${sanitize(stock.ticker)} · ${sanitize(range)}</strong>
        </div>
        <div>
          <span>Range</span>
          <strong>${money(minRaw)} – ${money(maxRaw)}</strong>
        </div>
      </div>

      <div class="market-chart-frame">
        <svg class="market-chart-v2" viewBox="0 0 ${width} ${height}" role="img" aria-label="${sanitize(stock.ticker)} price chart with x and y axis">
          ${yTicks.map((tick) => `
            <line x1="${left}" y1="${tick.y.toFixed(2)}" x2="${width - right}" y2="${tick.y.toFixed(2)}" class="market-grid-line"></line>
            <text x="${left - 12}" y="${(tick.y + 4).toFixed(2)}" class="market-y-label" text-anchor="end">${sanitize(shortMoney(tick.value))}</text>
          `).join("")}

          <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="market-axis-line"></line>
          <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" class="market-axis-line"></line>

          ${xTickIndexes.map((index) => `
            <text x="${coords[index].x.toFixed(2)}" y="${height - 22}" class="market-x-label" text-anchor="middle">${sanitize(coords[index].label)}</text>
          `).join("")}

          <text x="${left + chartW / 2}" y="${height - 4}" class="market-axis-title" text-anchor="middle">Time</text>
          <text x="16" y="${top + chartH / 2}" class="market-axis-title market-axis-title-y" text-anchor="middle">Price</text>

          <path d="${areaPath}" class="market-chart-area-v2 ${trendClass}"></path>
          <path d="${linePath}" class="market-chart-line-v2 ${trendClass}"></path>

          ${coords.map((point, index) => `
            <circle
              cx="${point.x.toFixed(2)}"
              cy="${point.y.toFixed(2)}"
              r="${index === coords.length - 1 ? 5 : 3.5}"
              class="market-chart-point ${trendClass}"
              data-label="${sanitize(point.label)}"
              data-price="${sanitize(money(point.price))}"
              onmousemove="showMarketChartTip(evt, this)"
              onmouseleave="hideMarketChartTip()"
            ></circle>
          `).join("")}
        </svg>

        <div id="marketChartTooltip" class="market-chart-tooltip hidden"></div>
      </div>
    </div>`;
}

window.showMarketChartTip = function showMarketChartTip(event, point) {
  const tooltip = document.getElementById("marketChartTooltip");
  if (!tooltip) return;

  tooltip.innerHTML = `<strong>${point.dataset.price}</strong><span>${point.dataset.label}</span>`;
  tooltip.classList.remove("hidden");

  const frame = point.closest(".market-chart-frame");
  const rect = frame.getBoundingClientRect();

  tooltip.style.left = `${event.clientX - rect.left + 12}px`;
  tooltip.style.top = `${event.clientY - rect.top - 44}px`;
};

window.hideMarketChartTip = function hideMarketChartTip() {
  const tooltip = document.getElementById("marketChartTooltip");
  if (tooltip) tooltip.classList.add("hidden");
};

function buildMarketChartPoints(stock, range = "1D") {
  const parsed = parseMarketHistory(stock.history);

  if (parsed.length >= 2) {
    const wanted = range === "1M" ? 24 : range === "1W" ? 14 : 9;
    return parsed.slice(-wanted).map((point, index, arr) => ({
      label: point.label || makePointLabel(index, arr.length, range),
      price: point.price
    }));
  }

  return generateMarketLikePricePath(stock, range);
}

function generateMarketLikePricePath(stock, range = "1D") {
  const current = Number(stock.currentPrice || 0);
  if (!current) return [];

  const changePct = parseMarketPercent(stock.changePct);
  const steps = range === "1M" ? 24 : range === "1W" ? 14 : 9;

  const seedSource = [
    stock.ticker,
    stock.sector,
    stock.currentPrice,
    stock.changePct,
    stock.lastUpdated,
    range
  ].join("|");

  const random = seededRandom(hashString(seedSource));
  const rangeMultiplier = range === "1M" ? 2.4 : range === "1W" ? 1.55 : 1;

  const baseVolatility = clamp(
    (Math.abs(changePct) / 100) * 0.72 * rangeMultiplier + 0.008,
    0.008,
    0.09
  );

  const targetStart = current / Math.max(0.12, 1 + ((changePct * rangeMultiplier) / 100));
  const logStart = Math.log(Math.max(targetStart, 0.01));
  const logEnd = Math.log(Math.max(current, 0.01));

  let logPrice = logStart;
  let volatilityState = baseVolatility;
  let momentum = 0;
  const points = [];

  for (let index = 0; index < steps; index += 1) {
    const progress = index / Math.max(steps - 1, 1);
    const targetLog = logStart + (logEnd - logStart) * progress;

    if (index === 0) {
      points.push({ label: makePointLabel(index, steps, range), price: Math.exp(logPrice) });
      continue;
    }

    if (index === steps - 1) {
      points.push({ label: makePointLabel(index, steps, range), price: current });
      continue;
    }

    const jumpShock = random() > 0.88 ? normalRandom(random) * baseVolatility * 2.6 : 0;
    const volatilityNoise = Math.abs(normalRandom(random)) * baseVolatility * 0.55;

    volatilityState = clamp(
      volatilityState * 0.72 + volatilityNoise * 0.28,
      baseVolatility * 0.55,
      baseVolatility * 2.25
    );

    const marketNoise = normalRandom(random) * volatilityState;
    momentum = momentum * 0.42 + marketNoise * 0.58;

    const meanReversion = (targetLog - logPrice) * 0.27;
    const microDrift = (logEnd - logStart) / Math.max(steps - 1, 1);

    logPrice = logPrice + microDrift + meanReversion + momentum + jumpShock;

    points.push({
      label: makePointLabel(index, steps, range),
      price: Math.max(Math.exp(logPrice), current * 0.05)
    });
  }

  return points;
}

function parseMarketHistory(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => parseMarketHistoryEntry(entry, index))
      .filter((point) => point && point.price > 0);
  }

  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      return parseMarketHistory(Array.isArray(parsed) ? parsed : Object.values(parsed));
    } catch (_) {}
  }

  // Supports either:
  // "101.2,102.4,103.1"
  // or "2026-06-03 10:32:08|101.2;2026-06-03 10:37:09|102.4"
  return text
    .split(/[;\n]+/)
    .flatMap((chunk) => chunk.includes("|") || chunk.includes(":")
      ? [chunk]
      : chunk.split(",")
    )
    .map((entry, index) => parseMarketHistoryEntry(entry, index))
    .filter((point) => point && point.price > 0);
}

function parseMarketHistoryEntry(entry, index) {
  if (entry === undefined || entry === null || entry === "") return null;

  if (typeof entry === "number") {
    return { label: `Point ${index + 1}`, price: entry };
  }

  if (typeof entry === "object") {
    const price = Number(entry.price ?? entry.Price ?? entry.close ?? entry.Close ?? entry.value ?? entry.Value ?? 0);
    const timestamp = entry.timestamp ?? entry.Timestamp ?? entry.time ?? entry.Time ?? entry.date ?? entry.Date ?? "";
    return {
      label: formatHistoryLabel(timestamp, index),
      price
    };
  }

  const text = String(entry).trim();
  if (!text) return null;

  const pipeParts = text.split("|");
  if (pipeParts.length >= 2) {
    return {
      label: formatHistoryLabel(pipeParts[0], index),
      price: toNumber(pipeParts[1])
    };
  }

  const colonMatch = text.match(/^(.+?)[:=]\s*([$,\d.]+)$/);
  if (colonMatch) {
    return {
      label: formatHistoryLabel(colonMatch[1], index),
      price: toNumber(colonMatch[2])
    };
  }

  return {
    label: `Point ${index + 1}`,
    price: toNumber(text)
  };
}

function formatHistoryLabel(value, index) {
  if (!value) return `Point ${index + 1}`;

  const text = String(value).trim();
  const parsed = Date.parse(text.replace(" ", "T"));

  if (!Number.isNaN(parsed)) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(parsed));
    } catch (_) {}
  }

  return text;
}

function makePointLabel(index, total, range) {
  if (index === total - 1) return "Now";

  if (range === "1M") return `${total - index - 1}d ago`;
  if (range === "1W") return `${Math.ceil((total - index - 1) / 2)}d ago`;

  return `${total - index - 1}h ago`;
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 123456789;

  return function random() {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function normalRandom(random) {
  const u = Math.max(random(), 0.000001);
  const v = Math.max(random(), 0.000001);

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function shortMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";

  if (Math.abs(number) >= 1000) {
    return number.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1
    });
  }

  return number.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
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

/* Force refreshed renderer into existing app render flow. */
(function activateMarketDataRefresh() {
  try {
    renderStockProfile = window.renderStockProfile;
    renderStockProfileDetail = window.renderStockProfileDetail;
    holdingSummary = window.holdingSummary;
  } catch (_) {}

  let renderingMarketRefresh = false;

  function shouldRenderMarketRefresh() {
    const pane = document.getElementById("stockProfile");
    if (!pane || !pane.classList.contains("active")) return false;
    if (pane.querySelector(".market-page-v2")) return false;
    return typeof window.renderStockProfile === "function";
  }

  function renderMarketRefreshSoon() {
    window.setTimeout(() => {
      if (renderingMarketRefresh || !shouldRenderMarketRefresh()) return;

      renderingMarketRefresh = true;
      try {
        window.renderStockProfile();
      } finally {
        window.setTimeout(() => {
          renderingMarketRefresh = false;
        }, 80);
      }
    }, 0);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-view="stockProfile"]')) {
      renderMarketRefreshSoon();
    }
  });

  const pane = document.getElementById("stockProfile");
  if (pane) {
    new MutationObserver(renderMarketRefreshSoon).observe(pane, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderMarketRefreshSoon, { once: true });
  } else {
    renderMarketRefreshSoon();
  }
})();


function renderMarketCompanyNews(stock) {
  const ticker = String(stock?.ticker || "").toUpperCase();

  const reports = (state.news || [])
    .filter((item) => String(item.ticker || "").toUpperCase() === ticker)
    .slice(0, 8);

  if (!reports.length) {
    return `<div class="empty">No market briefing reports are available for ${sanitize(ticker)} yet. Refresh after new market news is created.</div>`;
  }

  return `
    <div class="company-news-list">
      ${reports.map((item) => {
        const sentiment = String(item.sentiment || "Neutral").toLowerCase();
        const sentimentClass =
          sentiment === "positive"
            ? "news-positive"
            : sentiment === "negative"
              ? "news-negative"
              : "news-neutral";

        return `
          <article class="company-news-card ${sentimentClass}" role="button" tabindex="0" data-market-news="${encodeURIComponent(JSON.stringify(item))}">
            <div class="news-card-topline">
              <span class="badge">${sanitize(item.sentiment || "Neutral")}</span>
              <span class="badge">${sanitize(item.impact || "Low")} Impact</span>
              <span>${sanitize(formatDateTime(item.timestamp || item.date || ""))}</span>
            </div>
            <h4>${sanitize(item.headline || "Market update")}</h4>
            <p>${sanitize(item.summary || "")}</p>
            <div class="news-meta">
              <span>${sanitize(item.sector || stock.sector || "")}</span>
              <span>${formatMarketPercent(item.changePct)}</span>
              ${item.priceAfter ? `<span>Price: ${money(item.priceAfter)}</span>` : ""}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}


function ensureMarketNewsPopupStyles() {
  if (document.getElementById("marketNewsPopupStyles")) return;

  const style = document.createElement("style");
  style.id = "marketNewsPopupStyles";
  style.textContent = `
    .market-news-popup-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(6, 12, 24, 0.62);
      backdrop-filter: blur(8px);
    }

    .market-news-popup {
      width: min(680px, 100%);
      max-height: min(720px, 90vh);
      overflow: auto;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 24px;
      background: #101828;
      color: #fff;
      box-shadow: 0 24px 80px rgba(0,0,0,0.35);
      padding: 24px;
    }

    .market-news-popup h3 {
      margin: 8px 0 12px;
      font-size: 1.45rem;
      line-height: 1.2;
    }

    .market-news-popup p {
      color: rgba(255,255,255,0.78);
      line-height: 1.6;
    }

    .market-news-popup-close {
      float: right;
      border: 0;
      border-radius: 999px;
      width: 36px;
      height: 36px;
      cursor: pointer;
      background: rgba(255,255,255,0.12);
      color: #fff;
      font-size: 22px;
      line-height: 1;
    }

    .company-news-card[role="button"] {
      cursor: pointer;
    }

    .company-news-card[role="button"]:focus-visible {
      outline: 3px solid rgba(96, 165, 250, 0.8);
      outline-offset: 3px;
    }
  `;
  document.head.appendChild(style);
}

function openMarketNewsPopup(card) {
  const raw = card && card.getAttribute("data-market-news");
  if (!raw) return;

  let item = null;
  try {
    item = JSON.parse(decodeURIComponent(raw));
  } catch (_) {
    return;
  }

  ensureMarketNewsPopupStyles();

  const existing = document.getElementById("marketNewsPopupBackdrop");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "marketNewsPopupBackdrop";
  overlay.className = "market-news-popup-backdrop";
  overlay.innerHTML = `
    <section class="market-news-popup" role="dialog" aria-modal="true" aria-label="Market briefing details">
      <button type="button" class="market-news-popup-close" data-close-news-popup aria-label="Close market briefing">×</button>
      <div class="eyebrow">Market Briefing</div>
      <h3>${sanitize(item.headline || "Market update")}</h3>
      <div class="news-card-topline">
        <span class="badge">${sanitize(item.sentiment || "Neutral")}</span>
        <span class="badge">${sanitize(item.impact || "Low")} Impact</span>
        <span>${sanitize(formatDateTime(item.timestamp || item.date || ""))}</span>
      </div>
      <p>${sanitize(item.summary || "No summary has been added for this report yet.")}</p>
      <div class="news-meta">
        <span>${sanitize(item.ticker || "")}</span>
        <span>${sanitize(item.sector || "")}</span>
        <span>${formatMarketPercent(item.changePct)}</span>
        ${item.priceAfter ? `<span>Price: ${money(item.priceAfter)}</span>` : ""}
      </div>
    </section>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close-news-popup]")) {
      close();
    }
  });

  const onKeydown = (event) => {
    if (event.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKeydown);
    }
  };

  document.addEventListener("keydown", onKeydown);
}

if (!window.__marketNewsPopupClickBound) {
  window.__marketNewsPopupClickBound = true;

  document.addEventListener("click", (event) => {
    const card = event.target.closest(".company-news-card[data-market-news]");
    if (!card) return;
    openMarketNewsPopup(card);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const card = event.target.closest(".company-news-card[data-market-news]");
    if (!card) return;

    event.preventDefault();
    openMarketNewsPopup(card);
  });
}
