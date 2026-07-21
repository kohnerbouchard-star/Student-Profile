import { ApiRequestError } from "./errors.js";

const THREAD_ID = /^thr_[0-9a-f]{32}$/;
const PLAYER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MESSAGING_BACKEND_ROUTE_KEYS = Object.freeze([
  "messages",
  "messageThread",
  "messagePolicy",
  "messageSearch",
  "messageThreadCreate",
  "messageSend",
  "messageRead",
]);
const KEYS = new Set(MESSAGING_BACKEND_ROUTE_KEYS);

function required(value, field, endpointKey) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result) return result;
  throw new ApiRequestError(`${field} is required for ${endpointKey}.`, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function threadId(value, endpointKey) {
  const result = required(value, "threadId", endpointKey).toLowerCase();
  if (THREAD_ID.test(result)) return result;
  throw new ApiRequestError("A valid public thread ID is required.", {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function idempotency(payload, endpointKey) {
  const result = required(payload?.idempotencyKey, "idempotencyKey", endpointKey);
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) return result;
  throw new ApiRequestError("A safe idempotency key is required.", {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function queryPath(path, values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function hasMessagingBackendRoute(endpointKey) {
  return KEYS.has(endpointKey);
}

export function resolveMessagingBackendRequest({ endpointKey, payload = {}, params = {} }) {
  if (endpointKey === "messages") {
    return {
      method: "GET",
      path: queryPath("/players/me/messages", {
        threadLimit: payload.threadLimit,
        messageLimit: payload.messageLimit,
      }),
    };
  }
  if (endpointKey === "messagePolicy") {
    return { method: "GET", path: "/players/me/messages/policy" };
  }
  if (endpointKey === "messageSearch") {
    return {
      method: "GET",
      path: queryPath("/players/me/messages/search", {
        q: required(payload.query || payload.q, "query", endpointKey),
        threadLimit: payload.threadLimit,
        messageLimit: payload.messageLimit,
      }),
    };
  }
  if (endpointKey === "messageThread") {
    const id = threadId(params.threadId || payload.threadId, endpointKey);
    return { method: "GET", path: `/players/me/messages/threads/${encodeURIComponent(id)}` };
  }
  if (endpointKey === "messageThreadCreate") {
    const recipientPlayerId = required(payload.recipientPlayerId, "recipientPlayerId", endpointKey);
    if (!PLAYER_ID.test(recipientPlayerId) || UUID.test(recipientPlayerId)) {
      throw new ApiRequestError("Recipient must use a public Player ID.", {
        code: "INVALID_REQUEST",
        endpointKey,
      });
    }
    return {
      method: "POST",
      path: "/players/me/messages/threads",
      payload: {
        recipientPlayerId,
        title: required(payload.title, "title", endpointKey),
        body: required(payload.body, "body", endpointKey),
        idempotencyKey: idempotency(payload, endpointKey),
      },
    };
  }
  if (endpointKey === "messageSend") {
    const id = threadId(params.threadId || payload.threadId, endpointKey);
    return {
      method: "POST",
      path: `/players/me/messages/threads/${encodeURIComponent(id)}/messages`,
      payload: {
        body: required(payload.body, "body", endpointKey),
        idempotencyKey: idempotency(payload, endpointKey),
      },
    };
  }
  if (endpointKey === "messageRead") {
    const source = params.threadId || payload.threadId;
    const id = threadId(source, endpointKey);
    return {
      method: "POST",
      path: `/players/me/messages/threads/${encodeURIComponent(id)}/read`,
      payload: undefined,
    };
  }
  return null;
}
