// Routing, player normalization, roster rows, filters, and roster search helpers.
// Page routing plus the Players workspace and roster detail panels.
  function normalizeTerminalPageSection(section) {
    const value = String(section || "").trim();
    if (value === "Players") return "Players";
    if (value === "Attendance") return "Attendance";
    if (value === "Assignments" || value === "Contracts") return "Assignments";
    if (value === "Store") return "Store";
    if (value === "Market" || value === "Stock Market") return "Market";
    if (value === "Settings") return "Settings";
    if (value === "Logs" || value === "Activity") return "Logs";
    if (value === "AdminProfile") return "AdminProfile";
    if (value === "AdminSettings") return "AdminSettings";
    if (value === "AdminNotifications") return "AdminNotifications";
    if (value === "AdminSecurity") return "AdminSecurity";
    if (value === "AdminHelp") return "AdminHelp";
    if (value === "AdminGames") return "AdminGames";
    return "Overview";
  }

  function getPlayerDisplayTitle(rank, location) {
    const podiumTitles = {
      1: "Global Exchange Champion",
      2: "Strategic Capital Regent",
      3: "World Trade Vanguard"
    };

    if (podiumTitles[Number(rank)]) return podiumTitles[Number(rank)];

    const locationTitles = {
      Northreach: "Arctic Resource Master",
      Yrethia: "Maritime Commerce Admiral",
      Solvend: "Quantum Market Engineer",
      Eldoran: "Supply Chain Custodian",
      Thaloris: "Frontier Port Champion",
      Valerion: "Capital Growth Architect",
      Syndalis: "Signal Exchange Operative",
      Kaivora: "Frontier Expansion Pioneer",
      Orinth: "Skyborne Ledger Steward",
      Dravik: "Industrial Forge Baron"
    };

    return locationTitles[String(location || '').trim()] || 'Emerging Market Magnate';
  }

  function getTerminalPlayerRows(model) {
    const leaderboard = Array.isArray(model?.leaderboard) ? model.leaderboard : [];

    return leaderboard.map((player, index) => {
      const rank = player.rank || index + 1;
      const name = player.name || `Player ${rank}`;
      const meta = player.meta || (index % 3 === 0 ? "active today" : index % 3 === 1 ? "active yesterday" : "offline");
      const session = readSciIdSessionStatus(player, meta);
      const netWorth = player.netWorth || player.network || player.balance || "0.00";
      const numericNetWorth = Number(String(netWorth).replace(/[^0-9.-]/g, "")) || 0;
      const cash = player.cash || Math.max(300, Math.round(numericNetWorth * 0.19)).toLocaleString("en-US");
      const portfolioValue = player.portfolioValue || Math.max(0, Math.round(numericNetWorth * 0.81)).toLocaleString("en-US");
      const location = player.location || ["Northreach", "Yrethia", "Solvend", "Eldoran", "Thaloris"][index % 5];
      const playerTitle = player.playerTitle || player.titleBadge || getPlayerDisplayTitle(rank, location);
      const activity = getPlayerActivityStatus(player, meta, index);
      const lastActive = activity.label;
      const accessCode = player.accessCode || `PLR-${String(2300 + Number(rank)).padStart(4, "0")}`;
      const flag = player.flag || player.flagReason || player.reviewFlag || (player.isFlagged || player.flagged ? "Flagged" : "") || (index === 2 ? "Access review" : index === 4 ? "Low activity" : "");

      return {
        ...player,
        rank,
        name,
        meta,
        session,
        netWorth,
        cash,
        portfolioValue,
        location,
        playerTitle,
        lastActive,
        activity,
        accessCode,
        flag,
        overall: player.overallScore ?? player.overall ?? player.score ?? "—"
      };
    });
  }

  function renderPlayersPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Roster / player operations</span>
          <h2>Players</h2>
          <p>Use the roster as the control surface. Open a row to inspect the full player record.</p>
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


  const PLAYER_QUICK_ACTION_ICONS = Object.freeze({
    "open-player-profile": "./assets/icons/player-id.svg",
    "adjust-player-balance": "./assets/icons/adjust-balance.svg",
    "player-settings": "./assets/icons/player-settings.svg",
    "message-player": "./assets/icons/message-player.svg"
  });

  function renderPlayerQuickActionButton(action, rank, label, fallbackText, extraAttrs = "") {
    const iconSrc = PLAYER_QUICK_ACTION_ICONS[action];
    const iconMarkup = iconSrc
      ? `<img src="${escapeHtml(iconSrc)}" alt="" aria-hidden="true" loading="lazy" />`
      : escapeHtml(fallbackText);

    return `<button type="button" data-admin-terminal-action="${escapeHtml(action)}" data-player-rank="${escapeHtml(rank)}" ${extraAttrs} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><b aria-hidden="true">${iconMarkup}</b><span>${escapeHtml(label)}</span></button>`;
  }

  function renderPlayersAccordionDetail(player) {
    const checkingBalance = readCurrencyNumber(player.cash) ?? 0;
    const savingsBalance = checkingBalance * 0.25;
    const combinedCash = (checkingBalance + savingsBalance).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const activity = player.activity || getPlayerActivityStatus(player, player.meta, Number(player.rank || 1) - 1);
    return `
      <section class="admin-terminal-player-accordion-detail admin-terminal-player-dossier-v296" aria-label="${escapeHtml(player.name)} player details">
        <div class="admin-terminal-player-dossier-topline-v296">
          <div class="admin-terminal-player-dossier-identity">
            <div>
              <small>Player record</small>
              <strong>${escapeHtml(player.name)}</strong>
              <p>${escapeHtml(player.playerTitle || "Player profile")} · ${escapeHtml(player.location)}</p>
            </div>
          </div>

          <dl class="admin-terminal-player-dossier-metrics-v296" aria-label="Expanded player metrics">
            <div>
              <dt>Net Worth</dt>
              <dd>${renderPlayerCurrencyAmount(player.netWorth, player)}</dd>
            </div>
            <div>
              <dt>Cash</dt>
              <dd>${renderPlayerCurrencyAmount(combinedCash, player)}</dd>
            </div>
            <div class="admin-terminal-player-dossier-access-v300 admin-terminal-player-dossier-access-v303">
              <dt>Access Code</dt>
              <dd>${escapeHtml(player.accessCode)}</dd>
            </div>
          </dl>
        </div>

        ${renderPlayerHoldingsPanel(player)}
      </section>`;
  }

  function renderPlayersRosterRow(player, selectedRank = null) {
    const activity = player.activity || getPlayerActivityStatus(player, player.meta, Number(player.rank || 1) - 1);
    const isOnline = activity.tone === "is-now";
    const tone = isOnline ? "is-online" : "is-offline";
    const inlineStatusIndicator = isOnline ? `<i aria-hidden="true"></i>` : "";
    const isExpanded = String(player.rank) === String(selectedRank ?? "");
    const checkingBalance = readCurrencyNumber(player.cash) ?? 0;
    const savingsBalance = checkingBalance * 0.25;
    const combinedCash = (checkingBalance + savingsBalance).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    return `
      <article class="admin-terminal-player-row admin-terminal-player-accordion-row admin-terminal-player-table-row-v296 ${tone} ${escapeHtml(activity.tone)} ${isExpanded ? "is-selected is-expanded" : ""}">
        <div class="admin-terminal-player-row-shell admin-terminal-player-table-shell-v296">
          <button
            type="button"
            class="admin-terminal-player-row-main admin-terminal-player-row-toggle admin-terminal-player-table-toggle-v296"
            data-admin-terminal-action="select-player-panel"
            data-player-rank="${escapeHtml(player.rank)}"
            aria-expanded="${isExpanded ? "true" : "false"}"
          >
            <span class="admin-terminal-player-rank admin-terminal-player-table-rank-v295">#${escapeHtml(player.rank)}</span>
            <span class="admin-terminal-player-identity admin-terminal-player-table-identity-v295">
              <strong><span>${escapeHtml(player.name)}</span><span class="admin-terminal-player-inline-status ${escapeHtml(activity.tone)}">${inlineStatusIndicator}<b>${escapeHtml(formatInlinePlayerStatusLabel(activity))}</b></span></strong>
              <span class="admin-terminal-player-identity-meta">
                <small>${escapeHtml(player.playerTitle || player.location)} · ${escapeHtml(player.location)}</small>
              </span>
            </span>
            <span class="admin-terminal-player-table-metric-v295 admin-terminal-player-table-metric-v296">
              <small>Net Worth</small>
              <strong>${renderPlayerCurrencyAmount(player.netWorth, player)}</strong>
            </span>
            <span class="admin-terminal-player-table-metric-v295 admin-terminal-player-table-metric-v296">
              <small>Cash</small>
              <strong>${renderPlayerCurrencyAmount(combinedCash, player)}</strong>
            </span>
            <span class="admin-terminal-player-chevron" aria-hidden="true">⌄</span>
          </button>

          <div class="admin-terminal-player-row-actions admin-terminal-player-row-quick-actions admin-terminal-player-table-actions-v296" aria-label="Quick actions for ${escapeHtml(player.name)}">
            ${renderPlayerQuickActionButton("open-player-profile", player.rank, "Open ID Card", "ID", `data-player-name="${escapeHtml(player.name)}" data-player-meta="${escapeHtml(player.meta)}" data-player-net-worth="${escapeHtml(player.netWorth)}" data-player-overall="${escapeHtml(player.overall)}"`)}
            ${renderPlayerQuickActionButton("adjust-player-balance", player.rank, "Adjust Balance", "$+")}
            ${renderPlayerQuickActionButton("player-settings", player.rank, "Player Settings", "⚙")}
            ${renderPlayerQuickActionButton("message-player", player.rank, "Message Player", "✉")}
          </div>
        </div>

        ${isExpanded ? renderPlayersAccordionDetail(player) : ""}
      </article>`;
  }

  function getPlayerFilterSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "all";
  }

  function normalizePlayerRosterStatusFilter(value) {
    const normalized = String(value || "all").trim().toLowerCase();
    return ["all", "online", "offline", "flagged"].includes(normalized) ? normalized : "all";
  }

  function isPlayerOnlineForRosterFilter(player = {}) {
    const sessionLabel = String(player?.session?.label || "").trim().toUpperCase();
    const activityTone = String(player?.activity?.tone || "").trim().toLowerCase();
    return sessionLabel === "ONLINE" || activityTone === "is-now";
  }

  function isPlayerFlaggedForRosterFilter(player = {}) {
    return Boolean(player?.flag || player?.flagReason || player?.reviewFlag || player?.isFlagged || player?.flagged);
  }

  function filterPlayersByRosterStatus(players = [], statusFilter = "all") {
    const normalized = normalizePlayerRosterStatusFilter(statusFilter);
    if (normalized === "online") return players.filter((player) => isPlayerOnlineForRosterFilter(player));
    if (normalized === "offline") return players.filter((player) => !isPlayerOnlineForRosterFilter(player));
    if (normalized === "flagged") return players.filter((player) => isPlayerFlaggedForRosterFilter(player));
    return players;
  }

  function normalizePlayersRosterSearch(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPlayerRosterSearchText(player = {}) {
    return [
      player.name,
      player.rank ? `#${player.rank}` : "",
      player.playerId,
      player.id,
      player.sciId,
      player.location,
      player.country,
      player.playerTitle,
      player.titleBadge,
      player.meta,
      player.lastActive,
      player.session?.label,
      player.flag,
      player.flagReason,
      player.reviewFlag
    ]
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .join(" ")
      .toLowerCase();
  }

  function filterPlayersByRosterSearch(players = [], searchValue = "") {
    const query = normalizePlayersRosterSearch(searchValue);
    if (!query) return players;
    const terms = query.split(/\s+/).filter(Boolean);
    return players.filter((player) => {
      const haystack = getPlayerRosterSearchText(player);
      return terms.every((term) => haystack.includes(term));
    });
  }

  function filterPlayersForRoster(players = [], statusFilter = "all", searchValue = "") {
    return filterPlayersByRosterSearch(filterPlayersByRosterStatus(players, statusFilter), searchValue);
  }
