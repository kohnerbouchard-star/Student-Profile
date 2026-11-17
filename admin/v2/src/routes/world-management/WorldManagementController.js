import {
  ADMIN_DATA_STATES,
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import {
  createAdminErrorEnvelope,
  isAdminErrorEnvelope,
  normalizeAdminError,
} from "../../core/error-envelope.js";
import {
  createWorldManagementApi,
  WORLD_ARRIVAL_CLASS_IDS,
} from "./WorldManagementApi.js";
import { WorldManagementRoute } from "./WorldManagementRoute.js";
import { normalizeWorldManagementReadModel } from "./WorldManagementReadModel.js";

export { normalizeWorldManagementReadModel } from "./WorldManagementReadModel.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASS_IDS = new Set(WORLD_ARRIVAL_CLASS_IDS);

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function successfulMutation(result) {
  if (result?.ok === false) throw result;
  return result;
}

function invalidMutation(code = "VALIDATION_FAILED") {
  return {
    ok: false,
    error: createAdminErrorEnvelope({ code, retryable: false }),
  };
}

/** Owns World reads, reviewed mutations, stale-state safety, and route lifecycle. */
export function createWorldManagementController({
  api = null,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  const worldApi = api || createWorldManagementApi({ selectedGameId });
  for (const method of [
    "readWorldManagement",
    "controlCampaign",
    "recoverEffect",
    "correctArrivalClass",
    "updateRouteState",
  ]) {
    if (typeof worldApi?.[method] !== "function") {
      throw new TypeError(`World Management API ${method} is unavailable.`);
    }
  }

  let state = createAdminDataState();
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  const activeMutations = new Set();
  const refreshTimers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("world.manage")) return state;
    worldApi.cancelWorldRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const batch = await worldApi.readWorldManagement();
      if (destroyed || version !== requestVersion || batch?.current === false) return state;
      const entries = Object.values(batch?.panels || {});
      if (entries.length === 0 || entries.every((entry) => entry?.status === "rejected")) {
        throw entries.find((entry) => entry?.reason)?.reason
          || createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
      }
      const model = normalizeWorldManagementReadModel(batch);
      state = resolveAdminDataLoad(state, model, {
        empty: model.isEmpty,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function nextRequestId(action) {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) {
      throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    }
    return `admin.world.${action}.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  function scheduleRefresh() {
    const timer = setTimeoutImpl?.(() => {
      refreshTimers.delete(timer);
      if (!destroyed) void load();
    }, 0);
    if (timer !== undefined && timer !== null) refreshTimers.add(timer);
  }

  function canMutate() {
    return !destroyed
      && hasPermission("world.manage")
      && state.status === ADMIN_DATA_STATES.READY;
  }

  async function mutate({ action, fingerprint, request, successTitle, successMessage }) {
    if (!canMutate()) return invalidMutation("CONFLICT");
    if (activeMutations.has(fingerprint)) return invalidMutation("CONFLICT");

    let requestId;
    try {
      requestId = nextRequestId(action);
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }

    activeMutations.add(fingerprint);
    try {
      const result = successfulMutation(await request(requestId));
      if (!destroyed) {
        notify({ tone: "success", title: successTitle, message: successMessage });
        scheduleRefresh();
      }
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeError(error);
      if (!destroyed) {
        notify({
          tone: "error",
          title: "World operation was not applied",
          message: envelope.userMessage,
        });
      }
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function controlCampaign(action) {
    const campaign = state.data?.campaign?.current;
    const normalized = String(action || "").trim().toLowerCase();
    if (!campaign?.campaignId || !["pause", "resume", "emergency_disable"].includes(normalized)) {
      return Promise.resolve(invalidMutation());
    }
    if (
      (normalized === "pause" && campaign.status !== "active")
      || (normalized === "resume" && campaign.status !== "paused")
      || (normalized === "emergency_disable" && campaign.status === "emergency_disabled")
    ) {
      return Promise.resolve(invalidMutation("CONFLICT"));
    }
    const label = normalized === "emergency_disable"
      ? "Emergency disable"
      : normalized === "pause" ? "Pause" : "Resume";
    return mutate({
      action: `campaign.${normalized}`,
      fingerprint: `campaign:${campaign.campaignId}:${campaign.revision}:${normalized}`,
      request: (requestId) => worldApi.controlCampaign({
        campaignId: campaign.campaignId,
        action: normalized,
        expectedRevision: campaign.revision,
        reason: `Administrator ${label.toLowerCase()} applied to the authoritative World campaign after review.`,
        idempotencyKey: requestId,
      }),
      successTitle: `${label} committed`,
      successMessage: "The authoritative campaign state was updated and will be refreshed.",
    });
  }

  function recoverEffect(effect) {
    if (!effect?.effectId || effect.status !== "failed") {
      return Promise.resolve(invalidMutation());
    }
    return mutate({
      action: "effect.recover",
      fingerprint: `effect:${effect.effectId}:${effect.attemptCount}`,
      request: (requestId) => worldApi.recoverEffect({
        effectId: effect.effectId,
        reason: "Administrator requested bounded recovery for a failed World effect after review.",
        requestId,
        idempotencyKey: requestId,
      }),
      successTitle: "Effect recovery requested",
      successMessage: "The failed World effect was submitted to the authoritative recovery contract.",
    });
  }

  function correctArrivalClass(assignment, classId) {
    const nextClass = String(classId || "").trim().toLowerCase();
    if (
      !assignment?.assignmentId
      || !CLASS_IDS.has(nextClass)
      || nextClass === assignment.classId
    ) {
      return Promise.resolve(invalidMutation());
    }
    return mutate({
      action: "arrival.correct",
      fingerprint: `arrival:${assignment.assignmentId}:${assignment.revision}:${nextClass}`,
      request: (requestId) => worldApi.correctArrivalClass({
        assignmentId: assignment.assignmentId,
        classId: nextClass,
        expectedRevision: assignment.revision,
        reason: "Administrator corrected the session-scoped Arrival Class after review.",
        requestId,
        idempotencyKey: requestId,
      }),
      successTitle: "Arrival Class corrected",
      successMessage: "The authoritative Arrival Class assignment was updated.",
    });
  }

  function toggleRoute(route) {
    const runtime = state.data?.runtime;
    if (!runtime || !route?.routeId) return Promise.resolve(invalidMutation());
    const reopening = route.status === "closed";
    const status = reopening ? "open" : "closed";
    const reason = reopening ? "recovery" : "war";
    return mutate({
      action: `route.${status}`,
      fingerprint: `route:${route.routeId}:${runtime.revision}:${status}`,
      request: (requestId) => worldApi.updateRouteState({
        routeIds: [route.routeId],
        status,
        reason,
        expectedRevision: runtime.revision,
        requestId,
        idempotencyKey: requestId,
      }),
      successTitle: reopening ? "Route reopened" : "Route closed",
      successMessage: "The authoritative World route state was updated.",
    });
  }

  function render() {
    if (destroyed) throw new Error("World Management controller has been destroyed.");
    currentView?.destroy?.();
    currentView = WorldManagementRoute({
      state,
      onRefresh: load,
      onCampaignAction: controlCampaign,
      onRecoverEffect: recoverEffect,
      onCorrectArrival: correctArrivalClass,
      onToggleRoute: toggleRoute,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    if (worldApi.cancelWorldRequest?.() !== true) return;
    requestVersion += 1;
    if (!state.hasResolved) {
      requestVersion = 0;
      state = createAdminDataState();
      return;
    }
    if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      state = createAdminDataState({
        status: state.data?.isEmpty ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
        data: state.data,
        hasResolved: true,
        requestVersion,
        updatedAt: state.updatedAt,
      });
    }
  }

  return Object.freeze({
    getState: () => state,
    load,
    controlCampaign,
    recoverEffect,
    correctArrivalClass,
    toggleRoute,
    render,
    deactivate() {
      cancelReadForDeactivation();
      currentView?.destroy?.();
      currentView = null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      worldApi.cancelWorldRequest?.();
      refreshTimers.forEach((timer) => clearTimeoutImpl?.(timer));
      refreshTimers.clear();
      currentView?.destroy?.();
      currentView = null;
      activeMutations.clear();
    },
  });
}
