(function initEconovariaAdminShapeSkeletonLifecycle() {
  "use strict";

  const MAIN_SELECTOR = ".admin-terminal-shell-main";
  const OVERLAY_SELECTOR = ":scope > .admin-qol-page-skeleton";
  const ACCOUNT_PAGE_SELECTOR = ".admin-terminal-account-page";
  const MIN_VISIBLE_MS = 260;
  const MONITOR_WINDOW_MS = 5000;

  const ROUTE_BY_ACTION = Object.freeze({
    "open-admin-profile": "account-profile",
    "open-admin-settings": "account-settings",
    "open-admin-notifications": "account-notifications",
    "open-admin-security": "account-security",
    "open-admin-help": "account-help",
    "open-admin-games": "account-games",
  });

  let lifecycleGeneration = 0;
  const requestedControllerHides = new WeakSet();

  function visible(element) {
    if (!(element instanceof Element) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
  }

  function activeAccountSurface() {
    return [...document.querySelectorAll(ACCOUNT_PAGE_SELECTOR)].find(visible) || null;
  }

  function currentMain() {
    return document.querySelector(MAIN_SELECTOR);
  }

  function currentOverlay(main) {
    return main instanceof HTMLElement ? main.querySelector(OVERLAY_SELECTOR) : null;
  }

  function routeMatchesOverlay(overlay, route) {
    if (!(overlay instanceof HTMLElement)) return true;
    const overlayRoute = overlay.dataset.adminShapeSkeletonRoute || "";
    return !overlayRoute || overlayRoute === route;
  }

  function hideConnectedOverlay(overlay) {
    if (!(overlay instanceof HTMLElement)) return false;
    overlay.hidden = true;
    return overlay.hidden;
  }

  function completeAccountLoading(route, token, startedAt, state) {
    if (token !== lifecycleGeneration) return false;
    if (performance.now() - startedAt < MIN_VISIBLE_MS) return false;

    const accountSurface = activeAccountSurface();
    const main = currentMain();
    if (!accountSurface || !(main instanceof HTMLElement)) return false;

    const api = window.EconovariaAdminShapeSkeletons;
    const controller = api?.activePageController?.() || null;
    if (controller?.route && controller.route !== route) return false;

    const liveOverlay = currentOverlay(main);
    if (!routeMatchesOverlay(liveOverlay, route)) return false;

    if (controller && !requestedControllerHides.has(controller)) {
      requestedControllerHides.add(controller);
      controller.hide?.({ immediate: true });
    }

    hideConnectedOverlay(controller?.overlay);
    hideConnectedOverlay(liveOverlay);
    main.removeAttribute("aria-busy");
    delete main.dataset.adminShapeLoadingRoute;

    if (!state.completed) {
      state.completed = true;
      main.dispatchEvent(new CustomEvent("econovaria:admin-account-surface-ready", {
        bubbles: true,
        detail: { route },
      }));
    }

    return (!liveOverlay || liveOverlay.hidden) && !main.hasAttribute("aria-busy");
  }

  function monitorAccountLoading(route, token) {
    const startedAt = performance.now();
    const state = { completed: false };

    function frame() {
      if (token !== lifecycleGeneration) return;
      completeAccountLoading(route, token, startedAt, state);
      if (performance.now() - startedAt < MONITOR_WINDOW_MS) {
        window.requestAnimationFrame(frame);
      }
    }

    window.requestAnimationFrame(frame);
  }

  function onDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("[data-admin-section]")) {
      lifecycleGeneration += 1;
      return;
    }

    const action = target.closest("[data-admin-terminal-action]")
      ?.getAttribute("data-admin-terminal-action");
    const route = ROUTE_BY_ACTION[action];
    if (!route) return;

    const token = ++lifecycleGeneration;
    monitorAccountLoading(route, token);
  }

  document.addEventListener("click", onDocumentClick, true);
})();
