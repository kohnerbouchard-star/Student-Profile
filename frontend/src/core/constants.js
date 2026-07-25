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

const loginLogo = document.querySelector("[data-econovaria-brand-image]");
if (loginLogo) {
  loginLogo.setAttribute("src", LOGIN_LOGO_ASSET_URL);
  loginLogo.setAttribute("data-econovaria-brand-source", "asset");
}

window.Econovaria.core.constants = Object.freeze({
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  CLASSROOM_API_URL,
  PLAYER_SESSION_STORAGE_KEY,
  ADMIN_SESSION_STORAGE_KEY,
  ADMIN_SELECTED_GAME_STORAGE_KEY,
  LOGIN_LOGO_ASSET_URL
});
