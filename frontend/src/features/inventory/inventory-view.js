(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const inventory = app.modules.inventory = app.modules.inventory || {};

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

  function tip(text) {
    return typeof global.tip === "function"
      ? global.tip(text)
      : `<span class="tip" title="${sanitize(text || "")}">?</span>`;
  }

  function getInventoryItems(state) {
    return typeof inventory.getInventoryItems === "function" ? inventory.getInventoryItems(state) : [];
  }

  // display-only
  function formatInventoryQuantity(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString() : "0";
  }

  // display-only
  function renderInventoryEmptyState(message) {
    if (app.modules.emptyState && typeof app.modules.emptyState.renderEmptyState === "function") {
      return app.modules.emptyState.renderEmptyState(message || "No usable items available.");
    }

    return `<div class="empty">${sanitize(message || "No usable items available.")}</div>`;
  }

  // display-only
  function renderInventoryItemRow(item) {
    const source = item || {};

    return `
      <tr class="${typeof inventory.getInventoryItemStatusClass === "function" ? inventory.getInventoryItemStatusClass(source) : ""}">
        <td>${sanitize(source.itemName || source.itemId || "Item")}</td>
        <td>${sanitize(source.category || "")}</td>
        <td>${sanitize(formatInventoryQuantity(source.quantityPurchased))}</td>
        <td>${sanitize(source.totalSpent ?? "")}</td>
        <td>${sanitize(source.lastPurchased || "")}</td>
      </tr>
    `;
  }

  // Use-item-card-only renderer. The legacy Overview page already renders the full
  // My Items table after renderUseItemCard(), so this module must not render a
  // second inventory table.
  function renderInventoryPanel(options) {
    const config = options || {};
    const state = config.state || global.state || {};
    const sourceRows = getInventoryItems(state);
    const rows = typeof inventory.sortInventoryItems === "function"
      ? inventory.sortInventoryItems(
        typeof inventory.filterInventoryItems === "function"
          ? inventory.filterInventoryItems(sourceRows, config.filters)
          : sourceRows,
        config.sortKey
      )
      : sourceRows;
    const usableItems = typeof inventory.getUsableInventoryItems === "function"
      ? inventory.getUsableInventoryItems(state)
      : rows;
    const controls = typeof inventory.renderItemUseControls === "function"
      ? inventory.renderItemUseControls(state)
      : "";
    const permission = typeof inventory.classifyItemUsePermission === "function"
      ? inventory.classifyItemUsePermission()
      : { className: "bad", label: "Unavailable" };

    return `
      <div class="card" style="margin-top:16px;">
        <div class="card-title-row">
          <h2 class="card-title">Use an Item ${tip("Choose an item you own and submit a use request. Backend confirmation is required.")}</h2>
          <span class="badge ${usableItems.length ? permission.className : "warn"}">${usableItems.length ? permission.label : "Empty"}</span>
        </div>
        ${controls || renderInventoryEmptyState("No item-use controls are available right now.")}
      </div>
    `;
  }

  inventory.viewStatus = "extracted";
  inventory.renderInventoryPanel = renderInventoryPanel;
  inventory.renderInventoryItemRow = renderInventoryItemRow;
  inventory.renderInventoryEmptyState = renderInventoryEmptyState;
  inventory.formatInventoryQuantity = formatInventoryQuantity;

  app.modules.inventoryView = {
    status: "extracted",
    renderInventoryPanel,
    renderInventoryItemRow,
    renderInventoryEmptyState,
    formatInventoryQuantity
  };
})(window);
