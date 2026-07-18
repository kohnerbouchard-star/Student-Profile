import { ApiRequestError } from "./errors.js";

const ARRAY_READS = new Set(["countries", "notifications"]);
const READ_ENDPOINTS = new Set([
  "session", "dashboard", "countries", "country", "news", "market", "portfolio", "business",
  "store", "marketplace", "contracts", "inventory", "crafting", "banking", "loans", "messages",
  "progression", "notifications"
]);
const REQUIRED_ARRAY_FIELDS = Object.freeze({
  dashboard: Object.freeze(["worldEvents", "marketPulse"]),
  news: Object.freeze(["categories", "items"]),
  market: Object.freeze(["sectors", "assets"]),
  portfolio: Object.freeze(["history", "allocation", "countryExposure"]),
  business: Object.freeze(["products", "suppliers"]),
  store: Object.freeze(["categories", "items"]),
  marketplace: Object.freeze(["categories", "listings", "myListings"]),
  contracts: Object.freeze(["tabs", "lifecycle", "items"]),
  inventory: Object.freeze(["categories", "items"]),
  crafting: Object.freeze(["recipes", "queue"]),
  banking: Object.freeze(["transactions"]),
  loans: Object.freeze(["offers", "activeLoans", "schedule"]),
  messages: Object.freeze(["threads"]),
  progression: Object.freeze(["reputation", "milestones", "skills", "achievements", "licenses"])
});
const REQUIRED_OBJECT_FIELDS = Object.freeze({
  business: Object.freeze(["company", "operations"]),
  banking: Object.freeze(["checking", "savings"]),
  loans: Object.freeze(["nextPayment"])
});
const MAX_DEPTH = 12;
const MAX_ARRAY_LENGTH = 1000;
const MAX_OBJECT_KEYS = 300;
const MAX_STRING_LENGTH = 5000;
const URL_KEY = /(?:image|imageUrl|avatar|photo|thumbnail|assetUrl|currencySymbolAsset)$/i;

function invalidResponse(endpointKey, requestId, path) {
  return new ApiRequestError("This section received incomplete data and could not be opened safely.", {
    code: "INVALID_RESPONSE",
    endpointKey,
    requestId,
    path
  });
}

function allowedRemoteUrl(value, config) {
  const text = String(value || "").trim();
  if (!text || /^\s*(?:javascript|vbscript|file):/i.test(text) || text.startsWith("//")) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) return text.slice(0, MAX_STRING_LENGTH);

  try {
    const parsed = new URL(text);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) return "";
    const allowed = new Set((config.allowedImageHosts || []).map((host) => String(host).toLowerCase()));
    const currentHost = String(globalThis.location?.hostname || "").toLowerCase();
    if (currentHost) allowed.add(currentHost);
    return allowed.has(parsed.hostname.toLowerCase()) ? parsed.href.slice(0, MAX_STRING_LENGTH) : "";
  } catch {
    return "";
  }
}

function sanitizeValue(value, config, depth = 0, key = "") {
  if (depth > MAX_DEPTH) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    return URL_KEY.test(key)
      ? allowedRemoteUrl(value, config)
      : value.slice(0, MAX_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, config, depth + 1));
  }
  if (typeof value !== "object") return null;

  const output = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    if (["__proto__", "constructor", "prototype"].includes(childKey)) continue;
    output[childKey] = sanitizeValue(childValue, config, depth + 1, childKey);
  }
  return output;
}

function unwrap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (Object.prototype.hasOwnProperty.call(raw, "data") && (raw.ok === true || Object.keys(raw).length <= 3)) return raw.data;
  return raw;
}

function applySafeDefaults(endpointKey, value) {
  if (endpointKey === "news" && !Array.isArray(value.categories)) value.categories = ["All"];
  if (endpointKey === "store" && !Array.isArray(value.categories)) value.categories = ["All"];
  if (endpointKey === "market" && !Array.isArray(value.sectors)) value.sectors = ["All"];
  return value;
}

function validateEndpointShape(endpointKey, value, context) {
  for (const key of REQUIRED_ARRAY_FIELDS[endpointKey] || []) {
    if (!Array.isArray(value[key])) throw invalidResponse(endpointKey, context.requestId, context.path);
  }
  for (const key of REQUIRED_OBJECT_FIELDS[endpointKey] || []) {
    if (!value[key] || typeof value[key] !== "object" || Array.isArray(value[key])) {
      throw invalidResponse(endpointKey, context.requestId, context.path);
    }
  }
}

export function normalizeApiResponse(endpointKey, raw, context = {}) {
  let value = sanitizeValue(unwrap(raw), context.config || {});
  if (!READ_ENDPOINTS.has(endpointKey)) return value;

  if (ARRAY_READS.has(endpointKey)) {
    if (!Array.isArray(value)) throw invalidResponse(endpointKey, context.requestId, context.path);
  } else if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse(endpointKey, context.requestId, context.path);
  }

  if (endpointKey === "session") {
    for (const key of ["displayName", "gameSessionId", "currencyCode"]) {
      if (typeof value[key] !== "string" || !value[key].trim()) throw invalidResponse(endpointKey, context.requestId, context.path);
    }
  }
  if (!ARRAY_READS.has(endpointKey)) {
    value = applySafeDefaults(endpointKey, value);
    validateEndpointShape(endpointKey, value, context);
  }
  return value;
}