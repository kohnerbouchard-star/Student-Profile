import {
  PROGRESSION_REWARD_ID_PATTERN,
  PROGRESSION_SKILL_ID_PATTERN,
  ProgressionError,
} from "../contracts/progressionContracts.ts";

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const ACHIEVEMENT_ID_PATTERN = /^ach_[a-z0-9_]{3,64}_v1$/u;
const UNLOCK_ID_PATTERN = /^pun_[0-9a-f]{32}$/u;
const CAPABILITY_PATTERN = /^progression\.[a-z0-9_.-]{3,80}$/u;
const REPUTATION_TYPES = new Set(["country", "career", "story", "relationship"]);
const TRACKS = new Set(["markets", "enterprise", "production", "diplomacy"]);
const REWARD_KINDS = new Set(["skill_points", "reputation", "badge"]);

export function normalizePlayerProgressionReadModelV1(
  value: unknown,
): Record<string, unknown> {
  const source = object(value);
  exactKeys(source, [
    "playerName", "title", "summary", "level", "xp", "currentLevelXp",
    "nextLevelXp", "skillPoints", "reputation", "milestones", "skills",
    "achievements", "licenses",
  ]);
  return {
    playerName: safeText(source.playerName, 1, 160),
    title: safeText(source.title, 1, 80),
    summary: safeText(source.summary, 1, 240),
    level: boundedInteger(source.level, 1, 20),
    xp: boundedInteger(source.xp, 0, 1_000_000_000),
    currentLevelXp: boundedInteger(source.currentLevelXp, 0, 1_000_000_000),
    nextLevelXp: boundedInteger(source.nextLevelXp, 0, 1_000_000_000),
    skillPoints: boundedInteger(source.skillPoints, 0, 200),
    reputation: array(source.reputation).map(normalizeReputation),
    milestones: array(source.milestones).map(normalizeMilestone),
    skills: array(source.skills).map(normalizeSkill),
    achievements: array(source.achievements).map(normalizeAchievement),
    licenses: array(source.licenses).map(normalizeLicense),
  };
}

function normalizeReputation(value: unknown): Record<string, unknown> {
  const source = object(value);
  exactKeys(source, [
    "type", "scope", "name", "label", "score", "displayScore", "public", "icon",
  ]);
  const type = safeText(source.type, 1, 32);
  if (!REPUTATION_TYPES.has(type)) invalid();
  return {
    type,
    scope: safeText(source.scope, 1, 80),
    name: safeText(source.name, 1, 100),
    label: safeText(source.label, 1, 40),
    score: boundedInteger(source.score, -100, 100),
    displayScore: boundedInteger(source.displayScore, 0, 200),
    public: bool(source.public),
    icon: safeText(source.icon, 1, 32),
  };
}

function normalizeMilestone(value: unknown): Record<string, unknown> {
  const source = object(value);
  exactKeys(source, ["id", "title", "detail", "progress", "icon"]);
  const id = safeText(source.id, 1, 80);
  if (!ACHIEVEMENT_ID_PATTERN.test(id)) invalid();
  return {
    id,
    title: safeText(source.title, 1, 100),
    detail: safeText(source.detail, 1, 500),
    progress: boundedInteger(source.progress, 0, 100),
    icon: safeText(source.icon, 1, 32),
  };
}

function normalizeSkill(value: unknown): Record<string, unknown> {
  const source = object(value);
  exactKeys(source, [
    "id", "category", "track", "tier", "name", "description", "cost",
    "minimumLevel", "prerequisiteSkillId", "capability", "effectBasisPoints",
    "unlocked", "unlockId", "icon",
  ]);
  const id = safeText(source.id, 1, 80);
  const track = safeText(source.track, 1, 32);
  const prerequisiteSkillId = optionalPatternText(
    source.prerequisiteSkillId,
    PROGRESSION_SKILL_ID_PATTERN,
  );
  const unlockId = optionalPatternText(source.unlockId, UNLOCK_ID_PATTERN);
  const capability = safeText(source.capability, 1, 100);
  if (
    !PROGRESSION_SKILL_ID_PATTERN.test(id) ||
    !TRACKS.has(track) ||
    !CAPABILITY_PATTERN.test(capability)
  ) invalid();
  return {
    id,
    category: safeText(source.category, 1, 40),
    track,
    tier: boundedInteger(source.tier, 1, 3),
    name: safeText(source.name, 1, 100),
    description: safeText(source.description, 1, 500),
    cost: boundedInteger(source.cost, 1, 3),
    minimumLevel: boundedInteger(source.minimumLevel, 1, 20),
    prerequisiteSkillId,
    capability,
    effectBasisPoints: boundedInteger(source.effectBasisPoints, 0, 250),
    unlocked: bool(source.unlocked),
    unlockId,
    icon: safeText(source.icon, 1, 32),
  };
}

function normalizeAchievement(value: unknown): Record<string, unknown> {
  const source = object(value);
  exactKeys(source, [
    "id", "name", "description", "currentValue", "threshold", "progressText",
    "complete", "completedAt", "claimable", "rewardId", "rewardKind", "rewardAmount",
  ]);
  const id = safeText(source.id, 1, 80);
  const rewardId = optionalPatternText(source.rewardId, PROGRESSION_REWARD_ID_PATTERN);
  const rewardKind = optionalText(source.rewardKind, 32);
  if (
    !ACHIEVEMENT_ID_PATTERN.test(id) ||
    (rewardKind !== null && !REWARD_KINDS.has(rewardKind))
  ) invalid();
  return {
    id,
    name: safeText(source.name, 1, 100),
    description: safeText(source.description, 1, 500),
    currentValue: boundedInteger(source.currentValue, 0, 1_000_000_000),
    threshold: boundedInteger(source.threshold, 1, 100_000),
    progressText: safeText(source.progressText, 1, 64),
    complete: bool(source.complete),
    completedAt: optionalTimestamp(source.completedAt),
    claimable: bool(source.claimable),
    rewardId,
    rewardKind,
    rewardAmount: boundedInteger(source.rewardAmount, 0, 20),
  };
}

function normalizeLicense(value: unknown): Record<string, unknown> {
  const source = object(value);
  exactKeys(source, [
    "id", "name", "issuer", "description", "status", "capability", "icon",
  ]);
  const id = safeText(source.id, 1, 80);
  const capability = safeText(source.capability, 1, 100);
  if (!UNLOCK_ID_PATTERN.test(id) || !CAPABILITY_PATTERN.test(capability)) invalid();
  return {
    id,
    name: safeText(source.name, 1, 100),
    issuer: safeText(source.issuer, 1, 100),
    description: safeText(source.description, 1, 500),
    status: safeText(source.status, 1, 40),
    capability,
    icon: safeText(source.icon, 1, 32),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 500) invalid();
  return value;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    keys.some((key) => !(key in value))
  ) invalid();
}
function safeText(value: unknown, min: number, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max || UUID_PATTERN.test(result)) invalid();
  return result;
}
function optionalText(value: unknown, max: number): string | null {
  return value === null || value === undefined ? null : safeText(value, 1, max);
}
function optionalPatternText(value: unknown, pattern: RegExp): string | null {
  const result = optionalText(value, 160);
  if (result !== null && !pattern.test(result)) invalid();
  return result;
}
function boundedInteger(value: unknown, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) invalid();
  return parsed;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}
function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = safeText(value, 1, 80);
  if (!Number.isFinite(Date.parse(result))) invalid();
  return result;
}
function invalid(): never {
  throw new ProgressionError(
    "player_progression_invalid_response",
    "Progression returned an invalid private read model.",
    500,
  );
}
