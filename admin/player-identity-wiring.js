(function initEconovariaPlayerIdentityWiring() {
  "use strict";

  const LOCAL_API_PREFIX = "/api/admin";
  const PROFILE_MODAL_SELECTOR = '[data-admin-terminal-modal-backdrop][data-modal-id="player-settings-editor"]';
  const LEGACY_SELECTOR = [
    "[data-admin-player-identity-manager]",
    "[data-admin-player-identity-manager-dialog]",
    "[data-admin-player-identity-settings]",
    "[data-admin-player-identity-settings-row]",
  ].join(",");

  const playerCacheByGame = new Map();
  const loadingPlayers = new Set();
  const PLAYER_RESET_CONTEXT_STALE = "PLAYER_RESET_CONTEXT_STALE";
  let selectedPlayerId = "";
  let activeResetScope = null;

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

  function currentGameId() {
    return text(window.EconovariaAdminGameSelection?.read?.());
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

  function responseRecord(value) {
    const source = object(value);
    return {
      ...source,
      ...object(source.data),
      ...object(source.payload),
    };
  }

  function responsePlayer(value) {
    const source = responseRecord(value);
    return object(source.player || source.createdPlayer);
  }

  function responseAccessCode(value) {
    const source = responseRecord(value);
    if (typeof source.accessCode === "string") return text(source.accessCode);
    const accessCode = object(source.accessCode);
    return text(
      accessCode.studentCode ||
      accessCode.accessCode ||
      accessCode.code ||
      source.studentCode ||
      source.generatedAccessCode,
    );
  }

  function responsePlayerIdentifier(value) {
    const source = responseRecord(value);
    return text(
      playerIdentifier(responsePlayer(value)) ||
      source.playerIdentifier ||
      source.playerId ||
      source.rfidCardId ||
      source.rfidId ||
      source.cardId,
    );
  }

  async function responseJson(response) {
    try {
      return object(await response.clone().json());
    } catch (_) {
      return {};
    }
  }

  const {
    staleResetError, modalResetContextMatches, disposeActiveResetScope, disposeDetachedResetScope,
    resetScopeFor,
  } = window.createPlayerIdentityResetScope({
    PLAYER_RESET_CONTEXT_STALE,
    currentGameId,
    text,
    get activeResetScope() { return activeResetScope; },
    set activeResetScope(value) { activeResetScope = value; },
    LOCAL_API_PREFIX,
    responseJson,
    object,
    responsePlayer,
    responsePlayerIdentifier,
    responseAccessCode,
  });

  const {
    uniquePlayers, playerCache, cachePlayers, modelPlayers, responsePlayers, allPlayers, loadPlayers,
    updateCachedPlayer,
  } = window.createPlayerIdentityRoster({
    playerUuid,
    text,
    playerCacheByGame,
    terminalFeature,
    object,
    LOCAL_API_PREFIX,
    currentGameId,
  });

  function removeLegacyIdentityUi(root = document) {
    root.querySelectorAll?.(LEGACY_SELECTOR).forEach((element) => element.remove());
  }

  const {
    createCredentialInput, generatedCredentialTile, insertCreateCredentialField, configureCreateForm,
    decorateCreateForms, visibleProfileModal, modalPlayerId, requestModalPlayer, resolveModalPlayer,
    fieldByCaption, fieldControl, addHelp, createProfileCredentialField, ensureProfileCredentialFields,
    setSelectValue, setProfileStatus, updateProfileSummary, saveProfileSettings,
  } = window.createPlayerIdentityProfile({
    normalized,
    PROFILE_MODAL_SELECTOR,
    text,
    get selectedPlayerId() { return selectedPlayerId; },
    set selectedPlayerId(value) { selectedPlayerId = value; },
    currentGameId,
    loadingPlayers,
    loadPlayers,
    decorateProfileModal,
    cachePlayers,
    modelPlayers,
    playerCache,
    playerIdentifier,
    playerUuid,
    playerName,
    playerStatus,
    playerCountry,
    resetScopeFor,
    LOCAL_API_PREFIX,
    updateCachedPlayer,
    PLAYER_RESET_CONTEXT_STALE,
    modalResetContextMatches,
    get activeResetScope() { return activeResetScope; },
    set activeResetScope(value) { activeResetScope = value; },
    disposeActiveResetScope,
  });

  function decorateProfileModal(root = document) {
    disposeDetachedResetScope();
    removeLegacyIdentityUi(root);
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
        const current = resolveModalPlayer(modal);
        if (!current) {
          setProfileStatus(modal, "Player identity is unavailable. Reopen Player Settings.", "error");
          return;
        }
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
      const gameId = currentGameId();
      void loadPlayers(gameId).then(scheduleDecorate);
      scheduleDecorate();
      return;
    }

    const nav = target.closest("[data-admin-section]");
    if (nav) {
      if (nav.getAttribute("data-admin-section") !== "Players") {
        selectedPlayerId = "";
        disposeActiveResetScope();
      } else {
        const gameId = currentGameId();
        void loadPlayers(gameId).then(scheduleDecorate);
      }
    }

    scheduleDecorate();
  }

  const initialGameId = currentGameId();
  if (initialGameId) cachePlayers(initialGameId, modelPlayers());

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
      const gameId = currentGameId();
      if (!gameId || !id) return;
      cachePlayers(gameId, [player]);
      selectedPlayerId = id;
      scheduleDecorate();
    },
    selectPlayerById(playerId) {
      selectedPlayerId = text(playerId);
      const gameId = currentGameId();
      return loadPlayers(gameId).then(scheduleDecorate);
    },
    disposeResetScope: disposeActiveResetScope,
  };
})();
