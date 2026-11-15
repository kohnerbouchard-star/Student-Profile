import {
  WORLD_MANAGEMENT_RESOURCE_KEYS, WORLD_ARRIVAL_CLASS_IDS, DEFAULT_TIMEOUT_MS, CAMPAIGN_ID_PATTERN,
  EFFECT_ID_PATTERN, ASSIGNMENT_ID_PATTERN, ROUTE_ID_PATTERN, WorldTransportDiagnostic,
  normalizeTimeout, requirePublicId, requireIdempotencyKey, requireRevision, requireReason, basePath,
  resourceSpecs, linkAbortSignal, requestWorldJson, PANEL_VALIDATORS, asSafeRejection, settlePanel,
  validateMutation,
} from "./WorldManagementProtocol.js";
export { WORLD_MANAGEMENT_RESOURCE_KEYS, WORLD_ARRIVAL_CLASS_IDS } from "./WorldManagementProtocol.js";
import { createAdminBffTransport } from "../../api/admin-bff-transport.js";


/**
 * Route-owned adapter for the authoritative World administrator contracts.
 * The default transport is the existing scoped HttpOnly Admin BFF.
 */
export function createWorldManagementApi({
  selectedGameId,
  session = () => globalThis.EconovariaAdminAuthSession?.read?.(),
  fetchImpl = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const gameId = String(selectedGameId || "").trim();
  if (!gameId) throw new TypeError("World Management game context is unavailable.");

  const transport = typeof fetchImpl === "function"
    ? fetchImpl
    : createAdminBffTransport({ selectedGameId: gameId, session });

  let activeRequestVersion = 0;
  let activeController = null;
  const inFlightMutations = new Map();

  async function readWorldManagement({ signal, timeoutMs: requestTimeoutMs } = {}) {
    activeRequestVersion += 1;
    const requestVersion = activeRequestVersion;
    activeController?.abort();

    const batchController = new AbortController();
    activeController = batchController;
    const unlinkAbort = linkAbortSignal(signal, batchController);
    const specs = resourceSpecs(gameId);
    const requestTimeout = normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs));

    try {
      const entries = await Promise.all(WORLD_MANAGEMENT_RESOURCE_KEYS.map(async (key) => [
        key,
        await settlePanel(
          transport,
          specs[key],
          { signal: batchController.signal, timeoutMs: requestTimeout },
          PANEL_VALIDATORS[key],
        ),
      ]));
      return Object.freeze({
        requestVersion,
        current: requestVersion === activeRequestVersion,
        panels: Object.freeze(Object.fromEntries(entries)),
      });
    } finally {
      unlinkAbort();
      if (activeController === batchController) activeController = null;
    }
  }

  function cancelWorldRequest() {
    if (!activeController) return false;
    activeRequestVersion += 1;
    activeController.abort();
    activeController = null;
    return true;
  }

  function mutation({ path, body, idempotencyKey, signal, timeoutMs: requestTimeoutMs }) {
    try {
      const key = requireIdempotencyKey(idempotencyKey);
      const fingerprint = JSON.stringify({ path, body });
      const existing = inFlightMutations.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return asSafeRejection(
            new WorldTransportDiagnostic({ status: 409, code: "CONFLICT" }),
          );
        }
        return existing.promise;
      }

      const promise = requestWorldJson(transport, path, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        signal,
        timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
        validate: validateMutation,
      });
      const entry = { fingerprint, promise };
      inFlightMutations.set(key, entry);
      const clear = () => {
        if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
      };
      promise.then(clear, clear);
      return promise;
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function controlCampaign({
    campaignId,
    action,
    expectedRevision,
    reason,
    idempotencyKey,
    signal,
  } = {}) {
    try {
      const campaign = requirePublicId(campaignId, CAMPAIGN_ID_PATTERN);
      const normalizedAction = String(action || "").trim().toLowerCase();
      if (!["pause", "resume", "emergency_disable"].includes(normalizedAction)) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      return mutation({
        path: `${basePath(gameId)}/campaign/control`,
        body: {
          action: normalizedAction,
          campaignId: campaign,
          correctedPhase: null,
          expectedRevision: requireRevision(expectedRevision),
          reason: requireReason(reason),
        },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function recoverEffect({
    effectId,
    reason,
    requestId,
    idempotencyKey = requestId,
    signal,
  } = {}) {
    try {
      const effect = requirePublicId(effectId, EFFECT_ID_PATTERN);
      const requestKey = requireIdempotencyKey(requestId);
      return mutation({
        path: `${basePath(gameId)}/campaign/effects/${encodeURIComponent(effect)}/recover`,
        body: { reason: requireReason(reason), requestId: requestKey },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function correctArrivalClass({
    assignmentId,
    classId,
    expectedRevision,
    reason,
    requestId,
    idempotencyKey = requestId,
    signal,
  } = {}) {
    try {
      const assignment = requirePublicId(assignmentId, ASSIGNMENT_ID_PATTERN);
      const requestKey = requireIdempotencyKey(requestId);
      const normalizedClassId = String(classId || "").trim().toLowerCase();
      if (!WORLD_ARRIVAL_CLASS_IDS.includes(normalizedClassId)) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      return mutation({
        path: `${basePath(gameId)}/arrival-classes/${encodeURIComponent(assignment)}/correct`,
        body: {
          classId: normalizedClassId,
          expectedRevision: requireRevision(expectedRevision),
          reason: requireReason(reason),
          requestId: requestKey,
        },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function updateRouteState({
    routeIds,
    status,
    reason,
    expectedRevision,
    requestId,
    idempotencyKey = requestId,
    signal,
  } = {}) {
    try {
      const normalizedRouteIds = Array.isArray(routeIds)
        ? routeIds.map((routeId) => requirePublicId(routeId, ROUTE_ID_PATTERN))
        : [];
      if (normalizedRouteIds.length < 1 || normalizedRouteIds.length > 100) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      const requestKey = requireIdempotencyKey(requestId);
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const normalizedReason = String(reason || "").trim().toLowerCase();
      const supportedPair = (normalizedStatus === "closed" && normalizedReason === "war")
        || (normalizedStatus === "open" && normalizedReason === "recovery");
      if (!supportedPair) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      return mutation({
        path: `${basePath(gameId)}/routes/state`,
        body: {
          costMultiplierBasisPoints: 10_000,
          durationMultiplierBasisPoints: 10_000,
          expectedRevision: requireRevision(expectedRevision),
          reason: normalizedReason,
          requestId: requestKey,
          routeIds: normalizedRouteIds,
          status: normalizedStatus,
        },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  return Object.freeze({
    readWorldManagement,
    cancelWorldRequest,
    controlCampaign,
    recoverEffect,
    correctArrivalClass,
    updateRouteState,
    getRequestVersion: () => activeRequestVersion,
    isCurrentRequestVersion: (version) => Number(version) === activeRequestVersion,
  });
}
