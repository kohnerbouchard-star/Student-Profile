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
import { CraftingRoute } from "./CraftingRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function safeItemKey(value) {
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

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function createCraftingController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readCrafting", "recoverCraftingJob", "applyCraftingSupply"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Crafting API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all" });
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
    if (destroyed || !hasPermission("inventory.redeem")) return state;
    api.cancelCraftingRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const result = await api.readCrafting({ gameId: selectedGameId, limit: 250 });
      if (destroyed || version !== requestVersion) return state;
      const model = normalizeCraftingReadModel(result);
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

  function scheduleAuthoritativeRefresh() {
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
    return `admin.crafting.${action}.${uuid}.${mutationSequence}`.slice(0, 127);
  }

  async function mutate({
    action,
    fingerprintValue,
    request,
    successTitle,
    successMessage,
  }) {
    if (destroyed || !hasPermission("inventory.redeem")) {
      return {
        ok: false,
        error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }),
      };
    }

    const fingerprint = stableStringify({ action, value: fingerprintValue });
    if (activeMutations.has(fingerprint)) {
      return {
        ok: false,
        busy: true,
        error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }),
      };
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
        scheduleAuthoritativeRefresh();
      }
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({
          tone: "error",
          title: "Crafting operation was not committed",
          message: envelope.userMessage,
        });
      }
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function recoverJob(job, input) {
    if (!job?.jobKey) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }),
      });
    }
    const outcome = String(input?.outcome || "").trim().toLowerCase();
    const reason = String(input?.reason || "").trim();
    return mutate({
      action: "recover",
      fingerprintValue: { jobKey: job.jobKey, outcome, reason },
      request: (idempotencyKey) => api.recoverCraftingJob({
        gameId: selectedGameId,
        jobKey: job.jobKey,
        outcome,
        reason,
        idempotencyKey,
      }),
      successTitle: outcome === "requeue" ? "Crafting job requeued" : "Crafting job released",
      successMessage: outcome === "requeue"
        ? `${job.recipeName} was returned to authoritative Crafting processing.`
        : `${job.recipeName} was failed and its active Crafting reservations were released by the server.`,
    });
  }

  function applySupply(itemKey, input) {
    const normalizedItemKey = safeItemKey(itemKey);
    if (!normalizedItemKey) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }),
      });
    }
    return mutate({
      action: "supply",
      fingerprintValue: { itemKey: normalizedItemKey, input },
      request: (idempotencyKey) => api.applyCraftingSupply({
        gameId: selectedGameId,
        itemKey: normalizedItemKey,
        input,
        idempotencyKey,
      }),
      successTitle: "Crafting supply state updated",
      successMessage: `${normalizedItemKey} supply was updated through the existing physical-economy contract.`,
    });
  }

  function updateFilters(nextFilters = {}) {
    const status = String(nextFilters.status ?? filters.status).trim().toLowerCase();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 160),
      status: status === "all" || JOB_STATUSES.has(status) ? status : "all",
    });
  }

  function render() {
    if (destroyed) throw new Error("Crafting controller has been destroyed.");
    currentView?.destroy?.();
    currentView = CraftingRoute({
      state,
      filters,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onRecover: recoverJob,
      onApplySupply: applySupply,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    if (api.cancelCraftingRequest?.() !== true) return;
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
    recoverJob,
    applySupply,
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
      api.cancelCraftingRequest?.();
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      currentView?.destroy?.();
      currentView = null;
      pendingIdempotency.clear();
      activeMutations.clear();
    },
  });
}
