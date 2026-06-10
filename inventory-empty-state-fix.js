// Fixes inventory empty states after item use.
// Rows with quantityPurchased = 0 should not appear as usable items.
// The dropdown and My Items list now show clear empty states when there are no owned usable items.

function getOwnedInventoryRows() {
  return (state.inventory || []).filter((item) => {
    const quantity = Number(item.quantityPurchased || 0);
    const hasName = String(item.itemName || item.itemId || '').trim() !== '';
    return hasName && quantity > 0;
  });
}

function renderInventoryEmptyState(message) {
  return `<div class="empty">${sanitize(message)}</div>`;
}

renderProfile = function patchedRenderProfile() {
  const s = selectedStudent();
  const transactions = state.transactions || [];
  const purchases = transactions.filter((t) => t.mode === 'STORE_PURCHASE');
  const totalSpent = sum(purchases, 'amount');
  const ownedItems = getOwnedInventoryRows();
  const inventoryCount = sum(ownedItems, 'quantityPurchased');

  document.getElementById('profile').innerHTML = `
    <div class="grid cols-4">
      ${metric('Balance', money(s.balance), 'Available to spend or invest', 'Your current classroom economy balance.')}
      ${metric('Inventory', inventoryCount, 'Items available to use', 'Only items with quantity above 0 are counted here.')}
      ${metric('Shop Spent', money(totalSpent), 'Total recent purchases', 'Money you have spent in the shop.')}
      ${metric('Investments', (state.portfolio || []).length, 'Current positions', 'Stocks you currently own.')}
    </div>

    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <h2 class="card-title">My Account ${tip('This information comes from your student account.')}</h2>
        <div class="mini-list">
          ${mini('Name', s.name)}
          ${mini('Grade', s.grade || '—')}
          ${mini('Homeroom', s.homeroom || '—')}
          ${mini('Job', s.jobTitle || 'No job assigned')}
          ${mini('Account', s.active || 'Active')}
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">Recent Activity ${tip('Newest purchases, trades, rewards, item-use requests, and account changes show here. Dates are shown in Korea time when possible.')}</h2>
        ${table(transactions.slice(0, 10), ['timestamp', 'mode', 'amount', 'endingBalance', 'itemName', 'status'], 'No activity yet. Once you buy, trade, use an item, or submit a prediction, it will appear here.')}
      </div>
    </div>

    ${renderUseItemCard()}

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">My Items ${tip('Items you bought from the shop appear here while you still have quantity remaining.')}</h2>
      ${ownedItems.length
        ? table(ownedItems, ['itemName', 'category', 'quantityPurchased', 'totalSpent', 'lastPurchased'], 'No usable items available.')
        : renderInventoryEmptyState('No items available right now. Visit the Shop to buy an item, or refresh after a purchase.')}
    </div>`;
};

renderUseItemCard = function patchedRenderUseItemCard() {
  const usableItems = getOwnedInventoryRows();

  if (!usableItems.length) {
    return `
      <div class="card" style="margin-top:16px;">
        <div class="card-title-row">
          <h2 class="card-title">Use an Item ${tip('Once you own an item with quantity remaining, you can request to use it here.')}</h2>
          <span class="badge warn">Empty</span>
        </div>

        <div class="form-grid" id="useItemForm">
          <label>
            <span class="field-label">Item ${tip('No usable items are currently available in your inventory.')}</span>
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

        <div id="useItemStatus" class="status-box">No usable items are available right now.</div>
      </div>`;
  }

  return `
    <div class="card" style="margin-top:16px;">
      <div class="card-title-row">
        <h2 class="card-title">Use an Item ${tip('Choose an item you own and submit a use request. Your teacher will be notified in Google Chat.')}</h2>
        <span class="badge ${can('USE_ITEM') ? 'good' : 'bad'}">${can('USE_ITEM') ? 'Ready' : 'Unavailable'}</span>
      </div>

      <div class="form-grid" id="useItemForm">
        <label>
          <span class="field-label">Item ${tip('Choose the item from your inventory that you want to use.')}</span>
          <select id="useItemSelect">
            ${usableItems.map((item, index) => `<option value="${index}">${sanitize(item.itemName || item.itemId || 'Item')} · Owned ${sanitize(item.quantityPurchased || '0')}</option>`).join('')}
          </select>
        </label>

        <label>
          <span class="field-label">Quantity ${tip('Choose how many of this item you want to use.')}</span>
          <input id="useItemQty" type="number" min="1" value="1" />
        </label>

        <label class="span-2">
          <span class="field-label">Note for teacher ${tip('Optional. Add context so your teacher knows why you are using the item.')}</span>
          <textarea id="useItemNote" rows="3" maxlength="240" placeholder="Example: I want to use this during the next activity."></textarea>
        </label>

        <button id="useItemSubmitButton" class="primary-btn span-2" type="button" ${can('USE_ITEM') ? '' : 'disabled'} onclick="useItem(this)">Request Item Use</button>
      </div>

      <div id="useItemStatus" class="status-box">Your teacher will receive a notification after you submit.</div>
    </div>`;
};
