(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const inventory = app.modules.inventory = app.modules.inventory || {};

  function getUsableInventoryItems(sourceState) {
    if (app.modules.inventorySelectors && typeof app.modules.inventorySelectors.getUsableInventoryItems === "function") {
      return app.modules.inventorySelectors.getUsableInventoryItems(sourceState);
    }

    if (typeof inventory.getInventoryItems !== "function") {
      return [];
    }

    return inventory.getInventoryItems(sourceState).filter(function (item) {
      const quantity = Number(item.quantityPurchased || 0);
      const hasName = String(item.itemName || item.itemId || "").trim() !== "";
      return hasName && quantity > 0;
    });
  }

  // validation-preview-only
  function getItemUsePreview(root, sourceState) {
    const documentRoot = root || global.document;
    const usableItems = getUsableInventoryItems(sourceState || global.state || {});
    const select = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("useItemSelect")
      : null;
    const quantityInput = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("useItemQty")
      : null;
    const noteInput = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("useItemNote")
      : null;
    const selectedIndex = Number(select && select.value || 0);
    const selectedItem = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < usableItems.length
      ? usableItems[selectedIndex]
      : null;
    const quantity = Number(quantityInput && quantityInput.value || 1);
    const ownedQuantity = Number(selectedItem && selectedItem.quantityPurchased || 0);

    return {
      selectedIndex,
      selectedItem,
      quantity,
      ownedQuantity,
      note: noteInput && noteInput.value || "",
      hasUsableItems: usableItems.length > 0,
      isQuantityPreviewValid: Number.isInteger(quantity) && quantity > 0 && (!selectedItem || quantity <= ownedQuantity)
    };
  }

  // validation-preview-only
  function classifyItemUsePermission(sourceSession) {
    if (typeof global.can === "function" && global.can("USE_ITEM")) {
      return {
        className: "good",
        label: "Ready",
        message: "Item use appears available in the UI. Backend confirmation is still required."
      };
    }

    const session = sourceSession || global.currentSession || null;
    if (session && session.role === "STUDENT") {
      return {
        className: "warn",
        label: "Preview",
        message: "Student session detected. Backend still decides whether USE_ITEM succeeds."
      };
    }

    return {
      className: "bad",
      label: "Unavailable",
      message: "Item use is not available in the current UI session."
    };
  }

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

  // display-only
  function renderItemUseStatus(message, className) {
    return `<div id="useItemStatus" class="status-box ${className || ""}">${sanitize(message || "Your teacher will receive a notification after you submit.")}</div>`;
  }

  // display-only
  function renderItemUseControls(sourceState) {
    const usableItems = getUsableInventoryItems(sourceState || global.state || {});
    const permission = classifyItemUsePermission();

    if (!usableItems.length) {
      return `
        <div class="form-grid" id="useItemForm">
          <label>
            <span class="field-label">Item ${tip("No usable items are currently available in your inventory.")}</span>
            <select id="useItemSelect" disabled>
              <option>No items available</option>
            </select>
          </label>

          <label>
            <span class="field-label">Quantity</span>
            <input id="useItemQty" type="number" min="1" value="1" disabled />
          </label>

          <label class="span-2">
            <span class="field-label">Note for teacher</span>
            <textarea id="useItemNote" rows="3" maxlength="240" placeholder="Buy an item first before requesting to use one." disabled></textarea>
          </label>

          <button id="useItemSubmitButton" class="primary-btn span-2" type="button" disabled>Request Item Use</button>
        </div>
        ${renderItemUseStatus("No usable items are available right now.")}
      `;
    }

    return `
      <div class="form-grid" id="useItemForm">
        <label>
          <span class="field-label">Item ${tip("Choose the item from your inventory that you want to use.")}</span>
          <select id="useItemSelect">
            ${usableItems.map(function (item, index) {
              return `<option value="${index}">${sanitize(item.itemName || item.itemId || "Item")} - Owned ${sanitize(item.quantityPurchased || "0")}</option>`;
            }).join("")}
          </select>
        </label>

        <label>
          <span class="field-label">Quantity ${tip("Choose how many of this item you want to use.")}</span>
          <input id="useItemQty" type="number" min="1" value="1" />
        </label>

        <label class="span-2">
          <span class="field-label">Note for teacher ${tip("Optional. Add context so your teacher knows why you are using the item.")}</span>
          <textarea id="useItemNote" rows="3" maxlength="240" placeholder="Example: I want to use this during the next activity."></textarea>
        </label>

        <button id="useItemSubmitButton" class="primary-btn span-2" type="button" ${permission.className === "bad" ? "disabled" : ""} onclick="useItem(this)">Request Item Use</button>
      </div>
      ${renderItemUseStatus(permission.message)}
    `;
  }

  inventory.itemUseStatus = "extracted";
  inventory.getUsableInventoryItems = getUsableInventoryItems;
  inventory.getItemUsePreview = getItemUsePreview;
  inventory.classifyItemUsePermission = classifyItemUsePermission;
  inventory.renderItemUseControls = renderItemUseControls;
  inventory.renderItemUseStatus = renderItemUseStatus;

  app.modules.itemUseService = {
    status: "extracted",
    description: "Item-use display and preview helpers. Backend USE_ITEM remains authoritative.",
    getUsableInventoryItems,
    getItemUsePreview,
    classifyItemUsePermission,
    renderItemUseControls,
    renderItemUseStatus
  };
})(window);
