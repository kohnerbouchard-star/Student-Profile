(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const store = app.modules.store = app.modules.store || {};

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
  function formatStorePrice(value) {
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

  function can(action) {
    return typeof global.can === "function" ? global.can(action) : false;
  }

  function help(text) {
    return typeof global.help === "function"
      ? global.help(text)
      : `<p class="help-text">${sanitize(text || "")}</p>`;
  }

  function renderEmptyState(message) {
    if (app.modules.emptyState && typeof app.modules.emptyState.renderEmptyState === "function") {
      return app.modules.emptyState.renderEmptyState(message);
    }

    return `<div class="empty">${sanitize(message)}</div>`;
  }

  function table(rows, columns, emptyMessage) {
    if (typeof global.table === "function") {
      return global.table(rows, columns, emptyMessage);
    }

    if (!rows || !rows.length) {
      return renderEmptyState(emptyMessage);
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

  function getStoreItems(state) {
    return typeof store.getStoreItems === "function" ? store.getStoreItems(state) : [];
  }

  function getPurchaseRows(state) {
    return typeof store.getStorePurchaseRows === "function" ? store.getStorePurchaseRows(state, 12) : [];
  }

  // display-only
  function renderStoreItemCard(item) {
    const statusClass = typeof store.getStoreItemStatusClass === "function"
      ? store.getStoreItemStatusClass(item)
      : "available";
    const stock = item.inventory === "" ? "Unknown" : item.inventory;

    return `
      <article class="store-item-card ${statusClass}">
        <div class="card-title-row">
          <h3>${sanitize(item.itemName || item.itemId || "Store item")}</h3>
          <span class="badge">${sanitize(item.category || "Item")}</span>
        </div>
        <p>${sanitize(item.description || "No description available.")}</p>
        <div class="mini-list">
          <div class="mini-row"><span>Price</span><strong>${sanitize(formatStorePrice(item.price))}</strong></div>
          <div class="mini-row"><span>Stock</span><strong>${sanitize(stock)}</strong></div>
        </div>
      </article>
    `;
  }

  // display-only
  function renderStoreItemList(items) {
    const rows = Array.isArray(items) ? items : [];

    if (!rows.length) {
      return renderEmptyState("The shop is empty right now. Check again later.");
    }

    return `
      <div class="store-item-list">
        ${rows.map(renderStoreItemCard).join("")}
      </div>
    `;
  }

  // display-only
  function renderStorePanel(options) {
    const config = options || {};
    const state = config.state || global.state || {};
    const items = typeof store.sortStoreItems === "function"
      ? store.sortStoreItems(
        typeof store.filterStoreItems === "function"
          ? store.filterStoreItems(getStoreItems(state), config.filters)
          : getStoreItems(state),
        config.sortKey
      )
      : getStoreItems(state);
    const purchases = getPurchaseRows(state);
    const ready = can("STORE_PURCHASE");

    return `
      <div class="grid cols-2">
        <div class="card">
          <div class="card-title-row">
            <h2 class="card-title">Buy an Item</h2>
            <span class="badge ${ready ? "good" : "bad"}">${ready ? "Ready" : "Unavailable"}</span>
          </div>
          ${help("Choose an item and quantity. Your balance and item stock are checked by the backend before the purchase is saved.")}

          <div class="form-grid" id="storeForm">
            <label>
              <span class="field-label">Item</span>
              <select id="storeItem">
                ${items.map(function (item) {
                  const stock = item.inventory === "" ? "Unknown" : item.inventory;
                  return `<option value="${sanitize(item.itemId)}">${sanitize(item.itemName)} - ${sanitize(formatStorePrice(item.price))} - Stock ${sanitize(stock)}</option>`;
                }).join("")}
              </select>
            </label>

            <label>
              <span class="field-label">Quantity</span>
              <input id="storeQty" type="number" min="1" value="1" />
            </label>

            <button id="storeSubmitButton" class="primary-btn span-2" type="button" ${ready ? "" : "disabled"} onclick="purchaseItem(this)">Buy Item</button>
          </div>

          <div id="storeStatus" class="status-box">Purchases are confirmed by the backend after submission.</div>
        </div>

        <div class="card">
          <div class="card-title-row">
            <h2 class="card-title">Shop Items</h2>
            <span class="badge">${items.length} available</span>
          </div>
          ${help("The item list shows price, category, and current stock when available.")}
          ${table(items, ["itemName", "price", "inventory", "category", "description"], "The shop is empty right now. Check again later.")}
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2 class="card-title">Purchase History</h2>
        ${help("Your recent shop purchases appear here after they are confirmed.")}
        ${table(purchases, ["timestamp", "itemName", "amount", "endingBalance", "status"], "No purchases yet.")}
      </div>
    `;
  }

  store.viewStatus = "extracted";
  store.formatStorePrice = formatStorePrice;
  store.renderStorePanel = renderStorePanel;
  store.renderStoreItemCard = renderStoreItemCard;
  store.renderStoreItemList = renderStoreItemList;

  app.modules.storeView = {
    status: "extracted",
    formatStorePrice,
    renderStorePanel,
    renderStoreItemCard,
    renderStoreItemList
  };
})(window);
