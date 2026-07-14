(function initEconovariaPlayerCreateLifecycle() {
  "use strict";

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalized(value) {
    return text(value).replace(/\s+/g, " ").toLowerCase();
  }

  function closeOpenPlayerCreateModal() {
    const form = document.querySelector("[data-admin-terminal-player-form]");
    if (!form) return false;

    const backdrop = form.closest("[data-admin-terminal-modal-backdrop]");
    const closeButton = backdrop?.querySelector("[data-admin-terminal-modal-close]");
    if (closeButton instanceof HTMLElement) {
      closeButton.click();
      return true;
    }

    if (backdrop instanceof HTMLElement) {
      backdrop.remove();
      return true;
    }

    return false;
  }

  function decoratePlayerCreateForm() {
    const wiring = window.EconovariaPlayerIdentityWiring;
    if (!wiring || typeof wiring.decorateCreateForm !== "function") return false;

    const form = document.querySelector("[data-admin-terminal-player-form]");
    if (!form) return false;
    wiring.decorateCreateForm(form);
    return Boolean(
      form.querySelector('[name="playerIdentifier"]') &&
      form.querySelector('[name="accessCode"]'),
    );
  }

  function scheduleCreateFormDecoration() {
    window.requestAnimationFrame(() => {
      if (decoratePlayerCreateForm()) return;
      window.setTimeout(decoratePlayerCreateForm, 80);
    });
  }

  function modelPlayers() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    const players = [model.players, model.roster, model.playerRoster]
      .find(Array.isArray) || [];
    const seen = new Set();
    return players.filter((player) => {
      const id = text(player?.id || player?.playerId || player?.player_id);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function playerName(player) {
    return text(player?.displayName || player?.display_name || player?.name);
  }

  function playerIdentifier(player) {
    return text(player?.playerIdentifier || player?.player_identifier);
  }

  function clickedPlayer(target) {
    if (!(target instanceof Element)) return null;
    const ancestry = [];
    let node = target;
    for (let depth = 0; node && node !== document.body && depth < 7; depth += 1) {
      ancestry.push(normalized(node.textContent));
      node = node.parentElement;
    }

    return modelPlayers().find((player) => {
      const name = playerName(player).toLowerCase();
      const identifier = playerIdentifier(player).toLowerCase();
      return ancestry.some((content) =>
        (name && content.includes(name)) ||
        (identifier && content.includes(identifier))
      );
    }) || null;
  }

  function isVisible(element) {
    if (!(element instanceof Element) || element.hidden) return false;
    const style = window.getComputedStyle?.(element);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || rect.width > 0 || rect.height > 0;
  }

  function markExpandedPlayerDetail(player) {
    const name = playerName(player).toLowerCase();
    const identifier = playerIdentifier(player).toLowerCase();
    const candidates = [...document.querySelectorAll("section, article, div")]
      .filter(isVisible)
      .filter((element) => !element.closest("[data-admin-terminal-player-form]"))
      .filter((element) => !element.matches("[data-admin-player-identity-settings]"))
      .filter((element) => {
        const content = normalized(element.textContent);
        const identifiesPlayer =
          (name && content.includes(name)) ||
          (identifier && content.includes(identifier));
        const isPlayerRecord =
          content.includes("backend player record") ||
          content.includes("player record") ||
          content.includes("financial position and activity");
        return identifiesPlayer && isPlayerRecord;
      });

    candidates.sort((left, right) =>
      normalized(left.textContent).length - normalized(right.textContent).length
    );
    const host = candidates[0] || null;
    if (!host) return null;
    host.setAttribute("data-admin-player-detail", "");
    host.setAttribute(
      "data-admin-player-id",
      text(player?.id || player?.playerId || player?.player_id),
    );
    return host;
  }

  function mountExpandedPlayerSettings(player, source) {
    const wiring = window.EconovariaPlayerIdentityWiring;
    if (!wiring || typeof wiring.selectPlayer !== "function") return false;
    const host = markExpandedPlayerDetail(player);
    if (!host) return false;
    wiring.selectPlayer(player, source);
    window.setTimeout(() => wiring.decoratePlayerDetail?.(), 0);
    return true;
  }

  function scheduleExpandedPlayerSettings(player, source) {
    for (const delay of [80, 220, 520]) {
      window.setTimeout(() => mountExpandedPlayerSettings(player, source), delay);
    }
  }

  window.addEventListener("econovaria:player-access-code-issued", () => {
    closeOpenPlayerCreateModal();
  });

  if (document.body && typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      const playerFormAdded = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) =>
          node instanceof Element && (
            node.matches?.("[data-admin-terminal-player-form]") ||
            node.querySelector?.("[data-admin-terminal-player-form]")
          )
        )
      );
      if (playerFormAdded) scheduleCreateFormDecoration();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-admin-terminal-action="add-player"]')) {
      scheduleCreateFormDecoration();
      return;
    }

    if (target.closest("[data-admin-player-identity-settings]")) return;
    const player = clickedPlayer(target);
    if (player) scheduleExpandedPlayerSettings(player, target);
  }, true);

  window.EconovariaPlayerCreateLifecycle = {
    closeOpenPlayerCreateModal,
    decoratePlayerCreateForm,
    markExpandedPlayerDetail,
    mountExpandedPlayerSettings,
  };
})();