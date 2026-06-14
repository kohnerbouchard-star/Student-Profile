window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.admin = window.Econovaria.features.admin || {};

const ADMIN_SECTIONS = [
  "Dashboard",
  "Players",
  "Attendance",
  "Store",
  "Market",
  "Reports",
  "Settings"
];

const DIFFICULTY_PRESETS = [
  "Beginner",
  "Standard",
  "Competitive",
  "Advanced",
  "Chaos Mode",
  "Custom"
];

const ADVANCED_SETTING_GROUPS = [
  "Economy",
  "Attendance",
  "Store",
  "Stock Market",
  "Assets",
  "Stock History",
  "News & Events",
  "Analyst Center",
  "Reports",
  "Security"
];

let activeAdminSection = "Dashboard";

function renderAdminDashboard() {
  const el = document.getElementById("admin");
  if (!el) return;

  if (!ADMIN_SECTIONS.includes(activeAdminSection)) {
    activeAdminSection = "Dashboard";
  }

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
          <h2>Admin Console</h2>
          <p>Frontend-only controls for monitoring the classroom economy. Backend admin actions are intentionally stubbed until permissions exist.</p>
        </div>
        <span class="badge warn">Prototype access</span>
      </section>

      <nav class="admin-tabs" aria-label="Admin console sections">
        ${ADMIN_SECTIONS.map(adminTab).join("")}
      </nav>

      <div class="admin-section" data-current-admin-section="${sanitize(activeAdminSection)}">
        ${renderAdminSection(activeAdminSection, { storeCount, marketCount, portfolioCount, forecastCount, newsCount })}
      </div>
    </div>`;

  bindAdminTabs(el);
}

function adminTab(section) {
  const isActive = section === activeAdminSection;

  return `
    <button class="admin-tab${isActive ? " active" : ""}" type="button" data-admin-section="${sanitize(section)}" aria-pressed="${String(isActive)}">
      ${sanitize(section)}
    </button>`;
}

function bindAdminTabs(root) {
  root.querySelectorAll("[data-admin-section]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAdminSection = button.dataset.adminSection || "Dashboard";
      renderAdminDashboard();
    });
  });
}

function renderAdminSection(section, counts) {
  if (section === "Players") return renderPlayersSection();
  if (section === "Attendance") return renderPlaceholderSection("Attendance", "Verify attendance, streaks, and participation adjustments.", ["Attendance review", "Streak audit", "Participation notes"]);
  if (section === "Store") return renderPlaceholderSection("Store", "Manage classroom store inventory, item visibility, and purchase windows.", ["Inventory review", "Price updates", "Purchase window"]);
  if (section === "Market") return renderPlaceholderSection("Market", "Configure market status, assets, stock history, news, and event timing.", ["Market status", "Asset controls", "News & events"]);
  if (section === "Reports") return renderPlaceholderSection("Reports", "Export classroom summaries and review balances, trades, attendance, and forecasts.", ["Balance report", "Trading report", "Forecast report"]);
  if (section === "Settings") return renderSettingsSection();
  return renderDashboardSection(counts);
}

function renderDashboardSection({ storeCount, marketCount, portfolioCount, forecastCount, newsCount }) {
  return `
    <div class="grid cols-4 admin-metrics">
      ${metric("Store Items", storeCount, "Loaded from snapshot")}
      ${metric("Market Assets", marketCount, "Visible to students")}
      ${metric("Portfolio Rows", portfolioCount, "Current session data")}
      ${metric("Forecasts", forecastCount, "Submitted ratings")}
    </div>

    <div class="grid cols-2 admin-grid">
      ${adminPanel("Player Operations", "Players now contains roster tools, balance adjustments, access codes, and lock controls.", [
        adminButton("Open Players", "primary", false, "Players"),
        adminButton("Review access status", "secondary", true),
        adminButton("Balance audit", "secondary", true),
        adminButton("Bulk import/export", "secondary", true)
      ])}
      ${adminPanel("Simulation Controls", "Advanced configuration is grouped under Settings so the main console stays readable.", [
        adminButton("Difficulty preset", "primary", false, "Settings"),
        adminButton("Market controls", "secondary", true),
        adminButton("Store manager", "secondary", true),
        adminButton("Export reports", "secondary", true)
      ])}
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
    </section>`;
}

function renderPlayersSection() {
  const player = state.profile || {};

  return `
    <div class="grid cols-2 admin-grid">
      <section class="card admin-panel">
        <div class="card-title-row">
          <h2 class="card-title">Player List</h2>
          <span class="badge">Snapshot</span>
        </div>
        <p class="help-text">Roster data is not available in the current frontend admin snapshot. No hidden access values are displayed.</p>
        <div class="admin-player-preview">
          <span>${sanitize(player.name || "No player selected")}</span>
          <strong>${sanitize(player.grade ? `Grade ${player.grade}` : "Frontend demo")}</strong>
        </div>
        <div class="admin-action-grid">
          ${adminButton("Add Player", "primary", true)}
          ${adminButton("Edit Player Profile", "secondary", true)}
          ${adminButton("Remove / Deactivate Player", "danger", true)}
          ${adminButton("Bulk Import / Export", "secondary", true)}
        </div>
      </section>

      <section class="card admin-panel">
        <div class="card-title-row">
          <h2 class="card-title">Account Controls</h2>
          <span class="badge warn">Stubbed</span>
        </div>
        <p class="help-text">Balance and lock actions need backend admin authorization. The controls are visible here but disabled.</p>
        <div class="admin-action-grid">
          ${adminButton("Balance Adjustment", "warning", true)}
          ${adminButton("Lock Player", "danger", true)}
          ${adminButton("Unlock Player", "success", true)}
          ${adminButton("View Player Status", "secondary", true)}
        </div>
      </section>
    </div>

    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Access Code Management</h2>
        <span class="badge bad">Sensitive values hidden</span>
      </div>
      <p class="help-text">Generate, reset, lock, and unlock player access from the Players tab. Raw passwords and hidden access-code values are never exposed in this UI.</p>
      <div class="admin-access-grid">
        ${adminAccessItem("Generate access code", "Create a new player login code without revealing raw secrets.", "primary")}
        ${adminAccessItem("Reset access code", "Invalidate the previous code and prepare a replacement.", "warning")}
        ${adminAccessItem("Lock player access", "Prevent sign-in for a selected player.", "danger")}
        ${adminAccessItem("Unlock player access", "Restore sign-in for a selected player.", "success")}
        ${adminAccessItem("View last login", "Not available in the current frontend snapshot.", "secondary")}
        ${adminAccessItem("Bulk generate codes", "Stubbed until backend support and permissions are available.", "secondary")}
      </div>
    </section>`;
}

function renderSettingsSection() {
  return `
    <div class="grid cols-2 admin-grid">
      <section class="card admin-panel">
        <div class="card-title-row">
          <h2 class="card-title">Difficulty Preset</h2>
          <span class="badge">Visible</span>
        </div>
        <div class="admin-preset-grid" role="group" aria-label="Difficulty presets">
          ${DIFFICULTY_PRESETS.map((preset, index) => `
            <label class="admin-preset-option">
              <input type="radio" name="difficultyPreset" ${index === 1 ? "checked" : ""} disabled />
              <span>${sanitize(preset)}</span>
            </label>
          `).join("")}
        </div>
      </section>

      <section class="card admin-panel">
        <div class="card-title-row">
          <h2 class="card-title">Basic Game Info</h2>
          <span class="badge warn">Stubbed</span>
        </div>
        <div class="form-grid">
          <label>
            <span class="field-label">Simulation Name</span>
            <input value="Classroom Economy" disabled />
          </label>
          <label>
            <span class="field-label">Class Status</span>
            <select disabled>
              <option>Active</option>
            </select>
          </label>
          <label class="span-2">
            <span class="field-label">Admin Note</span>
            <textarea rows="3" disabled placeholder="Teacher notes will appear here when backend settings exist."></textarea>
          </label>
        </div>
      </section>
    </div>

    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Advanced Settings</h2>
        <span class="badge">Grouped</span>
      </div>
      <p class="help-text">Detailed configuration lives here so the primary admin page remains focused.</p>
      <div class="admin-advanced-grid">
        ${ADVANCED_SETTING_GROUPS.map(adminAdvancedGroup).join("")}
      </div>
    </section>

    <section class="card admin-panel admin-danger-zone">
      <div class="card-title-row">
        <h2 class="card-title">Danger Zone</h2>
        <span class="badge bad">Destructive actions</span>
      </div>
      <p class="help-text">Reset and destructive actions are isolated here and disabled in the frontend prototype.</p>
      <div class="admin-action-grid">
        ${adminButton("Reset Simulation", "danger", true)}
        ${adminButton("Clear Market History", "danger", true)}
        ${adminButton("Reset Store Purchases", "danger", true)}
        ${adminButton("Deactivate All Players", "danger", true)}
      </div>
    </section>`;
}

function renderPlaceholderSection(title, description, actions) {
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">${sanitize(title)}</h2>
        <span class="badge warn">Frontend stub</span>
      </div>
      <p class="help-text">${sanitize(description)} Backend support is required before these controls can change data.</p>
      <div class="admin-action-grid">
        ${actions.map((action) => adminButton(action, "secondary", true)).join("")}
      </div>
    </section>`;
}

function adminPanel(title, description, buttons) {
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">${sanitize(title)}</h2>
        <span class="badge">Planned</span>
      </div>
      <p class="help-text">${sanitize(description)}</p>
      <div class="admin-action-grid">${buttons.join("")}</div>
    </section>`;
}

function adminAccessItem(title, description, tone) {
  return `
    <div class="admin-access-item">
      <div>
        <strong>${sanitize(title)}</strong>
        <p>${sanitize(description)}</p>
      </div>
      ${adminButton(title, tone, true)}
    </div>`;
}

function adminAdvancedGroup(group) {
  return `
    <details class="admin-advanced-group">
      <summary>${sanitize(group)}</summary>
      <p>TODO: Wire ${sanitize(group.toLowerCase())} settings when backend admin settings support exists.</p>
      <div class="admin-action-grid">
        ${adminButton("Review", "secondary", true)}
        ${adminButton("Save Changes", "primary", true)}
      </div>
    </details>`;
}

function adminButton(label, tone, disabled, targetSection) {
  const data = targetSection ? ` data-admin-section="${sanitize(targetSection)}"` : "";
  const disabledAttr = disabled ? " disabled" : "";

  return `<button class="admin-btn admin-btn--${sanitize(tone || "secondary")}" type="button"${disabledAttr}${data}>${sanitize(label)}</button>`;
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
