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

function invalid(message, endpointKey) {
  throw new ApiRequestError(message, {
    code: "INVALID_REQUEST",
    endpointKey,
  });
}

function required(value, field, endpointKey) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result) return result;
  return invalid(`${field} is required for ${endpointKey}.`, endpointKey);
}

function boundedText(value, field, maximum, endpointKey) {
  const result = required(value, field, endpointKey);
  if (result.length > maximum) return invalid(`${field} is too long for ${endpointKey}.`, endpointKey);
  return result;
}

function messageBody(value, endpointKey) {
  const result = boundedText(value, "body", 1000, endpointKey);
  const links = result.match(/https?:\/\/[^\s<>{}\[\]"']+/gi)?.length ?? 0;
  if (result.split(/\r?\n/).length > 50 || links > 10) {
    return invalid("Message body exceeds the safe line or link limit.", endpointKey);
  }
  return result;
}

function threadId(value, endpointKey) {
  const result = required(value, "threadId", endpointKey).toLowerCase();
  if (THREAD_ID.test(result)) return result;
  return invalid("A valid public thread ID is required.", endpointKey);
}

function idempotency(payload, endpointKey) {
  const result = required(payload?.idempotencyKey, "idempotencyKey", endpointKey);
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) return result;
  return invalid("A safe idempotency key is required.", endpointKey);
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
        q: boundedText(payload.query || payload.q, "query", 100, endpointKey),
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
      return invalid("Recipient must use a public Player ID.", endpointKey);
    }
    return {
      method: "POST",
      path: "/players/me/messages/threads",
      payload: {
        recipientPlayerId,
        title: boundedText(payload.title, "title", 160, endpointKey),
        body: messageBody(payload.body, endpointKey),
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
        body: messageBody(payload.body, endpointKey),
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
