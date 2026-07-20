import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const removedLegacyPaths = [
  "app.js",
  "frontend/BEHAVIOR_PRESERVING_REFACTOR.md",
  "frontend/src/core/bootstrap.js",
  "frontend/src/core/router.js",
  "frontend/src/core/snapshot.js",
  "frontend/src/core/state.js",
  "frontend/src/utils/formatting.js",
  "frontend/src/utils/currency-symbols.js",
  "frontend/src/ui/dom.js",
  "frontend/src/ui/student-ui.js",
  "frontend/src/ui/mobile.js",
  "frontend/src/ui/academic-market-copy.js",
  "frontend/src/ui/ui-sound-effects.js",
  "frontend/src/ui/sounds/login-action.mp3",
  "frontend/src/features/auth/auth.js",
  "frontend/src/features/dashboard/dashboard.js",
  "frontend/src/features/store/store.js",
  "frontend/src/features/inventory/inventory.js",
  "frontend/src/features/portfolio/portfolio.js",
  "frontend/src/features/trading/trading.js",
  "frontend/src/features/market/market.js",
  "frontend/src/features/market/market-data-refresh.js",
  "frontend/src/features/forecasts/forecasts.js",
  "frontend/src/features/realtime/game-public-realtime.js",
  "frontend/src/features/realtime/game-public-realtime.test.js",
  "frontend/src/features/contracts/contracts.js",
  "frontend/src/features/contracts/contracts-sync.js",
  "frontend/src/styles/components/cards.css",
  "frontend/src/styles/layout/app-shell.css",
  "frontend/src/styles/layout/sidebar.css",
  "frontend/src/styles/layout/topbar.css",
  "frontend/src/styles/screens/dashboard.css",
  "frontend/src/styles/screens/market.css",
  "frontend/src/styles/screens/trading.css",
  "frontend/src/styles/screens/store.css",
  "frontend/src/styles/screens/portfolio.css",
  "frontend/src/styles/screens/forecasts.css",
  "frontend/src/styles/screens/contracts.css"
];

for (const relativePath of removedLegacyPaths) {
  try {
    await access(path.join(root, relativePath));
    throw new Error(`Legacy Player source must remain absent: ${relativePath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const [html, styles, constants, api, login, terminalHtml, hostRuntime] = await Promise.all([
  read("index.html"),
  read("frontend/src/styles/app.css"),
  read("frontend/src/core/constants.js"),
  read("frontend/src/core/api.js"),
  read("frontend/src/core/login.js"),
  read("player-terminal/index.html"),
  read("player-terminal/host-runtime.js")
]);

for (const forbidden of [
  'id="appShell"',
  "frontend/src/features/",
  "frontend/src/core/bootstrap.js",
  "frontend/src/core/router.js",
  "frontend/src/core/snapshot.js",
  "frontend/src/core/state.js",
  "frontend/src/ui/student-ui.js",
  "frontend/src/utils/"
]) {
  assertNotIncludes(html, forbidden);
}

for (const forbiddenImport of [
  "layout/app-shell.css",
  "layout/sidebar.css",
  "layout/topbar.css",
  "screens/dashboard.css",
  "screens/market.css",
  "screens/trading.css",
  "screens/store.css",
  "screens/portfolio.css",
  "screens/forecasts.css",
  "screens/contracts.css"
]) {
  assertNotIncludes(styles, forbiddenImport);
}

for (const activeSource of [html, styles, constants, api, login, terminalHtml, hostRuntime]) {
  assertNotIncludes(activeSource, "workers.dev");
  assertNotIncludes(activeSource, "silent-haze-ca17");
  assertNotIncludes(activeSource, "submitAction");
}

assertNotIncludes(constants, "const API_URL =");
assertNotIncludes(api, "callApiOnce");
assertIncludes(api, 'callSupabaseJsonRoute("/players/login"');
assertIncludes(api, "playerIdentifier:");
assertIncludes(api, "accessCode:");

assertIncludes(login, "econovaria.player.auth.v1");
assertIncludes(login, "runtime.sessionStorage.setItem(playerStorageKey()");
assertIncludes(login, 'new URL("player-terminal/"');
assertIncludes(login, "callPlayerBootstrapApi");
assertNotIncludes(login, "showApp(");
assertNotIncludes(login, "loadPlayerGameDashboardSnapshot");

const hostIndex = terminalHtml.indexOf('<script src="./host-runtime.js"></script>');
const mainIndex = terminalHtml.indexOf('<script type="module" src="./src/main.js"></script>');
if (hostIndex < 0 || mainIndex < 0 || hostIndex >= mainIndex) {
  throw new Error("Player Terminal host runtime must load before the module entrypoint.");
}

assertIncludes(hostRuntime, "sessionProvider: () => readStoredSession()");
assertIncludes(hostRuntime, "studentProfileApiBaseUrl: CLASSROOM_API_URL");
assertIncludes(hostRuntime, "accessToken: SUPABASE_PUBLISHABLE_KEY");
assertIncludes(hostRuntime, "econovaria:player-logout-completed");
assertIncludes(hostRuntime, "econovaria:player-session-invalid");
assertIncludes(hostRuntime, "runtime.sessionStorage.removeItem(STORAGE_KEY)");

console.log(`Player Terminal runtime cutover and legacy-source removal smoke passed (${removedLegacyPaths.length} retired paths).`);

function assertIncludes(value, expected) {
  if (!value.includes(expected)) throw new Error(`Expected source to include: ${expected}`);
}

function assertNotIncludes(value, unexpected) {
  if (value.includes(unexpected)) throw new Error(`Expected source to exclude: ${unexpected}`);
}
