(function installAdminGameSelection(runtime) {
  "use strict";

  const PREFIX = "econovaria:admin-game:v1:";
  const SAFE_GAME_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{16,128})$/i;

  function read() {
    const value = String(runtime.name || "");
    if (!value.startsWith(PREFIX)) return "";
    const gameId = value.slice(PREFIX.length);
    if (SAFE_GAME_ID.test(gameId)) return gameId;
    runtime.name = "";
    return "";
  }

  function write(value) {
    const gameId = String(value || "").trim();
    if (!SAFE_GAME_ID.test(gameId)) {
      throw new Error("The selected game identifier is invalid.");
    }
    runtime.name = PREFIX + gameId;
    return gameId;
  }

  function clear() {
    if (String(runtime.name || "").startsWith(PREFIX)) runtime.name = "";
  }

  runtime.EconovariaAdminGameSelection = Object.freeze({ read, write, clear });
})(window);
