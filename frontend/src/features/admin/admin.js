window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.admin = window.Econovaria.features.admin || {};

function renderAdminDashboard() {
  const el = document.getElementById("admin");
  if (!el) return;

  const storeCount = (state.store || []).length;
  const marketCount = (state.market || []).length;
  const portfolioCount = (state.portfolio || []).length;
  const forecastCount = (state.ratings || []).length;
  const newsCount = (state.news || []).length;

  el.innerHTML = `
    <div class="admin-page">
      <section class="admin-hero card">
        <div>
          <div class="eyebrow">Teacher console</div>
          <h2>Admin prototype</h2>
          <p>This frontend-only page is a safe placeholder for future teacher tools. No backend admin actions are wired yet.</p>
        </div>
        <span class="badge warn">Prototype access</span>
      </section>

      <div class="grid cols-4 admin-metrics">
        ${metric("Store Items", storeCount, "Loaded from current snapshot")}
        ${metric("Market Assets", marketCount, "Visible to students")}
        ${metric("Portfolio Rows", portfolioCount, "Current session data")}
        ${metric("Forecasts", forecastCount, "Submitted ratings")}
      </div>

      <div class="grid cols-2 admin-grid">
        <section class="card admin-panel">
          <div class="card-title-row">
            <h2 class="card-title">Student Operations</h2>
            <span class="badge">Planned</span>
          </div>
          <p class="help-text">Future controls for student lookup, balance review, attendance verification, and account adjustments.</p>
          <div class="admin-action-grid">
            <button class="ghost-btn" type="button" disabled>Find student</button>
            <button class="ghost-btn" type="button" disabled>Review balance</button>
            <button class="ghost-btn" type="button" disabled>Adjust account</button>
            <button class="ghost-btn" type="button" disabled>Attendance tools</button>
          </div>
        </section>

        <section class="card admin-panel">
          <div class="card-title-row">
            <h2 class="card-title">Economy Controls</h2>
            <span class="badge">Planned</span>
          </div>
          <p class="help-text">Future controls for store inventory, market schedule, event shocks, classroom jobs, and round settings.</p>
          <div class="admin-action-grid">
            <button class="ghost-btn" type="button" disabled>Store manager</button>
            <button class="ghost-btn" type="button" disabled>Market settings</button>
            <button class="ghost-btn" type="button" disabled>Event controls</button>
            <button class="ghost-btn" type="button" disabled>Export reports</button>
          </div>
        </section>
      </div>

      <section class="card admin-panel">
        <div class="card-title-row">
          <h2 class="card-title">Backend Wiring Status</h2>
          <span class="badge bad">Not connected</span>
        </div>
        <div class="admin-status-list">
          ${adminStatus("Admin login", "Frontend prototype only", "warn")}
          ${adminStatus("Teacher code", "Temporary code: 1234", "warn")}
          ${adminStatus("Backend role check", "Not wired yet", "bad")}
          ${adminStatus("Admin actions", "Disabled until backend permissions exist", "bad")}
          ${adminStatus("News rows", String(newsCount), "good")}
        </div>
      </section>
    </div>`;
}

function adminStatus(label, value, tone) {
  return `
    <div class="admin-status-row">
      <span>${sanitize(label)}</span>
      <strong class="${sanitize(tone || "")}">${sanitize(value)}</strong>
    </div>`;
}

window.renderAdminDashboard = renderAdminDashboard;

Object.assign(window.Econovaria.features.admin, {
  renderAdminDashboard,
  adminStatus
});
