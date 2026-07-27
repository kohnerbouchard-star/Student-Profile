const DEFAULT_HEADERS = Object.freeze({ accept: "application/json" });
const DEVICE_KEY = "econovaria.device.v1";
const DEVICE_HEADER = "x-econovaria-device-id";
const GAME_HEADER = "x-econovaria-game-id";
const CSRF_HEADER = "x-econovaria-csrf-token";
const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function runtimeConfig() {
  return window.EconovariaRuntimeConfig || {};
}

function apiBase() {
  return clean(
    runtimeConfig().adminBffApiUrl ||
      document.querySelector('meta[name="econovaria-admin-api-base"]')?.content,
  ).replace(/\/+$/, "");
}

function deviceId() {
  const existing = clean(window.localStorage.getItem(DEVICE_KEY)).toLowerCase();
  if (DEVICE_PATTERN.test(existing)) return existing;
  const generated = clean(window.crypto?.randomUUID?.()).toLowerCase();
  if (!DEVICE_PATTERN.test(generated)) {
    throw new Error("Secure device identifier generation is unavailable.");
  }
  window.localStorage.setItem(DEVICE_KEY, generated);
  return generated;
}

async function readBody(response) {
  const type = clean(response.headers.get("content-type")).toLowerCase();
  if (type.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text.slice(0, 4000) } : {};
}

async function request(gameId, path, { method = "GET", body, idempotencyKey } = {}) {
  const base = apiBase();
  const publishableKey = clean(runtimeConfig().supabasePublishableKey);
  const scope = clean(gameId);
  if (!base || !publishableKey || !scope) {
    throw new Error("Admin messaging BFF configuration is incomplete.");
  }

  const manager = window.EconovariaAdminAuthSession;
  const session = await manager?.getUsableSession?.();
  if (!session) throw new Error("Administrator sign-in is required.");

  const normalizedMethod = clean(method || "GET").toUpperCase();
  const headers = {
    ...DEFAULT_HEADERS,
    apikey: publishableKey,
    [DEVICE_HEADER]: deviceId(),
    [GAME_HEADER]: scope,
  };
  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    const csrfToken = clean(session.csrfToken);
    if (!/^[A-Za-z0-9_-]{43}$/.test(csrfToken)) {
      throw new Error("Administrator request verification is unavailable.");
    }
    headers[CSRF_HEADER] = csrfToken;
    headers["content-type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
    headers["x-request-id"] = idempotencyKey;
  }

  const response = await fetch(`${base}${path}`, {
    method: normalizedMethod,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  const payload = await readBody(response);
  if (!response.ok) {
    const message = clean(payload?.message || payload?.error?.message) ||
      "Messaging request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.code = clean(payload?.code || payload?.error?.code);
    error.retryAfterSeconds = Number(
      payload?.retryAfterSeconds || payload?.error?.retryAfterSeconds || 0,
    );
    throw error;
  }
  return payload?.data ?? payload;
}

function key(prefix) {
  const random = crypto?.randomUUID?.().replaceAll("-", "") ||
    `${Date.now()}${Math.random()}`.replace(/\D/g, "");
  return `${prefix}:${random.slice(0, 48)}`;
}

export function createMessagingModerationClient(gameId) {
  const scope = clean(gameId);
  const encodedGameId = encodeURIComponent(scope);
  if (!encodedGameId) throw new TypeError("A game ID is required.");
  const root = `/games/${encodedGameId}/messages`;
  return Object.freeze({
    async list({ query = "", status = "all", limit = 25, offset = 0 } = {}) {
      const search = new URLSearchParams({
        status,
        limit: String(limit),
        offset: String(offset),
      });
      const normalizedQuery = clean(query);
      if (normalizedQuery) search.set("q", normalizedQuery.slice(0, 100));
      return request(scope, `${root}?${search}`);
    },
    async create(command) {
      const idempotencyKey = key("admin-message-create");
      return request(scope, `${root}/threads`, {
        method: "POST",
        idempotencyKey,
        body: { ...command, idempotencyKey },
      });
    },
    async moderateThread(threadId, action, reason = "") {
      const idempotencyKey = key(`admin-message-${action}`);
      return request(
        scope,
        `${root}/threads/${encodeURIComponent(threadId)}/${action}`,
        {
          method: "POST",
          idempotencyKey,
          body: { reason, idempotencyKey },
        },
      );
    },
    async moderateMessage(threadId, messageId, action, reason = "") {
      const idempotencyKey = key(`admin-message-${action}`);
      return request(
        scope,
        `${root}/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/${action}`,
        {
          method: "POST",
          idempotencyKey,
          body: { reason, idempotencyKey },
        },
      );
    },
    async deleteExpiredThread(threadId, reason) {
      const idempotencyKey = key("admin-message-retention-delete");
      return request(
        scope,
        `${root}/threads/${encodeURIComponent(threadId)}/delete`,
        {
          method: "POST",
          idempotencyKey,
          body: { reason, idempotencyKey },
        },
      );
    },
  });
}
