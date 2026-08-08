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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const CAMPAIGN_ID_PATTERN = /^cmp_[0-9a-f]{32}$/;
const EFFECT_ID_PATTERN = /^cec_[0-9a-f]{32}$/;
const ASSIGNMENT_ID_PATTERN = /^acl_[0-9a-f]{32}$/;
const ROUTE_ID_PATTERN = /^rte_[a-z0-9_]+$/;
const LOCATION_ID_PATTERN = /^loc_[a-z0-9_]+$/;
const CLASS_IDS = new Set(WORLD_ARRIVAL_CLASS_IDS);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 500) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const normalized = String(value ?? "").trim();
  if (!normalized || UUID_IN_TEXT_PATTERN.test(normalized)) return "";
  return normalized.slice(0, maximum);
}

function safeToken(value, maximum = 160) {
  return safeText(value, maximum);
}

function safeInteger(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function safeSignedInteger(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : fallback;
}

function safeBoolean(value) {
  return value === true;
}

function safeTimestamp(value) {
  const normalized = safeText(value, 80);
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : "";
}

function safePublicId(value, pattern) {
  const token = String(value || "").trim().toLowerCase();
  return pattern.test(token) ? token : "";
}

function safeCurrency(value) {
  const code = safeText(value, 12).toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{1,11}$/.test(code) ? code : "";
}

function safeStringArray(value, maximum = 50) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.slice(0, maximum).map((item) => safeText(item, 160)).filter(Boolean),
  );
}

function panel(batch, key) {
  const entry = batch?.panels?.[key];
  return entry?.status === "fulfilled" && isRecord(entry.value?.data)
    ? entry.value.data
    : null;
}

function panelStatuses(batch) {
  const result = {};
  for (const [key, entry] of Object.entries(batch?.panels || {})) {
    result[key] = Object.freeze(
      entry?.status === "fulfilled"
        ? { status: "ready", error: null }
        : { status: "failed", error: safeError(entry?.reason) },
    );
  }
  return Object.freeze(result);
}

function normalizeCampaign(row, index) {
  if (!isRecord(row)) return null;
  const campaignId = safePublicId(row.public_id ?? row.publicId, CAMPAIGN_ID_PATTERN);
  return Object.freeze({
    campaignId,
    rowKey: campaignId || `campaign-${index + 1}`,
    packId: safeToken(row.pack_id ?? row.packId),
    packVersion: safeToken(row.pack_version ?? row.packVersion),
    status: safeToken(row.status, 48).toLowerCase(),
    currentPhase: safeToken(row.current_phase ?? row.currentPhase, 80).toLowerCase(),
    revision: safeInteger(row.revision, 0),
    eventSequence: safeInteger(row.event_sequence ?? row.eventSequence, 0),
    outcome: safeText(row.outcome, 240),
    scheduledAt: safeTimestamp(row.scheduled_at ?? row.scheduledAt),
    pausedAt: safeTimestamp(row.paused_at ?? row.pausedAt),
    disabledAt: safeTimestamp(row.disabled_at ?? row.disabledAt),
    completedAt: safeTimestamp(row.completed_at ?? row.completedAt),
    createdAt: safeTimestamp(row.created_at ?? row.createdAt),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function normalizeHistory(row, index) {
  if (!isRecord(row)) return null;
  const sequence = safeInteger(row.sequence, index);
  return Object.freeze({
    rowKey: `${safeToken(row.event_key ?? row.eventKey, 128) || "world-event"}-${sequence}-${index}`,
    eventKey: safeToken(row.event_key ?? row.eventKey, 128),
    triggerKey: safeToken(row.trigger_key ?? row.triggerKey, 128),
    fromPhase: safeToken(row.from_phase ?? row.fromPhase, 80),
    toPhase: safeToken(row.to_phase ?? row.toPhase, 80),
    sequence,
    actorType: safeToken(row.actor_type ?? row.actorType, 80),
    reason: safeText(row.reason, 1_000),
    occurredAt: safeTimestamp(row.occurred_at ?? row.occurredAt),
    createdAt: safeTimestamp(row.created_at ?? row.createdAt),
  });
}

function normalizeEffect(row, index) {
  if (!isRecord(row)) return null;
  const effectId = safePublicId(row.public_id ?? row.publicId, EFFECT_ID_PATTERN);
  return Object.freeze({
    effectId,
    rowKey: effectId || `world-effect-${index + 1}`,
    effectKind: safeToken(row.effect_kind ?? row.effectKind, 80),
    status: safeToken(row.status, 48).toLowerCase(),
    attemptCount: safeInteger(row.attempt_count ?? row.attemptCount, 0),
    lastErrorCode: safeToken(row.last_error_code ?? row.lastErrorCode, 120),
    claimedAt: safeTimestamp(row.claimed_at ?? row.claimedAt),
    completedAt: safeTimestamp(row.completed_at ?? row.completedAt),
    createdAt: safeTimestamp(row.created_at ?? row.createdAt),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function normalizeArrival(row, index) {
  if (!isRecord(row)) return null;
  const assignmentId = safePublicId(
    row.public_id ?? row.publicId,
    ASSIGNMENT_ID_PATTERN,
  );
  const classId = safeToken(row.class_id ?? row.classId, 80).toLowerCase();
  return Object.freeze({
    assignmentId,
    rowKey: assignmentId || `arrival-${index + 1}`,
    countryId: safeToken(row.country_id ?? row.countryId, 160),
    classId: CLASS_IDS.has(classId) ? classId : "",
    source: safeToken(row.source, 120),
    overrideReason: safeText(row.override_reason ?? row.overrideReason, 1_000),
    revision: safeInteger(row.revision, 0),
    assignedAt: safeTimestamp(row.assigned_at ?? row.assignedAt),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function normalizeRuntime(row) {
  if (!isRecord(row)) return null;
  return Object.freeze({
    packId: safeToken(row.pack_id ?? row.packId, 160),
    packVersion: safeToken(row.pack_version ?? row.packVersion, 160),
    revision: safeInteger(row.revision, 0),
    initializedAt: safeTimestamp(row.initialized_at ?? row.initializedAt),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function normalizeLocation(row, index) {
  if (!isRecord(row)) return null;
  const locationId = safePublicId(
    row.public_location_id ?? row.publicLocationId,
    LOCATION_ID_PATTERN,
  ) || safeToken(row.public_location_id ?? row.publicLocationId, 160);
  return Object.freeze({
    locationId,
    rowKey: locationId || `location-${index + 1}`,
    countryId: safeToken(row.country_id ?? row.countryId, 160),
    displayName: safeText(row.display_name ?? row.displayName, 500) || "Unnamed location",
    locationKind: safeToken(row.location_kind ?? row.locationKind, 80),
    availability: safeToken(row.availability, 80),
    revision: safeInteger(row.revision, 0),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function normalizeRoute(row, index) {
  if (!isRecord(row)) return null;
  const routeId = safePublicId(
    row.public_route_id ?? row.publicRouteId,
    ROUTE_ID_PATTERN,
  );
  return Object.freeze({
    routeId,
    rowKey: routeId || `route-${index + 1}`,
    fromLocationId: safeToken(row.from_location_id ?? row.fromLocationId, 160),
    toLocationId: safeToken(row.to_location_id ?? row.toLocationId, 160),
    mode: safeToken(row.mode, 80),
    bidirectional: safeBoolean(row.bidirectional),
    baseCostMinor: safeInteger(row.base_cost_minor ?? row.baseCostMinor, null),
    baseDurationMinutes: safeInteger(
      row.base_duration_minutes ?? row.baseDurationMinutes,
      null,
    ),
    status: safeToken(row.status, 48).toLowerCase(),
    reason: safeToken(row.reason, 80),
    costMultiplierBasisPoints: safeInteger(
      row.cost_multiplier_basis_points ?? row.costMultiplierBasisPoints,
      10_000,
    ),
    durationMultiplierBasisPoints: safeInteger(
      row.duration_multiplier_basis_points ?? row.durationMultiplierBasisPoints,
      10_000,
    ),
    revision: safeInteger(row.revision, 0),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function normalizeTravelState(row, index) {
  if (!isRecord(row)) return null;
  return Object.freeze({
    rowKey: `travel-state-${index + 1}`,
    currentLocationId: safeToken(
      row.current_location_id ?? row.currentLocationId,
      160,
    ),
    status: safeToken(row.status, 80),
    arrivalAt: safeTimestamp(row.arrival_at ?? row.arrivalAt),
    revision: safeInteger(row.revision, 0),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function normalizeJourney(row, index) {
  if (!isRecord(row)) return null;
  const publicId = safeText(row.public_id ?? row.publicId, 160);
  return Object.freeze({
    rowKey: publicId || `journey-${index + 1}`,
    fromLocationId: safeToken(row.from_location_id ?? row.fromLocationId, 160),
    toLocationId: safeToken(row.to_location_id ?? row.toLocationId, 160),
    currencyCode: safeCurrency(row.currency_code ?? row.currencyCode),
    totalCostMinor: safeInteger(row.total_cost_minor ?? row.totalCostMinor, null),
    totalDurationMinutes: safeInteger(
      row.total_duration_minutes ?? row.totalDurationMinutes,
      null,
    ),
    status: safeToken(row.status, 80),
    departedAt: safeTimestamp(row.departed_at ?? row.departedAt),
    arrivalAt: safeTimestamp(row.arrival_at ?? row.arrivalAt),
    completedAt: safeTimestamp(row.completed_at ?? row.completedAt),
    createdAt: safeTimestamp(row.created_at ?? row.createdAt),
  });
}

function normalizeResidency(row, index) {
  if (!isRecord(row)) return null;
  return Object.freeze({
    rowKey: `residency-${index + 1}`,
    currentCountryId: safeToken(
      row.current_country_id ?? row.currentCountryId,
      160,
    ),
    currencyCode: safeCurrency(row.currency_code ?? row.currencyCode),
    eligibleCountryIds: safeStringArray(
      row.eligible_country_ids ?? row.eligibleCountryIds,
      50,
    ),
    pendingCountryId: safeToken(
      row.pending_country_id ?? row.pendingCountryId,
      160,
    ),
    revision: safeInteger(row.revision, 0),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function buildCountries({ locations, arrivals, residency }) {
  const countries = new Map();

  function ensure(countryId) {
    const key = safeToken(countryId, 160);
    if (!key) return null;
    if (!countries.has(key)) {
      countries.set(key, {
        countryId: key,
        locationCount: 0,
        arrivalCount: 0,
        residencyCount: 0,
        pendingResidencyCount: 0,
        currencies: new Set(),
      });
    }
    return countries.get(key);
  }

  locations.forEach((location) => {
    const country = ensure(location.countryId);
    if (country) country.locationCount += 1;
  });

  arrivals.forEach((assignment) => {
    const country = ensure(assignment.countryId);
    if (country) country.arrivalCount += 1;
  });

  residency.forEach((record) => {
    const current = ensure(record.currentCountryId);
    if (current) {
      current.residencyCount += 1;
      if (record.currencyCode) current.currencies.add(record.currencyCode);
    }
    const pending = ensure(record.pendingCountryId);
    if (pending) pending.pendingResidencyCount += 1;
    record.eligibleCountryIds.forEach(ensure);
  });

  return Object.freeze([...countries.values()]
    .map((country) => Object.freeze({
      countryId: country.countryId,
      rowKey: country.countryId,
      locationCount: country.locationCount,
      arrivalCount: country.arrivalCount,
      residencyCount: country.residencyCount,
      pendingResidencyCount: country.pendingResidencyCount,
      currencies: Object.freeze([...country.currencies].sort()),
    }))
    .sort((left, right) => left.countryId.localeCompare(right.countryId)));
}

function buildCurrencies({ residency, journeys }) {
  const currencies = new Map();

  function ensure(code) {
    const currencyCode = safeCurrency(code);
    if (!currencyCode) return null;
    if (!currencies.has(currencyCode)) {
      currencies.set(currencyCode, {
        currencyCode,
        residencyCount: 0,
        journeyCount: 0,
        journeyCostMinor: 0,
      });
    }
    return currencies.get(currencyCode);
  }

  residency.forEach((record) => {
    const currency = ensure(record.currencyCode);
    if (currency) currency.residencyCount += 1;
  });

  journeys.forEach((journey) => {
    const currency = ensure(journey.currencyCode);
    if (!currency) return;
    currency.journeyCount += 1;
    if (journey.totalCostMinor !== null) {
      currency.journeyCostMinor += journey.totalCostMinor;
    }
  });

  return Object.freeze([...currencies.values()]
    .map((currency) => Object.freeze({
      ...currency,
      rowKey: currency.currencyCode,
    }))
    .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode)));
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/** Builds the World Management view model while dropping private UUID-backed fields. */
export function normalizeWorldManagementReadModel(batch) {
  const campaignData = panel(batch, "campaign") || {};
  const historyData = panel(batch, "history") || {};
  const effectsData = panel(batch, "effects") || {};
  const arrivalsData = panel(batch, "arrivals") || {};
  const geographyData = panel(batch, "geography") || {};
  const travelData = panel(batch, "travel") || {};
  const residencyData = panel(batch, "residency") || {};

  const campaigns = (Array.isArray(campaignData.campaigns) ? campaignData.campaigns : [])
    .slice(0, 20).map(normalizeCampaign).filter(Boolean);
  const history = (Array.isArray(historyData.history) ? historyData.history : [])
    .slice(0, 250).map(normalizeHistory).filter(Boolean);
  const effects = (Array.isArray(effectsData.effects) ? effectsData.effects : [])
    .slice(0, 250).map(normalizeEffect).filter(Boolean);
  const arrivals = (Array.isArray(arrivalsData.assignments) ? arrivalsData.assignments : [])
    .slice(0, 250).map(normalizeArrival).filter(Boolean);
  const locations = (Array.isArray(geographyData.locations) ? geographyData.locations : [])
    .slice(0, 1_000).map(normalizeLocation).filter(Boolean);
  const routes = (Array.isArray(geographyData.routes) ? geographyData.routes : [])
    .slice(0, 1_000).map(normalizeRoute).filter(Boolean);
  const travelStates = (Array.isArray(travelData.states) ? travelData.states : [])
    .slice(0, 250).map(normalizeTravelState).filter(Boolean);
  const journeys = (Array.isArray(travelData.journeys) ? travelData.journeys : [])
    .slice(0, 250).map(normalizeJourney).filter(Boolean);
  const residency = (Array.isArray(residencyData.residency) ? residencyData.residency : [])
    .slice(0, 250).map(normalizeResidency).filter(Boolean);
  const runtime = normalizeRuntime(geographyData.runtime);
  const countries = buildCountries({ locations, arrivals, residency });
  const currencies = buildCurrencies({ residency, journeys });
  const scheduler = isRecord(campaignData.scheduler)
    ? Object.freeze({
      due: safeInteger(campaignData.scheduler.due, 0),
      active: safeInteger(campaignData.scheduler.active, 0),
      paused: safeInteger(campaignData.scheduler.paused, 0),
      emergencyDisabled: safeInteger(campaignData.scheduler.emergencyDisabled, 0),
    })
    : Object.freeze({ due: 0, active: 0, paused: 0, emergencyDisabled: 0 });

  const model = {
    runtime,
    campaign: Object.freeze({
      current: campaigns[0] || null,
      campaigns: Object.freeze(campaigns),
      scheduler,
      history: Object.freeze(history),
    }),
    effects: Object.freeze(effects),
    arrivals: Object.freeze(arrivals),
    geography: Object.freeze({
      locations: Object.freeze(locations),
      routes: Object.freeze(routes),
    }),
    travel: Object.freeze({
      states: Object.freeze(travelStates),
      journeys: Object.freeze(journeys),
    }),
    residency: Object.freeze(residency),
    countries,
    currencies,
    panels: panelStatuses(batch),
    summary: Object.freeze({
      countryCount: countries.length,
      currencyCount: currencies.length,
      locationCount: locations.length,
      routeCount: routes.length,
      activeJourneyCount: journeys.filter((journey) =>
        !["completed", "cancelled", "failed"].includes(journey.status.toLowerCase())
      ).length,
      residencyCount: residency.length,
      failedEffectCount: effects.filter((effect) => effect.status === "failed").length,
    }),
  };
  model.isEmpty = !runtime
    && campaigns.length === 0
    && effects.length === 0
    && arrivals.length === 0
    && locations.length === 0
    && routes.length === 0
    && journeys.length === 0
    && residency.length === 0;

  return deepFreeze(model);
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
