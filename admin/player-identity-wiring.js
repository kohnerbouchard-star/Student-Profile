(function initEconovariaPlayerIdentityWiring() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const LOCAL_API_PREFIX = "/api/admin";

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

  async function loadPlayers(gameId) {
    if (!gameId) return modelPlayers();

    try {
      const response = await window.fetch(
        `${LOCAL_API_PREFIX}/games/${encodeURIComponent(gameId)}/players?include=identity,credentials`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) return modelPlayers();
      const players = responsePlayers(await response.json());
      return players.length ? players : modelPlayers();
    } catch (_) {
      return modelPlayers();
    }
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
      node.textContent?.trim().startsWith("Access code")
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

  function decorateIdentityAction(root = document) {
    const addPlayer = root.querySelector?.('[data-admin-terminal-action="add-player"]');
    if (!addPlayer || root.querySelector?.("[data-admin-player-identity-manager]")) return;

    const button = document.createElement("button");
    button.className = "admin-terminal-action is-info";
    button.type = "button";
    button.setAttribute("data-admin-player-identity-manager", "");
    button.innerHTML = [
      '<span class="admin-terminal-action-rail" aria-hidden="true"></span>',
      '<span class="admin-terminal-action-mark" aria-hidden="true"><img src="./assets/icons/rfid-card.svg" alt="" width="28" height="28"></span>',
      '<span class="admin-terminal-action-copy"><strong>Player IDs</strong><small>RFID + Access Codes</small></span>',
      '<span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>',
    ].join("");
    button.addEventListener("click", () => void openIdentityManager());
    addPlayer.insertAdjacentElement("afterend", button);
  }

  function optionLabel(player) {
    const parts = [playerName(player)];
    const identifier = playerIdentifier(player);
    const roster = rosterLabel(player);
    if (identifier) parts.push(`ID ${identifier}`);
    else if (roster) parts.push(roster);
    else parts.push("Player ID not configured");
    return parts.join(" • ");
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
  }

  async function openIdentityManager() {
    document.querySelector("[data-admin-player-identity-manager-dialog]")?.remove();
    const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
    let players = [];

    const overlay = document.createElement("div");
    overlay.setAttribute("data-admin-player-identity-manager-dialog", "");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;z-index:11950;display:grid;place-items:center;padding:24px;background:rgba(1,7,14,.82);backdrop-filter:blur(8px)";

    const panel = document.createElement("section");
    panel.style.cssText = "width:min(560px,100%);border:1px solid rgba(105,250,255,.5);background:#071421;color:#e9fbff;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.55);font-family:Inter,Arial,sans-serif";

    const title = document.createElement("h2");
    title.textContent = "Configure Player Identity";
    title.style.cssText = "margin:0 0 6px;font-size:21px";

    const copy = document.createElement("p");
    copy.textContent = "Assign the RFID/card Player ID and Access Code used at sign-in. Internal UUIDs remain hidden and unchanged.";
    copy.style.cssText = "margin:0 0 18px;color:rgba(233,251,255,.68);line-height:1.5";

    const form = document.createElement("form");
    form.style.cssText = "display:grid;gap:14px";

    const selectLabel = document.createElement("label");
    selectLabel.style.cssText = "display:grid;gap:6px";
    selectLabel.innerHTML = '<span style="font-size:12px;font-weight:800;letter-spacing:.08em">PLAYER</span>';
    const select = document.createElement("select");
    select.required = true;
    select.disabled = true;
    select.style.cssText = "min-height:44px;border:1px solid rgba(105,250,255,.28);background:#020b12;color:#e9fbff;padding:0 12px";
    select.append(new Option("Loading players…", ""));
    selectLabel.append(select);

    const identifierLabel = document.createElement("label");
    identifierLabel.style.cssText = "display:grid;gap:6px";
    identifierLabel.innerHTML = [
      '<span style="font-size:12px;font-weight:800;letter-spacing:.08em">PLAYER ID / RFID CARD</span>',
      '<input name="playerIdentifier" autocomplete="off" placeholder="Scan RFID card or enter Player ID" required style="min-height:44px;border:1px solid rgba(255,103,0,.38);background:#020b12;color:#e9fbff;padding:0 12px">',
    ].join("");

    const codeLabel = document.createElement("label");
    codeLabel.style.cssText = "display:grid;gap:6px";
    codeLabel.innerHTML = [
      '<span style="font-size:12px;font-weight:800;letter-spacing:.08em">NEW ACCESS CODE</span>',
      '<input name="accessCode" type="password" autocomplete="new-password" placeholder="Set a new Access Code" required style="min-height:44px;border:1px solid rgba(105,250,255,.28);background:#020b12;color:#e9fbff;padding:0 12px">',
    ].join("");

    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.textContent = "Loading players…";
    message.style.cssText = "min-height:20px;margin:0;color:rgba(233,251,255,.7);font-size:13px";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = "min-height:40px;padding:0 15px;border:1px solid rgba(233,251,255,.25);background:#0b1e2d;color:#e9fbff;cursor:pointer";
    cancel.addEventListener("click", () => overlay.remove());
    const save = document.createElement("button");
    save.type = "submit";
    save.disabled = true;
    save.textContent = "Save credentials";
    save.style.cssText = "min-height:40px;padding:0 15px;border:1px solid #ff6700;background:#ff6700;color:#071421;font-weight:800;cursor:pointer";
    actions.append(cancel, save);

    select.addEventListener("change", () => {
      const player = players.find((candidate) => playerUuid(candidate) === select.value);
      form.elements.playerIdentifier.value = playerIdentifier(player);
      form.elements.accessCode.value = "";
      form.elements.playerIdentifier.focus();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const player = players.find((candidate) => playerUuid(candidate) === select.value);
      const identifier = text(form.elements.playerIdentifier.value);
      const accessCode = text(form.elements.accessCode.value);
      if (!gameId || !player || !identifier || !accessCode) {
        message.textContent = "Select a player and enter both credentials.";
        message.style.color = "#ff6976";
        return;
      }

      const bridge = window.EconovariaPlayerAccessCodeBridge;
      if (!bridge || typeof bridge.updatePlayerIdentity !== "function") {
        message.textContent = "Player credential service is not available.";
        message.style.color = "#ff6976";
        return;
      }

      save.disabled = true;
      save.textContent = "Saving…";
      message.textContent = "Updating Player ID and Access Code…";
      message.style.color = "rgba(233,251,255,.7)";

      try {
        await bridge.updatePlayerIdentity({
          gameId,
          playerId: playerUuid(player),
          displayName: playerName(player),
          playerIdentifier: identifier,
          accessCode,
        });
        updateModelPlayer(playerUuid(player), identifier);
        overlay.remove();
      } catch (error) {
        message.textContent = error.message || "Player credentials could not be updated.";
        message.style.color = "#ff6976";
      } finally {
        save.disabled = false;
        save.textContent = "Save credentials";
      }
    });

    form.append(selectLabel, identifierLabel, codeLabel, message, actions);
    panel.append(title, copy, form);
    overlay.append(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
    select.focus();

    players = await loadPlayers(gameId);
    if (!document.body.contains(overlay)) return;

    select.replaceChildren();
    select.append(new Option(players.length ? "Select player" : "No players available", ""));
    for (const player of players) {
      select.append(new Option(optionLabel(player), playerUuid(player)));
    }
    select.disabled = players.length === 0;
    save.disabled = players.length === 0;
    message.textContent = players.length
      ? `${players.length} player${players.length === 1 ? "" : "s"} loaded.`
      : "No players are available in this game.";
    message.style.color = players.length ? "rgba(233,251,255,.7)" : "#ff6976";
  }

  function decorate(root = document) {
    decorateCreateForm(root);
    decorateIdentityAction(root);
  }

  const mount = document.getElementById("adminPreview");
  if (mount && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => decorate(mount));
    observer.observe(mount, { childList: true, subtree: true });
  }

  document.addEventListener("click", () => window.requestAnimationFrame(() => decorate(document)));
  window.addEventListener("load", () => decorate(document), { once: true });
  decorate(document);

  window.EconovariaPlayerIdentityWiring = {
    decorateCreateForm,
    loadPlayers,
    openIdentityManager,
  };
})();
