import {
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
import { NewsEventsRoute } from "./NewsEventsRoute.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const EFFECT_ID_PATTERN = /^cec_[0-9a-f]{32}$/i;
const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const PUBLIC_PHASES = new Set([
  "arrival",
  "opportunity",
  "rivalry",
  "shortage",
  "meridian_disruption",
  "open_conflict",
  "adaptation",
  "reconstruction",
  "continued_conflict",
]);
const EFFECT_STATUSES = new Set(["pending", "processing", "completed", "failed"]);
const CAMPAIGN_STATUSES = new Set(["active", "paused", "emergency_disabled", "completed"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function safeText(value, maximum = 1_000) {
  if (!["string", "number", "boolean"].includes(typeof value)) return "";
  const result = String(value ?? "").trim();
  if (!result || UUID_IN_TEXT_PATTERN.test(result)) return "";
  return result.slice(0, maximum);
}

function safeToken(value, maximum = 160) {
  const result = safeText(value, maximum);
  return PUBLIC_TOKEN_PATTERN.test(result) ? result : "";
}

function safeTimestamp(value) {
  const result = safeText(value, 100);
  return result && Number.isFinite(Date.parse(result)) ? result : "";
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function panel(result, key) {
  const value = result?.panels?.[key];
  return isRecord(value) ? value : null;
}

function panelData(result, key) {
  const value = panel(result, key);
  return value?.status === "fulfilled" && isRecord(value.value?.data) ? value.value.data : null;
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function panelStatus(result, key) {
  const value = panel(result, key);
  if (value?.status === "fulfilled") return Object.freeze({ status: "ready", error: null });
  return Object.freeze({
    status: "failed",
    error: safeError(value?.reason || createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true })),
  });
}

function enumValue(value, allowed, fallback = "unknown") {
  const result = safeText(value, 80).toLowerCase();
  return allowed.has(result) ? result : fallback;
}

function normalizeCampaign(row, index, now) {
  if (!isRecord(row)) return null;
  const status = enumValue(row.status, CAMPAIGN_STATUSES);
  const phase = enumValue(row.current_phase ?? row.currentPhase, PUBLIC_PHASES);
  const scheduledAt = safeTimestamp(row.scheduled_at ?? row.scheduledAt);
  return Object.freeze({
    rowKey: `campaign-${index + 1}`,
    status,
    phase,
    eventSequence: safeInteger(row.event_sequence ?? row.eventSequence),
    scheduledAt,
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
    temporalStatus: status === "active" && scheduledAt && Date.parse(scheduledAt) > now
      ? "upcoming"
      : status === "active"
      ? "active"
      : status === "completed"
      ? "past"
      : "paused",
  });
}

function normalizeHistoryEvent(row, index) {
  if (!isRecord(row)) return null;
  const eventKey = safeToken(row.event_key ?? row.eventKey, 128);
  if (!eventKey) return null;
  const fromPhase = enumValue(row.from_phase ?? row.fromPhase, PUBLIC_PHASES);
  const toPhase = enumValue(row.to_phase ?? row.toPhase, PUBLIC_PHASES);
  return Object.freeze({
    rowKey: `world-event-${index + 1}`,
    kind: "event",
    eventKey,
    triggerKey: safeToken(row.trigger_key ?? row.triggerKey, 160),
    fromPhase,
    toPhase,
    sequence: safeInteger(row.sequence),
    actorType: safeText(row.actor_type ?? row.actorType, 80).toLowerCase() || "system",
    reason: safeText(row.reason, 1_000),
    occurredAt: safeTimestamp(row.occurred_at ?? row.occurredAt),
    createdAt: safeTimestamp(row.created_at ?? row.createdAt),
    lifecycle: "past",
  });
}

function publicationLifecycle(status) {
  if (status === "pending") return "upcoming";
  if (status === "processing") return "active";
  if (status === "completed") return "past";
  if (status === "failed") return "failed";
  return "unknown";
}

function normalizeNewsEffect(row, index) {
  if (!isRecord(row)) return null;
  if (safeText(row.effect_kind ?? row.effectKind, 80).toLowerCase() !== "publish_news") return null;
  const payload = isRecord(row.payload) ? row.payload : {};
  const newsDefinitionId = safeToken(payload.newsDefinitionId ?? payload.news_definition_id, 160);
  if (!newsDefinitionId) return null;
  const status = enumValue(row.status, EFFECT_STATUSES);
  const audience = safeText(payload.audience, 80).toLowerCase();
  return Object.freeze({
    rowKey: `news-publication-${index + 1}`,
    kind: "news",
    newsDefinitionId,
    audience: ["all_players", "affected_locations", "affected_players"].includes(audience)
      ? audience
      : "unknown",
    status,
    lifecycle: publicationLifecycle(status),
    attemptCount: safeInteger(row.attempt_count ?? row.attemptCount) ?? 0,
    lastErrorCode: safeToken(row.last_error_code ?? row.lastErrorCode, 160),
    claimedAt: safeTimestamp(row.claimed_at ?? row.claimedAt),
    completedAt: safeTimestamp(row.completed_at ?? row.completedAt),
    createdAt: safeTimestamp(row.created_at ?? row.createdAt),
    updatedAt: safeTimestamp(row.updated_at ?? row.updatedAt),
  });
}

function effectResourceId(row) {
  const value = String(row?.public_id ?? row?.publicId ?? "").trim().toLowerCase();
  return EFFECT_ID_PATTERN.test(value) ? value : null;
}

function firstPanelFailure(result) {
  return ["history", "effects", "campaign"]
    .map((key) => panel(result, key)?.reason)
    .find(Boolean);
}

export function normalizeNewsEventsReadModel(result, now = Date.now()) {
  const campaignRows = panelData(result, "campaign")?.campaigns;
  const historyRows = panelData(result, "history")?.history;
  const effectRows = panelData(result, "effects")?.effects;
  const fulfilledCount = [campaignRows, historyRows, effectRows].filter(Array.isArray).length;
  if (fulfilledCount === 0) {
    throw safeError(firstPanelFailure(result) || createAdminErrorEnvelope({
      code: "INVALID_RESPONSE",
      retryable: true,
    }));
  }

  const campaigns = (campaignRows || []).slice(0, 20)
    .map((row, index) => normalizeCampaign(row, index, now)).filter(Boolean);
  const events = (historyRows || []).slice(0, 250)
    .map(normalizeHistoryEvent).filter(Boolean);
  const resourceIds = new Map();
  const news = (effectRows || []).slice(0, 250).map((row, index) => {
    const normalized = normalizeNewsEffect(row, index);
    const resourceId = effectResourceId(row);
    if (normalized && resourceId) resourceIds.set(normalized.rowKey, resourceId);
    return normalized;
  }).filter(Boolean);

  const categories = [...new Set(events.map((item) => item.toPhase).filter((value) => value !== "unknown"))]
    .sort((left, right) => left.localeCompare(right));
  const audiences = [...new Set(news.map((item) => item.audience).filter((value) => value !== "unknown"))]
    .sort((left, right) => left.localeCompare(right));
  const scheduled = campaigns.filter((item) => item.temporalStatus === "upcoming");

  const model = deepFreeze({
    campaigns,
    events,
    news,
    categories,
    audiences,
    summary: {
      eventCount: events.length,
      newsPublicationCount: news.length,
      activeCount: news.filter((item) => item.lifecycle === "active").length,
      upcomingCount: news.filter((item) => item.lifecycle === "upcoming").length + scheduled.length,
      failedCount: news.filter((item) => item.lifecycle === "failed").length,
    },
    panels: {
      campaign: panelStatus(result, "campaign"),
      history: panelStatus(result, "history"),
      effects: panelStatus(result, "effects"),
    },
    isEmpty: events.length === 0 && news.length === 0 && scheduled.length === 0,
  });
  return Object.freeze({ model, resourceIds });
}

function makeRequestId() {
  const random = String(globalThis.crypto?.randomUUID?.() || "").replace(/[^A-Za-z0-9]/g, "");
  return `news-recover:${Date.now()}:${random || Math.random().toString(36).slice(2)}`.slice(0, 160);
}

export function createNewsEventsController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  now = () => Date.now(),
} = {}) {
  for (const method of ["readNewsEvents", "recoverNewsPublication"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`News & Events API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let requestVersion = 0;
  let resourceIds = new Map();
  let filters = Object.freeze({ query: "", type: "all", status: "all", scope: "all" });
  let destroyed = false;

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("world.manage")) return state;
    api.cancelNewsEventsRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readNewsEvents({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion || result?.current === false) return state;
      const normalized = normalizeNewsEventsReadModel(result, now());
      resourceIds = normalized.resourceIds;
      state = resolveAdminDataLoad(state, normalized.model, {
        empty: normalized.model.isEmpty,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  async function recover(rowKey, reason) {
    if (destroyed || !hasPermission("world.manage")) return false;
    const target = resourceIds.get(String(rowKey || ""));
    const row = state.data?.news?.find?.((item) => item.rowKey === rowKey);
    if (!target || row?.status !== "failed") {
      notify({ tone: "error", title: "Recovery unavailable", message: "Only failed authoritative news publication effects can be recovered." });
      return false;
    }
    const reviewedReason = String(reason || "").trim();
    if (reviewedReason.length < 12 || reviewedReason.length > 1_000) {
      notify({ tone: "error", title: "Recovery reason required", message: "Enter a reason between 12 and 1,000 characters before retrying publication." });
      return false;
    }
    try {
      await api.recoverNewsPublication({
        gameId: selectedGameId,
        effectId: target,
        reason: reviewedReason,
        requestId: makeRequestId(),
      });
      notify({ tone: "success", title: "Recovery queued", message: "The failed news publication effect was returned to the authoritative campaign worker." });
      await load();
      return true;
    } catch (error) {
      const safe = safeError(error);
      notify({ tone: "error", title: "Recovery failed", message: safe.userMessage });
      return false;
    }
  }

  function setFilters(next = {}) {
    filters = Object.freeze({
      query: safeText(next.query, 160),
      type: ["all", "event", "news"].includes(next.type) ? next.type : "all",
      status: ["all", "active", "upcoming", "past", "failed"].includes(next.status) ? next.status : "all",
      scope: safeText(next.scope, 80).toLowerCase() || "all",
    });
    return filters;
  }

  return Object.freeze({
    load,
    recover,
    setFilters,
    getState: () => state,
    getFilters: () => filters,
    render() {
      return NewsEventsRoute({
        state,
        filters,
        onFiltersChange: setFilters,
        onRefresh: load,
        onRecover: recover,
      });
    },
    deactivate() {
      api.cancelNewsEventsRequest?.();
    },
    destroy() {
      destroyed = true;
      api.cancelNewsEventsRequest?.();
      resourceIds.clear();
    },
  });
}
