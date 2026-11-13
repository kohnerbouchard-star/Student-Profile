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
import { ContractsRoute } from "./ContractsRoute.js";

import {
  formatContractText as safeText,
  isContractResourceId,
  isContractStatus,
  normalizeContractDetail,
  normalizeContractsReadModel,
} from "./ContractsReadModel.js";

export { normalizeContractDetail, normalizeContractsReadModel };

function safeError(error) {
  return isAdminErrorEnvelope(error)
    ? error
    : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function createContractsController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of [
    "readContracts",
    "readContractDetail",
    "createContract",
    "updateContract",
    "publishContract",
    "archiveContract",
    "duplicateContract",
    "reviewProgress",
    "issueRewards",
  ]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Contracts API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all", category: "all" });
  let requestVersion = 0;
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
    if (destroyed || !hasPermission("contracts.manage")) return state;
    api.cancelContractsRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readContracts({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion) return state;
      const model = normalizeContractsReadModel(result);
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

  function scheduleRefresh() {
    const timer = globalThis.setTimeout(() => {
      refreshTimers.delete(timer);
      if (!destroyed) void load();
    }, 0);
    refreshTimers.add(timer);
  }

  function nextIdempotencyKey(action) {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!isContractResourceId(uuid)) {
      throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    }
    return `admin.contracts.${action}.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  async function mutate({ action, contract = null, progress = null, input = null, request, successTitle, successMessage }) {
    if (destroyed || !hasPermission("contracts.manage")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    const fingerprint = stableStringify({
      action,
      contractId: contract?.resourceId || null,
      progressId: progress?.resourceId || null,
      input,
    });
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }
    let idempotencyKey = pendingIdempotency.get(fingerprint);
    try {
      if (!idempotencyKey) {
        idempotencyKey = nextIdempotencyKey(action);
        pendingIdempotency.set(fingerprint, idempotencyKey);
      }
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
    activeMutations.add(fingerprint);
    try {
      const result = await request(idempotencyKey);
      pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({ tone: "success", title: successTitle, message: successMessage });
        scheduleRefresh();
      }
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed) notify({ tone: "error", title: "Contract action failed", message: envelope.userMessage });
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  async function loadDetail(contract) {
    if (destroyed || !hasPermission("contracts.manage") || !contract?.resourceId) {
      throw createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false });
    }
    const result = await api.readContractDetail({ gameId: selectedGameId, contractId: contract.resourceId });
    return normalizeContractDetail(result, contract);
  }

  function createContract(input) {
    return mutate({
      action: "create",
      input,
      request: (idempotencyKey) => api.createContract({ gameId: selectedGameId, contract: input, idempotencyKey }),
      successTitle: "Contract created",
      successMessage: `${safeText(input?.title, 280) || "The contract"} was created.`,
    });
  }

  function updateContract(contract, input) {
    if (!contract?.resourceId) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    }
    if (contract.sourceType !== "teacher" || contract.targetingEditable === false || !["draft", "scheduled"].includes(contract.status)) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false, userMessage: "Only draft or scheduled teacher contracts can be edited." }),
      });
    }
    return mutate({
      action: "update",
      contract,
      input,
      request: (idempotencyKey) => api.updateContract({
        gameId: selectedGameId,
        contractId: contract.resourceId,
        contract: input,
        idempotencyKey,
      }),
      successTitle: "Contract updated",
      successMessage: `${contract.title} was updated.`,
    });
  }

  function publishContract(contract) {
    if (!contract?.resourceId) return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    return mutate({
      action: "publish",
      contract,
      request: (idempotencyKey) => api.publishContract({ gameId: selectedGameId, contractId: contract.resourceId, idempotencyKey }),
      successTitle: "Contract published",
      successMessage: `${contract.title} is now published.`,
    });
  }

  function archiveContract(contract) {
    if (!contract?.resourceId) return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    return mutate({
      action: "archive",
      contract,
      request: (idempotencyKey) => api.archiveContract({ gameId: selectedGameId, contractId: contract.resourceId, idempotencyKey }),
      successTitle: "Contract archived",
      successMessage: `${contract.title} was archived.`,
    });
  }

  function duplicateContract(contract) {
    if (!contract?.resourceId) return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    return mutate({
      action: "duplicate",
      contract,
      request: (idempotencyKey) => api.duplicateContract({ gameId: selectedGameId, contractId: contract.resourceId, idempotencyKey }),
      successTitle: "Contract duplicated",
      successMessage: `${contract.title} was copied as a new draft.`,
    });
  }

  function reviewProgress(contract, progress, action, feedback = "") {
    if (!contract?.resourceId || !progress?.resourceId) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    }
    const actionLabel = action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned for revision";
    return mutate({
      action: `review-${action}`,
      contract,
      progress,
      input: { action, feedback },
      request: (idempotencyKey) => api.reviewProgress({
        gameId: selectedGameId,
        contractId: contract.resourceId,
        progressId: progress.resourceId,
        action,
        feedback,
        idempotencyKey,
      }),
      successTitle: "Submission reviewed",
      successMessage: `${progress.playerName}'s submission was ${actionLabel}.`,
    });
  }

  function issueRewards(contract, progress) {
    if (!contract?.resourceId || !progress?.resourceId) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) });
    }
    return mutate({
      action: "issue-rewards",
      contract,
      progress,
      request: (idempotencyKey) => api.issueRewards({
        gameId: selectedGameId,
        contractId: contract.resourceId,
        progressId: progress.resourceId,
        idempotencyKey,
      }),
      successTitle: "Rewards issued",
      successMessage: `${progress.playerName}'s contract rewards were issued.`,
    });
  }

  function updateFilters(nextFilters = {}) {
    const status = String(nextFilters.status ?? filters.status).toLowerCase();
    const category = String(nextFilters.category ?? filters.category).trim();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 180),
      status: status === "all" || isContractStatus(status) ? status : "all",
      category: category || "all",
    });
  }

  function render() {
    if (destroyed) throw new Error("Contracts controller has been destroyed.");
    currentView?.destroy?.();
    currentView = ContractsRoute({
      state,
      filters,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onLoadDetail: loadDetail,
      onCreate: createContract,
      onEdit: updateContract,
      onPublish: publishContract,
      onArchive: archiveContract,
      onDuplicate: duplicateContract,
      onReview: reviewProgress,
      onIssueRewards: issueRewards,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    api.cancelContractsRequest?.();
    api.cancelContractDetailRequest?.();
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
    getFilters: () => filters,
    load,
    loadDetail,
    createContract,
    updateContract,
    publishContract,
    archiveContract,
    duplicateContract,
    reviewProgress,
    issueRewards,
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
      api.cancelContractsRequest?.();
      api.cancelContractDetailRequest?.();
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      pendingIdempotency.clear();
      activeMutations.clear();
      currentView?.destroy?.();
      currentView = null;
    },
  });
}
