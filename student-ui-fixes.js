// Student-facing display fixes loaded after app.js.
// Keeps pending prediction results clean, prevents NaN, restores tooltips, and adds item-use requests.

function isBlankDisplayValue(value) {
  return value === undefined || value === null || value === '' || String(value).trim() === '';
}

function isFiniteDisplayNumber(value) {
  if (isBlankDisplayValue(value)) return false;
  const cleaned = String(value).replace(/[$,%]/g, '').trim();
  return Number.isFinite(Number(cleaned));
}

function money(value) {
  if (!isFiniteDisplayNumber(value)) return '—';

  const n = Number(String(value).replace(/[$,]/g, '').trim());

  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD'
  });
}

function normalizeRatingRow(row) {
  const rewardStatus = pick(row, ['rewardStatus', 'Reward_Status', 'Reward Status', 'Status', 'status']);
  const rewardAmountRaw = pick(row, ['rewardAmount', 'Reward_Amount', 'Reward Amount']);
  const targetPriceRaw = pick(row, ['targetPrice', 'Target_Price', 'Target Price']);
  const endOfDayRaw = pick(row, ['endOfDayPrice', 'End_Of_Day_Price', 'End Of Day Price']);

  return {
    timestamp: pick(row, ['timestamp', 'Timestamp', 'Date', 'date']),
    ticker: pick(row, ['ticker', 'Ticker']),
    rating: pick(row, ['rating', 'Rating', 'Prediction', 'prediction']),
    targetPrice: isFiniteDisplayNumber(targetPriceRaw) ? Number(targetPriceRaw) : '',
    reason: pick(row, ['reason', 'Reason']),
    rewardStatus: rewardStatus || 'Pending',
    rewardAmount: isFiniteDisplayNumber(rewardAmountRaw) ? Number(rewardAmountRaw) : '',
    endOfDayPrice: isFiniteDisplayNumber(endOfDayRaw) ? Number(endOfDayRaw) : '',
    accuracy: pick(row, ['accuracy', 'Accuracy_%', 'Accuracy %'])
  };
}

function tip(text) {
  return `<span class="tooltip" tabindex="0" data-tip="${sanitize(text)}">?</span>`;
}

// Keep a small visible hint for places where students need plain instructions.
function help(text) {
  return `<p class="help-text">${sanitize(text)}</p>`;
}

// Allow the student account to request item use from the frontend.
if (window.PERMISSION_SETS && PERMISSION_SETS.STUDENT && !PERMISSION_SETS.STUDENT.actions.includes('USE_ITEM')) {
  PERMISSION_SETS.STUDENT.actions.push('USE_ITEM');
}

function renderProfile() {
  const s = selectedStudent();
  const transactions = state.transactions || [];
  const purchases = transactions.filter((t) => t.mode === 'STORE_PURCHASE');
  const totalSpent = sum(purchases, 'amount');
  const inventoryCount = sum(state.inventory || [], 'quantityPurchased');

  document.getElementById('profile').innerHTML = `
    <div class="grid cols-4">
      ${metric('Balance', money(s.balance), 'Available to spend or invest', 'Your current classroom economy balance.')}
      ${metric('Inventory', inventoryCount, 'Items you have bought', 'Items recorded on your account.')}
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
      <h2 class="card-title">My Items ${tip('Items you bought from the shop appear here.')}</h2>
      ${table(state.inventory || [], ['itemName', 'category', 'quantityPurchased', 'totalSpent', 'lastPurchased'], 'No items yet. Visit the Shop to buy your first item.')}
    </div>`;
}

function renderUseItemCard() {
  const inventory = state.inventory || [];
  const usableItems = inventory.filter((item) => Number(item.quantityPurchased || 0) > 0 || item.itemName);

  if (!usableItems.length) {
    return `
      <div class="card" style="margin-top:16px;">
        <h2 class="card-title">Use an Item ${tip('Once you own an item, you can request to use it here.')}</h2>
        <div class="empty">You do not have any items available to use yet.</div>
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
            ${usableItems.map((item, index) => `<option value="${index}">${sanitize(item.itemName || 'Item')} · Owned ${sanitize(item.quantityPurchased || '—')}</option>`).join('')}
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
}

async function useItem(button) {
  const status = document.getElementById('useItemStatus');
  const form = document.getElementById('useItemForm');
  const submitButton = button || document.getElementById('useItemSubmitButton');

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission('USE_ITEM');

    const inventory = state.inventory || [];
    const selectedIndex = Number(document.getElementById('useItemSelect').value || 0);
    const selectedItem = inventory[selectedIndex];
    const quantity = Number(document.getElementById('useItemQty').value || 1);
    const note = document.getElementById('useItemNote').value.trim();

    if (!selectedItem) throw new Error('Choose an item first.');
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be a whole number above 0.');

    setButtonLoading(submitButton, true, 'Sending request...');
    setControlsDisabled(form, true, [submitButton]);
    showStatus(status, null, 'Sending your item-use request...');

    const result = await submitAction('USE_ITEM', {
      itemName: selectedItem.itemName,
      itemId: selectedItem.itemId || selectedItem.itemName,
      quantity,
      note
    });

    showStatus(status, true, result.message || 'Request sent. Your teacher has been notified.');

    const noteBox = document.getElementById('useItemNote');
    if (noteBox) noteBox.value = '';

    if (result.snapshot) {
      renderCurrentView();
      updateIdentity();
    }

  } catch (err) {
    showStatus(status, false, cleanErrorMessage(err.message));
  } finally {
    setControlsDisabled(form, false, [submitButton]);
    setButtonLoading(submitButton, false);
  }
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === '') {
    if (/rewardStatus|status/i.test(key)) {
      return '<span class="badge warn">Pending</span>';
    }

    return '—';
  }

  if (/rewardStatus/i.test(key)) {
    const text = String(value).trim() || 'Pending';
    const lower = text.toLowerCase();
    const cls = lower.includes('pending') || lower.includes('unchecked') || lower.includes('not checked')
      ? 'warn'
      : lower.includes('success') || lower.includes('paid') || lower.includes('reward') || lower.includes('complete')
        ? 'good'
        : lower.includes('denied') || lower.includes('failed')
          ? 'bad'
          : '';

    return `<span class="badge ${cls}">${sanitize(text)}</span>`;
  }

  if (/timestamp|date|updated|purchased/i.test(key)) {
    return sanitize(formatDateTime(value));
  }

  if (/changePct|accuracy/i.test(key)) {
    return sanitize(formatPercentLike(value));
  }

  if (/rewardAmount/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return '—';
    return sanitize(money(value));
  }

  if (/amount|balance|price|cost|spent|value|target/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return '—';
    return sanitize(money(value));
  }

  if (/gainLoss/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return '—';
    const cls = Number(value) >= 0 ? 'positive' : 'negative';
    return `<span class="${cls}">${sanitize(money(value))}</span>`;
  }

  if (/status|active/i.test(key)) {
    const text = String(value).trim() || 'Pending';
    const lower = text.toLowerCase();
    const cls = lower.includes('success') || lower.includes('active') || lower.includes('complete')
      ? 'good'
      : lower.includes('pending')
        ? 'warn'
        : lower.includes('denied') || lower.includes('failed')
          ? 'bad'
          : '';

    return `<span class="badge ${cls}">${sanitize(text)}</span>`;
  }

  return sanitize(value);
}
