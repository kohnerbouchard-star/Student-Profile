import {
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import { createAdminErrorEnvelope, isAdminErrorEnvelope, normalizeAdminError } from "../../core/error-envelope.js";
import { BusinessRoute } from "./BusinessRoute.js";
import { normalizeBusinessSupervision } from "./BusinessSupervisionModel.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const BUSINESS_KEY_PATTERN = /^biz_[0-9a-f]{32}$/i;
const BUSINESS_STATUSES = new Set(["active", "restructuring", "distressed", "closed"]);
const BUSINESS_TYPES = new Set(["sole_proprietorship", "partnership", "llc", "c_corporation", "corporation", "cooperative"]);

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

function businessDetailRow(result) {
  if (isRecord(result?.data?.business)) return result.data.business;
  if (isRecord(result?.business)) return result.business;
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
  const readinessValue = String(row.operational_readiness ?? row.operationalReadiness ?? "").trim().toLowerCase();
  const attentionFlags = Array.isArray(row.attention_flags ?? row.attentionFlags)
    ? (row.attention_flags ?? row.attentionFlags).map((value) => safeText(value, 80)).filter(Boolean).slice(0, 20)
    : [];
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
    operationalReadiness: ["ready", "attention", "closed", "unknown"].includes(readinessValue) ? readinessValue : "unknown",
    attentionFlags: Object.freeze(attentionFlags),
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
      attentionCount: businesses.filter((business) => business.operationalReadiness === "attention").length,
      averageReputation: reputationValues.length
        ? Math.round(reputationValues.reduce((sum, value) => sum + value, 0) / reputationValues.length)
        : null,
    },
    isEmpty: businesses.length === 0,
    truncated: result?.data?.truncated === true || result?.truncated === true || rows.length > 2000,
  });
}

export function normalizeBusinessDetail(result) {
  const row = businessDetailRow(result);
  const business = normalizeBusiness(row, 0);
  if (!business) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  return deepFreeze({ ...business, supervision: normalizeBusinessSupervision(result?.data?.supervision ?? result?.supervision, business.businessKey) });
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

export function createBusinessController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
} = {}) {
  for (const method of ["readBusinesses", "readBusiness"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Business API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all", country: "all" });
  let requestVersion = 0;
  let destroyed = false;
  let currentView = null;

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

  async function loadDetail(business) {
    if (destroyed || !hasPermission("business.manage")) {
      throw createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false });
    }
    if (!BUSINESS_KEY_PATTERN.test(String(business?.businessKey || ""))) {
      throw createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false });
    }
    try {
      const result = await api.readBusiness({
        gameId: selectedGameId,
        businessKey: business.businessKey,
      });
      const detail = normalizeBusinessDetail(result);
      if (detail.businessKey !== business.businessKey) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
      return detail;
    } catch (error) {
      throw safeError(error);
    }
  }

  function render() {
    currentView?.destroy?.();
    currentView = BusinessRoute({
      state,
      filters,
      onFiltersChange(next) { filters = Object.freeze({ ...filters, ...next }); },
      onRefresh: load,
      onLoadDetail: loadDetail,
    });
    return currentView;
  }

  return Object.freeze({
    load,
    render,
    getState: () => state,
    getFilters: () => filters,
    loadDetail,
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
    },
  });
}
