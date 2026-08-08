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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const CONTRACT_STATUSES = new Set(["draft", "scheduled", "active", "paused", "completed", "expired", "archived"]);
const PROGRESS_STATUSES = new Set(["available", "in_progress", "submitted", "completed", "failed", "expired", "dismissed"]);
const SOURCE_TYPES = new Set(["teacher", "system", "story_event"]);
const VISIBILITIES = new Set(["public", "targeted", "hidden"]);
const COMPLETION_MODES = new Set([
  "manual_review",
  "auto_check",
  "attendance_scan",
  "purchase_check",
  "stock_trade_check",
  "story_flag_check",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 4_000) {
  const text = String(value ?? "")
    .replace(UUID_IN_TEXT_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.slice(0, maximum);
}

function safeIdentifier(value, allowed, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function safeResourceId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeCount(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function safeIso(value) {
  const text = String(value || "").trim();
  return text && Number.isFinite(Date.parse(text)) ? text : "";
}

function safeStringArray(value, maximum = 24) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maximum)
    .map((entry) => safeText(entry, 120))
    .filter(Boolean);
}

function contractArray(result) {
  if (Array.isArray(result)) return result;
  const candidates = [result, result?.value, result?.data, result?.data?.data, result?.payload]
    .filter(isRecord);
  for (const candidate of candidates) {
    if (Array.isArray(candidate.contracts)) return candidate.contracts;
    if (Array.isArray(candidate.assignments)) return candidate.assignments;
  }
  return null;
}

function rewardSummary(payload) {
  const reward = isRecord(payload) ? payload : {};
  const cash = isRecord(reward.cash) ? reward.cash : {};
  const cashAmount = safeNumber(cash.amount);
  const currencyCode = safeText(cash.currencyCode || cash.currency_code || "", 16).toUpperCase();
  const itemCount = Array.isArray(reward.items)
    ? reward.items.reduce((sum, item) => sum + Math.max(0, safeCount(item?.quantity)), 0)
    : 0;
  const parts = [];
  if (cashAmount !== null && cashAmount > 0) {
    parts.push(`${cashAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currencyCode ? ` ${currencyCode}` : ""}`);
  }
  if (itemCount > 0) parts.push(`${itemCount.toLocaleString("en-US")} item${itemCount === 1 ? "" : "s"}`);
  return Object.freeze({
    cashAmount,
    currencyCode,
    itemCount,
    label: parts.join(" + ") || "No configured reward",
  });
}

function targetingSummary(payload) {
  const target = isRecord(payload) ? payload : {};
  const countryCodes = safeStringArray(target.countryCodes).map((value) => value.toUpperCase());
  const rosterLabels = safeStringArray(target.rosterLabels);
  if (target.allPlayers === true) return "All players";
  const parts = [];
  if (countryCodes.length) parts.push(countryCodes.join(", "));
  if (rosterLabels.length) parts.push(`Roster: ${rosterLabels.join(", ")}`);
  if (Array.isArray(target.playerIds) && target.playerIds.length) {
    parts.push(`${target.playerIds.length} specifically targeted player${target.playerIds.length === 1 ? "" : "s"}`);
  }
  return parts.join(" · ") || "Targeted audience";
}

function metadataSummary(value) {
  const metadata = isRecord(value) ? value : {};
  const difficulty = safeText(metadata.difficulty, 80);
  const reviewNote = safeText(metadata.reviewNote || metadata.review_note, 280);
  const materials = Array.isArray(metadata.materials) ? metadata.materials.length : 0;
  const submissionRequirements = Array.isArray(metadata.submissionRequirements)
    ? metadata.submissionRequirements.length
    : 0;
  return Object.freeze({ difficulty, reviewNote, materials, submissionRequirements });
}

function normalizeContract(row, index) {
  if (!isRecord(row)) return null;
  const resourceId = safeResourceId(row.id || row.contractId);
  const contractKey = safeText(row.contractKey || row.key, 100);
  const status = safeIdentifier(row.status, CONTRACT_STATUSES, "draft");
  const sourceType = safeIdentifier(row.sourceType || row.source_type, SOURCE_TYPES, "teacher");
  const visibility = safeIdentifier(row.visibility, VISIBILITIES, "public");
  const completionMode = safeIdentifier(row.completionMode || row.completion_mode, COMPLETION_MODES, "manual_review");
  const progressCount = safeCount(row.progressCount);
  const submittedCount = safeCount(row.submittedCount ?? row.submissionCount);
  const completedCount = safeCount(row.completedCount);
  const rewardIssuedCount = safeCount(row.rewardIssuedCount);
  return Object.freeze({
    resourceId,
    rowKey: contractKey || `contract-${index + 1}`,
    contractKey,
    title: safeText(row.title || row.name, 320) || "Untitled contract",
    description: safeText(row.description || row.summary, 8_000),
    instructions: safeText(row.instructions || row.details, 12_000),
    category: safeText(row.category, 100) || "general",
    status,
    sourceType,
    visibility,
    completionMode,
    sourceLabel: sourceType === "teacher" ? "Teacher-created" : sourceType === "system" ? "System/template" : "Story event",
    targeting: targetingSummary(row.targetingPayload || row.targeting_payload),
    requirementsText: safeText(
      row.requirementsPayload?.manualText || row.requirements_payload?.manualText,
      8_000,
    ),
    reward: rewardSummary(row.rewardPayload || row.reward_payload),
    metadata: metadataSummary(row.metadata),
    publishedAt: safeIso(row.publishedAt || row.published_at),
    deadlineAt: safeIso(row.deadlineAt || row.deadline_at),
    expiresAt: safeIso(row.expiresAt || row.expires_at),
    createdAt: safeIso(row.createdAt || row.created_at),
    updatedAt: safeIso(row.updatedAt || row.updated_at),
    progressCount,
    submittedCount,
    completedCount,
    rewardIssuedCount,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/** Normalizes contract list data while keeping ownership UUIDs out of display fields. */
export function normalizeContractsReadModel(result) {
  const rows = contractArray(result);
  if (!rows) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const contracts = rows.slice(0, 2_000).map(normalizeContract).filter(Boolean);
  const statuses = [...new Set(contracts.map((item) => item.status))].sort();
  const categories = [...new Set(contracts.map((item) => item.category))].sort((a, b) => a.localeCompare(b));
  return deepFreeze({
    contracts,
    statuses,
    categories,
    summary: {
      totalCount: contracts.length,
      activeCount: contracts.filter((item) => item.status === "active").length,
      reviewCount: contracts.reduce((sum, item) => sum + item.submittedCount, 0),
      completedCount: contracts.reduce((sum, item) => sum + item.completedCount, 0),
    },
    isEmpty: contracts.length === 0,
  });
}

function readProgressPayload(detail) {
  const progress = detail?.progress;
  return isRecord(progress) && Array.isArray(progress.progress) ? progress.progress : null;
}

function readSubmissions(detail) {
  const data = detail?.submissions?.data;
  if (!isRecord(data)) return [];
  return Array.isArray(data.contractSubmissions)
    ? data.contractSubmissions
    : Array.isArray(data.submissions) ? data.submissions : [];
}

function normalizeEvidence(value) {
  if (!isRecord(value)) return "";
  const priority = [
    value.writtenResponse,
    value.submissionText,
    value.submissionUrl,
    value.url,
  ];
  for (const entry of priority) {
    const text = safeText(entry, 4_000);
    if (text) return text;
  }
  const answers = Array.isArray(value.answers) ? value.answers : Array.isArray(value.responses) ? value.responses : [];
  return answers.slice(0, 20).map((answer) => {
    if (!isRecord(answer)) return safeText(answer, 500);
    const prompt = safeText(answer.prompt || answer.question || answer.label, 300);
    const response = safeText(answer.answer || answer.response || answer.value, 800);
    return [prompt, response].filter(Boolean).join(": ");
  }).filter(Boolean).join(" · ");
}

function normalizeProgress(progress, submission, index) {
  if (!isRecord(progress)) return null;
  const resourceId = safeResourceId(progress.progressId || progress.id);
  const submissionRow = isRecord(submission) ? submission : {};
  const status = safeIdentifier(progress.status || submissionRow.status, PROGRESS_STATUSES, "available");
  const playerName = safeText(
    submissionRow.displayName || submissionRow.playerName || submissionRow.player,
    280,
  ) || "Player";
  const rosterLabel = safeText(submissionRow.rosterLabel, 120);
  const country = safeText(submissionRow.country || submissionRow.countryCode, 120);
  const evidence = safeText(submissionRow.evidence || submissionRow.summary, 5_000)
    || normalizeEvidence(progress.evidencePayload)
    || "No submitted evidence";
  const feedback = safeText(
    progress.resultPayload?.feedback
      || submissionRow.resultPayload?.feedback
      || submissionRow.resultPayload?.reviewFeedback,
    4_000,
  );
  return Object.freeze({
    resourceId,
    rowKey: `participant-${index + 1}`,
    playerName,
    rosterLabel,
    country,
    status,
    evidence,
    feedback,
    submittedAt: safeIso(progress.submittedAt || submissionRow.submittedAt),
    completedAt: safeIso(progress.completedAt || submissionRow.completedAt),
    rewardIssuedAt: safeIso(progress.rewardIssuedAt || submissionRow.rewardIssuedAt),
    canReview: Boolean(resourceId) && status === "submitted" && !safeIso(progress.rewardIssuedAt || submissionRow.rewardIssuedAt),
    canIssueReward: Boolean(resourceId) && status === "completed" && !safeIso(progress.rewardIssuedAt || submissionRow.rewardIssuedAt),
  });
}

/** Joins authoritative progress with the Admin BFF's player-safe submission projection. */
export function normalizeContractDetail(result, contract) {
  const progressRows = readProgressPayload(result);
  if (!progressRows) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const submissions = readSubmissions(result);
  const submissionsById = new Map();
  submissions.forEach((row) => {
    const key = safeResourceId(row?.progressId || row?.submissionId || row?.id);
    if (key) submissionsById.set(key, row);
  });
  const participants = progressRows.slice(0, 2_000).map((row, index) => {
    const key = safeResourceId(row?.progressId || row?.id);
    return normalizeProgress(row, key ? submissionsById.get(key) : null, index);
  }).filter(Boolean);
  return deepFreeze({
    contract,
    participants,
    summary: {
      participantCount: participants.length,
      submittedCount: participants.filter((item) => item.status === "submitted").length,
      completedCount: participants.filter((item) => item.status === "completed").length,
      rewardIssuedCount: participants.filter((item) => Boolean(item.rewardIssuedAt)).length,
    },
    isEmpty: participants.length === 0,
  });
}

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
    if (!UUID_PATTERN.test(uuid)) {
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
      status: status === "all" || CONTRACT_STATUSES.has(status) ? status : "all",
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
