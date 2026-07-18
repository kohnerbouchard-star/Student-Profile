(function initEconovariaSettingsLifecycleBridge() {
  "use strict";

  const PAGE_SELECTOR = ".admin-terminal-settings-page";
  const ATTENDANCE_SELECTOR =
    '[data-admin-attendance-reward-settings][data-attendance-reward-loaded="true"]';
  const MAX_SETTLE_FRAMES = 120;
  let generation = 0;

  function settingsAction(target) {
    const section = target instanceof Element
      ? target.closest("[data-admin-section]")
      : null;
    return section?.getAttribute("data-admin-section") === "Settings";
  }

  function settingsRequest(detail) {
    return detail?.pageRead === true &&
      typeof detail.pathname === "string" &&
      /\/settings(?:$|[/?#])/.test(detail.pathname);
  }

  function publishReady(page, reason) {
    page.dispatchEvent(new CustomEvent("econovaria:admin-settings-mounted", {
      bubbles: true,
      detail: { reason },
    }));
  }

  function reconcile(reason = "explicit") {
    const token = ++generation;
    let frames = 0;

    function settle() {
      if (token !== generation) return;
      frames += 1;

      const page = document.querySelector(PAGE_SELECTOR);
      const attendance = page?.querySelector(ATTENDANCE_SELECTOR);
      const controller = window.EconovariaSimplifiedSettings;

      if (
        page instanceof HTMLElement &&
        attendance instanceof HTMLElement &&
        typeof controller?.reconcile === "function"
      ) {
        controller.reconcile();
        window.requestAnimationFrame(() => {
          if (token !== generation || !page.isConnected) return;
          controller.refresh?.();
          publishReady(page, reason);
        });
        return;
      }

      if (frames < MAX_SETTLE_FRAMES) {
        window.requestAnimationFrame(settle);
      }
    }

    window.requestAnimationFrame(settle);
  }

  document.addEventListener("click", (event) => {
    if (settingsAction(event.target)) reconcile("navigation");
  }, true);

  document.addEventListener("econovaria:admin-request-lifecycle", (event) => {
    const detail = event.detail && typeof event.detail === "object"
      ? event.detail
      : {};
    if (
      settingsRequest(detail) &&
      ["committed", "failed", "cancelled"].includes(detail.phase)
    ) {
      reconcile("request-complete");
    }
  });

  document.addEventListener("econovaria:settings-context-changed", () => {
    reconcile("game-context");
  });

  document.addEventListener("econovaria:attendance-reward-saved", () => {
    reconcile("attendance-saved");
  });

  window.addEventListener("load", () => reconcile("window-load"), { once: true });
  reconcile("module-load");

  window.EconovariaSettingsLifecycleBridge = Object.freeze({ reconcile });
})();
