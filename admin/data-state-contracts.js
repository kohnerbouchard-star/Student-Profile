(function initEconovariaAdminDataStateContracts() {
  "use strict";

  const MAIN_SELECTOR = ".admin-terminal-shell-main";
  const PANEL_SELECTOR = "[data-admin-data-state-panel]";
  const CANONICAL_STATES = Object.freeze([
    "loading",
    "loaded",
    "refreshing",
    "stale",
    "empty",
    "failed",
  ]);
  const STATE_SET = new Set(CANONICAL_STATES);
  const MAX_BOOT_FRAMES = 180;
  const ROUTE_ALIASES = Object.freeze({
    assignments: "contracts",
    assignment: "contracts",
    contracts: "contracts",
    market: "marketplace",
    marketplace: "marketplace",
    overview: "overview",
    attendance: "attendance",
    players: "players",
    store: "store",
    settings: "settings",
    logs: "logs",
    "account-profile": "account-profile",
    "account-settings": "account-settings",
    "account-notifications": "account-notifications",
    "account-security": "account-security",
    "account-help": "account-help",
    "account-games": "account-games",
  });
  const ROUTE_LABELS = Object.freeze({
    overview: "administrator overview",
    attendance: "attendance records",
    players: "player roster",
    contracts: "Contracts",
    store: "Store catalog",
    marketplace: "Marketplace",
    settings: "administrator Settings",
    logs: "audit logs",
    "account-profile": "administrator profile",
    "account-settings": "account preferences",
    "account-notifications": "administrator notifications",
    "account-security": "security and sessions",
    "account-help": "administrator help",
    "account-games": "game sessions",
  });

  const records = new Map();
  const requestRouteById = new Map();
  let bootFrames = 0;
  let pendingRouteOverride = "";

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeRoute(value) {
    const key = text(value).toLowerCase().replace(/[_\s]+/g, "-");
    return ROUTE_ALIASES[key] || key || "overview";
  }

  function routeLabel(route) {
    return ROUTE_LABELS[route] || route.replace(/-/g, " ") || "administrator data";
  }

  function mainElement() {
    return document.querySelector(MAIN_SELECTOR);
  }

  function activeRoute() {
    if (pendingRouteOverride) return pendingRouteOverride;
    const apiRoute = window.EconovariaAdminShapeSkeletons?.activeRoute?.();
    if (text(apiRoute)) return normalizeRoute(apiRoute);
    const current = [...document.querySelectorAll("[data-admin-section]")].find((node) => {
      return node.getAttribute("aria-current") === "page" ||
        node.getAttribute("aria-selected") === "true" ||
        node.classList.contains("active") ||
        node.classList.contains("is-active");
    });
    return normalizeRoute(current?.getAttribute("data-admin-section") || "overview");
  }

  function resolveRoute(detail = {}) {
    for (const candidate of [
      detail.route,
      detail.section,
      detail.page,
      detail.surface,
      detail.resource,
    ]) {
      if (text(candidate)) return normalizeRoute(candidate);
    }
    return activeRoute();
  }

  function recordFor(route) {
    const normalized = normalizeRoute(route);
    if (!records.has(normalized)) {
      records.set(normalized, {
        route: normalized,
        state: "loading",
        settled: false,
        pending: new Set(),
        cycle: null,
        message: "",
        updatedAt: 0,
      });
    }
    return records.get(normalized);
  }

  function currentModel() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel;
    return model && typeof model === "object" ? model : null;
  }

  function firstArray(...values) {
    return values.find((value) => Array.isArray(value)) || null;
  }

  function inferEmpty(route, detail = {}) {
    if (typeof detail.empty === "boolean") return detail.empty;
    if (typeof detail.hasData === "boolean") return !detail.hasData;
    for (const value of [detail.total, detail.totalCount, detail.itemCount, detail.rowCount]) {
      if (Number.isFinite(Number(value))) return Number(value) === 0;
    }

    const model = currentModel();
    if (!model) return null;
    if (route === "overview") return model.dashboard && typeof model.dashboard === "object" ? false : null;
    if (route === "players") {
      const rows = firstArray(model.players, model.roster, model.playerRows);
      return rows ? rows.length === 0 : null;
    }
    if (route === "contracts") {
      const rows = firstArray(model.contracts, model.assignments, model.contractRows);
      return rows ? rows.length === 0 : null;
    }
    if (route === "store") {
      const rows = firstArray(model.storeItems, model.store, model.catalog);
      return rows ? rows.length === 0 : null;
    }
    if (route === "attendance") {
      const rows = firstArray(
        model.attendanceRows,
        model.attendanceHistory,
        model.attendance,
        model.attendanceLedger,
      );
      return rows ? rows.length === 0 : null;
    }
    if (route === "logs") {
      const rows = firstArray(model.logs, model.auditLogs, model.logRows);
      return rows ? rows.length === 0 : null;
    }
    if (route === "marketplace") {
      const candidates = [
        model.assets,
        model.trades,
        model.events,
        model.market?.assets,
        model.market?.trades,
        model.market?.events,
      ].filter(Array.isArray);
      return candidates.length ? candidates.every((rows) => rows.length === 0) : null;
    }
    if (route === "settings") return model.settings && typeof model.settings === "object" ? false : null;
    if (route.startsWith("account-")) return false;
    return null;
  }

  function ensurePanel() {
    let panel = document.querySelector(PANEL_SELECTOR);
    if (panel instanceof HTMLElement) return panel;
    const preview = document.getElementById("adminPreview") || document.body;
    if (!(preview instanceof HTMLElement)) return null;
    panel = document.createElement("div");
    panel.className = "admin-data-state-panel";
    panel.dataset.adminDataStatePanel = "";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-atomic", "true");
    panel.hidden = true;
    const title = document.createElement("strong");
    title.dataset.adminDataStateTitle = "";
    const detail = document.createElement("span");
    detail.dataset.adminDataStateDetail = "";
    panel.append(title, detail);
    preview.append(panel);
    return panel;
  }

  function clearRefreshIndicator() {
    const indicator = mainElement()?.querySelector(":scope > .admin-shape-refresh-indicator");
    if (!(indicator instanceof HTMLElement)) return;
    indicator.hidden = true;
    indicator.textContent = "";
    delete indicator.dataset.state;
  }

  function panelCopy(state, route, message) {
    const label = routeLabel(route);
    if (state === "stale") {
      return {
        title: "Showing last available data",
        detail: message || `The latest ${label} refresh failed. Existing data remains visible.`,
      };
    }
    if (state === "empty") {
      return {
        title: "No data yet",
        detail: message || `There are no ${label} to display.`,
      };
    }
    if (state === "failed") {
      return {
        title: "Data could not be loaded",
        detail: message || `The ${label} request failed. Try the operation again.`,
      };
    }
    return { title: "", detail: "" };
  }

  function updatePanel(state, route, message) {
    const panel = ensurePanel();
    if (!(panel instanceof HTMLElement)) return;
    if (!["stale", "empty", "failed"].includes(state)) {
      panel.hidden = true;
      panel.removeAttribute("data-state");
      panel.setAttribute("role", "status");
      return;
    }
    const copy = panelCopy(state, route, message);
    panel.dataset.state = state;
    panel.querySelector("[data-admin-data-state-title]")?.replaceChildren(copy.title);
    panel.querySelector("[data-admin-data-state-detail]")?.replaceChildren(copy.detail);
    panel.setAttribute("role", state === "failed" ? "alert" : "status");
    panel.hidden = false;
  }

  function applyState(record, state, options = {}) {
    if (!STATE_SET.has(state)) throw new TypeError(`Unsupported Admin data state: ${state}`);
    const previousState = record.state;
    record.state = state;
    record.message = text(options.message);
    record.updatedAt = Date.now();
    if (typeof options.settled === "boolean") record.settled = options.settled;

    if (record.route === activeRoute()) {
      const main = mainElement();
      if (main instanceof HTMLElement) {
        main.dataset.adminDataState = state;
        main.dataset.adminDataRoute = record.route;
        main.dataset.adminDataStateUpdatedAt = String(record.updatedAt);
        if (["loading", "refreshing"].includes(state)) main.setAttribute("aria-busy", "true");
        else main.removeAttribute("aria-busy");
      }

      if (state === "refreshing") {
        updatePanel(state, record.route, record.message);
        window.EconovariaAdminShapeSkeletons?.beginRefresh?.(`Refreshing ${routeLabel(record.route)}`);
      } else {
        if (previousState === "refreshing" && state === "loaded") {
          window.EconovariaAdminShapeSkeletons?.endRefresh?.(`${routeLabel(record.route)} updated`);
        } else {
          clearRefreshIndicator();
        }
        updatePanel(state, record.route, record.message);
      }
    }

    if (previousState !== state || options.forceEvent === true) {
      document.dispatchEvent(new CustomEvent("econovaria:admin-data-state-changed", {
        detail: Object.freeze({
          route: record.route,
          state,
          previousState,
          settled: record.settled,
          message: record.message,
          requestId: text(options.requestId),
          updatedAt: record.updatedAt,
        }),
      }));
    }
    return state;
  }

  function beginPageRead(detail) {
    const requestId = text(detail.requestId);
    if (!requestId) return;
    const route = resolveRoute(detail);
    const record = recordFor(route);
    requestRouteById.set(requestId, route);
    if (record.pending.size === 0) {
      record.cycle = {
        hadSettled: record.settled,
        committed: false,
        failed: false,
        emptySeen: false,
        hasDataSeen: false,
        message: "",
      };
    }
    record.pending.add(requestId);
    applyState(record, record.settled ? "refreshing" : "loading", {
      requestId,
      settled: record.settled,
    });
  }

  function finishPageRead(detail) {
    const requestId = text(detail.requestId);
    if (!requestId) return;
    const route = requestRouteById.get(requestId) || resolveRoute(detail);
    requestRouteById.delete(requestId);
    const record = recordFor(route);
    const cycle = record.cycle || {
      hadSettled: record.settled,
      committed: false,
      failed: false,
      emptySeen: false,
      hasDataSeen: false,
      message: "",
    };
    record.cycle = cycle;
    record.pending.delete(requestId);

    if (detail.phase === "committed") {
      cycle.committed = true;
      const explicitState = STATE_SET.has(detail.state) ? detail.state : "";
      if (explicitState === "stale") cycle.failed = true;
      else if (explicitState === "empty") cycle.emptySeen = true;
      else if (explicitState === "loaded") cycle.hasDataSeen = true;
      else {
        const empty = inferEmpty(route, detail);
        if (empty === true) cycle.emptySeen = true;
        if (empty === false) cycle.hasDataSeen = true;
      }
    } else {
      cycle.failed = true;
      cycle.message = text(detail.message || detail.error || detail.reason);
    }

    if (record.pending.size > 0) return;

    let nextState;
    let settled = record.settled;
    if (cycle.failed) {
      nextState = cycle.hadSettled ? "stale" : "failed";
      settled = cycle.hadSettled;
    } else if (cycle.committed) {
      const inferredEmpty = cycle.hasDataSeen
        ? false
        : cycle.emptySeen
        ? true
        : inferEmpty(route, detail);
      nextState = inferredEmpty === true ? "empty" : "loaded";
      settled = true;
    } else {
      nextState = cycle.hadSettled ? "stale" : "failed";
      settled = cycle.hadSettled;
    }

    record.cycle = null;
    applyState(record, nextState, {
      requestId,
      message: cycle.message,
      settled,
    });
  }

  function onRequestLifecycle(event) {
    const detail = event.detail && typeof event.detail === "object" ? event.detail : {};
    if (detail.pageRead !== true || !text(detail.requestId)) return;
    if (detail.phase === "started") beginPageRead(detail);
    else if (["committed", "failed", "cancelled"].includes(detail.phase)) finishPageRead(detail);
  }

  function adoptMountedRoute(detail = {}) {
    pendingRouteOverride = "";
    const route = resolveRoute(detail);
    const record = recordFor(route);
    if (!record.pending.size && !record.settled) {
      const empty = inferEmpty(route, detail);
      if (empty !== null) {
        applyState(record, empty ? "empty" : "loaded", { settled: true });
        return;
      }
    }
    applyState(record, record.state, { settled: record.settled, forceEvent: true });
  }

  function onDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const nav = target?.closest("[data-admin-section]");
    if (!nav || nav.getAttribute("aria-disabled") === "true") return;
    pendingRouteOverride = normalizeRoute(nav.getAttribute("data-admin-section") || "overview");
    const record = recordFor(pendingRouteOverride);
    window.requestAnimationFrame(() => {
      applyState(record, record.settled ? record.state : "loading", {
        settled: record.settled,
      });
    });
  }

  function boot() {
    const main = mainElement();
    if (!(main instanceof HTMLElement)) {
      if (bootFrames >= MAX_BOOT_FRAMES) return;
      bootFrames += 1;
      window.requestAnimationFrame(boot);
      return;
    }
    const route = activeRoute();
    const record = recordFor(route);
    const overlay = main.querySelector(":scope > .admin-qol-page-skeleton");
    const mountedAndIdle = main.getAttribute("aria-busy") !== "true" &&
      (!(overlay instanceof HTMLElement) || overlay.hidden);
    const empty = mountedAndIdle ? inferEmpty(route) : null;
    if (empty !== null) applyState(record, empty ? "empty" : "loaded", { settled: true });
    else applyState(record, "loading", { settled: false });
  }

  document.addEventListener("econovaria:admin-request-lifecycle", onRequestLifecycle);
  document.addEventListener("econovaria:admin-route-mounted", (event) => {
    window.requestAnimationFrame(() => adoptMountedRoute(event.detail || {}));
  });
  document.addEventListener("econovaria:admin-account-surface-ready", (event) => {
    window.requestAnimationFrame(() => adoptMountedRoute(event.detail || {}));
  });
  document.addEventListener("click", onDocumentClick, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  window.EconovariaAdminDataStates = Object.freeze({
    states: CANONICAL_STATES,
    activeRoute,
    getState(route = activeRoute()) {
      const record = recordFor(route);
      return Object.freeze({
        route: record.route,
        state: record.state,
        settled: record.settled,
        pendingCount: record.pending.size,
        message: record.message,
        updatedAt: record.updatedAt,
      });
    },
    setState(route, state, options = {}) {
      return applyState(recordFor(route), state, options);
    },
    snapshot() {
      return Object.freeze([...records.values()].map((record) => Object.freeze({
        route: record.route,
        state: record.state,
        settled: record.settled,
        pendingCount: record.pending.size,
        message: record.message,
        updatedAt: record.updatedAt,
      })));
    },
  });
})();
