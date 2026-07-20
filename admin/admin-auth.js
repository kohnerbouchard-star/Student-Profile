(function initEconovariaAdminRuntime() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const SUPABASE_URL = runtimeConfig.supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const ADMIN_API_BASE = runtimeConfig.adminApiUrl;
  const LOCAL_API_PREFIX = "/api/admin";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const CSRF_TOKEN_KEY = "econovaria.admin.csrf.v1";
  const IDLE_SEED_FINGERPRINT_KEY = "econovaria.admin.idle-seed-fingerprint.v1";
  const IDLE_ACTIVITY_KEY_PREFIX = "econovaria-admin:last-activity";
  const nativeFetch = window.fetch.bind(window);
  const sessionManager = window.EconovariaAdminAuthSession;

  window.ECONOVARIA_ADMIN_API_BASE_URL = LOCAL_API_PREFIX;
  window.ECONOVARIA_ADMIN_REAUTH_URL = new URL(
    "../?mode=admin&reason=session-required",
    window.location.href
  ).href;
  window.ECONOVARIA_ADMIN_ALLOWED_ORIGINS = [window.location.origin];
  window.ECONOVARIA_ADMIN_MOTION_BACKGROUND =
    window.ECONOVARIA_ADMIN_MOTION_BACKGROUND || "";

  function readStoredSession() {
    return sessionManager?.read() || null;
  }

  function readSelectedGameId() {
    return String(window.sessionStorage.getItem(SELECTED_GAME_KEY) || "").trim();
  }

  function parseJwt(token) {
    return sessionManager?.parseJwt(token) || {};
  }

  function sessionIsExpired(session) {
    return sessionManager?.isExpired(session) ?? true;
  }

  function randomHexToken() {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) =>
      value.toString(16).padStart(2, "0")
    ).join("");
  }

  function ensureAdminActionToken() {
    let token = "";
    try {
      token = String(window.sessionStorage.getItem(CSRF_TOKEN_KEY) || "").trim();
      if (!token) {
        token = randomHexToken();
        window.sessionStorage.setItem(CSRF_TOKEN_KEY, token);
      }
    } catch (_) {
      token = randomHexToken();
    }

    window.ECONOVARIA_CSRF_TOKEN = token;
    const meta = document.querySelector('meta[name="econovaria-csrf-token"]');
    if (meta) meta.content = token;
    return token;
  }

  function hashIdleNamespace(value = "") {
    const text = String(value || "anonymous");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(36);
  }

  function sessionFingerprint(session) {
    const claims = parseJwt(session?.accessToken || "");
    return String(
      claims.session_id ||
      claims.sid ||
      `${claims.sub || session?.user?.id || "unknown"}:${claims.iat || "unknown"}`
    );
  }

  function seedIdleStateForTransferredLogin(session) {
    if (!session) return;
    const fingerprint = sessionFingerprint(session);
    let previousFingerprint = "";

    try {
      previousFingerprint = String(
        window.sessionStorage.getItem(IDLE_SEED_FINGERPRINT_KEY) || ""
      );
    } catch (_) {}

    if (previousFingerprint === fingerprint) return;

    const initialKey =
      `${IDLE_ACTIVITY_KEY_PREFIX}:${hashIdleNamespace("anonymous")}`;
    try {
      window.localStorage.setItem(initialKey, String(Date.now()));
      window.localStorage.removeItem(IDLE_ACTIVITY_KEY_PREFIX);
      window.sessionStorage.setItem(IDLE_SEED_FINGERPRINT_KEY, fingerprint);
    } catch (_) {}
  }

  async function initializeAdminSecurityRuntime() {
    const session = await sessionManager?.getUsableSession().catch(() => null);
    if (!session) return;
    ensureAdminActionToken();
    seedIdleStateForTransferredLogin(session);
  }

  function clearTransferredSession() {
    try {
      sessionManager?.clear();
      window.sessionStorage.removeItem(SELECTED_GAME_KEY);
      window.sessionStorage.removeItem(CSRF_TOKEN_KEY);
      window.sessionStorage.removeItem(IDLE_SEED_FINGERPRINT_KEY);
    } catch (_) {}
    window.ECONOVARIA_CSRF_TOKEN = "";
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
        staffDisplayName:
          claims.email || session?.user?.email || "Administrator",
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

  async function readJsonBody(request) {
    if (["GET", "HEAD"].includes(request.method)) return {};
    try {
      const value = await request.clone().json();
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch (_) {
      return {};
    }
  }

  function requestBody(body) {
    return JSON.stringify(body || {});
  }

  function csvCell(value) {
    const source = typeof value === "string"
      ? value
      : JSON.stringify(value ?? "");
    return `"${source.replace(/"/g, '""')}"`;
  }

  function createCompletedDownloadJob(text, filename, contentType = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type: contentType });
    const downloadUrl = URL.createObjectURL(blob);
    return jsonResponse(200, {
      data: {
        id: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        status: "completed",
        filename,
        downloadUrl,
        completedAt: new Date().toISOString()
      }
    });
  }

  function attendanceRowsToCsv(rows) {
    const headers = [
      "Attendance Date",
      "Player",
      "Roster Label",
      "Status",
      "Clocked In At",
      "Source",
      "Reward Amount",
      "Currency"
    ];
    const lines = [headers.map(csvCell).join(",")];
    for (const row of rows || []) {
      lines.push([
        row.attendanceDate,
        row.displayName,
        row.rosterLabel,
        row.status,
        row.clockedInAt,
        row.source,
        row.rewardAmount,
        row.rewardCurrencyCode
      ].map(csvCell).join(","));
    }
    return `\uFEFF${lines.join("\r\n")}`;
  }

  async function normalizeAdminRequest(request, localUrl) {
    const originalPath = localUrl.pathname;
    const normalizedUrl = new URL(localUrl.href);
    let method = request.method || "GET";
    let body = ["GET", "HEAD"].includes(method)
      ? undefined
      : await request.clone().arrayBuffer();
    let adaptResponse = null;
    let immediateResponse = null;

    const gamePrefix = `${LOCAL_API_PREFIX}/games/([^/]+)`;
    let match = originalPath.match(
      new RegExp(`^${gamePrefix}/contracts/([^/]+)/(archive|duplicate)$`)
    );
    if (match && method === "POST") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/contracts`;
      body = requestBody({
        adminOperation: match[3] === "archive"
          ? "archive-contract"
          : "duplicate-contract",
        contractId: decodeURIComponent(match[2])
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/contracts/([^/]+)/submissions$`)
    );
    if (match && method === "GET") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/contracts/${match[2]}/progress`;
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/contracts/([^/]+)/submissions/([^/]+)/review$`)
    );
    if (match && method === "PATCH") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/contracts/${match[2]}/progress/${match[3]}/review`;
      method = "POST";
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/store/items/([^/]+)/status$`)
    );
    if (match && method === "PATCH") {
      const source = await readJsonBody(request);
      const status = source.status || source.itemStatus ||
        (source.active === true ? "active" : source.active === false ? "disabled" : undefined) ||
        (source.paused === true ? "disabled" : source.paused === false ? "active" : undefined);
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/store/items/${match[2]}`;
      body = requestBody({
        ...source,
        ...(status ? { status } : {})
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/store/items/([^/]+)/(restock|rebalance-price)$`)
    );
    if (match && method === "POST") {
      const source = await readJsonBody(request);
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/store/items/${match[2]}`;
      method = "PATCH";
      body = requestBody({
        ...source,
        adminOperation: match[3] === "restock"
          ? "restock-store-item"
          : "rebalance-store-price",
        itemId: decodeURIComponent(match[2])
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/settings/difficulty$`)
    );
    if (match && ["PUT", "PATCH", "POST"].includes(method)) {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/settings`;
      method = "PATCH";
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/settings/([^/]+)/reset$`)
    );
    if (match && method === "POST") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/settings`;
      method = "PATCH";
      body = requestBody({
        adminOperation: "reset-settings-group",
        group: decodeURIComponent(match[2])
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/settings/([^/]+)$`)
    );
    if (match && method === "PATCH" && match[2] !== "audit") {
      const source = await readJsonBody(request);
      const group = decodeURIComponent(match[2]).toLowerCase();
      const values = source.values && typeof source.values === "object"
        ? source.values
        : source;
      const grouped = {
        attendance: { attendanceWindow: values },
        business: { businessMarketWindow: values },
        "business-market": { businessMarketWindow: values },
        stocks: { stockMarketWindow: values },
        "stock-market": { stockMarketWindow: values },
        news: { newsSchedule: values },
        difficulty: values
      };
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/settings`;
      body = requestBody(grouped[group] || values);
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/logs/exports$`)
    );
    if (match && method === "POST") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/logs/export`;
      method = "GET";
      body = undefined;
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const csv = await response.text();
        return createCompletedDownloadJob(
          csv,
          `econovaria-audit-log-${decodeURIComponent(match[1])}.csv`
        );
      };
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/logs/([^/]+)/related-record$`)
    );
    if (match && method === "GET") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/logs`;
      normalizedUrl.searchParams.set("eventId", decodeURIComponent(match[2]));
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const payload = await response.json();
        const log = payload?.data?.logs?.[0] || null;
        return jsonResponse(log ? 200 : 404, log
          ? { data: { eventId: log.id, relatedRecord: log.relatedRecord, log } }
          : { code: "audit_log_not_found", message: "Audit-log event was not found." });
      };
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/attendance/exports$`)
    );
    if (match && method === "POST") {
      const source = await readJsonBody(request);
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/attendance/history`;
      normalizedUrl.search = "";
      normalizedUrl.searchParams.set("page", "1");
      normalizedUrl.searchParams.set("pageSize", "200");
      for (const key of ["startDate", "endDate", "playerId", "status"]) {
        if (source[key]) normalizedUrl.searchParams.set(key, String(source[key]));
      }
      if (source.date) {
        normalizedUrl.searchParams.set("startDate", String(source.date));
        normalizedUrl.searchParams.set("endDate", String(source.date));
      }
      method = "GET";
      body = undefined;
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const payload = await response.json();
        const rows = payload?.data?.attendanceHistory || payload?.data?.rows || [];
        return createCompletedDownloadJob(
          attendanceRowsToCsv(rows),
          `econovaria-attendance-${decodeURIComponent(match[1])}.csv`
        );
      };
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/players/([^/]+)/access-code$`)
    );
    if (match && method === "GET") {
      immediateResponse = jsonResponse(409, {
        code: "player_access_code_not_recoverable",
        message: "Existing player access codes are stored only as hashes. Reset the code to reveal a replacement once.",
        data: {
          playerId: decodeURIComponent(match[2]),
          accessCode: null,
          canReset: true,
          resetRequired: true
        }
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/players/([^/]+)$`)
    );
    if (match && method === "GET") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/players`;
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const payload = await response.json();
        const playerId = decodeURIComponent(match[2]);
        const player = (payload?.data?.players || []).find((item) => String(item.id) === playerId) || null;
        return jsonResponse(player ? 200 : 404, player
          ? { data: { player, profile: player } }
          : { code: "player_not_found", message: "Player was not found." });
      };
    } else if (match && method === "DELETE") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/players`;
      method = "POST";
      body = requestBody({
        adminOperation: "archive-player",
        playerId: decodeURIComponent(match[2])
      });
    }

    if (/^\/api\/admin\/help\/(attendance|market|players|start-game|store|troubleshooting)$/.test(originalPath)) {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/help/admin-console`;
    }

    return {
      localUrl: normalizedUrl,
      method,
      body,
      adaptResponse,
      immediateResponse
    };
  }

  async function forwardAdminRequest(request, localUrl) {
    const priorSession = readStoredSession();
    let session = await sessionManager?.getUsableSession().catch(() => null);
    const selectedGameId = readSelectedGameId();
    const originalUrl = new URL(localUrl.href);

    if (!session || sessionIsExpired(session)) {
      clearTransferredSession();
      window.setTimeout(
        () => redirectToMainLogin(priorSession ? "session-expired" : "session-required"),
        0
      );
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

    const normalized = await normalizeAdminRequest(request, localUrl);
    if (normalized.immediateResponse) return normalized.immediateResponse;

    const headers = new Headers(request.headers);
    headers.delete("x-econovaria-admin-read");
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set("Authorization", `Bearer ${session.accessToken}`);
    headers.set("X-Econovaria-Game-Id", selectedGameId);
    if (normalized.body !== undefined && !headers.has("content-type")) {
      headers.set("Content-Type", "application/json");
    }

    const fetchWithAccessToken = (accessToken) => {
      headers.set("Authorization", `Bearer ${accessToken}`);
      return nativeFetch(buildAdminApiUrl(normalized.localUrl), {
        method: normalized.method,
        headers,
        body: normalized.body,
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        referrerPolicy: "no-referrer"
      });
    };

    let response;
    try {
      response = await fetchWithAccessToken(session.accessToken);
    } catch (_) {
      return jsonResponse(503, {
        code: "admin_api_unreachable",
        message:
          "Administrator data service could not be reached. Retry in a moment."
      });
    }

    if (response.status === 401 && session.refreshToken) {
      try {
        const refreshedSession = await sessionManager.refresh();
        session = refreshedSession;
        response = await fetchWithAccessToken(refreshedSession.accessToken);
      } catch (_) {}
    }

    if (response.status === 401) {
      clearTransferredSession();
      window.setTimeout(() => redirectToMainLogin("session-expired"), 250);
    }

    if (
      originalUrl.pathname === `${LOCAL_API_PREFIX}/auth/sign-out` &&
      response.ok
    ) {
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

    return normalized.adaptResponse
      ? normalized.adaptResponse(response)
      : response;
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

  function completeInitialBootstrapRender(feature) {
    const model = feature?.currentModel;
    if (
      feature?.authState?.state === "loading" &&
      model?.__sessionBootstrapPending === true
    ) {
      feature.currentModel = {
        ...model,
        __sessionBootstrapPending: false
      };
    }
  }

  async function mountTerminal(terminal) {
    const priorSession = readStoredSession();
    const session = await sessionManager?.getUsableSession().catch(() => null);
    const selectedGameId = readSelectedGameId();

    if (!session || sessionIsExpired(session)) {
      clearTransferredSession();
      redirectToMainLogin(priorSession ? "session-expired" : "session-required");
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
    completeInitialBootstrapRender(feature);
    window.EconovariaAdminSessionGate?.release();
  }

  function showSignIn() {
    clearTransferredSession();
    redirectToMainLogin("session-required");
  }

  void initializeAdminSecurityRuntime();

  window.EconovariaAdminAuth = {
    attachTerminal(terminal) {
      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          () => void mountTerminal(terminal),
          { once: true }
        );
      } else {
        void mountTerminal(terminal);
      }
    },
    showSignIn,
    getSession: readStoredSession,
    getSelectedGameId: readSelectedGameId
  };
})();
