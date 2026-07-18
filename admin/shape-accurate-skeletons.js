(function initEconovariaAdminShapeAccurateSkeletons() {
  "use strict";

  const MAIN_SELECTOR = ".admin-terminal-shell-main";
  const PAGE_OVERLAY_SELECTOR = ".admin-qol-page-skeleton";
  const MIN_VISIBLE_MS = 260;
  const ACCOUNT_AUTO_HIDE_MS = 760;
  const MAX_BOOT_FRAMES = 180;

  const ROUTE_BY_SECTION = Object.freeze({
    Overview: "overview",
    Attendance: "attendance",
    Players: "players",
    Assignments: "contracts",
    Store: "store",
    Market: "marketplace",
    Settings: "settings",
    Logs: "logs",
  });

  const ROUTE_BY_ACCOUNT_ACTION = Object.freeze({
    "open-admin-profile": "account-profile",
    "open-admin-settings": "account-settings",
    "open-admin-notifications": "account-notifications",
    "open-admin-security": "account-security",
    "open-admin-help": "account-help",
    "open-admin-games": "account-games",
  });

  const ROUTE_ASSEMBLIES = Object.freeze({
    overview: {
      label: "Loading administrator overview",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: [".admin-terminal-top-actions", "[class*='toolbar']"],
        metrics: ["[class*='metric']", "[class*='summary']", "[class*='score']"],
        activity: ["[class*='recent-activity']", "[class*='activity']", "[class*='recent']"],
      },
    },
    players: {
      label: "Loading player roster",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: ["[class*='player'][class*='toolbar']", "[class*='toolbar']", ".admin-terminal-top-actions"],
        roster: ["table", "[role='table']", "[class*='roster']", "[class*='player'][class*='list']"],
        actions: ["[class*='player'][class*='action']", "[class*='bulk']"],
      },
    },
    contracts: {
      label: "Loading Contracts",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: ["[class*='contract'][class*='toolbar']", "[class*='toolbar']", ".admin-terminal-top-actions"],
        list: ["[class*='contract'][class*='list']", "table", "[role='table']"],
        review: ["[class*='contract'][class*='review']", "[class*='submission']", "[class*='contract'][class*='detail']"],
      },
    },
    store: {
      label: "Loading Store catalog",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: ["[class*='store'][class*='toolbar']", "[class*='toolbar']", ".admin-terminal-top-actions"],
        grid: ["[class*='store'][class*='grid']", "[class*='catalog']", "[class*='card'][class*='grid']"],
        card: ["[class*='store'][class*='card']", "[class*='item'][class*='card']"],
      },
    },
    marketplace: {
      label: "Loading Marketplace",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: ["[class*='market'][class*='toolbar']", "[class*='toolbar']", ".admin-terminal-top-actions"],
        summary: ["[class*='market'][class*='summary']", "[class*='market'][class*='status']"],
        surface: ["[class*='market'][class*='grid']", "[class*='market'][class*='table']", "[class*='market'][class*='panel']"],
      },
    },
    attendance: {
      label: "Loading attendance records",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: ["[class*='attendance'][class*='toolbar']", "[class*='toolbar']", ".admin-terminal-top-actions"],
        summary: ["[class*='attendance'][class*='summary']", "[class*='attendance'][class*='metric']"],
        records: ["[class*='attendance'][class*='table']", "table", "[role='table']"],
      },
    },
    logs: {
      label: "Loading audit logs",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: ["[class*='log'][class*='toolbar']", "[class*='toolbar']", ".admin-terminal-top-actions"],
        table: ["[class*='log'][class*='table']", "table", "[role='table']"],
        pagination: ["[class*='pagination']", "[class*='pager']"],
      },
    },
    settings: {
      label: "Loading administrator Settings",
      components: {
        heading: [".admin-terminal-top", "header"],
        toolbar: ["[class*='settings'][class*='toolbar']", "[class*='toolbar']", ".admin-terminal-top-actions"],
        sections: ["[class*='settings'][class*='section']", "[class*='settings'][class*='group']", "details"],
        controls: ["[class*='settings'][class*='controls']", "form"],
      },
    },
    "account-profile": accountAssembly("administrator profile"),
    "account-settings": accountAssembly("account preferences"),
    "account-notifications": accountAssembly("administrator notifications"),
    "account-security": accountAssembly("security and sessions"),
    "account-help": accountAssembly("administrator help"),
    "account-games": accountAssembly("game sessions"),
    "player-drawer": surfaceAssembly("player detail drawer", {
      heading: ["[data-admin-terminal-player-drawer] header", "[data-admin-terminal-player-drawer] h2", "[data-admin-terminal-player-drawer] h3"],
      tabs: ["[data-admin-terminal-player-drawer] [role='tablist']", "[class*='player-drawer'][class*='tabs']"],
      body: ["[data-admin-terminal-player-drawer] [class*='body']", "[data-admin-terminal-player-drawer] [class*='content']"],
    }),
    "contract-review": surfaceAssembly("Contract review workspace", {
      heading: ["[class*='contract'][class*='review'] header", "[class*='contract'][class*='review'] h2", "[class*='contract'][class*='review'] h3"],
      body: ["[class*='contract'][class*='review'] [class*='body']", "[class*='submission'][class*='detail']"],
      actions: ["[class*='contract'][class*='review'] [class*='action']", "[class*='review'][class*='footer']"],
    }),
    scanner: surfaceAssembly("attendance scanner", {
      viewport: [".admin-terminal-scanner-video-container", ".admin-terminal-video-last-scan"],
      result: [".admin-terminal-video-last-scan", "[data-admin-terminal-last-scan-result]"],
      controls: [".admin-terminal-manual-entry-panel", ".admin-terminal-auto-capture-panel"],
    }),
    modal: surfaceAssembly("administrator dialog", {
      heading: [".admin-terminal-modal-head"],
      body: [".admin-terminal-modal-body"],
      footer: [".admin-terminal-modal-footer"],
    }),
  });

  let activePageController = null;
  let activeSurfaceController = null;
  let pageGeneration = 0;
  let refreshTimer = null;
  let bootFrames = 0;
  let modelBridgeInstalled = false;

  function accountAssembly(label) {
    return {
      label: `Loading ${label}`,
      components: {
        heading: [".admin-terminal-account-page header", ".admin-terminal-account-page h2", ".admin-terminal-account-page h1"],
        summary: [".admin-terminal-account-page [class*='summary']", ".admin-terminal-account-page [class*='profile']"],
        content: [".admin-terminal-account-page [class*='panel']", ".admin-terminal-account-page [class*='section']", ".admin-terminal-account-page form"],
      },
    };
  }

  function surfaceAssembly(label, components) {
    return { label: `Loading ${label}`, components };
  }

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function visible(element) {
    if (!(element instanceof Element) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
  }

  function activeRoute() {
    const current = [...document.querySelectorAll("[data-admin-section]")].find((node) => {
      return node.getAttribute("aria-current") === "page" ||
        node.getAttribute("aria-selected") === "true" ||
        node.classList.contains("active") ||
        node.classList.contains("is-active");
    });
    return ROUTE_BY_SECTION[text(current?.getAttribute("data-admin-section"))] || "overview";
  }

  function mainElement() {
    return document.querySelector(MAIN_SELECTOR);
  }

  function pageOverlay(main = mainElement()) {
    if (!(main instanceof HTMLElement)) return null;
    let overlay = main.querySelector(`:scope > ${PAGE_OVERLAY_SELECTOR}`);
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "admin-qol-page-skeleton";
    overlay.hidden = true;
    main.append(overlay);
    return overlay;
  }

  function meaningfulChildren(root, overlay) {
    return [...root.children].filter((child) => {
      return child !== overlay &&
        !child.matches(".admin-shape-refresh-indicator") &&
        !child.hasAttribute("data-admin-shape-surface-overlay") &&
        visible(child);
    });
  }

  function sanitizeClone(root, route) {
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("inert", "");
    root.dataset.adminShapeSkeletonRoute = route;

    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      node.removeAttribute("id");
      node.removeAttribute("for");
      node.removeAttribute("autofocus");
      node.removeAttribute("aria-live");
      node.removeAttribute("aria-describedby");
      node.removeAttribute("aria-labelledby");
      node.removeAttribute("contenteditable");
      node.removeAttribute("href");
      node.removeAttribute("srcset");
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      }

      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
        node.disabled = true;
        node.classList.add("admin-shape-skeleton-control");
      }
      if (node instanceof HTMLButtonElement) {
        node.disabled = true;
        node.classList.add("admin-shape-skeleton-control");
      }
      if (node instanceof HTMLImageElement) {
        node.removeAttribute("src");
        node.removeAttribute("alt");
        node.classList.add("admin-shape-skeleton-media");
      }
      if (node instanceof HTMLVideoElement) {
        node.removeAttribute("src");
        node.removeAttribute("poster");
        node.pause?.();
        node.classList.add("admin-shape-skeleton-media");
      }
      if (node.matches("svg, canvas, picture")) node.classList.add("admin-shape-skeleton-media");
      if (node.matches("table, [role='table']")) node.dataset.adminSkeletonKind = "table";
      if (node.matches("thead, [role='rowgroup']")) node.dataset.adminSkeletonKind = "table-head";
      if (node.matches("tr, [role='row']")) node.dataset.adminSkeletonKind = "table-row";
      if (node.matches("th, td, [role='columnheader'], [role='cell'], [role='gridcell']")) {
        node.classList.add("admin-shape-skeleton-cell");
      }
      if (isTextLeaf(node)) node.classList.add("admin-shape-skeleton-text");
    }
  }

  function isTextLeaf(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.matches("script, style, svg, path, img, video, canvas, input, textarea, select, option")) return false;
    if (!text(node.textContent)) return false;
    const childElements = [...node.children].filter((child) => !child.matches("svg, img, video, canvas"));
    return childElements.length === 0 || node.matches("button, a, small, strong, span, p, label, th, td");
  }

  function assemblyFor(route) {
    return ROUTE_ASSEMBLIES[route] || ROUTE_ASSEMBLIES.overview;
  }

  function firstVisible(root, selectors) {
    for (const selector of selectors || []) {
      const candidate = [...root.querySelectorAll(selector)].find(visible);
      if (candidate) return candidate;
    }
    return null;
  }

  function geometry(rect) {
    return {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      right: round(rect.right),
      bottom: round(rect.bottom),
    };
  }

  function round(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function componentGeometry(root, route) {
    const result = {};
    if (!(root instanceof Element)) return result;
    result.root = geometry(root.getBoundingClientRect());
    const assembly = assemblyFor(route);
    for (const [key, selectors] of Object.entries(assembly.components || {})) {
      const element = firstVisible(root, selectors);
      if (!element) continue;
      result[key] = geometry(element.getBoundingClientRect());
    }
    const heading = firstVisible(root, ["h1", "h2", "h3"]);
    if (heading && !result.heading) result.heading = geometry(heading.getBoundingClientRect());
    return result;
  }

  function tagComponents(root, route) {
    const assembly = assemblyFor(route);
    for (const [key, selectors] of Object.entries(assembly.components || {})) {
      const element = firstVisible(root, selectors);
      if (element) element.dataset.adminSkeletonComponent = key;
    }
  }

  function clonePage(main, route, overlay) {
    const stage = document.createElement("div");
    stage.className = "admin-terminal-shell-main admin-shape-skeleton-stage";
    stage.dataset.adminShapeSkeletonStage = "page";
    for (const child of meaningfulChildren(main, overlay)) stage.append(child.cloneNode(true));
    sanitizeClone(stage, route);
    tagComponents(stage, route);
    return stage;
  }

  function loadingLabel(route) {
    const label = document.createElement("span");
    label.className = "admin-qol-sr-only";
    label.dataset.adminShapeSkeletonLabel = "";
    label.textContent = assemblyFor(route).label;
    return label;
  }

  function preserveViewportState() {
    return {
      x: window.scrollX,
      y: window.scrollY,
      focused: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      mainScroll: mainElement()?.scrollTop || 0,
    };
  }

  function restoreViewportState(state) {
    if (!state) return;
    const main = mainElement();
    if (main && main.scrollTop !== state.mainScroll) main.scrollTop = state.mainScroll;
    if (window.scrollX !== state.x || window.scrollY !== state.y) window.scrollTo(state.x, state.y);
  }

  function renderPage(route = activeRoute(), options = {}) {
    const main = mainElement();
    const overlay = pageOverlay(main);
    if (!(main instanceof HTMLElement) || !(overlay instanceof HTMLElement)) return null;

    const viewportState = preserveViewportState();
    const loadedGeometry = componentGeometry(main, route);
    const generation = ++pageGeneration;
    overlay.replaceChildren(clonePage(main, route, overlay), loadingLabel(route));
    overlay.dataset.adminShapeSkeleton = "page";
    overlay.dataset.adminShapeSkeletonRoute = route;
    overlay.dataset.adminShapeSkeletonGeneration = String(generation);
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.setAttribute("aria-label", assemblyFor(route).label);
    if (options.show !== false) overlay.hidden = false;
    main.setAttribute("aria-busy", "true");
    main.dataset.adminShapeLoadingRoute = route;
    const shownAt = Date.now();

    window.requestAnimationFrame(() => restoreViewportState(viewportState));

    const controller = {
      route,
      overlay,
      generation,
      loadedGeometry,
      measureLoaded: () => componentGeometry(main, route),
      measureSkeleton: () => componentGeometry(overlay.querySelector("[data-admin-shape-skeleton-stage]"), route),
      hide: (hideOptions = {}) => hidePage({ ...hideOptions, controller, shownAt, viewportState }),
    };
    activePageController = controller;
    if (Number.isFinite(options.autoHideMs)) {
      window.setTimeout(() => controller.hide(), Math.max(MIN_VISIBLE_MS, options.autoHideMs));
    }
    return controller;
  }

  function hidePage(options = {}) {
    const controller = options.controller || activePageController;
    const overlay = controller?.overlay || document.querySelector(PAGE_OVERLAY_SELECTOR);
    const main = mainElement();
    if (!(overlay instanceof HTMLElement)) return;
    const generation = controller?.generation;
    const shownAt = options.shownAt || 0;
    const delay = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
    window.setTimeout(() => {
      if (generation && overlay.dataset.adminShapeSkeletonGeneration !== String(generation)) return;
      overlay.hidden = true;
      main?.removeAttribute("aria-busy");
      if (main) delete main.dataset.adminShapeLoadingRoute;
      restoreViewportState(options.viewportState);
      if (activePageController?.generation === generation) activePageController = null;
    }, delay);
  }

  function renderSurface(route, target, options = {}) {
    if (!(target instanceof HTMLElement)) return null;
    activeSurfaceController?.hide?.({ immediate: true });
    const viewportState = preserveViewportState();
    const computedPosition = getComputedStyle(target).position;
    if (computedPosition === "static") target.dataset.adminShapeSkeletonHost = "true";

    const overlay = document.createElement("div");
    overlay.className = "admin-shape-surface-overlay";
    overlay.dataset.adminShapeSurfaceOverlay = route;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-label", assemblyFor(route).label);

    const stage = target.cloneNode(true);
    stage.removeAttribute("data-admin-shape-skeleton-host");
    stage.classList.add("admin-shape-skeleton-stage");
    stage.dataset.adminShapeSkeletonStage = "surface";
    sanitizeClone(stage, route);
    tagComponents(stage, route);
    overlay.append(stage, loadingLabel(route));
    const loadedGeometry = componentGeometry(target, route);
    target.append(overlay);
    target.setAttribute("aria-busy", "true");
    const shownAt = Date.now();

    const controller = {
      route,
      target,
      overlay,
      loadedGeometry,
      measureLoaded: () => loadedGeometry,
      measureSkeleton: () => componentGeometry(stage, route),
      hide(hideOptions = {}) {
        const delay = hideOptions.immediate ? 0 : Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
        window.setTimeout(() => {
          overlay.remove();
          target.removeAttribute("aria-busy");
          delete target.dataset.adminShapeSkeletonHost;
          restoreViewportState(viewportState);
          if (activeSurfaceController?.overlay === overlay) activeSurfaceController = null;
        }, delay);
      },
    };
    activeSurfaceController = controller;
    if (Number.isFinite(options.autoHideMs)) {
      window.setTimeout(() => controller.hide(), Math.max(MIN_VISIBLE_MS, options.autoHideMs));
    }
    return controller;
  }

  function refreshIndicator() {
    const main = mainElement();
    if (!(main instanceof HTMLElement)) return null;
    let indicator = main.querySelector(":scope > .admin-shape-refresh-indicator");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "admin-shape-refresh-indicator";
      indicator.setAttribute("role", "status");
      indicator.setAttribute("aria-live", "polite");
      indicator.hidden = true;
      main.append(indicator);
    }
    return indicator;
  }

  function hasUsableData() {
    const main = mainElement();
    if (!(main instanceof HTMLElement) || main.getAttribute("aria-busy") === "true") return false;
    return meaningfulChildren(main, main.querySelector(PAGE_OVERLAY_SELECTOR)).length > 0;
  }

  function beginRefresh(label = "Refreshing administrator data") {
    if (!hasUsableData()) return null;
    const indicator = refreshIndicator();
    if (!indicator) return null;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    indicator.textContent = label;
    indicator.dataset.state = "refreshing";
    indicator.hidden = false;
    return indicator;
  }

  function endRefresh(label = "Administrator data updated") {
    const indicator = refreshIndicator();
    if (!indicator || indicator.hidden) return;
    indicator.textContent = label;
    indicator.dataset.state = "updated";
    refreshTimer = window.setTimeout(() => {
      indicator.hidden = true;
      indicator.textContent = "";
      delete indicator.dataset.state;
    }, 1100);
  }

  function installModelRefreshBridge() {
    if (modelBridgeInstalled) return true;
    const feature = window.Econovaria?.features?.adminOverviewTerminal;
    if (!feature) return false;
    const descriptor = Object.getOwnPropertyDescriptor(feature, "currentModel");
    if (!descriptor || descriptor.configurable === false || typeof descriptor.set !== "function") return false;
    const originalGet = descriptor.get?.bind(feature);
    const originalSet = descriptor.set.bind(feature);
    Object.defineProperty(feature, "currentModel", {
      configurable: true,
      enumerable: descriptor.enumerable !== false,
      get() {
        return originalGet ? originalGet() : undefined;
      },
      set(value) {
        const indicator = beginRefresh();
        originalSet(value);
        if (indicator) window.requestAnimationFrame(() => endRefresh());
      },
    });
    modelBridgeInstalled = true;
    return true;
  }

  function renderExistingOverlay() {
    const overlay = document.querySelector(PAGE_OVERLAY_SELECTOR);
    if (!(overlay instanceof HTMLElement) || overlay.hidden) return false;
    renderPage(activeRoute(), { show: true });
    return true;
  }

  function onDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const nav = target?.closest("[data-admin-section]");
    if (nav && nav.getAttribute("aria-disabled") !== "true" && !(nav instanceof HTMLButtonElement && nav.disabled)) {
      const route = ROUTE_BY_SECTION[text(nav.getAttribute("data-admin-section"))] || "overview";
      window.requestAnimationFrame(() => renderPage(route, { show: true }));
      return;
    }

    const action = target?.closest("[data-admin-terminal-action]")?.getAttribute("data-admin-terminal-action");
    const accountRoute = ROUTE_BY_ACCOUNT_ACTION[action];
    if (accountRoute) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => renderPage(accountRoute, { show: true, autoHideMs: ACCOUNT_AUTO_HIDE_MS }));
      });
    }
  }

  function boot() {
    if (mainElement()) {
      renderExistingOverlay();
      installModelRefreshBridge();
      return;
    }
    if (bootFrames >= MAX_BOOT_FRAMES) return;
    bootFrames += 1;
    window.requestAnimationFrame(boot);
  }

  document.addEventListener("click", onDocumentClick, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  window.EconovariaAdminShapeSkeletons = Object.freeze({
    routes: Object.freeze(Object.keys(ROUTE_ASSEMBLIES)),
    routeMatrix: ROUTE_ASSEMBLIES,
    activeRoute,
    renderPage,
    hidePage,
    renderSurface,
    beginRefresh,
    endRefresh,
    measureLoaded(route = activeRoute()) {
      return componentGeometry(mainElement(), route);
    },
    measureSkeleton() {
      return activePageController?.measureSkeleton?.() || {};
    },
    activePageController() {
      return activePageController;
    },
    activeSurfaceController() {
      return activeSurfaceController;
    },
  });
})();
