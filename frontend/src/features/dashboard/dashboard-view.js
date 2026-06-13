(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const dashboard = app.modules.dashboard = app.modules.dashboard || {};

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

  function formatCurrency(value) {
    if (typeof global.money === "function") {
      return global.money(value);
    }

    if (app.modules.currency && typeof app.modules.currency.formatCurrency === "function") {
      return app.modules.currency.formatCurrency(value);
    }

    return Number(value || 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD"
    });
  }

  function help(text) {
    return typeof global.help === "function"
      ? global.help(text)
      : `<p class="help-text">${sanitize(text || "")}</p>`;
  }

  function formatValue(key, value) {
    if (typeof global.formatValue === "function") {
      return global.formatValue(key, value);
    }

    if (value === undefined || value === null || value === "") return "";

    if (/amount|balance|price|cost|spent|value|reward|target/i.test(key)) {
      return sanitize(formatCurrency(value));
    }

    if (/quantity|count|positions/i.test(key)) {
      const number = Number(value || 0);
      return sanitize(Number.isFinite(number) ? number.toLocaleString() : value);
    }

    if (/timestamp|date|updated|purchased/i.test(key)) {
      if (app.modules.dates && typeof app.modules.dates.formatDateTime === "function") {
        return sanitize(app.modules.dates.formatDateTime(value));
      }
    }

    return sanitize(value);
  }

  function labelize(value) {
    if (typeof global.labelize === "function") {
      return global.labelize(value);
    }

    const labels = {
      timestamp: "Time",
      mode: "Activity",
      amount: "Amount",
      endingBalance: "Balance After",
      itemName: "Item",
      status: "Status"
    };

    return sanitize(labels[value] || String(value).replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim());
  }

  function table(rows, columns, emptyMessage) {
    if (typeof global.table === "function") {
      return global.table(rows, columns, emptyMessage);
    }

    if (!rows || !rows.length) {
      return renderDashboardEmptyState(emptyMessage);
    }

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${columns.map(function (column) {
              return `<th>${labelize(column)}</th>`;
            }).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map(function (row) {
              return `
                <tr>
                  ${columns.map(function (column) {
                    return `<td>${formatValue(column, row && row[column])}</td>`;
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
  function renderDashboardEmptyState(message) {
    if (app.modules.emptyState && typeof app.modules.emptyState.renderEmptyState === "function") {
      return app.modules.emptyState.renderEmptyState(message || "Dashboard data is not available yet.");
    }

    return `<div class="empty">${sanitize(message || "Dashboard data is not available yet.")}</div>`;
  }

  // display-only
  function renderMetricCard(metric) {
    const source = metric || {};

    return `
      <div class="metric">
        <div class="label">${sanitize(source.label || "")}</div>
        <div class="value">${sanitize(source.value || "")}</div>
        <div class="note">${sanitize(source.note || "")}</div>
        ${source.helpText ? help(source.helpText) : ""}
      </div>
    `;
  }

  // display-only
  function renderDashboardSummaryCards(summary) {
    const source = summary || {};
    const metrics = [
      {
        label: "Balance",
        value: formatCurrency(source.balance),
        note: "Available to spend or invest",
        helpText: "Your current classroom economy balance from the latest snapshot."
      },
      {
        label: "Inventory",
        value: source.inventoryQuantity,
        note: "Items you have bought",
        helpText: "Display-only total from inventory rows in the latest snapshot."
      },
      {
        label: "Shop Spent",
        value: formatCurrency(source.storePurchaseAmount),
        note: "Total recent purchases",
        helpText: "Display-only total from confirmed purchase rows in the latest snapshot."
      },
      {
        label: "Investments",
        value: source.portfolioCount,
        note: "Current positions",
        helpText: "Number of portfolio rows in the latest snapshot."
      }
    ];

    return `
      <div class="grid cols-4 dashboard-summary-cards">
        ${metrics.map(renderMetricCard).join("")}
      </div>
    `;
  }

  // display-only
  function renderRecentActivity(rows) {
    return `
      <div class="card dashboard-recent-activity">
        <h2 class="card-title">Recent Activity</h2>
        ${help("Newest purchases, trades, rewards, and account changes show here. Dates are shown in Korea time when possible.")}
        ${table(rows || [], ["timestamp", "mode", "amount", "endingBalance", "itemName", "status"], "No activity yet. Once you buy, trade, or submit a prediction, it will appear here.")}
      </div>
    `;
  }

  // display-only
  function renderMarketSummary(marketSummary) {
    const source = marketSummary || {};
    const rows = [
      { label: "Market rows", value: source.marketCount || 0 },
      { label: "Portfolio positions", value: source.portfolioCount || 0 },
      { label: "Followed tickers", value: (source.holdingTickers || []).join(", ") || "None" }
    ];

    return `
      <div class="card dashboard-market-summary">
        <h2 class="card-title">Market Summary</h2>
        ${help("This is a display-only view of market and portfolio rows already present in the snapshot.")}
        <div class="mini-list">
          ${rows.map(function (row) {
            return `<div class="mini-row"><span>${sanitize(row.label)}</span><strong>${sanitize(row.value)}</strong></div>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  // display-only
  function renderDashboardPanel(options) {
    const config = options || {};
    const state = config.state || global.state || {};
    const summary = typeof dashboard.getDashboardSummary === "function"
      ? dashboard.getDashboardSummary(state)
      : {};
    const recentRows = typeof dashboard.getRecentTransactions === "function"
      ? dashboard.getRecentTransactions(state, 10)
      : [];
    const marketSummary = typeof dashboard.getDashboardMarketSummary === "function"
      ? dashboard.getDashboardMarketSummary(state)
      : {};

    if (!summary.profileAvailable && !recentRows.length) {
      return renderDashboardEmptyState("Dashboard data is not available yet. Login or refresh to load a snapshot.");
    }

    return `
      ${renderDashboardSummaryCards(summary)}
      <div class="grid cols-2" style="margin-top:16px;">
        ${renderRecentActivity(recentRows)}
        ${renderMarketSummary(marketSummary)}
      </div>
    `;
  }

  dashboard.viewStatus = "extracted";
  dashboard.renderDashboardPanel = renderDashboardPanel;
  dashboard.renderDashboardSummaryCards = renderDashboardSummaryCards;
  dashboard.renderRecentActivity = renderRecentActivity;
  dashboard.renderDashboardEmptyState = renderDashboardEmptyState;

  app.modules.dashboardView = {
    status: "extracted",
    renderDashboardPanel,
    renderDashboardSummaryCards,
    renderRecentActivity,
    renderDashboardEmptyState
  };
})(window);
