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
    ratings: []
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
      accessCode
    });

    input.value = "";

    if (!result || result.ok !== true) {
      return showLoginError(cleanErrorMessage(result && result.message ? result.message : "Login failed. Try scanning your code again."));
    }

    currentSession = {
      role: "STUDENT",
      token: result.token,
      permissions: PERMISSION_SETS.STUDENT.actions
    };

    mergeSnapshot(result.snapshot || {});

    if (result.profile) {
      state.profile = result.profile;
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
      ${metric("Balance", money(s.balance), "Available to spend or invest", "This is your current classroom economy balance.")}
      ${metric("Inventory", inventoryCount, "Items you have bought", "These are items recorded on your account.")}
      ${metric("Shop Spent", money(totalSpent), "Total recent purchases", "This counts your store purchase activity.")}
      ${metric("Investments", (state.portfolio || []).length, "Current positions", "A position means you currently own shares.")}
    </div>

    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <h2 class="card-title">My Account ${tip("This information comes from your student account.")}</h2>
        <div class="mini-list">
          ${mini("Name", s.name)}
          ${mini("Grade", s.grade || "—")}
          ${mini("Homeroom", s.homeroom || "—")}
          ${mini("Job", s.jobTitle || "No job assigned")}
          ${mini("Account", s.active || "Active")}
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">Recent Activity ${tip("Your newest confirmed account actions appear here.")}</h2>
        ${table(transactions.slice(0, 10), ["timestamp", "mode", "amount", "endingBalance", "itemName", "status"], "No activity yet. Once you buy, trade, or submit a prediction, it will appear here.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">My Items ${tip("Items you bought from the shop appear here.")}</h2>
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
          <h2 class="card-title">Buy an Item ${tip("Choose an item and quantity, then submit your purchase.")}</h2>
          <span class="badge ${can("STORE_PURCHASE") ? "good" : "bad"}">${can("STORE_PURCHASE") ? "Ready" : "Unavailable"}</span>
        </div>

        <div class="form-grid" id="storeForm">
          <label>
            <span class="field-label">Item ${tip("The list shows the item price and current stock.")}</span>
            <select id="storeItem">
              ${items.map((item) => `<option value="${sanitize(item.itemId)}">${sanitize(item.itemName)} · ${money(item.price)} · Stock ${sanitize(item.inventory === "" ? "—" : item.inventory)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span class="field-label">Quantity ${tip("Choose how many you want to buy.")}</span>
            <input id="storeQty" type="number" min="1" value="1" />
          </label>

          <button id="storeSubmitButton" class="primary-btn span-2" type="button" ${can("STORE_PURCHASE") ? "" : "disabled"} onclick="purchaseItem(this)">Buy Item</button>
        </div>

        <div id="storeStatus" class="status-box">Purchases are submitted for ${sanitize(s.name)}.</div>
      </div>

      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Shop Items ${tip("These are the items currently available to buy.")}</h2>
          <span class="badge">${items.length} available</span>
        </div>
        ${table(items, ["itemName", "price", "inventory", "category", "description"], "The shop is empty right now. Check again later.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Purchase History ${tip("Your recent shop purchases appear here.")}</h2>
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
      ${metric("Gain / Loss", money(gainLoss), gainLoss >= 0 ? "Currently positive" : "Currently negative", "Difference between what your shares cost and what they are worth now.")}
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">My Positions ${tip("This table shows stocks you currently own.")}</h2>
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
          <h2 class="card-title">Place a Trade ${tip("Choose BUY to purchase shares or SELL to sell shares you already own.")}</h2>
          <span class="badge ${can("STOCK_TRADE") ? "good" : "bad"}">${can("STOCK_TRADE") ? "Ready" : "Unavailable"}</span>
        </div>

        <div class="form-grid" id="tradeForm">
          <label>
            <span class="field-label">Action ${tip("BUY spends your balance. SELL gives you money back if you own enough shares.")}</span>
            <select id="tradeAction"><option>BUY</option><option>SELL</option></select>
          </label>

          <label>
            <span class="field-label">Stock ${tip("Pick the company ticker you want to trade.")}</span>
            <select id="tradeTicker">
              ${marketRows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)} · ${money(m.currentPrice)}</option>`).join("")}
            </select>
          </label>

          <label class="span-2">
            <span class="field-label">Shares ${tip("Enter the number of shares. Use whole numbers only.")}</span>
            <input id="tradeShares" type="number" min="1" value="1" />
          </label>

          <button id="tradeSubmitButton" class="primary-btn span-2" type="button" ${can("STOCK_TRADE") ? "" : "disabled"} onclick="submitTrade(this)">Submit Trade</button>
        </div>

        <div id="tradeStatus" class="status-box">Trades are checked against your balance and current holdings.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Recent Trades ${tip("Your newest stock activity appears here.")}</h2>
        ${table(stockTx, ["timestamp", "mode", "itemId", "itemName", "amount", "endingBalance", "status"], "No stock trades yet.")}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Market Board ${tip("Use this table to compare current prices before trading.")}</h2>
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
        <span class="field-label">Choose a Stock ${tip("Select a ticker to see a quick profile.")}</span>
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
          ${mini("Change %", m.changePct || "—")}
          ${mini("Asset Type", m.assetType || "—")}
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">My Holding ${tip("This shows whether you currently own this stock.")}</h2>
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
    mini("Last Updated", holding.lastUpdated || "—")
  ].join("");
}

function renderRating() {
  const marketRows = state.market || [];
  const ratings = (state.ratings || []).slice(0, 12);

  document.getElementById("rating").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Submit a Prediction ${tip("Make a prediction using a rating, target price, and short reason.")}</h2>
          <span class="badge ${can("SUBMIT_RATING") ? "good" : "bad"}">${can("SUBMIT_RATING") ? "Ready" : "Unavailable"}</span>
        </div>

        <div class="form-grid" id="ratingForm">
          <label>
            <span class="field-label">Stock ${tip("Choose the company your prediction is about.")}</span>
            <select id="ratingTicker">
              ${marketRows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span class="field-label">Prediction ${tip("BUY means you expect strength, HOLD means neutral, SELL means weakness.")}</span>
            <select id="ratingValue"><option>BUY</option><option>HOLD</option><option>SELL</option></select>
          </label>

          <label class="span-2">
            <span class="field-label">Target Price ${tip("Your estimated future price for this stock.")}</span>
            <input id="targetPrice" type="number" min="0" step="0.01" placeholder="Example: 125.00" />
          </label>

          <label class="span-2">
            <span class="field-label">Reason ${tip("Explain your thinking in at least 10 characters.")}</span>
            <textarea id="ratingReason" rows="4" placeholder="Explain your reasoning. Minimum 10 characters."></textarea>
          </label>

          <button id="ratingSubmitButton" class="primary-btn span-2" type="button" ${can("SUBMIT_RATING") ? "" : "disabled"} onclick="submitRating(this)">Submit Prediction</button>
        </div>

        <div id="ratingStatus" class="status-box">Predictions are saved to your account.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Prediction History ${tip("Your recent predictions appear here.")}</h2>
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
  state = {
    ...emptyState(),
    ...state,
    ...snapshot,
    profile: snapshot.profile || state.profile || null,
    store: snapshot.store || [],
    transactions: snapshot.transactions || [],
    inventory: snapshot.inventory || [],
    market: snapshot.market || [],
    portfolio: snapshot.portfolio || [],
    ratings: snapshot.ratings || []
  };
}

function findMarket(ticker) {
  return (state.market || []).find((m) => String(m.ticker) === String(ticker));
}

function normalizeCardId(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.0$/, "");
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

function metric(label, value, note, tipText) {
  return `
    <div class="metric">
      <div class="label">${sanitize(label)} ${tipText ? tip(tipText) : ""}</div>
      <div class="value">${sanitize(value)}</div>
      <div class="note">${sanitize(note || "")}</div>
    </div>`;
}

function mini(label, value) {
  return `<div class="mini-row"><span>${sanitize(label)}</span><strong>${sanitize(value ?? "")}</strong></div>`;
}

function tip(text) {
  return `<span class="tooltip" tabindex="0" data-tip="${sanitize(text)}">?</span>`;
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
    rewardAmount: "Reward"
  };

  return sanitize(labels[value] || String(value).replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim());
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === "") return "";

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

function cleanErrorMessage(message) {
  const text = String(message || "Something went wrong. Try again.");

  if (/unauthorized|secret|api|script|worker|backend|server|origin/i.test(text)) {
    return "The dashboard could not confirm your request. Please refresh and try again.";
  }

  return text;
}
