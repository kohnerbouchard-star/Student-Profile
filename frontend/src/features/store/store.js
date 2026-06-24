window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.store = window.Econovaria.features.store || {};

let playerStoreDataLoadPromise = null;
let playerStoreItemsLoaded = false;
let playerStoreHistoryLoaded = false;

function renderStore() {
  const s = selectedStudent();
  const isSupabasePlayer = isSupabasePlayerSession();
  const isLoadingStore = Boolean(playerStoreDataLoadPromise);
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
            <select id="storeItem" ${items.length ? "" : "disabled"}>
              ${items.map((item) => `<option value="${sanitize(item.itemId)}">${sanitize(item.itemName)} · ${sanitize(formatCurrencyAmount(item.price, item.currencyCode))} · Stock ${sanitize(item.inventory === "" ? "—" : item.inventory)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span class="field-label">Quantity</span>
            <input id="storeQty" type="number" min="1" value="1" ${items.length ? "" : "disabled"} />
          </label>

          <button id="storeSubmitButton" class="primary-btn span-2" type="button" ${(can("STORE_PURCHASE") && items.length) ? "" : "disabled"} onclick="window.Econovaria.features.store.purchaseItem(this)">Purchase Item</button>
        </div>

        <div id="storeStatus" class="status-box">${sanitize(readStoreStatusCopy(s, isSupabasePlayer, isLoadingStore, items))}</div>
      </div>

      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Store Items</h2>
          <span class="badge">${items.length} available</span>
        </div>
        ${help("The item list shows price, category, and current stock when available.")}
        ${table(items, ["itemName", "priceDisplay", "inventory", "category", "description"], isLoadingStore ? "Loading store items..." : "The store is empty right now. Check again later.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Purchase History</h2>
      ${help("Recent store purchases appear here after they are confirmed.")}
      ${table(purchases, ["timestamp", "itemName", "amountDisplay", "endingBalance", "status"], isLoadingStore ? "Loading recent purchases..." : "No purchases yet.")}
    </div>`;

  if (isSupabasePlayer) {
    queuePlayerStoreDataLoad();
  }
}

async function purchaseItem(button) {
  const status = document.getElementById("storeStatus");
  const form = document.getElementById("storeForm");
  const submitButton = button || document.getElementById("storeSubmitButton");

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission("STORE_PURCHASE");

    const sessionToken = currentSession?.token;
    const itemId = document.getElementById("storeItem").value;
    const quantity = Number(document.getElementById("storeQty").value || 1);

    if (!isSupabasePlayerSession() || !sessionToken) throw new Error("Sign in again before purchasing.");
    if (!itemId) throw new Error("Choose an item first.");
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be at least 1.");

    setButtonLoading(submitButton, true, "Purchasing...");
    setControlsDisabled(form, true, [submitButton]);
    showStatus(status, null, "Getting live price...");

    const quote = await callPlayerStoreQuoteApi(sessionToken, {
      itemId,
      quantity,
    });

    if (!quote?.ok || !quote.quoteId) {
      throw new Error(quote?.message || quote?.error?.message || "Store quote could not be created.");
    }

    showStatus(
      status,
      null,
      `Live price locked at ${formatCurrencyAmount(quote.finalTotalPrice, quote.currencyCode)}. Completing purchase...`,
    );

    const result = await callPlayerStorePurchaseApi(sessionToken, {
      quoteId: quote.quoteId,
      idempotencyKey: createStoreIdempotencyKey(),
      clientSubmittedAt: new Date().toISOString(),
    });

    if (!result?.ok) {
      throw new Error(result?.message || result?.error?.message || "Store purchase could not be completed.");
    }

    showStatus(status, true, result.message || "Purchase complete.");
    showGlobalStatus("ok", result.message || "Purchase complete.");

    await refreshPlayerProfileAfterStorePurchase(sessionToken);
    await loadPlayerStoreData({ force: true });
    updateIdentity();
    renderCurrentView();
  } catch (err) {
    showStatus(status, false, cleanErrorMessage(err.message));
  } finally {
    setControlsDisabled(form, false, [submitButton]);
    setButtonLoading(submitButton, false);
  }
}

function queuePlayerStoreDataLoad() {
  if (!isSupabasePlayerSession()) return;
  if (playerStoreDataLoadPromise) return;
  if (playerStoreItemsLoaded && playerStoreHistoryLoaded) return;

  playerStoreDataLoadPromise = loadPlayerStoreData()
    .catch((err) => {
      showGlobalStatus("bad", cleanErrorMessage(err.message || String(err)));
    })
    .finally(() => {
      playerStoreDataLoadPromise = null;
    });
}

async function loadPlayerStoreData(options = {}) {
  const sessionToken = currentSession?.token;

  if (!isSupabasePlayerSession() || !sessionToken) return;

  if (options.force) {
    playerStoreItemsLoaded = false;
    playerStoreHistoryLoaded = false;
  }

  const [itemsResult, historyResult] = await Promise.all([
    playerStoreItemsLoaded ? Promise.resolve({ ok: true, items: state.store || [] }) : callPlayerStoreItemsApi(sessionToken),
    playerStoreHistoryLoaded ? Promise.resolve({ ok: true, purchases: readStorePurchaseHistoryFromState() }) : callPlayerStorePurchaseHistoryApi(sessionToken),
  ]);

  if (itemsResult?.ok) {
    state.store = normalizePlayerStoreItems(itemsResult.items || []);
    playerStoreItemsLoaded = true;
  } else {
    throw new Error(itemsResult?.message || itemsResult?.error?.message || "Store items could not be loaded.");
  }

  if (historyResult?.ok) {
    const nonStoreTransactions = (state.transactions || [])
      .filter((transaction) => transaction.mode !== "STORE_PURCHASE");
    state.transactions = [
      ...normalizePlayerStorePurchaseHistory(historyResult.purchases || []),
      ...nonStoreTransactions,
    ];
    playerStoreHistoryLoaded = true;
  } else {
    throw new Error(historyResult?.message || historyResult?.error?.message || "Store purchase history could not be loaded.");
  }

  if (currentView() === "store") {
    renderStore();
  }
}

async function refreshPlayerProfileAfterStorePurchase(sessionToken) {
  const bootstrap = await callPlayerBootstrapApi(sessionToken);

  if (!bootstrap?.ok) {
    throw new Error(bootstrap?.message || bootstrap?.error?.message || "Purchase completed, but the dashboard could not refresh your balance.");
  }

  state.profile = createPlayerProfileFromBootstrap(bootstrap);

  if (Array.isArray(bootstrap.availableActions)) {
    currentSession.permissions = bootstrap.availableActions;
  }
}

function callPlayerStoreItemsApi(sessionToken) {
  const { publishableKey } = getSupabaseConfig();

  return callSupabaseJsonRoute("/players/me/store/items", {
    method: "GET",
    token: publishableKey,
    playerSessionToken: sessionToken,
    fallbackCode: "player_store_items_failed",
    fallbackMessage: "Store items could not be loaded.",
  });
}

function callPlayerStoreQuoteApi(sessionToken, input) {
  const { publishableKey } = getSupabaseConfig();

  return callSupabaseJsonRoute("/players/me/store/quote", {
    method: "POST",
    token: publishableKey,
    playerSessionToken: sessionToken,
    body: {
      itemId: input.itemId,
      quantity: input.quantity,
    },
    fallbackCode: "player_store_quote_failed",
    fallbackMessage: "Store quote could not be created.",
  });
}

function callPlayerStorePurchaseApi(sessionToken, input) {
  const { publishableKey } = getSupabaseConfig();

  return callSupabaseJsonRoute("/players/me/store/purchases", {
    method: "POST",
    token: publishableKey,
    playerSessionToken: sessionToken,
    body: {
      quoteId: input.quoteId,
      idempotencyKey: input.idempotencyKey,
      clientSubmittedAt: input.clientSubmittedAt,
    },
    fallbackCode: "player_store_purchase_failed",
    fallbackMessage: "Store purchase could not be completed.",
  });
}

function callPlayerStorePurchaseHistoryApi(sessionToken) {
  const { publishableKey } = getSupabaseConfig();

  return callSupabaseJsonRoute("/players/me/store/purchases", {
    method: "GET",
    token: publishableKey,
    playerSessionToken: sessionToken,
    fallbackCode: "player_store_purchase_history_failed",
    fallbackMessage: "Store purchase history could not be loaded.",
  });
}

function normalizePlayerStoreItems(items) {
  return (items || []).map((item) => ({
    itemId: item.itemId || item.id,
    itemName: item.itemName || item.name || "Store item",
    price: Number(item.price || 0),
    priceDisplay: renderCurrencyAmount(Number(item.price || 0), item.currencyCode || "ECO"),
    inventory: item.inventory ?? item.stockQuantity ?? "",
    category: item.category || "General",
    description: item.description || "",
    currencyCode: item.currencyCode || "ECO",
  })).filter((item) => item.itemId);
}

function normalizePlayerStorePurchaseHistory(purchases) {
  return (purchases || []).map((purchase) => ({
    mode: "STORE_PURCHASE",
    timestamp: purchase.createdAt || "",
    itemName: purchase.itemName || "Store item",
    amount: Number(purchase.finalTotalPrice || 0),
    amountDisplay: renderCurrencyAmount(Number(purchase.finalTotalPrice || 0), purchase.currencyCode || "ECO"),
    endingBalance: "",
    status: purchase.status || "COMPLETED",
  }));
}

function readStorePurchaseHistoryFromState() {
  return (state.transactions || [])
    .filter((transaction) => transaction.mode === "STORE_PURCHASE")
    .map((transaction) => ({
      createdAt: transaction.timestamp,
      itemName: transaction.itemName,
      finalTotalPrice: transaction.amount,
      status: transaction.status,
    }));
}

function readStoreStatusCopy(student, isSupabasePlayer, isLoadingStore, items) {
  if (!isSupabasePlayer) return `Purchases are submitted for ${student?.name || "this account"}.`;
  if (isLoadingStore) return "Loading live store data...";
  if (!items.length) return "No visible store items are available yet.";
  return `Purchases are submitted for ${student?.name || "this account"}.`;
}

function isSupabasePlayerSession() {
  return currentSession?.authSource === "supabase-player";
}

function createStoreIdempotencyKey() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `store_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

Object.assign(window.Econovaria.features.store, { renderStore, purchaseItem });
