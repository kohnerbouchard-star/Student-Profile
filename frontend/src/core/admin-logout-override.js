(function installVerifiedAdminLogout(globalObject) {
  "use strict";

  const runtimeConfig = globalObject.EconovariaRuntimeConfig;
  if (!runtimeConfig) return;
  const logoutUrl = String(runtimeConfig.adminLogoutApiUrl || "").trim();
  const publishableKey = String(runtimeConfig.supabasePublishableKey || "").trim();
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DEVICE_KEY = "econovaria.device.v1";
  const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let attempts = 0;

  function safeState() {
    try {
      const value = JSON.parse(globalObject.sessionStorage.getItem(SESSION_KEY) || "null");
      return value && value.authenticated === true ? value : null;
    } catch {
      return null;
    }
  }

  function deviceId() {
    try {
      const existing = String(globalObject.localStorage.getItem(DEVICE_KEY) || "")
        .trim()
        .toLowerCase();
      if (DEVICE_PATTERN.test(existing)) return existing;
      const generated = String(globalObject.crypto?.randomUUID?.() || "").toLowerCase();
      if (!DEVICE_PATTERN.test(generated)) return "";
      globalObject.localStorage.setItem(DEVICE_KEY, generated);
      return generated;
    } catch {
      return "";
    }
  }

  function clearLocalState() {
    try {
      globalObject.sessionStorage.removeItem(SESSION_KEY);
      globalObject.sessionStorage.removeItem(SELECTED_GAME_KEY);
    } catch {}
  }

  async function verifiedLogout() {
    const state = safeState();
    const headers = { apikey: publishableKey };
    const csrfToken = String(state?.csrfToken || "");
    const device = deviceId();
    if (CSRF_PATTERN.test(csrfToken)) {
      headers["x-econovaria-csrf-token"] = csrfToken;
    }
    if (device) headers["x-econovaria-device-id"] = device;

    let result = {
      ok: false,
      status: 0,
      code: "staff_logout_revocation_failed",
      message: "Administrator session revocation could not be confirmed.",
      retryAfterSeconds: 0,
    };
    try {
      const response = await globalObject.fetch(logoutUrl, {
        method: "POST",
        headers,
        body: "{}",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        keepalive: true,
      });
      const body = await response.json().catch(() => null);
      result = response.ok
        ? { status: response.status, ...(body || { ok: true }) }
        : {
          ok: false,
          status: response.status,
          code: String(body?.error?.code || "staff_logout_revocation_failed"),
          message: String(
            body?.error?.message ||
              "Administrator session revocation could not be confirmed.",
          ),
          retryAfterSeconds: Number(response.headers.get("retry-after") || 0),
          error: body?.error || null,
        };
    } catch {
      // Local browser state is cleared below. The caller receives a truthful
      // revocation failure and may surface it to the operator.
    } finally {
      clearLocalState();
    }
    return result;
  }

  function bind() {
    const core = globalObject.Econovaria?.core;
    const api = core?.api;
    if (!core || !api) {
      attempts += 1;
      if (attempts < 100) globalObject.setTimeout(bind, 0);
      return;
    }
    api.callAdminWebSessionLogout = verifiedLogout;
    core.callAdminWebSessionLogout = verifiedLogout;
  }

  if (logoutUrl && publishableKey) bind();
})(window);
