const clean = (value) => String(value ?? "").trim();
function apiBase() {
  return clean(document.querySelector('meta[name="econovaria-admin-api-base"]')?.content).replace(/\/+$/, "");
}
function authHeaders() {
  const manager = window.AdminAuthSessionManager;
  const session = manager?.getSession?.() || manager?.session || null;
  const token = clean(session?.access_token || session?.accessToken || manager?.getAccessToken?.());
  return token ? { authorization: `Bearer ${token}` } : {};
}
async function request(path, { method = "GET", body, idempotencyKey } = {}) {
  const base = apiBase();
  if (!base) throw new Error("Admin API base is not configured.");
  const headers = { accept: "application/json", "content-type": "application/json", ...authHeaders() };
  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
    headers["x-request-id"] = idempotencyKey;
  }
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(clean(payload?.message || payload?.error?.message) || "Progression request failed.");
    error.status = response.status;
    error.retryAfterSeconds = Number(payload?.retryAfterSeconds || 0);
    throw error;
  }
  return payload?.data ?? payload;
}
function commandKey() {
  const value = crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now()}${Math.random()}`.replace(/\D/g, "");
  return `admin-progression-correction:${value.slice(0, 48)}`;
}
export function createProgressionReviewClient(gameId) {
  const root = `/games/${encodeURIComponent(clean(gameId))}/progression`;
  return Object.freeze({
    list({ limit = 100, offset = 0 } = {}) {
      return request(`${root}?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`);
    },
    correct(playerId, command) {
      const idempotencyKey = commandKey();
      return request(`${root}/players/${encodeURIComponent(clean(playerId))}/corrections`, {
        method: "POST",
        idempotencyKey,
        body: { ...command, idempotencyKey }
      });
    }
  });
}
