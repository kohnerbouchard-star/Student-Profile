(function initEconovariaAdminSessionGate() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const sessionManager = window.EconovariaAdminAuthSession;
  const MINIMUM_GATE_VISIBLE_MS = 120;
  const initializedAt = performance.now();
  let released = false;
  let redirecting = false;
  let mountTimeout = null;

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

  function release() {
    if (released) return;
    released = true;
    if (mountTimeout) window.clearTimeout(mountTimeout);
    document.getElementById("adminSessionGate")?.remove();
  }

  function showError(message) {
    if (released) return;
    if (mountTimeout) window.clearTimeout(mountTimeout);

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

  function watchForAdminMount() {
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
