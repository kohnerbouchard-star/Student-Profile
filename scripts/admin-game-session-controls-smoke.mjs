import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const index = readFileSync("admin/index.html", "utf8");
const bootstrap = readFileSync("admin/admin-bootstrap.js", "utf8");
const controls = readFileSync("admin/game-session-controls.js", "utf8");
const mountLifecycle = readFileSync(
  "admin/game-session-mount-lifecycle.js",
  "utf8",
);
const gameCodeWiring = readFileSync("admin/game-code-wiring.js", "utf8");
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
checkJavaScript("admin/game-session-mount-lifecycle.js");
checkJavaScript("admin/game-code-wiring.js");
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
    bootstrap.includes('"./game-session-share-link-contract.js"') &&
    bootstrap.includes('"./game-session-mount-lifecycle.js"'),
  "Admin bootstrap must load logout, share-link, and explicit game-session mount ownership.",
);
assert(
  !bootstrap.includes('"./shape-accurate-skeleton-lifecycle.js"'),
  "The deleted skeleton lifecycle must not remain in dynamic Admin bootstrap.",
);
for (const contract of [
  "econovaria:admin-route-mounted",
  "econovaria:admin-account-surface-ready",
  "econovaria:admin-session-refreshed",
  "econovaria:admin-bootstrap-complete",
  "EconovariaAdminGameSessionControls?.reconcile?.()",
  "requestAnimationFrame",
]) {
  assert(
    mountLifecycle.includes(contract),
    `Selected-game mount lifecycle is missing ${contract}.`,
  );
}
assert(
  !mountLifecycle.includes("MutationObserver") &&
    !mountLifecycle.includes("setInterval") &&
    !mountLifecycle.includes("setTimeout"),
  "Selected-game mount ownership must use explicit events rather than observation or timer polling.",
);

for (const contract of [
  "econovaria.admin.selected-game.v1",
  "share-current-game",
  "data-econovaria-game-session-card",
  "Players using this code join this game instance.",
  'url.searchParams.set("gameCode", gameCode)',
]) {
  assert(controls.includes(contract), `Selected-game control contract is missing ${contract}.`);
}
assert(
  !controls.includes("econovaria.admin.game-code.v1:") &&
    !controls.includes("cachedCode("),
  "Selected-game controls must not read Game Codes from browser storage.",
);
assert(
  gameCodeWiring.includes("readPersistedGameCode") &&
    gameCodeWiring.includes('method: "GET"') &&
    gameCodeWiring.includes("Rotate Code"),
  "Canonical Game Code wiring must read the persisted code and expose explicit rotation.",
);
assert(
  !gameCodeWiring.includes("GAME_CODE_CACHE_PREFIX"),
  "Canonical Game Code wiring must not use browser storage as an authority.",
);

for (const contract of [
  '"/play"',
  'url.searchParams.set("gameCode", normalizedCode)',
  'url.searchParams.set("mode", "student")',
  "repairVisibleShareSurfaces",
  "deduplicateVisibleShareSurfaces",
  "dismissShareSurface",
  "econovaria-admin-share-fallback",
  "NATIVE_SURFACE_GRACE_MS",
  "nativeSurfaceObservedUntil",
  "closeControl.click()",
  "EconovariaAdminModalLifecycleBridge?.reconcile?.()",
  "data-econovaria-player-link",
  "input[id*='share-admin-link']",
]) {
  assert(
    shareLinkContract.includes(contract),
    `Canonical selected-game share-link contract is missing ${contract}.`,
  );
}
const repairVisibleStart = shareLinkContract.indexOf(
  "function repairVisibleShareSurfaces()",
);
const scheduleRepairsStart = shareLinkContract.indexOf(
  "function scheduleRepairs()",
  repairVisibleStart,
);
const repairVisibleSource = shareLinkContract.slice(
  repairVisibleStart,
  scheduleRepairsStart,
);
assert(
  repairVisibleStart >= 0 &&
    scheduleRepairsStart > repairVisibleStart &&
    repairVisibleSource.indexOf("deduplicateVisibleShareSurfaces().forEach") <
      repairVisibleSource.indexOf("repairSurface(surface, selected)"),
  "Share surfaces must be deduplicated before canonical content is repaired.",
);
assert(
  shareLinkContract.includes("now < nativeSurfaceObservedUntil") &&
    shareLinkContract.includes("nativeSurfaceObservedUntil = now + NATIVE_SURFACE_GRACE_MS"),
  "A late fallback must be suppressed after the native Share modal was observed.",
);
assert(
  shareLinkContract.indexOf("closeControl.click()") <
    shareLinkContract.indexOf("surface.remove()"),
  "Duplicate Share surfaces must close through the modal lifecycle before raw removal fallback.",
);

for (const contract of [
  "clearSessionSynchronously",
  "revokeServerSession()",
  "return fallbackWebSessionLogout();",
  "fallbackWebSessionLogout",
  "webSessionApiUrl",
  'credentials: "include"',
  "keepalive: true",
  "window.location.replace(loginUrl())",
]) {
  assert(
    logoutController.includes(contract),
    `HttpOnly Admin logout controller is missing ${contract}.`,
  );
}
assert(
  !logoutController.includes("authSession.signOut()"),
  "Admin logout must have one navigation owner and must not delegate to a second teardown path.",
);
assert(
  !logoutController.includes("Authorization") &&
    !logoutController.includes("/auth/sign-out") &&
    !logoutController.includes("/auth/v1/logout") &&
    !logoutController.includes("adminApiUrl"),
  "Admin logout must not restore browser bearer revocation or direct Admin/Auth routes.",
);
assert(
  logoutController.indexOf("logoutPromise = revokeServerSession()") <
    logoutController.indexOf("window.location.replace(loginUrl())"),
  "Admin web-session revocation must settle before signed-out navigation.",
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
assert(
  styles.includes("@media (max-width: 800px)") &&
    styles.includes("> .econovaria-admin-game-session-card"),
  "Narrow Admin layouts must prevent the injected session card from covering content.",
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
  explicitMountLifecycle: true,
  persistedGameCodeAuthority: true,
  sharePanelResponsive: true,
  canonicalPlayerShareRoute: true,
  shareSurfaceDeduplication: true,
  lateFallbackSuppression: true,
  modalLifecycleUnwound: true,
  playerLinkTargetsGameCode: true,
  logoutPointerControl: true,
  logoutHttpOnlyWebSession: true,
  narrowSessionControlsBounded: true,
  backendGameCodeBinding: true,
}, null, 2));
