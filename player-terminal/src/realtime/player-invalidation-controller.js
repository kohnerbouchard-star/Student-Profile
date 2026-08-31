import { PlayerApi } from "../api/player-api.js";
import { resolveCapabilities } from "../api/capabilities.js";
import { resourceFreshnessMs, validInvalidationResources } from "../api/freshness.js";
import { isResourceInvalidated, markResourceInvalidations } from "../api/invalidation-registry.js";
import { dependentResourcesForRoute, SHELL_OPTIONAL_RESOURCES, SHELL_REQUIRED_RESOURCES, resourcesForRoute } from "../api/resource-plan.js";
import { updateStoreFromSnapshot } from "../core/store.js";

export const DEFAULT_PLAYER_INVALIDATION_EVENT = "econovaria:player-resources-invalidated";
const DEFAULT_CHECK_INTERVAL_MS = 1000;
const DEFAULT_OPTIONAL_MULTIPLIER = 3;
const DEFAULT_SHELL_MULTIPLIER = 2;
const MAX_BATCH = 8;
const SPECIALIZED_RUNTIME_RESOURCES = new Set(["storyDeliveries"]);

export function normalizePlayerInvalidationEvent(detail, currentGameSessionId = "") {
  const body = detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
  const targetGameSessionId = String(body.gameSessionId || "").trim();
  const activeGameSessionId = String(currentGameSessionId || "").trim();
  if (targetGameSessionId && activeGameSessionId && targetGameSessionId !== activeGameSessionId) return [];
  const requested = Array.isArray(body.resources) ? body.resources : body.resource ? [body.resource] : [];
  return validInvalidationResources(requested).slice(0, 20);
}

export function resourcesVisibleOnRoute(route, data) {
  const plan = resourcesForRoute(route);
  const dependent = data === undefined
    ? (Array.isArray(plan.dependent) ? plan.dependent : [])
    : dependentResourcesForRoute(route, data);
  return new Set([...SHELL_REQUIRED_RESOURCES, ...SHELL_OPTIONAL_RESOURCES, ...plan.required, ...plan.optional, ...dependent]);
}

export function shouldRefreshCurrentRoute(route, resources, data) {
  const visible = resourcesVisibleOnRoute(route, data);
  return validInvalidationResources(resources).some((resource) => visible.has(resource));
}

function isUnavailableResource(state, resource) {
  const status = state?.data?.resourceStatus?.[resource];
  return status?.state === "unavailable" && status?.code === "CAPABILITY_UNAVAILABLE";
}

function isUserInteracting(mount, terminalState, documentRef) {
  if (terminalState?.modal) return true;
  if (mount?.querySelector?.("[data-player-live-refresh-pause][open], [data-player-live-refresh-active][open]")) return true;
  const active = documentRef?.activeElement;
  return Boolean(active && mount?.contains?.(active) && active.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function routeCadenceMs(route, resource, config = {}) {
  const base = resourceFreshnessMs(resource, config.resourceFreshnessMs);
  if (!(base > 0)) return Infinity;
  const plan = resourcesForRoute(route);
  if (plan.required.includes(resource)) return base;
  if (plan.optional.includes(resource)) return base * Math.max(1, Number(config.playerLiveOptionalMultiplier) || DEFAULT_OPTIONAL_MULTIPLIER);
  if ((plan.dependent || []).includes(resource)) return base * Math.max(1, Number(config.playerLiveOptionalMultiplier) || DEFAULT_OPTIONAL_MULTIPLIER);
  if (SHELL_REQUIRED_RESOURCES.includes(resource)) {
    if (resource === "dashboard" && route === "dashboard") return base;
    return base * Math.max(1, Number(config.playerLiveShellMultiplier) || DEFAULT_SHELL_MULTIPLIER);
  }
  if (SHELL_OPTIONAL_RESOURCES.includes(resource)) return base * Math.max(1, Number(config.playerLiveShellMultiplier) || DEFAULT_SHELL_MULTIPLIER);
  return Infinity;
}

function mergeResourceData(currentData, patch, config) {
  const data = { ...currentData, ...patch };
  if (patch?.resourceStatus) data.resourceStatus = { ...(currentData?.resourceStatus || {}), ...patch.resourceStatus };
  if (patch?.session || patch?.dashboard) data.capabilities = resolveCapabilities({ config, session: data.session, dashboard: data.dashboard });
  return data;
}

export function installPlayerInvalidationController({ terminal, config, mount = globalThis.document?.getElementById?.("playerTerminal") || null, eventTarget = globalThis, documentRef = globalThis.document, debounceMs = 120, checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS }) {
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.navigate !== "function") throw new TypeError("Realtime invalidation requires an active player terminal.");

  const api = new PlayerApi(config);
  const eventName = String(config?.resourceInvalidationEvent || DEFAULT_PLAYER_INVALIDATION_EVENT);
  const pending = new Set();
  const observedAt = new Map();
  const observedReference = new Map();
  let timer = 0;
  let pollTimer = 0;
  let refreshInFlight = false;
  let destroyed = false;
  let lastRoute = "";

  function setLiveState(patch) {
    const snapshot = terminal.getState();
    const current = snapshot?.live || {};
    const entries = Object.entries(patch || {});
    if (!entries.length || entries.every(([key, value]) => Object.is(current[key], value))) return false;
    return updateStoreFromSnapshot(snapshot, (state) => ({ ...state, live: { ...(state.live || {}), ...patch } }));
  }

  function canRefreshNow() {
    if (documentRef?.visibilityState === "hidden") return false;
    if (globalThis.navigator && globalThis.navigator.onLine === false) return false;
    return true;
  }

  function observeState(state = terminal.getState()) {
    if (state?.status !== "ready") return;
    const now = Date.now();
    const visible = resourcesVisibleOnRoute(state.route, state.data);
    for (const resource of visible) {
      const reference = state.data?.[resource];
      if (reference !== undefined && observedReference.get(resource) !== reference) {
        observedReference.set(resource, reference);
        observedAt.set(resource, now);
      }
    }
    if (state.route !== lastRoute) {
      lastRoute = state.route;
      const plan = resourcesForRoute(state.route);
      const dependent = dependentResourcesForRoute(state.route, state.data);
      for (const resource of [...plan.required, ...plan.optional, ...dependent]) if (!observedAt.has(resource)) observedAt.set(resource, now);
    }
  }

  function dueResources(state, now = Date.now()) {
    const result = [];
    for (const resource of resourcesVisibleOnRoute(state.route, state.data)) {
      if (SPECIALIZED_RUNTIME_RESOURCES.has(resource)) continue;
      if (!validInvalidationResources([resource]).length || isUnavailableResource(state, resource)) continue;
      if (pending.has(resource) || isResourceInvalidated(resource)) { result.push(resource); continue; }
      const cadence = routeCadenceMs(state.route, resource, config);
      if (!Number.isFinite(cadence)) continue;
      const last = Number(observedAt.get(resource) || 0);
      if (last > 0 && now - last >= cadence) result.push(resource);
    }
    return result.slice(0, MAX_BATCH);
  }

  function schedule(delay = debounceMs) {
    if (destroyed || timer) return;
    timer = globalThis.setTimeout(flush, Math.max(0, Number(delay) || 0));
  }

  async function refreshResources(resources) {
    const targets = [...new Set(resources)].filter(Boolean);
    if (!targets.length) return;
    refreshInFlight = true;
    setLiveState({ status: "updating" });
    try {
      api.setSession(config);
      const result = await api.refreshResources(targets);
      const invalidSession = Object.values(result.errors || {}).find((error) => Number(error?.status) === 401);
      if (invalidSession) { await terminal.refresh?.(); return; }
      const snapshot = terminal.getState();
      if (snapshot?.status !== "ready") return;
      if (isUserInteracting(mount, snapshot, documentRef)) {
        targets.forEach((resource) => pending.add(resource));
        schedule(900);
        return;
      }
      const data = mergeResourceData(snapshot.data, result.data || {}, config);
      updateStoreFromSnapshot(snapshot, (state) => ({ ...state, data }));
      const firstError = Object.values(result.errors || {})[0];
      const receivedData = Object.keys(result.data || {}).some((key) => key !== "resourceStatus");
      if (firstError && !receivedData) throw firstError;
      const now = Date.now();
      for (const resource of targets) { pending.delete(resource); observedAt.set(resource, now); }
      observeState();
      setLiveState({ status: Object.keys(result.errors || {}).length ? "reconnecting" : "connected", updatedAt: now, error: Object.keys(result.errors || {}).length ? "partial_refresh" : "" });
    } catch (error) {
      const offline = globalThis.navigator && globalThis.navigator.onLine === false;
      setLiveState({ status: offline ? "offline" : "reconnecting", error: String(error?.code || error?.message || "refresh_failed") });
      if (!offline) schedule(Math.max(1500, Number(error?.retryAfterMs) || 0));
    } finally { refreshInFlight = false; }
  }

  function flush() {
    timer = 0;
    if (destroyed || refreshInFlight) return;
    const state = terminal.getState();
    observeState(state);
    if (state?.status !== "ready") return;
    if (!canRefreshNow()) { setLiveState({ status: "offline" }); return; }
    const resources = dueResources(state);
    if (!resources.length) { setLiveState({ status: "connected" }); return; }
    if (isUserInteracting(mount, state, documentRef)) { schedule(900); return; }
    void refreshResources(resources);
  }

  function handleInvalidation(event) {
    const resources = normalizePlayerInvalidationEvent(event?.detail, config?.gameSessionId).filter((resource) => !SPECIALIZED_RUNTIME_RESOURCES.has(resource));
    if (!resources.length) return;
    markResourceInvalidations(resources);
    resources.forEach((resource) => pending.add(resource));
    schedule();
  }

  function handleOnline() {
    setLiveState({ status: "reconnecting" });
    const state = terminal.getState();
    if (state?.status === "ready") resourcesForRoute(state.route).required.forEach((resource) => pending.add(resource));
    schedule(50);
  }
  function handleOffline() { setLiveState({ status: "offline" }); }
  function handleResume() {
    if (documentRef?.visibilityState === "visible") {
      setLiveState({ status: "reconnecting" });
      const state = terminal.getState();
      if (state?.status === "ready") resourcesForRoute(state.route).required.forEach((resource) => pending.add(resource));
      schedule(50);
    }
  }

  const MutationObserverCtor = globalThis.MutationObserver;
  const disclosureObserver = mount && typeof MutationObserverCtor === "function"
    ? new MutationObserverCtor((records) => {
      for (const record of records) {
        const details = record?.target;
        if (!details?.matches?.("details") || !details.querySelector?.("form[data-player-form]")) continue;
        details.toggleAttribute?.("data-player-live-refresh-active", details.open === true);
      }
    })
    : null;
  disclosureObserver?.observe?.(mount, { subtree: true, attributes: true, attributeFilter: ["open"] });

  const unsubscribe = terminal.subscribe?.((state) => { const previousRoute = lastRoute; observeState(state); if (state?.status === "ready" && previousRoute && state.route !== previousRoute) schedule(50); }) || (() => {});
  eventTarget.addEventListener(eventName, handleInvalidation);
  eventTarget.addEventListener("online", handleOnline);
  eventTarget.addEventListener("offline", handleOffline);
  eventTarget.addEventListener("hashchange", handleResume);
  documentRef?.addEventListener?.("visibilitychange", handleResume);
  pollTimer = globalThis.setInterval(() => schedule(0), Math.max(500, Number(checkIntervalMs) || DEFAULT_CHECK_INTERVAL_MS));
  setLiveState({ status: canRefreshNow() ? "connected" : "offline", updatedAt: Date.now(), error: "" });

  return { eventName, refreshNow(resources = null) { const state = terminal.getState(); if (state?.status !== "ready") return; const targets = resources ? validInvalidationResources(resources) : [...resourcesForRoute(state.route).required]; targets.forEach((resource) => pending.add(resource)); schedule(0); }, destroy() { destroyed = true; globalThis.clearTimeout(timer); globalThis.clearInterval(pollTimer); timer = 0; pollTimer = 0; disclosureObserver?.disconnect?.(); eventTarget.removeEventListener(eventName, handleInvalidation); eventTarget.removeEventListener("online", handleOnline); eventTarget.removeEventListener("offline", handleOffline); eventTarget.removeEventListener("hashchange", handleResume); documentRef?.removeEventListener?.("visibilitychange", handleResume); unsubscribe(); pending.clear(); observedAt.clear(); observedReference.clear(); } };
}
