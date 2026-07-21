import { resolvePlayerBackendRequest } from "../api/backend-routes.js";
import { ApiConnectionPendingError, ApiRequestError } from "../api/errors.js";
import { mergeTerminalRead, normalizeTerminalBootstrap } from "../api/read-model.js";
import { createEmptyReadModels } from "../data/empty-read-models.js";
import { normalizePlayerContracts } from "../features/contracts/contract-read-model.js";
import { normalizePlayerInventory } from "../features/inventory/inventory-read-model.js";
import { validateStudentProfileCapabilityManifest } from "./student-profile-capability-manifest.js";

const CLIENT_OWNERSHIP_FIELDS = new Set([
  "playerId", "playerUuid", "playerUUID", "playerSessionId",
  "recipientPlayerUuid", "recipientPlayerUUID", "senderPlayerUuid", "senderPlayerUUID"
]);

const READ_MODEL_KEYS = new Set([
  "countries", "news", "market", "marketAsset", "portfolio", "store", "banking", "notifications"
]);

function normalizedBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function assertNoClientOwnershipFields(payload, endpointKey) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  for (const key of Object.keys(payload)) {
    if (!CLIENT_OWNERSHIP_FIELDS.has(key)) continue;
    throw new ApiRequestError("Player ownership is resolved from the authenticated session.", {
      code: "INVALID_REQUEST", endpointKey
    });
  }
}

function backendPayload(context) {
  const payload = context.payload && typeof context.payload === "object" && !Array.isArray(context.payload)
    ? { ...context.payload }
    : context.payload;
  if (payload && typeof payload === "object" && context.idempotencyKey) payload.idempotencyKey = context.idempotencyKey;
  return payload;
}

function headersFor(context) {
  const token = String(context.session?.playerSessionToken || "").trim();
  if (!token) {
    throw new ApiRequestError("Your player session has expired. Reconnect through the Econovaria sign-in screen.", {
      status: 401, code: "SESSION_INVALID", endpointKey: context.endpointKey, requestId: context.requestId
    });
  }
  const headers = {
    "content-type": "application/json",
    "x-player-session-token": token,
    "x-request-id": String(context.requestId || "")
  };
  if (context.idempotencyKey) headers["idempotency-key"] = String(context.idempotencyKey);
  return headers;
}

function endpointProjection(snapshot, endpointKey) {
  if (endpointKey === "marketAsset") return snapshot.market;
  return snapshot[endpointKey];
}

function responseCode(body) {
  return String(body?.code || body?.error?.code || "REQUEST_FAILED").toUpperCase();
}

function authoritativeSessionExpiry(raw) {
  const value = String(raw?.session?.expiresAt || raw?.sessionExpiresAt || raw?.expiresAt || "").trim();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function retryAfterMs(response) {
  const value = response.headers?.get?.("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function readBody(response) {
  const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (type.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text.slice(0, 5000) } : {};
}

function applyCapabilityManifest(snapshot, manifest) {
  if (!manifest) return snapshot;
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      capabilities: manifest.capabilities,
      capabilitySchemaVersion: manifest.schemaVersion,
      capabilityManifestVersion: manifest.manifestVersion,
      capabilityService: manifest.service,
      capabilityEndpointKeys: manifest.endpoints.map((endpoint) => endpoint.key)
    }
  };
}

export function createStudentProfileFetchRequest({ apiBaseUrl = "/functions/v1/classroom-api", fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const baseUrl = normalizedBaseUrl(apiBaseUrl);
  return async function studentProfileFetchRequest({ method, path, payload, headers, signal }) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method, headers,
      body: method === "GET" || method === "HEAD" || payload === undefined ? undefined : JSON.stringify(payload),
      signal, credentials: "same-origin"
    });
    const body = await readBody(response);
    if (!response.ok) {
      throw new ApiRequestError("The game service could not complete the request.", {
        status: response.status, code: responseCode(body), retryAfterMs: retryAfterMs(response)
      });
    }
    return body;
  };
}

export function createStudentProfileApiCall({ request } = {}) {
  if (typeof request !== "function") throw new TypeError("A Student-Profile request function is required.");
  let rawSession = null;
  let capabilityManifest = null;
  let snapshot = createEmptyReadModels();
  let sessionToken = "";

  async function loadCapabilityManifest(context) {
    const route = resolvePlayerBackendRequest({ endpointKey: "capabilities", method: "GET", path: "/capabilities", payload: undefined, params: {}, session: context.session });
    if (!route) throw new ApiConnectionPendingError({ endpointKey: "capabilities", method: "GET", path: "/capabilities" });
    const raw = await request({
      endpointKey: "capabilities", method: route.method, path: route.path, payload: route.payload,
      headers: headersFor({ ...context, endpointKey: "capabilities" }), signal: context.signal,
      requestId: context.requestId
    });
    return validateStudentProfileCapabilityManifest(raw);
  }

  return async function studentProfileApiCall(context) {
    assertNoClientOwnershipFields(context.payload, context.endpointKey);
    const currentToken = String(context.session?.playerSessionToken || "");
    if (currentToken !== sessionToken) {
      sessionToken = currentToken;
      rawSession = null;
      capabilityManifest = null;
      snapshot = createEmptyReadModels();
    }

    const payload = backendPayload(context);
    const backendRequest = resolvePlayerBackendRequest({ ...context, payload, session: context.session });
    if (!backendRequest) {
      throw new ApiConnectionPendingError({ endpointKey: context.endpointKey, method: context.method, path: context.path, payload: context.payload });
    }

    const raw = await request({
      endpointKey: context.endpointKey, method: backendRequest.method, path: backendRequest.path,
      payload: backendRequest.payload, headers: headersFor(context), signal: context.signal,
      requestId: context.requestId, idempotencyKey: context.idempotencyKey
    });

    if (context.endpointKey === "session") {
      rawSession = raw;
      capabilityManifest = await loadCapabilityManifest(context);
      snapshot = applyCapabilityManifest(normalizeTerminalBootstrap(rawSession, {}), capabilityManifest);
      const sessionExpiresAt = authoritativeSessionExpiry(rawSession);
      if (sessionExpiresAt) snapshot = { ...snapshot, session: { ...snapshot.session, sessionExpiresAt } };
      return snapshot.session;
    }

    if (context.endpointKey === "dashboard") {
      if (!rawSession || !capabilityManifest) {
        throw new ApiRequestError("The player session and capability manifest must load before the dashboard.", {
          code: "INVALID_RESPONSE", endpointKey: context.endpointKey, requestId: context.requestId
        });
      }
      snapshot = applyCapabilityManifest(normalizeTerminalBootstrap(rawSession, raw), capabilityManifest);
      const sessionExpiresAt = authoritativeSessionExpiry(rawSession);
      if (sessionExpiresAt) snapshot = { ...snapshot, session: { ...snapshot.session, sessionExpiresAt } };
      return snapshot.dashboard;
    }

    if (context.endpointKey === "worldRuntime") {
      snapshot = { ...snapshot, worldRuntime: raw };
      return snapshot.worldRuntime;
    }
    if (context.endpointKey === "contracts") {
      snapshot = { ...snapshot, contracts: normalizePlayerContracts(raw) };
      return snapshot.contracts;
    }
    if (context.endpointKey === "inventory") {
      snapshot = { ...snapshot, inventory: normalizePlayerInventory(raw) };
      return snapshot.inventory;
    }
    if (READ_MODEL_KEYS.has(context.endpointKey)) {
      snapshot = mergeTerminalRead(snapshot, context.endpointKey, raw);
      return endpointProjection(snapshot, context.endpointKey);
    }
    return raw;
  };
}
