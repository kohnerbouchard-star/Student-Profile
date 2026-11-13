import { createAdminErrorEnvelope } from "../../core/error-envelope.js";

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
    accountType: safeText(cash.accountType || "checking", 16),
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
  const rawTargeting = isRecord(row.targetingPayload || row.targeting_payload)
    ? (row.targetingPayload || row.targeting_payload)
    : {};
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
    targeting: targetingSummary(rawTargeting),
    targetCountryCodes: Object.freeze(
      safeStringArray(rawTargeting.countryCodes).map((value) => value.toUpperCase()),
    ),
    // Targeting capability must use raw presence, not display text that strips UUIDs.
    targetingEditable: (!Array.isArray(rawTargeting.playerIds) || rawTargeting.playerIds.length === 0)
      && (!Array.isArray(rawTargeting.rosterLabels) || rawTargeting.rosterLabels.length === 0)
      && (!Array.isArray(rawTargeting.storyFlagConditions) || rawTargeting.storyFlagConditions.length === 0),
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

// Shared controller predicates keep normalization and orchestration on the same rules.
export function isContractResourceId(value) {
  return UUID_PATTERN.test(value);
}

export function isContractStatus(value) {
  return CONTRACT_STATUSES.has(value);
}

export { safeText as formatContractText };
