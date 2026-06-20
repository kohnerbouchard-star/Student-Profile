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
let adminStoreItems = [];
let adminStoreLoadedGameSessionId = null;
let adminStoreLoadingGameSessionId = null;
let adminStoreStatus = { type: "idle", message: "" };
let adminStoreNewItem = createDefaultAdminStoreItem();

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
  const staffSession = getAdminStaffSession();

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
            <span class="badge ${staffSession ? "good" : "warn"}">${staffSession ? "Staff loaded" : "Prototype"}</span>
          </section>

          <div class="admin-section" data-current-admin-section="${sanitize(activeAdminSection)}">
            ${renderAdminSection(activeAdminSection, { storeCount, marketCount, portfolioCount, forecastCount, newsCount, activePlayerCount, staffSession })}
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

function renderDashboardSection({ storeCount, marketCount, forecastCount, newsCount, activePlayerCount, staffSession }) {
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
        ${renderStaffSessionStatus(staffSession)}
        ${adminStatus("Admin actions", "Disabled until backend permissions exist", "warn")}
        ${adminStatus("News rows", String(newsCount), "good")}
        ${adminStatus("Student data", "Read-only snapshot in this prototype", "warn")}
      </div>
    </section>`;
}

function getAdminStaffSession() {
  return state.staffSession || currentSession?.staffSession || null;
}

function renderStaffSessionStatus(staffSession) {
  if (!staffSession) return "";

  const selectedSession = getSelectedAdminGameSession(staffSession);

  return `
        ${adminStatus("Staff", formatStaffSessionLabel(staffSession), "good")}
        ${adminStatus("Active game sessions", String((staffSession.activeGameSessions || []).length), "good")}
        ${adminStatus("Selected session", selectedSession?.name || selectedSession?.id || "No active session selected", selectedSession ? "good" : "warn")}`;
}

function formatStaffSessionLabel(staffSession) {
  const name = staffSession.staffDisplayName || "Staff user";
  const email = staffSession.staffEmail || "";

  return email ? `${name} (${email})` : name;
}

function getSelectedAdminGameSession(staffSession) {
  if (!staffSession?.selectedGameSessionId) return null;

  return (staffSession.activeGameSessions || []).find((session) => session.id === staffSession.selectedGameSessionId) || null;
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
  const staffSession = getAdminStaffSession();
  const selectedSession = getSelectedAdminGameSession(staffSession);

  if (!staffSession) {
    return `
      ${renderStorePrototypeSection(true)}
      ${renderStoreResponsibilitiesSection()}`;
  }

  if (!selectedSession) {
    return `
      ${renderStoreUnavailableSection(
        "No active game session selected",
        "Store management needs an active game session from staff bootstrap before it can load catalog items."
      )}
      ${renderStoreResponsibilitiesSection()}`;
  }

  if (!getAdminStoreToken()) {
    return `
      ${renderStoreUnavailableSection(
        "Staff token required",
        "Sign in with a staff token before managing store items."
      )}
      ${renderStoreResponsibilitiesSection()}`;
  }

  scheduleAdminStoreItemsLoad(selectedSession.id);

  return `
    ${renderAdminStoreCatalogSection(selectedSession)}
    ${renderStoreResponsibilitiesSection()}`;
}

function renderStorePrototypeSection(disabled) {
  const disabledAttr = disabled ? " disabled" : "";

  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Store Inventory</h2>
        <span class="badge warn">Local draft</span>
      </div>
      <p class="help-text">Store management is disabled until a real staff session and selected game session are available.</p>
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
            ${adminStoreRows.map((item, index) => adminStoreRow(item, index, disabled)).join("")}
          </tbody>
        </table>
      </div>
      <div class="admin-table-actions">
        <button class="admin-btn admin-btn--primary" type="button" data-admin-add-store-row${disabledAttr}>Add Store Item Row</button>
      </div>
    </section>`;
}

function renderStoreUnavailableSection(title, message) {
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <h2 class="card-title">Store Inventory</h2>
        <span class="badge warn">Not connected</span>
      </div>
      <div class="admin-status-list">
        ${adminStatus(title, message, "warn")}
      </div>
    </section>`;
}

function renderAdminStoreCatalogSection(selectedSession) {
  return `
    <section class="card admin-panel">
      <div class="card-title-row">
        <div>
          <h2 class="card-title">Store Inventory</h2>
          <p class="help-text">Editing ${sanitize(selectedSession.name || selectedSession.id)}. Changes save only when you press Save or Add Item.</p>
        </div>
        <span class="badge good">Live catalog</span>
      </div>
      ${renderAdminStoreStatusBox()}
      <div class="admin-player-table-wrap">
        <table class="admin-store-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Status</th>
              <th>Visibility</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${renderAdminStoreItemRows()}
            ${renderAdminStoreNewItemRow()}
          </tbody>
        </table>
      </div>
      <div class="admin-table-actions">
        <button class="admin-btn admin-btn--secondary" type="button" data-admin-store-refresh${adminStoreLoadingGameSessionId ? " disabled" : ""}>Refresh Items</button>
      </div>
    </section>`;
}

function renderAdminStoreItemRows() {
  if (adminStoreLoadingGameSessionId && !adminStoreItems.length) {
    return `<tr><td colspan="7"><div class="empty">Loading store items...</div></td></tr>`;
  }

  if (!adminStoreItems.length) {
    return `<tr><td colspan="7"><div class="empty">No store items have been created for this game session yet.</div></td></tr>`;
  }

  return adminStoreItems.map(renderAdminStoreItemRow).join("");
}

function renderAdminStoreItemRow(item, index) {
  const disabledAttr = adminStoreLoadingGameSessionId ? " disabled" : "";

  return `
    <tr>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Store item name ${index + 1}</span>
          <input value="${sanitize(item.name)}" placeholder="Item name" data-admin-store-item-field="name" data-admin-store-item-index="${index}" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Store item description ${index + 1}</span>
          <textarea rows="2" placeholder="Description" data-admin-store-item-field="description" data-admin-store-item-index="${index}"${disabledAttr}>${sanitize(item.description)}</textarea>
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">Quantity in stock ${index + 1}</span>
          <input value="${sanitize(item.stockQuantity)}" placeholder="0" inputmode="numeric" data-admin-store-item-field="stockQuantity" data-admin-store-item-index="${index}" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">Store item price ${index + 1}</span>
          <input value="${sanitize(item.price)}" placeholder="0" inputmode="decimal" data-admin-store-item-field="price" data-admin-store-item-index="${index}" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>${adminStoreSelect("status", item.status, ["active", "disabled", "archived"], "data-admin-store-item-field=\"status\" data-admin-store-item-index=\"" + index + "\"" + disabledAttr)}</td>
      <td>${adminStoreSelect("visibility", item.visibility, ["visible", "hidden"], "data-admin-store-item-field=\"visibility\" data-admin-store-item-index=\"" + index + "\"" + disabledAttr)}</td>
      <td>
        <button class="admin-btn admin-btn--primary" type="button" data-admin-store-save="${index}"${disabledAttr}>Save</button>
      </td>
    </tr>`;
}

function renderAdminStoreNewItemRow() {
  const disabledAttr = adminStoreLoadingGameSessionId ? " disabled" : "";

  return `
    <tr>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">New store item name</span>
          <input value="${sanitize(adminStoreNewItem.name)}" placeholder="New item name" data-admin-store-new-field="name" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">New store item description</span>
          <textarea rows="2" placeholder="Description" data-admin-store-new-field="description"${disabledAttr}>${sanitize(adminStoreNewItem.description)}</textarea>
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">New quantity in stock</span>
          <input value="${sanitize(adminStoreNewItem.stockQuantity)}" placeholder="0" inputmode="numeric" data-admin-store-new-field="stockQuantity" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">New store item price</span>
          <input value="${sanitize(adminStoreNewItem.price)}" placeholder="0" inputmode="decimal" data-admin-store-new-field="price" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>${adminStoreSelect("status", adminStoreNewItem.status, ["active", "disabled", "archived"], "data-admin-store-new-field=\"status\"" + disabledAttr)}</td>
      <td>${adminStoreSelect("visibility", adminStoreNewItem.visibility, ["visible", "hidden"], "data-admin-store-new-field=\"visibility\"" + disabledAttr)}</td>
      <td>
        <button class="admin-btn admin-btn--success" type="button" data-admin-store-create${disabledAttr}>Add Item</button>
      </td>
    </tr>`;
}

function adminStoreSelect(label, value, options, dataAttrs) {
  return `
    <label class="admin-table-field admin-table-field--small">
      <span class="sr-only">${sanitize(label)}</span>
      <select ${dataAttrs}>
        ${options.map((option) => `<option value="${sanitize(option)}"${option === value ? " selected" : ""}>${sanitize(option)}</option>`).join("")}
      </select>
    </label>`;
}

function renderAdminStoreStatusBox() {
  if (!adminStoreStatus.message) return "";

  return `<div class="status-box ${sanitize(adminStoreStatus.type)}">${sanitize(adminStoreStatus.message)}</div>`;
}

function renderStoreResponsibilitiesSection() {
  return `
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

function adminStoreRow(item, index, disabled) {
  const disabledAttr = disabled ? " disabled" : "";

  return `
    <tr>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Store item name ${index + 1}</span>
          <input value="${sanitize(item.itemName)}" placeholder="Item name" data-admin-store-field="itemName" data-admin-store-index="${index}" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>
        <label class="admin-table-field">
          <span class="sr-only">Store item description ${index + 1}</span>
          <textarea rows="2" placeholder="Description" data-admin-store-field="description" data-admin-store-index="${index}"${disabledAttr}>${sanitize(item.description)}</textarea>
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">Quantity in stock ${index + 1}</span>
          <input value="${sanitize(item.quantity)}" placeholder="0" inputmode="numeric" data-admin-store-field="quantity" data-admin-store-index="${index}" autocomplete="off"${disabledAttr} />
        </label>
      </td>
      <td>
        <label class="admin-table-field admin-table-field--small">
          <span class="sr-only">Store item price ${index + 1}</span>
          <input value="${sanitize(item.price)}" placeholder="0" inputmode="decimal" data-admin-store-field="price" data-admin-store-index="${index}" autocomplete="off"${disabledAttr} />
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

  root.querySelectorAll("[data-admin-store-item-field]").forEach((field) => {
    const updateField = () => {
      const index = Number(field.dataset.adminStoreItemIndex);
      const key = field.dataset.adminStoreItemField;
      if (!adminStoreItems[index] || !key) return;
      adminStoreItems[index][key] = field.value;
    };

    field.addEventListener("input", updateField);
    field.addEventListener("change", updateField);
  });

  root.querySelectorAll("[data-admin-store-new-field]").forEach((field) => {
    const updateField = () => {
      const key = field.dataset.adminStoreNewField;
      if (!key) return;
      adminStoreNewItem[key] = field.value;
    };

    field.addEventListener("input", updateField);
    field.addEventListener("change", updateField);
  });

  root.querySelectorAll("[data-admin-store-save]").forEach((button) => {
    button.addEventListener("click", () => {
      saveAdminStoreItem(Number(button.dataset.adminStoreSave));
    });
  });

  const createButton = root.querySelector("[data-admin-store-create]");
  if (createButton) {
    createButton.addEventListener("click", () => {
      createAdminStoreItemFromDraft();
    });
  }

  const refreshButton = root.querySelector("[data-admin-store-refresh]");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      refreshAdminStoreItems();
    });
  }

  const addButton = root.querySelector("[data-admin-add-store-row]");
  if (addButton) {
    addButton.addEventListener("click", () => {
      adminStoreRows.push({ itemName: "", description: "", quantity: "", price: "", status: "Draft" });
      renderAdminDashboard();
    });
  }
}

function scheduleAdminStoreItemsLoad(gameSessionId) {
  if (!gameSessionId) return;

  if (adminStoreLoadedGameSessionId === gameSessionId || adminStoreLoadingGameSessionId === gameSessionId) {
    return;
  }

  adminStoreItems = [];
  adminStoreNewItem = createDefaultAdminStoreItem();
  adminStoreLoadingGameSessionId = gameSessionId;
  adminStoreStatus = {
    type: "loading",
    message: "Loading store items..."
  };

  window.setTimeout(() => {
    loadAdminStoreItemsForSession(gameSessionId);
  }, 0);
}

async function loadAdminStoreItemsForSession(gameSessionId) {
  const result = await listAdminStoreItems(gameSessionId, getAdminStoreToken());

  if (getSelectedAdminGameSession(getAdminStaffSession())?.id !== gameSessionId) {
    if (adminStoreLoadingGameSessionId === gameSessionId) {
      adminStoreLoadingGameSessionId = null;
    }

    return;
  }

  if (result && result.ok === true) {
    adminStoreItems = (result.items || []).map(normalizeAdminStoreItem);
    adminStoreLoadedGameSessionId = gameSessionId;
    adminStoreStatus = {
      type: "ok",
      message: `${adminStoreItems.length} store item${adminStoreItems.length === 1 ? "" : "s"} loaded.`
    };
  } else {
    adminStoreLoadedGameSessionId = null;
    adminStoreStatus = {
      type: "bad",
      message: result?.message || "Store items could not be loaded."
    };
  }

  adminStoreLoadingGameSessionId = null;
  renderAdminDashboard();
}

async function saveAdminStoreItem(index) {
  const item = adminStoreItems[index];
  const context = getAdminStoreContext();

  if (!item || !context.ok) return;

  adminStoreStatus = {
    type: "loading",
    message: `Saving ${item.name || "store item"}...`
  };
  renderAdminDashboard();

  const result = await updateAdminStoreItem(
    context.gameSessionId,
    item.id,
    context.token,
    adminStoreItemToPayload(item)
  );

  if (result && result.ok === true) {
    adminStoreItems[index] = normalizeAdminStoreItem(result.item || item);
    adminStoreStatus = {
      type: "ok",
      message: `${adminStoreItems[index].name || "Store item"} saved.`
    };
  } else {
    adminStoreStatus = {
      type: "bad",
      message: result?.message || "Store item could not be saved."
    };
  }

  renderAdminDashboard();
}

async function createAdminStoreItemFromDraft() {
  const context = getAdminStoreContext();

  if (!context.ok) return;

  adminStoreStatus = {
    type: "loading",
    message: `Adding ${adminStoreNewItem.name || "store item"}...`
  };
  renderAdminDashboard();

  const result = await createAdminStoreItem(
    context.gameSessionId,
    context.token,
    adminStoreItemToPayload(adminStoreNewItem)
  );

  if (result && result.ok === true) {
    adminStoreItems.push(normalizeAdminStoreItem(result.item));
    adminStoreNewItem = createDefaultAdminStoreItem();
    adminStoreLoadedGameSessionId = context.gameSessionId;
    adminStoreStatus = {
      type: "ok",
      message: `${adminStoreItems[adminStoreItems.length - 1].name || "Store item"} added.`
    };
  } else {
    adminStoreStatus = {
      type: "bad",
      message: result?.message || "Store item could not be added."
    };
  }

  renderAdminDashboard();
}

function refreshAdminStoreItems() {
  const context = getAdminStoreContext();

  if (!context.ok) return;

  adminStoreLoadedGameSessionId = null;
  adminStoreLoadingGameSessionId = context.gameSessionId;
  adminStoreStatus = {
    type: "loading",
    message: "Refreshing store items..."
  };
  renderAdminDashboard();
  loadAdminStoreItemsForSession(context.gameSessionId);
}

function getAdminStoreContext() {
  const selectedSession = getSelectedAdminGameSession(getAdminStaffSession());
  const token = getAdminStoreToken();

  if (!selectedSession || !token) {
    return { ok: false };
  }

  return {
    ok: true,
    gameSessionId: selectedSession.id,
    token
  };
}

function getAdminStoreToken() {
  const token = currentSession?.token || "";

  if (!token || token === "frontend-admin-demo") return "";

  return token;
}

function normalizeAdminStoreItem(item) {
  return {
    id: String(item?.id || ""),
    gameSessionId: String(item?.gameSessionId || ""),
    itemKey: item?.itemKey || "",
    name: item?.name || "",
    description: item?.description || "",
    category: item?.category || "general",
    price: formatAdminStoreInputValue(item?.price, "0"),
    currencyCode: item?.currencyCode || "ECO",
    stockQuantity: formatAdminStoreInputValue(item?.stockQuantity, "0"),
    status: item?.status || "active",
    visibility: item?.visibility || "visible",
    sortOrder: formatAdminStoreInputValue(item?.sortOrder, "0"),
    createdAt: item?.createdAt || "",
    updatedAt: item?.updatedAt || ""
  };
}

function createDefaultAdminStoreItem() {
  return {
    name: "",
    description: "",
    category: "general",
    price: "0",
    currencyCode: "ECO",
    stockQuantity: "0",
    status: "active",
    visibility: "visible",
    sortOrder: "0"
  };
}

function adminStoreItemToPayload(item) {
  return {
    name: item.name,
    description: item.description || null,
    category: item.category || "general",
    price: parseAdminStoreNumber(item.price, 0),
    currencyCode: item.currencyCode || "ECO",
    stockQuantity: parseAdminStoreNumber(item.stockQuantity, 0),
    status: item.status || "active",
    visibility: item.visibility || "visible",
    sortOrder: parseAdminStoreNumber(item.sortOrder, 0)
  };
}

function parseAdminStoreNumber(value, fallback) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;

  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

function formatAdminStoreInputValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
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
