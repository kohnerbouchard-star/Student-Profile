const API_URL = ""; // Optional: paste your deployed Apps Script Web App URL here later.
const SESSION_KEY = "classroomEconomySessionV2";
const STATE_KEY = "classroomEconomyStateV2";

const PERMISSION_SETS = {
  STUDENT: {
    label: "Student",
    views: ["profile", "store", "portfolio", "trade", "stockProfile", "rating"],
    actions: ["CLOCK_IN", "STORE_PURCHASE", "STOCK_TRADE", "ANALYST_RATING"]
  },
  READ_ONLY: {
    label: "Read only",
    views: ["profile", "store", "portfolio", "trade", "stockProfile", "rating"],
    actions: []
  }
};

let state = loadState();
let currentSession = null;

const views = {
  profile: "Student Profile",
  store: "Store Kiosk",
  portfolio: "Stock Portfolio",
  trade: "Stock Trade",
  stockProfile: "Stock Profile",
  rating: "Analyst Rating"
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      const session = JSON.parse(saved);
      if (session && session.cardId && findStudentByCard(session.cardId)) {
        currentSession = session;
        showApp();
        return;
      }
    } catch (_) {}
  }
  showLogin();
}

function loadState() {
  const saved = localStorage.getItem(STATE_KEY);
  const base = structuredClone(window.SEED_DATA || {});
  base.ratings = base.ratings || [];
  if (!saved) return base;
  try {
    const parsed = JSON.parse(saved);
    parsed.ratings = parsed.ratings || [];
    return parsed;
  } catch (_) {
    return base;
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

async function handleLogin(event) {
  event.preventDefault();
  const input = document.getElementById("loginCardId");
  const rawCardId = normalizeCardId(input.value);
  clearLoginError();

  if (!rawCardId) return showLoginError("Enter your Card ID.");

  if (API_URL) {
    try {
      const result = await callApi({ action: "LOGIN", cardId: rawCardId });
      if (!result.ok) return showLoginError(result.message || "Login failed.");
      if (result.snapshot) mergeSnapshot(result.snapshot);
      startSession({
        cardId: normalizeCardId(result.cardId || rawCardId),
        role: result.role || "STUDENT",
        token: result.sessionToken || "",
        permissions: result.permissions || PERMISSION_SETS.STUDENT.actions
      });
      return;
    } catch (err) {
      return showLoginError("Could not reach the backend. Check API_URL or use local prototype mode.");
    }
  }

  const student = findStudentByCard(rawCardId);
  if (!student) return showLoginError("Card ID not found. Check the ID and try again.");
  if (String(student.Active || "Yes").toLowerCase() === "no") return showLoginError("This Card ID is inactive.");

  startSession({
    cardId: normalizeCardId(student.Card_ID),
    role: "STUDENT",
    token: "local-prototype-session",
    permissions: PERMISSION_SETS.STUDENT.actions
  });
}

function startSession(session) {
  currentSession = session;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  document.getElementById("loginCardId").value = "";
  showApp();
}

function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  updateIdentity();
  switchView("profile");
}

function logout() {
  currentSession = null;
  sessionStorage.removeItem(SESSION_KEY);
  showLogin();
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
function clearLoginError() { document.getElementById("loginError").classList.add("hidden"); }

function updateIdentity() {
  const s = selectedStudent();
  if (!s) return;
  const role = currentSession?.role || "STUDENT";
  const label = PERMISSION_SETS[role]?.label || role;
  document.getElementById("identityName").textContent = s.Student_Name || "Student";
  document.getElementById("identityMeta").textContent = `Card ID: ${normalizeCardId(s.Card_ID)} · Grade ${s.Grade || "—"} · ${s.Homeroom || "—"}`;
  document.getElementById("permissionSummary").innerHTML = `<span class="badge good">${sanitize(label)}</span> ${actionBadges()}`;
  document.getElementById("connectionMode").textContent = API_URL ? "Connected backend" : "Local prototype";
  document.getElementById("connectionCopy").textContent = API_URL
    ? "Writes are sent to Apps Script and locked before touching Google Sheets."
    : "Writes are saved in this browser only until you connect Apps Script.";
}

function actionBadges() {
  const allowed = currentSession?.permissions || [];
  if (!allowed.length) return `<span class="badge">No writes</span>`;
  return allowed.map(a => `<span class="badge">${sanitize(labelizeAction(a))}</span>`).join(" ");
}

function can(action) { return (currentSession?.permissions || []).includes(action); }
function requirePermission(action) {
  if (!can(action)) throw new Error("You do not have permission to perform this action.");
}

function normalizeCardId(value) { return String(value ?? "").trim().replace(/\.0$/, ""); }
function findStudentByCard(cardId) {
  const target = normalizeCardId(cardId).toLowerCase();
  return (state.students || []).find(s => normalizeCardId(s.Card_ID).toLowerCase() === target);
}
function selectedCard() { return currentSession?.cardId || ""; }
function selectedStudent() { return findStudentByCard(selectedCard()); }
function money(v) { return Number(v || 0).toLocaleString(undefined, {style:"currency", currency:"USD"}); }
function num(v, d=2) { return Number(v || 0).toLocaleString(undefined, {maximumFractionDigits:d, minimumFractionDigits:d}); }
function percent(v) { return `${(Number(v || 0)*100).toFixed(2)}%`; }
function nowStamp() { return new Date().toISOString().slice(0,16).replace("T", " "); }
function todayStamp() { return new Date().toISOString().slice(0,10); }
function sanitize(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function labelizeAction(a) { return String(a).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

function switchView(view) {
  if (!selectedStudent()) return showLogin();
  if (!(PERMISSION_SETS[currentSession.role]?.views || []).includes(view)) return;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === view));
  document.getElementById("pageTitle").textContent = views[view];
  renderCurrentView();
}
function currentView() { return document.querySelector(".view.active").id; }
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
  const card = normalizeCardId(s.Card_ID);
  const tx = state.transactions.filter(t => normalizeCardId(t.Card_ID) === card && t.Status === "Success").slice(-10).reverse();
  const att = state.attendance.filter(a => normalizeCardId(a.Card_ID) === card).slice(-8).reverse();
  const purchases = state.transactions.filter(t => normalizeCardId(t.Card_ID) === card && t.Mode === "STORE_PURCHASE").slice(-8).reverse();
  const totalDeposits = sum(state.transactions.filter(t => normalizeCardId(t.Card_ID) === card && t.Mode === "DEPOSIT"), "Amount");
  const totalRewards = sum(state.transactions.filter(t => normalizeCardId(t.Card_ID) === card && t.Mode === "REWARD"), "Amount");
  const totalFines = sum(state.transactions.filter(t => normalizeCardId(t.Card_ID) === card && t.Mode === "FINE"), "Amount");
  const totalSpent = sum(purchases, "Amount");
  document.getElementById("profile").innerHTML = `
    <div class="grid cols-4">
      ${metric("Current Balance", money(s.Balance), s.Student_Name)}
      ${metric("Attendance Streak", `${Number(s.Attendance_Streak || 0)} days`, s.Homeroom)}
      ${metric("Total Rewards", money(totalRewards), "Rewards earned")}
      ${metric("Total Spent", money(totalSpent), "Store purchases")}
    </div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-title-row"><h2>Student Actions</h2><span class="badge ${can('CLOCK_IN') ? 'good' : ''}">${can('CLOCK_IN') ? 'Allowed' : 'Locked'}</span></div>
        <p class="muted-copy">Write actions are tied to your logged-in Card ID. You cannot submit for another student from this screen.</p>
        <button class="primary-btn" type="button" ${can('CLOCK_IN') ? '' : 'disabled'} onclick="clockIn()">Clock In</button>
        <div id="clockStatus" class="status-box">Use this only when attendance should be recorded from the app.</div>
      </div>
      <div class="card">
        <h2>Student Details</h2>
        <div class="mini-list">
          ${mini("Name", s.Student_Name)}${mini("Card ID", normalizeCardId(s.Card_ID))}${mini("Grade", s.Grade)}${mini("Homeroom", s.Homeroom)}${mini("Job", s.Job_Title || "No job assigned")}
          ${mini("Deposits", money(totalDeposits))}${mini("Fines", money(totalFines))}
        </div>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card"><h2>Recent Attendance</h2>${table(att, ["Timestamp", "Status", "Check_In_Time", "Note"], "No attendance records yet.")}</div>
      <div class="card"><h2>Recent Transactions</h2>${table(tx, ["Timestamp", "Mode", "Amount", "Ending_Balance", "Note"], "No transactions yet.")}</div>
    </div>`;
}

async function clockIn() {
  const status = document.getElementById("clockStatus");
  try {
    requirePermission("CLOCK_IN");
    await submitAction("CLOCK_IN", {}, () => localClockIn());
    showStatus(status, true, "Clock-in submitted.");
    renderProfile();
  } catch (err) {
    showStatus(status, false, err.message);
  }
}

function localClockIn() {
  const s = selectedStudent();
  const card = normalizeCardId(s.Card_ID);
  const today = todayStamp();
  const already = state.attendance.some(a => normalizeCardId(a.Card_ID) === card && String(a.Date).slice(0,10) === today);
  if (already) throw new Error("You already clocked in today.");
  const row = {
    Timestamp: nowStamp(), Date: today, Card_ID: s.Card_ID, Student_Name: s.Student_Name,
    Grade: s.Grade, Homeroom: s.Homeroom, Class_Period: "App", Status: "Present",
    Check_In_Time: new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}),
    Streak_After_Scan: Number(s.Attendance_Streak || 0) + 1,
    Note: "Submitted from app", Source: "Web App", Valid: "Yes"
  };
  state.attendance.push(row);
  s.Attendance_Streak = row.Streak_After_Scan;
  s.Last_Attendance_Date = today;
  saveState();
  return { ok: true, message: "Clock-in recorded." };
}

function renderStore() {
  const s = selectedStudent();
  const card = normalizeCardId(s.Card_ID);
  const items = state.storeItems.filter(i => String(i.Active).toLowerCase() === "yes");
  const purchases = state.transactions.filter(t => normalizeCardId(t.Card_ID) === card && t.Mode === "STORE_PURCHASE").slice(-12).reverse();
  document.getElementById("store").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row"><h2>Purchase Item</h2><span class="badge ${can('STORE_PURCHASE') ? 'good' : 'bad'}">${can('STORE_PURCHASE') ? 'Write allowed' : 'No write permission'}</span></div>
        <div class="form-grid">
          <label><span class="field-label">Item</span><select id="storeItem">${items.map(i => `<option value="${sanitize(i.Item_ID)}">${sanitize(i.Item_Name)} · ${money(i.Price)} · Stock ${sanitize(i.Inventory)}</option>`).join("")}</select></label>
          <label><span class="field-label">Quantity</span><input id="storeQty" type="number" min="1" value="1" /></label>
          <button class="primary-btn span-2" type="button" ${can('STORE_PURCHASE') ? '' : 'disabled'} onclick="purchaseItem()">Purchase</button>
        </div>
        <div id="storeStatus" class="status-box">This will submit as ${sanitize(s.Student_Name)} only.</div>
      </div>
      <div class="card">
        <div class="card-title-row"><h2>Available Store Items</h2><span class="badge">${items.length} active</span></div>
        ${table(items, ["Item_ID", "Item_Name", "Price", "Inventory", "Category", "Description"], "No store items.")}
      </div>
    </div>
    <div class="card" style="margin-top:16px;"><h2>Your Purchase History</h2>${table(purchases, ["Timestamp", "Item_Name", "Amount", "Ending_Balance", "Note"], "No purchases yet.")}</div>`;
}

async function purchaseItem() {
  const status = document.getElementById("storeStatus");
  try {
    requirePermission("STORE_PURCHASE");
    const itemId = document.getElementById("storeItem").value;
    const qty = Number(document.getElementById("storeQty").value || 1);
    await submitAction("STORE_PURCHASE", { itemId, qty }, () => localPurchaseItem(itemId, qty));
    showStatus(status, true, "Purchase submitted.");
    renderStore();
    updateIdentity();
  } catch (err) {
    showStatus(status, false, err.message);
  }
}

function localPurchaseItem(itemId, qty) {
  const s = selectedStudent();
  const item = state.storeItems.find(i => String(i.Item_ID) === String(itemId));
  if (!item || qty <= 0) throw new Error("Invalid item or quantity.");
  if (Number(item.Inventory || 0) < qty) throw new Error("Not enough inventory.");
  const total = Number(item.Price || 0) * qty;
  if (Number(s.Balance || 0) < total) throw new Error("Not enough balance.");
  const starting = Number(s.Balance || 0);
  s.Balance = Number((starting - total).toFixed(2));
  item.Inventory = Number(item.Inventory || 0) - qty;
  state.transactions.push({Timestamp: nowStamp(), Date: todayStamp(), Card_ID:s.Card_ID, Student_Name:s.Student_Name, Mode:"STORE_PURCHASE", Amount:total, Starting_Balance:starting, Ending_Balance:s.Balance, Item_ID:item.Item_ID, Item_Name:item.Item_Name, Note:`Purchased ${qty} × ${item.Item_Name}`, Status:"Success"});
  saveState();
  return { ok: true, message: "Purchase completed." };
}

function renderPortfolio() {
  const card = normalizeCardId(selectedCard());
  updatePortfolioMarketValues(card);
  const rows = state.portfolio.filter(p => normalizeCardId(p.Card_ID) === card && Number(p.Shares_Owned || 0) > 0);
  const marketValue = sum(rows, "Market Value");
  const gainLoss = sum(rows, "Unrealized Gain/Loss");
  document.getElementById("portfolio").innerHTML = `
    <div class="grid cols-3">
      ${metric("Holdings", rows.length, "Active positions")}
      ${metric("Market Value", money(marketValue), "Current portfolio")}
      ${metric("Unrealized Gain/Loss", money(gainLoss), gainLoss >= 0 ? "Positive" : "Negative")}
    </div>
    <div class="card" style="margin-top:16px;"><h2>Portfolio Positions</h2>${table(rows, ["Ticker", "Shares_Owned", "Avg_Buy_Price", "Current Price", "Market Value", "Unrealized Gain/Loss", "Last_Updated"], "No stock portfolio found.")}</div>`;
}

function renderTrade() {
  const card = normalizeCardId(selectedCard());
  const marketRows = state.market.filter(m => String(m.Active).toLowerCase() === "yes");
  const stockTx = state.transactions.filter(t => normalizeCardId(t.Card_ID) === card && String(t.Mode || "").startsWith("STOCK_")).slice(-10).reverse();
  document.getElementById("trade").innerHTML = `
    <div class="market-ticker">${marketRows.slice(0,24).map(m => `<div class="ticker-pill"><strong>${sanitize(m.Ticker)}</strong> ${money(m.Current_Price)} <span class="${Number(m.Change_Amount)>=0?'positive':'negative'}">${Number(m.Change_Amount)>=0?'+':''}${num(m.Change_Amount)}</span></div>`).join("")}</div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-title-row"><h2>Submit Stock Trade</h2><span class="badge ${can('STOCK_TRADE') ? 'good' : 'bad'}">${can('STOCK_TRADE') ? 'Write allowed' : 'No write permission'}</span></div>
        <div class="form-grid">
          <label><span class="field-label">Action</span><select id="tradeAction"><option>BUY</option><option>SELL</option></select></label>
          <label><span class="field-label">Ticker</span><select id="tradeTicker">${marketRows.map(m => `<option value="${sanitize(m.Ticker)}">${sanitize(m.Ticker)} · ${sanitize(m.Company_Name)} · ${money(m.Current_Price)}</option>`).join("")}</select></label>
          <label class="span-2"><span class="field-label">Shares</span><input id="tradeShares" type="number" min="1" value="1" /></label>
          <button class="primary-btn span-2" type="button" ${can('STOCK_TRADE') ? '' : 'disabled'} onclick="submitTrade()">Submit Trade</button>
        </div>
        <div id="tradeStatus" class="status-box">Trades submit as your logged-in Card ID only.</div>
      </div>
      <div class="card"><h2>Your Recent Stock Activity</h2>${table(stockTx, ["Timestamp", "Mode", "Item_ID", "Item_Name", "Amount", "Ending_Balance", "Status"], "No stock activity yet.")}</div>
    </div>
    <div class="card" style="margin-top:16px;"><h2>Live Market</h2>${table(marketRows.slice(0,40), ["Ticker", "Company_Name", "Sector", "Current_Price", "Change_%", "Change_Amount", "Trend", "Asset_Type"], "No market data.")}</div>`;
}

async function submitTrade() {
  const status = document.getElementById("tradeStatus");
  try {
    requirePermission("STOCK_TRADE");
    const tradeAction = document.getElementById("tradeAction").value;
    const ticker = document.getElementById("tradeTicker").value;
    const shares = Number(document.getElementById("tradeShares").value || 0);
    await submitAction("STOCK_TRADE", { tradeAction, ticker, shares }, () => localStockTrade(tradeAction, ticker, shares));
    showStatus(status, true, "Trade submitted.");
    renderTrade();
    updateIdentity();
  } catch (err) {
    showStatus(status, false, err.message);
  }
}

function localStockTrade(action, ticker, shares) {
  const s = selectedStudent();
  const market = state.market.find(m => String(m.Ticker) === String(ticker));
  if (!market || shares <= 0) throw new Error("Invalid trade.");
  const price = Number(market.Current_Price || 0);
  const total = Number((price * shares).toFixed(2));
  let position = state.portfolio.find(p => normalizeCardId(p.Card_ID) === normalizeCardId(s.Card_ID) && p.Ticker === ticker);
  const starting = Number(s.Balance || 0);

  if (action === "BUY") {
    if (starting < total) throw new Error("Not enough balance for this trade.");
    s.Balance = Number((starting - total).toFixed(2));
    if (!position) {
      position = {Card_ID:s.Card_ID, Student_Name:s.Student_Name, Ticker:ticker, Shares_Owned:0, Avg_Buy_Price:price, Total_Cost:0, "Current Price":price, "Market Value":0, "Unrealized Gain/Loss":0, Last_Updated:nowStamp()};
      state.portfolio.push(position);
    }
    const oldShares = Number(position.Shares_Owned || 0);
    const oldCost = Number(position.Total_Cost || 0);
    position.Shares_Owned = oldShares + shares;
    position.Total_Cost = Number((oldCost + total).toFixed(2));
    position.Avg_Buy_Price = Number((position.Total_Cost / position.Shares_Owned).toFixed(2));
  } else {
    if (!position || Number(position.Shares_Owned || 0) < shares) throw new Error("Not enough shares to sell.");
    position.Shares_Owned = Number(position.Shares_Owned) - shares;
    s.Balance = Number((starting + total).toFixed(2));
    position.Total_Cost = Number((position.Avg_Buy_Price * position.Shares_Owned).toFixed(2));
  }
  position["Current Price"] = price;
  position["Market Value"] = Number((Number(position.Shares_Owned || 0) * price).toFixed(2));
  position["Unrealized Gain/Loss"] = Number((position["Market Value"] - Number(position.Total_Cost || 0)).toFixed(2));
  position.Last_Updated = nowStamp();

  state.transactions.push({Timestamp: nowStamp(), Date: todayStamp(), Card_ID:s.Card_ID, Student_Name:s.Student_Name, Mode:`STOCK_${action}`, Amount:total, Starting_Balance:starting, Ending_Balance:s.Balance, Item_ID:ticker, Item_Name:market.Company_Name, Note:`${action} ${shares} shares @ ${money(price)}`, Status:"Success"});
  saveState();
  return { ok: true, message: "Trade completed." };
}

function renderStockProfile() {
  const rows = state.market.filter(m => String(m.Active).toLowerCase() === "yes");
  const defaultTicker = rows[0]?.Ticker || "";
  document.getElementById("stockProfile").innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <label><span class="field-label">Choose Ticker</span><select id="stockProfileTicker" onchange="renderStockProfileDetail()">${rows.map(m => `<option value="${sanitize(m.Ticker)}">${sanitize(m.Ticker)} · ${sanitize(m.Company_Name)}</option>`).join("")}</select></label>
    </div>
    <div id="stockProfileDetail"></div>`;
  document.getElementById("stockProfileTicker").value = defaultTicker;
  renderStockProfileDetail();
}

function renderStockProfileDetail() {
  const ticker = document.getElementById("stockProfileTicker")?.value;
  const m = state.market.find(x => x.Ticker === ticker) || state.market[0];
  if (!m) return;
  const n = state.news.filter(x => x.Ticker === m.Ticker).slice(0,5);
  const f = state.financials.find(x => x.Ticker === m.Ticker) || {};
  document.getElementById("stockProfileDetail").innerHTML = `
    <div class="stock-hero">
      <div class="card">
        <div class="eyebrow">${sanitize(m.Sector)} · ${sanitize(m.Asset_Type)}</div>
        <h2>${sanitize(m.Company_Name)} <span class="badge">${sanitize(m.Ticker)}</span></h2>
        <div class="large-price">${money(m.Current_Price)}</div>
        <div class="${Number(m.Change_Amount)>=0?'positive':'negative'}">${Number(m.Change_Amount)>=0?'+':''}${num(m.Change_Amount)} (${percent(m["Change_%"])})</div>
        <div class="mini-list" style="margin-top:14px;">${mini("Trend", m.Trend)}${mini("Volatility", m.Volatility)}${mini("Last Updated", m.Last_Updated)}</div>
      </div>
      <div class="card"><h2>Financials</h2><div class="mini-list">${mini("Revenue", money(f.Revenue))}${mini("Profit", money(f.Profit))}${mini("Debt", money(f.Debt))}${mini("Cash", money(f.Cash))}${mini("Risk", f.Risk_Rating || "")}</div></div>
    </div>
    <div class="card" style="margin-top:16px;"><h2>Latest News</h2>${table(n, ["Timestamp", "Headline", "Impact_Type", "Price_Impact_%", "Status"], "No stock news.")}</div>`;
}

function renderRating() {
  const card = normalizeCardId(selectedCard());
  const marketRows = state.market.filter(m => String(m.Active).toLowerCase() === "yes");
  const ratings = (state.ratings || []).filter(r => normalizeCardId(r.Card_ID) === card).slice(-12).reverse();
  document.getElementById("rating").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row"><h2>Submit Analyst Rating</h2><span class="badge ${can('ANALYST_RATING') ? 'good' : 'bad'}">${can('ANALYST_RATING') ? 'Write allowed' : 'No write permission'}</span></div>
        <div class="form-grid">
          <label><span class="field-label">Ticker</span><select id="ratingTicker">${marketRows.map(m => `<option value="${sanitize(m.Ticker)}">${sanitize(m.Ticker)} · ${sanitize(m.Company_Name)}</option>`).join("")}</select></label>
          <label><span class="field-label">Rating</span><select id="ratingValue"><option>Buy</option><option>Hold</option><option>Sell</option></select></label>
          <label class="span-2"><span class="field-label">Target Price</span><input id="targetPrice" type="number" min="0" step="0.01" placeholder="Example: 125.00" /></label>
          <label class="span-2"><span class="field-label">Reason</span><textarea id="ratingReason" rows="4" placeholder="Explain your reasoning..."></textarea></label>
          <button class="primary-btn span-2" type="button" ${can('ANALYST_RATING') ? '' : 'disabled'} onclick="submitRating()">Submit Rating</button>
        </div>
        <div id="ratingStatus" class="status-box">Ratings submit as your logged-in Card ID only.</div>
      </div>
      <div class="card"><h2>Your Rating History</h2>${table(ratings, ["Timestamp", "Ticker", "Rating", "Target_Price", "Reason", "Status"], "No submitted ratings yet.")}</div>
    </div>`;
}

async function submitRating() {
  const status = document.getElementById("ratingStatus");
  try {
    requirePermission("ANALYST_RATING");
    const ticker = document.getElementById("ratingTicker").value;
    const rating = document.getElementById("ratingValue").value;
    const targetPrice = Number(document.getElementById("targetPrice").value || 0);
    const reason = document.getElementById("ratingReason").value.trim();
    await submitAction("ANALYST_RATING", { ticker, rating, targetPrice, reason }, () => localRating(ticker, rating, targetPrice, reason));
    showStatus(status, true, "Rating submitted.");
    renderRating();
  } catch (err) {
    showStatus(status, false, err.message);
  }
}

function localRating(ticker, rating, targetPrice, reason) {
  const s = selectedStudent();
  if (!ticker || !rating || !targetPrice || !reason) throw new Error("Ticker, rating, target price, and reason are required.");
  state.ratings = state.ratings || [];
  state.ratings.push({ Timestamp: nowStamp(), Card_ID: s.Card_ID, Student_Name: s.Student_Name, Ticker: ticker, Rating: rating, Target_Price: targetPrice, Reason: reason, Status: "Submitted" });
  saveState();
  return { ok: true, message: "Rating submitted." };
}

async function submitAction(action, payload, localHandler) {
  requirePermission(action);
  const cardId = selectedCard();
  if (!cardId) throw new Error("You are not logged in.");

  if (!API_URL) return localHandler();

  const result = await callApi({
    action,
    sessionToken: currentSession.token,
    payload
  });
  if (!result.ok) throw new Error(result.message || "Action failed.");
  if (result.snapshot) mergeSnapshot(result.snapshot);
  return result;
}

async function callApi(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  return await res.json();
}

function mergeSnapshot(snapshot) {
  state = { ...state, ...snapshot };
  state.ratings = state.ratings || [];
  saveState();
}

function updatePortfolioMarketValues(card) {
  state.portfolio.filter(p => normalizeCardId(p.Card_ID) === card).forEach(p => {
    const m = state.market.find(x => x.Ticker === p.Ticker);
    if (!m) return;
    const price = Number(m.Current_Price || 0);
    p["Current Price"] = price;
    p["Market Value"] = Number((Number(p.Shares_Owned || 0) * price).toFixed(2));
    p["Unrealized Gain/Loss"] = Number((Number(p["Market Value"] || 0) - Number(p.Total_Cost || 0)).toFixed(2));
  });
}

function metric(label, value, note) { return `<div class="metric"><div class="label">${sanitize(label)}</div><div class="value">${sanitize(value)}</div><div class="note">${sanitize(note || "")}</div></div>`; }
function mini(label, value) { return `<div class="mini-row"><span>${sanitize(label)}</span><strong>${sanitize(value ?? "")}</strong></div>`; }
function sum(rows, key) { return rows.reduce((a,r) => a + Number(r[key] || 0), 0); }
function showStatus(el, ok, message) { el.className = `status-box ${ok ? "ok" : "bad"}`; el.textContent = message; }
function table(rows, cols, empty) {
  if (!rows || !rows.length) return `<div class="empty">${sanitize(empty)}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${labelize(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${formatValue(c, r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function labelize(c) { return sanitize(String(c).replaceAll("_", " ")); }
function formatValue(k,v) {
  if (v === undefined || v === null || v === "") return "";
  if (/amount|balance|price|cost|spent|value|debt|cash|revenue|profit/i.test(k)) return sanitize(money(v));
  if (/change_%|impact_%|growth_rate/i.test(k)) return sanitize(percent(v));
  if (/gain\/loss/i.test(k)) {
    const cls = Number(v) >= 0 ? "positive" : "negative";
    return `<span class="${cls}">${sanitize(money(v))}</span>`;
  }
  if (/change_amount/i.test(k)) {
    const cls = Number(v) >= 0 ? "positive" : "negative";
    return `<span class="${cls}">${Number(v) >= 0 ? "+" : ""}${sanitize(num(v))}</span>`;
  }
  if (/status/i.test(k)) {
    const text = String(v);
    const cls = text.toLowerCase().includes("success") || text.toLowerCase().includes("present") || text.toLowerCase().includes("submitted") ? "good" : "";
    return `<span class="badge ${cls}">${sanitize(v)}</span>`;
  }
  return sanitize(v);
}
