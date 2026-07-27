const clean = (value) => String(value ?? "").trim();
const DEVICE_KEY = "econovaria.device.v1";
const DEVICE_HEADER = "x-econovaria-device-id";
const GAME_HEADER = "x-econovaria-game-id";
const CSRF_HEADER = "x-econovaria-csrf-token";
const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function request(gameId, path, { method = "GET", body, idempotencyKey } = {}) {
  const base = apiBase();
  const publishableKey = clean(runtimeConfig().supabasePublishableKey);
  const scope = clean(gameId);
  if (!base || !publishableKey || !scope) {
    throw new Error("Admin progression BFF configuration is incomplete.");
  }

  const manager = window.EconovariaAdminAuthSession;
  const session = await manager?.getUsableSession?.();
  if (!session) throw new Error("Administrator sign-in is required.");

  const normalizedMethod = clean(method || "GET").toUpperCase();
  const headers = {
    accept: "application/json",
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      clean(payload?.message || payload?.error?.message) ||
        "Progression request failed.",
    );
    error.status = response.status;
    error.retryAfterSeconds = Number(payload?.retryAfterSeconds || 0);
    throw error;
  }
  return payload?.data ?? payload;
}

function commandKey() {
  const value = crypto?.randomUUID?.().replaceAll("-", "") ||
    `${Date.now()}${Math.random()}`.replace(/\D/g, "");
  return `admin-progression-correction:${value.slice(0, 48)}`;
}

export function createProgressionReviewClient(gameId) {
  const scope = clean(gameId);
  const root = `/games/${encodeURIComponent(scope)}/progression`;
  return Object.freeze({
    list({ limit = 100, offset = 0 } = {}) {
      return request(
        scope,
        `${root}?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
      );
    },
    correct(playerId, command) {
      const idempotencyKey = commandKey();
      return request(
        scope,
        `${root}/players/${encodeURIComponent(clean(playerId))}/corrections`,
        {
          method: "POST",
          idempotencyKey,
          body: { ...command, idempotencyKey },
        },
      );
    },
  });
}
