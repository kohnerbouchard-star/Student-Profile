import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const index = readFileSync("admin/index.html", "utf8");
const bootstrap = readFileSync("admin/admin-bootstrap.js", "utf8");
const controls = readFileSync("admin/game-session-controls.js", "utf8");
const logoutController = readFileSync(
  "admin/admin-logout-controller.js",
  "utf8",
);
const shareLinkContract = readFileSync(
  "admin/game-session-share-link-contract.js",
  "utf8",
);
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
checkJavaScript("admin/admin-logout-controller.js");
checkJavaScript("admin/game-session-share-link-contract.js");

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
assert(
  bootstrap.includes('name: "game-session-access"') &&
    bootstrap.includes('"./admin-logout-controller.js"') &&
    bootstrap.includes('"./game-session-share-link-contract.js"'),
  "Admin bootstrap must load the logout owner and canonical share-link contract.",
);

for (const contract of [
  "econovaria.admin.selected-game.v1",
  "econovaria.admin.game-code.v1:",
  "share-current-game",
  "data-econovaria-game-session-card",
  "Players using this code join this game instance.",
  'url.searchParams.set("gameCode", gameCode)',
]) {
  assert(controls.includes(contract), `Selected-game control contract is missing ${contract}.`);
}

for (const contract of [
  '"/play"',
  'url.searchParams.set("gameCode", normalizedCode)',
  'url.searchParams.set("mode", "student")',
  "repairVisibleShareSurfaces",
  "data-econovaria-player-link",
  "input[id*='share-admin-link']",
]) {
  assert(
    shareLinkContract.includes(contract),
    `Canonical selected-game share-link contract is missing ${contract}.`,
  );
}

for (const contract of [
  "clearSessionSynchronously();",
  "captureSession()",
  "window.addEventListener(\"click\"",
  "event.stopImmediatePropagation()",
  "keepalive: true",
  "/auth/sign-out",
  "/auth/v1/logout",
  "window.location.replace(loginUrl())",
]) {
  assert(
    logoutController.includes(contract),
    `Synchronous Admin logout controller is missing ${contract}.`,
  );
}
assert(
  logoutController.indexOf("clearSessionSynchronously();") <
    logoutController.indexOf("logoutPromise = revokeCapturedSession"),
  "Admin session must be cleared before asynchronous revocation begins.",
);

assert(
  controls.includes("input[id*='share-admin-link']"),
  "Share repair must remove the Admin link from the Player-facing access panel.",
);
assert(
  controls.includes("createFallbackShareSurface"),
  "Share repair must fail over to an accessible local surface when the bundle modal does not mount.",
);
assert(
  styles.includes("pointer-events: auto !important;"),
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
  canonicalPlayerShareRoute: true,
  playerLinkTargetsGameCode: true,
  logoutPointerControl: true,
  logoutSynchronousClear: true,
  backendGameCodeBinding: true,
}, null, 2));
