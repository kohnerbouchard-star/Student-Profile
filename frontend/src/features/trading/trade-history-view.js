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

  // display-only
  function renderTradeHistoryTable(rows, options) {
    const config = options || {};
    const columns = config.columns || ["timestamp", "mode", "itemId", "itemName", "amount", "endingBalance", "status"];

    return table(
      rows || [],
      columns,
      config.emptyMessage || "No stock trades yet. Press Refresh if you just completed a trade."
    );
  }

  // display-only
  function renderTradeHistoryPanel(rows, options) {
    const config = options || {};

    return `
      <div class="card">
        <h2 class="card-title">${sanitize(config.title || "Recent Trades")}</h2>
        ${config.helpHtml || ""}
        ${renderTradeHistoryTable(rows, config)}
      </div>
    `;
  }

  trading.renderTradeHistoryTable = renderTradeHistoryTable;
  trading.renderTradeHistoryPanel = renderTradeHistoryPanel;

  app.modules.tradeHistoryView = {
    status: "extracted",
    renderTradeHistoryTable,
    renderTradeHistoryPanel
  };
})(window);
