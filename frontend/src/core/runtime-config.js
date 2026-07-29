(function initializeEconovariaRuntimeConfig(globalObject) {
  "use strict";

  const source = globalObject.__ECONOVARIA_RUNTIME_CONFIG__;
  const allowedEnvironments = new Set(["development", "staging", "production"]);
  const localDevelopmentProjectRef = "localdevelopment0000";

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function decodeJwtPayload(token) {
    const parts = text(token).split(".");
    if (parts.length !== 3) return null;
    try {
      const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const decode = globalObject.atob || globalThis.atob;
      if (typeof decode !== "function") return null;
      return JSON.parse(decode(padded));
    } catch (_) {
      return null;
    }
  }

  function parseRuntimeUrl(value, invalidCode) {
    try {
      return new URL(value);
    } catch (_) {
      throw new Error(invalidCode);
    }
  }

  function requireRuntimeConfig() {
    const config = record(source);
    if (!config) {
      throw new Error(
        "ECONOVARIA_RUNTIME_CONFIG_REQUIRED: load the deployment-scoped runtime-config.env.js before runtime-config.js."
      );
    }

    const environment = text(config.environment).toLowerCase();
    const projectRef = text(config.projectRef).toLowerCase();
    const supabaseUrl = text(config.supabaseUrl).replace(/\/+$/, "");
    const apiProxyUrl = text(config.apiProxyUrl).replace(/\/+$/, "");
    const supabasePublishableKey = text(config.supabasePublishableKey);

    if (!allowedEnvironments.has(environment)) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_ENVIRONMENT");
    }
    if (!/^[a-z0-9]{20}$/.test(projectRef)) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_PROJECT_REF");
    }

    const parsedUrl = parseRuntimeUrl(
      supabaseUrl,
      "ECONOVARIA_RUNTIME_CONFIG_INVALID_SUPABASE_URL"
    );
    const localHost = new Set(["localhost", "127.0.0.1", "::1"]);
    const isLocalSupabase = localHost.has(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !isLocalSupabase) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_REQUIRES_HTTPS");
    }
    if (isLocalSupabase) {
      if (
        environment !== "development" ||
        projectRef !== localDevelopmentProjectRef
      ) {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_LOCAL_BINDING");
      }
    } else if (parsedUrl.hostname !== `${projectRef}.supabase.co`) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_PROJECT_URL_MISMATCH");
    }
    if (parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_SUPABASE_URL_SHAPE");
    }

    let apiBaseUrl = supabaseUrl;
    if (apiProxyUrl) {
      if (environment === "production") {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_API_PROXY_PROHIBITED_IN_PRODUCTION");
      }
      const parsedProxyUrl = parseRuntimeUrl(
        apiProxyUrl,
        "ECONOVARIA_RUNTIME_CONFIG_INVALID_API_PROXY_URL"
      );
      const browserOrigin = text(globalObject.location?.origin).replace(/\/+$/, "");
      const isLoopbackProxy = localHost.has(parsedProxyUrl.hostname);
      const isExactHostedStagingProxy =
        environment === "staging" &&
        parsedProxyUrl.protocol === "https:" &&
        browserOrigin.length > 0 &&
        parsedProxyUrl.origin === browserOrigin;
      if (!isLoopbackProxy && !isExactHostedStagingProxy) {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_API_PROXY_MUST_BE_LOOPBACK");
      }
      if (!new Set(["http:", "https:"]).has(parsedProxyUrl.protocol)) {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_API_PROXY_PROTOCOL");
      }
      if (
        parsedProxyUrl.pathname !== "/" ||
        parsedProxyUrl.search ||
        parsedProxyUrl.hash ||
        parsedProxyUrl.username ||
        parsedProxyUrl.password
      ) {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_API_PROXY_URL_SHAPE");
      }
      apiBaseUrl = apiProxyUrl;
    }

    if (!supabasePublishableKey) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_PUBLISHABLE_KEY_REQUIRED");
    }
    if (/^sb_secret_/i.test(supabasePublishableKey)) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_SECRET_KEY_PROHIBITED");
    }
    if (!/^sb_publishable_/i.test(supabasePublishableKey)) {
      const payload = decodeJwtPayload(supabasePublishableKey);
      if (!payload || payload.role !== "anon") {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_LEGACY_ANON_KEY");
      }
      if (!isLocalSupabase && text(payload.ref).toLowerCase() !== projectRef) {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_LEGACY_ANON_KEY");
      }
    }

    const playerWebSessionApiUrl = environment === "production"
      ? "/api/player-session"
      : `${apiBaseUrl}/functions/v1/player-web-session-api`;
    const playerApiUrl = environment === "production"
      ? "/api/player"
      : `${apiBaseUrl}/functions/v1/player-web-session-api/proxy`;
    const staffApiUrl = `${apiBaseUrl}/functions/v1/staff-api`;
    const bootstrapApiUrl = `${apiBaseUrl}/functions/v1/bootstrap-api`;
    const adminApiUrl = `${apiBaseUrl}/functions/v1/admin-api`;
    const webSessionApiUrl = environment === "production"
      ? "/api/admin-session"
      : `${apiBaseUrl}/functions/v1/web-session-api`;
    const adminLogoutApiUrl = environment === "production"
      ? "/api/admin-logout"
      : `${apiBaseUrl}/functions/v1/admin-logout-api`;
    const adminBffApiUrl = environment === "production"
      ? "/api/admin"
      : `${apiBaseUrl}/functions/v1/web-session-api/proxy`;
    const passwordResetApiUrl = environment === "production"
      ? "/api/password-reset"
      : `${apiBaseUrl}/functions/v1/password-reset-api`;

    return Object.freeze({
      environment,
      projectRef,
      supabaseUrl,
      apiProxyUrl,
      supabasePublishableKey,
      playerApiUrl,
      playerWebSessionApiUrl,
      staffApiUrl,
      bootstrapApiUrl,
      adminApiUrl,
      webSessionApiUrl,
      adminLogoutApiUrl,
      adminBffApiUrl,
      passwordResetApiUrl,
      classroomApiUrl: staffApiUrl,
    });
  }

  const runtimeConfig = requireRuntimeConfig();
  Object.defineProperty(globalObject, "EconovariaRuntimeConfig", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: runtimeConfig,
  });

  const documentObject = globalObject.document;
  const runtimeScriptUrl = text(documentObject?.currentScript?.src);
  const adminApiMeta = documentObject?.querySelector?.(
    'meta[name="econovaria-admin-api-base"]'
  );
  if (adminApiMeta) adminApiMeta.content = runtimeConfig.adminBffApiUrl;

  function createAdminLogoutScriptUrl() {
    const expected = new URL("admin-logout-override.js", runtimeScriptUrl);
    const runtimeScript = new URL(runtimeScriptUrl);
    if (expected.origin !== runtimeScript.origin) {
      throw new Error("ECONOVARIA_ADMIN_LOGOUT_SCRIPT_ORIGIN_MISMATCH");
    }

    const trustedTypesFactory = globalObject.trustedTypes;
    if (typeof trustedTypesFactory?.createPolicy !== "function") {
      return expected.href;
    }

    const policy = trustedTypesFactory.createPolicy("econovaria", {
      createScriptURL(value) {
        const candidate = new URL(text(value), runtimeScriptUrl);
        if (candidate.href !== expected.href) {
          throw new TypeError("ECONOVARIA_TRUSTED_SCRIPT_URL_REJECTED");
        }
        return candidate.href;
      },
    });
    return policy.createScriptURL(expected.href);
  }

  function installAdminLogoutOverride() {
    const adminOrLoginShell = Boolean(
      adminApiMeta ||
      documentObject?.getElementById?.("loginScreen") ||
      documentObject?.getElementById?.("adminPreview")
    );
    if (
      !adminOrLoginShell ||
      !runtimeScriptUrl ||
      typeof documentObject?.createElement !== "function" ||
      typeof documentObject?.head?.append !== "function" ||
      documentObject.querySelector?.("script[data-econovaria-admin-logout-override]")
    ) {
      return;
    }

    let trustedScriptUrl;
    try {
      trustedScriptUrl = createAdminLogoutScriptUrl();
    } catch (_) {
      return;
    }

    const logoutOverride = documentObject.createElement("script");
    logoutOverride.src = trustedScriptUrl;
    logoutOverride.async = true;
    logoutOverride.dataset.econovariaAdminLogoutOverride = "true";
    documentObject.head.append(logoutOverride);
  }

  if (documentObject?.readyState === "loading") {
    documentObject.addEventListener?.(
      "DOMContentLoaded",
      installAdminLogoutOverride,
      { once: true }
    );
  } else {
    installAdminLogoutOverride();
  }
})(window);
