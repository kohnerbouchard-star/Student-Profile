import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const index = readFileSync("admin/index.html", "utf8");
const controls = readFileSync("admin/game-session-controls.js", "utf8");
const styles = readFileSync("admin/css/game-session-controls.css", "utf8");
const loginHandler = readFileSync(
  "backend/src/domains/players/api/playerLoginHttpHandler.ts",
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkJavaScript(path) {
  const result = spawnSync(process.execPath, ["--check", path], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${path} did not pass syntax validation: ${result.stderr}`);
  }
}

checkJavaScript("admin/game-session-controls.js");

assert(
  index.includes('<link rel="stylesheet" href="./css/game-session-controls.css" />'),
  "Admin shell must load the selected-game control stylesheet.",
);
assert(
  index.includes('<script defer src="./game-session-controls.js"></script>'),
  "Admin shell must load the selected-game control module.",
);
assert(
  index.indexOf("./game-code-wiring.js") < index.indexOf("./game-session-controls.js"),
  "Selected-game controls must load after the canonical Game Code wiring.",
);

for (const contract of [
  "econovaria.admin.selected-game.v1",
  "econovaria.admin.game-code.v1:",
  "share-current-game",
  "data-econovaria-game-session-card",
  "Players using this code join this game instance.",
  'url.searchParams.set("mode", "player")',
  'url.searchParams.set("gameCode", gameCode)',
]) {
  assert(controls.includes(contract), `Selected-game control contract is missing ${contract}.`);
}

for (const contract of [
  "/api/admin/auth/sign-out",
  "EconovariaAdminAuthSession?.clear?.()",
  "window.location.replace(loginUrl())",
  "event.stopImmediatePropagation()",
  "data-econovaria-admin-logout",
]) {
  assert(controls.includes(contract), `Admin logout repair is missing ${contract}.`);
}

assert(
  controls.includes("input[id*='share-admin-link']"),
  "Share repair must remove the Admin link from the Player-facing access panel.",
);
assert(
  controls.includes("createFallbackShareSurface"),
  "Share repair must fail over to an accessible local surface when the bundle modal does not mount.",
);
assert(
  styles.includes('pointer-events: auto !important;'),
  "Logout and share controls must explicitly restore pointer interaction.",
);
assert(
  styles.includes('[data-modal-id="share-game-access"]'),
  "Share modal styling must remain scoped to the Game Code surface.",
);
assert(
  styles.includes("width: min(620px, calc(100vw - 32px))"),
  "Share modal must use the bounded responsive width.",
);

for (const contract of [
  '.eq("game_join_code_hash", gameJoinCodeHash)',
  '.eq("game_join_code_status", "active")',
  '.eq("game_session_id", gameSession.id)',
  "createPlayerSession(",
  "gameSession.id,",
]) {
  assert(
    loginHandler.includes(contract),
    `Player login must preserve Game Code to game-session binding: ${contract}.`,
  );
}

console.log(JSON.stringify({
  selectedGameCard: true,
  sharePanelResponsive: true,
  playerLinkTargetsGameCode: true,
  logoutPointerControl: true,
  logoutFallback: true,
  backendGameCodeBinding: true,
}, null, 2));
