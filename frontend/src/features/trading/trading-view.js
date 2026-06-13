(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const trading = app.modules.trading = app.modules.trading || {};

  function sanitize(value) {
    if (app.modules.sanitize && typeof app.modules.sanitize.sanitizeHtml === "function") {
      return app.modules.sanitize.sanitizeHtml(value);
    }

    if (typeof global.sanitize === "function") {
      return global.sanitize(value);
    }

    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  // display-only
  function money(value) {
    if (typeof global.money === "function") {
      return global.money(value);
    }

    return Number(value || 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD"
    });
  }

  function help(text) {
    if (typeof global.help === "function") {
      return global.help(text);
    }

    return text ? `<p class="help-text">${sanitize(text)}</p>` : "";
  }

  function tip(text) {
    if (typeof global.tip === "function") {
      return global.tip(text);
    }

    return text ? `<span class="tip" title="${sanitize(text)}">?</span>` : "";
  }

  function can(action) {
    if (typeof global.can === "function") {
      return global.can(action);
    }

    return false;
  }

  function table(rows, columns, emptyMessage) {
    if (typeof global.table === "function") {
      return global.table(rows, columns, emptyMessage);
    }

    if (!rows || !rows.length) {
      return `<div class="empty">${sanitize(emptyMessage)}</div>`;
    }

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${columns.map(function (column) {
              return `<th>${sanitize(column)}</th>`;
            }).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map(function (row) {
              return `
                <tr>
                  ${columns.map(function (column) {
                    const value = row && row[column] !== undefined && row[column] !== null ? row[column] : "";
                    return `<td>${sanitize(value)}</td>`;
                  }).join("")}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function getMarketRows(sourceState) {
    return typeof trading.getMarketRows === "function"
      ? trading.getMarketRows(sourceState)
      : [];
  }

  function getStockTradeRows(sourceState) {
    return typeof trading.getStockTradeRows === "function"
      ? trading.getStockTradeRows(sourceState, 10)
      : [];
  }

  function getState(options) {
    return options && options.state || global.state || {};
  }

  // display-only
  function renderMarketTicker(marketRows) {
    return `
      <div class="market-ticker">
        ${(marketRows || []).slice(0, 24).map(function (stock) {
          return `<div class="ticker-pill"><strong>${sanitize(stock.ticker)}</strong> ${sanitize(money(stock.currentPrice))} <span>${sanitize(stock.trend || "")}</span></div>`;
        }).join("")}
      </div>
    `;
  }

  // display-only
  function renderTradeForm(marketRows) {
    const ready = can("STOCK_TRADE");

    return `
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Place a Trade ${tip("Buy or sell shares during the trading window.")}</h2>
          <span class="badge ${ready ? "good" : "bad"}">${ready ? "Ready" : "Unavailable"}</span>
        </div>
        ${help("BUY spends your balance. SELL gives money back if you own enough shares.")}

        <div class="form-grid" id="tradeForm">
          <label>
            <span class="field-label">Action ${tip("BUY purchases shares. SELL sells shares you already own.")}</span>
            <select id="tradeAction"><option>BUY</option><option>SELL</option></select>
          </label>

          <label>
            <span class="field-label">Stock ${tip("Choose the ticker you want to trade.")}</span>
            <select id="tradeTicker">
              ${(marketRows || []).map(function (stock) {
                return `<option value="${sanitize(stock.ticker)}">${sanitize(stock.ticker)} - ${sanitize(stock.companyName || stock.ticker)} - ${sanitize(money(stock.currentPrice))}</option>`;
              }).join("")}
            </select>
          </label>

          <label class="span-2">
            <span class="field-label">Shares ${tip("Enter a whole number of shares.")}</span>
            <input id="tradeShares" type="number" min="1" value="1" />
          </label>

          <button id="tradeSubmitButton" class="primary-btn span-2" type="button" ${ready ? "" : "disabled"} onclick="submitTrade(this)">Submit Trade</button>
        </div>

        <div id="tradeStatus" class="status-box">Trades are checked against your balance and current holdings.</div>
      </div>
    `;
  }

  // display-only
  function renderMarketBoard(marketRows) {
    return `
      <div class="card" style="margin-top:16px;">
        <h2 class="card-title">Market Board ${tip("Use this table to compare current prices before trading.")}</h2>
        ${table(
          (marketRows || []).slice(0, 40),
          ["ticker", "companyName", "sector", "currentPrice", "changePct", "trend", "assetType"],
          "No market data is available right now."
        )}
      </div>
    `;
  }

  // display-only
  function renderTradingPage(options) {
    const state = getState(options);
    const marketRows = getMarketRows(state);
    const stockTradeRows = getStockTradeRows(state);
    const historyPanel = typeof trading.renderTradeHistoryPanel === "function"
      ? trading.renderTradeHistoryPanel(stockTradeRows, {
        title: `Recent Trades ${tip("Your confirmed stock trades appear here. If this is empty, press Refresh after trading.")}`
      })
      : "";

    return `
      ${renderMarketTicker(marketRows)}

      <div class="grid cols-2" style="margin-top:16px;">
        ${renderTradeForm(marketRows)}
        ${historyPanel}
      </div>

      ${renderMarketBoard(marketRows)}
    `;
  }

  trading.renderMarketTicker = renderMarketTicker;
  trading.renderTradeForm = renderTradeForm;
  trading.renderMarketBoard = renderMarketBoard;
  trading.renderTradingPage = renderTradingPage;

  app.modules.tradingView = {
    status: "extracted",
    renderMarketTicker,
    renderTradeForm,
    renderMarketBoard,
    renderTradingPage
  };
})(window);
