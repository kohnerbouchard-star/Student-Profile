window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.adminPlayerRoster = window.Econovaria.features.adminPlayerRoster || {};

(function initAdminPlayerRosterWiring() {
  const rosterState = {
    gameSessionId: "",
    loading: false,
    loaded: false,
    players: [],
    status: { type: "idle", message: "" },
    createForm: { displayName: "", rosterLabel: "" },
    lastAccessCode: null
  };

  let renderQueued = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function getAppState() {
    return window.Econovaria?.state?.value || {};
  }

  function getCurrentSession() {
    return window.Econovaria?.state?.currentSession || null;
  }

  function getStaffSession() {
    return getAppState().staffSession || getCurrentSession()?.staffSession || null;
  }

  function getSelectedGameSession() {
    const staffSession = getStaffSession();
    if (!staffSession?.selectedGameSessionId) return null;

    return (staffSession.activeGameSessions || [])
      .find((session) => session.id === staffSession.selectedGameSessionId) || null;
  }

  function getStaffToken() {
    return String(getCurrentSession()?.token || "").replace(/^Bearer\s+/i, "").trim();
  }

  function getSupabaseConfig() {
    const constants = window.Econovaria?.core?.constants || {};
    const baseUrl = String(constants.CLASSROOM_API_URL || "").replace(/\/+$/, "");
    const publishableKey = String(constants.SUPABASE_PUBLISHABLE_KEY || "").trim();

    if (!baseUrl || !publishableKey) {
      throw new Error("Supabase classroom API configuration is incomplete.");
    }

    return { baseUrl, publishableKey };
  }

  function buildRoute(path) {
    const { baseUrl } = getSupabaseConfig();
    const routePath = String(path || "").startsWith("/") ? String(path || "") : `/${path || ""}`;
    return `${baseUrl}${routePath}`;
  }

  async function callAdminPlayerRoute(method, path, body) {
    const token = getStaffToken();

    if (!token) {
      return {
        ok: false,
        status: 401,
        code: "missing_staff_auth_user",
        message: "Sign in as an admin before managing players."
      };
    }

    try {
      const { publishableKey } = getSupabaseConfig();
      const headers = {
        "Authorization": `Bearer ${token}`,
        "apikey": publishableKey
      };
      const options = { method, headers };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }

      const response = await fetch(buildRoute(path), options);
      const result = await response.json().catch(() => null);

      if (response.ok && result?.ok === true) {
        return { status: response.status, ...result };
      }

      const error = result?.error || null;
      return {
        ok: false,
        status: response.status,
        code: error?.code || result?.code || "admin_player_request_failed",
        message: error?.message || result?.message || "Player request failed.",
        error
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        code: "admin_player_network_failed",
        message: "Could not connect to player roster. Check your connection and try again."
      };
    }
  }

  function playerRoute(gameSessionId) {
    return `/games/${encodeURIComponent(gameSessionId || "")}/players`;
  }

  function resetCodeRoute(gameSessionId, playerId) {
    return `/games/${encodeURIComponent(gameSessionId || "")}/players/${encodeURIComponent(playerId || "")}/access-code/reset`;
  }

  function resetForGame(gameSessionId) {
    if (rosterState.gameSessionId === gameSessionId) return;

    rosterState.gameSessionId = gameSessionId || "";
    rosterState.loading = false;
    rosterState.loaded = false;
    rosterState.players = [];
    rosterState.status = { type: "idle", message: "" };
    rosterState.createForm = { displayName: "", rosterLabel: "" };
    rosterState.lastAccessCode = null;
  }

  async function loadRoster(gameSessionId) {
    if (!gameSessionId || rosterState.loading) return;

    rosterState.loading = true;
    rosterState.status = { type: "idle", message: "" };
    renderAdminPlayerRoster();

    const result = await callAdminPlayerRoute("GET", playerRoute(gameSessionId));

    rosterState.loading = false;

    if (result.ok) {
      rosterState.loaded = true;
      rosterState.players = Array.isArray(result.players) ? result.players : [];
      rosterState.status = {
        type: "good",
        message: `Loaded ${rosterState.players.length} player${rosterState.players.length === 1 ? "" : "s"}.`
      };
    } else {
      rosterState.status = { type: "bad", message: result.message || "Player roster could not be loaded." };
    }

    renderAdminPlayerRoster();
  }

  async function createPlayer(gameSessionId) {
    const displayName = rosterState.createForm.displayName.trim();
    const rosterLabel = rosterState.createForm.rosterLabel.trim();

    if (!displayName) {
      rosterState.status = { type: "bad", message: "Student name is required." };
      renderAdminPlayerRoster();
      return;
    }

    rosterState.loading = true;
    rosterState.status = { type: "idle", message: "Creating player..." };
    renderAdminPlayerRoster();

    const result = await callAdminPlayerRoute("POST", playerRoute(gameSessionId), {
      displayName,
      rosterLabel: rosterLabel || null
    });

    rosterState.loading = false;

    if (result.ok && result.player) {
      rosterState.players = [...rosterState.players, { ...result.player, hasActiveAccessCode: false }];
      rosterState.createForm = { displayName: "", rosterLabel: "" };
      rosterState.status = { type: "good", message: `${result.player.displayName || "Player"} created.` };
      showGlobalNotice("ok", "Player created.");
    } else {
      rosterState.status = { type: "bad", message: result.message || "Player could not be created." };
    }

    renderAdminPlayerRoster();
  }

  async function resetAccessCode(gameSessionId, playerId) {
    const player = rosterState.players.find((item) => item.id === playerId);

    rosterState.loading = true;
    rosterState.status = { type: "idle", message: "Generating student code..." };
    renderAdminPlayerRoster();

    const result = await callAdminPlayerRoute("POST", resetCodeRoute(gameSessionId, playerId));

    rosterState.loading = false;

    if (result.ok && result.accessCode?.studentCode) {
      rosterState.players = rosterState.players.map((item) => (
        item.id === playerId ? { ...item, hasActiveAccessCode: true } : item
      ));
      rosterState.lastAccessCode = {
        playerName: result.player?.displayName || player?.displayName || "Player",
        studentCode: result.accessCode.studentCode
      };
      rosterState.status = {
        type: "good",
        message: `Student code generated for ${rosterState.lastAccessCode.playerName}. Copy it now.`
      };
      showGlobalNotice("ok", "Student code generated.");
    } else {
      rosterState.status = { type: "bad", message: result.message || "Student code could not be generated." };
    }

    renderAdminPlayerRoster();
  }

  function showGlobalNotice(type, message) {
    try {
      if (typeof window.showGlobalStatus === "function") {
        window.showGlobalStatus(type, message);
      } else if (typeof showGlobalStatus === "function") {
        showGlobalStatus(type, message);
      }
    } catch (_) {}
  }

  function renderAdminPlayerRoster() {
    if (renderQueued) return;
    renderQueued = true;

    window.requestAnimationFrame(() => {
      renderQueued = false;
      renderNow();
    });
  }

  function renderNow() {
    const container = document.querySelector('#admin [data-current-admin-section="Players"]');
    if (!container) return;

    const selectedGame = getSelectedGameSession();

    if (!selectedGame?.id) {
      container.innerHTML = renderNoGameSelected();
      return;
    }

    resetForGame(selectedGame.id);
    container.innerHTML = renderRosterShell(selectedGame);
    bindRosterControls(container, selectedGame.id);

    if (!rosterState.loaded && !rosterState.loading) {
      loadRoster(selectedGame.id);
    }
  }

  function renderNoGameSelected() {
    return `
      <section class="card admin-panel">
        <div class="card-title-row">
          <h2 class="card-title">Players</h2>
          <span class="badge warn">No game selected</span>
        </div>
        <p class="help-text">Select a game session before managing players.</p>
      </section>`;
  }

  function renderRosterShell(selectedGame) {
    const status = rosterState.status.message
      ? `<div class="global-status ${escapeHtml(rosterState.status.type)}">${escapeHtml(rosterState.status.message)}</div>`
      : "";
    const accessCode = rosterState.lastAccessCode
      ? renderAccessCodeNotice(rosterState.lastAccessCode)
      : "";

    return `
      <section class="card admin-panel">
        <div class="card-title-row">
          <div>
            <h2 class="card-title">Players</h2>
            <p class="help-text">Roster for ${escapeHtml(selectedGame.name || selectedGame.id)}. These rows are loaded from Supabase.</p>
          </div>
          <span class="badge good">Backend wired</span>
        </div>

        ${status}
        ${accessCode}

        <form class="form-grid" data-admin-create-player-form>
          <label>
            <span class="field-label">Student Name</span>
            <input value="${escapeHtml(rosterState.createForm.displayName)}" data-admin-new-player-name autocomplete="off" placeholder="Student name" ${rosterState.loading ? "disabled" : ""} />
          </label>
          <label>
            <span class="field-label">Roster Label</span>
            <input value="${escapeHtml(rosterState.createForm.rosterLabel)}" data-admin-new-player-label autocomplete="off" placeholder="Optional class label" ${rosterState.loading ? "disabled" : ""} />
          </label>
          <div class="admin-table-actions">
            <button class="admin-btn admin-btn--primary" type="submit" ${rosterState.loading ? "disabled" : ""}>Create Player</button>
            <button class="admin-btn" type="button" data-admin-refresh-roster ${rosterState.loading ? "disabled" : ""}>Refresh</button>
          </div>
        </form>

        <div class="admin-player-table-wrap">
          <table class="admin-player-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Roster Label</th>
                <th>Status</th>
                <th>Student Code</th>
              </tr>
            </thead>
            <tbody>
              ${renderRosterRows()}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function renderAccessCodeNotice(accessCode) {
    return `
      <div class="global-status good">
        <strong>${escapeHtml(accessCode.playerName)} code:</strong>
        <code>${escapeHtml(accessCode.studentCode)}</code>
        <span>Copy this now. Raw student codes are only shown when generated.</span>
      </div>`;
  }

  function renderRosterRows() {
    if (rosterState.loading && !rosterState.players.length) {
      return `<tr><td colspan="4">Loading roster...</td></tr>`;
    }

    if (!rosterState.players.length) {
      return `<tr><td colspan="4">No players yet. Create the first player above.</td></tr>`;
    }

    return rosterState.players.map((player) => `
      <tr>
        <td>${escapeHtml(player.displayName || "Player")}</td>
        <td>${escapeHtml(player.rosterLabel || "—")}</td>
        <td><span class="badge ${player.status === "active" ? "good" : "warn"}">${escapeHtml(player.status || "active")}</span></td>
        <td>
          <button class="admin-btn admin-btn--primary" type="button" data-admin-reset-player-code="${escapeHtml(player.id)}" ${rosterState.loading ? "disabled" : ""}>
            ${player.hasActiveAccessCode ? "Reset Code" : "Generate Code"}
          </button>
        </td>
      </tr>`).join("");
  }

  function bindRosterControls(container, gameSessionId) {
    const nameInput = container.querySelector("[data-admin-new-player-name]");
    const labelInput = container.querySelector("[data-admin-new-player-label]");
    const form = container.querySelector("[data-admin-create-player-form]");
    const refreshButton = container.querySelector("[data-admin-refresh-roster]");

    nameInput?.addEventListener("input", () => {
      rosterState.createForm.displayName = nameInput.value;
    });

    labelInput?.addEventListener("input", () => {
      rosterState.createForm.rosterLabel = labelInput.value;
    });

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      createPlayer(gameSessionId);
    });

    refreshButton?.addEventListener("click", () => {
      rosterState.loaded = false;
      loadRoster(gameSessionId);
    });

    container.querySelectorAll("[data-admin-reset-player-code]").forEach((button) => {
      button.addEventListener("click", () => {
        resetAccessCode(gameSessionId, button.dataset.adminResetPlayerCode || "");
      });
    });
  }

  function startObserver() {
    const root = document.getElementById("admin");
    if (!root) return;

    const observer = new MutationObserver(() => {
      const playersSection = document.querySelector('#admin [data-current-admin-section="Players"]');
      if (playersSection && !playersSection.querySelector("[data-admin-create-player-form]")) {
        renderAdminPlayerRoster();
      }
    });

    observer.observe(root, { childList: true, subtree: true });
    renderAdminPlayerRoster();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }

  Object.assign(window.Econovaria.features.adminPlayerRoster, {
    renderAdminPlayerRoster,
    loadRoster
  });
})();
