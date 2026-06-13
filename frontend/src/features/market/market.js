window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.market = window.Econovaria.features.market || {};

function findMarket(ticker) {
  return (state.market || []).find((m) => String(m.ticker) === String(ticker));
}

function renderStockProfile() {
  const rows = state.market || [];
  const defaultTicker = rows[0]?.ticker || "";

  document.getElementById("stockProfile").innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <label>
        <span class="field-label">Choose a Stock</span>
        ${help("Select a ticker to see a quick profile.")}
        <select id="stockProfileTicker" onchange="renderStockProfileDetail()">
          ${rows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div id="stockProfileDetail"></div>`;

  if (defaultTicker) {
    document.getElementById("stockProfileTicker").value = defaultTicker;
  }

  renderStockProfileDetail();
}

function renderStockProfileDetail() {
  const ticker = document.getElementById("stockProfileTicker")?.value;
  const m = findMarket(ticker) || (state.market || [])[0];

  if (!m) {
    document.getElementById("stockProfileDetail").innerHTML = `<div class="empty">No market data is available right now.</div>`;
    return;
  }

  document.getElementById("stockProfileDetail").innerHTML = `
    <div class="stock-hero">
      <div class="card">
        <div class="eyebrow">${sanitize(m.sector || "Market")} · ${sanitize(m.assetType || "Asset")}</div>
        <h2>${sanitize(m.companyName || m.ticker)} <span class="badge">${sanitize(m.ticker)}</span></h2>
        <div class="large-price">${money(m.currentPrice)}</div>
        <div>${sanitize(m.trend || "")}</div>
        <div class="mini-list" style="margin-top:14px;">
          ${mini("Sector", m.sector || "—")}
          ${mini("Change", formatPercentLike(m.changePct))}
          ${mini("Asset Type", m.assetType || "—")}
          ${mini("Last Updated", formatDateTime(m.lastUpdated))}
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">My Holding</h2>
        ${help("This shows whether you currently own this stock.")}
        <div class="mini-list">
          ${holdingSummary(m.ticker)}
        </div>
      </div>
    </div>`;
}

function holdingSummary(ticker) {
  const holding = (state.portfolio || []).find((p) => p.ticker === ticker);

  if (!holding) {
    return mini("Shares", "0") + mini("Status", "No current position");
  }

  return [
    mini("Shares", holding.sharesOwned),
    mini("Average Buy", money(holding.avgBuyPrice)),
    mini("Total Cost", money(holding.totalCost)),
    mini("Last Updated", formatDateTime(holding.lastUpdated))
  ].join("");
}

Object.assign(window.Econovaria.features.market, {
  findMarket,
  renderStockProfile,
  renderStockProfileDetail,
  holdingSummary
});
