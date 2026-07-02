// Players page composition and pagination renderer.
  function renderPlayersPage(model) {
    const players = getTerminalPlayerRows(model);
    const selectedRank = model?.selectedPlayerRank ?? null;
    const activeStatusFilter = normalizePlayerRosterStatusFilter(model?.playersStatusFilter || model?.playerStatusFilter || "all");
    const activeSearchFilter = normalizePlayersRosterSearch(model?.playersSearch || model?.playerRosterSearch || "");
    const statusFilteredPlayers = filterPlayersByRosterStatus(players, activeStatusFilter);
    const filteredPlayers = filterPlayersByRosterSearch(statusFilteredPlayers, activeSearchFilter);

    const onlineCount = players.filter((player) => isPlayerOnlineForRosterFilter(player)).length;
    const offlineCount = Math.max(0, players.length - onlineCount);
    const flaggedCount = players.filter((player) => isPlayerFlaggedForRosterFilter(player)).length;
    const allowedPageSizes = [10, 50, 100];
    const requestedPageSize = Number(model?.playersPerPage || 10);
    const playersPerPage = allowedPageSizes.includes(requestedPageSize) ? requestedPageSize : 10;
    const pageCount = Math.max(1, Math.ceil(filteredPlayers.length / playersPerPage));
    const requestedPage = Number(model?.playersPage || 1);
    const currentPage = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? requestedPage : 1));
    const pageStartIndex = (currentPage - 1) * playersPerPage;
    const pageEndIndex = Math.min(filteredPlayers.length, pageStartIndex + playersPerPage);
    const visiblePlayers = filteredPlayers.slice(pageStartIndex, pageEndIndex);
    const emptyFilterCopy = activeSearchFilter
      ? "No players match this search and status filter."
      : activeStatusFilter === "online"
        ? "No online players match this filter."
        : activeStatusFilter === "offline"
          ? "No offline players match this filter."
          : activeStatusFilter === "flagged"
            ? "No flagged players match this filter."
            : "No players on this page.";

    return `
      <section class="admin-terminal-overview admin-terminal-players-page" aria-label="Admin players terminal" data-admin-terminal-page="Players">
        ${renderPlayersPageHeader(model)}

        <section class="admin-terminal-players-command" aria-label="Player filters">
          <label class="admin-terminal-players-search admin-terminal-players-v293-search">
            <span>Search roster</span>
            <input type="search" value="${escapeHtml(activeSearchFilter)}" placeholder="Name, player ID, or country" aria-label="Search roster by name, player ID, or country" data-admin-terminal-players-search />
          </label>

          <div class="admin-terminal-players-filter-row" aria-label="Player status filters">
            <button type="button" class="${activeStatusFilter === "all" ? "active" : ""}" data-admin-terminal-action="filter-players-all" aria-pressed="${activeStatusFilter === "all" ? "true" : "false"}">All ${escapeHtml(players.length)}</button>
            <button type="button" class="${activeStatusFilter === "online" ? "active" : ""}" data-admin-terminal-action="filter-players-online" aria-pressed="${activeStatusFilter === "online" ? "true" : "false"}">Online ${escapeHtml(onlineCount)}</button>
            <button type="button" class="${activeStatusFilter === "offline" ? "active" : ""}" data-admin-terminal-action="filter-players-offline" aria-pressed="${activeStatusFilter === "offline" ? "true" : "false"}">Offline ${escapeHtml(offlineCount)}</button>
            <button type="button" class="${activeStatusFilter === "flagged" ? "active" : ""}" data-admin-terminal-action="filter-players-flagged" aria-pressed="${activeStatusFilter === "flagged" ? "true" : "false"}">Flagged ${escapeHtml(flaggedCount)}</button>
          </div>

          <button class="admin-terminal-players-add admin-terminal-action is-good" type="button" data-admin-terminal-action="add-player">
            <span class="admin-terminal-action-rail" aria-hidden="true"></span>
            <span class="admin-terminal-action-mark" aria-hidden="true">${renderNavIcon("players")}</span>
            <span class="admin-terminal-action-copy">
              <strong>Add Player</strong>
              <small>ID + Access</small>
            </span>
            <span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>
          </button>
        </section>

        <div class="admin-terminal-players-layout admin-terminal-players-accordion-layout">
          <section class="admin-terminal-players-roster admin-terminal-players-roster-full" aria-label="Player roster">
            <header>
              <div>
                <span>Roster</span>
                <h3>Player Control</h3>
              </div>
              <div class="admin-terminal-players-v232-roster-meta">
                <button class="admin-terminal-players-v237-classroom" type="button" data-admin-terminal-action="connect-google-classroom" aria-label="Connect Google Classroom" title="Connect Google Classroom">
                  <img src="./assets/icons/google-classroom-logo.svg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
                  <span>Connect Google Classroom</span>
                </button>
                <button class="admin-terminal-players-v232-import" type="button" data-admin-terminal-action="import-roster-csv" aria-label="Import roster CSV" title="Import roster CSV">
                  <img src="./assets/images/csv-export-gold.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
                  <span>Import CSV</span>
                </button>
                <input type="file" accept=".csv,text/csv" hidden data-admin-terminal-roster-csv-input aria-label="Roster CSV file input">
              </div>
            </header>

            <div class="admin-terminal-players-v245-pagination" aria-label="Roster pagination controls">
              <div class="admin-terminal-players-v245-page-summary">
                <span>Roster range</span>
                <strong>Showing ${escapeHtml(filteredPlayers.length ? pageStartIndex + 1 : 0)}–${escapeHtml(pageEndIndex)} of ${escapeHtml(filteredPlayers.length)} players</strong>
              </div>
              <div class="admin-terminal-players-v245-controls">
                <div class="admin-terminal-players-v245-page-size" aria-label="Rows per page">
                  <span>Rows</span>
                  ${allowedPageSizes.map((size) => `<button type="button" class="${size === playersPerPage ? "active" : ""}" data-admin-terminal-action="players-page-size" data-player-page-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join("")}
                </div>
                <button type="button" data-admin-terminal-action="players-page-prev" ${currentPage <= 1 ? "disabled" : ""} aria-label="Previous player page">‹</button>
                <strong class="admin-terminal-players-v245-page-index">${escapeHtml(currentPage)} / ${escapeHtml(pageCount)}</strong>
                <button type="button" data-admin-terminal-action="players-page-next" ${currentPage >= pageCount ? "disabled" : ""} aria-label="Next player page">›</button>
              </div>
            </div>


            <div class="admin-terminal-player-list admin-terminal-player-accordion-list admin-terminal-player-table-list-v295 ${visiblePlayers.length ? "" : "is-empty-state"}">
              ${visiblePlayers.length ? visiblePlayers.map((player) => renderPlayersRosterRow(player, selectedRank)).join("") : `<article class="admin-terminal-players-v245-empty">${escapeHtml(emptyFilterCopy)}</article>`}
            </div>
          </section>
        </div>
      </section>`;
  }
