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

  function repair() {
    if (repaired) return true;

    const feature = window.Econovaria?.features?.adminOverviewTerminal;
    if (!feature || feature.authState?.state !== "ready") return false;

    const model = feature.currentModel;
    if (!model || model.__sessionBootstrapPending !== true) {
      repaired = true;
      stop();
      return true;
    }

    feature.currentModel = {
      ...model,
      __sessionBootstrapPending: false
    };

    repaired = true;
    stop();

    const section = feature.currentSection || "Overview";
    if (typeof feature.loadAdminTerminalPageData === "function") {
      Promise.resolve(
        feature.loadAdminTerminalPageData(section, {
          silent: true,
          force: true
        })
      ).catch(() => {
        window.EconovariaAdminSessionGate?.showError?.(
          "Administrator access was verified, but the protected dashboard could not be rendered. Reload this page."
        );
      });
    }

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
