const LOCAL_ADMIN_API_PREFIX = "/api/admin";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_HEADER = "x-econovaria-device-id";
const GAME_HEADER = "x-econovaria-game-id";
const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/**
 * Creates a V2-scoped, read-only transport for the existing HttpOnly Admin BFF.
 * It never installs a global fetch wrapper and never accepts a bearer token.
 */
export function createAdminBffTransport({
  selectedGameId,
  runtimeConfig = globalThis.EconovariaRuntimeConfig,
  sessionManager = globalThis.EconovariaAdminAuthSession,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  locationLike = globalThis.location,
  storage = globalThis.localStorage,
  cryptoObject = globalThis.crypto,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Admin BFF transport is unavailable.");
  const gameId = String(selectedGameId || "").trim();
  if (!gameId) throw new TypeError("Admin game context is unavailable.");
  let unauthorizedRedirectScheduled = false;

  return async function adminBffFetch(input, init = {}) {
    const method = String(init.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      throw new TypeError("Admin v2 Phase 1 transport is read-only.");
    }

    const headers = new Headers(init.headers || {});
    headers.delete("authorization");
    headers.delete("cookie");
    headers.delete("x-econovaria-csrf-token");
    headers.set("Accept", "application/json");
    headers.set("apikey", String(runtimeConfig?.supabasePublishableKey || ""));
    headers.set(DEVICE_HEADER, deviceId(storage, cryptoObject));
    headers.set(GAME_HEADER, gameId);

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
      globalThis.setTimeout?.(() => redirectToSignIn("session-expired", locationLike), 250);
    }
    return response;
  };
}
