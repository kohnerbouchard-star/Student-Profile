(function installAdminGameSelection(runtime) {
  "use strict";

  const PARAMETER = "game";
  const LEGACY_PREFIX = "econovaria:admin-game:v1:";
  const SAFE_GAME_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{16,128})$/i;

  function normalize(value) {
    const gameId = String(value || "").trim();
    return SAFE_GAME_ID.test(gameId) ? gameId : "";
  }

  function parseUrl(value = runtime.location?.href || "") {
    return new URL(
      String(value || runtime.location?.href || ""),
      runtime.location?.href || "https://invalid.local/",
    );
  }

  function replaceUrl(destination) {
    runtime.history?.replaceState?.(runtime.history.state, "", destination);
  }

  function legacySelection() {
    const value = String(runtime.name || "");
    if (!value.startsWith(LEGACY_PREFIX)) return "";
    runtime.name = "";
    return normalize(value.slice(LEGACY_PREFIX.length));
  }

  function read() {
    try {
      const current = parseUrl();
      const routeGameId = normalize(current.searchParams.get(PARAMETER));
      if (routeGameId) return routeGameId;

      const migratedGameId = legacySelection();
      if (!migratedGameId) return "";
      current.searchParams.set(PARAMETER, migratedGameId);
      replaceUrl(current.href);
      return migratedGameId;
    } catch (_) {
      return "";
    }
  }

  function urlFor(value, destination = runtime.location?.href || "") {
    const gameId = normalize(value);
    if (!gameId) {
      throw new Error("The selected game identifier is invalid.");
    }
    const next = parseUrl(destination);
    next.searchParams.set(PARAMETER, gameId);
    return next.href;
  }

  function write(value) {
    const gameId = normalize(value);
    if (!gameId) {
      throw new Error("The selected game identifier is invalid.");
    }
    replaceUrl(urlFor(gameId));
    return gameId;
  }

  function clear() {
    runtime.name = "";
    let next;
    try {
      next = parseUrl();
    } catch (_) {
      return;
    }
    if (!next.searchParams.has(PARAMETER)) return;
    next.searchParams.delete(PARAMETER);
    replaceUrl(next.href);
  }

  runtime.EconovariaAdminGameSelection = Object.freeze({
    read,
    write,
    clear,
    urlFor,
  });
})(window);
