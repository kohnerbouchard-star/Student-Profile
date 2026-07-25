window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

const runtimeConfig = window.EconovariaRuntimeConfig;
if (!runtimeConfig) {
  throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
}
const SUPABASE_URL = runtimeConfig.supabaseUrl;
const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
const CLASSROOM_API_URL = runtimeConfig.classroomApiUrl;
const PLAYER_SESSION_STORAGE_KEY = "econovaria.player.auth.v1";
const ADMIN_SESSION_STORAGE_KEY = "econovaria.admin.auth.v1";
const ADMIN_SELECTED_GAME_STORAGE_KEY = "econovaria.admin.selected-game.v1";
const LOGIN_LOGO_ASSET_URL = "assets/brand/Econovaria%20Logo.png?v=20260725.1";
const PLAYER_GAME_CODE_MAX_LENGTH = 64;

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
  CLASSROOM_API_URL,
  PLAYER_SESSION_STORAGE_KEY,
  ADMIN_SESSION_STORAGE_KEY,
  ADMIN_SELECTED_GAME_STORAGE_KEY,
  LOGIN_LOGO_ASSET_URL,
  PLAYER_GAME_CODE_MAX_LENGTH,
});
