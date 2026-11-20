// Classic-script state owner, loaded before api.js. Keep these existing bindings
// shared with that transport; no credentials or economic authority are introduced.
const ECONOVARIA_DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ECONOVARIA_API_PLAYER_STATE_STORAGE_KEY = "econovaria.player.auth.v1";
const ECONOVARIA_API_ADMIN_STATE_STORAGE_KEY = "econovaria.admin.auth.v1";
const ECONOVARIA_API_SELECTED_GAME_STORAGE_KEY = "econovaria.admin.selected-game.v1";
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
let inMemoryPlayerCsrfToken = "";
let inMemoryAdminCsrfToken = "";

function getOrCreateDeviceId() {
  try {
    const existing = String(
      window.localStorage.getItem(ECONOVARIA_DEVICE_STORAGE_KEY) || ""
    ).trim().toLowerCase();
    if (DEVICE_ID_PATTERN.test(existing)) return existing;
    const generated = String(window.crypto?.randomUUID?.() || "").toLowerCase();
    if (!DEVICE_ID_PATTERN.test(generated)) {
      throw new Error("Secure device identifier generation is unavailable.");
    }
    window.localStorage.setItem(ECONOVARIA_DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch (_) {
    throw new Error(
      "[Econovaria API] A secure device identifier could not be initialized."
    );
  }
}

function readSafeSessionState(storageKey) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
    return value && value.authenticated === true &&
        CSRF_PATTERN.test(String(value.csrfToken || ""))
      ? value
      : null;
  } catch (_) {
    return null;
  }
}

function readSafePlayerState() {
  return readSafeSessionState(ECONOVARIA_API_PLAYER_STATE_STORAGE_KEY);
}

function readSafeAdminState() {
  return readSafeSessionState(ECONOVARIA_API_ADMIN_STATE_STORAGE_KEY);
}

function rememberPlayerCsrf(result) {
  const candidate = String(result?.csrfToken || "");
  if (CSRF_PATTERN.test(candidate)) inMemoryPlayerCsrfToken = candidate;
}

function clearPlayerCsrf() {
  inMemoryPlayerCsrfToken = "";
}

function readPlayerCsrf() {
  return CSRF_PATTERN.test(inMemoryPlayerCsrfToken)
    ? inMemoryPlayerCsrfToken
    : String(readSafePlayerState()?.csrfToken || "");
}

function rememberAdminCsrf(result) {
  const candidate = String(result?.csrfToken || "");
  if (CSRF_PATTERN.test(candidate)) inMemoryAdminCsrfToken = candidate;
}

function clearAdminCsrf() {
  inMemoryAdminCsrfToken = "";
}

function readAdminCsrf() {
  return CSRF_PATTERN.test(inMemoryAdminCsrfToken)
    ? inMemoryAdminCsrfToken
    : String(readSafeAdminState()?.csrfToken || "");
}

function readSelectedAdminGameId() {
  return String(
    window.EconovariaAdminGameSelection?.read?.() || ""
  ).trim();
}
