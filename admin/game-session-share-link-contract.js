(function installEconovariaAdminGameShareLinkContract() {
  "use strict";

  const SHARE_ACTIONS = new Set(["share-current-game", "share-game-code"]);
  const REPAIR_DELAYS_MS = Object.freeze([0, 60, 180, 360, 720]);
  let scheduledTimers = [];

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function context() {
    const selected = window.EconovariaAdminGameSessionControls?.selectedGameContext?.();
    return Object.freeze({
      gameName: text(selected?.gameName || "Current game"),
      gameCode: text(selected?.gameCode || "").toUpperCase(),
    });
  }

  function canonicalPlayerUrl(gameCode) {
    const normalizedCode = text(gameCode).toUpperCase();
    if (!normalizedCode) return "";

    const configured = text(
      window.ECONOVARIA_PLAYER_APP_URL ||
        document.querySelector('meta[name="econovaria-player-app-url"]')?.content ||
        "/play",
    );

    try {
      const url = new URL(configured || "/play", window.location.origin);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
        return "";
      }
      if (!text(url.pathname) || url.pathname === "/") url.pathname = "/play";
      url.search = "";
      url.hash = "";
      url.searchParams.set("gameCode", normalizedCode);
      url.searchParams.set("mode", "student");
      return url.toString();
    } catch (_) {
      return "";
    }
  }

  function visibleShareSurfaces() {
    return [...document.querySelectorAll('[data-modal-id="share-game-access"]')]
      .filter((surface) => {
        if (surface.hidden || surface.getAttribute("aria-hidden") === "true") return false;
        const style = window.getComputedStyle(surface);
        return style.display !== "none" && style.visibility !== "hidden";
      });
  }

  function repairSurface(surface, selected) {
    if (!(surface instanceof Element) || !selected.gameCode) return false;
    const dialog = surface.querySelector('[role="dialog"]') || surface;
    const playerUrl = canonicalPlayerUrl(selected.gameCode);
    if (!playerUrl) return false;

    dialog.querySelectorAll(
      "input[id*='share-student-link'], input[id*='share-player-link'], [data-econovaria-player-link]",
    ).forEach((input) => {
      if ("value" in input) input.value = playerUrl;
      input.setAttribute("data-game-code", selected.gameCode);
    });

    dialog.querySelectorAll("textarea[id*='share-invite'], [data-econovaria-invite]")
      .forEach((invite) => {
        if (!("value" in invite)) return;
        invite.value =
          `Join ${selected.gameName}\n\nGame Code: ${selected.gameCode}\nPlayer login: ${playerUrl}`;
      });

    dialog.querySelectorAll("input[id*='share-admin-link']").forEach((input) => {
      const field = input.closest(
        "label, .admin-terminal-field, .admin-terminal-share-field",
      );
      if (field) field.hidden = true;
    });

    surface.dataset.gameCode = selected.gameCode;
    surface.dataset.playerShareUrl = playerUrl;
    surface.dataset.econovariaShareLinkCanonical = "true";
    return true;
  }

  function repairVisibleShareSurfaces() {
    const selected = context();
    if (!selected.gameCode) return false;
    let repaired = false;
    visibleShareSurfaces().forEach((surface) => {
      repaired = repairSurface(surface, selected) || repaired;
    });
    return repaired;
  }

  function scheduleRepairs() {
    scheduledTimers.forEach((timer) => window.clearTimeout(timer));
    scheduledTimers = REPAIR_DELAYS_MS.map((delay) =>
      window.setTimeout(repairVisibleShareSurfaces, delay)
    );
  }

  function isShareAction(node) {
    if (!(node instanceof Element)) return false;
    const action = text(node.getAttribute("data-admin-terminal-action")).toLowerCase();
    return SHARE_ACTIONS.has(action) ||
      node.matches("[data-admin-terminal-share-button], [data-econovaria-share-game]");
  }

  document.addEventListener("click", (event) => {
    const action = event.target?.closest?.(
      "button, [role='button'], a, [data-admin-terminal-action]",
    );
    if (isShareAction(action)) scheduleRepairs();
  }, true);

  window.addEventListener("econovaria:admin-bootstrap-complete", scheduleRepairs);
  window.addEventListener("econovaria:admin-session-refreshed", scheduleRepairs);
  window.addEventListener("load", scheduleRepairs, { once: true });

  window.EconovariaAdminGameShareLinkContract = Object.freeze({
    canonicalPlayerUrl,
    repairVisibleShareSurfaces,
    scheduleRepairs,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRepairs, { once: true });
  } else {
    scheduleRepairs();
  }
})();
