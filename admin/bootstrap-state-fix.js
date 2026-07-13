(function repairEconovariaAdminBootstrapState() {
  "use strict";

  const POLL_INTERVAL_MS = 50;
  const REPAIR_TIMEOUT_MS = 15000;
  let repaired = false;
  let pollId = null;
  let timeoutId = null;

  function stop() {
    if (pollId) window.clearInterval(pollId);
    if (timeoutId) window.clearTimeout(timeoutId);
    pollId = null;
    timeoutId = null;
  }

  function verificationViewIsVisible(mount) {
    if (!mount) return false;
    if (mount.querySelector(".admin-terminal-session-gate-v604")) return true;
    return String(mount.textContent || "").includes("Verifying administrator access");
  }

  function repair() {
    if (repaired) return true;

    const feature = window.Econovaria?.features?.adminOverviewTerminal;
    const mount = document.getElementById("adminPreview");
    if (!feature || !mount || feature.authState?.state !== "ready") return false;

    const model = feature.currentModel;
    if (!model) return false;

    if (model.__sessionBootstrapPending === true) {
      feature.currentModel = {
        ...model,
        __sessionBootstrapPending: false
      };
    }

    if (verificationViewIsVisible(mount)) {
      if (typeof feature.renderShell !== "function") return false;
      mount.innerHTML = feature.renderShell();
    }

    window.EconovariaAdminSessionGate?.release?.();
    repaired = true;
    stop();
    return true;
  }

  function start() {
    if (repair()) return;

    pollId = window.setInterval(repair, POLL_INTERVAL_MS);
    timeoutId = window.setTimeout(() => {
      stop();
      const feature = window.Econovaria?.features?.adminOverviewTerminal;
      if (feature?.authState?.state === "ready") {
        window.EconovariaAdminSessionGate?.showError?.(
          "Administrator access was verified, but the dashboard remained in its startup state. Reload this page."
        );
      }
    }, REPAIR_TIMEOUT_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
