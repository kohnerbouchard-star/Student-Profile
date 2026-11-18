import { createAdminErrorEnvelope } from "../../core/error-envelope.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ITEM_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const JOB_KEY_PATTERN = /^cft_[0-9a-f]{32}$/;
const JOB_STATUSES = new Set(["in_progress", "completed", "claimed", "cancelled", "failed"]);
const SCARCITY_BANDS = new Set(["abundant", "available", "constrained", "scarce", "unavailable"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 500) {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function safePublicKey(value, maximum = 128) {
  const key = String(value ?? "").trim();
  return PUBLIC_KEY_PATTERN.test(key) && !UUID_IN_TEXT_PATTERN.test(key)
    ? key.slice(0, maximum)
    : "";
}

export function safeItemKey(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return ITEM_KEY_PATTERN.test(key) ? key : "";
}

function safeJobKey(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return JOB_KEY_PATTERN.test(key) ? key : "";
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeNonNegativeInteger(value) {
  const number = safeNumber(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function safeTimestamp(value) {
  const text = String(value ?? "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? text.slice(0, 80) : "";
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function craftingData(result) {
  const candidates = [
    result?.data,
    result?.data?.data,
    result?.value,
    result,
  ];
  return candidates.find((candidate) => (
    isRecord(candidate)
    && Array.isArray(candidate.jobs)
    && Array.isArray(candidate.effects)
    && Array.isArray(candidate.supply)
    && isRecord(candidate.invariants)
  )) || null;
}

function normalizeJob(row, index) {
  if (!isRecord(row)) return null;
  const status = String(row.status || "").trim().toLowerCase();
  const recipeKey = safePublicKey(row.recipeKey || row.recipe_key);
  const jobKey = safeJobKey(row.jobKey || row.public_id);
  return Object.freeze({
    rowKey: jobKey || `crafting-job-${index + 1}`,
    jobKey,
    recipeKey,
    recipeName: safeText(row.recipeName || row.recipe_name, 240) || "Unnamed recipe",
    playerLabel: safeText(row.playerId || row.playerName || row.player?.displayName, 240) || "Player",
    quantity: safeNonNegativeInteger(row.quantity) ?? 0,
    status: JOB_STATUSES.has(status) ? status : "",
    difficulty: safePublicKey(row.difficulty || row.difficultyKey || row.difficulty_key),
    countryCode: safeText(row.countryCode || row.country_code, 8).toUpperCase(),
    qualityBand: safePublicKey(row.qualityBand || row.quality_band),
    startedAt: safeTimestamp(row.startedAt || row.started_at),
    completesAt: safeTimestamp(row.completesAt || row.completes_at),
    claimedAt: safeTimestamp(row.claimedAt || row.claimed_at),
    failureCode: safePublicKey(row.failureCode || row.failure_code),
    recoveryVersion: safeNonNegativeInteger(row.recoveryVersion || row.recovery_version) ?? 0,
  });
}

function normalizeEffect(row, index) {
  if (!isRecord(row)) return null;
  return Object.freeze({
    rowKey: safePublicKey(row.effectCode || row.effect_code) || `crafting-effect-${index + 1}`,
    effectCode: safePublicKey(row.effectCode || row.effect_code),
    kind: safePublicKey(row.kind || row.effectKind || row.effect_kind),
    scope: safePublicKey(row.scope),
    durationSeconds: safeNonNegativeInteger(row.durationSeconds || row.duration_seconds),
    stackingRule: safePublicKey(row.stackingRule || row.stacking_rule),
    maxStacks: safeNonNegativeInteger(row.maxStacks || row.max_stacks),
    cooldownSeconds: safeNonNegativeInteger(row.cooldownSeconds || row.cooldown_seconds),
    enabled: row.enabled !== false,
    summary: safeText(row.summary || row.publicSummary || row.public_summary, 1_000),
  });
}

function normalizeSupply(row, index) {
  if (!isRecord(row)) return null;
  const itemKey = safeItemKey(row.itemKey || row.item_key);
  const scarcity = String(row.scarcityBand || row.scarcity_band || "").trim().toLowerCase();
  return Object.freeze({
    rowKey: `${itemKey || "supply"}:${safeText(row.countryCode || row.country_code, 8) || "global"}:${index}`,
    itemKey,
    countryCode: safeText(row.countryCode || row.country_code, 8).toUpperCase(),
    scarcityBand: SCARCITY_BANDS.has(scarcity) ? scarcity : "",
    availableQuantity: safeNonNegativeInteger(row.availableQuantity ?? row.available_quantity),
    reservedQuantity: safeNonNegativeInteger(row.reservedQuantity ?? row.reserved_quantity),
    eventMultiplier: safeNumber(row.eventMultiplier ?? row.event_multiplier),
    routeMultiplier: safeNumber(row.routeMultiplier ?? row.route_multiplier),
    sourceEventKey: safePublicKey(row.sourceEventKey || row.source_event_key),
    expiresAt: safeTimestamp(row.expiresAt || row.expires_at),
    version: safeNonNegativeInteger(row.version) ?? 0,
  });
}

function normalizedInvariantCount(value) {
  return safeNonNegativeInteger(value) ?? 0;
}

function normalizeInvariants(source) {
  const row = isRecord(source) ? source : {};
  return Object.freeze({
    negativeOwned: normalizedInvariantCount(row.negativeOwned),
    negativeReserved: normalizedInvariantCount(row.negativeReserved),
    reservedAboveOwned: normalizedInvariantCount(row.reservedAboveOwned),
    reservationProjectionMismatch: normalizedInvariantCount(row.reservationProjectionMismatch),
    duplicateOutputGrants: normalizedInvariantCount(row.duplicateOutputGrants),
    repairEnabled: row.repairEnabled === true,
    durabilityEnabled: row.durabilityEnabled === true,
  });
}

function normalizePack(source) {
  const row = isRecord(source) ? source : {};
  return Object.freeze({
    packKey: safePublicKey(row.packKey),
    contentVersion: safeText(row.contentVersion, 80),
    status: safePublicKey(row.status),
    activatedAt: safeTimestamp(row.activatedAt),
    durabilityEnabled: row.durabilityEnabled === true,
    repairEnabled: row.repairEnabled === true,
  });
}

function observedRecipes(jobs) {
  const recipes = new Map();
  jobs.forEach((job) => {
    const key = job.recipeKey || job.recipeName;
    if (!key) return;
    const current = recipes.get(key) || {
      rowKey: key,
      recipeKey: job.recipeKey,
      recipeName: job.recipeName,
      jobCount: 0,
      claimedCount: 0,
      failedCount: 0,
      latestStartedAt: "",
    };
    current.jobCount += 1;
    if (job.status === "claimed") current.claimedCount += 1;
    if (job.status === "failed") current.failedCount += 1;
    if (job.startedAt && (!current.latestStartedAt || job.startedAt > current.latestStartedAt)) {
      current.latestStartedAt = job.startedAt;
    }
    recipes.set(key, current);
  });
  return [...recipes.values()]
    .sort((left, right) => left.recipeName.localeCompare(right.recipeName))
    .map((recipe) => Object.freeze(recipe));
}

/**
 * Normalizes only the fields exposed by the current Admin Crafting oversight DTO.
 * It never synthesizes recipe input/output lines or Inventory ownership records.
 */
export function normalizeCraftingReadModel(result) {
  const source = craftingData(result);
  if (!source) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }

  const jobs = source.jobs.slice(0, 250).map(normalizeJob).filter(Boolean);
  const effects = source.effects.slice(0, 500).map(normalizeEffect).filter(Boolean);
  const supply = source.supply.slice(0, 1_000).map(normalizeSupply).filter(Boolean);
  const invariants = normalizeInvariants(source.invariants);
  const pack = normalizePack(source.pack);
  const recipes = observedRecipes(jobs);
  const invariantViolations = [
    invariants.negativeOwned,
    invariants.negativeReserved,
    invariants.reservedAboveOwned,
    invariants.reservationProjectionMismatch,
    invariants.duplicateOutputGrants,
  ].reduce((sum, value) => sum + value, 0);

  return deepFreeze({
    schemaVersion: Number.isSafeInteger(Number(source.schemaVersion)) ? Number(source.schemaVersion) : 1,
    pack,
    jobs,
    recipes,
    effects,
    supply,
    invariants,
    summary: {
      observedRecipeCount: recipes.length,
      activeJobCount: jobs.filter((job) => job.status === "in_progress").length,
      claimedJobCount: jobs.filter((job) => job.status === "claimed").length,
      failedJobCount: jobs.filter((job) => job.status === "failed").length,
      constrainedSupplyCount: supply.filter((item) => (
        ["constrained", "scarce", "unavailable"].includes(item.scarcityBand)
      )).length,
      invariantViolations,
    },
    isEmpty: jobs.length === 0 && effects.length === 0 && supply.length === 0 && !pack.packKey,
  });
}

export function isCraftingJobStatus(status) {
  return JOB_STATUSES.has(status);
}
