(function initEconovariaAdminSessionGate() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const ADMIN_MOUNTED_EVENT = "econovaria:admin-route-mounted";
  const sessionManager = window.EconovariaAdminAuthSession;
  const MINIMUM_GATE_VISIBLE_MS = 120;
  const MOUNT_TIMEOUT_MS = 10000;
  const initializedAt = performance.now();
  let released = false;
  let redirecting = false;
  let mountTimeout = null;
  let releaseTimeout = null;
  let listeningForMount = false;

  function mainLoginUrl(reason) {
    const url = new URL("../", window.location.href);
    url.searchParams.set("mode", "admin");
    if (reason) url.searchParams.set("reason", reason);
    return url.href;
  }

  function clearTransferredSession() {
    sessionManager?.clear();
  }

  function redirectToMainLogin(reason) {
    if (redirecting) return;
    redirecting = true;
    window.location.replace(mainLoginUrl(reason));
  }

  function adminMount() {
    return document.getElementById("adminPreview");
  }

  function mountIsReady(mount = adminMount()) {
    return Boolean(mount && !mount.hidden && mount.childElementCount > 0);
  }

  function stopWatchingForMount() {
    if (listeningForMount) {
      document.removeEventListener(ADMIN_MOUNTED_EVENT, handleAdminMounted);
      listeningForMount = false;
    }
    if (mountTimeout) {
      window.clearTimeout(mountTimeout);
      mountTimeout = null;
    }
  }

  function completeRelease() {
    if (released) return false;
    released = true;
    stopWatchingForMount();
    const remainingVisibleMs = Math.max(
      0,
      MINIMUM_GATE_VISIBLE_MS - (performance.now() - initializedAt),
    );
    releaseTimeout = window.setTimeout(() => {
      document.getElementById("adminSessionGate")?.remove();
      releaseTimeout = null;
    }, remainingVisibleMs);
    return true;
  }

  function handleAdminMounted(event) {
    const mount = adminMount();
    if (!mount || event.target !== mount || !mountIsReady(mount)) return;
    completeRelease();
  }

  function signalMounted(detail = {}) {
    const mount = adminMount();
    if (!mountIsReady(mount)) return false;
    mount.dispatchEvent(new CustomEvent(ADMIN_MOUNTED_EVENT, {
      bubbles: true,
      detail: {
        route: "Overview",
        initial: true,
        mountId: "adminPreview",
        ...((detail && typeof detail === "object") ? detail : {}),
      },
    }));
    return true;
  }

  function showError(message) {
    if (released) return;
    stopWatchingForMount();
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
    release: signalMounted,
    showError,
    mountedEvent: ADMIN_MOUNTED_EVENT,
  };

  function beginMountWatch() {
    if (released || listeningForMount) return;
    if (mountIsReady()) {
      completeRelease();
      return;
    }

    listeningForMount = true;
    document.addEventListener(ADMIN_MOUNTED_EVENT, handleAdminMounted);
    mountTimeout = window.setTimeout(() => {
      stopWatchingForMount();
      showError("The administrator console took too long to start. Reload this page or return to sign in.");
    }, MOUNT_TIMEOUT_MS);
  }

  function watchForAdminMount() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", beginMountWatch, { once: true });
    } else {
      beginMountWatch();
    }
  }

  async function verifyTransferredSession() {
    if (!sessionManager) {
      showError("The administrator session service could not start.");
      return;
    }

    const previousSession = sessionManager.read();
    if (!previousSession) {
      redirectToMainLogin("session-required");
      return;
    }

    try {
      await sessionManager.getUsableSession();
    } catch (_) {
      clearTransferredSession();
      redirectToMainLogin("session-expired");
      return;
    }

    const selectedGameId = String(window.sessionStorage.getItem(SELECTED_GAME_KEY) || "").trim();
    if (!selectedGameId) {
      redirectToMainLogin("select-game");
      return;
    }

    watchForAdminMount();
  }

  void verifyTransferredSession();
})();
