window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.inventory = window.Econovaria.features.inventory || {};

function getSelectedUseItem() {
  const select = document.getElementById('useItemSelect');
  const usableItems = typeof getOwnedInventoryRows === 'function'
    ? getOwnedInventoryRows()
    : (state.inventory || []).filter((item) => Number(item.quantityPurchased || 0) > 0);

  if (!select || !usableItems.length) return null;

  const selectedIndex = Number(select.value || 0);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= usableItems.length) return null;

  return usableItems[selectedIndex];
}

function renderUseItemCard() {
  const usableItems = typeof getOwnedInventoryRows === 'function'
    ? getOwnedInventoryRows()
    : (state.inventory || []).filter((item) => Number(item.quantityPurchased || 0) > 0);

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
}

async function useItem(button) {
  const status = document.getElementById('useItemStatus');
  const form = document.getElementById('useItemForm');
  const submitButton = button || document.getElementById('useItemSubmitButton');

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission('USE_ITEM');

    const selectedItem = getSelectedUseItem();
    const quantity = Number(document.getElementById('useItemQty').value || 1);
    const note = document.getElementById('useItemNote').value.trim();
    const owned = Number(selectedItem && (selectedItem.quantityPurchased ?? selectedItem.quantity ?? selectedItem.qty ?? selectedItem.count) || 0);

    if (!selectedItem) throw new Error('Choose an item first.');
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be a whole number above 0.');
    if (!Number.isFinite(owned) || quantity > owned) throw new Error(`You only have ${Number.isFinite(owned) ? owned : 0} of this item.`);

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

Object.assign(window.Econovaria.features.inventory, { getSelectedUseItem, renderUseItemCard, useItem });
