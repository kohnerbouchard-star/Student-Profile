import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [html, constants, api, login, terminalHtml, hostRuntime] = await Promise.all([
  read("index.html"),
  read("frontend/src/core/constants.js"),
  read("frontend/src/core/api.js"),
  read("frontend/src/core/login.js"),
  read("player-terminal/index.html"),
  read("player-terminal/host-runtime.js")
]);

for (const forbidden of [
  'id="appShell"',
  "frontend/src/features/store/store.js",
  "frontend/src/features/trading/trading.js",
  "frontend/src/features/forecasts/forecasts.js",
  "frontend/src/features/inventory/inventory.js",
  "frontend/src/features/auth/auth.js",
  "frontend/src/core/bootstrap.js"
]) {
  assertNotIncludes(html, forbidden);
}

for (const activeSource of [constants, api, login, terminalHtml, hostRuntime]) {
  assertNotIncludes(activeSource, "workers.dev");
  assertNotIncludes(activeSource, "silent-haze-ca17");
}

assertNotIncludes(constants, "const API_URL =");
assertNotIncludes(api, "submitAction");
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

console.log("Player Terminal runtime cutover smoke passed.");

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`Expected source to include: ${expected}`);
  }
}

function assertNotIncludes(value, unexpected) {
  if (value.includes(unexpected)) {
    throw new Error(`Expected source to exclude: ${unexpected}`);
  }
}
