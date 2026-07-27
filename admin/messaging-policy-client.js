const clean = (value) => String(value ?? "").trim();
const DEVICE_KEY = "econovaria.device.v1";
const DEVICE_HEADER = "x-econovaria-device-id";
const GAME_HEADER = "x-econovaria-game-id";
const CSRF_HEADER = "x-econovaria-csrf-token";
const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function runtimeConfig() {
  return window.EconovariaRuntimeConfig || {};
}

function base() {
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

async function request(gameId, path, init = {}) {
  const apiBase = base();
  const publishableKey = clean(runtimeConfig().supabasePublishableKey);
  const scope = clean(gameId);
  if (!apiBase || !publishableKey || !scope) {
    throw new Error("Admin messaging policy BFF configuration is incomplete.");
  }

  const manager = window.EconovariaAdminAuthSession;
  const session = await manager?.getUsableSession?.();
  if (!session) throw new Error("Administrator sign-in is required.");

  const method = clean(init.method || "GET").toUpperCase();
  const headers = {
    accept: "application/json",
    apikey: publishableKey,
    [DEVICE_HEADER]: deviceId(),
    [GAME_HEADER]: scope,
    ...(init.headers || {}),
  };
  if (!["GET", "HEAD"].includes(method)) {
    const csrfToken = clean(session.csrfToken);
    if (!/^[A-Za-z0-9_-]{43}$/.test(csrfToken)) {
      throw new Error("Administrator request verification is unavailable.");
    }
    headers[CSRF_HEADER] = csrfToken;
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      clean(body.message || body.error?.message) ||
        "Messaging policy request failed.",
    );
    error.status = response.status;
    error.code = clean(body.code || body.error?.code);
    throw error;
  }
  const policy = body.data?.policy;
  if (!policy || policy.attachmentsEnabled !== false) {
    throw new Error("Messaging policy response is invalid.");
  }
  return Object.freeze({
    playerThreadsEnabled: policy.playerThreadsEnabled !== false,
    maxParticipants: Number(policy.maxParticipants || 2),
    defaultRetentionDays: Number(policy.defaultRetentionDays || 365),
    attachmentsEnabled: false,
    updatedAt: policy.updatedAt || null,
  });
}

export function createMessagingPolicyClient(gameId) {
  const scope = clean(gameId);
  const root = `/games/${encodeURIComponent(scope)}/messages/policy`;
  return Object.freeze({
    read: () => request(scope, root, { method: "GET" }),
    update: (policy) => request(scope, root, {
      method: "POST",
      body: JSON.stringify({
        playerThreadsEnabled: policy.playerThreadsEnabled === true,
        defaultRetentionDays: Number(policy.defaultRetentionDays),
      }),
    }),
  });
}
