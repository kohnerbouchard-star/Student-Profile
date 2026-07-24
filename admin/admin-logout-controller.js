(function installEconovariaAdminLogoutController() {
  "use strict";

  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const CSRF_TOKEN_KEY = "econovaria.admin.csrf.v1";
  const LOGOUT_ACTIONS = new Set([
    "sign-out",
    "signout",
    "log-out",
    "logout",
    "admin-sign-out",
    "admin-logout",
  ]);
  let logoutPromise = null;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function isLogoutControl(node) {
    if (!(node instanceof Element)) return false;
    const action = text(node.getAttribute("data-admin-terminal-action")).toLowerCase();
    if (LOGOUT_ACTIONS.has(action)) return true;
    if (node.matches("[data-econovaria-admin-logout]")) return true;
    const label = text(
      node.getAttribute("aria-label") ||
        node.getAttribute("title") ||
        node.textContent,
    ).toLowerCase();
    return /^(?:sign out|log out|logout)$/.test(label);
  }

  function captureSession() {
    const session = window.EconovariaAdminAuthSession?.read?.() || null;
    return Object.freeze({
      accessToken: text(session?.accessToken),
      selectedGameId: text(
        window.EconovariaAdminAuth?.getSelectedGameId?.() ||
          window.sessionStorage.getItem(SELECTED_GAME_KEY),
      ),
    });
  }

  function clearSessionSynchronously() {
    try {
      window.EconovariaAdminAuthSession?.clear?.();
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SELECTED_GAME_KEY);
      window.sessionStorage.removeItem(CSRF_TOKEN_KEY);
    } catch (_) {}
    window.ECONOVARIA_CSRF_TOKEN = "";
    window.currentSession = null;
    if (window.state) window.state.staffSession = null;
  }

  function loginUrl() {
    const url = new URL("../", window.location.href);
    url.searchParams.set("mode", "admin");
    url.searchParams.set("reason", "signed-out");
    return url.href;
  }

  function boundedRequest(url, options) {
    if (!url) return Promise.resolve();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    return window.fetch(url, {
      ...options,
      signal: controller.signal,
      keepalive: true,
      cache: "no-store",
    }).catch(() => null).finally(() => window.clearTimeout(timer));
  }

  async function revokeCapturedSession(captured) {
    const config = window.EconovariaRuntimeConfig || {};
    const publishableKey = text(config.supabasePublishableKey);
    const accessToken = captured.accessToken;
    const requests = [];

    const adminApiUrl = text(config.adminApiUrl).replace(/\/$/, "");
    if (adminApiUrl) {
      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (publishableKey) headers.apikey = publishableKey;
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      if (captured.selectedGameId) {
        headers["X-Econovaria-Game-Id"] = captured.selectedGameId;
      }
      requests.push(boundedRequest(`${adminApiUrl}/auth/sign-out`, {
        method: "POST",
        headers,
        body: "{}",
        credentials: "omit",
      }));
    }

    const supabaseUrl = text(config.supabaseUrl).replace(/\/$/, "");
    if (supabaseUrl && publishableKey && accessToken) {
      requests.push(boundedRequest(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "omit",
      }));
    }

    await Promise.allSettled(requests);
  }

  function markControlsBusy() {
    document.querySelectorAll("[data-econovaria-admin-logout]").forEach((control) => {
      control.setAttribute("aria-busy", "true");
      if (control instanceof HTMLButtonElement) control.disabled = true;
    });
  }

  function beginLogout(control) {
    if (logoutPromise) return logoutPromise;
    const captured = captureSession();
    markControlsBusy();
    if (control instanceof HTMLElement) control.dataset.logoutState = "pending";

    clearSessionSynchronously();

    logoutPromise = revokeCapturedSession(captured)
      .finally(() => {
        window.location.replace(loginUrl());
      });
    return logoutPromise;
  }

  window.addEventListener("click", (event) => {
    const control = event.target?.closest?.(
      "button, [role='button'], a, [data-admin-terminal-action]",
    );
    if (!isLogoutControl(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void beginLogout(control);
  }, true);

  window.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    if (!isLogoutControl(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void beginLogout(event.target);
  }, true);

  window.EconovariaAdminLogoutController = Object.freeze({
    beginLogout,
    clearSessionSynchronously,
  });
})();
