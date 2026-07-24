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

window.Econovaria.core.constants = Object.freeze({
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  CLASSROOM_API_URL,
  PLAYER_SESSION_STORAGE_KEY,
  ADMIN_SESSION_STORAGE_KEY,
  ADMIN_SELECTED_GAME_STORAGE_KEY
});
