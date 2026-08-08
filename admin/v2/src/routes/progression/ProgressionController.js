import {
  ADMIN_DATA_STATES,
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import {
  normalizeProgressionCorrectionCommand,
  normalizeProgressionReadModel,
  progressionMutationError,
  safeProgressionError,
  safeProgressionPlayerId,
  stableProgressionCommand,
} from "./ProgressionModel.js";
import { ProgressionRoute } from "./ProgressionRoute.js";

export { normalizeProgressionReadModel } from "./ProgressionModel.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Owns Progression reads, correction idempotency, route lifecycle, and safe refreshes. */
export function createProgressionController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readPlayers", "readCorrections", "correctPlayer"]) {
    if (typeof api?.[method] !== "function") {
      throw new TypeError(`Progression API ${method} is unavailable.`);
    }
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", correctionType: "all" });
  let selectedPlayerId = "";
  let requestVersion = 0;
  let requestController = null;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  const pendingIdempotency = new Map();
  const activeMutations = new Set();
  const refreshTimers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("progression.review")) return state;
    requestController?.abort();
    requestController = new AbortController();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    const [playersResult, correctionsResult] = await Promise.allSettled([
      api.readPlayers({ gameId: selectedGameId, limit: 100, offset: 0, signal: requestController.signal }),
      api.readCorrections({ gameId: selectedGameId, limit: 100, offset: 0, signal: requestController.signal }),
    ]);
    if (destroyed || version !== requestVersion) return state;
    requestController = null;

    if (playersResult.status === "rejected" && correctionsResult.status === "rejected") {
      state = rejectAdminDataLoad(state, safeProgressionError(playersResult.reason), { requestVersion: version });
      publish();
      return state;
    }

    try {
      const model = normalizeProgressionReadModel({ playersResult, correctionsResult });
      if (selectedPlayerId && !model.players.some((player) => player.playerId === selectedPlayerId)) {
        selectedPlayerId = "";
      }
      state = resolveAdminDataLoad(state, model, { empty: model.isEmpty, requestVersion: version });
    } catch (error) {
      state = rejectAdminDataLoad(state, safeProgressionError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function updateFilters(nextFilters = {}) {
    const correctionType = String(nextFilters.correctionType ?? filters.correctionType).trim().toLowerCase();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 160),
      correctionType: ["experience", "reputation"].includes(correctionType) ? correctionType : "all",
    });
  }

  function selectPlayer(playerId) {
    const safeId = safeProgressionPlayerId(playerId);
    if (safeId === selectedPlayerId) return;
    selectedPlayerId = safeId;
    publish();
  }

  function nextIdempotencyKey() {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) throw progressionMutationError("INVALID_REQUEST");
    return `admin.progression.correction.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  function scheduleRefresh() {
    const timer = globalThis.setTimeout(() => {
      refreshTimers.delete(timer);
      if (!destroyed) void load();
    }, 0);
    refreshTimers.add(timer);
  }

  async function correctPlayer(playerId, command) {
    if (destroyed || !hasPermission("progression.review")) {
      return { ok: false, error: progressionMutationError("PERMISSION_DENIED") };
    }
    const target = safeProgressionPlayerId(playerId);
    const normalized = normalizeProgressionCorrectionCommand(command);
    if (!target || !normalized) {
      return { ok: false, error: progressionMutationError("VALIDATION_FAILED") };
    }

    const fingerprint = stableProgressionCommand({ playerId: target, command: normalized });
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: progressionMutationError("CONFLICT") };
    }

    let idempotencyKey = pendingIdempotency.get(fingerprint);
    try {
      if (!idempotencyKey) {
        idempotencyKey = nextIdempotencyKey();
        pendingIdempotency.set(fingerprint, idempotencyKey);
      }
    } catch (error) {
      return { ok: false, error: safeProgressionError(error) };
    }

    activeMutations.add(fingerprint);
    try {
      const result = await api.correctPlayer({
        gameId: selectedGameId,
        playerId: target,
        command: normalized,
        idempotencyKey,
      });
      pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify(result?.outcome === "replayed"
          ? { tone: "success", title: "Correction already recorded", message: "The original audited correction was reused safely." }
          : { tone: "success", title: "Progression correction applied", message: "The audited correction was committed to the authoritative progression record." });
        scheduleRefresh();
      }
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeProgressionError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function render() {
    if (destroyed) throw new Error("Progression controller has been destroyed.");
    currentView?.destroy?.();
    currentView = ProgressionRoute({
      state,
      filters,
      selectedPlayerId,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onSelectPlayer: selectPlayer,
      onCorrect: correctPlayer,
    });
    return currentView;
  }

  function deactivate() {
    if (requestController) {
      requestVersion += 1;
      requestController.abort();
      requestController = null;
    }
    if (!state.hasResolved) {
      requestVersion = 0;
      state = createAdminDataState();
    } else if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      state = createAdminDataState({
        status: state.data?.isEmpty ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
        data: state.data,
        hasResolved: true,
        requestVersion,
        updatedAt: state.updatedAt,
      });
    }
    currentView?.destroy?.();
    currentView = null;
  }

  return Object.freeze({
    getState: () => state,
    getFilters: () => filters,
    getSelectedPlayerId: () => selectedPlayerId,
    load,
    updateFilters,
    selectPlayer,
    correctPlayer,
    render,
    deactivate,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      requestController?.abort();
      requestController = null;
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      pendingIdempotency.clear();
      activeMutations.clear();
      currentView?.destroy?.();
      currentView = null;
    },
  });
}
