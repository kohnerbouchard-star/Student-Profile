window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.store = window.Econovaria.features.store || {};

function renderStore() {
  const s = selectedStudent();
  const items = state.store || [];
  const purchases = (state.transactions || [])
    .filter((t) => t.mode === "STORE_PURCHASE")
    .slice(0, 12);

  document.getElementById("store").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Purchase Item</h2>
          <span class="badge ${can("STORE_PURCHASE") ? "good" : "bad"}">${can("STORE_PURCHASE") ? "Ready" : "Unavailable"}</span>
        </div>
        ${help("Choose an item and quantity. Your balance and item stock are checked before the purchase is saved.")}

        <div class="form-grid" id="storeForm">
          <label>
            <span class="field-label">Item</span>
            <select id="storeItem">
              ${items.map((item) => `<option value="${sanitize(item.itemId)}">${sanitize(item.itemName)} · ${money(item.price)} · Stock ${sanitize(item.inventory === "" ? "—" : item.inventory)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span class="field-label">Quantity</span>
            <input id="storeQty" type="number" min="1" value="1" />
          </label>

          <button id="storeSubmitButton" class="primary-btn span-2" type="button" ${can("STORE_PURCHASE") ? "" : "disabled"} onclick="purchaseItem(this)">Purchase Item</button>
        </div>

        <div id="storeStatus" class="status-box">Purchases are submitted for ${sanitize(s.name)}.</div>
      </div>

      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Store Items</h2>
          <span class="badge">${items.length} available</span>
        </div>
        ${help("The item list shows price, category, and current stock when available.")}
        ${table(items, ["itemName", "price", "inventory", "category", "description"], "The store is empty right now. Check again later.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Purchase History</h2>
      ${help("Recent store purchases appear here after they are confirmed.")}
      ${table(purchases, ["timestamp", "itemName", "amount", "endingBalance", "status"], "No purchases yet.")}
    </div>`;
}

async function purchaseItem(button) {
  const status = document.getElementById("storeStatus");
  const form = document.getElementById("storeForm");
  const submitButton = button || document.getElementById("storeSubmitButton");

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission("STORE_PURCHASE");

    const itemId = document.getElementById("storeItem").value;
    const quantity = Number(document.getElementById("storeQty").value || 1);

    if (!itemId) throw new Error("Choose an item first.");
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error("Quantity must be at least 1.");

    setButtonLoading(submitButton, true, "Purchasing...");
    setControlsDisabled(form, true, [submitButton]);
    showStatus(status, null, "Checking your balance and item stock...");

    const result = await submitAction("STORE_PURCHASE", {
      itemId,
      quantity
    });

    showStatus(status, result.ok === true, result.message || "Purchase complete.");
    renderCurrentView();
    updateIdentity();

  } catch (err) {
    showStatus(status, false, cleanErrorMessage(err.message));
  } finally {
    setControlsDisabled(form, false, [submitButton]);
    setButtonLoading(submitButton, false);
  }
}

Object.assign(window.Econovaria.features.store, { renderStore, purchaseItem });
