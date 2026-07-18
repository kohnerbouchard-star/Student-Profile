(function initEconovariaAdminSessionTimeoutSafeExit() {
  "use strict";

  const sessionManager = window.EconovariaAdminAuthSession;
  const REFRESH_SKEW_MS = 1000;
  const MAX_TIMER_MS = 2147483647;
  const RECHECK_INTERVAL_MS = 15000;
  let expiryTimer = 0;
  let recheckTimer = 0;
  let redirectTimer = 0;
  let scheduledExpiry = 0;
  let exiting = false;

  function loginUrl(reason = "session-expired") {
    const url = new URL("../", window.location.href);
    url.searchParams.set("mode", "admin");
    url.searchParams.set("reason", reason);
    return url.href;
  }

  function clearTimer(timerName) {
    const timer = timerName === "expiry"
      ? expiryTimer
      : timerName === "recheck"
      ? recheckTimer
      : redirectTimer;
    if (!timer) return;
    if (timerName === "recheck") window.clearInterval(timer);
    else window.clearTimeout(timer);
    if (timerName === "expiry") expiryTimer = 0;
    else if (timerName === "recheck") recheckTimer = 0;
    else redirectTimer = 0;
  }

  function sessionExpiresAt(session) {
    const expiresAt = Number(sessionManager?.parseJwt(session?.accessToken || "")?.exp || 0) * 1000;
    return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : 0;
  }

  function lockAdminShell() {
    document.documentElement.setAttribute("data-admin-session-exiting", "true");
    const preview = document.getElementById("adminPreview");
    if (preview) {
      preview.inert = true;
      preview.hidden = true;
      preview.setAttribute("aria-hidden", "true");
    }

    const gate = document.getElementById("adminSessionGate");
    if (gate) {
      gate.hidden = false;
      gate.setAttribute("role", "alert");
      gate.setAttribute("aria-live", "assertive");
      gate.setAttribute("aria-label", "Administrator session expired");
      const status = gate.querySelector(".admin-qol-sr-only");
      if (status) status.textContent = "Administrator session expired. Returning to sign in.";
    }
    document.title = "Session expired · Econovaria Administrator";
  }

  function exit(reason = "session-expired") {
    if (exiting) return false;
    exiting = true;
    clearTimer("expiry");
    clearTimer("recheck");
    try {
      sessionManager?.clear();
      window.sessionStorage.removeItem("econovaria.admin.csrf.v1");
      window.sessionStorage.removeItem("econovaria.admin.idle-seed-fingerprint.v1");
    } catch (_) {}
    window.ECONOVARIA_CSRF_TOKEN = "";
    window.currentSession = null;
    if (window.state) window.state.staffSession = null;
    lockAdminShell();

    window.dispatchEvent(new CustomEvent("econovaria:admin-session-exit-started", {
      detail: { reason, terminal: "admin" }
    }));
    redirectTimer = window.setTimeout(() => {
      window.location.replace(loginUrl(reason));
    }, 120);
    return true;
  }

  async function validateAtExpiry() {
    if (exiting || !sessionManager) return;
    const session = sessionManager.read();
    if (!session) return;

    try {
      const usable = await sessionManager.getUsableSession({ minimumValidityMs: 0 });
      if (!usable) {
        exit("session-expired");
        return;
      }
      schedule(usable);
    } catch (_) {
      exit("session-expired");
    }
  }

  function schedule(session = sessionManager?.read()) {
    if (exiting || !sessionManager || !session) return;
    const expiresAt = sessionExpiresAt(session);
    if (!expiresAt) return;
    if (expiresAt === scheduledExpiry && expiryTimer) return;

    clearTimer("expiry");
    scheduledExpiry = expiresAt;
    const delay = expiresAt - Date.now() - REFRESH_SKEW_MS;
    if (delay <= 0) {
      void validateAtExpiry();
      return;
    }
    expiryTimer = window.setTimeout(
      () => void validateAtExpiry(),
      Math.min(delay, MAX_TIMER_MS)
    );
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    schedule();
    const session = sessionManager?.read();
    if (session && sessionExpiresAt(session) <= Date.now()) {
      void validateAtExpiry();
    }
  }

  function start() {
    if (!sessionManager) return;
    schedule();
    recheckTimer = window.setInterval(handleVisibilityChange, RECHECK_INTERVAL_MS);
  }

  window.addEventListener("econovaria:admin-session-refreshed", () => {
    scheduledExpiry = 0;
    schedule();
  });
  window.addEventListener("pageshow", handleVisibilityChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  window.EconovariaAdminSessionExit = Object.freeze({
    exit,
    check: handleVisibilityChange
  });

  start();
})();
