import {
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import { createAdminErrorEnvelope, isAdminErrorEnvelope, normalizeAdminError } from "../../core/error-envelope.js";
import { BusinessRoute } from "./BusinessRoute.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const BUSINESS_KEY_PATTERN = /^biz_[0-9a-f]{32}$/i;
const BUSINESS_STATUSES = new Set(["active", "restructuring", "distressed", "closed"]);
const BUSINESS_TYPES = new Set(["sole_proprietorship", "partnership", "corporation", "cooperative"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 500) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonnegative(value) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}

function integer(value) {
  const number = nonnegative(value);
  return Number.isSafeInteger(number) ? number : null;
}

function businessRows(result) {
  if (Array.isArray(result)) return result;
  for (const candidate of [result, result?.data, result?.value, result?.data?.data].filter(isRecord)) {
    if (Array.isArray(candidate.businesses)) return candidate.businesses;
  }
  return null;
}

function ownerModel(value) {
  if (!isRecord(value)) return Object.freeze({ displayName: "Owner unavailable", rosterLabel: "", status: "" });
  return Object.freeze({
    displayName: safeText(value.display_name ?? value.displayName, 160) || "Owner unavailable",
    rosterLabel: safeText(value.roster_label ?? value.rosterLabel, 160),
    status: safeText(value.status, 40).toLowerCase(),
  });
}

function normalizeBusiness(row, index) {
  if (!isRecord(row)) return null;
  const businessKey = String(row.public_key ?? row.businessKey ?? "").trim().toLowerCase();
  if (!BUSINESS_KEY_PATTERN.test(businessKey)) return null;
  const statusValue = String(row.status || "").trim().toLowerCase();
  const typeValue = String(row.entity_type ?? row.entityType ?? "").trim().toLowerCase();
  return Object.freeze({
    rowKey: businessKey || `business-${index + 1}`,
    businessKey,
    legalName: safeText(row.legal_name ?? row.legalName, 240) || "Unnamed business",
    entityType: BUSINESS_TYPES.has(typeValue) ? typeValue : "",
    industryCode: safeText(row.industry_code ?? row.industryCode, 80),
    countryCode: safeText(row.country_code ?? row.countryCode, 32).toUpperCase(),
    currencyCode: safeText(row.currency_code ?? row.currencyCode, 16).toUpperCase(),
    status: BUSINESS_STATUSES.has(statusValue) ? statusValue : "",
    capitalization: nonnegative(row.capitalization),
    reputationScore: integer(row.reputation_score ?? row.reputationScore),
    capacityUnits: integer(row.capacity_units ?? row.capacityUnits),
    failureCount: integer(row.failure_count ?? row.failureCount),
    createdAt: safeText(row.created_at ?? row.createdAt, 80),
    updatedAt: safeText(row.updated_at ?? row.updatedAt, 80),
    closedAt: safeText(row.closed_at ?? row.closedAt, 80),
    owner: ownerModel(row.owner),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function normalizeBusinessReadModel(result) {
  const rows = businessRows(result);
  if (!rows) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const businesses = rows.slice(0, 2_000).map(normalizeBusiness).filter(Boolean);
  const statuses = [...new Set(businesses.map((business) => business.status).filter(Boolean))].sort();
  const countries = [...new Set(businesses.map((business) => business.countryCode).filter(Boolean))].sort();
  const reputationValues = businesses.map((business) => business.reputationScore).filter(Number.isFinite);
  return deepFreeze({
    businesses,
    statuses,
    countries,
    summary: {
      totalCount: businesses.length,
      activeCount: businesses.filter((business) => business.status === "active").length,
      attentionCount: businesses.filter((business) => ["restructuring", "distressed"].includes(business.status)).length,
      averageReputation: reputationValues.length
        ? Math.round(reputationValues.reduce((sum, value) => sum + value, 0) / reputationValues.length)
        : null,
    },
    isEmpty: businesses.length === 0,
  });
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

export function createBusinessController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readBusinesses", "setBusinessCompliance"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Business API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all", country: "all" });
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  const pendingKeys = new Map();
  const activeMutations = new Set();
  const refreshTimers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("business.manage")) return state;
    api.cancelBusinessRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readBusinesses({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion) return state;
      const model = normalizeBusinessReadModel(result);
      state = resolveAdminDataLoad(state, model, { empty: model.isEmpty, requestVersion: version });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function nextKey() {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_IN_TEXT_PATTERN.test(uuid)) throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    return `admin.business.compliance.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  function scheduleRefresh() {
    const timer = globalThis.setTimeout(() => {
      refreshTimers.delete(timer);
      if (!destroyed) void load();
    }, 0);
    refreshTimers.add(timer);
  }

  async function setCompliance(business, input) {
    if (destroyed || !hasPermission("business.manage")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    if (!business?.businessKey) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }) };
    }
    const fingerprint = JSON.stringify({ businessKey: business.businessKey, input });
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }
    let key = pendingKeys.get(fingerprint);
    try {
      if (!key) {
        key = nextKey();
        pendingKeys.set(fingerprint, key);
      }
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
    activeMutations.add(fingerprint);
    try {
      const result = await api.setBusinessCompliance({
        gameId: selectedGameId,
        businessKey: business.businessKey,
        input,
        idempotencyKey: key,
      });
      pendingKeys.delete(fingerprint);
      notify({ tone: "success", title: "Compliance updated", message: `${business.legalName} compliance was updated.` });
      scheduleRefresh();
      return { ok: true, result };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingKeys.delete(fingerprint);
      notify({ tone: "error", title: "Compliance was not updated", message: envelope.userMessage });
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function render() {
    currentView?.destroy?.();
    currentView = BusinessRoute({
      state,
      filters,
      onFiltersChange(next) { filters = Object.freeze({ ...filters, ...next }); },
      onRefresh: load,
      onCompliance: setCompliance,
    });
    return currentView;
  }

  return Object.freeze({
    load,
    render,
    getState: () => state,
    getFilters: () => filters,
    setCompliance,
    deactivate() {
      api.cancelBusinessRequest?.();
      currentView?.destroy?.();
      currentView = null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      api.cancelBusinessRequest?.();
      currentView?.destroy?.();
      currentView = null;
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      pendingKeys.clear();
      activeMutations.clear();
    },
  });
}
