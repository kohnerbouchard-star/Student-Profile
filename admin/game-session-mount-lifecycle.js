(function initEconovariaAdminGameSessionMountLifecycle() {
  "use strict";

  const FULL_RECONCILE_EVENTS = Object.freeze([
    "econovaria:admin-route-mounted",
    "econovaria:admin-account-surface-ready",
    "econovaria:admin-session-refreshed",
  ]);
  const CARD_SELECTOR = "[data-econovaria-game-session-card]";
  let reconcileFrame = 0;
  let integrityFrame = 0;

  function visible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.hidden) {
      return false;
    }
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      rect.width > 1 && rect.height > 1;
  }

  function liveSessionCard() {
    return [...document.querySelectorAll(CARD_SELECTOR)].find(visible) || null;
  }

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

  function verifyCardAfterModalClose() {
    integrityFrame = 0;
    if (liveSessionCard()) return;
    scheduleReconcile();
  }

  function schedulePostModalIntegrityCheck() {
    if (integrityFrame) window.cancelAnimationFrame(integrityFrame);
    integrityFrame = window.requestAnimationFrame(() => {
      integrityFrame = window.requestAnimationFrame(
        verifyCardAfterModalClose,
      );
    });
  }

  for (const eventName of FULL_RECONCILE_EVENTS) {
    document.addEventListener(eventName, scheduleReconcile);
  }
  document.addEventListener(
    "econovaria:admin-modal-closed",
    schedulePostModalIntegrityCheck,
  );
  window.addEventListener(
    "econovaria:admin-bootstrap-complete",
    scheduleReconcile,
  );

  scheduleReconcile();
})();
