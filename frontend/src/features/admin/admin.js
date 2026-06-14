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
let activePlayerSettingsIndex = null;
let isAttendanceScannerOpen = false;
let lastAttendanceScan = "";
let attendanceScanTimer = null;
let adminPlayerRows = [
  { name: "Student 1", accessCode: "", status: "Active" },
  { name: "Student 2", accessCode: "", status: "Active" },
  { name: "Student 3", accessCode: "", status: "Active" },
  { name: "", accessCode: "", status: "Draft" }
];
let adminStoreRows = [
  { itemName: "Homework Pass", description: "One-use classroom reward item.", quantity: "10", price: "25", status: "Visible" },
  { itemName: "Market Hint", description: "Teacher-approved hint for the current market round.", quantity: "5", price: "40", status: "Visible" },
  { itemName: "", description: "", quantity: "", price: "", status: "Draft" }
];

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

      <div class="admin-console-shell">
        <nav class="admin-tabs" aria-label="Admin console sections">
          ${ADMIN_SECTIONS.map(adminTab).join("")}
        </nav>

        <div class="admin-section" data-current-admin-section="${sanitize(activeAdminSection)}">
          ${renderAdminSection(activeAdminSection, { storeCount, marketCount, portfolioCount, forecastCount, newsCount })}
        </div>
      </div>
    </div>`;

  bindAdminTabs(el);
  bindAdminPlayerControls(el);
  bindAttendanceScannerControls(el);
  bindAdminStoreControls(el);
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
  if (section === "Attendance") return renderAttendanceSection();
  if (section === "Store") return renderStoreSection();
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
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Player List</h2>
        <span class="badge warn">Local draft</span>
      </div>
      <p class="help-text">Type student names and draft access codes in the table. These rows are frontend-only until backend roster management exists.</p>
      <div class="admin-player-table-wrap">
        <table class="admin-player-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Access Code</th>
              <th>Status</th>
              <th class="admin-player-settings-col">Settings</th>
            </tr>
          </thead>
          <tbody>
            ${adminPlayerRows.map(adminPlayerRow).join("")}
          </tbody>
        </table>
      </div>
      <div class="admin-table-actions">
        <button class="admin-btn admin-btn--primary" type="button" data-admin-add-player-row>Add Player Row</button>
        ${adminButton("Bulk Import / Export", "secondary", true)}
      </div>
    </section>

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
    </section>

    ${renderPlayerSettingsPopup()}`;
}

function adminPlayerRow(player, index) {
  return `
    <tr>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Student name ${index + 1}</span>
          <input value="${sanitize(player.name)}" placeholder="Student name" data-admin-player-field="name" data-admin-player-index="${index}" autocomplete="off" />
        </label>
      </td>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Access code ${index + 1}</span>
          <input value="${sanitize(player.accessCode)}" placeholder="Access code" data-admin-player-field="accessCode" data-admin-player-index="${index}" autocomplete="off" />
        </label>
      </td>
      <td><span class="badge ${player.status === "Draft" ? "warn" : "good"}">${sanitize(player.status)}</span></td>
      <td class="admin-player-settings-col">
        <button class="admin-icon-btn" type="button" aria-label="Open settings for ${sanitize(player.name || `student ${index + 1}`)}" title="Student settings" data-admin-player-settings="${index}">&#9881;</button>
      </td>
    </tr>`;
}

function renderPlayerSettingsPopup() {
  if (activePlayerSettingsIndex === null) return "";

  const player = adminPlayerRows[activePlayerSettingsIndex] || {};
  const displayName = player.name || `Student ${activePlayerSettingsIndex + 1}`;

  return `
    <div class="admin-modal-backdrop" role="presentation" data-admin-close-player-settings>
      <section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminPlayerSettingsTitle">
        <div class="card-title-row">
          <div>
            <div class="eyebrow">Player settings</div>
            <h2 id="adminPlayerSettingsTitle" class="card-title">${sanitize(displayName)}</h2>
          </div>
          <button class="admin-icon-btn" type="button" aria-label="Close student settings" data-admin-close-player-settings>&#215;</button>
        </div>
        <div class="form-grid">
          <label>
            <span class="field-label">Student Name</span>
            <input value="${sanitize(player.name)}" data-admin-player-field="name" data-admin-player-index="${activePlayerSettingsIndex}" autocomplete="off" />
          </label>
          <label>
            <span class="field-label">Draft Access Code</span>
            <input value="${sanitize(player.accessCode)}" data-admin-player-field="accessCode" data-admin-player-index="${activePlayerSettingsIndex}" autocomplete="off" />
          </label>
          <label>
            <span class="field-label">Access Status</span>
            <select disabled>
              <option>${sanitize(player.status || "Draft")}</option>
            </select>
          </label>
          <label>
            <span class="field-label">Last Login</span>
            <input value="Not available in frontend snapshot" disabled />
          </label>
        </div>
        <div class="admin-action-grid">
          ${adminButton("Balance Adjustment", "warning", true)}
          ${adminButton("Lock Player", "danger", true)}
          ${adminButton("Unlock Player", "success", true)}
          ${adminButton("Reset Access Code", "warning", true)}
        </div>
        <p class="help-text">TODO: Save player settings when backend admin roster APIs exist.</p>
      </section>
    </div>`;
}

function bindAdminPlayerControls(root) {
  root.querySelectorAll("[data-admin-player-field]").forEach((field) => {
    field.addEventListener("input", () => {
      const index = Number(field.dataset.adminPlayerIndex);
      const key = field.dataset.adminPlayerField;
      if (!adminPlayerRows[index] || !key) return;
      adminPlayerRows[index][key] = field.value;
    });
  });

  root.querySelectorAll("[data-admin-player-settings]").forEach((button) => {
    button.addEventListener("click", () => {
      activePlayerSettingsIndex = Number(button.dataset.adminPlayerSettings);
      renderAdminDashboard();
    });
  });

  root.querySelectorAll("[data-admin-close-player-settings]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target !== button && button.classList.contains("admin-modal-backdrop")) return;
      activePlayerSettingsIndex = null;
      renderAdminDashboard();
    });
  });

  const addButton = root.querySelector("[data-admin-add-player-row]");
  if (addButton) {
    addButton.addEventListener("click", () => {
      adminPlayerRows.push({ name: "", accessCode: "", status: "Draft" });
      renderAdminDashboard();
    });
  }
}

function renderAttendanceSection() {
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Attendance Scanner</h2>
        <span class="badge warn">Frontend scanner stub</span>
      </div>
      <p class="help-text">Open a focused scanner popup for quick attendance scans. Submissions are captured locally until backend attendance APIs exist.</p>
      <div class="admin-scanner-summary">
        <div>
          <span>Last local scan</span>
          <strong>${sanitize(lastAttendanceScan || "No scan submitted yet")}</strong>
        </div>
        <button class="admin-btn admin-btn--primary" type="button" data-admin-open-attendance-scanner>Open Scanner</button>
      </div>
    </section>

    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Attendance Tools</h2>
        <span class="badge">Planned</span>
      </div>
      <p class="help-text">Manual attendance review, streak audit, and participation notes remain disabled until backend support exists.</p>
      <div class="admin-action-grid">
        ${adminButton("Attendance review", "secondary", true)}
        ${adminButton("Streak audit", "secondary", true)}
        ${adminButton("Participation notes", "secondary", true)}
        ${adminButton("Export attendance", "secondary", true)}
      </div>
    </section>

    ${renderAttendanceScannerPopup()}`;
}

function renderAttendanceScannerPopup() {
  if (!isAttendanceScannerOpen) return "";

  return `
    <div class="admin-modal-backdrop" role="presentation" data-admin-close-attendance-scanner>
      <section class="admin-modal admin-scanner-modal" role="dialog" aria-modal="true" aria-labelledby="adminAttendanceScannerTitle">
        <div class="card-title-row">
          <div>
            <div class="eyebrow">Attendance</div>
            <h2 id="adminAttendanceScannerTitle" class="card-title">Scan Student Code</h2>
          </div>
          <button class="admin-icon-btn" type="button" aria-label="Close attendance scanner" data-admin-close-attendance-scanner>&#215;</button>
        </div>
        <form class="admin-scanner-form" data-admin-attendance-scanner-form>
          <label>
            <span class="sr-only">Scan student code</span>
            <input class="admin-scanner-input" data-admin-attendance-scan-input autocomplete="off" inputmode="text" placeholder="Scan code" />
          </label>
        </form>
      </section>
    </div>`;
}

function bindAttendanceScannerControls(root) {
  const openButton = root.querySelector("[data-admin-open-attendance-scanner]");
  if (openButton) {
    openButton.addEventListener("click", () => {
      isAttendanceScannerOpen = true;
      renderAdminDashboard();
    });
  }

  root.querySelectorAll("[data-admin-close-attendance-scanner]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target !== button && button.classList.contains("admin-modal-backdrop")) return;
      isAttendanceScannerOpen = false;
      renderAdminDashboard();
    });
  });

  const scannerForm = root.querySelector("[data-admin-attendance-scanner-form]");
  const scannerInput = root.querySelector("[data-admin-attendance-scan-input]");

  if (scannerForm && scannerInput) {
    const submitScan = () => {
      const scan = normalizeCardId(scannerInput.value);
      if (!scan) return;
      lastAttendanceScan = scan;
      scannerInput.value = "";
      scannerInput.focus();
      // TODO: Submit scan to backend attendance API when that support exists.
    };

    scannerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (attendanceScanTimer) window.clearTimeout(attendanceScanTimer);
      submitScan();
    });

    scannerInput.addEventListener("input", () => {
      if (attendanceScanTimer) window.clearTimeout(attendanceScanTimer);
      attendanceScanTimer = window.setTimeout(submitScan, 180);
    });

    window.setTimeout(() => scannerInput.focus(), 0);
  }
}

function renderStoreSection() {
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Store Inventory</h2>
        <span class="badge warn">Local draft</span>
      </div>
      <p class="help-text">Edit item names, descriptions, and stock counts in a table view. Changes stay frontend-only until backend store admin support exists.</p>
      <div class="admin-player-table-wrap">
        <table class="admin-store-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Description</th>
              <th>Qty in Stock</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${adminStoreRows.map(adminStoreRow).join("")}
          </tbody>
        </table>
      </div>
      <div class="admin-table-actions">
        <button class="admin-btn admin-btn--primary" type="button" data-admin-add-store-row>Add Store Item Row</button>
        ${adminButton("Save Store Changes", "primary", true)}
        ${adminButton("Import / Export Store", "secondary", true)}
      </div>
    </section>

    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Store Controls</h2>
        <span class="badge">Planned</span>
      </div>
      <p class="help-text">Visibility, purchase windows, and destructive inventory actions need backend admin permissions before they can change live data.</p>
      <div class="admin-action-grid">
        ${adminButton("Open Purchase Window", "success", true)}
        ${adminButton("Close Purchase Window", "warning", true)}
        ${adminButton("Hide Sold Out Items", "secondary", true)}
        ${adminButton("Reset Store Purchases", "danger", true)}
      </div>
    </section>`;
}

function adminStoreRow(item, index) {
  return `
    <tr>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Store item name ${index + 1}</span>
          <input value="${sanitize(item.itemName)}" placeholder="Item name" data-admin-store-field="itemName" data-admin-store-index="${index}" autocomplete="off" />
        </label>
      </td>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Store item description ${index + 1}</span>
          <textarea rows="2" placeholder="Description" data-admin-store-field="description" data-admin-store-index="${index}">${sanitize(item.description)}</textarea>
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">Quantity in stock ${index + 1}</span>
          <input value="${sanitize(item.quantity)}" placeholder="0" inputmode="numeric" data-admin-store-field="quantity" data-admin-store-index="${index}" autocomplete="off" />
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">Store item price ${index + 1}</span>
          <input value="${sanitize(item.price)}" placeholder="0" inputmode="decimal" data-admin-store-field="price" data-admin-store-index="${index}" autocomplete="off" />
        </label>
      </td>
      <td><span class="badge ${item.status === "Draft" ? "warn" : "good"}">${sanitize(item.status)}</span></td>
    </tr>`;
}

function bindAdminStoreControls(root) {
  root.querySelectorAll("[data-admin-store-field]").forEach((field) => {
    field.addEventListener("input", () => {
      const index = Number(field.dataset.adminStoreIndex);
      const key = field.dataset.adminStoreField;
      if (!adminStoreRows[index] || !key) return;
      adminStoreRows[index][key] = field.value;
    });
  });

  const addButton = root.querySelector("[data-admin-add-store-row]");
  if (addButton) {
    addButton.addEventListener("click", () => {
      adminStoreRows.push({ itemName: "", description: "", quantity: "", price: "", status: "Draft" });
      renderAdminDashboard();
    });
  }
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
