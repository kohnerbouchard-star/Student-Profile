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
const PLAYER_GAME_CODE_MAX_LENGTH = 64;

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
  PLAYER_GAME_CODE_MAX_LENGTH,
});
