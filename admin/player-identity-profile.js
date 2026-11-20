window.createPlayerIdentityProfile = function createPlayerIdentityProfile(ownerScope) {
  "use strict";

  const {
    normalized, PROFILE_MODAL_SELECTOR, text, currentGameId, loadingPlayers, loadPlayers,
    decorateProfileModal, cachePlayers, modelPlayers, playerCache, playerIdentifier, playerUuid,
    playerName, playerStatus, playerCountry, resetScopeFor, LOCAL_API_PREFIX, updateCachedPlayer,
    PLAYER_RESET_CONTEXT_STALE, modalResetContextMatches, disposeActiveResetScope,
  } = ownerScope;


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
    const modalId = text(
      modal?.querySelector('[data-admin-terminal-action="confirm-player-settings-save"][data-player-id]')?.getAttribute("data-player-id") ||
      modal?.getAttribute?.("data-player-id") ||
      modal?.querySelector("[data-player-id]")?.getAttribute("data-player-id"),
    );
    if (modalId) {
      ownerScope.selectedPlayerId = modalId;
      return modalId;
    }
    return text(ownerScope.selectedPlayerId);
  }

  function requestModalPlayer(modal, playerId) {
    const gameId = currentGameId();
    const requestKey = `${gameId}:${playerId}`;
    if (!gameId || !playerId || loadingPlayers.has(requestKey)) return;
    loadingPlayers.add(requestKey);
    void loadPlayers(gameId).then(() => {
      loadingPlayers.delete(requestKey);
      if (modal?.isConnected) decorateProfileModal(modal);
    });
  }

  function resolveModalPlayer(modal) {
    const gameId = currentGameId();
    const playerId = modalPlayerId(modal);
    if (!gameId || !playerId) return null;
    ownerScope.selectedPlayerId = playerId;
    cachePlayers(gameId, modelPlayers());
    const player = playerCache(gameId, false)?.get(playerId) || null;
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
    const gameId = currentGameId();
    const playerId = playerUuid(player);
    const modalId = modalPlayerId(modal);
    const displayName = text(fieldControl(fieldByCaption(modal, "Player name"))?.value) || playerName(player);
    const identifierInput = fieldControl(fieldByCaption(modal, "Player ID / RFID card"));
    const accessInput = fieldControl(fieldByCaption(modal, "New Access Code"));
    const identifier = text(identifierInput?.value);
    const accessCode = text(accessInput?.value);
    const status = text(fieldControl(fieldByCaption(modal, "Player status"))?.value).toLowerCase() || playerStatus(player);
    const countryAssignment = text(fieldControl(fieldByCaption(modal, "Country assignment"))?.value) || playerCountry(player);
    const adminNote = text(fieldControl(fieldByCaption(modal, "Admin note"))?.value);
    const save = modal.querySelector('[data-admin-terminal-action="confirm-player-settings-save"]');

    if (!gameId || !playerId || !modalId || modalId !== playerId) {
      setProfileStatus(modal, "Player selection changed. Reopen Player Settings before saving.", "error");
      return;
    }
    if (!identifier) {
      setProfileStatus(modal, "Player ID / RFID card is required.", "error");
      identifierInput?.focus?.();
      return;
    }
    const resetScope = resetScopeFor(modal, gameId, playerId);
    if (!resetScope) {
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

      await resetScope.updatePlayerIdentity({
        gameId,
        playerId,
        displayName,
        playerIdentifier: identifier,
        accessCode,
      });

      if (!resetScope.isCurrent()) return;
      updateCachedPlayer(gameId, playerId, { displayName, playerIdentifier: identifier, status, countryAssignment });
      if (accessInput) accessInput.value = "";
      updateProfileSummary(modal, playerCache(gameId, false)?.get(playerId) || player);
      setProfileStatus(
        modal,
        accessCode
          ? "Player profile, Player ID, and Access Code saved."
          : "Player profile and Player ID saved. The current Access Code was not changed.",
        "success",
      );
    } catch (error) {
      if (error?.code === PLAYER_RESET_CONTEXT_STALE) return;
      setProfileStatus(
        modal,
        error?.message || "Player profile settings could not be saved.",
        "error",
      );
    } finally {
      if (save && modalResetContextMatches(modal, gameId, playerId)) {
        save.disabled = false;
        save.textContent = "Save settings";
      }
      if (ownerScope.activeResetScope?.scope === resetScope) {
        disposeActiveResetScope();
      }
    }
  }

  return {
    createCredentialInput, generatedCredentialTile, insertCreateCredentialField, configureCreateForm,
    decorateCreateForms, visibleProfileModal, modalPlayerId, requestModalPlayer, resolveModalPlayer,
    fieldByCaption, fieldControl, addHelp, createProfileCredentialField, ensureProfileCredentialFields,
    setSelectValue, setProfileStatus, updateProfileSummary, saveProfileSettings,
  };
};
