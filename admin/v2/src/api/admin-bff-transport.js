const LOCAL_ADMIN_API_PREFIX = "/api/admin";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_HEADER = "x-econovaria-device-id";
const GAME_HEADER = "x-econovaria-game-id";
const CSRF_HEADER = "x-econovaria-csrf-token";
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"]);

function deviceId(storage, cryptoObject) {
  const existing = String(storage?.getItem?.(DEVICE_STORAGE_KEY) || "").trim().toLowerCase();
  if (DEVICE_PATTERN.test(existing)) return existing;

  const generated = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
  if (!DEVICE_PATTERN.test(generated)) {
    throw new Error("Secure device identification is unavailable.");
  }
  storage?.setItem?.(DEVICE_STORAGE_KEY, generated);
  return generated;
}

function adminBffUrl(input, runtimeConfig, locationLike) {
  const local = new URL(String(input || ""), locationLike?.href);
  if (local.origin !== locationLike?.origin || !local.pathname.startsWith(`${LOCAL_ADMIN_API_PREFIX}/`)) {
    throw new TypeError("Admin v2 requests must use the local Admin API boundary.");
  }

  const suffix = local.pathname.slice(LOCAL_ADMIN_API_PREFIX.length) || "/";
  const configuredBase = String(runtimeConfig?.adminBffApiUrl || LOCAL_ADMIN_API_PREFIX).replace(/\/+$/, "");
  return new URL(`${configuredBase}${suffix}${local.search}`, locationLike?.href).href;
}

function redirectToSignIn(reason, locationLike) {
  const destination = new URL("../", locationLike.href);
  destination.searchParams.set("mode", "admin");
  destination.searchParams.set("reason", reason);
  locationLike.replace(destination.href);
}

function transportFailure(code, message, status = 0) {
  const error = new Error(message);
  error.name = "AdminBffTransportError";
  error.code = code;
  error.status = status;
  error.retryable = false;
  return error;
}

function readMutationSession(session, sessionManager) {
  const current = typeof session === "function"
    ? session()
    : session || sessionManager?.read?.();
  const csrfToken = String(current?.csrfToken || "").trim();
  const expired = typeof sessionManager?.isExpired === "function"
    ? sessionManager.isExpired(current, 0)
    : false;
  if (current?.authenticated !== true || expired || !CSRF_PATTERN.test(csrfToken)) {
    throw transportFailure(
      "SESSION_REQUIRED",
      "Administrator session verification is unavailable.",
      401,
    );
  }
  return csrfToken;
}

function canonicalIdempotencyKey(headers) {
  const canonical = String(headers.get("idempotency-key") || "").trim();
  const compatibility = String(headers.get("x-idempotency-key") || "").trim();
  headers.delete("idempotency-key");
  headers.delete("x-idempotency-key");
  if (canonical && compatibility && canonical !== compatibility) {
    throw transportFailure(
      "INVALID_REQUEST",
      "Administrator request identity is inconsistent.",
      400,
    );
  }
  const value = canonical || compatibility;
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw transportFailure(
      "INVALID_REQUEST",
      "Administrator request identity is unavailable.",
      400,
    );
  }
  return value;
}

/**
 * Creates a V2-scoped transport for the existing HttpOnly Admin BFF.
 * It never installs a global fetch wrapper and never accepts a bearer token.
 */
export function createAdminBffTransport({
  selectedGameId,
  session = null,
  runtimeConfig = globalThis.EconovariaRuntimeConfig,
  sessionManager = globalThis.EconovariaAdminAuthSession,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  locationLike = globalThis.location,
  storage = globalThis.localStorage,
  cryptoObject = globalThis.crypto,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Admin BFF transport is unavailable.");
  const gameId = String(selectedGameId || "").trim();
  if (!gameId) throw new TypeError("Admin game context is unavailable.");
  let unauthorizedRedirectScheduled = false;

  return async function adminBffFetch(input, init = {}) {
    const method = String(init.method || "GET").toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      throw transportFailure("INVALID_REQUEST", "Admin v2 request method is unsupported.", 400);
    }
    const isMutation = method !== "GET" && method !== "HEAD";

    const headers = new Headers(init.headers || {});
    headers.delete("authorization");
    headers.delete("cookie");
    headers.delete(CSRF_HEADER);
    headers.delete(DEVICE_HEADER);
    headers.delete(GAME_HEADER);
    headers.set("Accept", "application/json");
    headers.set("apikey", String(runtimeConfig?.supabasePublishableKey || ""));
    headers.set(DEVICE_HEADER, deviceId(storage, cryptoObject));
    headers.set(GAME_HEADER, gameId);
    if (isMutation) {
      headers.set(CSRF_HEADER, readMutationSession(session, sessionManager));
      headers.set(IDEMPOTENCY_HEADER, canonicalIdempotencyKey(headers));
      if (init.body !== undefined && !headers.has("content-type")) {
        headers.set("Content-Type", "application/json");
      }
    } else {
      headers.delete("idempotency-key");
      headers.delete("x-idempotency-key");
    }

    const response = await fetchImpl(adminBffUrl(input, runtimeConfig, locationLike), {
      ...init,
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });

    if (response.status === 401 && !unauthorizedRedirectScheduled) {
      unauthorizedRedirectScheduled = true;
      sessionManager?.clear?.();
      setTimeoutImpl?.(() => redirectToSignIn("session-expired", locationLike), 250);
    }
    return response;
  };
}
