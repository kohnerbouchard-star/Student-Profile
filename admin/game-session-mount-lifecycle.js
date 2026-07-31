(function initEconovariaAdminGameSessionMountLifecycle() {
  "use strict";

  const MOUNT_EVENTS = Object.freeze([
    "econovaria:admin-route-mounted",
    "econovaria:admin-account-surface-ready",
    "econovaria:admin-session-refreshed",
  ]);
  const MODAL_CLOSE_SELECTOR = [
    "[data-admin-terminal-modal-close]",
    "[data-admin-modal-close]",
    "[data-econovaria-close-share]",
    "[data-admin-terminal-action='close-modal']",
    "[data-admin-terminal-action='cancel-modal']",
    "[aria-label^='Close']",
  ].join(",");
  const MODAL_BACKDROP_SELECTOR =
    ".admin-terminal-modal-backdrop, [data-admin-terminal-modal-backdrop]";
  let reconcileFrame = 0;

  function reconcileMountedGameControls() {
    reconcileFrame = 0;
    window.EconovariaAdminGameSessionControls?.reconcile?.();
  }

  function scheduleReconcile() {
    if (reconcileFrame) window.cancelAnimationFrame(reconcileFrame);
    reconcileFrame = window.requestAnimationFrame(() => {
      reconcileFrame = window.requestAnimationFrame(
        reconcileMountedGameControls,
      );
    });
  }

  for (const eventName of MOUNT_EVENTS) {
    document.addEventListener(eventName, scheduleReconcile);
  }
  window.addEventListener(
    "econovaria:admin-bootstrap-complete",
    scheduleReconcile,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") scheduleReconcile();
  });
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(MODAL_CLOSE_SELECTOR)) {
      scheduleReconcile();
      return;
    }
    if (
      target.matches(MODAL_BACKDROP_SELECTOR) &&
      !target.closest("[data-admin-modal-requires-acknowledgement='true']")
    ) {
      scheduleReconcile();
    }
  });

  scheduleReconcile();
})();
