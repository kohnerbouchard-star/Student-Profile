import {
  createAdminErrorEnvelope,
  isAdminErrorEnvelope,
  normalizeAdminError,
} from "../../core/error-envelope.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CORRECTION_ID_PATTERN = /^pcr_[0-9a-f]{32}$/;
const REPUTATION_TYPES = new Set(["country", "career", "story", "relationship"]);
const CORRECTION_TYPES = new Set(["experience", "reputation"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 500) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

export function safeProgressionPlayerId(value) {
  const text = String(value || "").trim();
  return PLAYER_ID_PATTERN.test(text) && !UUID_PATTERN.test(text) ? text : "";
}

function safeInteger(value, { minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function safeTimestamp(value) {
  const text = safeText(value, 80);
  return text && Number.isFinite(Date.parse(text)) ? text : "";
}

function normalizeReputation(value) {
  if (!isRecord(value)) return Object.freeze({});
  const result = {};
  REPUTATION_TYPES.forEach((type) => {
    const amount = safeInteger(value[type]);
    if (amount !== null) result[type] = amount;
  });
  return Object.freeze(result);
}

function normalizePlayer(row) {
  if (!isRecord(row)) return null;
  const playerId = safeProgressionPlayerId(row.playerId);
  if (!playerId) return null;
  return Object.freeze({
    rowKey: playerId,
    playerId,
    displayName: safeText(row.displayName, 240) || "Unnamed player",
    rosterLabel: safeText(row.rosterLabel, 160),
    level: safeInteger(row.level, { minimum: 0 }),
    experience: safeInteger(row.experience, { minimum: 0 }),
    availableSkillPoints: safeInteger(row.availableSkillPoints, { minimum: 0 }),
    skillCount: safeInteger(row.skillCount, { minimum: 0 }),
    achievementCount: safeInteger(row.achievementCount, { minimum: 0 }),
    reputation: normalizeReputation(row.reputation),
    updatedAt: safeTimestamp(row.updatedAt),
  });
}

function normalizeCorrection(row) {
  if (!isRecord(row)) return null;
  const playerId = safeProgressionPlayerId(row.playerId);
  const id = String(row.id || "").trim().toLowerCase();
  const correctionType = String(row.correctionType || "").trim().toLowerCase();
  const reputationType = String(row.reputationType || "").trim().toLowerCase();
  const amount = safeInteger(row.amount, { minimum: -5_000, maximum: 5_000 });
  const beforeValue = safeInteger(row.beforeValue);
  const afterValue = safeInteger(row.afterValue);
  if (!playerId || !CORRECTION_ID_PATTERN.test(id) || !CORRECTION_TYPES.has(correctionType)
    || amount === null || amount === 0 || beforeValue === null || afterValue === null) return null;

  return Object.freeze({
    rowKey: id,
    id,
    playerId,
    displayName: safeText(row.displayName, 240) || playerId,
    correctionType,
    amount,
    reputationType: REPUTATION_TYPES.has(reputationType) ? reputationType : "",
    reputationScope: safeProgressionPlayerId(row.reputationScope),
    reason: safeText(row.reason, 1_000),
    beforeValue,
    afterValue,
    createdAt: safeTimestamp(row.createdAt),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function safeProgressionError(error) {
  if (isAdminErrorEnvelope(error)) return error;
  return normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

function panelResult(result, key) {
  if (result?.status === "fulfilled") {
    return { status: "ready", error: null, value: result.value?.[key] || [] };
  }
  return { status: "failed", error: safeProgressionError(result?.reason), value: [] };
}

/** Converts authoritative progression reads into a UUID-free presentation model. */
export function normalizeProgressionReadModel({ playersResult, correctionsResult } = {}) {
  const playersPanel = panelResult(playersResult, "players");
  const correctionsPanel = panelResult(correctionsResult, "corrections");
  const players = playersPanel.value.slice(0, 1_000).map(normalizePlayer).filter(Boolean);
  const corrections = correctionsPanel.value.slice(0, 1_000).map(normalizeCorrection).filter(Boolean);
  return deepFreeze({
    players,
    corrections,
    summary: {
      playerCount: players.length,
      totalAchievements: players.reduce((sum, row) => sum + (row.achievementCount ?? 0), 0),
      totalSkills: players.reduce((sum, row) => sum + (row.skillCount ?? 0), 0),
      highestLevel: players.reduce((highest, row) => Math.max(highest, row.level ?? 0), 0),
      correctionCount: corrections.length,
    },
    panels: {
      players: { status: playersPanel.status, error: playersPanel.error },
      corrections: { status: correctionsPanel.status, error: correctionsPanel.error },
    },
    isEmpty: players.length === 0 && corrections.length === 0,
  });
}

export function normalizeProgressionCorrectionCommand(command) {
  if (!isRecord(command)) return null;
  const correctionType = String(command.correctionType || "").trim().toLowerCase();
  const amount = safeInteger(command.amount, { minimum: -5_000, maximum: 5_000 });
  const reputationType = String(command.reputationType || "").trim().toLowerCase();
  const reputationScope = safeProgressionPlayerId(command.reputationScope);
  const reason = safeText(command.reason, 1_000);
  if (!CORRECTION_TYPES.has(correctionType) || amount === null || amount === 0 || reason.length < 3) return null;
  if (correctionType === "experience") {
    return Object.freeze({ correctionType, amount, reputationType: null, reputationScope: null, reason });
  }
  if (!REPUTATION_TYPES.has(reputationType) || !reputationScope) return null;
  return Object.freeze({ correctionType, amount, reputationType, reputationScope, reason });
}

export function stableProgressionCommand(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableProgressionCommand).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableProgressionCommand(value[key])}`,
  ).join(",")}}`;
}

export function progressionMutationError(code = "VALIDATION_FAILED") {
  return createAdminErrorEnvelope({ code, retryable: false });
}
