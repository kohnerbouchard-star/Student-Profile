(function initEconovariaAdminRuntime() {
  "use strict";

  const SUPABASE_URL = "https://cgiukdjwicykrmtkhudh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
  const ADMIN_API_BASE = `${SUPABASE_URL}/functions/v1/admin-api`;
  const LOCAL_API_PREFIX = "/api/admin";
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const nativeFetch = window.fetch.bind(window);

  window.ECONOVARIA_ADMIN_API_BASE_URL = LOCAL_API_PREFIX;
  window.ECONOVARIA_ADMIN_REAUTH_URL = new URL("../?mode=admin&reason=session-required", window.location.href).href;
  window.ECONOVARIA_ADMIN_ALLOWED_ORIGINS = [window.location.origin];
  window.ECONOVARIA_ADMIN_MOTION_BACKGROUND = window.ECONOVARIA_ADMIN_MOTION_BACKGROUND || "";

  function readStoredSession() {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return value && typeof value.accessToken === "string" && value.accessToken.trim()
        ? value
        : null;
    } catch (_) {
      return null;
    }
  }

  function readSelectedGameId() {
    return String(window.sessionStorage.getItem(SELECTED_GAME_KEY) || "").trim();
  }

  function parseJwt(token) {
    try {
      const payload = String(token || "").split(".")[1] || "";
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      return JSON.parse(atob(padded));
    } catch (_) {
      return {};
    }
  }

  function sessionIsExpired(session) {
    const claims = parseJwt(session?.accessToken || "");
    return Boolean(Number(claims.exp || 0) && Number(claims.exp) * 1000 <= Date.now() + 5000);
  }

  function clearTransferredSession() {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SELECTED_GAME_KEY);
    window.currentSession = null;
    if (window.state) window.state.staffSession = null;
  }

  function mainLoginUrl(reason) {
    const url = new URL("../", window.location.href);
    url.searchParams.set("mode", "admin");
    if (reason) url.searchParams.set("reason", reason);
    return url.href;
  }

  function redirectToMainLogin(reason) {
    window.location.replace(mainLoginUrl(reason));
  }

  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  function syncLegacySessionBridge() {
    const session = readStoredSession();
    const selectedGameId = readSelectedGameId();
    const claims = parseJwt(session?.accessToken || "");

    window.currentSession = {
      role: "ADMIN",
      token: session?.accessToken || "",
      refreshToken: session?.refreshToken || "",
      authSource: "supabase-admin",
      permissions: ["*"],
      user: session?.user || null,
      staffSession: {
        staffId: claims.sub || session?.user?.id || "",
        staffEmail: claims.email || session?.user?.email || "",
        staffDisplayName: claims.email || session?.user?.email || "Administrator",
        staffRole: "game_admin",
        activeGameSessions: [],
        selectedGameSessionId: selectedGameId
      }
    };

    window.state = window.state || {};
    window.state.staffSession = window.currentSession.staffSession;
  }

  function buildAdminApiUrl(localUrl) {
    const suffix = localUrl.pathname.slice(LOCAL_API_PREFIX.length) || "/";
    return `${ADMIN_API_BASE}${suffix}${localUrl.search}`;
  }

  async function forwardAdminRequest(request, localUrl) {
    const session = readStoredSession();
    const selectedGameId = readSelectedGameId();

    if (!session || sessionIsExpired(session)) {
      clearTransferredSession();
      window.setTimeout(() => redirectToMainLogin(session ? "session-expired" : "session-required"), 0);
      return jsonResponse(401, {
        code: "auth_required",
        message: "Administrator sign-in is required."
      });
    }

    if (!selectedGameId) {
      window.setTimeout(() => redirectToMainLogin("select-game"), 0);
      return jsonResponse(409, {
        code: "game_required",
        message: "Select a game before opening the administrator console."
      });
    }

    const headers = new Headers(request.headers);
    headers.delete("x-econovaria-admin-read");
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set("Authorization", `Bearer ${session.accessToken}`);
    headers.set("X-Econovaria-Game-Id", selectedGameId);

    const method = request.method || "GET";
    const body = ["GET", "HEAD"].includes(method)
      ? undefined
      : await request.clone().arrayBuffer();

    let response;
    try {
      response = await nativeFetch(buildAdminApiUrl(localUrl), {
        method,
        headers,
        body,
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        referrerPolicy: "no-referrer"
      });
    } catch (_) {
      return jsonResponse(503, {
        code: "admin_api_unreachable",
        message: "Administrator data service could not be reached. Retry in a moment."
      });
    }

    if (response.status === 401) {
      clearTransferredSession();
      window.setTimeout(() => redirectToMainLogin("session-expired"), 250);
    }

    if (localUrl.pathname === `${LOCAL_API_PREFIX}/auth/sign-out` && response.ok) {
      try {
        await nativeFetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.accessToken}`
          }
        });
      } catch (_) {}

      clearTransferredSession();
      window.setTimeout(() => redirectToMainLogin("signed-out"), 0);
    }

    return response;
  }

  window.fetch = function econovariaAdminFetch(input, init) {
    const rawUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(rawUrl, init);
    const url = new URL(request.url, window.location.href);

    if (!url.pathname.startsWith(LOCAL_API_PREFIX)) {
      return nativeFetch(input, init);
    }

    return forwardAdminRequest(request, url);
  };

  function mountTerminal(terminal) {
    const session = readStoredSession();
    const selectedGameId = readSelectedGameId();

    if (!session || sessionIsExpired(session)) {
      clearTransferredSession();
      redirectToMainLogin(session ? "session-expired" : "session-required");
      return;
    }

    if (!selectedGameId) {
      redirectToMainLogin("select-game");
      return;
    }

    const mount = terminal?.mount;
    const feature = terminal?.feature;

    if (!mount || !feature || typeof feature.renderShell !== "function") {
      window.EconovariaAdminSessionGate?.showError(
        "The administrator console could not start. Reload this page or return to sign in."
      );
      return;
    }

    syncLegacySessionBridge();
    mount.hidden = false;
    mount.innerHTML = feature.renderShell();
    window.EconovariaAdminSessionGate?.release();
  }

  function showSignIn() {
    clearTransferredSession();
    redirectToMainLogin("session-required");
  }

  window.EconovariaAdminAuth = {
    attachTerminal(terminal) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => mountTerminal(terminal), { once: true });
      } else {
        mountTerminal(terminal);
      }
    },
    showSignIn,
    getSession: readStoredSession,
    getSelectedGameId: readSelectedGameId
  };
})();