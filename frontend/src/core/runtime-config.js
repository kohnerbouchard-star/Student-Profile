(function initializeEconovariaRuntimeConfig(globalObject) {
  "use strict";

  const source = globalObject.__ECONOVARIA_RUNTIME_CONFIG__;
  const allowedEnvironments = new Set(["development", "staging", "production"]);

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
    const supabasePublishableKey = text(config.supabasePublishableKey);

    if (!allowedEnvironments.has(environment)) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_ENVIRONMENT");
    }
    if (!/^[a-z0-9]{20}$/.test(projectRef)) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_PROJECT_REF");
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(supabaseUrl);
    } catch (_) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_SUPABASE_URL");
    }

    const localHost = new Set(["localhost", "127.0.0.1", "::1"]);
    if (parsedUrl.protocol !== "https:" && !localHost.has(parsedUrl.hostname)) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_REQUIRES_HTTPS");
    }
    if (
      !localHost.has(parsedUrl.hostname) &&
      parsedUrl.hostname !== `${projectRef}.supabase.co`
    ) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_PROJECT_URL_MISMATCH");
    }
    if (parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_SUPABASE_URL_SHAPE");
    }

    if (!supabasePublishableKey) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_PUBLISHABLE_KEY_REQUIRED");
    }
    if (/^sb_secret_/i.test(supabasePublishableKey)) {
      throw new Error("ECONOVARIA_RUNTIME_CONFIG_SECRET_KEY_PROHIBITED");
    }
    if (!/^sb_publishable_/i.test(supabasePublishableKey)) {
      const payload = decodeJwtPayload(supabasePublishableKey);
      if (!payload || payload.role !== "anon" || text(payload.ref).toLowerCase() !== projectRef) {
        throw new Error("ECONOVARIA_RUNTIME_CONFIG_INVALID_LEGACY_ANON_KEY");
      }
    }

    return Object.freeze({
      environment,
      projectRef,
      supabaseUrl,
      supabasePublishableKey,
      classroomApiUrl: `${supabaseUrl}/functions/v1/classroom-api`,
      adminApiUrl: `${supabaseUrl}/functions/v1/admin-api`,
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
  const adminApiMeta = documentObject?.querySelector?.(
    'meta[name="econovaria-admin-api-base"]'
  );
  if (adminApiMeta) adminApiMeta.content = runtimeConfig.adminApiUrl;
})(window);