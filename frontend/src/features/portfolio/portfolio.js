window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.portfolio = window.Econovaria.features.portfolio || {};

function renderPortfolio() {
  const rows = state.portfolio || [];
  const marketValue = rows.reduce((total, row) => {
    const market = findMarket(row.ticker);
    return total + Number(row.sharesOwned || 0) * Number(market?.currentPrice || row.avgBuyPrice || 0);
  }, 0);
  const totalCost = sum(rows, "totalCost");
  const gainLoss = marketValue - totalCost;

  const displayRows = rows.map((row) => {
    const market = findMarket(row.ticker);
    const currentPrice = Number(market?.currentPrice || row.avgBuyPrice || 0);
    const positionValue = Number(row.sharesOwned || 0) * currentPrice;
    return {
      ticker: row.ticker,
      sharesOwned: row.sharesOwned,
      avgBuyPrice: row.avgBuyPrice,
      currentPrice,
      marketValue: positionValue,
      gainLoss: positionValue - Number(row.totalCost || 0),
      lastUpdated: row.lastUpdated || ""
    };
  });

  document.getElementById("portfolio").innerHTML = `
    <div class="grid cols-3">
      ${metric("Holdings", rows.length, "Active positions", "How many different stocks you currently own.")}
      ${metric("Market Value", money(marketValue), "Current portfolio", "Estimated value of your current shares.")}
      ${metric("Gain / Loss", money(gainLoss), gainLoss >= 0 ? "Currently positive" : "Currently negative", "Difference between your cost and current value.")}
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">My Positions</h2>
      ${help("This table shows stocks you currently own. Gain / loss updates when prices refresh.")}
      ${table(displayRows, ["ticker", "sharesOwned", "avgBuyPrice", "currentPrice", "marketValue", "gainLoss", "lastUpdated"], "No investments yet. Use the Trade Desk to buy your first shares.")}
    </div>`;
}

Object.assign(window.Econovaria.features.portfolio, { renderPortfolio });
