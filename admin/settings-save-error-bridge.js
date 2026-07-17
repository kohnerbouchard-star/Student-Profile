(function initEconovariaSettingsSaveErrorBridge() {
  "use strict";

  const SAVE_SELECTOR = '[data-admin-terminal-action="save-settings"]';
  const STYLE_ID = "econovaria-settings-final-polish-style";
  let queued = false;

  function text(value) {
    return String(value ?? "").trim();
  }

  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "./css/settings-final-polish.css";
    document.head.append(link);
  }

  function reconcileSaveError() {
    const button = document.querySelector(SAVE_SELECTOR);
    if (!(button instanceof HTMLButtonElement)) return;

    const attendanceError = text(button.dataset.attendanceRewardError);
    const currentState = button.getAttribute("data-admin-terminal-api-state") || "";
    let changed = false;

    if (attendanceError && currentState !== "error") {
      button.setAttribute("data-admin-terminal-api-state", "error");
      changed = true;
    } else if (!attendanceError && currentState === "error") {
      button.removeAttribute("data-admin-terminal-api-state");
      changed = true;
    }

    if (changed) window.EconovariaSimplifiedSettings?.refresh?.();
  }

  function reconcile() {
    ensureStylesheet();
    reconcileSaveError();
    window.EconovariaSimplifiedSettings?.refresh?.();
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
      attributeFilter: [
        "data-attendance-reward-error",
        "data-admin-terminal-api-state",
        "aria-busy",
      ],
    });
  }

  document.addEventListener("econovaria:attendance-reward-saved", schedule);
  window.addEventListener("load", schedule, { once: true });
  schedule();
})();
