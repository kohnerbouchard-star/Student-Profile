(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const profile = app.modules.profile = app.modules.profile || {};

  function sanitize(value) {
    if (app.modules.sanitize && typeof app.modules.sanitize.sanitizeHtml === "function") {
      return app.modules.sanitize.sanitizeHtml(value);
    }

    if (typeof global.sanitize === "function") {
      return global.sanitize(value);
    }

    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function formatCurrency(value) {
    if (typeof global.money === "function") {
      return global.money(value);
    }

    if (app.modules.currency && typeof app.modules.currency.formatCurrency === "function") {
      return app.modules.currency.formatCurrency(value);
    }

    return Number(value || 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD"
    });
  }

  function help(text) {
    return typeof global.help === "function"
      ? global.help(text)
      : `<p class="help-text">${sanitize(text || "")}</p>`;
  }

  // display-only
  function renderProfileEmptyState(message) {
    if (app.modules.emptyState && typeof app.modules.emptyState.renderEmptyState === "function") {
      return app.modules.emptyState.renderEmptyState(message || "Profile data is not available yet.");
    }

    return `<div class="empty">${sanitize(message || "Profile data is not available yet.")}</div>`;
  }

  // display-only
  function renderProfileHeader(profileData) {
    const data = profileData || {};
    const status = data.active || "Active";

    return `
      <div class="card profile-header">
        <div class="card-title-row">
          <div>
            <h2 class="card-title">${sanitize(data.name || "Student Profile")}</h2>
            <p class="help-text">${sanitize(data.jobTitle || "No job assigned")}</p>
          </div>
          <span class="badge ${String(status).toLowerCase().includes("active") ? "good" : ""}">${sanitize(status)}</span>
        </div>
        ${help("This section shows student account details from the latest backend snapshot.")}
      </div>
    `;
  }

  // display-only
  function renderProfileStats(profileData) {
    const data = profileData || {};
    const rows = [
      { label: "Balance", value: formatCurrency(data.balance) },
      { label: "Grade", value: data.grade || "Unavailable" },
      { label: "Homeroom", value: data.homeroom || "Unavailable" },
      { label: "Account", value: data.active || "Active" }
    ];

    return `
      <div class="grid cols-4 profile-stats">
        ${rows.map(function (row) {
          return `
            <div class="metric">
              <div class="label">${sanitize(row.label)}</div>
              <div class="value">${sanitize(row.value)}</div>
              <div class="note">Profile snapshot</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // display-only
  function renderProfileRows(rows) {
    return `
      <div class="mini-list">
        ${(rows || []).map(function (row) {
          return `<div class="mini-row"><span>${sanitize(row.label)}</span><strong>${sanitize(row.value)}</strong></div>`;
        }).join("")}
      </div>
    `;
  }

  // display-only
  function renderProfilePanel(options) {
    const config = options || {};
    const state = config.state || global.state || {};
    const profileData = typeof profile.getProfileData === "function"
      ? profile.getProfileData(state)
      : null;
    const displayRows = typeof profile.getProfileDisplayRows === "function"
      ? profile.getProfileDisplayRows(state)
      : [];

    if (!profileData) {
      return renderProfileEmptyState("Profile data is not available yet. Login or refresh to load a snapshot.");
    }

    return `
      ${renderProfileHeader(profileData)}
      <div style="margin-top:16px;">
        ${renderProfileStats(profileData)}
      </div>
      <div class="card" style="margin-top:16px;">
        <h2 class="card-title">My Account</h2>
        ${help("These display rows are copied from the account snapshot and do not update backend state.")}
        ${renderProfileRows(displayRows)}
      </div>
    `;
  }

  profile.viewStatus = "extracted";
  profile.renderProfilePanel = renderProfilePanel;
  profile.renderProfileHeader = renderProfileHeader;
  profile.renderProfileStats = renderProfileStats;
  profile.renderProfileEmptyState = renderProfileEmptyState;

  app.modules.profileView = {
    status: "extracted",
    renderProfilePanel,
    renderProfileHeader,
    renderProfileStats,
    renderProfileEmptyState
  };
})(window);
