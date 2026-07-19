window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

const SUPABASE_URL = "https://cgiukdjwicykrmtkhudh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
const CLASSROOM_API_URL = `${SUPABASE_URL}/functions/v1/classroom-api`;
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
