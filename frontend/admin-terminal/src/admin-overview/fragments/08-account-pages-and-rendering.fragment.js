// Account sub-pages and core render/rerender orchestration.
  function isAdminTerminalLeftMenuSection(section) {
    return ["Overview", "Players", "Attendance", "Assignments", "Store", "Market", "Settings", "Logs"].includes(normalizeTerminalPageSection(section));
  }

  function getAdminTerminalLeftMenuSection(section = null) {
    const feature = window.Econovaria.features.adminOverviewTerminal;
    const normalized = normalizeTerminalPageSection(section || "");
    if (isAdminTerminalLeftMenuSection(normalized)) return normalized;
    return normalizeTerminalPageSection(feature.lastLeftMenuSection || "Overview");
  }

  function setAdminTerminalLeftMenuSection(section) {
    const feature = window.Econovaria.features.adminOverviewTerminal;
    const normalized = getAdminTerminalLeftMenuSection(section);
    feature.lastLeftMenuSection = normalized;
    return normalized;
  }

  function getAdminAccountMeta(model) {
    const staffSession = getStaffSession() || {};
    return {
      name: model.adminName || staffSession.staffDisplayName || staffSession.displayName || "Administrator",
      role: staffSession.staffRole || staffSession.role || model.adminRole || "Teacher Admin",
      email: staffSession.staffEmail || staffSession.email || model.adminEmail || "admin@econovaria.local",
      gameName: model.gameName || "Eco Novaria Simulation",
      gameCode: model.gameCode || "—",
      gameStatus: model.gameStatus || "live"
    };
  }

  function getAdminProfileAvatarDataUrl() {
    return window.Econovaria.features.adminOverviewTerminal.adminProfileAvatarDataUrl || "";
  }

  function applyAdminProfileAvatar(dataUrl = "") {
    const value = String(dataUrl || "");
    window.Econovaria.features.adminOverviewTerminal.adminProfileAvatarDataUrl = value;

    if (value) {
      document.documentElement.classList.add("has-admin-terminal-profile-avatar");
      document.documentElement.style.setProperty("--admin-terminal-profile-avatar-image", `url("${value}")`);
    } else {
      document.documentElement.classList.remove("has-admin-terminal-profile-avatar");
      document.documentElement.style.removeProperty("--admin-terminal-profile-avatar-image");
    }
  }

  function renderAccountPageHeader(model, eyebrow, title, description) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>

        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }

  function renderAdminAccountStat(label, value, meta = "", tone = "cyan") {
    return `
      <article class="admin-terminal-account-stat is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      </article>`;
  }

  function renderAdminAccountAction(label, meta, actionName, tone = "") {
    return `
      <button type="button" class="${tone ? `is-${escapeHtml(tone)}` : ""}" data-admin-terminal-action="${escapeHtml(actionName)}">
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(meta)}</small>
      </button>`;
  }

  function renderAdminAccountActionList(actions = []) {
    return `<div class="admin-terminal-account-action-list">${actions.join("")}</div>`;
  }

  function renderAdminAccountDefinitionList(rows = []) {
    return `<dl class="admin-terminal-account-definition-list">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
  }

  function renderAdminAccountPanelHeader(kicker, title, meta = "") {
    return `<header><span>${escapeHtml(kicker)}</span><strong>${escapeHtml(title)}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</header>`;
  }

  function renderAdminAccountStats(stats = []) {
    return stats.length ? `<section class="admin-terminal-account-stat-grid">${stats.map((item) => renderAdminAccountStat(item[0], item[1], item[2], item[3])).join("")}</section>` : "";
  }

  function renderAdminAccountLayout({ primaryHeader, primaryBody, sideHeader, sideActions, sideBody = "" }) {
    return `
        <div class="admin-terminal-account-layout">
          <section class="admin-terminal-account-primary">
            ${primaryHeader}
            ${primaryBody}
          </section>
          <aside class="admin-terminal-account-side">
            ${sideHeader}
            ${sideBody}
            ${renderAdminAccountActionList(sideActions)}
          </aside>
        </div>`;
  }

  function renderAdminAccountShell(model, { page, ariaLabel, className = "", eyebrow, title, description, stats = [], primaryHeader, primaryBody, sideHeader, sideActions, sideBody = "" }) {
    const extraClass = className ? ` ${escapeHtml(className)}` : "";
    return `
      <section class="admin-terminal-overview admin-terminal-account-page${extraClass}" aria-label="${escapeHtml(ariaLabel)}" data-admin-terminal-page="${escapeHtml(page)}">
        ${renderAccountPageHeader(model, eyebrow, title, description)}
        ${renderAdminAccountStats(stats)}
        ${renderAdminAccountLayout({ primaryHeader, primaryBody, sideHeader, sideActions, sideBody })}
      </section>`;
  }

  function renderAdminProfilePage(model) {
    const meta = getAdminAccountMeta(model);
    const avatar = getAdminProfileAvatarDataUrl();
    const primaryBody = `
            <div class="admin-terminal-profile-photo-panel">
              <div class="admin-terminal-profile-avatar-frame has-admin-avatar-frame${avatar ? " has-custom-avatar" : ""}" data-admin-terminal-avatar-frame data-admin-profile-avatar-frame>
                <img data-admin-terminal-avatar-image src="${escapeHtml(avatar)}" alt="" ${avatar ? "" : "hidden"} />
                <span ${avatar ? "hidden" : ""}>${escapeHtml(getAdminInitials(meta.name))}</span>
                <input data-admin-terminal-avatar-input data-admin-profile-avatar-input type="file" accept="image/*" hidden />
                <button type="button" aria-label="Change profile picture" data-admin-terminal-action="change-sci-avatar">✎</button>
              </div>
              <div>
                <span>Profile Picture</span>
                <strong>Profile image</strong>
                <p>Use the pencil icon to upload or replace the admin profile photo. This control lives only on the Profile page.</p>
              </div>
            </div>
            ${renderAdminAccountDefinitionList([
              ["Name", escapeHtml(meta.name)],
              ["Email", escapeHtml(meta.email)],
              ["Role", escapeHtml(meta.role)],
              ["Current Game", escapeHtml(meta.gameName)]
            ])}`;

    return renderAdminAccountShell(model, {
      page: "AdminProfile",
      ariaLabel: "Admin profile page",
      className: "admin-terminal-profile-page",
      eyebrow: "Account / profile",
      title: "Profile",
      description: "Manage the admin identity shown inside the game console.",
      primaryHeader: renderAdminAccountPanelHeader("Admin Identity", meta.name, `${meta.role} · ${meta.email}`),
      primaryBody,
      sideHeader: renderAdminAccountPanelHeader("Profile Actions", "Account controls"),
      sideActions: [
        renderAdminAccountAction("Edit Profile", "Name, email, and visible identity", "edit-admin-profile"),
        renderAdminAccountAction("Upload Photo", "Use the pencil on the profile image", "focus-admin-profile-upload"),
        renderAdminAccountAction("View Security", "Sessions and access controls", "open-admin-security"),
        renderAdminAccountAction("Sign Out", "End admin session", "sign-out-admin", "danger")
      ]
    });
  }

  function renderAdminSettingsPage(model) {
    return renderAdminAccountShell(model, {
      page: "AdminSettings",
      ariaLabel: "Admin account settings page",
      eyebrow: "Account / settings",
      title: "Account Settings",
      description: "Set display, sound, and admin-console preferences.",
      stats: [
        ["Display", "Terminal", "dark neon interface", "cyan"],
        ["Sound", "Enabled", "login and action cues", "active"],
        ["Menu", "Hover", "open instantly, close delayed", "warn"],
        ["Density", "Compact", "admin command style", "purple"]
      ],
      primaryHeader: renderAdminAccountPanelHeader("Preference Groups", "Console Behavior", "These are account-level settings, separate from game simulation rules."),
      primaryBody: renderAdminAccountDefinitionList([
        ["Theme", "Dark terminal"],
        ["Accent", "Cyan / amber operational palette"],
        ["Sound Effects", "Enabled"],
        ["Notification Drawer", "Auto-hide after pointer leave"],
        ["Default Page", "Overview"],
        ["Profile Menu", "Top-right account switcher"]
      ]),
      sideHeader: renderAdminAccountPanelHeader("Settings Actions", "Pending backend wiring"),
      sideActions: [
        renderAdminAccountAction("Save Preferences", "Persist account preferences", "save-admin-account-settings"),
        renderAdminAccountAction("Reset Preferences", "Restore terminal defaults", "reset-admin-account-settings"),
        renderAdminAccountAction("Game Settings", "Open simulation-rule settings", "open-game-settings-page")
      ]
    });
  }

  function renderAdminNotificationsPage(model) {
    const notifications = Array.isArray(model.notifications) ? model.notifications : [];
    const notices = notifications.length ? notifications : [
      { tone: "bad", label: "2 players need codes", meta: "Access review" },
      { tone: "warn", label: "3 absent today", meta: "Attendance review" },
      { tone: "purple", label: "Store item out", meta: "Store inventory" }
    ];

    return renderAdminAccountShell(model, {
      page: "AdminNotifications",
      ariaLabel: "Admin notifications page",
      eyebrow: "Account / notifications",
      title: "Notifications",
      description: "Review alerts, delivery preferences, and unresolved admin notices.",
      stats: [
        ["Active", notices.length, "current alert count", "warn"],
        ["Delivery", "In-app", "email later", "cyan"],
        ["Urgent", notices.filter((item) => item.tone === "bad").length, "needs action", "bad"],
        ["Muted", 0, "none muted", "active"]
      ],
      primaryHeader: renderAdminAccountPanelHeader("Alert Inbox", "Notification Queue", "Opened from the bell icon's View more button."),
      primaryBody: `
            <div class="admin-terminal-account-notice-list">
              ${notices.map((item) => `
                <article class="admin-terminal-account-notice ${toneClass(item.tone)}">
                  <span aria-hidden="true"></span>
                  <div>
                    <strong>${escapeHtml(item.label)}</strong>
                    <small>${escapeHtml(item.meta || "Needs review")}</small>
                  </div>
                  <button type="button" data-admin-terminal-action="resolve-admin-notification">Resolve</button>
                </article>
              `).join("")}
            </div>`,
      sideHeader: renderAdminAccountPanelHeader("Delivery Rules", "Alert behavior"),
      sideActions: [
        renderAdminAccountAction("Enable Email Alerts", "Send critical items to email", "enable-email-alerts"),
        renderAdminAccountAction("Mute Low Priority", "Hide minor notices", "mute-low-priority-alerts"),
        renderAdminAccountAction("Mark All Reviewed", "Clear visible queue locally", "mark-notifications-reviewed")
      ]
    });
  }

  function renderAdminSecurityPage(model) {
    const meta = getAdminAccountMeta(model);

    return renderAdminAccountShell(model, {
      page: "AdminSecurity",
      ariaLabel: "Admin security page",
      eyebrow: "Account / security",
      title: "Security",
      description: "Review admin sessions, account access, and sign-out controls.",
      stats: [
        ["Session", "Active", "current browser", "active"],
        ["Role", meta.role, "permission level", "cyan"],
        ["2FA", "Recommended", "not wired yet", "warn"],
        ["Risk", "Low", "no critical alerts", "active"]
      ],
      primaryHeader: renderAdminAccountPanelHeader("Session Controls", "Access Review", meta.email),
      primaryBody: renderAdminAccountDefinitionList([
        ["Current Session", "Browser admin console"],
        ["Access Scope", "Teacher admin"],
        ["Game Access", escapeHtml(meta.gameName)],
        ["Last Security Check", "Just now"]
      ]),
      sideHeader: renderAdminAccountPanelHeader("Security Actions", "Confirmation required"),
      sideActions: [
        renderAdminAccountAction("Review Sessions", "View active devices", "review-admin-sessions"),
        renderAdminAccountAction("Reset Password", "Start recovery flow", "reset-admin-password"),
        renderAdminAccountAction("Sign Out", "Ask before ending session", "sign-out-admin", "danger")
      ]
    });
  }

  function renderAdminHelpPage(model) {
    return renderAdminAccountShell(model, {
      page: "AdminHelp",
      ariaLabel: "Admin help page",
      eyebrow: "Account / help",
      title: "Help",
      description: "Operational support for running the classroom simulation.",
      primaryHeader: renderAdminAccountPanelHeader("Support Topics", "Admin Guide", "Fast references for live simulation management."),
      primaryBody: `
            <div class="admin-terminal-help-grid">
              ${[
                renderAdminAccountAction("Start a Game", "Create, share, and monitor sessions", "open-help-start-game"),
                renderAdminAccountAction("Manage Players", "Roster, access codes, and profile IDs", "open-help-players"),
                renderAdminAccountAction("Scan Attendance", "Auto/manual scanning and corrections", "open-help-attendance"),
                renderAdminAccountAction("Run Market Events", "News drivers and price changes", "open-help-market"),
                renderAdminAccountAction("Store / Rewards", "Prices, stock, and purchase control", "open-help-store"),
                renderAdminAccountAction("Troubleshooting", "Common student issues", "open-help-troubleshooting")
              ].join("")}
            </div>`,
      sideHeader: renderAdminAccountPanelHeader("Need Support?", "Contact / docs"),
      sideActions: [
        renderAdminAccountAction("Copy Diagnostics", "Session and game metadata", "copy-admin-diagnostics"),
        renderAdminAccountAction("Open Docs", "Documentation placeholder", "open-admin-docs"),
        renderAdminAccountAction("Report Issue", "Send a support note", "report-admin-issue")
      ]
    });
  }

  function renderAdminGamesPage(model) {
    const staffSession = getStaffSession();
    const selectedGame = getSelectedGame(staffSession) || {
      name: model.gameName,
      joinCode: model.gameCode,
      status: model.gameStatus
    };

    const rawGames = Array.isArray(staffSession?.activeGameSessions) && staffSession.activeGameSessions.length
      ? staffSession.activeGameSessions
      : [
          selectedGame,
          { name: "Market Simulation Lab", joinCode: "MKT-204", status: "draft" },
          { name: "Period 4 Practice Economy", joinCode: "P4E-881", status: "paused" }
        ];

    const selectedCode = model.gameCode || selectedGame?.joinCode || selectedGame?.gameCode || "—";

    return renderAdminAccountShell(model, {
      page: "AdminGames",
      ariaLabel: "Admin games page",
      eyebrow: "Account / games",
      title: "Game Selection",
      description: "Switch between active games and load a different game into the admin console.",
      primaryHeader: renderAdminAccountPanelHeader("Available Games", "Load Game", "Click a game to switch the current admin console context."),
      primaryBody: `
            <div class="admin-terminal-account-game-grid">
              ${rawGames.filter(Boolean).map((game) => {
                const code = game.joinCode || game.gameCode || "—";
                const current = code === selectedCode || game.name === model.gameName;
                return `
                  <button
                    type="button"
                    class="admin-terminal-account-game-card${current ? " is-current" : ""}"
                    data-admin-terminal-action="switch-admin-game"
                    data-game-id="${escapeHtml(game.id || "")}"
                    data-game-code="${escapeHtml(code)}"
                    data-game-name="${escapeHtml(game.name || "Untitled game")}"
                    data-game-status="${escapeHtml(game.status || "live")}"
                  >
                    <strong>${escapeHtml(game.name || "Untitled game")}</strong>
                    <small>${escapeHtml(code)} · ${escapeHtml(game.status || "live")}</small>
                    <span>${current ? "Current" : "Load Game"}</span>
                  </button>`;
              }).join("")}
            </div>`,
      sideHeader: `<header><span>Current Game</span><strong>${escapeHtml(model.gameName)}</strong><small>Code ${escapeHtml(model.gameCode)}</small></header>`,
      sideActions: [
        renderAdminAccountAction("Share Current Game", "Open share modal", "share-current-game"),
        renderAdminAccountAction("Game Settings", "Simulation rules page", "open-game-settings-page"),
        renderAdminAccountAction("Archive Game", "Confirmation required", "archive-game", "danger")
      ]
    });
  }

  function renderAdminAccountPage(model, section) {
    if (section === "AdminSettings") return renderAdminSettingsPage(model);
    if (section === "AdminNotifications") return renderAdminNotificationsPage(model);
    if (section === "AdminSecurity") return renderAdminSecurityPage(model);
    if (section === "AdminHelp") return renderAdminHelpPage(model);
    if (section === "AdminGames") return renderAdminGamesPage(model);
    return renderAdminProfilePage(model);
  }

  function renderSignOutConfirmModal(model = {}) {
    const meta = getAdminAccountMeta(model);
    return renderModalShell({
      id: "admin-signout-confirm",
      tone: "bad",
      eyebrow: "Confirm sign out",
      title: "Are you sure?",
      body: `
        <div class="admin-terminal-signout-confirm" data-admin-terminal-signout-console>
          <p>You are about to end the admin session for <strong>${escapeHtml(meta.name)}</strong>.</p>
          <dl>
            <div><dt>Account</dt><dd>${escapeHtml(meta.email)}</dd></div>
            <div><dt>Current Game</dt><dd>${escapeHtml(meta.gameName)}</dd></div>
            <div><dt>Game Code</dt><dd>${escapeHtml(meta.gameCode)}</dd></div>
          </dl>
          <small>This prototype will only confirm the action locally. Production should call the real auth sign-out route.</small>
        </div>
      `,
      footer: `
        <button type="button" data-admin-terminal-modal-close>Cancel</button>
        <button type="button" class="danger" data-admin-terminal-action="confirm-admin-signout">Yes, sign out</button>
      `
    });
  }


  function applyAdminTerminalSignedTextClasses(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll([
      ".admin-terminal-player-business-detail-v303 strong",
      ".admin-terminal-player-yield-strip-v303 strong",
      ".admin-terminal-player-stock-row-v303 > b",
      ".admin-terminal-player-log-row-v303 b",
      ".admin-terminal-player-log-row-v303 strong"
    ].join(",")).forEach((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, "").replace("−", "-");
      const positive = /^\+\$[\d,]+(?:\.\d{2})?(?:\/day)?/.test(text);
      const negative = /^-\$[\d,]+(?:\.\d{2})?(?:\/day)?/.test(text) || /^\$-[\d,]+(?:\.\d{2})?(?:\/day)?/.test(text);
      if (!positive && !negative) return;
      node.classList.toggle("is-signed-positive", positive);
      node.classList.toggle("is-positive", positive);
      node.classList.toggle("is-signed-negative", negative);
      node.classList.toggle("is-negative", negative);
      if (negative && text.startsWith("$-")) node.textContent = String(node.textContent || "").replace("$-", "-$");
    });
  }

  function rerenderAdminTerminalWithModel(model, section = null) {
    const shell = document.querySelector("[data-admin-terminal-shell]");
    if (!shell) return;

    const nextSection = normalizeTerminalPageSection(section || window.Econovaria.features.adminOverviewTerminal.currentSection || "Overview");
    const leftMenuSection = getAdminTerminalLeftMenuSection(nextSection);
    const main = shell.querySelector(".admin-terminal-shell-main");
    const menu = shell.querySelector(".admin-terminal-left-menu");

    window.Econovaria.features.adminOverviewTerminal.currentModel = model;
    window.Econovaria.features.adminOverviewTerminal.currentSection = nextSection;
    if (isAdminTerminalLeftMenuSection(nextSection)) {
      setAdminTerminalLeftMenuSection(nextSection);
    }

    if (menu) menu.outerHTML = renderLeftMenu(model, leftMenuSection);
    if (main) {
      main.innerHTML = renderTerminalSection(model, nextSection);
      applyAdminTerminalSignedTextClasses(main);
      scheduleSciIdRankAlignment(main);
      if (nextSection === "Market") startMarketplaceRealtimeFeed(main);
    }

    window.requestAnimationFrame(() => {
      syncInitialMenuStates();
      applyAdminTerminalSignedTextClasses(main || document);
      scheduleSciIdRankAlignment(main || document);
    });
  }

  function openAdminAccountPage(sectionName) {
    const model = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const section = normalizeTerminalPageSection(sectionName);
    rerenderAdminTerminalWithModel(model, section);
    closeAllNotificationDrawers();
    closeAllAdminUserMenus();
    closeAllSharePopups();
  }

  function selectAdminTerminalPlayer(playerRank, announce = false) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const isOpen = String(currentModel.selectedPlayerRank ?? "") === String(playerRank ?? "");
    const nextRank = isOpen ? null : playerRank;
    const nextModel = { ...currentModel, selectedPlayerRank: nextRank };
    rerenderAdminTerminalWithModel(nextModel, "Players");
    if (announce && typeof showGlobalStatus === "function") {
      showGlobalStatus(nextRank ? "ok" : "warn", nextRank ? `Opened player #${playerRank}.` : `Closed player #${playerRank}.`);
    }
  }

  function updatePlayersRosterPage({ page = null, pageSize = null } = {}) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const players = filterPlayersForRoster(
      getTerminalPlayerRows(currentModel),
      currentModel.playersStatusFilter || currentModel.playerStatusFilter || "all",
      currentModel.playersSearch || currentModel.playerRosterSearch || ""
    );
    const allowedPageSizes = [10, 50, 100];
    const nextPageSizeRaw = Number(pageSize || currentModel.playersPerPage || 10);
    const nextPageSize = allowedPageSizes.includes(nextPageSizeRaw) ? nextPageSizeRaw : 10;
    const pageCount = Math.max(1, Math.ceil(players.length / nextPageSize));
    const currentPage = Number(currentModel.playersPage || 1) || 1;
    const nextPage = Math.max(1, Math.min(pageCount, Number(page || currentPage) || 1));
    const selectedStillVisible = players
      .slice((nextPage - 1) * nextPageSize, (nextPage - 1) * nextPageSize + nextPageSize)
      .some((player) => String(player.rank) === String(currentModel.selectedPlayerRank));

    rerenderAdminTerminalWithModel({
      ...currentModel,
      playersPerPage: nextPageSize,
      playersPage: nextPage,
      selectedPlayerRank: selectedStillVisible ? currentModel.selectedPlayerRank : null
    }, "Players");
  }

  function updatePlayersRosterStatusFilter(filter) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const nextFilter = normalizePlayerRosterStatusFilter(filter);
    const matchingPlayers = filterPlayersForRoster(getTerminalPlayerRows(currentModel), nextFilter, currentModel.playersSearch || currentModel.playerRosterSearch || "");
    const selectedStillVisible = matchingPlayers.some((player) => String(player.rank) === String(currentModel.selectedPlayerRank));
    rerenderAdminTerminalWithModel({
      ...currentModel,
      playersStatusFilter: nextFilter,
      playersPage: 1,
      selectedPlayerRank: selectedStillVisible ? currentModel.selectedPlayerRank : null
    }, "Players");
  }

  function updatePlayersRosterSearch(searchValue) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const nextSearch = normalizePlayersRosterSearch(searchValue);
    const matchingPlayers = filterPlayersForRoster(
      getTerminalPlayerRows(currentModel),
      currentModel.playersStatusFilter || currentModel.playerStatusFilter || "all",
      nextSearch
    );
    const selectedStillVisible = matchingPlayers.some((player) => String(player.rank) === String(currentModel.selectedPlayerRank));

    rerenderAdminTerminalWithModel({
      ...currentModel,
      playersSearch: nextSearch,
      playersPage: 1,
      selectedPlayerRank: selectedStillVisible ? currentModel.selectedPlayerRank : null
    }, "Players");

    window.requestAnimationFrame(() => {
      const input = document.querySelector("[data-admin-terminal-players-search]");
      if (!input) return;
      input.focus({ preventScroll: true });
      const end = String(input.value || "").length;
      try { input.setSelectionRange(end, end); } catch (_error) {}
    });
  }

  function switchAdminGameFromAction(action) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const nextGame = {
      id: action.dataset.gameId || "",
      name: action.dataset.gameName || "Untitled game",
      joinCode: action.dataset.gameCode || "—",
      gameCode: action.dataset.gameCode || "—",
      status: action.dataset.gameStatus || "live"
    };

    const nextModel = {
      ...currentModel,
      gameName: nextGame.name,
      gameCode: nextGame.joinCode,
      gameStatus: nextGame.status,
      selectedGame: nextGame
    };

    window.Econovaria.features.adminOverviewTerminal.selectedGameOverride = nextGame;
    rerenderAdminTerminalWithModel(nextModel, "Overview");

    if (typeof showGlobalStatus === "function") {
      showGlobalStatus("ok", `Loaded ${nextGame.name}.`);
    }
  }


  function renderTerminalSection(model, section = "Overview") {
    const normalized = normalizeTerminalPageSection(section);
    window.Econovaria.features.adminOverviewTerminal.currentSection = normalized;
    window.Econovaria.features.adminOverviewTerminal.currentModel = model;

    if (normalized === "Players") return renderPlayersPage(model);
    if (normalized === "Attendance") return renderAttendanceOpsPage(model);
    if (normalized === "Assignments") return renderContractsPage(model);
    if (normalized === "Store") return renderStorePage(model);
    if (normalized === "Market") return renderMarketPage(model);
    if (normalized === "Settings") return renderSettingsPage(model);
    if (normalized === "Logs") return renderLogsPage(model);
    if (normalized === "AdminProfile" || normalized === "AdminSettings" || normalized === "AdminNotifications" || normalized === "AdminSecurity" || normalized === "AdminHelp" || normalized === "AdminGames") return renderAdminAccountPage(model, normalized);
    return render(model);
  }


  function alignSciIdRankToSerial(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll(".admin-terminal-sci-id-card").forEach((card) => {
      const serial = card.querySelector(".admin-terminal-sci-id-serial");
      const rank = card.querySelector(".admin-terminal-sci-id-rank-badge");
      const rankValue = rank?.querySelector("strong") || rank;
      if (!serial || !rank || !rankValue) return;

      rank.style.setProperty("transform", "none", "important");
      const cardRect = card.getBoundingClientRect();
      const serialRect = serial.getBoundingClientRect();
      const rankRect = rank.getBoundingClientRect();
      const rankValueRect = rankValue.getBoundingClientRect();
      if (!cardRect.height || !serialRect.height || !rankRect.height || !rankValueRect.height) return;

      const currentTop = rankRect.top - cardRect.top;
      const delta = serialRect.bottom - rankValueRect.bottom;
      const nextTop = Math.max(0, Math.round((currentTop + delta) * 100) / 100);
      rank.style.setProperty("top", `${nextTop}px`, "important");
      rank.style.setProperty("bottom", "auto", "important");
      rank.dataset.adminRankSerialAligned = "true";
    });
  }

  function scheduleSciIdRankAlignment(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    window.requestAnimationFrame(() => {
      alignSciIdRankToSerial(scope);
      window.requestAnimationFrame(() => alignSciIdRankToSerial(scope));
    });
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => alignSciIdRankToSerial(scope)).catch(() => {});
    }
  }


function bindTerminalModalDismissControls(root) {
    if (!root || root.dataset.dismissControlsBound === "true") return;
    root.dataset.dismissControlsBound = "true";

    root.addEventListener("click", (event) => {
      const closeButton = event.target?.closest?.("[data-admin-terminal-modal-close]");
      const backdrop = event.target?.matches?.("[data-admin-terminal-modal-backdrop]");
      if (!closeButton && !backdrop) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeTerminalModal();
    }, true);
  }

function openTerminalModal(html) {
    const root = getModalRoot();
    root.insertAdjacentHTML("beforeend", html);
    const modalLayer = root.lastElementChild || root;
    document.documentElement.classList.add("admin-terminal-modal-open");
    bindTerminalModalDismissControls(root);

    scheduleSciIdRankAlignment(modalLayer);
    window.requestAnimationFrame(() => {
      const activeScope = modalLayer || root;

      const scanner = activeScope.querySelector("[data-admin-terminal-scanner-console]");
      if (scanner) {
        bindScannerModalControls(activeScope);
        return;
      }

      const contract = activeScope.querySelector("[data-admin-terminal-contract-console]");
      if (contract) {
        bindContractModalControls(activeScope);
        return;
      }

      const player = activeScope.querySelector("[data-admin-terminal-player-console]");
      if (player) {
        bindPlayerModalControls(activeScope);
        return;
      }

      const storeItem = activeScope.querySelector("[data-admin-terminal-store-console]");
      if (storeItem) {
        bindStoreItemModalControls(activeScope);
        return;
      }

      const sharePanel = activeScope.querySelector("[data-admin-terminal-share-console]");
      if (sharePanel) {
        const firstCopyButton = activeScope.querySelector("[data-admin-terminal-action='copy-game-code']");
        firstCopyButton?.focus?.();
        return;
      }

      const firstInput = activeScope.querySelector("input, button, textarea, select, [tabindex]:not([tabindex='-1'])");
      firstInput?.focus?.();
    });
  }

  function render(modelOrCounts = {}) {
    injectStyles();
    const model = modelOrCounts.leaderboard ? modelOrCounts : getOverviewModel(modelOrCounts);
    window.Econovaria.features.adminOverviewTerminal.currentModel = model;

    return `
      <section class="admin-terminal-overview" aria-label="Admin overview terminal">
        <header class="admin-terminal-top">
          <div>
            <span>Market simulation / teacher</span>
            <h2>Overview</h2>
            <p>Scan attendance, add content, and monitor class activity.</p>
          </div>

          <div class="admin-terminal-top-actions">
            <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
              ${bellIcon()}
              ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
            </button>
            <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
              <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
              <i aria-hidden="true"></i>
            </button>
            ${renderNotifications(model)}
            ${renderAdminUserMenu(model)}
          </div>
        </header>

        ${renderQuickActions()}
        ${renderAttendance(model)}

        <div class="admin-terminal-primary-grid">
          ${renderLeaderboard(model.leaderboard)}
          ${renderAssignments(model.assignments)}
        </div>
      </section>`;
  }

  function renderShell(counts = {}) {
    injectStyles();
    const model = getOverviewModel(counts);
    const section = normalizeTerminalPageSection(window.Econovaria.features.adminOverviewTerminal.currentSection || "Overview");
    const leftMenuSection = getAdminTerminalLeftMenuSection(section);

    return `
      <section class="admin-terminal-shell is-collapsed" data-admin-terminal-shell aria-label="Eco Novaria admin terminal">
        ${renderLeftMenu(model, leftMenuSection)}
        <main class="admin-terminal-shell-main">
          ${renderTerminalSection(model, section)}
        </main>
      </section>`;
  }

  function applyShellCollapsed(shell, collapsed) {
    shell.classList.toggle("is-collapsed", collapsed);
  }

  function openMenuNow(shell) {
    window.clearTimeout(shell.__adminTerminalCollapseTimer);
    applyShellCollapsed(shell, false);
  }

  function scheduleMenuCollapse(shell, delay = 1000) {
    window.clearTimeout(shell.__adminTerminalCollapseTimer);

    shell.__adminTerminalCollapseTimer = window.setTimeout(() => {
      applyShellCollapsed(shell, true);
    }, delay);
  }
