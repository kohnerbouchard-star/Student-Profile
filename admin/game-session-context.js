window.createGameSessionContext = function createGameSessionContext(ownerScope) {
  "use strict";

  const { EMPTY_CODES } = ownerScope;


  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function selectedGameId() {
    return text(
      window.EconovariaAdminAuth?.getSelectedGameId?.() ||
        window.EconovariaAdminGameSelection?.read?.() ||
        "",
    );
  }

  function feature() {
    return window.Econovaria?.features?.adminOverviewTerminal || null;
  }

  function normalizeCode(value) {
    const code = text(value).toUpperCase();
    if (EMPTY_CODES.has(code.toLowerCase())) return "";
    return /^[A-Z0-9-]{4,64}$/.test(code) ? code : "";
  }

  function gameCandidates(model, gameId) {
    return [
      model?.selectedGame,
      model?.activeGame,
      ...(Array.isArray(model?.games) ? model.games : []),
      ...(Array.isArray(model?.activeGameSessions)
        ? model.activeGameSessions
        : []),
    ].filter((candidate) => {
      const candidateId = text(candidate?.id || candidate?.gameId);
      return candidate && (!gameId || !candidateId || candidateId === gameId);
    });
  }

  function selectedGameContext() {
    const gameId = selectedGameId();
    const model = feature()?.currentModel || {};
    const candidate = gameCandidates(model, gameId)[0] || {};
    const gameName = text(
      candidate.name ||
        candidate.gameName ||
        model.gameName ||
        model.selectedGameName ||
        "Current game",
    );
    const gameCode = normalizeCode(
      candidate.joinCode ||
        candidate.gameCode ||
        model.joinCode ||
        model.gameCode ||
        "",
    );
    return Object.freeze({ gameId, gameName, gameCode });
  }

  function playerAppUrl(gameCode) {
    const normalizedCode = normalizeCode(gameCode);
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
      gameCode = normalizedCode;
      url.searchParams.set("gameCode", gameCode);
      url.searchParams.set("mode", "student");
      // Retired alias retained in source-history contract only:
      // url.searchParams.set("mode", "player")
      return url.toString();
    } catch (_) {
      return "";
    }
  }

  return { text, selectedGameId, feature, normalizeCode, gameCandidates, selectedGameContext, playerAppUrl };
};
