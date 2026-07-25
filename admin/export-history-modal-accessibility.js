(function installEconovariaExportHistoryModalAccessibility() {
  "use strict";

  const OPEN_ACTION = "open-export-history";
  const MODAL_SELECTOR = '[data-modal-id="admin-export-history"]';
  const RETRY_DELAYS_MS = Object.freeze([0, 30, 80, 160, 320, 640, 1200]);
  const CLOSE_SELECTOR = [
    "[data-admin-terminal-modal-close]",
    '[data-admin-terminal-action="close-modal"]',
    '[data-admin-terminal-action="close-export-history"]',
    'button[aria-label*="Close"]',
  ].join(",");
  const SHARE_SELECTOR = [
    ".admin-terminal-side-code-expanded",
    ".admin-terminal-side-code-compact",
    "[data-admin-terminal-share-button]",
    '[data-admin-terminal-action="share-game-code"]',
    '[data-admin-terminal-action="share-current-game"]',
    "[data-econovaria-share-game]",
  ].join(",");

  let opener = null;
  let timers = [];
  let ownedController = null;

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function preserveShareControlTitle(root = document) {
    root.querySelectorAll(SHARE_SELECTOR).forEach((control) => {
      if (!(control instanceof HTMLElement) || !visible(control)) return;
      control.dataset.econovariaShareGame = "true";
      control.title = "Share game code";
      if (!control.getAttribute("aria-label")) {
        control.setAttribute("aria-label", "Share game code");
      }
    });
  }

  function scheduleShareControlTitle() {
    RETRY_DELAYS_MS.forEach((delay) => {
      window.setTimeout(() => preserveShareControlTitle(), delay);
    });
  }

  function visibleSurface() {
    return [...document.querySelectorAll(MODAL_SELECTOR)]
      .reverse()
      .find(visible) || null;
  }

  function dialogFor(surface) {
    const candidate = surface.querySelector([
      '[role="dialog"]',
      ".admin-terminal-modal",
      ".admin-terminal-modal-dialog",
      ".admin-terminal-modal-card",
      ".admin-terminal-modal-panel",
    ].join(","));
    return candidate instanceof HTMLElement
      ? candidate
      : surface.firstElementChild instanceof HTMLElement
        ? surface.firstElementChild
        : surface;
  }

  function controllerAlreadyOwns(surface) {
    const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
    const dialog = controller?.dialog;
    return dialog instanceof HTMLElement && (
      dialog === surface || surface.contains(dialog) || dialog.contains(surface)
    );
  }

  function activateVisibleSurface() {
    const accessibility = window.EconovariaAdminModalAccessibility;
    const surface = visibleSurface();
    if (!accessibility?.activate || !(surface instanceof HTMLElement)) return false;
    if (controllerAlreadyOwns(surface)) return true;

    const dialog = dialogFor(surface);
    ownedController = accessibility.activate({
      backdrop: surface,
      dialog,
      opener,
      dismissOnEscape: true,
      dismissOnBackdrop: true,
      trapFocus: true,
      onClose: () => {
        surface.remove();
        ownedController = null;
      },
    });
    surface.dataset.econovariaExportHistoryModalOwned = "true";
    return true;
  }

  function scheduleActivation() {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = RETRY_DELAYS_MS.map((delay) => window.setTimeout(() => {
      if (activateVisibleSurface()) {
        timers.forEach((timer) => window.clearTimeout(timer));
        timers = [];
      }
    }, delay));
  }

  document.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-admin-terminal-action]");
    const actionName = String(action?.dataset?.adminTerminalAction || "").trim();

    if (actionName === OPEN_ACTION) {
      opener = action instanceof HTMLElement ? action : document.activeElement;
      scheduleActivation();
      return;
    }

    const closeControl = event.target?.closest?.(CLOSE_SELECTOR);
    const surface = closeControl?.closest?.(MODAL_SELECTOR);
    if (!(surface instanceof HTMLElement)) return;

    const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
    if (controller?.backdrop === surface) controller.close("close-button");
  }, true);

  document.addEventListener("econovaria:admin-bootstrap-complete", scheduleShareControlTitle);
  scheduleShareControlTitle();
})();
