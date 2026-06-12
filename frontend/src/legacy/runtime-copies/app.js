const API_URL = "https://silent-haze-ca17.kohner.workers.dev";

const PERMISSION_SETS = {
  STUDENT: {
    label: "Ready",
    views: ["profile", "store", "portfolio", "trade", "stockProfile", "rating"],
    actions: ["STORE_PURCHASE", "STOCK_TRADE", "SUBMIT_RATING"]
  },
  READ_ONLY: {
    label: "View only",
    views: ["profile", "store", "portfolio", "trade", "stockProfile", "rating"],
    actions: []
  }
};

const VIEW_COPY = {
  profile: {
    title: "My Dashboard",
    subtitle: "A quick look at your balance, recent activity, inventory, and investments."
  },
  store: {
    title: "Shop",
    subtitle: "Buy classroom items with your current balance. Purchases update your account after they are confirmed."
  },
  portfolio: {
    title: "Investments",
    subtitle: "Track your current holdings and how your positions are doing in the market."
  },
  trade: {
    title: "Trade Desk",
    subtitle: "Buy or sell shares during the trading window. Check your balance and holdings first."
  },
  stockProfile: {
    title: "Market Explorer",
    subtitle: "Look through available companies and compare prices before making a move."
  },
  rating: {
    title: "Predictions",
    subtitle: "Submit a market prediction with a target price and a short reason."
  }
};

let state = emptyState();
let currentSession = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("refreshButton").addEventListener("click", refreshDashboard);

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  showLogin();
}

function emptyState() {
  return {
    profile: null,
    store: [],
    transactions: [],
    inventory: [],
    market: [],
    portfolio: [],
    ratings: [],
    news: [],
    news: []
  };
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const input = document.getElementById("loginCardId");
  const accessCode = normalizeCardId(input.value);

  clearLoginError();

  if (isButtonLoading(button)) return;

  if (!accessCode) {
    return showLoginError("Enter your student code first.");
  }

  setButtonLoading(button, true, "Opening dashboard...");
  setControlsDisabled(form, true, [button]);

  try {
    const result = await callApi({
      action: "LOGIN",
      accessCode,
      code: accessCode,
      cardId: accessCode
    });

    input.value = "";

    if (!result || result.ok !== true) {
      return showLoginError(cleanErrorMessage(result && result.message ? result.message : "Login failed. Try scanning your code again."));
    }

    currentSession = {
      role: "STUDENT",
      token: result.token || result.sessionToken || "",
      permissions: result.permissions || PERMISSION_SETS.STUDENT.actions
    };

    mergeSnapshot(result.snapshot || {});

    if (result.profile) {
      state.profile = normalizeProfile(result.profile);
    }

    showApp();
    showGlobalStatus("ok", "Dashboard opened. Your latest account data is loaded.");

  } catch (err) {
    showLoginError(cleanErrorMessage(err.message || String(err)));
  } finally {
    setControlsDisabled(form, false, [button]);
    setButtonLoading(button, false);
  }
}

function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  updateIdentity();
  switchView("profile");
}

async function logout() {
  const button = document.getElementById("logoutButton");

  if (isButtonLoading(button)) return;

  setButtonLoading(button, true, "Logging out...");

  try {
    if (currentSession && currentSession.token) {
      await callApi({
        action: "LOGOUT",
        token: currentSession.token
      });
    }

    currentSession = null;
    state = emptyState();
    hideGlobalStatus();
    showLogin();

  } finally {
    setButtonLoading(button, false);
  }
}

async function refreshDashboard() {
  const button = document.getElementById("refreshButton");

  if (isButtonLoading(button)) return;

  if (!currentSession || !currentSession.token) {
    showGlobalStatus("bad", "Sign in again to refresh your dashboard.");
    return showLogin();
  }

  setButtonLoading(button, true, "Refreshing...");
  showGlobalStatus("loading", "Refreshing your latest dashboard data...");

  try {
    const result = await callApi({
      action: "GET_SNAPSHOT",
      token: currentSession.token
    });

    if (!result || result.ok !== true) {
      throw new Error(result && result.message ? result.message : "Refresh failed.");
    }

    if (result.snapshot) mergeSnapshot(result.snapshot);
    renderCurrentView();
    updateIdentity();
    showGlobalStatus("ok", "Dashboard refreshed.");

  } catch (err) {
    showGlobalStatus("bad", cleanErrorMessage(err.message || String(err)));
  } finally {
    setButtonLoading(button, false);
  }
}

function showLogin() {
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  setTimeout(() => document.getElementById("loginCardId").focus(), 0);
}

function showLoginError(message) {
  const el = document.getElementById("loginError");
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearLoginError() {
  const el = document.getElementById("loginError");
  el.textContent = "";
  el.classList.add("hidden");
}

function showGlobalStatus(type, message) {
  const el = document.getElementById("globalStatus");
  if (!el) return;
  el.className = `global-status ${type || ""}`;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideGlobalStatus() {
  const el = document.getElementById("globalStatus");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

function selectedStudent() {
  return state.profile || null;
}

function updateIdentity() {
  const s = selectedStudent();
  if (!s) return;

  const role = currentSession?.role || "STUDENT";
  const label = PERMISSION_SETS[role]?.label || role;

  document.getElementById("identityName").textContent = s.name || "Student";
  document.getElementById("identityMeta").textContent = `Grade ${s.grade || "—"} · ${s.homeroom || "—"}`;
  document.getElementById("permissionSummary").innerHTML = `<span class="badge good">${sanitize(label)}</span><span class="badge">Live account</span>`;
  document.getElementById("connectionMode").textContent = "Synced account";
  document.getElementById("connectionCopy").textContent = "Your dashboard updates after confirmed actions.";
}

function can(action) {
  return (currentSession?.permissions || []).includes(action);
}

function requirePermission(action) {
  if (!can(action)) {
    throw new Error("This action is not available for your account right now.");
  }
}

function switchView(view) {
  if (!selectedStudent()) return showLogin();

  const allowedViews = PERMISSION_SETS[currentSession?.role || "STUDENT"]?.views || [];
  if (!allowedViews.includes(view)) return;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === view);
  });

  const copy = VIEW_COPY[view] || VIEW_COPY.profile;
  document.getElementById("pageTitle").textContent = copy.title;
  document.getElementById("pageSubtitle").textContent = copy.subtitle;
  renderCurrentView();
}

function currentView() {
  return document.querySelector(".view.active")?.id || "profile";
}

function renderCurrentView() {
  if (!selectedStudent()) return showLogin();

  const view = currentView();

  if (view === "profile") renderProfile();
  if (view === "store") renderStore();
  if (view === "portfolio") renderPortfolio();
  if (view === "trade") renderTrade();
  if (view === "stockProfile") renderStockProfile();
  if (view === "rating") renderRating();
}

function renderProfile() {
  const s = selectedStudent();
  const transactions = state.transactions || [];
  const purchases = transactions.filter((t) => t.mode === "STORE_PURCHASE");
  const totalSpent = sum(purchases, "amount");
  const inventoryCount = sum(state.inventory || [], "quantityPurchased");

  document.getElementById("profile").innerHTML = `
    <div class="grid cols-4">
      ${metric("Balance", money(s.balance), "Available to spend or invest", "Your current classroom economy balance.")}
      ${metric("Inventory", inventoryCount, "Items you have bought", "Items recorded on your account.")}
      ${metric("Shop Spent", money(totalSpent), "Total recent purchases", "Money you have spent in the shop.")}
      ${metric("Investments", (state.portfolio || []).length, "Current positions", "Stocks you currently own.")}
    </div>

    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <h2 class="card-title">My Account</h2>
        ${help("This section shows your student account details.")}
        <div class="mini-list">
          ${mini("Name", s.name)}
          ${mini("Grade", s.grade || "—")}
          ${mini("Homeroom", s.homeroom || "—")}
          ${mini("Job", s.jobTitle || "No job assigned")}
          ${mini("Account", s.active || "Active")}
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">Recent Activity</h2>
        ${help("Newest purchases, trades, rewards, and account changes show here. Dates are shown in Korea time when possible.")}
        ${table(transactions.slice(0, 10), ["timestamp", "mode", "amount", "endingBalance", "itemName", "status"], "No activity yet. Once you buy, trade, or submit a prediction, it will appear here.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">My Items</h2>
      ${help("Items you bought from the shop appear here.")}
      ${table(state.inventory || [], ["itemName", "category", "quantityPurchased", "totalSpent", "lastPurchased"], "No items yet. Visit the Shop to buy your first item.")}
    </div>`;
}

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
          <h2 class="card-title">Buy an Item</h2>
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

          <button id="storeSubmitButton" class="primary-btn span-2" type="button" ${can("STORE_PURCHASE") ? "" : "disabled"} onclick="purchaseItem(this)">Buy Item</button>
        </div>

        <div id="storeStatus" class="status-box">Purchases are submitted for ${sanitize(s.name)}.</div>
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

    setButtonLoading(submitButton, true, "Buying...");
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

function renderPortfolio() {
  const rows = state.portfolio || [];
  const marketValue = rows.reduce((total, row) => {
    const market = findMarket(row.ticker);
    return total + Number(row.sharesOwned || 0) * Number(market?.currentPrice || row.avgBuyPrice || 0);
  }, 0);
  const totalCost = sum(rows, "totalCost");
  const gainLoss = marketValue - totalCost;

  const displayRows = rows.map((row) => {
    const market = findMarket(row.ticker);
    const currentPrice = Number(market?.currentPrice || row.avgBuyPrice || 0);
    const positionValue = Number(row.sharesOwned || 0) * currentPrice;
    return {
      ticker: row.ticker,
      sharesOwned: row.sharesOwned,
      avgBuyPrice: row.avgBuyPrice,
      currentPrice,
      marketValue: positionValue,
      gainLoss: positionValue - Number(row.totalCost || 0),
      lastUpdated: row.lastUpdated || ""
    };
  });

  document.getElementById("portfolio").innerHTML = `
    <div class="grid cols-3">
      ${metric("Holdings", rows.length, "Active positions", "How many different stocks you currently own.")}
      ${metric("Market Value", money(marketValue), "Current portfolio", "Estimated value of your current shares.")}
      ${metric("Gain / Loss", money(gainLoss), gainLoss >= 0 ? "Currently positive" : "Currently negative", "Difference between your cost and current value.")}
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">My Positions</h2>
      ${help("This table shows stocks you currently own. Gain / loss updates when prices refresh.")}
      ${table(displayRows, ["ticker", "sharesOwned", "avgBuyPrice", "currentPrice", "marketValue", "gainLoss", "lastUpdated"], "No investments yet. Use the Trade Desk to buy your first shares.")}
    </div>`;
}

function renderTrade() {
  const marketRows = state.market || [];
  const stockTx = (state.transactions || [])
    .filter((t) => String(t.mode || "").startsWith("STOCK"))
    .slice(0, 10);

  document.getElementById("trade").innerHTML = `
    <div class="market-ticker">
      ${marketRows.slice(0, 24).map((m) => `<div class="ticker-pill"><strong>${sanitize(m.ticker)}</strong> ${money(m.currentPrice)} <span>${sanitize(m.trend || "")}</span></div>`).join("")}
    </div>

    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Place a Trade</h2>
          <span class="badge ${can("STOCK_TRADE") ? "good" : "bad"}">${can("STOCK_TRADE") ? "Ready" : "Unavailable"}</span>
        </div>
        ${help("BUY spends your balance. SELL gives money back if you own enough shares.")}

        <div class="form-grid" id="tradeForm">
          <label>
            <span class="field-label">Action</span>
            <select id="tradeAction"><option>BUY</option><option>SELL</option></select>
          </label>

          <label>
            <span class="field-label">Stock</span>
            <select id="tradeTicker">
              ${marketRows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)} · ${money(m.currentPrice)}</option>`).join("")}
            </select>
          </label>

          <label class="span-2">
            <span class="field-label">Shares</span>
            <input id="tradeShares" type="number" min="1" value="1" />
          </label>

          <button id="tradeSubmitButton" class="primary-btn span-2" type="button" ${can("STOCK_TRADE") ? "" : "disabled"} onclick="submitTrade(this)">Submit Trade</button>
        </div>

        <div id="tradeStatus" class="status-box">Trades are checked against your balance and current holdings.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Recent Trades</h2>
        ${help("Your newest stock activity appears here after each confirmed trade.")}
        ${table(stockTx, ["timestamp", "mode", "itemId", "itemName", "amount", "endingBalance", "status"], "No stock trades yet.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Market Board</h2>
      ${help("Use this table to compare current prices before trading.")}
      ${table(marketRows.slice(0, 40), ["ticker", "companyName", "sector", "currentPrice", "changePct", "trend", "assetType"], "No market data is available right now.")}
    </div>`;
}

async function submitTrade(button) {
  const status = document.getElementById("tradeStatus");
  const form = document.getElementById("tradeForm");
  const submitButton = button || document.getElementById("tradeSubmitButton");

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission("STOCK_TRADE");

    const action = document.getElementById("tradeAction").value;
    const ticker = document.getElementById("tradeTicker").value;
    const shares = Number(document.getElementById("tradeShares").value || 0);

    if (!ticker) throw new Error("Choose a stock first.");
    if (!Number.isInteger(shares) || shares < 1) throw new Error("Shares must be a whole number above 0.");

    setButtonLoading(submitButton, true, "Submitting...");
    setControlsDisabled(form, true, [submitButton]);
    showStatus(status, null, "Checking market price and your account...");

    const result = await submitAction("STOCK_TRADE", {
      action,
      ticker,
      shares
    });

    showStatus(status, result.ok === true, result.message || "Trade submitted.");
    renderCurrentView();
    updateIdentity();

  } catch (err) {
    showStatus(status, false, cleanErrorMessage(err.message));
  } finally {
    setControlsDisabled(form, false, [submitButton]);
    setButtonLoading(submitButton, false);
  }
}

function renderStockProfile() {
  const rows = state.market || [];
  const defaultTicker = rows[0]?.ticker || "";

  document.getElementById("stockProfile").innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <label>
        <span class="field-label">Choose a Stock</span>
        ${help("Select a ticker to see a quick profile.")}
        <select id="stockProfileTicker" onchange="renderStockProfileDetail()">
          ${rows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div id="stockProfileDetail"></div>`;

  if (defaultTicker) {
    document.getElementById("stockProfileTicker").value = defaultTicker;
  }

  renderStockProfileDetail();
}

function renderStockProfileDetail() {
  const ticker = document.getElementById("stockProfileTicker")?.value;
  const m = findMarket(ticker) || (state.market || [])[0];

  if (!m) {
    document.getElementById("stockProfileDetail").innerHTML = `<div class="empty">No market data is available right now.</div>`;
    return;
  }

  document.getElementById("stockProfileDetail").innerHTML = `
    <div class="stock-hero">
      <div class="card">
        <div class="eyebrow">${sanitize(m.sector || "Market")} · ${sanitize(m.assetType || "Asset")}</div>
        <h2>${sanitize(m.companyName || m.ticker)} <span class="badge">${sanitize(m.ticker)}</span></h2>
        <div class="large-price">${money(m.currentPrice)}</div>
        <div>${sanitize(m.trend || "")}</div>
        <div class="mini-list" style="margin-top:14px;">
          ${mini("Sector", m.sector || "—")}
          ${mini("Change", formatPercentLike(m.changePct))}
          ${mini("Asset Type", m.assetType || "—")}
          ${mini("Last Updated", formatDateTime(m.lastUpdated))}
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">My Holding</h2>
        ${help("This shows whether you currently own this stock.")}
        <div class="mini-list">
          ${holdingSummary(m.ticker)}
        </div>
      </div>
    </div>`;
}

function holdingSummary(ticker) {
  const holding = (state.portfolio || []).find((p) => p.ticker === ticker);

  if (!holding) {
    return mini("Shares", "0") + mini("Status", "No current position");
  }

  return [
    mini("Shares", holding.sharesOwned),
    mini("Average Buy", money(holding.avgBuyPrice)),
    mini("Total Cost", money(holding.totalCost)),
    mini("Last Updated", formatDateTime(holding.lastUpdated))
  ].join("");
}

function renderRating() {
  const marketRows = state.market || [];
  const ratings = (state.ratings || []).slice(0, 12);

  document.getElementById("rating").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Submit a Prediction</h2>
          <span class="badge ${can("SUBMIT_RATING") ? "good" : "bad"}">${can("SUBMIT_RATING") ? "Ready" : "Unavailable"}</span>
        </div>
        ${help("Choose a stock, make a prediction, set a target price, and explain your thinking.")}

        <div class="form-grid" id="ratingForm">
          <label>
            <span class="field-label">Stock</span>
            <select id="ratingTicker">
              ${marketRows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span class="field-label">Prediction</span>
            <select id="ratingValue"><option>BUY</option><option>HOLD</option><option>SELL</option></select>
          </label>

          <label class="span-2">
            <span class="field-label">Target Price</span>
            <input id="targetPrice" type="number" min="0" step="0.01" placeholder="Example: 125.00" />
          </label>

          <label class="span-2">
            <span class="field-label">Reason</span>
            <textarea id="ratingReason" rows="4" placeholder="Explain your reasoning. Minimum 10 characters."></textarea>
          </label>

          <button id="ratingSubmitButton" class="primary-btn span-2" type="button" ${can("SUBMIT_RATING") ? "" : "disabled"} onclick="submitRating(this)">Submit Prediction</button>
        </div>

        <div id="ratingStatus" class="status-box">Predictions are saved to your account.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Prediction History</h2>
        ${help("Your recent predictions appear here after they are confirmed.")}
        ${table(ratings, ["timestamp", "ticker", "rating", "targetPrice", "reason", "rewardStatus", "rewardAmount"], "No predictions yet.")}
      </div>
    </div>`;
}

async function submitRating(button) {
  const status = document.getElementById("ratingStatus");
  const form = document.getElementById("ratingForm");
  const submitButton = button || document.getElementById("ratingSubmitButton");

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission("SUBMIT_RATING");

    const ticker = document.getElementById("ratingTicker").value;
    const rating = document.getElementById("ratingValue").value;
    const targetPrice = Number(document.getElementById("targetPrice").value || 0);
    const reason = document.getElementById("ratingReason").value.trim();

    if (!ticker) throw new Error("Choose a stock first.");
    if (!targetPrice || targetPrice <= 0) throw new Error("Enter a target price above 0.");
    if (reason.length < 10) throw new Error("Add a short reason with at least 10 characters.");

    setButtonLoading(submitButton, true, "Saving...");
    setControlsDisabled(form, true, [submitButton]);
    showStatus(status, null, "Saving your prediction...");

    const result = await submitAction("SUBMIT_RATING", {
      ticker,
      rating,
      targetPrice,
      reason
    });

    showStatus(status, result.ok === true, result.message || "Prediction saved.");

    if (result.ok === true) {
      document.getElementById("targetPrice").value = "";
      document.getElementById("ratingReason").value = "";
    }

    renderCurrentView();

  } catch (err) {
    showStatus(status, false, cleanErrorMessage(err.message));
  } finally {
    setControlsDisabled(form, false, [submitButton]);
    setButtonLoading(submitButton, false);
  }
}

async function submitAction(action, payload) {
  requirePermission(action);

  if (!currentSession || !currentSession.token) {
    throw new Error("Sign in again before submitting.");
  }

  const result = await callApi({
    action,
    token: currentSession.token,
    payload
  });

  if (!result || result.ok !== true) {
    throw new Error(result && result.message ? result.message : "That did not go through. Try again.");
  }

  if (result.snapshot) {
    mergeSnapshot(result.snapshot);
  }

  return result;
}

async function callApi(body) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    let result;

    try {
      result = await response.json();
    } catch (err) {
      return {
        ok: false,
        message: "The dashboard received an unreadable response. Try refreshing."
      };
    }

    if (!result) {
      return {
        ok: false,
        message: "No response came back. Try again."
      };
    }

    return result;

  } catch (err) {
    return {
      ok: false,
      message: "Could not connect. Check your internet and try again."
    };
  }
}

function mergeSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot || {});

  state = {
    ...emptyState(),
    ...state,
    ...normalized,
    profile: normalized.profile || state.profile || null,
    store: normalized.store,
    transactions: normalized.transactions,
    inventory: normalized.inventory,
    market: normalized.market,
    portfolio: normalized.portfolio,
    ratings: normalized.ratings,
    news: normalized.news,
    news: normalized.news
  };
}

function normalizeSnapshot(snapshot) {
  const profileSource =
    snapshot.profile ||
    snapshot.student ||
    snapshot.currentStudent ||
    snapshot.account ||
    (Array.isArray(snapshot.students) ? snapshot.students[0] : null) ||
    (Array.isArray(snapshot.studentRows) ? snapshot.studentRows[0] : null) ||
    null;

  return {
    profile: profileSource ? normalizeProfile(profileSource) : null,
    store: getFirstArray(snapshot, ["store", "storeItems", "items", "availableItems"]).map(normalizeStoreItem),
    transactions: getFirstArray(snapshot, ["transactions", "recentTransactions", "history", "transactionHistory", "activity", "recentActivity"])
      .map(normalizeTransaction)
      .sort(sortNewestFirst),
    inventory: getFirstArray(snapshot, ["inventory", "studentInventory", "itemsOwned", "ownedItems"]).map(normalizeInventoryItem),
    market: getFirstArray(snapshot, ["market", "stocks", "stockMarket", "marketRows"]).map(normalizeMarketRow),
    portfolio: getFirstArray(snapshot, ["portfolio", "holdings", "positions", "stockPortfolio"]).map(normalizePortfolioRow),
    ratings: getFirstArray(snapshot, ["ratings", "predictions", "analystRatings", "ratingHistory"]).map(normalizeRatingRow).sort(sortNewestFirst),
    news: getFirstArray(snapshot, ["news", "stockNews", "reports", "stockNewsReports"]).map(normalizeNewsRow).sort(sortNewestFirst),
    news: getFirstArray(snapshot, ["news", "stockNews", "reports", "stockNewsReports"]).map(normalizeNewsRow).sort(sortNewestFirst)
  };
}

function normalizeProfile(row) {
  return {
    name: pick(row, ["name", "studentName", "Student_Name", "Student Name", "Name"]),
    grade: pick(row, ["grade", "Grade"]),
    homeroom: pick(row, ["homeroom", "Homeroom", "Class", "class"]),
    jobTitle: pick(row, ["jobTitle", "Job_Title", "Job Title", "Job", "job"]),
    balance: toNumber(pick(row, ["balance", "Balance", "Current_Balance", "Current Balance"])),
    active: pick(row, ["active", "Active", "Status", "status"]) || "Active"
  };
}

function normalizeStoreItem(row) {
  return {
    itemId: pick(row, ["itemId", "Item_ID", "Item ID", "id", "ID"]),
    itemName: pick(row, ["itemName", "Item_Name", "Item Name", "name", "Name"]),
    price: toNumber(pick(row, ["price", "Price"])),
    inventory: pick(row, ["inventory", "Inventory", "Stock", "stock"]),
    category: pick(row, ["category", "Category"]),
    description: pick(row, ["description", "Description", "Notes", "notes"])
  };
}

function normalizeTransaction(row) {
  const action = pick(row, ["mode", "Mode", "action", "Action", "Type", "type"]);
  const ticker = pick(row, ["ticker", "Ticker"]);
  const itemId = pick(row, ["itemId", "Item_ID", "Item ID", "Ticker", "ticker"]);
  const itemName = pick(row, ["itemName", "Item_Name", "Item Name", "Company_Name", "Company Name", "Ticker", "ticker", "Note", "note"]);

  return {
    timestamp: pick(row, ["timestamp", "Timestamp", "time", "Time", "date", "Date"]),
    mode: normalizeMode(action || (ticker ? "STOCK_TRADE" : "ACTIVITY")),
    amount: toNumber(pick(row, ["amount", "Amount", "Total_Value", "Total Value", "totalValue", "Price", "price"])),
    endingBalance: toNumber(pick(row, ["endingBalance", "Ending_Balance", "Ending Balance", "Balance_After", "Balance After", "balanceAfter"])),
    itemId,
    itemName,
    status: pick(row, ["status", "Status", "Reward_Status", "Reward Status"]),
    note: pick(row, ["note", "Note", "Reason", "reason"])
  };
}

function normalizeInventoryItem(row) {
  return {
    itemName: pick(row, ["itemName", "Item_Name", "Item Name", "Name", "name"]),
    category: pick(row, ["category", "Category"]),
    quantityPurchased: toNumber(pick(row, ["quantityPurchased", "Quantity_Purchased", "Quantity Purchased", "Qty", "qty", "Quantity", "quantity"])),
    totalSpent: toNumber(pick(row, ["totalSpent", "Total_Spent", "Total Spent", "Amount", "amount"])),
    lastPurchased: pick(row, ["lastPurchased", "Last_Purchased", "Last Purchased", "Last_Updated", "Last Updated", "Timestamp", "timestamp"])
  };
}

function normalizeMarketRow(row) {
  const history =
    Array.isArray(row.history)
      ? row.history
      : Array.isArray(row.History)
        ? row.History
        : pick(row, ["history", "History", "Price_History", "Price History", "priceHistory"]);

  return {
    ticker: pick(row, ["ticker", "Ticker"]),
    companyName: pick(row, ["companyName", "Company_Name", "Company Name", "Name", "name"]),
    sector: pick(row, ["sector", "Sector"]),
    currentPrice: toNumber(pick(row, ["currentPrice", "Current_Price", "Current Price", "Price", "price", "Close", "close"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change", "change", "Price_Change_%", "Price Change %"]),
    trend: pick(row, ["trend", "Trend"]),
    assetType: pick(row, ["assetType", "Asset_Type", "Asset Type", "Type", "type"]),

    // Pulled/calculated by backend from Stock_Price_History
    previousClose: toNumber(pick(row, ["previousClose", "Previous_Close", "Previous Close", "Prev_Close", "Prev Close"])),
    dayLow: toNumber(pick(row, ["dayLow", "Day_Low", "Day Low", "Low", "low"])),
    dayHigh: toNumber(pick(row, ["dayHigh", "Day_High", "Day High", "High", "high"])),
    volume: toNumber(pick(row, ["volume", "Volume", "Trade_Volume", "Trade Volume", "Daily_Volume", "Daily Volume"])),
    marketCap: toNumber(pick(row, ["marketCap", "Market_Cap", "Market Cap", "Market_Value", "Market Value"])),
    history,

    lastUpdated: pick(row, ["lastUpdated", "Last_Updated", "Last Updated", "Timestamp", "timestamp", "Updated", "updated"])
  };
}

function normalizePortfolioRow(row) {
  return {
    ticker: pick(row, ["ticker", "Ticker"]),
    sharesOwned: toNumber(pick(row, ["sharesOwned", "Shares_Owned", "Shares Owned", "Shares", "shares"])),
    avgBuyPrice: toNumber(pick(row, ["avgBuyPrice", "Avg_Buy_Price", "Avg Buy Price", "Average Buy Price"])),
    totalCost: toNumber(pick(row, ["totalCost", "Total_Cost", "Total Cost"])),
    currentPrice: toNumber(pick(row, ["currentPrice", "Current Price", "Current_Price"])),
    marketValue: toNumber(pick(row, ["marketValue", "Market Value", "Market_Value"])),
    gainLoss: toNumber(pick(row, ["gainLoss", "Unrealized Gain/Loss", "Unrealized_Gain_Loss", "Unrealized Gain Loss"])),
    lastUpdated: pick(row, ["lastUpdated", "Last_Updated", "Last Updated"])
  };
}

function normalizeNewsRow(row) {
  return {
    timestamp: pick(row, ["timestamp", "Timestamp", "Date", "date"]),
    date: pick(row, ["date", "Date"]),
    ticker: pick(row, ["ticker", "Ticker"]),
    companyName: pick(row, ["companyName", "Company_Name", "Company Name"]),
    sector: pick(row, ["sector", "Sector"]),
    headline: pick(row, ["headline", "Headline", "Title", "title"]),
    summary: pick(row, ["summary", "Summary", "Description", "description", "Note", "note"]),
    impact: pick(row, ["impact", "Impact"]),
    sentiment: pick(row, ["sentiment", "Sentiment"]),
    priceBefore: toNumber(pick(row, ["priceBefore", "Price_Before", "Price Before"])),
    priceAfter: toNumber(pick(row, ["priceAfter", "Price_After", "Price After"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change"])
  };
}

function normalizeRatingRow(row) {
  return {
    timestamp: pick(row, ["timestamp", "Timestamp", "Date", "date"]),
    ticker: pick(row, ["ticker", "Ticker"]),
    rating: pick(row, ["rating", "Rating", "Prediction", "prediction"]),
    targetPrice: toNumber(pick(row, ["targetPrice", "Target_Price", "Target Price"])),
    reason: pick(row, ["reason", "Reason"]),
    rewardStatus: pick(row, ["rewardStatus", "Reward_Status", "Reward Status", "Status", "status"]),
    rewardAmount: toNumber(pick(row, ["rewardAmount", "Reward_Amount", "Reward Amount"])),
    endOfDayPrice: toNumber(pick(row, ["endOfDayPrice", "End_Of_Day_Price", "End Of Day Price"])),
    accuracy: pick(row, ["accuracy", "Accuracy_%", "Accuracy %"])
  };
}

function getFirstArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function pick(row, keys) {
  if (!row) return "";

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  const normalizedMap = {};
  Object.keys(row).forEach((key) => {
    normalizedMap[normalizeKey(key)] = row[key];
  });

  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (normalizedMap[normalized] !== undefined && normalizedMap[normalized] !== null && normalizedMap[normalized] !== "") {
      return normalizedMap[normalized];
    }
  }

  return "";
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeMode(value) {
  const mode = String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .toUpperCase();

  if (mode === "BUY" || mode === "SELL") return `STOCK_${mode}`;
  if (mode.includes("STORE")) return "STORE_PURCHASE";
  if (mode.includes("RATING") || mode.includes("PREDICTION")) return "PREDICTION";
  return mode || "ACTIVITY";
}

function sortNewestFirst(a, b) {
  return parseDateValue(b.timestamp || b.lastUpdated || b.lastPurchased) - parseDateValue(a.timestamp || a.lastUpdated || a.lastPurchased);
}

function findMarket(ticker) {
  return (state.market || []).find((m) => String(m.ticker) === String(ticker));
}

function normalizeCardId(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.0$/, "");
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD"
  });
}

function sanitize(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function metric(label, value, note, helpText) {
  return `
    <div class="metric">
      <div class="label">${sanitize(label)}</div>
      <div class="value">${sanitize(value)}</div>
      <div class="note">${sanitize(note || "")}</div>
      ${helpText ? help(helpText) : ""}
    </div>`;
}

function mini(label, value) {
  return `<div class="mini-row"><span>${sanitize(label)}</span><strong>${sanitize(formatMiniValue(label, value))}</strong></div>`;
}

function help(text) {
  return `<p class="help-text">${sanitize(text)}</p>`;
}

function sum(rows, key) {
  return (rows || []).reduce((total, row) => total + Number(row[key] || 0), 0);
}

function showStatus(element, ok, message) {
  if (!element) return;

  if (ok === null) {
    element.className = "status-box loading";
  } else {
    element.className = `status-box ${ok ? "ok" : "bad"}`;
  }

  element.textContent = message;
}

function isButtonLoading(button) {
  return Boolean(button && button.dataset.loading === "true");
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent.trim();
  }

  if (isLoading) {
    button.dataset.loading = "true";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("is-loading");
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${sanitize(loadingText || "Loading...")}</span>`;
    return;
  }

  button.dataset.loading = "false";
  button.disabled = false;
  button.removeAttribute("aria-busy");
  button.classList.remove("is-loading");
  button.textContent = button.dataset.originalText || "Submit";
}

function setControlsDisabled(container, disabled, exceptions = []) {
  if (!container) return;

  const exceptionSet = new Set(exceptions.filter(Boolean));

  container.querySelectorAll("input, select, textarea, button").forEach((control) => {
    if (exceptionSet.has(control)) return;
    control.disabled = disabled;
  });
}

function table(rows, columns, emptyMessage) {
  if (!rows || !rows.length) {
    return `<div class="empty">${sanitize(emptyMessage)}</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((col) => `<th>${labelize(col)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((col) => `<td>${formatValue(col, row[col])}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function labelize(value) {
  const labels = {
    timestamp: "Time",
    mode: "Activity",
    amount: "Amount",
    endingBalance: "Balance After",
    itemName: "Item",
    itemId: "Ticker / Item",
    status: "Status",
    currentPrice: "Price",
    changePct: "Change",
    assetType: "Type",
    sharesOwned: "Shares",
    avgBuyPrice: "Avg. Buy",
    marketValue: "Value",
    gainLoss: "Gain / Loss",
    targetPrice: "Target",
    rewardStatus: "Result",
    rewardAmount: "Reward",
    lastUpdated: "Updated",
    lastPurchased: "Last Bought"
  };

  return sanitize(labels[value] || String(value).replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim());
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === "") return "";

  if (/quantity/i.test(key)) {
    const n = toNumber(value);
    return sanitize(Number.isFinite(n) ? n.toLocaleString() : value);
  }

  if (/timestamp|date|updated|purchased/i.test(key)) {
    return sanitize(formatDateTime(value));
  }

  if (/changePct|accuracy/i.test(key)) {
    return sanitize(formatPercentLike(value));
  }

  if (/amount|balance|price|cost|spent|value|reward|target/i.test(key)) {
    return sanitize(money(value));
  }

  if (/gainLoss/i.test(key)) {
    const cls = Number(value) >= 0 ? "positive" : "negative";
    return `<span class="${cls}">${sanitize(money(value))}</span>`;
  }

  if (/status|active/i.test(key)) {
    const text = String(value);
    const cls = text.toLowerCase().includes("success") || text.toLowerCase().includes("active") || text.toLowerCase().includes("pending")
      ? "good"
      : "";
    return `<span class="badge ${cls}">${sanitize(value)}</span>`;
  }

  return sanitize(value);
}

function formatMiniValue(label, value) {
  if (/updated|date|last\s*bought|last\s*purchased|lastBought|lastPurchased/i.test(label)) {
    return formatDateTime(value);
  }
  return value ?? "";
}

function formatPercentLike(value) {
  if (value === undefined || value === null || value === "") return "—";

  const number = Number(String(value).replace("%", ""));
  if (!Number.isFinite(number)) return String(value);

  if (String(value).includes("%")) return `${number.toFixed(2)}%`;
  if (Math.abs(number) <= 1) return `${(number * 100).toFixed(2)}%`;
  return `${number.toFixed(2)}%`;
}

function formatDateTime(value) {
  if (!value) return "—";

  if (value instanceof Date) {
    return formatDateObject(value);
  }

  const text = String(value).trim();
  if (!text) return "—";

  const parsed = parseDateValue(text);
  if (!parsed) return text;

  return formatDateObject(new Date(parsed));
}

function parseDateValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const text = String(value).trim();
  if (!text) return 0;

  const normalized = text
    .replace(/\./g, "-")
    .replace(" ", "T");

  const direct = Date.parse(normalized);
  if (!Number.isNaN(direct)) return direct;

  const fallback = Date.parse(text);
  if (!Number.isNaN(fallback)) return fallback;

  return 0;
}

function formatDateObject(date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  } catch (_) {
    return date.toLocaleString();
  }
}

function cleanErrorMessage(message) {
  const text = String(message || "Something went wrong. Try again.");

  if (/unauthorized|secret|api|script|worker|backend|server|origin/i.test(text)) {
    return "The dashboard could not confirm your request. Please refresh and try again.";
  }

  return text;
}
