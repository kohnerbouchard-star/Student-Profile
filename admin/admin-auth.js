(function initEconovariaAdminRuntime() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }

  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const ADMIN_BFF_BASE = String(runtimeConfig.adminBffApiUrl || "").replace(/\/+$/, "");
  const LOCAL_API_PREFIX = "/api/admin";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const IDLE_SEED_FINGERPRINT_KEY = "econovaria.admin.idle-seed-fingerprint.v1";
  const IDLE_ACTIVITY_KEY_PREFIX = "econovaria-admin:last-activity";
  const DEVICE_KEY = "econovaria.device.v1";
  const DEVICE_HEADER = "x-econovaria-device-id";
  const CSRF_HEADER = "x-econovaria-csrf-token";
  const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ADMIN_PERMISSIONS = Object.freeze([
    "account.read",
    "audit.read",
    "attendance.manage",
    "business.manage",
    "contracts.manage",
    "economy.adjust",
    "game.create",
    "game.read",
    "game.switch",
    "game.update",
    "inventory.redeem",
    "market.manage",
    "marketplace.moderate",
    "messaging.moderate",
    "players.manage",
    "progression.review",
    "settings.manage",
    "store.manage",
    "world.manage"
  ]);
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
    return String(window.EconovariaAdminGameSelection?.read?.() || "").trim();
  }

  function sessionIsExpired(session) {
    return sessionManager?.isExpired(session) ?? true;
  }

  function deviceId() {
    const existing = String(window.localStorage.getItem(DEVICE_KEY) || "")
      .trim()
      .toLowerCase();
    if (DEVICE_PATTERN.test(existing)) return existing;
    const generated = String(window.crypto?.randomUUID?.() || "").toLowerCase();
    if (!DEVICE_PATTERN.test(generated)) {
      throw new Error("Secure device identifier generation is unavailable.");
    }
    window.localStorage.setItem(DEVICE_KEY, generated);
    return generated;
  }

  function installAdminActionToken(session) {
    const token = String(session?.csrfToken || "").trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return "";
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
    return String(
      `${session?.user?.id || "unknown"}:${session?.absoluteExpiresAt || "unknown"}`
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

    const initialKey = `${IDLE_ACTIVITY_KEY_PREFIX}:${hashIdleNamespace("anonymous")}`;
    try {
      window.localStorage.setItem(initialKey, String(Date.now()));
      window.localStorage.removeItem(IDLE_ACTIVITY_KEY_PREFIX);
      window.sessionStorage.setItem(IDLE_SEED_FINGERPRINT_KEY, fingerprint);
    } catch (_) {}
  }

  async function initializeAdminSecurityRuntime() {
    const session = await sessionManager?.getUsableSession().catch(() => null);
    if (!session) return null;
    installAdminActionToken(session);
    seedIdleStateForTransferredLogin(session);
    return session;
  }

  function clearTransferredSession() {
    try {
      sessionManager?.clear();
      window.EconovariaAdminGameSelection?.clear?.();
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
    const user = session?.user || null;

    window.currentSession = {
      role: "ADMIN",
      authSource: "http-only-bff",
      permissions: [...ADMIN_PERMISSIONS],
      user,
      assuranceLevel: session?.assuranceLevel || "aal1",
      mfaRequired: session?.mfaRequired !== false,
      staffSession: {
        staffId: user?.id || "",
        staffEmail: user?.email || "",
        staffDisplayName: user?.displayName || user?.email || "Administrator",
        staffRole: "game_admin",
        activeGameSessions: session?.activeGameSessions || [],
        selectedGameSessionId: selectedGameId
      }
    };

    window.state = window.state || {};
    window.state.staffSession = window.currentSession.staffSession;
  }

  const {
    buildAdminApiUrl, readJsonBody, requestBody, csvCell, createCompletedDownloadJob,
    attendanceRowsToCsv, normalizeAdminRequest,
  } = window.createAdminRequestNormalization({
    LOCAL_API_PREFIX,
    ADMIN_BFF_BASE,
    jsonResponse,
  });

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

    if (originalUrl.pathname === `${LOCAL_API_PREFIX}/auth/sign-out`) {
      await sessionManager?.signOut().catch(() => null);
      clearTransferredSession();
      window.setTimeout(() => redirectToMainLogin("signed-out"), 0);
      return jsonResponse(200, { data: { signedOut: true } });
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

    if (!session.csrfToken && !["GET", "HEAD"].includes(normalized.method)) {
      session = await sessionManager?.refresh().catch(() => null);
      if (!session?.csrfToken) {
        clearTransferredSession();
        return jsonResponse(401, {
          code: "auth_required",
          message: "Administrator sign-in is required."
        });
      }
    }
    installAdminActionToken(session);

    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.delete("cookie");
    headers.delete("x-econovaria-admin-read");
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set(DEVICE_HEADER, deviceId());
    headers.set("X-Econovaria-Game-Id", selectedGameId);
    if (!["GET", "HEAD"].includes(normalized.method)) {
      headers.set(CSRF_HEADER, session.csrfToken);
    }
    if (normalized.body !== undefined && !headers.has("content-type")) {
      headers.set("Content-Type", "application/json");
    }

    let response;
    try {
      response = await nativeFetch(buildAdminApiUrl(normalized.localUrl), {
        method: normalized.method,
        headers,
        body: normalized.body,
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });
    } catch (_) {
      return jsonResponse(503, {
        code: "admin_api_unreachable",
        message:
          "Administrator data service could not be reached. Retry in a moment."
      });
    }

    if (response.status === 401) {
      clearTransferredSession();
      window.setTimeout(() => redirectToMainLogin("session-expired"), 250);
    }

    return normalized.adaptResponse
      ? normalized.adaptResponse(response)
      : response;
  }

  async function econovariaAdminRequest(input, init) {
    const url = new URL(input instanceof Request
      ? input.url
      : String(input), window.location.href);
    if (!url.pathname.startsWith(LOCAL_API_PREFIX)) {
      return nativeFetch(input, init);
    }

    const attendanceAdapter = window.EconovariaAttendanceRewardRequestAdapter;
    let attendanceMetadata = null;
    if (typeof attendanceAdapter?.prepareRequest === "function") {
      const prepared = await attendanceAdapter.prepareRequest(input, init);
      input = prepared.input;
      init = prepared.init;
      attendanceMetadata = prepared.metadata;
    }
    const preparedUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(preparedUrl, init);
    const response = await forwardAdminRequest(request, new URL(request.url));
    if (typeof attendanceAdapter?.observeResponse === "function") {
      return attendanceAdapter.observeResponse(response, attendanceMetadata);
    }
    return response;
  }

  window.fetch = function econovariaAdminFetch(input, init) {
    return econovariaAdminRequest(input, init);
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
    const session = await initializeAdminSecurityRuntime();
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
    void sessionManager?.signOut().catch(() => null);
    clearTransferredSession();
    redirectToMainLogin("session-required");
  }

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
    request: econovariaAdminRequest,
    getSession: readStoredSession,
    getSelectedGameId: readSelectedGameId
  };
})();
