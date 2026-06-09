const API_URL = ""; // Optional: paste your deployed Apps Script Web App URL here later.
const state = loadState();

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
  hydrateCardSelect();
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.getElementById("globalCardId").addEventListener("change", renderCurrentView);
  renderCurrentView();
}

function loadState() {
  const saved = localStorage.getItem("classroomEconomyState");
  if (saved) return JSON.parse(saved);
  return structuredClone(window.SEED_DATA);
}
function saveState() { localStorage.setItem("classroomEconomyState", JSON.stringify(state)); }
function money(v) { return Number(v || 0).toLocaleString(undefined, {style:"currency", currency:"USD"}); }
function num(v, d=2) { return Number(v || 0).toLocaleString(undefined, {maximumFractionDigits:d, minimumFractionDigits:d}); }
function percent(v) { return `${(Number(v || 0)*100).toFixed(2)}%`; }
function nowStamp() { return new Date().toISOString().slice(0,16).replace("T", " "); }
function selectedCard() { return document.getElementById("globalCardId").value; }
function selectedStudent() { return state.students.find(s => String(s.Card_ID) === String(selectedCard())) || state.students[0]; }
function sanitize(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

function hydrateCardSelect() {
  const select = document.getElementById("globalCardId");
  select.innerHTML = state.students.map(s => `<option value="${sanitize(s.Card_ID)}">${sanitize(s.Student_Name)} · ${sanitize(s.Card_ID)}</option>`).join("");
}

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === view));
  document.getElementById("pageTitle").textContent = views[view];
  renderCurrentView();
}
function currentView() { return document.querySelector(".view.active").id; }
function renderCurrentView() {
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
  const card = String(s.Card_ID);
  const tx = state.transactions.filter(t => String(t.Card_ID) === card && t.Status === "Success").slice(-10).reverse();
  const att = state.attendance.filter(a => String(a.Card_ID) === card).slice(-8).reverse();
  const purchases = state.transactions.filter(t => String(t.Card_ID) === card && t.Mode === "STORE_PURCHASE").slice(-8).reverse();
  const totalDeposits = sum(state.transactions.filter(t => String(t.Card_ID) === card && t.Mode === "DEPOSIT"), "Amount");
  const totalRewards = sum(state.transactions.filter(t => String(t.Card_ID) === card && t.Mode === "REWARD"), "Amount");
  const totalFines = sum(state.transactions.filter(t => String(t.Card_ID) === card && t.Mode === "FINE"), "Amount");
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
        <h2>Student Details</h2>
        <div class="mini-list">
          ${mini("Name", s.Student_Name)}${mini("Grade", s.Grade)}${mini("Homeroom", s.Homeroom)}${mini("Job", s.Job_Title || "No job assigned")}
          ${mini("Deposits", money(totalDeposits))}${mini("Fines", money(totalFines))}
        </div>
      </div>
      <div class="card">
        <h2>Recent Attendance</h2>
        ${table(att, ["Timestamp", "Status", "Check_In_Time", "Note"], "No attendance records yet.")}
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card"><h2>Recent Transactions</h2>${table(tx, ["Timestamp", "Mode", "Amount", "Ending_Balance", "Note"], "No transactions yet.")}</div>
      <div class="card"><h2>Purchase History</h2>${table(purchases, ["Timestamp", "Item_Name", "Amount", "Ending_Balance", "Note"], "No purchases yet.")}</div>
    </div>`;
}

function renderStore() {
  const items = state.storeItems.filter(i => String(i.Active).toLowerCase() === "yes");
  document.getElementById("store").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h2>Purchase Item</h2>
        <div class="form-grid">
          <label><span class="field-label">Item</span><select id="storeItem">${items.map(i => `<option value="${i.Item_ID}">${sanitize(i.Item_Name)} · ${money(i.Price)} · Stock ${i.Inventory}</option>`).join("")}</select></label>
          <label><span class="field-label">Quantity</span><input id="storeQty" type="number" min="1" value="1" /></label>
          <button class="primary-btn span-2" onclick="purchaseItem()">Purchase</button>
        </div>
        <div id="storeStatus" class="status-box">Select an item and submit. This replaces the shared Sheet kiosk cells with a user-safe interface.</div>
      </div>
      <div class="card">
        <div class="card-title-row"><h2>Available Store Items</h2><span class="badge">${items.length} active</span></div>
        ${table(items, ["Item_ID", "Item_Name", "Price", "Inventory", "Category", "Description"], "No store items.")}
      </div>
    </div>`;
}

function purchaseItem() {
  const s = selectedStudent();
  const itemId = document.getElementById("storeItem").value;
  const qty = Number(document.getElementById("storeQty").value || 1);
  const item = state.storeItems.find(i => String(i.Item_ID) === String(itemId));
  const status = document.getElementById("storeStatus");
  if (!item || qty <= 0) return showStatus(status, false, "Invalid item or quantity.");
  if (Number(item.Inventory || 0) < qty) return showStatus(status, false, "Not enough inventory.");
  const total = Number(item.Price || 0) * qty;
  if (Number(s.Balance || 0) < total) return showStatus(status, false, "Not enough balance.");
  const starting = Number(s.Balance || 0);
  s.Balance = Number((starting - total).toFixed(2));
  item.Inventory = Number(item.Inventory || 0) - qty;
  state.transactions.push({Timestamp: nowStamp(), Date: nowStamp().slice(0,10), Card_ID:s.Card_ID, Student_Name:s.Student_Name, Mode:"STORE_PURCHASE", Amount:total, Starting_Balance:starting, Ending_Balance:s.Balance, Item_ID:item.Item_ID, Item_Name:item.Item_Name, Note:`Purchased ${qty} × ${item.Item_Name}`, Status:"Success"});
  saveState();
  showStatus(status, true, `Purchase completed. New balance: ${money(s.Balance)}.`);
  renderStore();
}

function renderPortfolio() {
  const card = String(selectedCard());
  const rows = state.portfolio.filter(p => String(p.Card_ID) === card && Number(p.Shares_Owned || 0) > 0);
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
  const marketRows = state.market.filter(m => String(m.Active).toLowerCase() === "yes");
  document.getElementById("trade").innerHTML = `
    <div class="market-ticker">${marketRows.slice(0,24).map(m => `<div class="ticker-pill"><strong>${sanitize(m.Ticker)}</strong> ${money(m.Current_Price)} <span class="${Number(m.Change_Amount)>=0?'positive':'negative'}">${Number(m.Change_Amount)>=0?'+':''}${num(m.Change_Amount)}</span></div>`).join("")}</div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <h2>Submit Stock Trade</h2>
        <div class="form-grid">
          <label><span class="field-label">Action</span><select id="tradeAction"><option>BUY</option><option>SELL</option></select></label>
          <label><span class="field-label">Ticker</span><select id="tradeTicker">${marketRows.map(m => `<option value="${m.Ticker}">${m.Ticker} · ${sanitize(m.Company_Name)} · ${money(m.Current_Price)}</option>`).join("")}</select></label>
          <label class="span-2"><span class="field-label">Shares</span><input id="tradeShares" type="number" min="1" value="1" /></label>
          <button class="primary-btn span-2" onclick="submitTrade()">Submit Trade</button>
        </div>
        <div id="tradeStatus" class="status-box">Trades update the mock portfolio locally. Backend endpoint can replace this function later.</div>
      </div>
      <div class="card"><h2>Live Market</h2>${table(marketRows.slice(0,40), ["Ticker", "Company_Name", "Sector", "Current_Price", "Change_%", "Change_Amount", "Trend", "Asset_Type"], "No market data.")}</div>
    </div>`;
}

function submitTrade() {
  const s = selectedStudent();
  const action = document.getElementById("tradeAction").value;
  const ticker = document.getElementById("tradeTicker").value;
  const shares = Number(document.getElementById("tradeShares").value || 0);
  const market = state.market.find(m => m.Ticker === ticker);
  const status = document.getElementById("tradeStatus");
  if (!market || shares <= 0) return showStatus(status, false, "Invalid trade.");
  const price = Number(market.Current_Price || 0);
  const total = Number((price * shares).toFixed(2));
  let position = state.portfolio.find(p => String(p.Card_ID) === String(s.Card_ID) && p.Ticker === ticker);
  if (action === "BUY") {
    if (Number(s.Balance || 0) < total) return showStatus(status, false, "Not enough balance for this trade.");
    s.Balance = Number((Number(s.Balance || 0) - total).toFixed(2));
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
    if (!position || Number(position.Shares_Owned || 0) < shares) return showStatus(status, false, "Not enough shares to sell.");
    position.Shares_Owned = Number(position.Shares_Owned) - shares;
    s.Balance = Number((Number(s.Balance || 0) + total).toFixed(2));
    position.Total_Cost = Number((position.Avg_Buy_Price * position.Shares_Owned).toFixed(2));
  }
  position["Current Price"] = price;
  position["Market Value"] = Number((price * Number(position.Shares_Owned || 0)).toFixed(2));
  position["Unrealized Gain/Loss"] = Number((position["Market Value"] - Number(position.Total_Cost || 0)).toFixed(2));
  position.Last_Updated = nowStamp();
  state.transactions.push({Timestamp: nowStamp(), Date: nowStamp().slice(0,10), Card_ID:s.Card_ID, Student_Name:s.Student_Name, Mode:`STOCK_${action}`, Amount:total, Starting_Balance:"", Ending_Balance:s.Balance, Item_ID:ticker, Item_Name:market.Company_Name, Note:`${action} ${shares} shares of ${ticker}`, Status:"Success"});
  saveState();
  showStatus(status, true, `${s.Student_Name} ${action.toLowerCase()} ${shares} shares of ${ticker}. New balance: ${money(s.Balance)}.`);
}

function renderStockProfile() {
  const rows = state.market.filter(m => String(m.Active).toLowerCase() === "yes");
  const defaultTicker = rows[0]?.Ticker || "";
  document.getElementById("stockProfile").innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <label><span class="field-label">Enter Ticker</span><select id="stockProfileTicker" onchange="renderStockProfileDetail()">${rows.map(m => `<option value="${m.Ticker}">${m.Ticker} · ${sanitize(m.Company_Name)}</option>`).join("")}</select></label>
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
  const marketRows = state.market.filter(m => String(m.Active).toLowerCase() === "yes");
  document.getElementById("rating").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h2>Submit Analyst Rating</h2>
        <div class="form-grid">
          <label><span class="field-label">Ticker</span><select id="ratingTicker">${marketRows.map(m => `<option value="${m.Ticker}">${m.Ticker} · ${sanitize(m.Company_Name)}</option>`).join("")}</select></label>
          <label><span class="field-label">Rating</span><select id="ratingValue"><option>Buy</option><option>Hold</option><option>Sell</option></select></label>
          <label class="span-2"><span class="field-label">Target Price</span><input id="targetPrice" type="number" min="0" step="0.01" placeholder="Example: 125.00" /></label>
          <label class="span-2"><span class="field-label">Reason</span><textarea id="ratingReason" rows="4" placeholder="Explain your reasoning..."></textarea></label>
          <button class="primary-btn span-2" onclick="submitRating()">Submit Rating</button>
        </div>
        <div id="ratingStatus" class="status-box">Ratings can later be sent to Apps Script and stored in the Stock_Ratings sheet.</div>
      </div>
      <div class="card"><h2>How this maps to your Sheet</h2><div class="mini-list">${mini("Student Card ID", "Uses selected profile card")}${mini("Ticker", "Stock_Rating_Submit!B4")}${mini("Rating", "Stock_Rating_Submit!B5")}${mini("Target Price", "Stock_Rating_Submit!B6")}${mini("Reason", "Stock_Rating_Submit!B7")}</div></div>
    </div>`;
}
function submitRating() {
  const ticker = document.getElementById("ratingTicker").value;
  const rating = document.getElementById("ratingValue").value;
  const target = Number(document.getElementById("targetPrice").value || 0);
  const reason = document.getElementById("ratingReason").value.trim();
  const status = document.getElementById("ratingStatus");
  if (!ticker || !rating || !target || !reason) return showStatus(status, false, "Card ID, ticker, rating, target price, and reason are required.");
  showStatus(status, true, `Rating submitted: ${rating} ${ticker} at target ${money(target)}.`);
}

function metric(label, value, note) { return `<div class="metric"><div class="label">${sanitize(label)}</div><div class="value">${sanitize(value)}</div><div class="note">${sanitize(note || "")}</div></div>`; }
function mini(label, value) { return `<div class="mini-row"><span>${sanitize(label)}</span><strong>${sanitize(value ?? "")}</strong></div>`; }
function sum(rows, key) { return rows.reduce((a,r) => a + Number(r[key] || 0), 0); }
function showStatus(el, ok, message) { el.className = `status-box ${ok ? "ok" : "bad"}`; el.textContent = message; }
function table(rows, cols, empty) {
  if (!rows || !rows.length) return `<div class="empty">${empty}</div>`;
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
  if (/status/i.test(k)) return `<span class="badge ${String(v).toLowerCase().includes("success") || String(v).toLowerCase().includes("present") ? "good" : ""}">${sanitize(v)}</span>`;
  return sanitize(v);
}
