window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.admin = window.Econovaria.features.admin || {};

const ADMIN_SECTIONS = [
  { id: "Overview", label: "Overview", description: "Game status and core admin tasks" },
  { id: "Players", label: "Players", description: "Roster, codes, and access" },
  { id: "Attendance", label: "Attendance", description: "Clock-in and scan tools" },
  { id: "Store", label: "Store", description: "Items, stock, and pricing" },
  { id: "Market", label: "Market", description: "Market windows and signals" },
  { id: "Settings", label: "Settings", description: "Difficulty and simulation rules" },
  { id: "Reports", label: "Reports", description: "Exports and teacher review" }
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
  "News & Events",
  "Reports",
  "Security"
];

let activeAdminSection = "Overview";
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

  if (!ADMIN_SECTIONS.some((section) => section.id === activeAdminSection)) {
    activeAdminSection = "Overview";
  }

  const storeCount = (state.store || []).length;
  const marketCount = (state.market || []).length;
  const portfolioCount = (state.portfolio || []).length;
  const forecastCount = (state.ratings || []).length;
  const newsCount = (state.news || []).length;
  const activePlayerCount = adminPlayerRows.filter((player) => player.status === "Active" && player.name).length;
  const sectionMeta = adminSectionMeta(activeAdminSection);

  el.innerHTML = `
    <div class="admin-page">
      <div class="admin-console-shell" aria-label="Teacher admin workspace">
        <aside class="admin-workspace-menu" aria-label="Admin console sections">
          <div class="admin-menu-header">
            <div class="eyebrow">Teacher console</div>
            <h2>Admin</h2>
            <p>Manage the classroom economy from the same shell students use.</p>
          </div>

          <nav class="admin-tabs" aria-label="Admin menu">
            ${ADMIN_SECTIONS.map(adminTab).join("")}
          </nav>

          <div class="admin-menu-note">
            <span>Core loop</span>
            <strong>Players → attendance → store → settings</strong>
            <p>Backend actions stay disabled until the admin permission layer is wired.</p>
          </div>
        </aside>

        <div class="admin-main-panel">
          <section class="admin-section-intro card">
            <div>
              <div class="eyebrow">${sanitize(sectionMeta.label)}</div>
              <h2>${sanitize(sectionMeta.label)}</h2>
              <p>${sanitize(sectionMeta.description)}</p>
            </div>
            <span class="badge warn">Prototype</span>
          </section>

          <div class="admin-section" data-current-admin-section="${sanitize(activeAdminSection)}">
            ${renderAdminSection(activeAdminSection, { storeCount, marketCount, portfolioCount, forecastCount, newsCount, activePlayerCount })}
          </div>
        </div>
      </div>
    </div>`;

  bindAdminTabs(el);
  bindAdminPlayerControls(el);
  bindAttendanceScannerControls(el);
  bindAdminStoreControls(el);
}

function adminSectionMeta(sectionId) {
  return ADMIN_SECTIONS.find((section) => section.id === sectionId) || ADMIN_SECTIONS[0];
}

function adminTab(section) {
  const isActive = section.id === activeAdminSection;

  return `
    <button class="admin-tab${isActive ? " active" : ""}" type="button" data-admin-section="${sanitize(section.id)}" aria-pressed="${String(isActive)}">
      <span>${sanitize(section.label)}</span>
      <small>${sanitize(section.description)}</small>
    </button>`;
}

function bindAdminTabs(root) {
  root.querySelectorAll("[data-admin-section]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAdminSection = button.dataset.adminSection || "Overview";
      renderAdminDashboard();
    });
  });
}

function renderAdminSection(section, counts) {
  if (section === "Players") return renderPlayersSection();
  if (section === "Attendance") return renderAttendanceSection();
  if (section === "Store") return renderStoreSection();
  if (section === "Market") return renderPlaceholderSection("Market", "Review market visibility, asset controls, news timing, and trading-window status.", ["Market status", "Asset controls", "News and events"]);
  if (section === "Reports") return renderPlaceholderSection("Reports", "Prepare classroom exports for balances, trades, attendance, and forecasts.", ["Balance report", "Trading report", "Forecast report"]);
  if (section === "Settings") return renderSettingsSection();
  return renderDashboardSection(counts);
}

function renderDashboardSection({ storeCount, marketCount, forecastCount, newsCount, activePlayerCount }) {
  return `
    <div class="grid cols-4 admin-metrics">
      ${metric("Active Players", activePlayerCount, "Local roster draft")}
      ${metric("Store Items", storeCount, "Loaded from snapshot")}
      ${metric("Market Assets", marketCount, "Visible to students")}
      ${metric("Forecasts", forecastCount, "Submitted ratings")}
    </div>

    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Core Admin Responsibilities</h2>
        <span class="badge">Focused</span>
      </div>
      <div class="admin-responsibility-grid">
        ${adminResponsibilityCard("Players", "Roster, student codes, locks, and access status live together.", "Players")}
        ${adminResponsibilityCard("Attendance", "Use the scanner and review clock-in flow from one place.", "Attendance")}
        ${adminResponsibilityCard("Store", "Maintain item names, stock levels, prices, and visibility.", "Store")}
        ${adminResponsibilityCard("Settings", "Keep difficulty, windows, and advanced controls grouped.", "Settings")}
      </div>
    </section>

    <section class="card admin-panel admin-compact-status">
      <div class="card-title-row">
        <h2 class="card-title">Prototype Status</h2>
        <span class="badge warn">Frontend only</span>
      </div>
      <div class="admin-status-list">
        ${adminStatus("Admin actions", "Disabled until backend permissions exist", "warn")}
        ${adminStatus("News rows", String(newsCount), "good")}
        ${adminStatus("Student data", "Read-only snapshot in this prototype", "warn")}
      </div>
    </section>`;
}

function renderPlayersSection() {
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Players</h2>
        <span class="badge warn">Local draft</span>
      </div>
      <p class="help-text">Manage the roster and student access codes in one place. These rows stay frontend-only until backend roster APIs exist.</p>
      <div class="admin-player-table-wrap">
        <table class="admin-player-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Student Code</th>
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
      </div>
    </section>

    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Access Code Responsibilities</h2>
        <span class="badge bad">Sensitive</span>
      </div>
      <p class="help-text">Access-code management belongs inside Players. Raw secrets stay hidden and backend duplicate checks will become the source of truth.</p>
      <div class="admin-access-grid admin-access-grid--compact">
        ${adminActionSummary("Generate or reset codes", "Prepare one active student code per player.", "Planned")}
        ${adminActionSummary("Lock or unlock access", "Control whether a selected player can sign in.", "Planned")}
        ${adminActionSummary("Prevent duplicates", "No active duplicate student codes inside the same game session.", "Core rule")}
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
          <span class="sr-only">Student code ${index + 1}</span>
          <input value="${sanitize(player.accessCode)}" placeholder="Student code" data-admin-player-field="accessCode" data-admin-player-index="${index}" autocomplete="off" />
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
            <span class="field-label">Student Code</span>
            <input value="${sanitize(player.accessCode)}" data-admin-player-field="accessCode" data-admin-player-index="${activePlayerSettingsIndex}" autocomplete="off" />
          </label>
          <label>
            <span class="field-label">Access Status</span>
            <select disabled>
              <option>${sanitize(player.status || "Draft")}</option>
            </select>
          </label>
        </div>
        <div class="admin-action-grid admin-action-grid--three">
          ${adminButton("Reset Code", "warning", true)}
          ${adminButton("Lock Access", "danger", true)}
          ${adminButton("Unlock Access", "success", true)}
        </div>
        <p class="help-text">Player actions are intentionally disabled until backend admin permissions exist.</p>
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
      <p class="help-text">Open a focused scanner for quick attendance scans. Submissions are captured locally until backend attendance APIs exist.</p>
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
        <h2 class="card-title">Attendance Workflow</h2>
        <span class="badge">Core</span>
      </div>
      <div class="admin-access-grid admin-access-grid--compact">
        ${adminActionSummary("Clock-in scan", "Capture one scan per student attendance event.", "Now")}
        ${adminActionSummary("Review exceptions", "Late, duplicate, and missing scans will be reviewed here.", "Planned")}
        ${adminActionSummary("Export attendance", "Teacher reports will connect after backend support.", "Planned")}
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
      <p class="help-text">Edit item names, descriptions, stock counts, and prices. Publishing stays disabled until backend store admin support exists.</p>
      <div class="admin-player-table-wrap">
        <table class="admin-store-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Description</th>
              <th>Qty</th>
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
      </div>
    </section>

    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Store Responsibilities</h2>
        <span class="badge">Core</span>
      </div>
      <div class="admin-access-grid admin-access-grid--compact">
        ${adminActionSummary("Items and prices", "Maintain the student-facing store list.", "Now")}
        ${adminActionSummary("Purchase windows", "Open or close purchase access after backend support.", "Planned")}
        ${adminActionSummary("Inventory reset", "Destructive store actions stay isolated in Settings.", "Protected")}
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
          <h2 class="card-title">Game Info</h2>
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
      <p class="help-text">Advanced settings stay grouped so the primary admin page remains focused on the daily teacher loop.</p>
      <div class="admin-advanced-grid">
        ${ADVANCED_SETTING_GROUPS.map(adminAdvancedGroup).join("")}
      </div>
    </section>

    <section class="card admin-panel admin-danger-zone">
      <div class="card-title-row">
        <h2 class="card-title">Danger Zone</h2>
        <span class="badge bad">Protected</span>
      </div>
      <p class="help-text">Reset and destructive actions are isolated here and disabled in the frontend prototype.</p>
      <div class="admin-action-grid admin-action-grid--three">
        ${adminButton("Reset Simulation", "danger", true)}
        ${adminButton("Reset Store", "danger", true)}
        ${adminButton("Deactivate Players", "danger", true)}
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
      <p class="help-text">${sanitize(description)} Backend support is required before these controls can change live data.</p>
      <div class="admin-access-grid admin-access-grid--compact">
        ${actions.map((action) => adminActionSummary(action, "Will be wired after backend permissions exist.", "Planned")).join("")}
      </div>
    </section>`;
}

function adminResponsibilityCard(title, description, targetSection) {
  return `
    <div class="admin-responsibility-card">
      <div>
        <strong>${sanitize(title)}</strong>
        <p>${sanitize(description)}</p>
      </div>
      ${adminButton("Open", "secondary", false, targetSection)}
    </div>`;
}

function adminActionSummary(title, description, tag) {
  return `
    <div class="admin-action-summary">
      <span>${sanitize(tag || "Planned")}</span>
      <strong>${sanitize(title)}</strong>
      <p>${sanitize(description)}</p>
    </div>`;
}

function adminAdvancedGroup(group) {
  return `
    <details class="admin-advanced-group">
      <summary>${sanitize(group)}</summary>
      <p>${sanitize(group)} settings will be wired when backend admin settings support exists.</p>
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
