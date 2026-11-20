import {
  ADMIN_API_BASE_PATH, DEFAULT_TIMEOUT_MS, AdminTransportDiagnostic, normalizeTimeout,
} from "./admin-api-diagnostics.js";
import {
  canonicalResponseCode, bodyErrorDiagnostic, invalidResponse, parseJsonResponse, linkAbortSignal,
  abortError, serializeJsonBody, requestAdminJson,
} from "./admin-api-request.js";

import { normalizeAdminError } from "../core/error-envelope.js";
const ADMIN_OVERVIEW_RESOURCE_KEYS = Object.freeze([
  "dashboard",
  "games",
  "notifications",
  "store",
]);
const ADMIN_MARKET_RESOURCE_KEYS = Object.freeze([
  "assets",
  "events",
  "trades",
]);
const ADMIN_MARKET_DETAIL_RESOURCE_KEYS = Object.freeze([
  "profile",
  "chart",
  "financials",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const STORE_CREATE_FIELDS = Object.freeze([
  "itemKey",
  "name",
  "description",
  "category",
  "price",
  "currencyCode",
  "stockQuantity",
  "status",
  "visibility",
  "sortOrder",
]);
const STORE_UPDATE_FIELDS = Object.freeze(STORE_CREATE_FIELDS.filter((field) => field !== "itemKey"));
const PLAYER_CREATE_FIELDS = Object.freeze([
  "displayName",
  "rosterLabel",
  "playerIdentifier",
  "accessCode",
]);
const PLAYER_PROFILE_SETTING_FIELDS = Object.freeze([
  "displayName",
  "status",
  "countryAssignment",
  "adminNote",
]);
const PLAYER_CREDENTIAL_FIELDS = Object.freeze([
  "playerIdentifier",
  "accessCode",
]);

function requireGameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    throw new AdminTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requireItemToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token)) {
    throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(token);
}

function requirePlayerToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token)) {
    throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(token);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function storeCollectionPath(gameId, { includeReadProjection = false } = {}) {
  const path = `/games/${requireGameToken(gameId)}/store/items`;
  return includeReadProjection ? `${path}?include=stock,prices,purchaseStats` : path;
}

function storeItemPath(gameId, itemId) {
  return `${storeCollectionPath(gameId)}/${requireItemToken(itemId)}`;
}

function playersCollectionPath(gameId) {
  return `/games/${requireGameToken(gameId)}/players`;
}

function playerPath(gameId, playerId) {
  return `${playersCollectionPath(gameId)}/${requirePlayerToken(playerId)}`;
}

function playerSettingsPath(gameId, playerId) {
  return `${playerPath(gameId, playerId)}/settings`;
}

function playerCredentialPath(gameId, playerId) {
  return `${playerPath(gameId, playerId)}/access-code/reset`;
}

function marketBasePath(gameId) {
  return `/games/${requireGameToken(gameId)}/market`;
}

function marketResourceSpecs(gameId) {
  return Object.freeze({
    assets: () => `${marketBasePath(gameId)}/assets?include=quotes`,
    events: () => `${marketBasePath(gameId)}/events?status=active,recent`,
    trades: () => `${marketBasePath(gameId)}/trades/recent?scope=all-players`,
  });
}

function marketDetailResourceSpecs(gameId, resourceId) {
  const assetPath = () => `${marketBasePath(gameId)}/assets/${requireItemToken(resourceId)}`;
  return Object.freeze({
    profile: () => `${assetPath()}/profile`,
    chart: () => `${assetPath()}/chart`,
    financials: () => `${assetPath()}/financials`,
  });
}

function overviewResourceSpecs(gameId) {
  return Object.freeze({
    dashboard: () => `/games/${requireGameToken(gameId)}/dashboard`,
    games: () => "/games",
    notifications: () => "/notifications?scope=admin-console",
    store: () => storeCollectionPath(gameId, { includeReadProjection: true }),
  });
}

function storeMutationBody(value, allowedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  const body = {};
  allowedFields.forEach((field) => {
    if (Object.hasOwn(value, field) && value[field] !== undefined) {
      body[field] = value[field];
    }
  });
  if (Object.keys(body).length === 0) {
    throw new AdminTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return body;
}

function playerMutationBody(value, allowedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  const body = {};
  allowedFields.forEach((field) => {
    if (Object.hasOwn(value, field) && value[field] !== undefined) {
      body[field] = value[field];
    }
  });
  if (Object.keys(body).length === 0) {
    throw new AdminTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return body;
}

function validateStoreRead(payload, response) {
  const data = payload?.data;
  if (
    !data
    || typeof data !== "object"
    || Array.isArray(data)
    || (!Array.isArray(data.storeItems) && !Array.isArray(data.items))
  ) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateStoreMutation(payload, response) {
  if (
    payload?.ok !== true
    || !payload.item
    || typeof payload.item !== "object"
    || Array.isArray(payload.item)
  ) {
    throw invalidResponse(response);
  }
  return payload;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validatePlayersRead(payload, response) {
  const data = payload?.data;
  if (!isRecord(data) || (!Array.isArray(data.players) && !Array.isArray(data.roster))) {
    throw invalidResponse(response);
  }
  return payload;
}

function validatePlayerCreate(payload, response) {
  if (payload?.ok !== true || !isRecord(payload.player) || !isRecord(payload.accessCode)) {
    throw invalidResponse(response);
  }
  return payload;
}

function validatePlayerSettings(payload, response) {
  if (!isRecord(payload?.data) || payload.data.saved !== true || !isRecord(payload.data.settings)) {
    throw invalidResponse(response);
  }
  return payload;
}

function validatePlayerCredentials(payload, response) {
  if (payload?.ok !== true || !isRecord(payload.player) || !isRecord(payload.accessCode)) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateMarketArray(payload, response, keys) {
  const data = payload?.data;
  if (!isRecord(data) || !keys.some((key) => Array.isArray(data[key]))) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateMarketObject(payload, response, keys) {
  const data = payload?.data;
  if (!isRecord(data) || !keys.some((key) => isRecord(data[key]))) {
    throw invalidResponse(response);
  }
  return payload;
}

const MARKET_PANEL_VALIDATORS = Object.freeze({
  assets: (payload, response) => validateMarketArray(
    payload,
    response,
    ["assets", "marketplaceSecurities"],
  ),
  events: (payload, response) => validateMarketArray(
    payload,
    response,
    ["events", "marketEvents", "news"],
  ),
  trades: (payload, response) => validateMarketArray(
    payload,
    response,
    ["trades", "marketplaceTrades"],
  ),
});

const MARKET_DETAIL_VALIDATORS = Object.freeze({
  profile: (payload, response) => validateMarketObject(payload, response, ["asset", "profile"]),
  chart: (payload, response) => validateMarketArray(payload, response, ["candles", "chart"]),
  financials: (payload, response) => validateMarketObject(
    payload,
    response,
    ["financials", "fundamentals"],
  ),
});

function asSafeRejection(error) {
  return Promise.reject(
    error && typeof error === "object" && "userMessage" in error
      ? error
      : normalizeAdminError(error, { fieldErrors: error?.fieldErrors }),
  );
}

async function settlePanel(fetchImpl, pathFactory, options) {
  try {
    const path = pathFactory();
    const value = await requestAdminJson(fetchImpl, path, options);
    return Object.freeze({ status: "fulfilled", value });
  } catch (error) {
    const reason = error && typeof error === "object" && "userMessage" in error
      ? error
      : normalizeAdminError(error);
    return Object.freeze({ status: "rejected", reason });
  }
}

export {
  ADMIN_API_BASE_PATH,
  ADMIN_OVERVIEW_RESOURCE_KEYS,
  ADMIN_MARKET_RESOURCE_KEYS,
  ADMIN_MARKET_DETAIL_RESOURCE_KEYS,
  DEFAULT_TIMEOUT_MS,
  UUID_PATTERN,
  OPAQUE_GAME_PATTERN,
  IDEMPOTENCY_KEY_PATTERN,
  STORE_CREATE_FIELDS,
  STORE_UPDATE_FIELDS,
  PLAYER_CREATE_FIELDS,
  PLAYER_PROFILE_SETTING_FIELDS,
  PLAYER_CREDENTIAL_FIELDS,
  AdminTransportDiagnostic,
  normalizeTimeout,
  requireGameToken,
  requireItemToken,
  requirePlayerToken,
  requireIdempotencyKey,
  storeCollectionPath,
  storeItemPath,
  playersCollectionPath,
  playerPath,
  playerSettingsPath,
  playerCredentialPath,
  marketBasePath,
  marketResourceSpecs,
  marketDetailResourceSpecs,
  overviewResourceSpecs,
  canonicalResponseCode,
  bodyErrorDiagnostic,
  invalidResponse,
  parseJsonResponse,
  linkAbortSignal,
  abortError,
  serializeJsonBody,
  requestAdminJson,
  storeMutationBody,
  playerMutationBody,
  validateStoreRead,
  validateStoreMutation,
  isRecord,
  validatePlayersRead,
  validatePlayerCreate,
  validatePlayerSettings,
  validatePlayerCredentials,
  validateMarketArray,
  validateMarketObject,
  MARKET_PANEL_VALIDATORS,
  MARKET_DETAIL_VALIDATORS,
  asSafeRejection,
  settlePanel,
};
