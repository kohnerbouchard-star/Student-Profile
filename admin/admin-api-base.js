(function configureEconovariaAdminApi() {
  "use strict";

  const ADMIN_API_BASE =
    "https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/admin-api";
  const PUBLISHABLE_KEY =
    "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const previousFetch = window.fetch.bind(window);

  window.ECONOVARIA_ADMIN_API_BASE_URL = ADMIN_API_BASE;

  window.fetch = function econovariaAdminApiFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const rawUrl = request ? request.url : String(input);
    const url = new URL(rawUrl, window.location.href);

    if (!url.href.startsWith(ADMIN_API_BASE)) {
      return previousFetch(input, init);
    }

    let session = null;
    try {
      session = JSON.parse(
        window.sessionStorage.getItem(SESSION_KEY) || "null"
      );
    } catch (_) {}

    const headers = new Headers(
      request ? request.headers : init.headers || {}
    );

    headers.set("apikey", PUBLISHABLE_KEY);

    if (session?.accessToken) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    }

    const gameId =
      window.sessionStorage.getItem(SELECTED_GAME_KEY) || "";

    if (gameId) {
      headers.set("X-Econovaria-Game-Id", gameId);
    }

    if (request) {
      return previousFetch(
        new Request(request, {
          ...init,
          headers
        })
      );
    }

    return previousFetch(url.href, {
      ...init,
      headers,
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
  };
})();
