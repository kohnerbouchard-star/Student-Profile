(function initEconovariaAdminSessionGate() {
  "use strict";

  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const MINIMUM_GATE_VISIBLE_MS = 120;
  const initializedAt = performance.now();
  let released = false;
  let redirecting = false;
  let mountTimeout = null;
  let releaseTimeout = null;

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

  function sessionIsExpired(session) {
    const claims = parseJwt(session?.accessToken || "");
    return Boolean(Number(claims.exp || 0) && Number(claims.exp) * 1000 <= Date.now() + 5000);
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

  function release() {
    if (released) return;
    released = true;
    if (mountTimeout) window.clearTimeout(mountTimeout);
    const remainingVisibleMs = Math.max(
      0,
      MINIMUM_GATE_VISIBLE_MS - (performance.now() - initializedAt),
    );
    releaseTimeout = window.setTimeout(() => {
      document.getElementById("adminSessionGate")?.remove();
      releaseTimeout = null;
    }, remainingVisibleMs);
  }

  function showError(message) {
    if (released) return;
    if (mountTimeout) window.clearTimeout(mountTimeout);
    if (releaseTimeout) window.clearTimeout(releaseTimeout);

    const gate = document.getElementById("adminSessionGate");
    if (!gate) return;

    gate.classList.add("is-error");
    gate.replaceChildren();

    const panel = document.createElement("div");
    panel.className = "admin-session-gate__panel";

    const text = document.createElement("p");
    text.textContent = message || "The administrator console could not start.";

    const actions = document.createElement("div");
    actions.className = "admin-session-gate__actions";

    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload";
    reload.addEventListener("click", () => window.location.reload());

    const signIn = document.createElement("button");
    signIn.type = "button";
    signIn.textContent = "Return to sign in";
    signIn.addEventListener("click", () => redirectToMainLogin("console-start-failed"));

    actions.append(reload, signIn);
    panel.append(text, actions);
    gate.appendChild(panel);
  }

  window.EconovariaAdminSessionGate = {
    release,
    showError
  };

  const session = readSession();
  const selectedGameId = String(window.sessionStorage.getItem(SELECTED_GAME_KEY) || "").trim();

  if (!session) {
    redirectToMainLogin("session-required");
    return;
  }

  if (sessionIsExpired(session)) {
    clearTransferredSession();
    redirectToMainLogin("session-expired");
    return;
  }

  if (!selectedGameId) {
    redirectToMainLogin("select-game");
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById("adminPreview");

    if (mount && !mount.hidden && mount.childElementCount > 0) {
      release();
      return;
    }

    const observer = new MutationObserver(() => {
      if (mount && !mount.hidden && mount.childElementCount > 0) {
        observer.disconnect();
        release();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });

    mountTimeout = window.setTimeout(() => {
      observer.disconnect();
      showError("The administrator console took too long to start. Reload this page or return to sign in.");
    }, 10000);
  }, { once: true });
})();
