(function initEconovariaPlayerIdentityWiring() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const LOCAL_API_PREFIX = "/api/admin";
  const STYLE_ID = "econovaria-player-identity-settings-style";
  const SETTINGS_SELECTOR = "[data-admin-player-identity-settings]";

  let selectedPlayerId = "";
  let selectedPlayerElement = null;
  const playerCache = new Map();

  function text(value) {
    return String(value ?? "").trim();
  }

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function feature() {
    return window.Econovaria?.features?.adminOverviewTerminal || null;
  }

  function playerUuid(player) {
    return text(player?.id || player?.playerId || player?.player_id);
  }

  function playerName(player) {
    return text(player?.displayName || player?.display_name || player?.name) || "Unnamed player";
  }

  function rosterLabel(player) {
    return text(player?.rosterLabel || player?.roster_label);
  }

  function playerIdentifier(player) {
    return text(
      player?.playerIdentifier ||
      player?.player_identifier ||
      player?.rfidCardId ||
      player?.rfidId ||
      player?.externalPlayerId,
    );
  }

  function uniquePlayers(candidates) {
    const seen = new Set();
    return (Array.isArray(candidates) ? candidates : []).filter((player) => {
      const id = playerUuid(player);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function modelPlayers() {
    const model = feature()?.currentModel || {};
    const candidates = [model.players, model.roster, model.playerRoster]
      .find(Array.isArray) || [];
    return uniquePlayers(candidates);
  }

  function responsePlayers(value) {
    const source = record(value);
    const data = record(source.data);
    const payload = record(source.payload);
    const nestedData = record(data.data);
    const candidates = [
      source.players,
      source.roster,
      source.playerRoster,
      data.players,
      data.roster,
      data.playerRoster,
      payload.players,
      payload.roster,
      payload.playerRoster,
      nestedData.players,
      nestedData.roster,
      nestedData.playerRoster,
    ].find(Array.isArray) || [];
    return uniquePlayers(candidates);
  }

  function cachePlayers(players) {
    for (const player of uniquePlayers(players)) {
      playerCache.set(playerUuid(player), player);
    }
  }

  function allPlayers() {
    cachePlayers(modelPlayers());
    return [...playerCache.values()];
  }

  async function loadPlayers(gameId) {
    if (!gameId) return allPlayers();

    try {
      const response = await window.fetch(
        `${LOCAL_API_PREFIX}/games/${encodeURIComponent(gameId)}/players`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) return allPlayers();
      const players = responsePlayers(await response.json());
      cachePlayers(players);
      return players.length ? players : allPlayers();
    } catch (_) {
      return allPlayers();
    }
  }

  function selectedPlayer() {
    cachePlayers(modelPlayers());
    return playerCache.get(selectedPlayerId) || null;
  }

  function updateModelPlayer(playerId, identifier) {
    const currentFeature = feature();
    const model = currentFeature?.currentModel;
    if (!model) return;

    for (const key of ["players", "roster", "playerRoster"]) {
      if (!Array.isArray(model[key])) continue;
      model[key] = model[key].map((player) => {
        if (playerUuid(player) !== playerId) return player;
        return {
          ...player,
          playerIdentifier: identifier,
          player_identifier: identifier,
        };
      });
    }

    const cached = playerCache.get(playerId);
    if (cached) {
      playerCache.set(playerId, {
        ...cached,
        playerIdentifier: identifier,
        player_identifier: identifier,
      });
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ${SETTINGS_SELECTOR} {
        margin: 18px 0 0;
        padding: 18px;
        border: 1px solid rgba(105, 250, 255, .28);
        background: rgba(2, 11, 18, .76);
        color: #e9fbff;
        box-shadow: inset 3px 0 0 #ff6700;
      }
      ${SETTINGS_SELECTOR} * { box-sizing: border-box; }
      ${SETTINGS_SELECTOR} .player-identity-settings__head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 16px;
      }
      ${SETTINGS_SELECTOR} .player-identity-settings__icon {
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        color: #69faff;
      }
      ${SETTINGS_SELECTOR} h3 {
        margin: 0 0 4px;
        font-size: 16px;
        line-height: 1.25;
      }
      ${SETTINGS_SELECTOR} p {
        margin: 0;
        color: rgba(233, 251, 255, .66);
        font-size: 12px;
        line-height: 1.5;
      }
      ${SETTINGS_SELECTOR} form {
        display: grid;
        gap: 14px;
      }
      ${SETTINGS_SELECTOR} .player-identity-settings__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      ${SETTINGS_SELECTOR} label {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      ${SETTINGS_SELECTOR} label > span {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      ${SETTINGS_SELECTOR} input {
        width: 100%;
        min-height: 42px;
        border: 1px solid rgba(105, 250, 255, .28);
        background: #020b12;
        color: #e9fbff;
        padding: 0 12px;
        font: inherit;
      }
      ${SETTINGS_SELECTOR} input:focus {
        border-color: #69faff;
        outline: 2px solid rgba(105, 250, 255, .14);
        outline-offset: 1px;
      }
      ${SETTINGS_SELECTOR} small {
        color: rgba(233, 251, 255, .54);
        font-size: 11px;
        line-height: 1.45;
      }
      ${SETTINGS_SELECTOR} .player-identity-settings__footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      ${SETTINGS_SELECTOR} [role="status"] {
        min-height: 18px;
        color: rgba(233, 251, 255, .68);
        font-size: 12px;
      }
      ${SETTINGS_SELECTOR} button[type="submit"] {
        min-height: 40px;
        padding: 0 15px;
        border: 1px solid #ff6700;
        background: #ff6700;
        color: #071421;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      ${SETTINGS_SELECTOR} button[disabled] {
        cursor: wait;
        opacity: .64;
      }
      tr[data-admin-player-identity-settings-row] > td {
        padding: 0 12px 16px;
        border: 0;
      }
      @media (max-width: 760px) {
        ${SETTINGS_SELECTOR} .player-identity-settings__grid { grid-template-columns: 1fr; }
        ${SETTINGS_SELECTOR} .player-identity-settings__footer { align-items: stretch; }
        ${SETTINGS_SELECTOR} button[type="submit"] { width: 100%; }
      }
    `;
    document.head.append(style);
  }

  function removeLegacyIdentityUi(root = document) {
    root.querySelectorAll?.(
      "[data-admin-player-identity-manager], [data-admin-player-identity-manager-dialog]",
    ).forEach((element) => element.remove());
  }

  function decorateCreateForm(root = document) {
    const form = root.querySelector?.("[data-admin-terminal-player-form]");
    if (!form || form.dataset.playerIdentityConfigured === "true") return;

    const grid = form.querySelector(".admin-terminal-player-grid.is-settings");
    if (!grid) return;

    const fields = [...grid.children];
    const generatedPlayerId = fields.find((node) =>
      node.textContent?.trim().startsWith("Player ID")
    );
    const generatedAccessCode = fields.find((node) =>
      node.textContent?.trim().toLowerCase().startsWith("access code")
    );

    if (generatedPlayerId) {
      const label = document.createElement("label");
      label.className = "admin-terminal-field is-player-identifier";
      label.innerHTML = [
        "<span>Player ID / RFID card</span>",
        '<input type="text" name="playerIdentifier" data-admin-terminal-player-identifier autocomplete="off" placeholder="Scan RFID card or enter Player ID" required>',
      ].join("");
      generatedPlayerId.replaceWith(label);
    }

    if (generatedAccessCode) {
      const label = document.createElement("label");
      label.className = "admin-terminal-field is-player-access-code";
      label.innerHTML = [
        "<span>Access Code</span>",
        '<input type="password" name="accessCode" data-admin-terminal-player-access-code autocomplete="new-password" placeholder="Set player Access Code" required>',
      ].join("");
      generatedAccessCode.replaceWith(label);
    }

    const helper = form.querySelector(".admin-terminal-player-settings-head small");
    if (helper) {
      helper.textContent = "Player ID is the configurable RFID/card value. The UUID remains backend-only.";
    }

    form.dataset.playerIdentityConfigured = "true";
  }

  function playersSectionActive() {
    const currentFeature = feature();
    const active = text(
      currentFeature?.activeSection ||
      currentFeature?.currentSection ||
      currentFeature?.selectedSection,
    ).toLowerCase();
    if (active === "players") return true;

    const nav = document.querySelector('[data-admin-section="Players"]');
    return Boolean(
      nav && (
        nav.getAttribute("aria-current") === "page" ||
        nav.getAttribute("aria-pressed") === "true" ||
        nav.classList.contains("active") ||
        nav.classList.contains("is-active")
      )
    );
  }

  function elementHaystack(element) {
    const parts = [];
    let node = element;
    let depth = 0;
    while (node && node !== document.body && depth < 9) {
      if (node instanceof Element) {
        parts.push(node.textContent || "");
        for (const name of [
          "data-player-id",
          "data-player-uuid",
          "data-admin-player-id",
          "data-id",
          "value",
          "href",
          "aria-label",
          "title",
        ]) {
          parts.push(node.getAttribute(name) || "");
        }
      }
      node = node.parentElement;
      depth += 1;
    }
    return parts.join(" ").toLowerCase();
  }

  function playerFromElement(element) {
    if (!(element instanceof Element)) return null;
    const haystack = elementHaystack(element);
    const players = allPlayers();

    for (const player of players) {
      const id = playerUuid(player).toLowerCase();
      if (id && haystack.includes(id)) return player;
    }

    for (const player of players) {
      const identifier = playerIdentifier(player).toLowerCase();
      if (identifier && haystack.includes(identifier)) return player;
    }

    const nameMatches = players.filter((player) => {
      const name = playerName(player).toLowerCase();
      return name.length >= 3 && haystack.includes(name);
    });
    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  function isVisible(element) {
    if (!(element instanceof Element) || element.hidden) return false;
    const style = window.getComputedStyle?.(element);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || rect.width > 0 || rect.height > 0;
  }

  function detailHostFor(player) {
    const name = playerName(player).toLowerCase();
    const identifier = playerIdentifier(player).toLowerCase();
    const selectors = [
      '[data-admin-terminal-player-detail]',
      '[data-admin-player-detail]',
      '[data-admin-terminal-player-settings]',
      '[data-admin-player-settings]',
      '[role="dialog"]',
      '.admin-terminal-modal',
      '.admin-terminal-drawer',
      '.admin-terminal-detail',
      '.admin-terminal-side-panel',
    ].join(",");

    const candidates = [...document.querySelectorAll(selectors)]
      .filter(isVisible)
      .filter((element) => !element.matches("[data-admin-player-access-code-dialog]"))
      .filter((element) => !element.querySelector(SETTINGS_SELECTOR));

    for (const candidate of candidates.reverse()) {
      const content = text(candidate.textContent).toLowerCase();
      if ((name && content.includes(name)) || (identifier && content.includes(identifier))) {
        return { mode: "container", element: candidate };
      }
    }

    if (selectedPlayerElement?.isConnected) {
      const row = selectedPlayerElement.closest(
        "tr, [role='row'], article, li, .admin-terminal-player-row, .admin-terminal-card, .admin-terminal-table-row",
      );
      if (row) {
        return { mode: row.tagName === "TR" ? "table-row" : "after", element: row };
      }
    }

    return null;
  }

  function insertionTarget(host) {
    const preferred = host.querySelector?.(
      ".admin-terminal-modal-body, .admin-terminal-drawer-body, .admin-terminal-detail-body, .admin-terminal-panel-body, [data-admin-player-detail-body]",
    );
    if (preferred && preferred.tagName !== "FORM") return preferred;
    if (host.tagName !== "FORM") return host;
    return host.parentElement || host;
  }

  function createIdentitySettings(player) {
    const playerId = playerUuid(player);
    const section = document.createElement("section");
    section.setAttribute("data-admin-player-identity-settings", "");
    section.setAttribute("data-player-id", playerId);
    section.setAttribute("aria-label", `${playerName(player)} sign-in settings`);

    const header = document.createElement("div");
    header.className = "player-identity-settings__head";
    header.innerHTML = [
      '<img class="player-identity-settings__icon" src="./assets/icons/rfid-card.svg" alt="">',
      "<div>",
      `<h3>Player sign-in — ${escapeHtml(playerName(player))}</h3>`,
      "<p>Change this player’s RFID-facing Player ID or set a new Access Code. The internal UUID stays hidden and cannot be edited.</p>",
      "</div>",
    ].join("");

    const form = document.createElement("form");
    form.setAttribute("data-admin-player-identity-settings-form", "");
    form.noValidate = true;

    const grid = document.createElement("div");
    grid.className = "player-identity-settings__grid";
    grid.innerHTML = [
      "<label>",
      "<span>Player ID / RFID card</span>",
      `<input type="text" name="playerIdentifier" autocomplete="off" required placeholder="Scan RFID card or enter Player ID" value="${escapeAttribute(playerIdentifier(player))}">`,
      "<small>This is the identifier shown in the roster and used by RFID cards.</small>",
      "</label>",
      "<label>",
      "<span>New Access Code</span>",
      '<input type="password" name="accessCode" autocomplete="new-password" placeholder="Enter a replacement Access Code">',
      "<small>Leave blank to keep the current Access Code. Existing codes cannot be revealed because only their secure hashes are stored.</small>",
      "</label>",
    ].join("");

    const footer = document.createElement("div");
    footer.className = "player-identity-settings__footer";
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = rosterLabel(player)
      ? `Roster label: ${rosterLabel(player)}`
      : "Ready to save.";

    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save sign-in settings";
    footer.append(status, save);
    form.append(grid, footer);
    section.append(header, form);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
      const identifier = text(form.elements.playerIdentifier.value);
      const accessCode = text(form.elements.accessCode.value);
      const bridge = window.EconovariaPlayerAccessCodeBridge;

      if (!gameId || !playerId || !identifier) {
        status.textContent = "Player ID / RFID card is required.";
        status.style.color = "#ff6976";
        return;
      }
      if (!bridge || typeof bridge.updatePlayerIdentity !== "function") {
        status.textContent = "Player credential service is not available.";
        status.style.color = "#ff6976";
        return;
      }

      save.disabled = true;
      save.textContent = "Saving…";
      status.textContent = accessCode
        ? "Saving Player ID and new Access Code…"
        : "Saving Player ID…";
      status.style.color = "rgba(233,251,255,.68)";

      try {
        await bridge.updatePlayerIdentity({
          gameId,
          playerId,
          displayName: playerName(player),
          playerIdentifier: identifier,
          accessCode,
          showCredentialDialog: false,
        });
        updateModelPlayer(playerId, identifier);
        form.elements.accessCode.value = "";
        status.textContent = accessCode
          ? "Player ID and Access Code saved."
          : "Player ID saved. The current Access Code was not changed.";
        status.style.color = "#78f0b4";
      } catch (error) {
        status.textContent = error?.message || "Player sign-in settings could not be saved.";
        status.style.color = "#ff6976";
      } finally {
        save.disabled = false;
        save.textContent = "Save sign-in settings";
      }
    });

    return section;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function clearIdentitySettings() {
    document.querySelectorAll(SETTINGS_SELECTOR).forEach((element) => element.remove());
    document.querySelectorAll("[data-admin-player-identity-settings-row]")
      .forEach((element) => element.remove());
  }

  function decoratePlayerDetail() {
    removeLegacyIdentityUi();
    ensureStyles();

    const player = selectedPlayer();
    if (!player) return;

    const playerId = playerUuid(player);
    const existing = document.querySelector(
      `${SETTINGS_SELECTOR}[data-player-id="${CSS.escape(playerId)}"]`,
    );
    if (existing?.isConnected) return;

    clearIdentitySettings();
    const host = detailHostFor(player);
    if (!host) return;
    const settings = createIdentitySettings(player);

    if (host.mode === "table-row") {
      const row = document.createElement("tr");
      row.setAttribute("data-admin-player-identity-settings-row", "");
      row.setAttribute("data-player-id", playerId);
      const cell = document.createElement("td");
      const columnCount = Math.max(1, host.element.children.length || 1);
      cell.colSpan = columnCount;
      cell.append(settings);
      row.append(cell);
      host.element.insertAdjacentElement("afterend", row);
      return;
    }

    if (host.mode === "after") {
      host.element.insertAdjacentElement("afterend", settings);
      return;
    }

    insertionTarget(host.element).append(settings);
  }

  function selectPlayer(player, sourceElement = null) {
    const id = playerUuid(player);
    if (!id) return;
    cachePlayers([player]);
    selectedPlayerId = id;
    selectedPlayerElement = sourceElement instanceof Element ? sourceElement : null;
    window.requestAnimationFrame(() => {
      decoratePlayerDetail();
      window.setTimeout(decoratePlayerDetail, 160);
    });
  }

  function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(SETTINGS_SELECTOR)) return;

    const nav = target.closest("[data-admin-section]");
    if (nav) {
      if (nav.getAttribute("data-admin-section") !== "Players") {
        selectedPlayerId = "";
        selectedPlayerElement = null;
        clearIdentitySettings();
        return;
      }
      const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
      void loadPlayers(gameId).then(() => window.setTimeout(decoratePlayerDetail, 100));
    }

    if (!playersSectionActive() && !target.closest("[role='dialog'], .admin-terminal-modal, .admin-terminal-drawer")) {
      return;
    }

    const player = playerFromElement(target);
    if (player) selectPlayer(player, target);
  }

  function decorate(root = document) {
    removeLegacyIdentityUi(root);
    decorateCreateForm(root);
    decoratePlayerDetail();
  }

  cachePlayers(modelPlayers());
  ensureStyles();

  const mount = document.getElementById("adminPreview");
  if (mount && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => decorate(mount));
    observer.observe(mount, { childList: true, subtree: true });
  }

  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("load", () => decorate(document), { once: true });
  decorate(document);

  window.EconovariaPlayerIdentityWiring = {
    decorateCreateForm,
    decoratePlayerDetail,
    loadPlayers,
    selectPlayer,
  };
})();
