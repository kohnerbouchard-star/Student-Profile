(function initEconovariaPlayerIdentityWiring() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const LOCAL_API_PREFIX = "/api/admin";
  const PROFILE_MODAL_SELECTOR = '[data-admin-terminal-modal-backdrop][data-modal-id="player-settings-editor"]';
  const STYLE_ID = "econovaria-player-profile-identity-style";
  const LEGACY_SELECTOR = [
    "[data-admin-player-identity-manager]",
    "[data-admin-player-identity-manager-dialog]",
    "[data-admin-player-identity-settings]",
    "[data-admin-player-identity-settings-row]",
  ].join(",");

  const playerCache = new Map();
  const loadingPlayers = new Set();
  let selectedPlayerId = "";

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalized(value) {
    return text(value).replace(/\s+/g, " ").toLowerCase();
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function terminalFeature() {
    return window.Econovaria?.features?.adminOverviewTerminal || null;
  }

  function playerUuid(player) {
    return text(player?.id || player?.playerId || player?.player_id);
  }

  function playerName(player) {
    return text(player?.displayName || player?.display_name || player?.name) || "Unnamed player";
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
    return text(player?.status || "active").toLowerCase();
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

  function rosterLabel(player) {
    return text(player?.rosterLabel || player?.roster_label);
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

  function cachePlayers(players) {
    for (const player of uniquePlayers(players)) {
      playerCache.set(playerUuid(player), player);
    }
  }

  function modelPlayers() {
    const model = terminalFeature()?.currentModel || {};
    const arrays = [model.players, model.roster, model.playerRoster].filter(Array.isArray);
    return uniquePlayers(arrays.flat());
  }

  function responsePlayers(value) {
    const source = object(value);
    const data = object(source.data);
    const payload = object(source.payload);
    const nested = object(data.data);
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
      nested.players,
      nested.roster,
      nested.playerRoster,
    ].filter(Array.isArray);
    return uniquePlayers(arrays.flat());
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

  function updateCachedPlayer(playerId, values) {
    const updates = object(values);
    const cached = playerCache.get(playerId);
    if (cached) {
      playerCache.set(playerId, {
        ...cached,
        ...(updates.displayName ? {
          displayName: updates.displayName,
          display_name: updates.displayName,
          name: updates.displayName,
        } : {}),
        ...(updates.playerIdentifier ? {
          playerIdentifier: updates.playerIdentifier,
          player_identifier: updates.playerIdentifier,
        } : {}),
        ...(updates.status ? { status: updates.status } : {}),
        ...(updates.countryAssignment ? {
          countryName: updates.countryAssignment,
          location: updates.countryAssignment,
        } : {}),
      });
    }

    const model = terminalFeature()?.currentModel;
    if (!model) return;
    for (const key of ["players", "roster", "playerRoster"]) {
      if (!Array.isArray(model[key])) continue;
      model[key] = model[key].map((player) => {
        if (playerUuid(player) !== playerId) return player;
        return {
          ...player,
          ...(updates.displayName ? {
            displayName: updates.displayName,
            display_name: updates.displayName,
            name: updates.displayName,
          } : {}),
          ...(updates.playerIdentifier ? {
            playerIdentifier: updates.playerIdentifier,
            player_identifier: updates.playerIdentifier,
          } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.countryAssignment ? {
            countryName: updates.countryAssignment,
            location: updates.countryAssignment,
          } : {}),
        };
      });
    }
  }

  function removeLegacyIdentityUi(root = document) {
    root.querySelectorAll?.(LEGACY_SELECTOR).forEach((element) => element.remove());
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-admin-player-create-credential-field] { min-width: 0; }
      [data-admin-player-profile-field-help] {
        display: block;
        margin-top: 3px;
        color: rgba(190,205,207,.68) !important;
        font-size: 8px !important;
        line-height: 1.35 !important;
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

  function createCredentialInput(kind) {
    const identifier = kind === "identifier";
    const label = document.createElement("label");
    label.className = identifier
      ? "admin-terminal-field is-player-identifier"
      : "admin-terminal-field is-player-access-code";
    label.setAttribute("data-admin-player-create-credential-field", kind);
    label.innerHTML = identifier
      ? '<span>Player ID / RFID card</span><input type="text" name="playerIdentifier" autocomplete="off" placeholder="Scan RFID card or enter Player ID" required>'
      : '<span>Access Code</span><input type="password" name="accessCode" autocomplete="new-password" placeholder="Set player Access Code" required>';
    return label;
  }

  function generatedCredentialTile(form, kind) {
    const identifier = kind === "identifier";
    const candidates = [...form.querySelectorAll(
      "label, fieldset, article, section, li, .admin-terminal-field, div",
    )].filter((element) => {
      if (element.matches("[data-admin-player-create-credential-field]")) return false;
      if (element.querySelector("input, select, textarea, button")) return false;
      const content = normalized(element.textContent);
      const generated = content.includes("generated after create") || content.includes("generated securely");
      if (!generated) return false;
      return identifier
        ? content.includes("player id") && !content.includes("access code")
        : content.includes("access code");
    });
    candidates.sort((left, right) => normalized(left.textContent).length - normalized(right.textContent).length);
    return candidates[0] || null;
  }

  function insertCreateCredentialField(form, kind) {
    const field = createCredentialInput(kind);
    const tile = generatedCredentialTile(form, kind);
    if (tile) {
      tile.replaceWith(field);
      return;
    }
    const notes = form.querySelector('[name="notes"]');
    const anchor = notes?.closest("label, .admin-terminal-field") || form.querySelector("button[type='submit']")?.parentElement;
    if (anchor) anchor.insertAdjacentElement("beforebegin", field);
    else form.append(field);
  }

  function configureCreateForm(form) {
    if (!(form instanceof Element) || form.dataset.playerIdentityConfigured === "true") return;
    if (!form.querySelector('[name="playerIdentifier"]')) insertCreateCredentialField(form, "identifier");
    if (!form.querySelector('[name="accessCode"]')) insertCreateCredentialField(form, "accessCode");
    const identifier = form.querySelector('[name="playerIdentifier"]');
    const accessCode = form.querySelector('[name="accessCode"]');
    if (!identifier || !accessCode) return;
    identifier.required = true;
    accessCode.required = true;
    const helper = form.querySelector(".admin-terminal-player-settings-head small");
    if (helper) helper.textContent = "Set the RFID-facing Player ID and Access Code. The UUID remains backend-only.";
    form.dataset.playerIdentityConfigured = "true";
  }

  function decorateCreateForms(root = document) {
    const forms = [];
    if (root instanceof Element && root.matches("[data-admin-terminal-player-form]")) forms.push(root);
    forms.push(...(root.querySelectorAll?.("[data-admin-terminal-player-form]") || []));
    [...new Set(forms)].forEach(configureCreateForm);
  }

  function visibleProfileModal(root = document) {
    const modals = [];
    if (root instanceof Element && root.matches(PROFILE_MODAL_SELECTOR)) modals.push(root);
    modals.push(...(root.querySelectorAll?.(PROFILE_MODAL_SELECTOR) || []));
    return modals.reverse().find((modal) => modal.isConnected) || null;
  }

  function modalPlayerId(modal) {
    return text(
      selectedPlayerId ||
      modal?.querySelector('[data-admin-terminal-action="confirm-player-settings-save"][data-player-id]')?.getAttribute("data-player-id") ||
      modal?.querySelector("[data-player-id]")?.getAttribute("data-player-id"),
    );
  }

  function requestModalPlayer(modal, playerId) {
    if (!playerId || loadingPlayers.has(playerId)) return;
    loadingPlayers.add(playerId);
    const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
    void loadPlayers(gameId).then(() => {
      loadingPlayers.delete(playerId);
      if (modal?.isConnected) decorateProfileModal(modal);
    });
  }

  function resolveModalPlayer(modal) {
    const playerId = modalPlayerId(modal);
    if (!playerId) return null;
    selectedPlayerId = playerId;
    cachePlayers(modelPlayers());
    const player = playerCache.get(playerId) || null;
    if (player) return player;
    requestModalPlayer(modal, playerId);
    return null;
  }

  function fieldByCaption(modal, caption) {
    return [...modal.querySelectorAll("label")].find((label) => {
      return normalized(label.querySelector(":scope > span")?.textContent) === normalized(caption);
    }) || null;
  }

  function fieldControl(label) {
    return label?.querySelector("input, select, textarea") || null;
  }

  function addHelp(label, message) {
    label.querySelector("[data-admin-player-profile-field-help]")?.remove();
    const help = document.createElement("small");
    help.setAttribute("data-admin-player-profile-field-help", "");
    help.textContent = message;
    label.append(help);
  }

  function createProfileCredentialField(kind) {
    const identifier = kind === "identifier";
    const label = document.createElement("label");
    label.className = "admin-terminal-player-ops-field";
    label.setAttribute("data-admin-player-profile-credential-field", kind);

    const heading = document.createElement("span");
    heading.textContent = identifier ? "Player ID / RFID card" : "New Access Code";

    const input = document.createElement("input");
    input.type = identifier ? "text" : "password";
    input.name = identifier ? "playerIdentifier" : "accessCode";
    input.autocomplete = identifier ? "off" : "new-password";
    input.placeholder = identifier
      ? "Scan RFID card or enter Player ID"
      : "Leave blank to keep the current Access Code";
    input.required = identifier;

    label.append(heading, input);
    addHelp(
      label,
      identifier
        ? "This is the configurable sign-in/RFID value. The internal UUID is hidden and cannot be edited."
        : "Existing Access Codes cannot be displayed because only secure hashes are stored.",
    );
    return label;
  }

  function ensureProfileCredentialFields(modal) {
    const grid = modal.querySelector(".admin-terminal-player-ops-form-grid");
    if (!grid) return null;

    let identifierLabel = fieldByCaption(modal, "Player ID / RFID card");
    if (!identifierLabel) {
      identifierLabel = createProfileCredentialField("identifier");
      grid.append(identifierLabel);
    }

    let accessLabel = fieldByCaption(modal, "New Access Code");
    if (!accessLabel) {
      accessLabel = createProfileCredentialField("accessCode");
      grid.append(accessLabel);
    }

    return {
      identifierLabel,
      identifierInput: fieldControl(identifierLabel),
      accessLabel,
      accessInput: fieldControl(accessLabel),
    };
  }

  function setSelectValue(select, value) {
    if (!(select instanceof HTMLSelectElement)) return;
    const target = normalized(value);
    const option = [...select.options].find((item) => {
      return normalized(item.value) === target || normalized(item.textContent) === target;
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
    const idPanel = panels.find((panel) => normalized(panel.querySelector("span")?.textContent) === "player id");
    if (idPanel) {
      const value = idPanel.querySelector("strong");
      if (value) value.textContent = playerIdentifier(player) || "Not set";
      const description = idPanel.querySelector("p");
      if (description) description.textContent = "Configurable RFID/card-facing identifier. The internal UUID is hidden and immutable.";
    }
    const accessPanel = panels.find((panel) => normalized(panel.querySelector("span")?.textContent) === "access code");
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
    const displayName = text(fieldControl(fieldByCaption(modal, "Player name"))?.value) || playerName(player);
    const identifierInput = fieldControl(fieldByCaption(modal, "Player ID / RFID card"));
    const accessInput = fieldControl(fieldByCaption(modal, "New Access Code"));
    const identifier = text(identifierInput?.value);
    const accessCode = text(accessInput?.value);
    const status = text(fieldControl(fieldByCaption(modal, "Player status"))?.value).toLowerCase() || playerStatus(player);
    const countryAssignment = text(fieldControl(fieldByCaption(modal, "Country assignment"))?.value) || playerCountry(player);
    const adminNote = text(fieldControl(fieldByCaption(modal, "Admin note"))?.value);
    const save = modal.querySelector('[data-admin-terminal-action="confirm-player-settings-save"]');
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
    setProfileStatus(
      modal,
      accessCode
        ? "Saving player profile, Player ID, and new Access Code…"
        : "Saving player profile and Player ID…",
    );

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
        throw new Error(
          text(profileBody?.error?.message || profileBody?.message) ||
          "Player profile settings could not be saved.",
        );
      }

      await bridge.updatePlayerIdentity({
        gameId,
        playerId,
        displayName,
        playerIdentifier: identifier,
        accessCode,
        showCredentialDialog: false,
      });

      updateCachedPlayer(playerId, { displayName, playerIdentifier: identifier, status, countryAssignment });
      if (accessInput) accessInput.value = "";
      updateProfileSummary(modal, playerCache.get(playerId) || player);
      setProfileStatus(
        modal,
        accessCode
          ? "Player profile, Player ID, and Access Code saved."
          : "Player profile and Player ID saved. The current Access Code was not changed.",
        "success",
      );
    } catch (error) {
      setProfileStatus(
        modal,
        error?.message || "Player profile settings could not be saved.",
        "error",
      );
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
    const modal = visibleProfileModal(root) || visibleProfileModal(document);
    if (!modal || modal.hasAttribute("data-admin-player-profile-identity-editor")) return;

    const player = resolveModalPlayer(modal);
    if (!player) return;

    const fields = ensureProfileCredentialFields(modal);
    if (!fields?.identifierInput || !fields?.accessInput) return;

    modal.setAttribute("data-admin-player-profile-identity-editor", "");
    modal.setAttribute("data-player-id", playerUuid(player));

    const nameInput = fieldControl(fieldByCaption(modal, "Player name"));
    if (nameInput) {
      nameInput.name = "displayName";
      nameInput.value = playerName(player);
      nameInput.autocomplete = "off";
    }

    fields.identifierInput.value = playerIdentifier(player);
    fields.identifierInput.required = true;
    fields.accessInput.value = "";
    fields.accessInput.required = false;

    const statusInput = fieldControl(fieldByCaption(modal, "Player status"));
    if (statusInput) {
      statusInput.name = "status";
      setSelectValue(statusInput, playerStatus(player));
    }

    const countryInput = fieldControl(fieldByCaption(modal, "Country assignment"));
    if (countryInput) {
      countryInput.name = "countryAssignment";
      countryInput.value = playerCountry(player);
    }

    const noteInput = fieldControl(fieldByCaption(modal, "Admin note"));
    if (noteInput) noteInput.name = "adminNote";

    updateProfileSummary(modal, player);

    const footer = modal.querySelector(".admin-terminal-player-ops-footer");
    if (footer && !footer.querySelector("[data-admin-player-profile-save-status]")) {
      const status = document.createElement("div");
      status.setAttribute("data-admin-player-profile-save-status", "");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent = rosterLabel(player)
        ? `Roster label: ${rosterLabel(player)}. Ready to save.`
        : "Ready to save.";
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
        const current = playerCache.get(playerUuid(player)) || player;
        void saveProfileSettings(modal, current);
      }, true);
    }
  }

  function scheduleDecorate() {
    for (const delay of [0, 60, 160, 320, 600]) {
      window.setTimeout(() => decorate(document), delay);
    }
  }

  function decorate(root = document) {
    removeLegacyIdentityUi(root);
    decorateCreateForms(root);
    decorateProfileModal(root);
  }

  function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const settings = target.closest('[data-admin-terminal-action="player-settings"]');
    if (settings) {
      selectedPlayerId = text(settings.getAttribute("data-player-id"));
      const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
      void loadPlayers(gameId).then(scheduleDecorate);
      scheduleDecorate();
      return;
    }

    const nav = target.closest("[data-admin-section]");
    if (nav) {
      if (nav.getAttribute("data-admin-section") !== "Players") selectedPlayerId = "";
      else {
        const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
        void loadPlayers(gameId).then(scheduleDecorate);
      }
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
    decorateCreateForm: decorateCreateForms,
    decorateProfileModal,
    loadPlayers,
    selectPlayer(player) {
      const id = playerUuid(player);
      if (!id) return;
      cachePlayers([player]);
      selectedPlayerId = id;
      scheduleDecorate();
    },
    selectPlayerById(playerId) {
      selectedPlayerId = text(playerId);
      const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
      return loadPlayers(gameId).then(scheduleDecorate);
    },
  };
})();
