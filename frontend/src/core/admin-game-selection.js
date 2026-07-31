(function installAdminGameSelection(runtime) {
  "use strict";

  const PARAMETER = "game";
  const SAFE_GAME_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{16,128})$/i;

  function normalize(value) {
    const gameId = String(value || "").trim();
    return SAFE_GAME_ID.test(gameId) ? gameId : "";
  }

  function parseUrl(value = runtime.location?.href || "") {
    return new URL(String(value || runtime.location?.href || ""), runtime.location?.href || "https://invalid.local/");
  }

  function read() {
    try {
      return normalize(parseUrl().searchParams.get(PARAMETER));
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
    const next = urlFor(gameId);
    runtime.history?.replaceState?.(runtime.history.state, "", next);
    return gameId;
  }

  function clear() {
    let next;
    try {
      next = parseUrl();
    } catch (_) {
      return;
    }
    if (!next.searchParams.has(PARAMETER)) return;
    next.searchParams.delete(PARAMETER);
    runtime.history?.replaceState?.(runtime.history.state, "", next.href);
  }

  runtime.EconovariaAdminGameSelection = Object.freeze({
    read,
    write,
    clear,
    urlFor,
  });
})(window);
