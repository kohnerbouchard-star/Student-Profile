(function initEconovariaAdminShapeSkeletonLifecycle() {
  "use strict";

  const MAIN_SELECTOR = ".admin-terminal-shell-main";
  const OVERLAY_SELECTOR = ":scope > .admin-qol-page-skeleton";
  const ACCOUNT_PAGE_SELECTOR = ".admin-terminal-account-page";
  const ACCOUNT_SETTLE_MS = 180;
  const ACCOUNT_VISIBLE_MS = 760;
  const REQUIRED_STABLE_FRAMES = 4;
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
    return [...document.querySelectorAll(ACCOUNT_PAGE_SELECTOR)]
      .find((element) => !element.closest("[data-admin-shape-skeleton-stage]") && visible(element)) || null;
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

  function rounded(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function boxSignature(element) {
    if (!(element instanceof Element)) return "";
    const rect = element.getBoundingClientRect();
    return [rect.x, rect.y, rect.width, rect.height].map(rounded).join(":");
  }

  function accountGeometrySignature(surface) {
    if (!(surface instanceof Element)) return "";
    const probes = [
      surface,
      surface.querySelector("h1, h2, h3"),
      surface.querySelector("[class*='summary']"),
      surface.querySelector("[class*='profile']"),
      surface.querySelector("[class*='panel'], [class*='section'], form"),
    ];
    const heading = surface.querySelector("h1, h2, h3")?.textContent?.trim() || "";
    return `${heading}|${probes.map(boxSignature).join("|")}|${surface.childElementCount}`;
  }

  function suppressPrematureOverlay(route) {
    const main = currentMain();
    if (!(main instanceof HTMLElement)) return;
    const overlay = currentOverlay(main);
    if (!routeMatchesOverlay(overlay, route)) return;
    hideConnectedOverlay(overlay);
    main.removeAttribute("aria-busy");
    delete main.dataset.adminShapeLoadingRoute;
  }

  function renderStableAccountSkeleton(route, state) {
    const api = window.EconovariaAdminShapeSkeletons;
    if (!api?.renderPage) return false;

    const previous = api.activePageController?.() || null;
    hideConnectedOverlay(previous?.overlay);

    const controller = api.renderPage(route, {
      show: true,
      autoHideMs: ACCOUNT_VISIBLE_MS,
    });
    if (!controller) return false;

    state.controller = controller;
    state.rendered = true;
    state.shownAt = performance.now();
    return true;
  }

  function completeAccountLoading(route, token, state) {
    if (token !== lifecycleGeneration || !state.rendered) return false;
    if (performance.now() - state.shownAt < ACCOUNT_VISIBLE_MS) return false;

    const accountSurface = activeAccountSurface();
    const main = currentMain();
    if (!accountSurface || !(main instanceof HTMLElement)) return false;

    const api = window.EconovariaAdminShapeSkeletons;
    const controller = api?.activePageController?.() || state.controller || null;
    if (controller?.route && controller.route !== route) return false;

    const liveOverlay = currentOverlay(main);
    if (!routeMatchesOverlay(liveOverlay, route)) return false;

    if (controller && !requestedControllerHides.has(controller)) {
      requestedControllerHides.add(controller);
      controller.hide?.({ immediate: true });
    }

    hideConnectedOverlay(state.controller?.overlay);
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
    const state = {
      completed: false,
      controller: null,
      lastSignature: "",
      rendered: false,
      shownAt: 0,
      stableFrames: 0,
    };

    function frame() {
      if (token !== lifecycleGeneration) return;

      const surface = activeAccountSurface();
      if (!state.rendered) {
        suppressPrematureOverlay(route);
        const signature = accountGeometrySignature(surface);
        if (signature && signature === state.lastSignature) state.stableFrames += 1;
        else state.stableFrames = signature ? 1 : 0;
        state.lastSignature = signature;

        if (
          signature &&
          performance.now() - startedAt >= ACCOUNT_SETTLE_MS &&
          state.stableFrames >= REQUIRED_STABLE_FRAMES
        ) {
          renderStableAccountSkeleton(route, state);
        }
      } else {
        completeAccountLoading(route, token, state);
      }

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
