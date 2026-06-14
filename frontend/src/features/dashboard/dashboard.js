window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.dashboard = window.Econovaria.features.dashboard || {};

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

function renderProfile() {
  const s = selectedStudent();
  const transactions = state.transactions || [];
  const purchases = transactions.filter((t) => t.mode === 'STORE_PURCHASE');
  const totalSpent = sum(purchases, 'amount');
  const ownedItems = getOwnedInventoryRows();
  const inventoryCount = sum(ownedItems, 'quantityPurchased');

  document.getElementById('profile').innerHTML = `
    <div class="grid cols-4">
      ${metric('Balance', money(s.balance), 'Available to spend or invest', 'Your current classroom economy balance.')}
      ${metric('Items', inventoryCount, 'Items available to use', 'Only items with quantity above 0 are counted here.')}
      ${metric('Store Spend', money(totalSpent), 'Total recent purchases', 'Money you have spent in the store.')}
      ${metric('Portfolio', (state.portfolio || []).length, 'Current positions', 'Market assets you currently hold.')}
    </div>

    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <h2 class="card-title">Account Summary ${tip('This information comes from your student account.')}</h2>
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
        ${table(transactions.slice(0, 10), ['timestamp', 'mode', 'amount', 'endingBalance', 'itemName', 'status'], 'No activity yet. Once you buy, trade, use an item, or submit a forecast, it will appear here.')}
      </div>
    </div>

    ${renderUseItemCard()}

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Items ${tip('Items purchased from the store appear here while you still have quantity remaining.')}</h2>
      ${ownedItems.length
        ? table(ownedItems, ['itemName', 'category', 'quantityPurchased', 'totalSpent', 'lastPurchased'], 'No usable items available.')
        : renderInventoryEmptyState('No items available right now. Visit the Store to buy an item, or refresh after a purchase.')}
    </div>`;
}

Object.assign(window.Econovaria.features.dashboard, { getOwnedInventoryRows, renderInventoryEmptyState, renderProfile });
