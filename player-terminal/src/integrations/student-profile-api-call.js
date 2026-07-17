import { resolvePlayerBackendRequest } from "../api/backend-routes.js";
import { ApiConnectionPendingError, ApiRequestError } from "../api/errors.js";
import { mergeTerminalRead, normalizeTerminalBootstrap } from "../api/read-model.js";
import { createEmptyReadModels } from "../data/empty-read-models.js";

const CLIENT_OWNERSHIP_FIELDS = new Set([
  "playerId",
  "playerUuid",
  "playerUUID",
  "playerSessionId",
  "recipientPlayerUuid",
  "recipientPlayerUUID",
  "senderPlayerUuid",
  "senderPlayerUUID"
]);

const READ_MODEL_KEYS = new Set([
  "countries",
  "news",
  "market",
  "marketAsset",
  "portfolio",
  "store",
  "contracts",
  "inventory",
  "banking",
  "notifications"
]);

function normalizedBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function assertNoClientOwnershipFields(payload, endpointKey) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  for (const key of Object.keys(payload)) {
    if (!CLIENT_OWNERSHIP_FIELDS.has(key)) continue;
    throw new ApiRequestError("Player ownership is resolved from the authenticated session.", {
      code: "INVALID_REQUEST",
      endpointKey
    });
  }
}

function backendPayload(context) {
  const payload = context.payload && typeof context.payload === "object" && !Array.isArray(context.payload)
    ? { ...context.payload }
    : context.payload;
  if (payload && typeof payload === "object" && context.idempotencyKey) {
    payload.idempotencyKey = context.idempotencyKey;
  }
  return payload;
}

function headersFor(context) {
  const token = String(context.session?.playerSessionToken || "").trim();
  if (!token) {
    throw new ApiRequestError("Your player session has expired. Reconnect through the Econovaria sign-in screen.", {
      status: 401,
      code: "SESSION_INVALID",
      endpointKey: context.endpointKey,
      requestId: context.requestId
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

export function createStudentProfileFetchRequest({
  apiBaseUrl = "/functions/v1/classroom-api",
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const baseUrl = normalizedBaseUrl(apiBaseUrl);

  return async function studentProfileFetchRequest({ method, path, payload, headers, signal }) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" || payload === undefined
        ? undefined
        : JSON.stringify(payload),
      signal,
      credentials: "same-origin"
    });
    const body = await readBody(response);
    if (!response.ok) {
      throw new ApiRequestError("The game service could not complete the request.", {
        status: response.status,
        code: responseCode(body),
        retryAfterMs: retryAfterMs(response)
      });
    }
    return body;
  };
}

export function createStudentProfileApiCall({ request } = {}) {
  if (typeof request !== "function") throw new TypeError("A Student-Profile request function is required.");

  let rawSession = null;
  let snapshot = createEmptyReadModels();
  let sessionToken = "";

  return async function studentProfileApiCall(context) {
    assertNoClientOwnershipFields(context.payload, context.endpointKey);

    const currentToken = String(context.session?.playerSessionToken || "");
    if (currentToken !== sessionToken) {
      sessionToken = currentToken;
      rawSession = null;
      snapshot = createEmptyReadModels();
    }

    const payload = backendPayload(context);
    const backendRequest = resolvePlayerBackendRequest({
      ...context,
      payload,
      session: context.session
    });
    if (!backendRequest) {
      throw new ApiConnectionPendingError({
        endpointKey: context.endpointKey,
        method: context.method,
        path: context.path,
        payload: context.payload
      });
    }

    const raw = await request({
      endpointKey: context.endpointKey,
      method: backendRequest.method,
      path: backendRequest.path,
      payload: backendRequest.payload,
      headers: headersFor(context),
      signal: context.signal,
      requestId: context.requestId,
      idempotencyKey: context.idempotencyKey
    });

    if (context.endpointKey === "session") {
      rawSession = raw;
      snapshot = normalizeTerminalBootstrap(rawSession, {});
      return snapshot.session;
    }

    if (context.endpointKey === "dashboard") {
      if (!rawSession) {
        throw new ApiRequestError("The player session must load before the dashboard.", {
          code: "INVALID_RESPONSE",
          endpointKey: context.endpointKey,
          requestId: context.requestId
        });
      }
      snapshot = normalizeTerminalBootstrap(rawSession, raw);
      return snapshot.dashboard;
    }

    if (READ_MODEL_KEYS.has(context.endpointKey)) {
      snapshot = mergeTerminalRead(snapshot, context.endpointKey, raw);
      return endpointProjection(snapshot, context.endpointKey);
    }

    return raw;
  };
}
