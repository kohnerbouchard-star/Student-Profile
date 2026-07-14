(function initEconovariaPlayerIdentityWiring() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const LOCAL_API_PREFIX = "/api/admin";
  const STYLE_ID = "econovaria-player-profile-identity-style";
  const PROFILE_MODAL_SELECTOR = '[data-admin-terminal-modal-backdrop][data-modal-id="player-settings-editor"]';
  const LEGACY_IDENTITY_SELECTOR = [
    "[data-admin-player-identity-manager]",
    "[data-admin-player-identity-manager-dialog]",
    "[data-admin-player-identity-settings]",
    "[data-admin-player-identity-settings-row]",
  ].join(",");

  const playerCache = new Map();
  const modalPlayers = new WeakMap();
  const pendingPlayerLoads = new Set();
  let selectedPlayerId = "";
  let selectedPlayerElement = null;

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizedText(value) {
    return text(value).replace(/\s+/g, " ").toLowerCase();
  }

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

  function playerStatus(player) {
    return text(player?.status || player?.session?.label || "active").toLowerCase();
  }

  function playerCountry(player) {
    return text(
      player?.countryName ||
      player?.country_name ||
      player?.location ||
      player?.countryCode ||
      player?.country_code,
    );
  }

  function playerRank(player) {
    return text(player?.rank || player?.playerRank || player?.player_rank);
  }

  function uniquePlayers(players) {
    const seen = new Set();
    return (Array.isArray(players) ? players : []).filter((player) => {
      const id = playerUuid(player);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function modelPlayers() {
    const model = feature()?.currentModel || {};
    const arrays = [model.players, model.roster, model.playerRoster].filter(Array.isArray);
    return uniquePlayers(arrays.flat());
  }

  function responsePlayers(value) {
    const source = record(value);
    const data = record(source.data);
    const payload = record(source.payload);
    const nestedData = record(data.data);
    const arrays = [
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
    ].filter(Array.isArray);
    return uniquePlayers(arrays.flat());
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

  function updateModelPlayer(playerId, updates) {
    const next = record(updates);
    const model = feature()?.currentModel;
    if (model) {
      for (const key of ["players", "roster", "playerRoster"]) {
        if (!Array.isArray(model[key])) continue;
        model[key] = model[key].map((player) => {
          if (playerUuid(player) !== playerId) return player;
          return {
            ...player,
            ...(next.displayName ? { displayName: next.displayName, display_name: next.displayName, name: next.displayName } : {}),
            ...(next.playerIdentifier ? { playerIdentifier: next.playerIdentifier, player_identifier: next.playerIdentifier } : {}),
            ...(next.status ? { status: next.status } : {}),
            ...(next.countryAssignment ? { countryName: next.countryAssignment, location: next.countryAssignment } : {}),
          };
        });
      }
    }
    const cached = playerCache.get(playerId);
    if (cached) {
      playerCache.set(playerId, {
        ...cached,
        ...(next.displayName ? { displayName: next.displayName, display_name: next.displayName, name: next.displayName } : {}),
        ...(next.playerIdentifier ? { playerIdentifier: next.playerIdentifier, player_identifier: next.playerIdentifier } : {}),
        ...(next.status ? { status: next.status } : {}),
        ...(next.countryAssignment ? { countryName: next.countryAssignment, location: next.countryAssignment } : {}),
      });
    }
  }

  function removeLegacyIdentityUi(root = document) {
    root.querySelectorAll?.(LEGACY_IDENTITY_SELECTOR).forEach((element) => element.remove());
  }

  function createCredentialInput(kind) {
    const identifier = kind === "identifier";
    const label = document.createElement("label");
    label.className = identifier
      ? "admin-terminal-field is-player-identifier"
      : "admin-terminal-field is-player-access-code";
    label.setAttribute("data-admin-player-create-credential-field", kind);
    label.innerHTML = identifier
      ? [
          "<span>Player ID / RFID card</span>",
          '<input type="text" name="playerIdentifier" data-admin-terminal-player-identifier autocomplete="off" placeholder="Scan RFID card or enter Player ID" required>',
        ].join("")
      : [
          "<span>Access Code</span>",
          '<input type="password" name="accessCode" data-admin-terminal-player-access-code autocomplete="new-password" placeholder="Set player Access Code" required>',
        ].join("");
    return label;
  }

  function generatedCredentialTile(form, kind) {
    const identifier = kind === "identifier";
    const candidates = [...form.querySelectorAll(
      "label, fieldset, article, section, li, .admin-terminal-field, .admin-terminal-player-setting, .admin-terminal-player-settings-field, div",
    )].filter((element) => {
      if (element.matches("[data-admin-player-create-credential-field]")) return false;
      if (element.querySelector("input, select, textarea, button")) return false;
      const content = normalizedText(element.textContent);
      const generated =
        content.includes("generated securely after create") ||
        content.includes("generated after create") ||
        content.includes("generated securely");
      if (!generated) return false;
      return identifier
        ? content.includes("player id") && !content.includes("access code")
        : content.includes("access code");
    });
    candidates.sort((left, right) => normalizedText(left.textContent).length - normalizedText(right.textContent).length);
    return candidates[0] || null;
  }

  function fallbackInsertionAnchor(form) {
    const notes = form.querySelector('[name="notes"]');
    if (notes) return notes.closest("label, .admin-terminal-field, fieldset, article, section, div") || notes;
    const actions = form.querySelector(
      '[data-admin-terminal-action="create-player"], button[type="submit"], .admin-terminal-modal-actions',
    );
    return actions?.closest("div, footer") || actions || null;
  }

  function insertCredentialField(form, kind) {
    const field = createCredentialInput(kind);
    const tile = generatedCredentialTile(form, kind);
    if (tile) {
      tile.replaceWith(field);
      return;
    }
    const anchor = fallbackInsertionAnchor(form);
    if (anchor?.parentElement) anchor.insertAdjacentElement("beforebegin", field);
    else form.append(field);
  }

  function removeRemainingGeneratedCredentialTiles(form) {
    for (const kind of ["identifier", "accessCode"]) {
      let tile = generatedCredentialTile(form, kind);
      while (tile) {
        tile.remove();
        tile = generatedCredentialTile(form, kind);
      }
    }
  }

  function updateCreateFormHelper(form) {
    const preferred = form.querySelector(".admin-terminal-player-settings-head small");
    if (preferred) {
      preferred.textContent = "Player ID is the configurable RFID/card value. The UUID remains backend-only.";
      return;
    }
    const helper = [...form.querySelectorAll("small, p")].find((element) => {
      const content = normalizedText(element.textContent);
      return content.includes("player id") && content.includes("access code") && content.includes("generated");
    });
    if (helper) helper.textContent = "Set the RFID-facing Player ID and Access Code now. The UUID remains backend-only.";
  }

  function configureCreateForm(form) {
    if (!(form instanceof Element) || form.dataset.playerIdentityConfigured === "true") return;
    let identifierInput = form.querySelector('[name="playerIdentifier"]');
    let accessCodeInput = form.querySelector('[name="accessCode"]');
    if (!identifierInput) {
      insertCredentialField(form, "identifier");
      identifierInput = form.querySelector('[name="playerIdentifier"]');
    }
    if (!accessCodeInput) {
      insertCredentialField(form, "accessCode");
      accessCodeInput = form.querySelector('[name="accessCode"]');
    }
    if (!identifierInput || !accessCodeInput) return;
    identifierInput.required = true;
    identifierInput.disabled = false;
    accessCodeInput.required = true;
    accessCodeInput.disabled = false;
    removeRemainingGeneratedCredentialTiles(form);
    updateCreateFormHelper(form);
    form.dataset.playerIdentityConfigured = "true";
  }

  function decorateCreateForm(root = document) {
    const forms = [];
    if (root instanceof Element && root.matches("[data-admin-terminal-player-form]")) forms.push(root);
    forms.push(...(root.querySelectorAll?.("[data-admin-terminal-player-form]") || []));
    [...new Set(forms)].forEach(configureCreateForm);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-admin-player-create-credential-field] { min-width: 0; }
      [data-admin-player-profile-field-help] {
        display: block;
        margin-top: 2px;
        color: rgba(190,205,207,.68) !important;
        font-size: 8px !important;
        line-height: 1.3 !important;
        letter-spacing: 0 !important;
        text-transform: none !important;
      }
      [data-admin-player-profile-save-status] {
        grid-column: 1 / -1;
        min-height: 18px;
        padding: 7px 9px;
        border: 1px solid rgba(0,212,255,.14);
        background: rgba(0,212,255,.035);
        color: rgba(233,251,255,.72);
        font-size: 9px;
        line-height: 1.35;
      }
      [data-admin-player-profile-save-status][data-tone="success"] {
        border-color: rgba(120,240,180,.32);
        color: #78f0b4;
      }
      [data-admin-player-profile-save-status][data-tone="error"] {
        border-color: rgba(255,105,118,.34);
        color: #ff6976;
      }
    `;
    document.head.append(style);
  }

  function directPlayerId(element) {
    const owner = element?.closest?.("[data-player-id]");
    return text(owner?.getAttribute("data-player-id"));
  }

  function playerFromElement(element) {
    if (!(element instanceof Element)) return null;
    const directId = directPlayerId(element);
    if (directId) {
      const direct = allPlayers().find((player) => playerUuid(player) === directId);
      if (direct) return direct;
    }

    const rank = text(element.closest("[data-player-rank]")?.getAttribute("data-player-rank"));
    if (rank) {
      const rankMatches = allPlayers().filter((player) => playerRank(player) === rank);
      if (rankMatches.length === 1) return rankMatches[0];
    }

    const parts = [];
    let node = element;
    let depth = 0;
    while (node && node !== document.body && depth < 10) {
      if (node instanceof Element) {
        parts.push(node.textContent || "");
        for (const name of ["data-player-id", "data-player-rank", "data-id", "value", "href", "aria-label", "title"]) {
          parts.push(node.getAttribute(name) || "");
        }
      }
      node = node.parentElement;
      depth += 1;
    }
    const haystack = normalizedText(parts.join(" "));
    for (const player of allPlayers()) {
      const id = playerUuid(player).toLowerCase();
      if (id && haystack.includes(id)) return player;
    }
    for (const player of allPlayers()) {
      const identifier = playerIdentifier(player).toLowerCase();
      if (identifier && haystack.includes(identifier)) return player;
    }
    const nameMatches = allPlayers().filter((player) => {
      const name = playerName(player).toLowerCase();
      return name.length >= 3 && haystack.includes(name);
    });
    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  function selectPlayer(player, sourceElement = null) {
    const id = playerUuid(player);
    if (!id) return;
    cachePlayers([player]);
    selectedPlayerId = id;
    selectedPlayerElement = sourceElement instanceof Element ? sourceElement : null;
    scheduleDecorate();
  }

  async function selectPlayerById(playerId, sourceElement) {
    if (!playerId) return;
    selectedPlayerId = playerId;
    selectedPlayerElement = sourceElement instanceof Element ? sourceElement : selectedPlayerElement;
    let player = allPlayers().find((item) => playerUuid(item) === playerId);
    if (!player) {
      const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
      const players = await loadPlayers(gameId);
      player = players.find((item) => playerUuid(item) === playerId);
    }
    if (player) selectPlayer(player, sourceElement);
    else scheduleDecorate();
  }

  function selectedPlayer() {
    cachePlayers(modelPlayers());
    return playerCache.get(selectedPlayerId) || null;
  }

  function profileModal(root = document) {
    const candidates = [];
    if (root instanceof Element && root.matches(PROFILE_MODAL_SELECTOR)) candidates.push(root);
    candidates.push(...(root.querySelectorAll?.(PROFILE_MODAL_SELECTOR) || []));
    return candidates.reverse().find((modal) => modal.isConnected) || null;
  }

  function modalPlayerId(modal) {
    const fromSelection = selectedPlayerId || directPlayerId(selectedPlayerElement);
    if (fromSelection) return fromSelection;
    const content = text(modal?.textContent);
    const uuid = content.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0];
    return text(uuid);
  }

  function requestPlayerForModal(modal, playerId) {
    if (!playerId || pendingPlayerLoads.has(playerId)) return;
    pendingPlayerLoads.add(playerId);
    const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
    void loadPlayers(gameId).then((players) => {
      pendingPlayerLoads.delete(playerId);
      const player = players.find((item) => playerUuid(item) === playerId);
      if (player) {
        selectedPlayerId = playerId;
        cachePlayers([player]);
      }
      if (modal?.isConnected) decorateProfileModal(modal);
    });
  }

  function resolveModalPlayer(modal) {
    const current = selectedPlayer();
    if (current) return current;
    const id = modalPlayerId(modal);
    if (!id) return null;
    selectedPlayerId = id;
    const cached = allPlayers().find((player) => playerUuid(player) === id);
    if (cached) return cached;
    requestPlayerForModal(modal, id);
    return null;
  }

  function fieldByCaption(modal, caption) {
    return [...modal.querySelectorAll("label")].find((label) => {
      const heading = label.querySelector(":scope > span");
      return normalizedText(heading?.textContent) === normalizedText(caption);
    }) || null;
  }

  function fieldControl(label) {
    return label?.querySelector("input, select, textarea") || null;
  }

  function addFieldHelp(label, message) {
    if (!label) return;
    label.querySelector("[data-admin-player-profile-field-help]")?.remove();
    const helper = document.createElement("small");
    helper.setAttribute("data-admin-player-profile-field-help", "");
    helper.textContent = message;
    label.append(helper);
  }

  function setSelectValue(select, value) {
    if (!(select instanceof HTMLSelectElement)) return;
    const target = normalizedText(value);
    const option = [...select.options].find((item) => {
      return normalizedText(item.value) === target || normalizedText(item.textContent) === target;
    });
    if (option) select.value = option.value;
  }

  function setProfileStatus(modal, message, tone = "neutral") {
    const status = modal.querySelector("[data-admin-player-profile-save-status]");
    if (!status) return;
    status.textContent = message;
    status.setAttribute("data-tone", tone);
  }

  function updateProfileSummary(modal, player) {
    const panels = [...modal.querySelectorAll(".admin-terminal-player-ops-panel")];
    const idPanel = panels.find((panel) => normalizedText(panel.querySelector("span")?.textContent) === "player id");
    if (idPanel) {
      const value = idPanel.querySelector("strong");
      if (value) value.textContent = playerIdentifier(player) || "Not set";
      const description = idPanel.querySelector("p");
      if (description) description.textContent = "Configurable RFID/card-facing identifier. The internal UUID remains hidden and immutable.";
    }
    const accessPanel = panels.find((panel) => normalizedText(panel.querySelector("span")?.textContent) === "access code");
    if (accessPanel) {
      const value = accessPanel.querySelector("strong");
      if (value) value.textContent = "Protected · not displayed";
      const description = accessPanel.querySelector("p");
      if (description) description.textContent = "Enter a replacement below only when the Access Code should change.";
    }
  }

  async function saveProfileSettings(modal, player) {
    const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
    const playerId = playerUuid(player);
    const nameInput = fieldControl(fieldByCaption(modal, "Player name"));
    const identifierInput = fieldControl(fieldByCaption(modal, "Player ID / RFID card"));
    const accessCodeInput = fieldControl(fieldByCaption(modal, "New Access Code"));
    const statusInput = fieldControl(fieldByCaption(modal, "Player status"));
    const countryInput = fieldControl(fieldByCaption(modal, "Country assignment"));
    const noteInput = fieldControl(fieldByCaption(modal, "Admin note"));
    const save = modal.querySelector('[data-admin-terminal-action="confirm-player-settings-save"]');

    const displayName = text(nameInput?.value) || playerName(player);
    const identifier = text(identifierInput?.value);
    const accessCode = text(accessCodeInput?.value);
    const status = text(statusInput?.value).toLowerCase() || playerStatus(player);
    const countryAssignment = text(countryInput?.value) || playerCountry(player);
    const adminNote = text(noteInput?.value);
    const bridge = window.EconovariaPlayerAccessCodeBridge;

    if (!gameId || !playerId || !identifier) {
      setProfileStatus(modal, "Player ID / RFID card is required.", "error");
      identifierInput?.focus?.();
      return;
    }
    if (!bridge || typeof bridge.updatePlayerIdentity !== "function") {
      setProfileStatus(modal, "Player credential service is not available.", "error");
      return;
    }

    if (save) {
      save.disabled = true;
      save.textContent = "Saving…";
    }
    setProfileStatus(modal, accessCode
      ? "Saving player profile, Player ID, and new Access Code…"
      : "Saving player profile and Player ID…");

    try {
      const profileResponse = await window.fetch(
        `${LOCAL_API_PREFIX}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/settings`,
        {
          method: "PATCH",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: {
              displayName,
              status,
              countryAssignment,
              adminNote: adminNote || null,
            },
          }),
        },
      );
      const profileBody = await profileResponse.clone().json().catch(() => ({}));
      if (!profileResponse.ok || profileBody?.ok === false) {
        throw new Error(text(profileBody?.error?.message || profileBody?.message) || "Player profile settings could not be saved.");
      }

      await bridge.updatePlayerIdentity({
        gameId,
        playerId,
        displayName,
        playerIdentifier: identifier,
        accessCode,
        showCredentialDialog: false,
      });

      updateModelPlayer(playerId, { displayName, playerIdentifier: identifier, status, countryAssignment });
      if (accessCodeInput) accessCodeInput.value = "";
      updateProfileSummary(modal, playerCache.get(playerId) || player);
      setProfileStatus(modal, accessCode
        ? "Player profile, Player ID, and Access Code saved."
        : "Player profile and Player ID saved. The current Access Code was not changed.", "success");
    } catch (error) {
      setProfileStatus(modal, error?.message || "Player profile settings could not be saved.", "error");
    } finally {
      if (save) {
        save.disabled = false;
        save.textContent = "Save settings";
      }
    }
  }

  function decorateProfileModal(root = document) {
    removeLegacyIdentityUi(root);
    ensureStyles();
    const modal = profileModal(root) || profileModal(document);
    if (!modal || modal.hasAttribute("data-admin-player-profile-identity-editor")) return;
    const player = resolveModalPlayer(modal);
    if (!player) return;

    const nameLabel = fieldByCaption(modal, "Player name");
    const idLabel = fieldByCaption(modal, "Player ID");
    const accessLabel = fieldByCaption(modal, "Access code");
    const statusLabel = fieldByCaption(modal, "Player status");
    const countryLabel = fieldByCaption(modal, "Country assignment");
    const noteLabel = fieldByCaption(modal, "Admin note");
    const nameInput = fieldControl(nameLabel);
    const idInput = fieldControl(idLabel);
    const accessInput = fieldControl(accessLabel);
    const statusInput = fieldControl(statusLabel);
    const countryInput = fieldControl(countryLabel);
    const noteInput = fieldControl(noteLabel);

    if (!idLabel || !idInput || !accessLabel || !accessInput) return;

    modal.setAttribute("data-admin-player-profile-identity-editor", "");
    modalPlayers.set(modal, player);

    if (nameInput) {
      nameInput.name = "displayName";
      nameInput.value = playerName(player);
      nameInput.autocomplete = "off";
    }

    const idHeading = idLabel.querySelector(":scope > span");
    if (idHeading) idHeading.textContent = "Player ID / RFID card";
    idInput.name = "playerIdentifier";
    idInput.type = "text";
    idInput.value = playerIdentifier(player);
    idInput.required = true;
    idInput.autocomplete = "off";
    idInput.placeholder = "Scan RFID card or enter Player ID";
    addFieldHelp(idLabel, "This is the configurable sign-in/RFID value. The internal UUID is not shown and cannot be edited.");

    const accessHeading = accessLabel.querySelector(":scope > span");
    if (accessHeading) accessHeading.textContent = "New Access Code";
    accessInput.name = "accessCode";
    accessInput.type = "password";
    accessInput.value = "";
    accessInput.required = false;
    accessInput.autocomplete = "new-password";
    accessInput.placeholder = "Leave blank to keep the current Access Code";
    addFieldHelp(accessLabel, "Existing Access Codes cannot be displayed because only secure hashes are stored.");

    if (statusInput) {
      statusInput.name = "status";
      setSelectValue(statusInput, playerStatus(player));
    }
    if (countryInput) {
      countryInput.name = "countryAssignment";
      countryInput.value = playerCountry(player);
    }
    if (noteInput) noteInput.name = "adminNote";

    updateProfileSummary(modal, player);

    const footer = modal.querySelector(".admin-terminal-player-ops-footer");
    if (footer && !footer.querySelector("[data-admin-player-profile-save-status]")) {
      const status = document.createElement("div");
      status.setAttribute("data-admin-player-profile-save-status", "");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent = rosterLabel(player) ? `Roster label: ${rosterLabel(player)}. Ready to save.` : "Ready to save.";
      footer.prepend(status);
    }

    if (modal.dataset.playerProfileSaveBound !== "true") {
      modal.dataset.playerProfileSaveBound = "true";
      modal.addEventListener("click", (event) => {
        const action = event.target instanceof Element
          ? event.target.closest('[data-admin-terminal-action="confirm-player-settings-save"]')
          : null;
        if (!action || !modal.contains(action)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        void saveProfileSettings(modal, modalPlayers.get(modal) || player);
      }, true);
    }
  }

  function decorate(root = document) {
    removeLegacyIdentityUi(root);
    decorateCreateForm(root);
    decorateProfileModal(root);
  }

  function scheduleDecorate() {
    window.setTimeout(() => decorate(document), 0);
    window.setTimeout(() => decorate(document), 80);
    window.setTimeout(() => decorate(document), 220);
    window.setTimeout(() => decorate(document), 500);
  }

  function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const nav = target.closest("[data-admin-section]");
    if (nav) {
      if (nav.getAttribute("data-admin-section") !== "Players") {
        selectedPlayerId = "";
        selectedPlayerElement = null;
        removeLegacyIdentityUi();
      } else {
        const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
        void loadPlayers(gameId).then(scheduleDecorate);
      }
      scheduleDecorate();
      return;
    }

    const settingsAction = target.closest('[data-admin-terminal-action="player-settings"]');
    if (settingsAction) {
      const directId = directPlayerId(settingsAction);
      selectedPlayerId = directId || selectedPlayerId;
      selectedPlayerElement = settingsAction;
      const player = playerFromElement(settingsAction);
      if (player) selectPlayer(player, settingsAction);
      else if (directId) void selectPlayerById(directId, settingsAction);
      scheduleDecorate();
      return;
    }

    if (target.closest(PROFILE_MODAL_SELECTOR)) {
      scheduleDecorate();
      return;
    }

    const player = playerFromElement(target);
    if (player) {
      selectedPlayerId = playerUuid(player) || selectedPlayerId;
      selectedPlayerElement = target;
      cachePlayers([player]);
    }
    scheduleDecorate();
  }

  cachePlayers(modelPlayers());
  ensureStyles();
  const observerRoot = document.body || document.documentElement;
  if (observerRoot && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => decorate(document));
    observer.observe(observerRoot, { childList: true, subtree: true });
  }
  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("load", () => decorate(document), { once: true });
  decorate(document);

  window.EconovariaPlayerIdentityWiring = {
    decorateCreateForm,
    decorateProfileModal,
    loadPlayers,
    selectPlayer,
    selectPlayerById,
  };
})();
