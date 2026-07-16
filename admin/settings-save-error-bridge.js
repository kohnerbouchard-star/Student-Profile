(function initEconovariaSettingsSaveErrorBridge() {
  "use strict";

  const SELECTOR = '[data-admin-terminal-action="save-settings"]';
  let queued = false;

  function reconcile() {
    const button = document.querySelector(SELECTOR);
    if (!(button instanceof HTMLButtonElement)) return;

    const attendanceError = String(button.dataset.attendanceRewardError || "").trim();
    const currentState = button.getAttribute("data-admin-terminal-api-state") || "";
    let changed = false;

    if (attendanceError && currentState !== "error") {
      button.setAttribute("data-admin-terminal-api-state", "error");
      changed = true;
    } else if (!attendanceError && currentState === "error") {
      button.removeAttribute("data-admin-terminal-api-state");
      changed = true;
    }

    if (changed) window.EconovariaSimplifiedSettings?.reconcile?.();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      reconcile();
    });
  }

  const root = document.body || document.documentElement;
  if (root && typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-attendance-reward-error"],
    });
  }

  document.addEventListener("econovaria:attendance-reward-saved", schedule);
  window.addEventListener("load", schedule, { once: true });
  schedule();
})();