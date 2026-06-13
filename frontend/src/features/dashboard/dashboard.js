window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.dashboard = window.Econovaria.features.dashboard || {};

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

Object.assign(window.Econovaria.features.dashboard, { renderProfile });
