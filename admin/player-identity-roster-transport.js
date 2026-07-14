(function initEconovariaPlayerIdentityRosterTransport() {
  "use strict";

  const SUPABASE_URL = "https://cgiukdjwicykrmtkhudh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
  const CLASSROOM_API_BASE = `${SUPABASE_URL}/functions/v1/classroom-api`;
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const delegatedFetch = window.fetch.bind(window);
  const identifiers = new Map();

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function storedSession() {
    try {
      return record(JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null"));
    } catch (_) {
      return {};
    }
  }

  function playersFrom(value) {
    const source = record(value);
    const data = record(source.data);
    return [source.players, source.roster, data.players, data.roster]
      .find(Array.isArray) || [];
  }

  function cachePlayers(players) {
    for (const player of players) {
      const uuid = text(player.id || player.playerId || player.player_id);
      const identifier = text(player.playerIdentifier || player.player_identifier);
      if (uuid && identifier && uuid !== identifier) identifiers.set(uuid, identifier);
    }
    replaceVisibleIds();
  }

  function replaceVisibleIds() {
    const root = document.getElementById("adminPreview");
    if (!root || identifiers.size === 0) return;
    for (const element of root.querySelectorAll("td,dd,code,span,strong,small,p")) {
      if (element.children.length) continue;
      const identifier = identifiers.get(text(element.textContent));
      if (identifier) element.textContent = identifier;
    }
  }

  function directRoster(gameId) {
    const accessToken = text(storedSession().accessToken);
    const selectedGameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
    if (!accessToken || !gameId || (selectedGameId && selectedGameId !== gameId)) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `${CLASSROOM_API_BASE}/games/${encodeURIComponent(gameId)}/players`, true);
      xhr.timeout = 15_000;
      xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.setRequestHeader("X-Econovaria-Game-Id", gameId);
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) return resolve(null);
        try {
          const body = JSON.parse(xhr.responseText || "{}");
          cachePlayers(playersFrom(body));
          resolve(body);
        } catch (_) {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.ontimeout = () => resolve(null);
      xhr.send();
    });
  }

  window.fetch = async function econovariaPlayerIdentityRosterFetch(input, init) {
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(new URL(String(input), window.location.href).href, init);
    const url = new URL(request.url, window.location.href);
    const match = request.method === "GET"
      ? url.pathname.match(/^\/api\/admin\/games\/([^/]+)\/players$/)
      : null;

    if (match && url.searchParams.get("include") === "identity,credentials") {
      const body = await directRoster(decodeURIComponent(match[1]));
      if (body) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
    }

    return delegatedFetch(request);
  };

  const mount = document.getElementById("adminPreview");
  if (mount && typeof MutationObserver === "function") {
    const observer = new MutationObserver(replaceVisibleIds);
    observer.observe(mount, { childList: true, subtree: true });
  }

  window.addEventListener("load", () => {
    const gameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
    if (gameId) void directRoster(gameId);
  }, { once: true });

  window.EconovariaPlayerIdentityRosterTransport = {
    directRoster,
    identifiers,
    replaceVisibleIds,
  };
})();
