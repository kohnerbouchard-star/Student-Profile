window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.trading = window.Econovaria.features.trading || {};

function renderTrade() {
  const marketRows = state.market || [];
  const stockTx = (state.transactions || [])
    .filter((t) => String(t.mode || "").startsWith("STOCK"))
    .slice(0, 10);

  document.getElementById("trade").innerHTML = `
    <div class="market-ticker">
      ${marketRows.slice(0, 24).map((m) => `<div class="ticker-pill"><strong>${sanitize(m.ticker)}</strong> ${money(m.currentPrice)} <span>${sanitize(m.trend || "")}</span></div>`).join("")}
    </div>

    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Place a Trade</h2>
          <span class="badge ${can("STOCK_TRADE") ? "good" : "bad"}">${can("STOCK_TRADE") ? "Ready" : "Unavailable"}</span>
        </div>
        ${help("BUY spends your balance. SELL gives money back if you own enough shares.")}

        <div class="form-grid" id="tradeForm">
          <label>
            <span class="field-label">Action</span>
            <select id="tradeAction"><option>BUY</option><option>SELL</option></select>
          </label>

          <label>
            <span class="field-label">Stock</span>
            <select id="tradeTicker">
              ${marketRows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)} · ${money(m.currentPrice)}</option>`).join("")}
            </select>
          </label>

          <label class="span-2">
            <span class="field-label">Shares</span>
            <input id="tradeShares" type="number" min="1" value="1" />
          </label>

          <button id="tradeSubmitButton" class="primary-btn span-2" type="button" ${can("STOCK_TRADE") ? "" : "disabled"} onclick="submitTrade(this)">Submit Trade</button>
        </div>

        <div id="tradeStatus" class="status-box">Trades are checked against your balance and current holdings.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Recent Trades</h2>
        ${help("Your newest stock activity appears here after each confirmed trade.")}
        ${table(stockTx, ["timestamp", "mode", "itemId", "itemName", "amount", "endingBalance", "status"], "No stock trades yet.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Market Board</h2>
      ${help("Use this table to compare current prices before trading.")}
      ${table(marketRows.slice(0, 40), ["ticker", "companyName", "sector", "currentPrice", "changePct", "trend", "assetType"], "No market data is available right now.")}
    </div>`;
}

async function submitTrade(button) {
  const status = document.getElementById("tradeStatus");
  const form = document.getElementById("tradeForm");
  const submitButton = button || document.getElementById("tradeSubmitButton");

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission("STOCK_TRADE");

    const action = document.getElementById("tradeAction").value;
    const ticker = document.getElementById("tradeTicker").value;
    const shares = Number(document.getElementById("tradeShares").value || 0);

    if (!ticker) throw new Error("Choose a stock first.");
    if (!Number.isInteger(shares) || shares < 1) throw new Error("Shares must be a whole number above 0.");

    setButtonLoading(submitButton, true, "Submitting...");
    setControlsDisabled(form, true, [submitButton]);
    showStatus(status, null, "Checking market price and your account...");

    const result = await submitAction("STOCK_TRADE", {
      action,
      ticker,
      shares
    });

    showStatus(status, result.ok === true, result.message || "Trade submitted.");
    renderCurrentView();
    updateIdentity();

  } catch (err) {
    showStatus(status, false, cleanErrorMessage(err.message));
  } finally {
    setControlsDisabled(form, false, [submitButton]);
    setButtonLoading(submitButton, false);
  }
}

Object.assign(window.Econovaria.features.trading, { renderTrade, submitTrade });
