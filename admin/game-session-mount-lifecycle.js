(function initEconovariaAdminGameSessionMountLifecycle() {
  "use strict";

  const MOUNT_EVENTS = Object.freeze([
    "econovaria:admin-route-mounted",
    "econovaria:admin-account-surface-ready",
    "econovaria:admin-session-refreshed",
  ]);
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

  scheduleReconcile();
})();
