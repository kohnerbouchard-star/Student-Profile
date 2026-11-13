import { resourcesForRoute, SHELL_OPTIONAL_RESOURCES } from "../api/resource-plan.js";
import { PLAYER_ENDPOINTS, resolveEndpoint } from "../api/endpoints.js";
import { ApiConnectionPendingError, normalizeApiError } from "../api/errors.js";
import { isEndpointEnabled, isRouteEnabled, resolveCapabilities } from "../api/capabilities.js";
import { normalizeWritePayload } from "../api/payload-normalizer.js";
import { applyPlayerSessionHandoff, dispatchHostEvent, resolveExistingPlayerSession } from "../api/session-handoff.js";
import { createEmptyReadModels } from "../data/empty-read-models.js";
import { focusFirstInteractive, setButtonProcessing } from "./dom.js";
import { navigate } from "./router.js";

// One owner for request generations, session admission and delayed-effect retirement.
// Presentation and DOM event routing stay in the terminal composition root.
export function createPlayerTerminalLifecycle({ api, store, config, freshness, mount, showToast, openConnectionModal }) {
  const routeRequestVersions = new Map();
  let terminalLoadVersion = 0;
  let destroyed = false, publishedSession = null;
  const deferredEffects = new Set(), pendingControls = new Set(), frames = new Set();
  const controlOwners = new WeakMap();
  const capture = (keys = []) => freshness?.capture(keys);
  const current = (ticket) => !freshness || (!destroyed && freshness.isCurrent(ticket));
  const admitted = (value) => !freshness || current(freshness.ticketFor(value));
  // A transport/cache admission cannot settle a snapshot its publisher discards.
  function settlePublished(result, data = result.data, errors = result.errors || {}) {
    if (!freshness) return true;
    const ticket = freshness.ticketFor(result);
    if (!current(ticket)) return false;
    for (const [key] of ticket.resources) {
      if (!errors[key] && data?.resourceStatus?.[key]?.state === "ready") freshness.settle(ticket, key);
    }
    return true;
  }
  const obsolete = (error) => freshness && ["REQUEST_ABORTED", "REQUEST_SUPERSEDED"].includes(error?.code);
  function deferEffect(callback, delay) {
    const ticket = capture();
    const id = setTimeout(() => { deferredEffects.delete(id); if (current(ticket)) callback(); }, delay);
    if (freshness) deferredEffects.add(id);
  }
  function queueFrame(callback) {
    const ticket = capture();
    const id = requestAnimationFrame(() => { frames.delete(id); if (current(ticket)) callback(); });
    if (freshness) frames.add(id);
  }
  function focusCurrent(root) {
    if (!freshness) return focusFirstInteractive(root);
    queueFrame(() => root?.querySelector("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus());
  }
  function retireEffects(reset = true) {
    if (!freshness) return;
    if (reset) freshness.reset();
    for (const id of deferredEffects) clearTimeout(id);
    deferredEffects.clear();
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    for (const restore of pendingControls) restore();
    pendingControls.clear();
    mount.querySelector(".player-terminal-toast")?.remove();
  }


  function handleInvalidSession(error) {
    retireEffects();
    terminalLoadVersion += 1;
    const detail = {
      reason: "invalid_player_session",
      status: Number(error?.status || 401),
      code: String(error?.code || "SESSION_INVALID"),
      requestId: String(error?.requestId || "")
    };
    const ticket = capture();
    if (typeof config.onSessionInvalid === "function") config.onSessionInvalid(detail);
    dispatchHostEvent(config.sessionInvalidEvent, detail);
    if (!current(ticket)) return;
    store.setState({ status: "waiting", error: null, modal: null, routeLoading: {}, routeErrors: {} });
  }

  async function loadRouteData(route, { force = false, retrySuperseded = true } = {}) {
    if (freshness && destroyed) return;
    const snapshot = store.getState();
    const loadVersion = terminalLoadVersion;
    const plan = resourcesForRoute(route);
    const ticket = capture([...plan.required, ...plan.optional, ...(plan.dependent || [])]);
    const lifecycle = capture();
    if (snapshot.status !== "ready") return;
    if (!isRouteEnabled(snapshot.data.capabilities, route)) {
      if (route !== "dashboard") navigate("dashboard");
      showToast("That section is not enabled for the current game.", "amber");
      return;
    }

    const version = (routeRequestVersions.get(route) || 0) + 1;
    routeRequestVersions.set(route, version);
    store.setState((state) => ({
      ...state,
      routeLoading: { ...state.routeLoading, [route]: true },
      routeErrors: { ...state.routeErrors, [route]: null }
    }));

    try {
      const result = await api.loadRoute(route, { force });
      if (routeRequestVersions.get(route) !== version || terminalLoadVersion !== loadVersion || !current(ticket)) return;
      if (!admitted(result)) return;
      store.setState((state) => {
        const data = { ...state.data, ...result.data, ...(freshness ? { resourceStatus: { ...state.data?.resourceStatus, ...result.data.resourceStatus } } : {}) };
        if (result.data.session || result.data.dashboard) {
          data.capabilities = resolveCapabilities({ config, session: data.session, dashboard: data.dashboard });
        }
        return {
          ...state,
          data,
          routeLoading: { ...state.routeLoading, [route]: false },
          routeErrors: { ...state.routeErrors, [route]: null }
        };
      });
      settlePublished(result);
    } catch (error) {
      // The later hash listener can invalidate this route in the same dispatch.
      if (error?.code === "REQUEST_SUPERSEDED" && retrySuperseded && current(lifecycle)
        && terminalLoadVersion === loadVersion && routeRequestVersions.get(route) === version && store.getState().route === route) {
        return loadRouteData(route, { force, retrySuperseded: false });
      }
      if (obsolete(error)) return;
      if (routeRequestVersions.get(route) !== version || terminalLoadVersion !== loadVersion || !current(ticket)) return;
      if (Number(error?.status) === 401) {
        handleInvalidSession(error);
        return;
      }
      store.setState((state) => ({
        ...state,
        routeLoading: { ...state.routeLoading, [route]: false },
        routeErrors: { ...state.routeErrors, [route]: error }
      }));
    } finally {
      if (freshness && current(lifecycle) && terminalLoadVersion === loadVersion && routeRequestVersions.get(route) === version) {
        store.setState((state) => ({ ...state, routeLoading: { ...state.routeLoading, [route]: false } }));
      }
    }
  }

  async function loadData({ retrySuperseded = true } = {}) {
    if (freshness && destroyed) return;
    const loadVersion = ++terminalLoadVersion;
    if (!config.usePreviewData) {
      const existingSession = await resolveExistingPlayerSession(config);
      if (terminalLoadVersion !== loadVersion) return;
      if (!existingSession) {
        store.setState({ status: "waiting", error: null, modal: null });
        const detail = { reason: "missing_player_session", terminal: "player" };
        if (typeof config.onSessionRequired === "function") config.onSessionRequired(detail);
        dispatchHostEvent(config.sessionRequiredEvent, detail);
        return;
      }
      applyPlayerSessionHandoff(config, existingSession);
      const previousSession = capture();
      api.setSession(existingSession);
      if (!current(previousSession)) { retireEffects(false); store.setState({ status: "loading", data: null }); }
    }

    store.setState({ status: "loading", error: null, modal: null, routeLoading: {}, routeErrors: {} });
    const lifecycle = capture();
    const ticket = capture(["session", "dashboard", ...SHELL_OPTIONAL_RESOURCES]);
    try {
      const shellData = await api.bootstrap({ force: true });
      if (terminalLoadVersion !== loadVersion) return;
      if (!admitted(shellData)) throw Object.assign(new Error("Bootstrap superseded."), { code: "REQUEST_SUPERSEDED" });
      publishedSession = capture();
      const data = { ...createEmptyReadModels(), ...shellData };
      const requestedRoute = store.getState().route;
      const route = isRouteEnabled(data.capabilities, requestedRoute) ? requestedRoute : "dashboard";
      if (route !== requestedRoute) navigate(route);
      store.setState((state) => ({ ...state, status: "ready", route, data, error: null }));
      if (!settlePublished(shellData, shellData)) return;
      await loadRouteData(route);
    } catch (error) {
      if (terminalLoadVersion !== loadVersion || !current(lifecycle)) return;
      if (error?.code === "REQUEST_SUPERSEDED" && !current(publishedSession)) {
        if (retrySuperseded) return loadData({ retrySuperseded: false });
        store.setState({ status: "error", error: normalizeApiError(error) });
        return;
      }
      if (!current(ticket) || obsolete(error)) return;
      if (!config.usePreviewData && Number(error?.status) === 401) {
        handleInvalidSession(error);
        return;
      }
      store.setState({ status: "error", error: normalizeApiError(error) });
    } finally {
      if (freshness && current(lifecycle) && current(publishedSession) && terminalLoadVersion === loadVersion && store.getState().status === "loading" && store.getState().data) {
        store.setState({ status: "ready" });
      }
    }
  }

  async function connectSession(session) {
    if (freshness && destroyed) return;
    if (!applyPlayerSessionHandoff(config, session)) {
      throw new TypeError("connectSession requires a player session token.");
    }
    const previousSession = capture();
    api.setSession(config);
    if (!current(previousSession)) { retireEffects(false); store.setState({ status: "loading", data: null }); }
    return loadData();
  }

  async function refreshResources(resourceKeys) {
    if (freshness && destroyed) return;
    const keys = [...new Set((Array.isArray(resourceKeys) ? resourceKeys : []).filter((key) => typeof key === "string" && key))];
    if (!keys.length) return { data: {}, errors: {}, resourceStatus: {} };
    api.setSession(config);
    let ticket = capture();
    let result;
    try {
      const pending = api.refreshResources(keys);
      ticket = capture(keys);
      result = await pending;
      if (freshness) freshness.assertCurrent(freshness.ticketFor(result));
      if (!current(ticket)) return;
    } catch (error) { freshness?.assertCurrent(ticket); throw error; }
    const invalidSession = Object.values(result.errors || {}).find((error) => Number(error?.status) === 401);
    if (invalidSession) {
      handleInvalidSession(invalidSession);
      throw invalidSession;
    }
    store.setState((state) => {
      const { resourceStatus: refreshedStatus = {}, ...resources } = result.data || {};
      const data = {
        ...state.data,
        ...resources,
        resourceStatus: {
          ...(state.data?.resourceStatus || {}),
          ...refreshedStatus,
        },
      };
      if (resources.session || resources.dashboard) {
        data.capabilities = resolveCapabilities({ config, session: data.session, dashboard: data.dashboard });
      }
      return { ...state, data };
    });
    if (!settlePublished(result)) return;
    return result;
  }

  async function executeEndpoint(endpointKey, payload = {}, params = {}, button = null) {
    if (freshness && destroyed) return null;
    const endpoint = PLAYER_ENDPOINTS[endpointKey];
    if (!endpoint) throw new Error(`Unknown endpoint ${endpointKey}`);
    const capabilities = store.getState().data?.capabilities;
    if (!isEndpointEnabled(capabilities, endpointKey)) {
      showToast("This action is not enabled for the current game.", "amber");
      return null;
    }

    let normalizedPayload;
    try {
      normalizedPayload = normalizeWritePayload(endpointKey, payload);
    } catch (error) {
      showToast(error?.message || "Check the entered information and try again.", "red");
      return null;
    }
    const path = resolveEndpoint(endpoint, params);
    if (freshness && button) controlOwners.get(button)?.();
    const resetButton = setButtonProcessing(button, "Processing");
    const restoreButton = (label) => {
      if (freshness && button && controlOwners.get(button) !== restoreButton) return;
      resetButton(label);
      if (label === undefined) {
        pendingControls.delete(restoreButton);
        if (freshness && button) controlOwners.delete(button);
      }
    };
    if (freshness && button) controlOwners.set(button, restoreButton);
    const lifecycle = capture();
    let refreshTicket = lifecycle;
    if (freshness) pendingControls.add(restoreButton);

    const event = new CustomEvent("econovaria:player-api-request", {
      bubbles: true,
      cancelable: false,
      detail: { endpointKey, method: endpoint.method, path, payload: normalizedPayload, params }
    });
    mount.dispatchEvent(event);

    try {
      const operation = await api.execute(endpointKey, normalizedPayload, params);
      if (!current(lifecycle)) return null;
      restoreButton("Completed");
      const pending = operation.invalidatedResources.length
        ? api.refreshResources(operation.invalidatedResources)
        : { data: {}, errors: {} };
      refreshTicket = capture(operation.invalidatedResources);
      const refresh = operation.invalidatedResources.length ? await pending : pending;
      if (!current(refreshTicket) || (operation.invalidatedResources.length && !admitted(refresh))) return null;
      const invalidSession = Object.values(refresh.errors).find((error) => Number(error?.status) === 401);
      if (invalidSession) {
        handleInvalidSession(invalidSession);
        return null;
      }
      store.setState((state) => {
        const data = { ...state.data, ...refresh.data, ...(freshness ? { resourceStatus: { ...state.data?.resourceStatus, ...refresh.data.resourceStatus } } : {}) };
        if (refresh.data.session || refresh.data.dashboard) {
          data.capabilities = resolveCapabilities({ config, session: data.session, dashboard: data.dashboard });
        }
        return { ...state, data };
      });
      if (operation.invalidatedResources.length && !settlePublished(refresh)) return null;
      const refreshIncomplete = Object.keys(refresh.errors).length > 0;
      showToast(
        refreshIncomplete ? "Action completed. Some information will refresh when the service is available." : "Action completed and current information refreshed.",
        refreshIncomplete ? "amber" : "green"
      );
      deferEffect(() => restoreButton(), 1200);
      return operation.result;
    } catch (error) {
      if (!current(refreshTicket) || obsolete(error)) { restoreButton(); return null; }
      if (error instanceof ApiConnectionPendingError) {
        restoreButton("Awaiting backend");
        openConnectionModal(error, button);
        deferEffect(() => restoreButton(), 1200);
        return null;
      }
      if (Number(error?.status) === 401) {
        restoreButton();
        handleInvalidSession(error);
        return null;
      }
      restoreButton();
      const retryDetail = Number(error?.status) === 429 && Number(error?.retryAfterMs) > 0
        ? ` Try again in ${Math.max(1, Math.ceil(error.retryAfterMs / 1000))} seconds.`
        : "";
      showToast(`${error?.message || "The request failed."}${retryDetail}`, "red");
      return null;
    } finally {
      if (freshness && !current(refreshTicket)) restoreButton();
    }
  }

  return {
    capture,
    current,
    obsolete,
    deferEffect,
    queueFrame,
    focusCurrent,
    loadData,
    loadRouteData,
    connectSession,
    refreshResources,
    executeEndpoint,
    get destroyed() { return destroyed; },
    prepareForLogout() {
      if (freshness) { terminalLoadVersion++; retireEffects(); }
    },
    destroy() {
      retireEffects();
      destroyed = true;
      terminalLoadVersion += 1;
    }
  };
}
