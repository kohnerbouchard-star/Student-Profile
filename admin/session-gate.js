(function initEconovariaAdminSessionGate() {
  "use strict";

  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  let redirecting = false;
  let completed = false;

  function readSession() {
    try {
      const session = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return session && typeof session.accessToken === "string" && session.accessToken.trim()
        ? session
        : null;
    } catch (_) {
      return null;
    }
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

  function mainLoginUrl(reason) {
    const url = new URL("../", window.location.href);
    url.searchParams.set("mode", "admin");
    if (reason) url.searchParams.set("reason", reason);
    return url.href;
  }

  function clearTransferredSession() {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SELECTED_GAME_KEY);
  }

  function redirectToMainLogin(reason) {
    if (redirecting) return;
    redirecting = true;
    window.location.replace(mainLoginUrl(reason));
  }

  function showConsoleWhenMounted() {
    const mount = document.getElementById("adminPreview");
    if (!mount || mount.hidden || !mount.childElementCount) return false;

    completed = true;
    document.getElementById("adminSessionGate")?.remove();
    return true;
  }

  const session = readSession();
  const selectedGameId = window.sessionStorage.getItem(SELECTED_GAME_KEY) || "";

  if (!session) {
    redirectToMainLogin("session-required");
    return;
  }

  const claims = parseJwt(session.accessToken);
  if (Number(claims.exp || 0) && Number(claims.exp) * 1000 <= Date.now() + 5000) {
    clearTransferredSession();
    redirectToMainLogin("session-expired");
    return;
  }

  if (!selectedGameId) {
    redirectToMainLogin("select-game");
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.ECONOVARIA_ADMIN_REAUTH_URL = mainLoginUrl("session-required");

    if (window.EconovariaAdminAuth) {
      window.EconovariaAdminAuth.showSignIn = function showUnifiedAdminLogin() {
        clearTransferredSession();
        redirectToMainLogin("session-required");
      };
    }

    if (showConsoleWhenMounted()) return;

    const observer = new MutationObserver(() => {
      if (showConsoleWhenMounted()) observer.disconnect();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });

    const sessionWatch = window.setInterval(() => {
      if (completed || redirecting) {
        window.clearInterval(sessionWatch);
        return;
      }

      if (!readSession()) {
        window.clearInterval(sessionWatch);
        observer.disconnect();
        redirectToMainLogin("session-expired");
      }
    }, 250);

    window.setTimeout(() => {
      if (completed || redirecting || showConsoleWhenMounted()) return;
      observer.disconnect();
      window.clearInterval(sessionWatch);
      redirectToMainLogin("bootstrap-failed");
    }, 12000);
  }, { once: true });
})();
