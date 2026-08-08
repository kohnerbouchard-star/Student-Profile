import {
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import { createAdminErrorEnvelope, isAdminErrorEnvelope, normalizeAdminError } from "../../core/error-envelope.js";
import { LogsRoute } from "./LogsRoute.js";
import { normalizeLogsQuery } from "./LogsApi.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const AUTH_MATERIAL_PATTERN = /(?:\bbearer\s+[A-Za-z0-9._~-]{8,}|\bservice[_-]?role\b|\bsupabase_service_role_key\b|\baccess[_-]?token\b|\brefresh[_-]?token\b|\bauthorization\s*:|\bpassword\s*[=:]|\bcookie\s*:|\brecovery[_-]?code\b|\bone[_-]?time[_-]?password\b|\botp\b|\bsb_(?:secret|service[_-]?role)[A-Za-z0-9._~-]*|\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}|\bAKIA[0-9A-Z]{12,}|\bgh[oprsu]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[baprs]-[A-Za-z0-9-]{10,}|(?:postgres(?:ql)?|mysql):\/\/\S+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:api[_-]?key|secret|token|password)\s*[=:]\s*\S+)/i;
const SQL_PATTERN = /\b(?:select|insert|update|delete|drop|alter|create|grant|revoke)\b[\s\S]{0,120}\b(?:from|into|table|where|role|schema)\b/i;
const STACK_PATTERN = /(?:^|\n)\s*at\s+(?:[\w.$<>]+\s+)?\(?[^)\n]+:\d+:\d+\)?|\b(?:error|exception):[\s\S]{0,400}\bat\s+(?:[\w.$<>]+\s+)?\(?[^)\n]+:\d+:\d+\)?/i;
const SENSITIVE_KEY_PATTERN = /(?:^|_)(?:id|uuid|owner|ownership|actor|target|staff|player|user|email|phone|ip|device|token|secret|service_role|api_key|password|credential|authorization|cookie|session|jwt|sql|query|stack|trace|otp|mfa|recovery|access_code|join_code|idempotency)(?:$|_)/i;
const OUTCOME_KEYS = Object.freeze(["outcome", "status", "result", "success"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function scalarText(value, maximum = 500) {
  if (!["string", "number", "boolean"].includes(typeof value)) return "";
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  const source = String(value ?? "").trim();
  if (!source || UUID_IN_TEXT_PATTERN.test(source) || JWT_PATTERN.test(source) || AUTH_MATERIAL_PATTERN.test(source) || SQL_PATTERN.test(source) || STACK_PATTERN.test(source)) {
    return "";
  }
  return source.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function displayLabel(value, fallback = "Not reported") {
  const text = scalarText(value, 160);
  return text
    ? text.replace(/[._-]+/g, " ").replace(/\b\p{Letter}/gu, (letter) => letter.toLocaleUpperCase())
    : fallback;
}

function safeTimestamp(value) {
  const source = scalarText(value, 80);
  if (!source) return "";
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function safeMetadataValue(value) {
  if (["string", "number", "boolean"].includes(typeof value)) {
    const text = scalarText(value, 320);
    return text || null;
  }
  if (!Array.isArray(value)) return null;
  const values = value.slice(0, 4).map((entry) => scalarText(entry, 100)).filter(Boolean);
  return values.length ? values.join(", ") : null;
}

function canonicalMetadataKey(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLocaleLowerCase();
}

function sensitiveMetadataKey(value) {
  const canonical = canonicalMetadataKey(value);
  return !canonical || SENSITIVE_KEY_PATTERN.test(`_${canonical}_`);
}

function safeMetadata(metadata) {
  if (!isRecord(metadata)) return Object.freeze([]);
  const entries = [];
  for (const [key, rawValue] of Object.entries(metadata)) {
    if (entries.length >= 8) break;
    const safeKey = scalarText(key, 80);
    if (!safeKey || sensitiveMetadataKey(safeKey)) continue;
    const value = safeMetadataValue(rawValue);
    if (!value) continue;
    entries.push(Object.freeze({
      key: safeKey,
      label: displayLabel(safeKey, "Metadata"),
      value,
    }));
  }
  return Object.freeze(entries);
}

function outcome(metadata) {
  if (!isRecord(metadata)) return "Not reported";
  for (const key of OUTCOME_KEYS) {
    if (!Object.hasOwn(metadata, key)) continue;
    if (key === "success" && typeof metadata[key] === "boolean") {
      return metadata[key] ? "Succeeded" : "Failed";
    }
    const value = scalarText(metadata[key], 120);
    if (value) return displayLabel(value);
  }
  return "Not reported";
}

function category(row) {
  const explicit = isRecord(row?.metadata) ? scalarText(row.metadata.category, 120) : "";
  if (explicit) return displayLabel(explicit);
  const action = scalarText(row?.action || row?.type, 240);
  const namespace = action.includes(".") ? action.split(".")[0] : "";
  if (namespace) return displayLabel(namespace);
  const target = scalarText(row?.targetType, 120);
  return displayLabel(target, "General");
}

function actorPresentation(value) {
  const type = scalarText(value, 80).toLocaleLowerCase();
  const known = {
    staff: "Staff administrator",
    admin: "Staff administrator",
    administrator: "Staff administrator",
    player: "Player",
    system: "System",
    service: "System service",
    simulation: "Simulation",
  };
  return known[type] || displayLabel(type, "Unknown actor");
}

function normalizeLog(row, index, page) {
  if (!isRecord(row)) return null;
  const action = scalarText(row.action || row.type, 240);
  const timestamp = safeTimestamp(row.timestamp || row.createdAt);
  if (!action && !timestamp) return null;
  return Object.freeze({
    rowKey: `log-${page}-${index + 1}`,
    timestamp,
    actor: actorPresentation(row.actorType),
    action: action || "Action unavailable",
    target: displayLabel(row.targetType, "General operation"),
    category: category(row),
    outcome: outcome(row.metadata),
    metadata: safeMetadata(row.metadata),
  });
}

function positiveInteger(value, fallback, maximum = 1_000_000_000) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : fallback;
}

function normalizePagination(data, rowsLength) {
  const source = isRecord(data?.pagination) ? data.pagination : {};
  const page = Math.max(1, positiveInteger(source.page, 1));
  const pageSize = Math.max(1, Math.min(500, positiveInteger(source.pageSize, Math.max(1, rowsLength))));
  const total = positiveInteger(source.total ?? data?.total, rowsLength);
  const totalPages = Math.max(1, positiveInteger(source.totalPages, Math.ceil(total / pageSize) || 1));
  return Object.freeze({
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: typeof source.hasNextPage === "boolean" ? source.hasNextPage : page < totalPages,
    hasPreviousPage: typeof source.hasPreviousPage === "boolean" ? source.hasPreviousPage : page > 1,
  });
}

export function normalizeLogsReadModel(result) {
  const data = result?.payload?.data ?? result?.data ?? result;
  if (!isRecord(data)) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const sourceRows = Array.isArray(data.logs) ? data.logs : Array.isArray(data.auditLogs) ? data.auditLogs : null;
  if (!sourceRows) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const provisionalPagination = normalizePagination(data, sourceRows.length);
  const logs = sourceRows.slice(0, 500)
    .map((row, index) => normalizeLog(row, index, provisionalPagination.page))
    .filter(Boolean);
  const pagination = normalizePagination(data, logs.length);
  return deepFreeze({
    logs,
    pagination,
    isEmpty: logs.length === 0,
  });
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

export function createLogsController({ api, selectedGameId, hasPermission = () => false, onChange = () => {} } = {}) {
  if (typeof api?.readLogs !== "function") throw new TypeError("Logs API readLogs is unavailable.");
  let state = createAdminDataState();
  let filters = normalizeLogsQuery({ page: 1, pageSize: 50 });
  let requestVersion = 0;
  let destroyed = false;
  let currentView = null;

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load(nextFilters = null) {
    if (destroyed || !hasPermission("audit.read")) return state;
    if (nextFilters) filters = normalizeLogsQuery({ ...filters, ...nextFilters });
    api.cancelLogsRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const result = await api.readLogs({ gameId: selectedGameId, filters });
      if (destroyed || version !== requestVersion || result?.current === false) return state;
      const model = normalizeLogsReadModel(result);
      filters = normalizeLogsQuery({ ...filters, page: model.pagination.page, pageSize: model.pagination.pageSize });
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

  function applyFilters(nextFilters = {}) {
    filters = normalizeLogsQuery({ ...filters, ...nextFilters, page: 1 });
    return load();
  }

  function clearFilters() {
    filters = normalizeLogsQuery({ page: 1, pageSize: filters.pageSize });
    return load();
  }

  function setPage(page) {
    filters = normalizeLogsQuery({ ...filters, page });
    return load();
  }

  function render() {
    currentView?.destroy?.();
    currentView = LogsRoute({
      state,
      filters,
      onRefresh: load,
      onApplyFilters: applyFilters,
      onClearFilters: clearFilters,
      onPageChange: setPage,
    });
    return currentView;
  }

  function deactivate() {
    api.cancelLogsRequest?.();
    requestVersion += 1;
    currentView?.destroy?.();
    currentView = null;
  }

  function destroy() {
    if (destroyed) return;
    deactivate();
    destroyed = true;
  }

  return Object.freeze({
    load,
    render,
    deactivate,
    destroy,
    getState: () => state,
    getFilters: () => filters,
    applyFilters,
    clearFilters,
    setPage,
  });
}
