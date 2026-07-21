const DEFAULT_HEADERS = Object.freeze({
  accept: "application/json",
  "content-type": "application/json",
});

function clean(value) {
  return String(value ?? "").trim();
}

function apiBase() {
  const meta = document.querySelector('meta[name="econovaria-admin-api-base"]')?.content;
  return clean(meta).replace(/\/+$/, "");
}

function authHeaders() {
  const manager = window.AdminAuthSessionManager;
  const session = manager?.getSession?.() || manager?.session || null;
  const token = clean(session?.access_token || session?.accessToken || manager?.getAccessToken?.());
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function readBody(response) {
  const type = clean(response.headers.get("content-type")).toLowerCase();
  if (type.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text.slice(0, 4000) } : {};
}

async function request(path, { method = "GET", body, idempotencyKey } = {}) {
  const base = apiBase();
  if (!base) throw new Error("Admin API base is not configured.");
  const headers = {
    ...DEFAULT_HEADERS,
    ...authHeaders(),
  };
  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
    headers["x-request-id"] = idempotencyKey;
  }
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await readBody(response);
  if (!response.ok) {
    const message = clean(payload?.message || payload?.error?.message) || "Messaging request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.code = clean(payload?.code || payload?.error?.code);
    error.retryAfterSeconds = Number(payload?.retryAfterSeconds || payload?.error?.retryAfterSeconds || 0);
    throw error;
  }
  return payload?.data ?? payload;
}

function key(prefix) {
  const random = crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now()}${Math.random()}`.replace(/\D/g, "");
  return `${prefix}:${random.slice(0, 48)}`;
}

export function createMessagingModerationClient(gameId) {
  const encodedGameId = encodeURIComponent(clean(gameId));
  if (!encodedGameId) throw new TypeError("A game ID is required.");
  const root = `/games/${encodedGameId}/messages`;
  return Object.freeze({
    async list({ query = "", status = "all", limit = 25, offset = 0 } = {}) {
      const search = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
      const normalizedQuery = clean(query);
      if (normalizedQuery) search.set("q", normalizedQuery.slice(0, 100));
      return request(`${root}?${search}`);
    },
    async create(command) {
      const idempotencyKey = key("admin-message-create");
      return request(`${root}/threads`, {
        method: "POST",
        idempotencyKey,
        body: { ...command, idempotencyKey },
      });
    },
    async moderateThread(threadId, action, reason = "") {
      const idempotencyKey = key(`admin-message-${action}`);
      return request(`${root}/threads/${encodeURIComponent(threadId)}/${action}`, {
        method: "POST",
        idempotencyKey,
        body: { reason, idempotencyKey },
      });
    },
    async moderateMessage(threadId, messageId, action, reason = "") {
      const idempotencyKey = key(`admin-message-${action}`);
      return request(`${root}/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/${action}`, {
        method: "POST",
        idempotencyKey,
        body: { reason, idempotencyKey },
      });
    },
    async deleteExpiredThread(threadId, reason) {
      const idempotencyKey = key("admin-message-retention-delete");
      return request(`${root}/threads/${encodeURIComponent(threadId)}/delete`, {
        method: "POST",
        idempotencyKey,
        body: { reason, idempotencyKey },
      });
    },
  });
}
