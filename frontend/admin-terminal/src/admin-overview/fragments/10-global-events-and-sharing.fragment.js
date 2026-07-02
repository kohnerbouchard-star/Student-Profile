// Global UI interaction layer: drawers, sharing, navigation, and delegated click handling.
  function closeNotificationDrawer(drawer) {
    if (!drawer) return;
    window.clearTimeout(drawer.__adminTerminalCloseTimer);
    drawer.hidden = true;
  }

  function closeAllNotificationDrawers(exceptDrawer = null) {
    document.querySelectorAll("[data-admin-terminal-bell-drawer]").forEach((drawer) => {
      if (drawer !== exceptDrawer) closeNotificationDrawer(drawer);
    });
  }

  function isNotificationDrawerHovering(drawer) {
    if (!drawer) return false;
    const bell = drawer.__adminTerminalBell;

    return Boolean(
      drawer.__adminTerminalHovering ||
      drawer.matches(":hover") ||
      drawer.contains(document.activeElement) ||
      drawer.__adminTerminalBellHovering ||
      bell?.matches(":hover") ||
      bell === document.activeElement ||
      bell?.contains(document.activeElement)
    );
  }

  function scheduleNotificationDrawerClose(drawer, delay = 1000) {
    if (!drawer) return;
    window.clearTimeout(drawer.__adminTerminalCloseTimer);

    drawer.__adminTerminalCloseTimer = window.setTimeout(() => {
      if (!isNotificationDrawerHovering(drawer)) closeNotificationDrawer(drawer);
    }, delay);
  }

  function bindNotificationDrawerHover(drawer, bell = null) {
    if (!drawer) return;

    if (bell) {
      drawer.__adminTerminalBell = bell;

      if (!bell.__adminTerminalBellHoverBound) {
        bell.__adminTerminalBellHoverBound = true;

        bell.addEventListener("pointerenter", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");

          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBell = bell;
          activeDrawer.__adminTerminalBellHovering = true;
          window.clearTimeout(activeDrawer.__adminTerminalCloseTimer);
        });

        bell.addEventListener("pointerleave", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");

          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBellHovering = false;
          scheduleNotificationDrawerClose(activeDrawer, 1000);
        });

        bell.addEventListener("focusin", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");

          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBell = bell;
          activeDrawer.__adminTerminalBellHovering = true;
          window.clearTimeout(activeDrawer.__adminTerminalCloseTimer);
        });

        bell.addEventListener("focusout", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");

          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBellHovering = false;
          scheduleNotificationDrawerClose(activeDrawer, 1000);
        });
      }
    }

    if (drawer.__adminTerminalHoverBound) return;

    drawer.__adminTerminalHoverBound = true;
    drawer.__adminTerminalHovering = false;
    drawer.__adminTerminalBellHovering = false;

    drawer.addEventListener("pointerenter", () => {
      drawer.__adminTerminalHovering = true;
      window.clearTimeout(drawer.__adminTerminalCloseTimer);
    });

    drawer.addEventListener("pointerleave", () => {
      drawer.__adminTerminalHovering = false;
      scheduleNotificationDrawerClose(drawer, 1000);
    });

    drawer.addEventListener("focusin", () => {
      drawer.__adminTerminalHovering = true;
      window.clearTimeout(drawer.__adminTerminalCloseTimer);
    });

    drawer.addEventListener("focusout", () => {
      if (!drawer.contains(document.activeElement)) {
        drawer.__adminTerminalHovering = false;
        scheduleNotificationDrawerClose(drawer, 1000);
      }
    });
  }

  function openNotificationDrawer(drawer, bell = null) {
    if (!drawer) return;
    bindNotificationDrawerHover(drawer, bell);
    closeAllNotificationDrawers(drawer);
    drawer.hidden = false;
    drawer.__adminTerminalHovering = drawer.matches(":hover");
    drawer.__adminTerminalBellHovering = Boolean(bell?.matches(":hover") || bell === document.activeElement);
    scheduleNotificationDrawerClose(drawer, 1000);
  }


  function closeAdminUserMenu(menu) {
    if (!menu) return;
    menu.hidden = true;
    const root = menu.closest(".admin-terminal-overview");
    const button = root?.querySelector("[data-admin-terminal-user]");
    button?.setAttribute("aria-expanded", "false");
  }

  function closeAllAdminUserMenus(exceptMenu = null) {
    document.querySelectorAll("[data-admin-terminal-user-menu]").forEach((menu) => {
      if (menu !== exceptMenu) closeAdminUserMenu(menu);
    });
  }

  function openAdminUserMenu(menu, button = null) {
    if (!menu) return;
    closeAllNotificationDrawers();
    closeAllAdminUserMenus(menu);
    menu.hidden = false;
    button?.setAttribute("aria-expanded", "true");
  }

  function toggleAdminUserMenu(menu, button = null) {
    if (!menu) return;
    if (menu.hidden) openAdminUserMenu(menu, button);
    else closeAdminUserMenu(menu);
  }


  function getTerminalBaseUrl() {
    try {
      const url = new URL(window.location.href);
      url.hash = "";
      return url;
    } catch (_) {
      return null;
    }
  }

  function getTerminalShareUrl(gameCode = "", mode = "student") {
    const code = String(gameCode || "").trim();
    const shareMode = String(mode || "student").trim() || "student";
    const baseUrl = getTerminalBaseUrl();

    if (!baseUrl) {
      return code ? `Student login · Game code ${code}` : "Student login";
    }

    baseUrl.searchParams.set("gameCode", code);
    baseUrl.searchParams.set("mode", shareMode);
    return baseUrl.toString();
  }

  function getTerminalShareText(gameCode = "", gameName = "") {
    const code = String(gameCode || "").trim();
    const name = String(gameName || "").trim() || "Eco Novaria";
    const studentLink = getTerminalShareUrl(code, "student");
    return `Join ${name}\n\nGame code: ${code}\nStudent login: ${studentLink}`;
  }

  function getAdminTerminalCurrentModel() {
    return window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
  }

  function setAdminTerminalCurrentModel(model) {
    window.Econovaria.features.adminOverviewTerminal.currentModel = model;
    return model;
  }

  function showAdminTerminalStatus(tone, message) {
    if (typeof showGlobalStatus === "function") showGlobalStatus(tone, message);
  }

  function isTerminalModalDismissClick(event) {
    return event?.target?.closest?.("[data-admin-terminal-modal-close]") || event?.target?.matches?.("[data-admin-terminal-modal-backdrop]");
  }

  function openTerminalPlayerModalFromAction(action, modalRenderer) {
    const player = getSelectedTerminalPlayer(getAdminTerminalCurrentModel(), action?.dataset?.playerRank);
    openTerminalModal(modalRenderer(player));
  }


  function renderPlayerLogEventDetailModalFromAction(action) {
    const data = action?.dataset || {};
    const value = (key, fallback = "—") => String(data[key] || fallback);
    const eventId = value("logEventId");
    const title = value("logTitle", "Player action");
    const severity = value("logSeverity", "Info");
    const tone = /review|warning|attention|high/i.test(severity) ? "amber" : "cyan";

    return `
      <div class="admin-terminal-modal-backdrop admin-terminal-player-log-modal-backdrop-v464" data-admin-terminal-modal-backdrop data-modal-id="player-log-event-detail">
        <section class="admin-terminal-modal admin-terminal-player-log-modal-v464 is-${escapeHtml(tone)}" role="dialog" aria-modal="true" aria-labelledby="player-log-event-detail-title">
          <header class="admin-terminal-modal-head">
            <div>
              <span>Player log event</span>
              <h3 id="player-log-event-detail-title">${escapeHtml(title)}</h3>
            </div>
            <button class="admin-terminal-modal-close admin-terminal-modal-top-close-v474" type="button" aria-label="Close popup" title="Close" data-admin-terminal-modal-close>×</button>
          </header>

          <div class="admin-terminal-modal-body admin-terminal-player-log-modal-body-v464">
            <section class="admin-terminal-player-log-event-summary-v464">
              <small>${escapeHtml(eventId)}</small>
              <p>${escapeHtml(value("logDetail", "No detail provided."))}</p>
            </section>

            <dl class="admin-terminal-player-log-event-meta-v464">
              <div><dt>Date / time</dt><dd>${escapeHtml(value("logDate"))} · ${escapeHtml(value("logTime"))}</dd></div>
              <div><dt>Actor</dt><dd>${escapeHtml(value("logActor"))}</dd></div>
              <div><dt>Source</dt><dd>${escapeHtml(value("logSource"))}</dd></div>
              <div><dt>Location</dt><dd>${escapeHtml(value("logLocation"))}</dd></div>
              <div><dt>Interacted item</dt><dd>${escapeHtml(value("logItem"))}</dd></div>
              <div><dt>Impact</dt><dd>${escapeHtml(value("logImpact", "Record"))}</dd></div>
            </dl>

            <section class="admin-terminal-player-log-exchange-v464" aria-label="Exchange context">
              <article><span>Before</span><strong>${escapeHtml(value("logBefore"))}</strong></article>
              <article><span>After</span><strong>${escapeHtml(value("logAfter"))}</strong></article>
              <p><span>Context</span><strong>${escapeHtml(value("logContext", "No additional context recorded."))}</strong></p>
            </section>
          </div>
        </section>
      </div>`;
  }

  function renderShareAccessModal({ gameCode = "", gameName = "", gameStatus = "" } = {}) {
    const code = String(gameCode || "").trim();
    const name = String(gameName || "").trim() || "Eco Novaria";
    const status = String(gameStatus || "").trim() || "Active";
    const safeId = code.replace(/[^a-zA-Z0-9_-]/g, "-") || "game";
    const studentLink = getTerminalShareUrl(code, "student");
    const adminLink = getTerminalShareUrl(code, "admin");
    const inviteText = getTerminalShareText(code, name);

    return `
      <div class="admin-terminal-modal-backdrop admin-terminal-share-modal-backdrop" data-admin-terminal-modal-backdrop data-modal-id="share-game-access">
        <section class="admin-terminal-share-modal" role="dialog" aria-modal="true" aria-labelledby="admin-terminal-share-modal-title" data-admin-terminal-share-console>
          <header class="admin-terminal-share-modal-head">
            <div>
              <span>Share Game Access</span>
              <h3 id="admin-terminal-share-modal-title">${escapeHtml(name)}</h3>
              <p>${escapeHtml(status)} · copy links, paste invite text, or open the device share sheet.</p>
            </div>
            <button type="button" aria-label="Close share popup" data-admin-terminal-modal-close>×</button>
          </header>

          <section class="admin-terminal-share-modal-code">
            <div>
              <small>Game Code</small>
              <strong>${escapeHtml(code)}</strong>
            </div>
            <button type="button" data-admin-terminal-action="copy-game-code" data-game-code="${escapeHtml(code)}">Copy Code</button>
          </section>

          <section class="admin-terminal-share-modal-field">
            <label for="admin-terminal-share-student-link-${escapeHtml(safeId)}">Student login link</label>
            <div>
              <input id="admin-terminal-share-student-link-${escapeHtml(safeId)}" type="text" readonly value="${escapeHtml(studentLink)}" />
              <button type="button" data-admin-terminal-action="copy-share-value" data-share-target="admin-terminal-share-student-link-${escapeHtml(safeId)}">Copy</button>
            </div>
          </section>

          <section class="admin-terminal-share-modal-field">
            <label for="admin-terminal-share-admin-link-${escapeHtml(safeId)}">Admin monitor link</label>
            <div>
              <input id="admin-terminal-share-admin-link-${escapeHtml(safeId)}" type="text" readonly value="${escapeHtml(adminLink)}" />
              <button type="button" data-admin-terminal-action="copy-share-value" data-share-target="admin-terminal-share-admin-link-${escapeHtml(safeId)}">Copy</button>
            </div>
          </section>

          <section class="admin-terminal-share-modal-field is-message">
            <label for="admin-terminal-share-invite-${escapeHtml(safeId)}">Copy-paste invite text</label>
            <div>
              <textarea id="admin-terminal-share-invite-${escapeHtml(safeId)}" readonly rows="6">${escapeHtml(inviteText)}</textarea>
              <button type="button" data-admin-terminal-action="copy-share-value" data-share-target="admin-terminal-share-invite-${escapeHtml(safeId)}">Copy</button>
            </div>
          </section>

          <footer class="admin-terminal-share-modal-actions">
            <button type="button" data-admin-terminal-action="open-share-link" data-share-target="admin-terminal-share-student-link-${escapeHtml(safeId)}">
              <strong>Open Student Link</strong>
              <small>Test the login flow</small>
            </button>
            <button type="button" data-admin-terminal-action="share-game-native" data-game-code="${escapeHtml(code)}" data-game-name="${escapeHtml(name)}">
              <strong>System Share</strong>
              <small>Native share sheet or copy fallback</small>
            </button>
          </footer>
        </section>
      </div>`;
  }

  async function copyTerminalShareText(text, successMessage = "Copied.") {
    try {
      await navigator.clipboard?.writeText(String(text || ""));
      showAdminTerminalStatus("ok", successMessage);
      return true;
    } catch (_) {
      showAdminTerminalStatus("warn", "Copy unavailable. Select the value manually.");
      return false;
    }
  }

  function closeAllSharePopups() {}


  function renderAdminTerminalSectionFromButton(sectionButton) {
    if (!sectionButton) return false;

    const requestedSection = sectionButton.dataset.adminSection || "Overview";
    const nextSection = normalizeTerminalPageSection(requestedSection);
    const renderableSections = new Set([
      "Overview",
      "Players",
      "Attendance",
      "Assignments",
      "Store",
      "Market",
      "Settings",
      "Logs",
      "AdminProfile",
      "AdminSettings",
      "AdminNotifications",
      "AdminSecurity",
      "AdminHelp",
      "AdminGames"
    ]);

    if (!renderableSections.has(nextSection)) {
      showAdminTerminalStatus("warn", `${requestedSection === "Assignments" ? "Contracts" : requestedSection} page is planned for the next pass.`);
      return true;
    }

    const shell = sectionButton.closest("[data-admin-terminal-shell]") || document.querySelector("[data-admin-terminal-shell]");
    const main = shell?.querySelector(".admin-terminal-shell-main");
    const menu = shell?.querySelector(".admin-terminal-left-menu");
    const model = getAdminTerminalCurrentModel();

    window.Econovaria.features.adminOverviewTerminal.currentSection = nextSection;
    setAdminTerminalCurrentModel(model);
    setAdminTerminalLeftMenuSection(nextSection);

    if (menu) menu.outerHTML = renderLeftMenu(model, getAdminTerminalLeftMenuSection(nextSection));
    if (main) {
      main.innerHTML = renderTerminalSection(model, nextSection);
      if (typeof applyAdminTerminalSignedTextClasses === "function") applyAdminTerminalSignedTextClasses(main);
      if (nextSection === "Market") startMarketplaceRealtimeFeed(main);
    }

    closeAllNotificationDrawers();
    closeAllAdminUserMenus();
    closeAllSharePopups();

    window.requestAnimationFrame(() => {
      syncInitialMenuStates();
      if (typeof applyAdminTerminalSignedTextClasses === "function") applyAdminTerminalSignedTextClasses(main || document);
    });
    return true;
  }


  function handleTerminalEscapeKey(event) {
    if (event.key !== "Escape") return;
    closeAllNotificationDrawers();
    closeAllAdminUserMenus();
    closeAllSharePopups();
  }

  function bindTerminalEscapeKeyEvents() {
    document.addEventListener("keydown", handleTerminalEscapeKey);
  }

  function applyContractsLedgerFilter(page, filter = "all") {
    if (!page) return 0;

    page.querySelectorAll("[data-contract-filter-controls]").forEach((controls) => {
      controls.querySelectorAll("[data-admin-terminal-action]").forEach((button) => {
        const isActive = button.dataset.contractFilter === filter;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    });

    let visibleCount = 0;
    page.querySelectorAll("[data-contract-row]").forEach((row) => {
      const rowFilter = row.dataset.contractFilter || "active";
      const shouldShow = filter === "all" || rowFilter === filter;
      row.hidden = !shouldShow;
      if (shouldShow) visibleCount += 1;
    });

    page.querySelectorAll("[data-contract-filter-empty]").forEach((empty) => {
      empty.hidden = visibleCount > 0;
    });

    return visibleCount;
  }

  function filterContractsLedgerFromAction(action) {
    const page = action.closest(".admin-terminal-contracts-page");
    if (!page) return;

    let filter = action.dataset.contractFilter || "all";
    const actionName = action.dataset.adminTerminalAction || "";
    if (actionName.startsWith("filter-contracts-") && !action.dataset.contractFilter) {
      const legacy = actionName.replace("filter-contracts-", "");
      filter = legacy === "submitted" ? "review" : legacy === "active" ? "all" : legacy;
    }

    applyContractsLedgerFilter(page, filter);

    const label = action.textContent?.trim()?.replace(/\s+\d+$/, "") || "Contracts";
    showAdminTerminalStatus("ok", `${label} filter applied.`);
  }


  function applyStoreCatalogFilter(page, filter = "all") {
    if (!page) return 0;

    const controls = page.querySelector("[data-store-filter-controls]");
    controls?.querySelectorAll("[data-admin-terminal-action]").forEach((button) => {
      const isActive = button.dataset.storeFilter === filter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    let visibleCount = 0;
    page.querySelectorAll("[data-store-item]").forEach((item) => {
      const status = item.dataset.storeStatus || "active";
      const risk = item.dataset.storeRisk || "clear";
      const kind = item.dataset.storeKind || "consumables";
      const source = item.dataset.storeSource || "custom";
      const shouldShow = filter === "all" || status === filter || kind === filter || source === filter || (filter === "risk" && risk === "risk");
      item.hidden = !shouldShow;
      if (shouldShow) visibleCount += 1;
    });

    page.querySelectorAll("[data-store-filter-empty]").forEach((empty) => {
      empty.hidden = visibleCount > 0;
    });

    return visibleCount;
  }

  function filterStoreCatalogFromAction(action) {
    const page = action.closest(".admin-terminal-store-page");
    if (!page) return;

    let filter = action.dataset.storeFilter || "all";
    const actionName = action.dataset.adminTerminalAction || "";
    if (actionName.startsWith("filter-store-") && !action.dataset.storeFilter) {
      filter = actionName.replace("filter-store-", "") || "all";
    }

    applyStoreCatalogFilter(page, filter);

    const label = action.textContent?.trim() || "Store";
    showAdminTerminalStatus("ok", `${label} filter applied.`);
  }



  function getMarketplacePageFromNode(node) {
    return node?.closest?.(".admin-terminal-market-page") || document.querySelector(".admin-terminal-market-page");
  }

  function getMarketplaceChartRootFromNode(node) {
    return node?.closest?.("[data-marketplace-chart-root]") || document.querySelector("[data-marketplace-chart-root]");
  }

  function formatMarketplaceRealtimePrice(value, currency = "NRC") {
    const number = Number(value) || 0;
    const formatted = number >= 1000 ? number.toFixed(0) : number >= 100 ? number.toFixed(1) : number.toFixed(2);
    return `${formatted} ${currency}`;
  }

  function updateMarketplaceLiveNodes(page, nextPrice, nextChange, currency = "NRC") {
    if (!page) return;
    const tone = nextChange >= 0 ? "is-up" : "is-down";
    const changeLabel = `${nextChange >= 0 ? "+" : ""}${nextChange.toFixed(2)}%`;
    page.querySelectorAll("[data-marketplace-live-price]").forEach((node) => {
      node.textContent = node.tagName === "STRONG" ? formatMarketplaceRealtimePrice(nextPrice, currency) : (nextPrice >= 1000 ? nextPrice.toFixed(0) : nextPrice >= 100 ? nextPrice.toFixed(1) : nextPrice.toFixed(2));
      node.classList.add("is-live-updated");
      window.setTimeout(() => node.classList.remove("is-live-updated"), 450);
    });
    page.querySelectorAll("[data-marketplace-live-change]").forEach((node) => {
      node.textContent = changeLabel;
      node.classList.toggle("is-up", nextChange >= 0);
      node.classList.toggle("is-down", nextChange < 0);
    });
    page.querySelectorAll("[data-marketplace-price-tag]").forEach((node) => {
      node.textContent = nextPrice >= 1000 ? nextPrice.toFixed(0) : nextPrice >= 100 ? nextPrice.toFixed(1) : nextPrice.toFixed(2);
    });
    page.querySelectorAll("[data-marketplace-feed-status]").forEach((node) => {
      const label = node.querySelector("b") || node;
      label.textContent = "Live";
      node.classList.add("is-live");
    });
    page.querySelectorAll("[data-marketplace-last-tick]").forEach((node) => {
      node.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    });
    const ticketLimit = page.querySelector("[data-marketplace-order-limit]");
    if (ticketLimit && document.activeElement !== ticketLimit) ticketLimit.value = nextPrice.toFixed(2);
    const activeRow = page.querySelector("[data-market-security-row].is-selected");
    if (activeRow) {
      activeRow.dataset.marketPrice = nextPrice.toFixed(2);
      activeRow.dataset.marketChange = nextChange.toFixed(2);
    }
    page.classList.toggle("is-market-live-up", tone === "is-up");
    page.classList.toggle("is-market-live-down", tone === "is-down");
  }

  function startMarketplaceRealtimeFeed(root = document) {
    const page = root?.querySelector?.(".admin-terminal-market-page") || document.querySelector(".admin-terminal-market-page");
    if (!page) return;
    const feature = window.Econovaria.features.adminOverviewTerminal;
    if (feature.marketplaceRealtimeTimer) {
      window.clearInterval(feature.marketplaceRealtimeTimer);
      feature.marketplaceRealtimeTimer = null;
    }
    const chart = page.querySelector("[data-marketplace-chart-root]");
    if (!chart) return;
    const currency = chart.dataset.marketplaceChartCurrency || "NRC";
    let basePrice = Number(chart.dataset.marketplaceChartPrice || page.querySelector("[data-market-security-row].is-selected")?.dataset.marketPrice || 0) || 1;
    let tick = 0;
    const step = () => {
      const wave = Math.sin((Date.now() / 1300) + tick) * 0.0018;
      const micro = ((tick % 3) - 1) * 0.0009;
      basePrice = Math.max(0.01, basePrice * (1 + wave + micro));
      tick += 1;
      const change = ((basePrice / (Number(chart.dataset.marketplaceChartPrice || basePrice) || basePrice)) - 1) * 100;
      updateMarketplaceLiveNodes(page, basePrice, change, currency);
    };
    window.requestAnimationFrame(step);
    feature.marketplaceRealtimeTimer = window.setInterval(step, 2200);
  }

  function handleMarketplaceTimeframe(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const range = action.dataset.marketplaceTimeframe || "1M";
    chart.dataset.marketplaceTimeframe = range;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-timeframe"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });

    let selectedFrame = null;
    chart.querySelectorAll("[data-marketplace-chart-frame]").forEach((frame) => {
      const active = frame.dataset.marketplaceChartFrame === range;
      frame.hidden = !active;
      frame.classList.toggle("is-active", active);
      if (active) selectedFrame = frame;
    });

    const label = chart.querySelector("[data-marketplace-chart-window]");
    if (label) label.textContent = selectedFrame?.dataset.marketplaceChartWindowLabel || `${range} window`;

    const livePrice = chart.querySelector(".admin-terminal-marketplace-chart-ranges [data-marketplace-live-price]");
    if (livePrice && selectedFrame?.dataset.marketplaceRangeLivePrice) {
      const currency = chart.dataset.marketplaceChartCurrency || "NRC";
      livePrice.textContent = `${selectedFrame.dataset.marketplaceRangeLivePrice} ${currency}`;
    }

    const liveChange = chart.querySelector(".admin-terminal-marketplace-chart-ranges [data-marketplace-live-change]");
    if (liveChange && selectedFrame?.dataset.marketplaceRangeLiveChange) {
      liveChange.textContent = selectedFrame.dataset.marketplaceRangeLiveChange;
      liveChange.classList.toggle("is-up", selectedFrame.dataset.marketplaceRangeLiveTone === "is-up");
      liveChange.classList.toggle("is-down", selectedFrame.dataset.marketplaceRangeLiveTone === "is-down");
    }

    const rangeChange = chart.querySelector("[data-marketplace-range-change]");
    if (rangeChange && selectedFrame?.dataset.marketplaceRangeTotalChange) {
      rangeChange.textContent = selectedFrame.dataset.marketplaceRangeTotalChange;
      rangeChange.classList.toggle("is-up", selectedFrame.dataset.marketplaceRangeTotalTone === "is-up");
      rangeChange.classList.toggle("is-down", selectedFrame.dataset.marketplaceRangeTotalTone === "is-down");
    }

    const axisMode = selectedFrame?.dataset.marketplaceAxisMode || "days";
    chart.querySelectorAll("[data-marketplace-chart-tooltip]").forEach((tooltip) => {
      tooltip.classList.remove("is-visible");
      tooltip.hidden = true;
    });
    chart.classList.add("is-timeframe-updated");
    window.setTimeout(() => chart.classList.remove("is-timeframe-updated"), 500);
    showAdminTerminalStatus("ok", `${range} chart window selected · x-axis switched to ${axisMode}.`);
  }


  function closeMarketplaceChartDropdowns(scope = document, exceptMenu = "") {
    const root = scope?.querySelectorAll ? scope : document;
    root.querySelectorAll("[data-marketplace-chart-menu]").forEach((menu) => {
      if (exceptMenu && menu.dataset.marketplaceChartMenu === exceptMenu) return;
      menu.hidden = true;
    });
    root.querySelectorAll("[data-marketplace-chart-menu-toggle]").forEach((button) => {
      if (exceptMenu && button.dataset.marketplaceChartMenuToggle === exceptMenu) return;
      button.setAttribute("aria-expanded", "false");
    });
  }

  function toggleMarketplaceChartMenu(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const menuName = action.dataset.marketplaceChartMenuToggle || "style";
    const menu = chart.querySelector(`[data-marketplace-chart-menu="${menuName}"]`);
    if (!menu) return;
    const willOpen = menu.hidden;
    closeMarketplaceChartDropdowns(chart, willOpen ? menuName : "");
    menu.hidden = !willOpen;
    action.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  function handleMarketplaceChartStyle(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const style = action.dataset.marketplaceChartStyle || "candle";
    const label = action.textContent?.trim() || style;
    chart.dataset.marketplaceChartStyle = style;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-chart-style"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });
    const labelNode = chart.querySelector("[data-marketplace-chart-type-label]");
    if (labelNode) labelNode.textContent = label;
    closeMarketplaceChartDropdowns(chart);
    chart.classList.add("is-chart-control-updated");
    window.setTimeout(() => chart.classList.remove("is-chart-control-updated"), 420);
    showAdminTerminalStatus("ok", `${label} chart selected.`);
  }

  function handleMarketplaceChartCompare(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const compare = action.dataset.marketplaceChartCompare || "none";
    const label = action.dataset.marketplaceChartCompareLabel || action.querySelector("strong")?.textContent?.trim() || action.textContent?.trim() || "Compare";
    chart.dataset.marketplaceCompare = compare;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-chart-compare"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });
    chart.querySelectorAll("[data-marketplace-compare-line]").forEach((line) => {
      const active = compare !== "none" && line.dataset.marketplaceCompareLine === compare;
      line.classList.toggle("is-active", active);
    });
    const labelNode = chart.querySelector("[data-marketplace-compare-label]");
    if (labelNode) labelNode.textContent = compare === "none" ? "Compare" : `Compare: ${label}`;
    closeMarketplaceChartDropdowns(chart);
    chart.classList.add("is-chart-control-updated");
    window.setTimeout(() => chart.classList.remove("is-chart-control-updated"), 420);
    showAdminTerminalStatus("ok", compare === "none" ? "Comparison cleared." : `${label} comparison shown.`);
  }

  function handleMarketplaceChartIndicator(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const indicator = action.dataset.marketplaceChartIndicator || "none";
    const label = action.textContent?.trim() || "Indicators";
    chart.dataset.marketplaceIndicator = indicator;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-chart-indicator"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });
    const labelNode = chart.querySelector("[data-marketplace-indicator-label]");
    if (labelNode) labelNode.textContent = indicator === "none" ? "Indicators" : label;
    closeMarketplaceChartDropdowns(chart);
    showAdminTerminalStatus("ok", indicator === "none" ? "Indicator cleared." : `${label} indicator shown.`);
  }

  function positionMarketplaceChartTooltip(event, tooltip, frame) {
    if (!event || !tooltip || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const offset = 16;
    const width = tooltip.offsetWidth || 230;
    const height = tooltip.offsetHeight || 72;
    let left = event.clientX - bounds.left + offset;
    let top = event.clientY - bounds.top + offset;

    if (left + width > bounds.width - 10) left = event.clientX - bounds.left - width - offset;
    if (top + height > bounds.height - 10) top = event.clientY - bounds.top - height - offset;

    tooltip.style.left = `${Math.max(10, left)}px`;
    tooltip.style.top = `${Math.max(10, top)}px`;
    tooltip.style.right = "auto";
    tooltip.style.bottom = "auto";
  }

  function formatMarketplaceChartTooltipContent(target, chart) {
    const style = chart?.dataset?.marketplaceChartStyle || "candle";
    const time = target?.dataset?.chartTime || "Market point";
    const volume = target?.dataset?.chartVolume || "—";
    const price = target?.dataset?.chartPrice || target?.dataset?.chartClose || "—";
    const change = target?.dataset?.chartChange || "—";
    if (style === "candle" || style === "bar") {
      return `<span>${time}</span><b>O ${target.dataset.chartOpen || "—"} · H ${target.dataset.chartHigh || "—"} · L ${target.dataset.chartLow || "—"} · C ${target.dataset.chartClose || "—"}</b><small>Volume ${volume}</small>`;
    }
    const changeTone = String(change).trim().startsWith("-") ? "is-down" : "is-up";
    return `<span>${time}</span><b>Price ${price} <em class="${changeTone}">${change}</em></b><small>Volume ${volume}</small>`;
  }

  function updateMarketplaceHoverGuide(target, frame) {
    const guide = frame?.querySelector?.("[data-marketplace-hover-guide]");
    if (!guide || !target?.dataset?.chartX) return;
    guide.setAttribute("x1", target.dataset.chartX);
    guide.setAttribute("x2", target.dataset.chartX);
    guide.removeAttribute("visibility");
    guide.classList?.add?.("is-visible");
  }

  function hideMarketplaceHoverGuide(node) {
    const frame = node?.closest?.("[data-marketplace-chart-frame]");
    const guide = frame?.querySelector?.("[data-marketplace-hover-guide]");
    if (!guide) return;
    guide.setAttribute("visibility", "hidden");
    guide.classList?.remove?.("is-visible");
  }

  function handleMarketplaceCandleHover(event) {
    const target = event.target?.closest?.("[data-marketplace-candle-hit]");
    if (!target) return;
    const chart = getMarketplaceChartRootFromNode(target);
    const frame = target.closest("[data-marketplace-chart-frame]");
    const tooltip = frame?.querySelector?.("[data-marketplace-chart-tooltip]");
    if (!tooltip || !frame) return;
    tooltip.innerHTML = formatMarketplaceChartTooltipContent(target, chart);
    tooltip.hidden = false;
    tooltip.classList.add("is-visible");
    updateMarketplaceHoverGuide(target, frame);
    positionMarketplaceChartTooltip(event, tooltip, frame);
  }

  function handleMarketplaceCandleMove(event) {
    const target = event.target?.closest?.("[data-marketplace-candle-hit]");
    if (!target) return;
    const chart = getMarketplaceChartRootFromNode(target);
    const frame = target.closest("[data-marketplace-chart-frame]");
    const tooltip = frame?.querySelector?.("[data-marketplace-chart-tooltip]");
    if (!tooltip || !frame) return;
    if (!tooltip.classList.contains("is-visible")) handleMarketplaceCandleHover(event);
    else tooltip.innerHTML = formatMarketplaceChartTooltipContent(target, chart);
    updateMarketplaceHoverGuide(target, frame);
    positionMarketplaceChartTooltip(event, tooltip, frame);
  }

  function hideMarketplaceChartTooltip(node) {
    const frame = node?.closest?.("[data-marketplace-chart-frame]");
    const chart = getMarketplaceChartRootFromNode(node);
    const tooltips = frame ? frame.querySelectorAll("[data-marketplace-chart-tooltip]") : chart?.querySelectorAll?.("[data-marketplace-chart-tooltip]");
    hideMarketplaceHoverGuide(node);
    if (!tooltips) return;
    tooltips.forEach((tooltip) => {
      tooltip.classList.remove("is-visible");
      tooltip.hidden = true;
    });
  }

  function handleMarketplaceCandleOut(event) {
    const target = event.target?.closest?.("[data-marketplace-candle-hit]");
    if (!target) return;
    const nextHit = event.relatedTarget?.closest?.("[data-marketplace-candle-hit]");
    if (nextHit && nextHit.closest("[data-marketplace-chart-frame]") === target.closest("[data-marketplace-chart-frame]")) return;
    hideMarketplaceChartTooltip(target);
  }


  function getMarketplaceFilterState(page) {
    return {
      query: (page.querySelector("[data-marketplace-search]")?.value || "").trim().toLowerCase(),
      type: page.querySelector('[data-marketplace-filter="type"]')?.value || "all",
      location: page.querySelector('[data-marketplace-filter="location"]')?.value || "all",
      sector: page.querySelector('[data-marketplace-filter="sector"]')?.value || "all",
      price: page.querySelector('[data-marketplace-filter="price"]')?.value || "all",
      sort: page.querySelector("[data-marketplace-sort]")?.value || "symbol"
    };
  }

  function getMarketplaceRowPrice(row) {
    return Number(row?.dataset?.marketPrice || 0) || 0;
  }

  function getMarketplaceRowChange(row) {
    return Number(row?.dataset?.marketChange || 0) || 0;
  }

  function rowMatchesMarketplacePrice(row, priceBand) {
    const price = getMarketplaceRowPrice(row);
    if (priceBand === "under-50") return price < 50;
    if (priceBand === "50-100") return price >= 50 && price <= 100;
    if (priceBand === "100-250") return price > 100 && price <= 250;
    if (priceBand === "over-250") return price > 250;
    return true;
  }

  function applyMarketplaceFilters(page = document.querySelector(".admin-terminal-market-page")) {
    if (!page) return 0;
    const state = getMarketplaceFilterState(page);
    const list = page.querySelector("[data-marketplace-list]");
    const rows = Array.from(page.querySelectorAll("[data-market-security-row]"));

    rows.forEach((row) => {
      const text = [row.dataset.marketSymbol, row.dataset.marketName, row.dataset.marketType, row.dataset.marketLocation, row.dataset.marketSector].join(" ").toLowerCase();
      const matchesSearch = !state.query || text.includes(state.query);
      const matchesType = state.type === "all" || row.dataset.marketType === state.type;
      const matchesLocation = state.location === "all" || row.dataset.marketLocation === state.location;
      const matchesSector = state.sector === "all" || row.dataset.marketSector === state.sector;
      const matchesPrice = rowMatchesMarketplacePrice(row, state.price);
      row.hidden = !(matchesSearch && matchesType && matchesLocation && matchesSector && matchesPrice);
    });

    const sortedRows = rows.slice().sort((a, b) => {
      if (state.sort === "price-asc") return getMarketplaceRowPrice(a) - getMarketplaceRowPrice(b);
      if (state.sort === "price-desc") return getMarketplaceRowPrice(b) - getMarketplaceRowPrice(a);
      if (state.sort === "change-desc") return getMarketplaceRowChange(b) - getMarketplaceRowChange(a);
      if (state.sort === "change-asc") return getMarketplaceRowChange(a) - getMarketplaceRowChange(b);
      return String(a.dataset.marketSymbol || "").localeCompare(String(b.dataset.marketSymbol || ""));
    });
    sortedRows.forEach((row) => list?.appendChild(row));

    const visibleCount = rows.filter((row) => !row.hidden).length;
    page.querySelectorAll("[data-marketplace-visible-count]").forEach((count) => { count.textContent = String(visibleCount); });
    const empty = page.querySelector("[data-marketplace-empty]");
    if (empty) empty.hidden = visibleCount > 0;
    return visibleCount;
  }

  function clearMarketplaceFilters(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const search = page.querySelector("[data-marketplace-search]");
    if (search) search.value = "";
    page.querySelectorAll("[data-marketplace-filter]").forEach((select) => { select.value = "all"; });
    const sort = page.querySelector("[data-marketplace-sort]");
    if (sort) sort.value = "symbol";
    applyMarketplaceFilters(page);
    showAdminTerminalStatus("ok", "Marketplace filters cleared.");
  }

  function parseMarketplaceRowOptions(row) {
    try {
      const parsed = JSON.parse(row?.dataset?.marketOptions || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function getMarketplaceOptionTypeFromInstrument(value = "Stock") {
    const normalized = String(value || "Stock").toLowerCase();
    if (normalized.includes("call")) return "Call";
    if (normalized.includes("put")) return "Put";
    return "Stock";
  }

  function rebuildMarketplaceInstrumentSelect(select, optionContracts) {
    if (!select) return;
    const current = select.value || "Stock";
    const types = new Set((optionContracts || []).map((option) => String(option.type || "").toLowerCase()));
    select.innerHTML = "";
    select.append(new Option("Stock", "Stock"));
    if (types.has("call")) select.append(new Option("Call option", "Call Option"));
    if (types.has("put")) select.append(new Option("Put option", "Put Option"));
    select.value = Array.from(select.options).some((option) => option.value === current) ? current : "Stock";
  }

  function rebuildMarketplaceContractSelect(select, optionContracts, instrument = "Stock", symbol = "—", currency = "NRC") {
    if (!select) return null;
    const optionType = getMarketplaceOptionTypeFromInstrument(instrument);
    const filtered = optionType === "Stock" ? [] : (optionContracts || []).filter((option) => String(option.type || "").toLowerCase() === optionType.toLowerCase());
    select.innerHTML = "";
    if (!filtered.length) {
      select.append(new Option("No option contracts listed", ""));
      select.disabled = true;
      return null;
    }
    filtered.forEach((contract) => {
      const premium = contract.premium || "0.00";
      const label = `${contract.type || optionType} ${contract.strike || "—"} · ${contract.expiry || "—"} · ${premium} ${currency}`;
      const value = [contract.type || optionType, contract.strike || "—", contract.expiry || "—", premium].map((part) => String(part).replace(/\|/g, "/")).join("|");
      const option = new Option(label, value);
      option.dataset.optionSymbol = symbol;
      option.dataset.optionType = contract.type || optionType;
      option.dataset.optionStrike = contract.strike || "—";
      option.dataset.optionExpiry = contract.expiry || "—";
      option.dataset.optionPremium = premium;
      select.append(option);
    });
    select.disabled = false;
    return select.selectedOptions?.[0] || select.options[0] || null;
  }

  function applyMarketplaceInstrumentSelection(page, options = {}) {
    if (!page) return;
    const instrument = page.querySelector("[data-marketplace-instrument]");
    const contractField = page.querySelector("[data-marketplace-contract-field]");
    const contractSelect = page.querySelector("[data-marketplace-option-contract]");
    const loadout = page.querySelector("[data-marketplace-option-loadout]");
    const label = page.querySelector("[data-marketplace-option-summary]");
    const limit = page.querySelector("[data-marketplace-order-limit]");
    const symbol = page.querySelector("[data-marketplace-ticket-symbol]")?.textContent?.trim() || "—";
    const currency = page.dataset.marketplaceTicketCurrency || "NRC";
    const optionContracts = (() => {
      try {
        const parsed = JSON.parse(page.dataset.marketplaceTicketOptions || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (_error) {
        return [];
      }
    })();
    const selectedInstrument = instrument?.value || "Stock";
    const isOptionInstrument = selectedInstrument !== "Stock";
    if (contractField) contractField.hidden = !isOptionInstrument;
    if (!isOptionInstrument) {
      if (loadout) loadout.hidden = true;
      if (label) label.textContent = "Stock order selected";
      return;
    }
    const selectedContract = options.rebuild === false
      ? (contractSelect?.selectedOptions?.[0] || contractSelect?.options?.[0] || null)
      : rebuildMarketplaceContractSelect(contractSelect, optionContracts, selectedInstrument, symbol, currency);
    const premium = selectedContract?.dataset?.optionPremium || "0.00";
    const summary = selectedContract
      ? `${symbol} ${selectedContract.dataset.optionType || selectedInstrument} ${selectedContract.dataset.optionStrike || "—"} · ${selectedContract.dataset.optionExpiry || "—"} · premium ${premium}`
      : `${symbol} ${selectedInstrument}`;
    if (label) label.textContent = summary;
    if (loadout) loadout.hidden = false;
    if (limit && premium) limit.value = premium;
  }

  function updateMarketplaceTicket(page, row) {
    if (!page || !row) return;
    const symbol = row.dataset.marketSymbol || "—";
    const name = row.dataset.marketName || "Selected security";
    const price = row.dataset.marketPrice || "0.00";
    const currency = row.dataset.marketCurrency || "NRC";
    const optionContracts = parseMarketplaceRowOptions(row);
    const symbolNode = page.querySelector("[data-marketplace-ticket-symbol]");
    const nameNode = page.querySelector("[data-marketplace-ticket-name]");
    const limitInput = page.querySelector("[data-marketplace-order-limit]");
    const preview = page.querySelector("[data-marketplace-order-preview]");
    const instrument = page.querySelector("[data-marketplace-instrument]");
    const contractSelect = page.querySelector("[data-marketplace-option-contract]");
    const contractField = page.querySelector("[data-marketplace-contract-field]");
    const optionLoadout = page.querySelector("[data-marketplace-option-loadout]");
    const optionLabel = page.querySelector("[data-marketplace-option-summary]");
    if (symbolNode) symbolNode.textContent = symbol;
    if (nameNode) nameNode.textContent = name;
    if (limitInput) limitInput.value = price;
    if (preview) preview.textContent = "Select quantity and preview the order before submitting.";
    page.dataset.marketplaceTicketOptions = JSON.stringify(optionContracts);
    page.dataset.marketplaceTicketCurrency = currency;
    rebuildMarketplaceInstrumentSelect(instrument, optionContracts);
    if (instrument) instrument.value = "Stock";
    rebuildMarketplaceContractSelect(contractSelect, optionContracts, "Stock", symbol, currency);
    if (contractField) contractField.hidden = true;
    if (optionLoadout) optionLoadout.hidden = true;
    if (optionLabel) optionLabel.textContent = "Stock order selected";
  }

  function selectMarketplaceSecurity(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const symbol = action.dataset.marketSymbol || action.closest("[data-market-security-row]")?.dataset.marketSymbol;
    const safeSymbol = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(symbol || "") : String(symbol || "").replace(/(["\\])/g, "\\$1");
    const row = page.querySelector(`[data-market-security-row][data-market-symbol="${safeSymbol}"]`);
    const template = page.querySelector(`[data-marketplace-profile-template="${safeSymbol}"]`);
    const profile = page.querySelector("[data-marketplace-profile]");
    if (template && profile) {
      profile.innerHTML = template.innerHTML;
    }
    page.querySelectorAll("[data-market-security-row]").forEach((item) => item.classList.toggle("is-selected", item === row));
    updateMarketplaceTicket(page, row);
    startMarketplaceRealtimeFeed(page);
    showAdminTerminalStatus("ok", `${symbol || "Security"} profile opened.`);
  }

  function getMarketplaceCurrentTicket(page) {
    const symbol = page.querySelector("[data-marketplace-ticket-symbol]")?.textContent?.trim() || "—";
    const name = page.querySelector("[data-marketplace-ticket-name]")?.textContent?.trim() || "Selected security";
    const instrument = page.querySelector("[data-marketplace-instrument]")?.value || "Stock";
    const side = page.querySelector("[data-marketplace-order-side]")?.value || "Buy";
    const type = page.querySelector("[data-marketplace-order-type]")?.value || "Market";
    const qty = Math.max(1, Math.floor(Number(page.querySelector("[data-marketplace-order-qty]")?.value || 1) || 1));
    const limit = Number(page.querySelector("[data-marketplace-order-limit]")?.value || 0) || 0;
    const stop = Number(page.querySelector("[data-marketplace-order-stop]")?.value || 0) || 0;
    const tif = page.querySelector("[data-marketplace-order-tif]")?.value || "Day";
    const optionLoadout = page.querySelector("[data-marketplace-option-loadout]");
    const optionSummary = instrument !== "Stock" && optionLoadout && !optionLoadout.hidden
      ? page.querySelector("[data-marketplace-option-summary]")?.textContent?.trim() || ""
      : "";
    return { symbol, name, instrument, side, type, qty, limit, stop, tif, optionSummary };
  }

  function renderMarketplaceOrderSummary(ticket) {
    const notional = ticket.qty * ticket.limit;
    const stopText = ticket.stop ? ` · stop ${ticket.stop.toFixed(2)}` : "";
    const instrumentText = ticket.instrument === "Stock" ? ticket.symbol : (ticket.optionSummary || `${ticket.symbol} ${ticket.instrument}`);
    return `${ticket.side} ${ticket.qty} ${instrumentText} · ${ticket.type} @ ${ticket.limit.toFixed(2)} · est. notional ${notional.toFixed(2)} NRC · ${ticket.tif}${stopText}`;
  }

  function previewMarketplaceOrder(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const ticket = getMarketplaceCurrentTicket(page);
    const preview = page.querySelector("[data-marketplace-order-preview]");
    if (preview) preview.textContent = renderMarketplaceOrderSummary(ticket);
    showAdminTerminalStatus("ok", "Marketplace order preview updated.");
  }

  function placeMarketplaceOrder(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const ticket = getMarketplaceCurrentTicket(page);
    const preview = page.querySelector("[data-marketplace-order-preview]");
    if (preview) preview.textContent = `Preview only: ${renderMarketplaceOrderSummary(ticket)}. This order was not submitted.`;
    showAdminTerminalStatus("warn", "Marketplace execution is preview-only until backend stock order wiring is connected.");
  }

  function loadMarketplaceOption(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const optionType = action.dataset.optionType || "Option";
    const instrument = page.querySelector("[data-marketplace-instrument]");
    if (instrument) instrument.value = optionType.toLowerCase() === "put" ? "Put Option" : "Call Option";
    applyMarketplaceInstrumentSelection(page);
    const contractSelect = page.querySelector("[data-marketplace-option-contract]");
    if (contractSelect) {
      Array.from(contractSelect.options).forEach((option) => {
        option.selected = option.dataset.optionType === action.dataset.optionType && option.dataset.optionStrike === action.dataset.optionStrike && option.dataset.optionExpiry === action.dataset.optionExpiry;
      });
    }
    applyMarketplaceInstrumentSelection(page, { rebuild: false });
    showAdminTerminalStatus("ok", "Option contract loaded into order ticket.");
  }

  function handleMarketplaceFilterInput(event) {
    const target = event.target;
    if (target?.matches?.("[data-marketplace-instrument]")) {
      applyMarketplaceInstrumentSelection(getMarketplacePageFromNode(target));
      return;
    }
    if (target?.matches?.("[data-marketplace-option-contract]")) {
      applyMarketplaceInstrumentSelection(getMarketplacePageFromNode(target), { rebuild: false });
      return;
    }
    if (!target?.matches?.("[data-marketplace-search], [data-marketplace-filter], [data-marketplace-sort]")) return;
    applyMarketplaceFilters(getMarketplacePageFromNode(target));
  }


  function readStoreEditPayloadFromAction(action) {
    const data = action?.dataset || {};
    return {
      name: data.storeEditName || "Custom item",
      description: data.storeEditDescription || "",
      category: data.storeEditCategory || "Consumable",
      itemType: data.storeEditType || "One-time use",
      status: data.storeEditStatus || "Active",
      price: data.storeEditPrice || "",
      currency: data.storeEditCurrency || "NRC",
      pricingMode: data.storeEditPricingMode || "Fixed price",
      stockMode: data.storeEditStockMode || "Unlimited",
      stockQuantity: data.storeEditStockQuantity || "",
      restock: data.storeEditRestock || "Manual restock",
      visibility: data.storeEditVisibility || "All players",
      fulfillment: data.storeEditFulfillment || "Add to inventory",
      usageRule: data.storeEditUsage || "Player redeems manually"
    };
  }

  function openStoreEditItemFromAction(action) {
    const model = getAdminTerminalCurrentModel();
    openTerminalModal(renderAddStoreItemModal({ ...model, __storeEditItem: readStoreEditPayloadFromAction(action) }));
    showAdminTerminalStatus("ok", "Custom item editor opened.");
  }

  function readContractProfilePayloadFromAction(action) {
    return {
      title: action.dataset.contractTitle,
      meta: action.dataset.contractMeta,
      reward: action.dataset.contractReward,
      status: action.dataset.contractStatus,
      objective: action.dataset.contractObjective,
      deadline: action.dataset.contractDeadline,
      submissions: action.dataset.contractSubmissions,
      progress: action.dataset.contractProgress,
      locations: action.dataset.contractLocations,
      payoutType: action.dataset.contractPayout,
      evidence: action.dataset.contractEvidence,
      instructions: action.dataset.contractInstructions,
      successCriteria: action.dataset.contractSuccess,
      teacherNote: action.dataset.contractReviewNote,
      owner: action.dataset.contractOwner,
      category: action.dataset.contractCategory,
      difficulty: action.dataset.contractDifficulty
    };
  }

  function openContractProfileFromAction(action) {
    openTerminalModal(renderDashboardContractProfileModal(readContractProfilePayloadFromAction(action)));
  }

  function openContractSubmissionsFromAction(action) {
    openTerminalModal(renderContractSubmissionReviewModal(readContractProfilePayloadFromAction(action)));
  }

  function focusContractFromAction(action) {
    const page = action.closest(".admin-terminal-contracts-page");
    const title = action.dataset.contractTitle || "";
    if (!page || !title) return;

    applyContractsLedgerFilter(page, "all");

    const rows = Array.from(page.querySelectorAll("[data-contract-row]"));
    const row = rows.find((candidate) => (candidate.dataset.contractTitle || "") === title);
    if (!row) {
      showAdminTerminalStatus("warn", "Current focus contract was not found in the ledger.");
      return;
    }

    rows.forEach((candidate) => candidate.classList.remove("is-contract-focus-target"));
    row.hidden = false;
    row.classList.add("is-contract-focus-target");
    row.scrollIntoView({ behavior: "smooth", block: "center" });

    window.setTimeout(() => {
      row.classList.remove("is-contract-focus-target");
    }, 2200);

    const viewAction = row.querySelector('[data-admin-terminal-action="open-contract-profile"]');
    if (viewAction) {
      window.setTimeout(() => openContractProfileFromAction(viewAction), 160);
      showAdminTerminalStatus("ok", `Opening current focus: ${title}.`);
    } else {
      showAdminTerminalStatus("warn", "Current focus contract is missing a View action.");
    }
  }


  function syncContractSubmissionReviewCounts(root = document) {
    const unreviewedList = root.querySelector('[data-contract-submissions-list="unreviewed"]');
    const reviewedList = root.querySelector('[data-contract-submissions-list="reviewed"]');
    const unreviewedCount = unreviewedList?.querySelectorAll("[data-contract-submission-card]").length || 0;
    const reviewedCount = reviewedList?.querySelectorAll("[data-contract-submission-card]").length || 0;
    const unreviewedCounter = root.querySelector('[data-contract-submissions-count="unreviewed"]');
    const reviewedCounter = root.querySelector('[data-contract-submissions-count="reviewed"]');
    const unreviewedEmpty = root.querySelector('[data-contract-submissions-empty="unreviewed"]');
    const reviewedEmpty = root.querySelector('[data-contract-submissions-empty="reviewed"]');

    if (unreviewedCounter) unreviewedCounter.textContent = String(unreviewedCount);
    if (reviewedCounter) reviewedCounter.textContent = String(reviewedCount);
    if (unreviewedEmpty) unreviewedEmpty.hidden = unreviewedCount > 0;
    if (reviewedEmpty) reviewedEmpty.hidden = reviewedCount > 0;
  }

  function openContractSubmissionDecisionConfirmation(action, accepted) {
    const card = action.closest("[data-contract-submission-card]");
    if (!card) return;

    const root = card.closest(".admin-terminal-contract-submissions-v470") || document;
    root.querySelectorAll("[data-submission-confirmation-panel]").forEach((panel) => panel.remove());

    const decision = accepted ? "accepted" : "rejected";
    const decisionLabel = accepted ? "Accept Contract" : "Reject Contract";
    const player = action.dataset.submissionPlayer || card.dataset.submissionPlayer || "player";
    const submissionId = action.dataset.submissionId || card.dataset.submissionId || "submission";
    const contractTitle = action.dataset.contractTitle || "contract";
    const toneClass = accepted ? "is-accept" : "is-reject";

    card.insertAdjacentHTML("beforeend", `
      <aside class="admin-terminal-contract-submission-confirm-v471 ${toneClass}" data-submission-confirmation-panel>
        <div>
          <span>Confirm decision</span>
          <strong>${escapeHtml(decisionLabel)}?</strong>
          <small>${escapeHtml(player)} · ${escapeHtml(submissionId)} · ${escapeHtml(contractTitle)}</small>
        </div>
        <footer>
          <button type="button" class="is-secondary" data-admin-terminal-action="contract-submission-cancel-decision">Cancel</button>
          <button
            type="button"
            data-admin-terminal-action="contract-submission-confirm-decision"
            data-contract-decision="${escapeHtml(decision)}"
            data-submission-id="${escapeHtml(submissionId)}"
            data-submission-player="${escapeHtml(player)}"
            data-contract-title="${escapeHtml(contractTitle)}"
          >Yes, ${escapeHtml(accepted ? "accept" : "reject")}</button>
        </footer>
      </aside>
    `);

    card.querySelector("[data-submission-confirmation-panel]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function confirmContractSubmissionDecision(action) {
    const panel = action.closest("[data-submission-confirmation-panel]");
    const card = panel?.closest("[data-contract-submission-card]");
    if (!card) return;

    const root = card.closest(".admin-terminal-contract-submissions-v470") || document;
    const reviewedList = root.querySelector('[data-contract-submissions-list="reviewed"]');
    const state = card.querySelector("[data-contract-submission-state]");
    const decision = action.dataset.contractDecision || "accepted";
    const accepted = decision === "accepted";
    const player = action.dataset.submissionPlayer || card.dataset.submissionPlayer || "player";
    const contractTitle = action.dataset.contractTitle || "contract";

    if (state) {
      state.textContent = accepted ? "Accepted" : "Rejected";
      state.classList.toggle("is-accepted", accepted);
      state.classList.toggle("is-rejected", !accepted);
    }

    card.classList.toggle("is-accepted", accepted);
    card.classList.toggle("is-rejected", !accepted);
    card.dataset.reviewedState = accepted ? "accepted" : "rejected";
    panel.remove();

    const footer = card.querySelector("footer");
    if (footer) {
      footer.querySelectorAll('[data-admin-terminal-action="contract-submission-accept"], [data-admin-terminal-action="contract-submission-reject"]').forEach((button) => button.remove());
      footer.querySelector("[data-contract-submission-reviewed-stamp]")?.remove();
      footer.insertAdjacentHTML("afterbegin", `<span class="admin-terminal-contract-submission-reviewed-stamp-v471" data-contract-submission-reviewed-stamp>Reviewed · ${escapeHtml(accepted ? "Accepted" : "Rejected")}</span>`);
    }

    reviewedList?.appendChild(card);
    syncContractSubmissionReviewCounts(root);
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showAdminTerminalStatus("ok", `${accepted ? "Accepted" : "Rejected"} ${player} for ${contractTitle}. Moved to Reviewed.`);
  }

  function cancelContractSubmissionDecision(action) {
    const root = action.closest(".admin-terminal-contract-submissions-v470") || document;
    action.closest("[data-submission-confirmation-panel]")?.remove();
    syncContractSubmissionReviewCounts(root);
  }

  async function handleTerminalOverviewClick(event) {
      const modalDismiss = isTerminalModalDismissClick(event);
      const modeToggle = event.target.closest("[data-admin-terminal-mode-toggle]");
      const sectionButton = event.target.closest("[data-admin-section]");
      const bell = event.target.closest("[data-admin-terminal-bell]");
      const drawerHit = event.target.closest("[data-admin-terminal-bell-drawer]");
      const userButton = event.target.closest("[data-admin-terminal-user]");
      const userMenuHit = event.target.closest("[data-admin-terminal-user-menu]");
      const action = event.target.closest("[data-admin-terminal-action]");
      const marketplaceChartControlHit = event.target.closest("[data-marketplace-chart-control]");

      if (!marketplaceChartControlHit) {
        closeMarketplaceChartDropdowns(document);
      }

      if (modalDismiss) {
        closeTerminalModal();
        return;
      }

      if (modeToggle) {
        return;
      }

      if (sectionButton) {
        if (renderAdminTerminalSectionFromButton(sectionButton)) return;
      }

      if (bell) {
        const root = bell.closest(".admin-terminal-overview");
        const drawer = root?.querySelector("[data-admin-terminal-bell-drawer]");
        if (drawer) {
          if (drawer.hidden) openNotificationDrawer(drawer, bell);
          else closeNotificationDrawer(drawer);
        }
        closeAllAdminUserMenus();
        closeAllSharePopups();
        return;
      }

      if (userButton) {
        const root = userButton.closest(".admin-terminal-overview");
        const menu = root?.querySelector("[data-admin-terminal-user-menu]");
        toggleAdminUserMenu(menu, userButton);
        closeAllNotificationDrawers();
        closeAllSharePopups();
        return;
      }

      if (!drawerHit) {
        closeAllNotificationDrawers();
      }

      if (!userMenuHit) {
        closeAllAdminUserMenus();
      }

      if (drawerHit && !action) return;
      if (userMenuHit && !action) return;

      if (!action) return;

      if (userMenuHit) {
        closeAllAdminUserMenus();
      }

      const actionName = action.dataset.adminTerminalAction;

      if (actionName === "filter-contracts" || actionName.startsWith("filter-contracts-")) {
        filterContractsLedgerFromAction(action);
        return;
      }

      if (actionName === "filter-store" || actionName.startsWith("filter-store-")) {
        filterStoreCatalogFromAction(action);
        return;
      }

      if (actionName === "select-market-security" || actionName === "open-market-asset") {
        selectMarketplaceSecurity(action);
        return;
      }

      if (actionName === "marketplace-clear-filters" || actionName === "filter-market-all") {
        clearMarketplaceFilters(action);
        return;
      }

      if (actionName === "marketplace-set-timeframe") {
        handleMarketplaceTimeframe(action);
        return;
      }

      if (actionName === "marketplace-toggle-chart-menu") {
        toggleMarketplaceChartMenu(action);
        return;
      }

      if (actionName === "marketplace-set-chart-style") {
        handleMarketplaceChartStyle(action);
        return;
      }

      if (actionName === "marketplace-set-chart-compare") {
        handleMarketplaceChartCompare(action);
        return;
      }

      if (actionName === "marketplace-set-chart-indicator") {
        handleMarketplaceChartIndicator(action);
        return;
      }

      if (actionName === "filter-market-up" || actionName === "filter-market-down") {
        const page = getMarketplacePageFromNode(action);
        const sort = page?.querySelector("[data-marketplace-sort]");
        if (sort) sort.value = actionName === "filter-market-up" ? "change-desc" : "change-asc";
        applyMarketplaceFilters(page);
        showAdminTerminalStatus("ok", actionName === "filter-market-up" ? "Advancers sorted." : "Decliners sorted.");
        return;
      }

      if (actionName === "marketplace-preview-order") {
        previewMarketplaceOrder(action);
        return;
      }

      if (actionName === "marketplace-place-order") {
        placeMarketplaceOrder(action);
        return;
      }

      if (actionName === "marketplace-load-option") {
        loadMarketplaceOption(action);
        return;
      }

      if (actionName === "focus-contract") {
        focusContractFromAction(action);
        return;
      }

      if (actionName === "scan-attendance") {
        const overview = action.closest(".admin-terminal-overview");
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAttendanceScannerModal(model));
        return;
      }

      if (actionName === "mock-confirm-scan") {
        handleMockScannerCapture("confirm");
        return;
      }

      if (actionName === "mock-start-scanner") {
        const state = document.querySelector("[data-admin-terminal-scanner-state]");
        focusActiveScannerInput();
        if (state) {
          state.classList.remove("is-captured");
          state.textContent = document.querySelector("[data-admin-terminal-scanner-console]")?.dataset.scanMode === "manual" ? "Manual input ready" : "Armed";
        }
        showAdminTerminalStatus("warn", "Scanner focus restored. Backend wiring pending.");
        return;
      }

      if (actionName === "share-game-code") {
        event.preventDefault();
        event.stopPropagation();

        const gameCode = action.dataset.gameCode || "";
        const gameName = action.dataset.gameName || "Eco Novaria";
        const gameStatus = action.dataset.gameStatus || "Active";

        closeAllNotificationDrawers();
        closeAllAdminUserMenus();
        closeAllSharePopups();
        openTerminalModal(renderShareAccessModal({ gameCode, gameName, gameStatus }));
        return;
      }

      if (actionName === "copy-game-code") {
        const gameCode = action.dataset.gameCode || "";
        await copyTerminalShareText(gameCode, "Game code copied.");
        return;
      }

      if (actionName === "copy-share-value") {
        const targetId = action.dataset.shareTarget || "";
        const target = targetId ? document.getElementById(targetId) : null;
        const value = target?.value || target?.textContent || "";
        await copyTerminalShareText(value, "Copied.");
        target?.select?.();
        return;
      }

      if (actionName === "open-share-link") {
        const targetId = action.dataset.shareTarget || "";
        const target = targetId ? document.getElementById(targetId) : null;
        const value = target?.value || "";
        if (value && /^https?:\/\//.test(value)) {
          window.open(value, "_blank", "noopener,noreferrer");
        } else {
          showAdminTerminalStatus("warn", "No valid link available.");
        }
        return;
      }

      if (actionName === "copy-game-link") {
        const gameCode = action.dataset.gameCode || "";
        await copyTerminalShareText(getTerminalShareUrl(gameCode, "student"), "Student login link copied.");
        return;
      }

      if (actionName === "share-game-native") {
        const gameCode = action.dataset.gameCode || "";
        const gameName = action.dataset.gameName || "Eco Novaria";
        const shareText = getTerminalShareText(gameCode, gameName);
        const shareUrl = getTerminalShareUrl(gameCode);

        if (navigator.share) {
          try {
            await navigator.share({
              title: `${gameName} login`,
              text: shareText,
              url: shareUrl
            });
            showAdminTerminalStatus("ok", "Share sheet opened.");
          } catch (_) {
            // User may cancel the native sheet; no warning needed.
          }
        } else {
          await copyTerminalShareText(`${shareText}\n${shareUrl}`, "Share text copied.");
        }
        return;
      }

      if (actionName === "select-player-panel") {
        selectAdminTerminalPlayer(action.dataset.playerRank || "1");
        return;
      }

      if (actionName === "open-player-log-detail") {
        openTerminalModal(renderPlayerLogEventDetailModalFromAction(action));
        return;
      }

      if (actionName === "reset-player-code") {
        openTerminalPlayerModalFromAction(action, renderResetPlayerCodeModal);
        return;
      }

      if (actionName === "player-settings") {
        openTerminalPlayerModalFromAction(action, renderPlayerSettingsModal);
        return;
      }

      if (actionName === "adjust-player-balance") {
        openTerminalPlayerModalFromAction(action, renderAdjustPlayerBalanceModal);
        return;
      }

      if (actionName === "flag-player-account") {
        openTerminalPlayerModalFromAction(action, renderFlagPlayerAccountModal);
        return;
      }

      if (actionName === "open-player-profile") {
        const model = getAdminTerminalCurrentModel();
        const selectedPlayer = getSelectedTerminalPlayer(model, action.dataset.playerRank);
        openTerminalModal(renderDashboardPlayerProfileModal({
          ...selectedPlayer,
          rank: action.dataset.playerRank || selectedPlayer.rank,
          name: action.dataset.playerName || selectedPlayer.name,
          meta: action.dataset.playerMeta || selectedPlayer.meta,
          netWorth: action.dataset.playerNetWorth || selectedPlayer.netWorth,
          overall: action.dataset.playerOverall || selectedPlayer.overall
        }));
        return;
      }

      if (actionName === "change-sci-avatar") {
        const frame = action.closest("[data-admin-terminal-avatar-frame]");
        const input = frame?.querySelector("[data-admin-terminal-avatar-input]");
        input?.click?.();
        return;
      }

      if (actionName === "message-player" && action.dataset.playerRank) {
        openTerminalPlayerModalFromAction(action, renderPlayerDirectMessageModal);
        return;
      }

      if (actionName === "open-contract-profile") {
        event.preventDefault();
        event.stopPropagation();
        openContractProfileFromAction(action);
        return;
      }

      if (actionName === "review-contract-submissions") {
        event.preventDefault();
        event.stopPropagation();
        openContractSubmissionsFromAction(action);
        return;
      }

      if (actionName === "contract-submission-accept" || actionName === "contract-submission-reject") {
        event.preventDefault();
        event.stopPropagation();
        openContractSubmissionDecisionConfirmation(action, actionName === "contract-submission-accept");
        return;
      }

      if (actionName === "contract-submission-confirm-decision") {
        event.preventDefault();
        event.stopPropagation();
        confirmContractSubmissionDecision(action);
        return;
      }

      if (actionName === "contract-submission-cancel-decision") {
        event.preventDefault();
        event.stopPropagation();
        cancelContractSubmissionDecision(action);
        return;
      }

      if (actionName === "contract-submission-message") {
        event.preventDefault();
        event.stopPropagation();
        openTerminalModal(renderContractSubmissionMessageModalFromAction(action));
        return;
      }

      if (actionName === "confirm-contract-submission-message") {
        showAdminTerminalStatus("ok", `Admin message staged in Player Messages for ${action.dataset.submissionPlayer || "player"} about ${action.dataset.contractTitle || "contract"}.`);
        closeTerminalModal();
        return;
      }

      if (actionName === "add-contract") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAddContractModal(model));
        return;
      }

      if (actionName === "add-player") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAddPlayerModal(model));
        return;
      }

      if (actionName === "edit-store-item") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openStoreEditItemFromAction(action);
        return;
      }

      if (actionName === "add-store-item") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAddStoreItemModal(model));
        return;
      }

      if (actionName === "select-attendance-student") {
        const key = action.dataset.attendanceKey || "";
        if (key) {
          window.Econovaria.features.adminOverviewTerminal.selectedAttendanceKey = key;
          const model = getAdminTerminalCurrentModel();
          rerenderAdminTerminalWithModel(model, "Attendance");
          showAdminTerminalStatus("ok", "Attendance history loaded.");
        }
        return;
      }

      if (actionName === "attendance-open-export") {
        const dialog = document.querySelector(".admin-terminal-attendance-v207-export");
        if (dialog && typeof dialog.showModal === "function") dialog.showModal();
        else showAdminTerminalStatus("ok", "Attendance CSV export options are ready for wiring.");
        return;
      }

      if (actionName === "attendance-ledger-prev-day" || actionName === "attendance-ledger-next-day") {
        showAdminTerminalStatus("ok", "Reward ledger day cycling is ready for backend wiring.");
        return;
      }

      const adminAccountRoutes = {
        "open-admin-profile": "AdminProfile",
        "open-admin-settings": "AdminSettings",
        "open-admin-notifications": "AdminNotifications",
        "view-alerts": "AdminNotifications",
        "open-admin-security": "AdminSecurity",
        "open-admin-help": "AdminHelp",
        "open-admin-games": "AdminGames",
        "open-game-settings-page": "Settings"
      };
      if (adminAccountRoutes[actionName]) {
        openAdminAccountPage(adminAccountRoutes[actionName]);
        return;
      }

      if (actionName === "switch-admin-game") {
        switchAdminGameFromAction(action);
        closeAllAdminUserMenus();
        closeAllNotificationDrawers();
        return;
      }

      if (actionName === "share-current-game") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderShareAccessModal({
          gameCode: model.gameCode,
          gameName: model.gameName,
          gameStatus: model.gameStatus
        }));
        return;
      }

      if (actionName === "sign-out-admin") {
        const model = getAdminTerminalCurrentModel();
        closeAllAdminUserMenus();
        closeAllNotificationDrawers();
        openTerminalModal(renderSignOutConfirmModal(model));
        return;
      }

      if (actionName === "confirm-admin-signout") {
        closeTerminalModal();
        window.Econovaria.features.adminOverviewTerminal.signOutConfirmed = true;
        showAdminTerminalStatus("ok", "Signed out locally. Auth wiring pending.");
        return;
      }

      if (actionName === "focus-admin-profile-upload") {
        const input = document.querySelector("[data-admin-profile-avatar-input]");
        input?.click?.();
        return;
      }

      if (actionName === "clear-player-log-date") {
        const module = action.closest(".admin-terminal-player-v240-module");
        const input = module?.querySelector("[data-player-log-date-search]");
        if (input) input.value = "";
        filterPlayerActionLogByDate(module, "");
        return;
      }


      if (actionName === "select-player-drawer-tab") {
        const drawer = action.closest("[data-admin-terminal-player-drawer]");
        const targetTab = action.dataset.playerDrawerTab || "overview";
        if (!drawer) return;
        drawer.querySelectorAll("[data-player-drawer-tab]").forEach((button) => {
          const isActive = button === action;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        drawer.querySelectorAll("[data-player-drawer-panel]").forEach((panel) => {
          const isActive = panel.dataset.playerDrawerPanel === targetTab;
          panel.hidden = !isActive;
          panel.classList.toggle("is-active", isActive);
        });
        return;
      }

      if (actionName === "filter-player-panel") {
        const module = action.closest("[data-player-filter-module]");
        const group = action.dataset.playerFilterGroup || "";
        const category = action.dataset.playerFilterCategory || "all";
        if (!module || !group) return;

        module.querySelectorAll(`[data-player-filter-group="${group}"]`).forEach((button) => {
          button.classList.toggle("active", button === action);
        });

        const scope = module.querySelector(`[data-player-filter-scope="${group}"]`);
        if (!scope) return;

        let visibleCount = 0;
        scope.querySelectorAll("[data-filter-category]").forEach((item) => {
          const shouldShow = category === "all" || item.dataset.filterCategory === category;
          item.hidden = !shouldShow;
          if (shouldShow) visibleCount += 1;
        });

        scope.querySelectorAll(`[data-filter-empty="${group}"]`).forEach((empty) => {
          const isFilterEmpty = empty.classList.contains("is-filter-empty");
          if (isFilterEmpty) empty.hidden = visibleCount > 0;
        });
        return;
      }

      if (actionName.startsWith("filter-players-")) {
        updatePlayersRosterStatusFilter(actionName.replace("filter-players-", ""));
        return;
      }

      if (actionName === "players-page-size") {
        updatePlayersRosterPage({ page: 1, pageSize: action.dataset.playerPageSize || 10 });
        return;
      }

      if (actionName === "players-page-prev" || actionName === "players-page-next") {
        const currentModel = getAdminTerminalCurrentModel();
        const direction = actionName === "players-page-next" ? 1 : -1;
        updatePlayersRosterPage({ page: (Number(currentModel.playersPage || 1) || 1) + direction });
        return;
      }

      if (actionName === "connect-google-classroom") {
        showAdminTerminalStatus("warn", "Google Classroom integration is ready for OAuth / roster sync wiring.");
        return;
      }

      if (actionName === "import-roster-csv") {
        const input = document.querySelector("[data-admin-terminal-roster-csv-input]");
        input?.click?.();
        showAdminTerminalStatus("warn", "Roster CSV import selector opened. Parser wiring pending.");
        return;
      }

      {
        const actionMessages = {
          "view-attendance": "Attendance view is ready for wiring.",
          "view-alerts": "Notifications page opened.",
          "open-admin-profile": "Profile page opened.",
          "open-admin-games": "Games page opened.",
          "switch-admin-game": "Game loaded.",
          "open-admin-settings": "Account settings page opened.",
          "open-admin-notifications": "Notifications page opened.",
          "open-admin-security": "Security page opened.",
          "open-admin-help": "Help page opened.",
          "sign-out-admin": "Sign out confirmation opened.",
          "edit-admin-profile": "Profile editing is ready for backend wiring.",
          "save-admin-account-settings": "Account settings save is ready for backend wiring.",
          "reset-admin-account-settings": "Account settings reset is ready for backend wiring.",
          "resolve-admin-notification": "Notification resolution is ready for backend wiring.",
          "enable-email-alerts": "Email alert delivery is ready for backend wiring.",
          "mute-low-priority-alerts": "Notification muting is ready for backend wiring.",
          "mark-notifications-reviewed": "Notification review state is ready for backend wiring.",
          "review-admin-sessions": "Session review is ready for backend wiring.",
          "reset-admin-password": "Password reset is ready for auth wiring.",
          "open-help-start-game": "Start-game help content is ready for wiring.",
          "open-help-players": "Player help content is ready for wiring.",
          "open-help-attendance": "Attendance help content is ready for wiring.",
          "open-help-market": "Market help content is ready for wiring.",
          "open-help-store": "Store help content is ready for wiring.",
          "open-help-troubleshooting": "Troubleshooting help content is ready for wiring.",
          "copy-admin-diagnostics": "Diagnostics copy is ready for wiring.",
          "open-admin-docs": "Docs route is ready for wiring.",
          "report-admin-issue": "Issue reporting is ready for wiring.",
          "filter-players-all": "Player filters are ready for backend wiring.",
          "filter-players-online": "Online-player filter is ready for backend wiring.",
          "filter-players-offline": "Offline-player filter is ready for backend wiring.",
          "filter-players-flagged": "Flagged-player filter is ready for backend wiring.",
          "confirm-player-code-reset": "New player code is ready to issue.",
          "confirm-player-balance-adjustment": "Player balance adjustment is staged.",
          "message-player": "Direct player message is ready to send.",
          "player-settings": "Player settings editor is ready to save.",
          "confirm-player-settings-save": "Player settings are staged.",
          "confirm-player-delete": "Delete-player confirmation is ready for wiring.",
          "confirm-player-message-send": "Player message is staged.",
          "confirm-player-flag": "Player flag is ready to apply.",
          "copy-selected-player-code": "Copy selected player code is ready for wiring.",
          "view-unused-player-codes": "Unused-code review is ready for wiring.",
          "connect-google-classroom": "Google Classroom integration is ready for roster sync wiring.",
          "import-roster-csv": "Roster CSV import is ready for parser wiring.",
          "manual-attendance-correction": "Attendance correction modal is ready for wiring.",
          "lock-attendance": "Attendance lock is ready for wiring.",
          "notify-absent": "Offline-player notification is ready for wiring.",
          "export-attendance": "Attendance export is ready for backend wiring.",
          "export-attendance-audit": "Attendance audit export is ready for backend wiring.",
          "attendance-filter-all": "Attendance filter is ready for wiring.",
          "attendance-filter-present": "Present filter is ready for wiring.",
          "attendance-filter-late": "Late filter is ready for wiring.",
          "attendance-filter-absent": "Absent filter is ready for wiring.",
          "attendance-filter-needs-action": "Needs-action filter is ready for wiring.",
          "attendance-mark-present": "Mark-present correction is ready for backend wiring.",
          "attendance-mark-late": "Mark-late correction is ready for backend wiring.",
          "attendance-mark-absent": "Mark-absent correction is ready for backend wiring.",
          "attendance-mark-excused": "Mark-excused correction is ready for backend wiring.",
          "attendance-adjust-reward": "Attendance reward adjustment is ready for backend wiring.",
          "attendance-add-note": "Attendance note entry is ready for backend wiring.",
          "filter-contracts-active": "Active-contract filter is ready for wiring.",
          "filter-contracts-due": "Due-contract filter is ready for wiring.",
          "filter-contracts-submitted": "Submitted-contract filter is ready for wiring.",
          "filter-contracts-scheduled": "Scheduled-contract filter is ready for wiring.",
          "review-contract-submissions": "Contract submission review is ready.",
          "contract-submission-accept": "Submission approval is staged.",
          "contract-submission-reject": "Submission rejection is staged.",
          "contract-submission-message": "Submission message is ready.",
          "confirm-contract-submission-message": "Submission message is staged.",
          "duplicate-contract": "Contract duplication is ready for wiring.",
          "archive-contract": "Contract archive is ready for wiring.",
          "audit-contract-rewards": "Contract reward audit is ready for wiring.",
          "filter-store-all": "Store all-items filter is ready for wiring.",
          "filter-store-active": "Store active-items filter is ready for wiring.",
          "filter-store-risk": "Store risk filter is ready for wiring.",
          "add-store-item": "Store item creation is ready for wiring.",
          "edit-store-item": "Store item editing is ready for wiring.",
          "toggle-store-item": "Store item active/pause toggle is ready for wiring.",
          "restock-store-item": "Store restock flow is ready for wiring.",
          "rebalance-store-price": "Store price rebalance is ready for wiring.",
          "pause-store": "Store pause control is ready for wiring.",
          "filter-market-all": "Market all-assets filter is ready for wiring.",
          "filter-market-up": "Market advancers filter is ready for wiring.",
          "filter-market-down": "Market decliners filter is ready for wiring.",
          "open-market-asset": "Market asset detail is ready for wiring.",
          "open-market-event": "Market event detail is ready for wiring.",
          "create-market-event": "Market event creation is ready for wiring.",
          "edit-market-event": "Market event editing is ready for wiring.",
          "pause-market-event": "Market event pause control is ready for wiring.",
          "broadcast-market-news": "Market news broadcast is ready for wiring.",
          "audit-market-impact": "Market impact audit is ready for wiring.",
          "save-settings": "Settings save flow is ready for wiring.",
          "edit-settings-group": "Settings group edit modal is ready for wiring.",
          "reset-settings-group": "Settings group reset is ready for wiring.",
          "preview-settings-impact": "Settings impact preview is ready for wiring.",
          "audit-settings-changes": "Settings audit trail is ready for wiring.",
          "archive-game": "Archive-game confirmation is ready for wiring.",
          "reset-economy": "Economy reset confirmation is ready for wiring.",
          "filter-logs-all": "All-log filter is ready for wiring.",
          "filter-logs-system": "System-log filter is ready for wiring.",
          "filter-logs-admin": "Admin-log filter is ready for wiring.",
          "filter-logs-economy": "Economy-log filter is ready for wiring.",
          "filter-logs-attendance": "Attendance-log filter is ready for wiring.",
          "filter-logs-inventory": "Inventory-log filter is ready for wiring.",
          "filter-logs-finance": "Finance-log filter is ready for wiring.",
          "filter-logs-contracts": "Contract-log filter is ready for wiring.",
          "open-log-detail": "Log detail panel is ready for wiring.",
          "open-related-record": "Related-record lookup is ready for wiring.",
          "copy-log-id": "Copy-log event is ready for wiring.",
          "flag-log-event": "Log-event flagging is ready for wiring.",
          "export-logs": "Log export is ready for wiring.",
          "search-logs": "Log search is ready for wiring.",
          "filter-player-logs-all": "Player-log all filter is ready for wiring.",
          "filter-player-logs-attendance": "Player attendance-log filter is ready for wiring.",
          "filter-player-logs-inventory": "Player inventory-log filter is ready for wiring.",
          "filter-player-logs-finance": "Player finance-log filter is ready for wiring.",
          "filter-player-logs-contracts": "Player contract-log filter is ready for wiring.",
          "filter-player-logs-admin": "Player admin-log filter is ready for wiring.",
          "open-player-log-detail": "Player log detail is ready for wiring.",
          "copy-player-log-id": "Player log ID copy is ready for wiring.",
          "flag-player-log-event": "Player log flagging is ready for wiring.",
          "export-player-logs": "Player log export is ready for wiring.",
          "audit-student-history": "Student-history audit is ready for wiring.",
          "see-more-contracts": "Contracts view is ready for wiring.",
          "manage-contracts": "Contract management is ready for wiring."
        };
        showAdminTerminalStatus("warn", actionMessages[actionName] || `${actionName.replaceAll("-", " ")} modal is ready for wiring.`);
      }
  }

  function bindTerminalClickEvents() {
    document.addEventListener("click", handleTerminalOverviewClick);
  }

  function bindMarketplaceFilterEvents() {
    document.addEventListener("input", handleMarketplaceFilterInput);
    document.addEventListener("change", handleMarketplaceFilterInput);
    document.addEventListener("mouseover", handleMarketplaceCandleHover);
    document.addEventListener("mousemove", handleMarketplaceCandleMove);
    document.addEventListener("mouseout", handleMarketplaceCandleOut);
  }

  function bindTerminalOverviewEvents() {
    if (window.Econovaria.features.adminOverviewTerminal.eventsBound) return;
    window.Econovaria.features.adminOverviewTerminal.eventsBound = true;
    bindTerminalEscapeKeyEvents();
    bindTerminalClickEvents();
    bindMarketplaceFilterEvents();
  }
