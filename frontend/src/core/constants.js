window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

const runtimeConfig = window.EconovariaRuntimeConfig;
if (!runtimeConfig) {
  throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
}
const SUPABASE_URL = runtimeConfig.supabaseUrl;
const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
const PLAYER_API_URL = runtimeConfig.playerApiUrl;
const PLAYER_WEB_SESSION_API_URL = runtimeConfig.playerWebSessionApiUrl;
const STAFF_API_URL = runtimeConfig.staffApiUrl;
const BOOTSTRAP_API_URL = runtimeConfig.bootstrapApiUrl;
const ADMIN_API_URL = runtimeConfig.adminApiUrl;
const WEB_SESSION_API_URL = runtimeConfig.webSessionApiUrl;
const ADMIN_BFF_API_URL = runtimeConfig.adminBffApiUrl;
const PASSWORD_RESET_API_URL = runtimeConfig.passwordResetApiUrl;
const CLASSROOM_API_URL = runtimeConfig.classroomApiUrl;
const PLAYER_SESSION_STORAGE_KEY = "econovaria.player.auth.v1";
const ADMIN_SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const ADMIN_SELECTED_GAME_STORAGE_KEY = "econovaria.admin.selected-game.v1";
const LOGIN_LOGO_ASSET_URL = "assets/brand/Econovaria%20Logo.png?v=20260729.3";
const PLAYER_GAME_CODE_MAX_LENGTH = 64;

function installPublishableBearerGuard() {
  const nativeFetch = window.fetch.bind(window);
  const prohibited = `Bearer ${SUPABASE_PUBLISHABLE_KEY}`;

  window.fetch = function guardedEconovariaFetch(input, init) {
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(new URL(String(input), window.location.href).href, init);
    const headers = new Headers(request.headers);
    if (String(headers.get("authorization") || "").trim() === prohibited) {
      headers.delete("authorization");
    }
    return nativeFetch(new Request(request, { headers }));
  };
}

installPublishableBearerGuard();

const loginLogo = document.querySelector("[data-econovaria-brand-image]");
const loginLogoMark = loginLogo?.closest(".logo-mark");
const loginLogoFallback = loginLogoMark?.querySelector(".logo-mark-fallback");

function setLoginLogoFallbackVisible(visible) {
  if (loginLogoFallback) {
    loginLogoFallback.hidden = !visible;
    loginLogoFallback.style.display = visible ? "grid" : "none";
  }
  loginLogoMark?.classList.toggle("has-brand-error", visible);
}

if (loginLogo) {
  setLoginLogoFallbackVisible(false);
  loginLogo.addEventListener("load", () => setLoginLogoFallbackVisible(false));
  loginLogo.addEventListener("error", () => setLoginLogoFallbackVisible(true));
  loginLogo.setAttribute("src", LOGIN_LOGO_ASSET_URL);
  loginLogo.setAttribute("data-econovaria-brand-source", "asset");
  if (loginLogo.complete) {
    setLoginLogoFallbackVisible(loginLogo.naturalWidth === 0);
  }
}

function configurePlayerGameCodeInput() {
  const input = window.document.getElementById("gameCode");
  if (!(input instanceof HTMLInputElement)) return;

  input.maxLength = PLAYER_GAME_CODE_MAX_LENGTH;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "characters");

  const suppliedCode = String(
    new URLSearchParams(window.location.search).get("gameCode") || "",
  ).trim().toUpperCase();
  if (/^[A-Z0-9-]{4,64}$/.test(suppliedCode)) input.value = suppliedCode;
}

configurePlayerGameCodeInput();

window.Econovaria.core.constants = Object.freeze({
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  PLAYER_API_URL,
  PLAYER_WEB_SESSION_API_URL,
  STAFF_API_URL,
  BOOTSTRAP_API_URL,
  ADMIN_API_URL,
  WEB_SESSION_API_URL,
  ADMIN_BFF_API_URL,
  PASSWORD_RESET_API_URL,
  CLASSROOM_API_URL,
  PLAYER_SESSION_STORAGE_KEY,
  ADMIN_SESSION_STORAGE_KEY,
  ADMIN_SELECTED_GAME_STORAGE_KEY,
  LOGIN_LOGO_ASSET_URL,
  PLAYER_GAME_CODE_MAX_LENGTH,
});
