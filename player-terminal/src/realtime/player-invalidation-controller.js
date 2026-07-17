import { validInvalidationResources } from "../api/freshness.js";
import {
  isResourceInvalidated,
  markResourceInvalidations
} from "../api/invalidation-registry.js";
import {
  SHELL_OPTIONAL_RESOURCES,
  SHELL_REQUIRED_RESOURCES,
  resourcesForRoute
} from "../api/resource-plan.js";

export const DEFAULT_PLAYER_INVALIDATION_EVENT = "econovaria:player-resources-invalidated";

export function normalizePlayerInvalidationEvent(detail, currentGameSessionId = "") {
  const body = detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
  const targetGameSessionId = String(body.gameSessionId || "").trim();
  const activeGameSessionId = String(currentGameSessionId || "").trim();
  if (targetGameSessionId && activeGameSessionId && targetGameSessionId !== activeGameSessionId) return [];
  const requested = Array.isArray(body.resources)
    ? body.resources
    : body.resource
      ? [body.resource]
      : [];
  return validInvalidationResources(requested).slice(0, 20);
}

export function resourcesVisibleOnRoute(route) {
  const plan = resourcesForRoute(route);
  return new Set([
    ...SHELL_REQUIRED_RESOURCES,
    ...SHELL_OPTIONAL_RESOURCES,
    ...plan.required,
    ...plan.optional
  ]);
}

export function shouldRefreshCurrentRoute(route, resources) {
  const visible = resourcesVisibleOnRoute(route);
  return validInvalidationResources(resources).some((resource) => visible.has(resource));
}

export function installPlayerInvalidationController({
  terminal,
  config,
  eventTarget = globalThis,
  documentRef = globalThis.document,
  debounceMs = 120
}) {
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.navigate !== "function") {
    throw new TypeError("Realtime invalidation requires an active player terminal.");
  }

  const eventName = String(config?.resourceInvalidationEvent || DEFAULT_PLAYER_INVALIDATION_EVENT);
  const pending = new Set();
  let timer = 0;
  let destroyed = false;

  function canRefreshNow() {
    if (documentRef?.visibilityState === "hidden") return false;
    if (globalThis.navigator && globalThis.navigator.onLine === false) return false;
    return true;
  }

  function schedule() {
    if (destroyed || timer) return;
    timer = globalThis.setTimeout(flush, Math.max(0, Number(debounceMs) || 0));
  }

  function flush() {
    timer = 0;
    if (destroyed) return;
    for (const resource of [...pending]) {
      if (!isResourceInvalidated(resource)) pending.delete(resource);
    }
    if (!pending.size || !canRefreshNow()) return;

    const state = terminal.getState();
    if (state?.status !== "ready") return;
    const resources = [...pending];
    if (!shouldRefreshCurrentRoute(state.route, resources)) return;

    resourcesVisibleOnRoute(state.route).forEach((resource) => pending.delete(resource));
    terminal.navigate(state.route);
  }

  function handleInvalidation(event) {
    const resources = normalizePlayerInvalidationEvent(event?.detail, config?.gameSessionId);
    if (!resources.length) return;
    markResourceInvalidations(resources);
    resources.forEach((resource) => pending.add(resource));
    schedule();
  }

  function handleResume() {
    schedule();
  }

  eventTarget.addEventListener(eventName, handleInvalidation);
  eventTarget.addEventListener("online", handleResume);
  eventTarget.addEventListener("hashchange", handleResume);
  documentRef?.addEventListener?.("visibilitychange", handleResume);

  return {
    eventName,
    destroy() {
      destroyed = true;
      globalThis.clearTimeout(timer);
      timer = 0;
      eventTarget.removeEventListener(eventName, handleInvalidation);
      eventTarget.removeEventListener("online", handleResume);
      eventTarget.removeEventListener("hashchange", handleResume);
      documentRef?.removeEventListener?.("visibilitychange", handleResume);
      pending.clear();
    }
  };
}
