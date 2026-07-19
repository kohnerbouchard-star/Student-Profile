import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = (relativePath) => resolve(root, relativePath);

const legacyPaths = [
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

const requiredLegacyPaths = legacyPaths.filter((path) => ![
  "frontend/src/ui/sounds/login-action.mp3"
].includes(path));

const missing = requiredLegacyPaths.filter((relativePath) => !existsSync(at(relativePath)));
if (missing.length) {
  throw new Error(`Legacy cleanup contract drifted; expected files are missing:\n${missing.join("\n")}`);
}

for (const relativePath of legacyPaths) {
  rmSync(at(relativePath), { recursive: true, force: true });
}

writeFileSync(at("frontend/src/styles/app.css"), `/* Active root-login stylesheet entrypoint. Player gameplay is owned by player-terminal/. */

@import url("./base/tokens.css");
@import url("./base/reset.css");
@import url("./base/typography.css");

@import url("./components/buttons.css");
@import url("./components/forms.css");
@import url("./components/status.css");
@import url("./screens/login.css");
@import url("./components/brand.css");
`);

writeFileSync(at("scripts/player-terminal-runtime-cutover-smoke.mjs"), `import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const removedLegacyPaths = ${JSON.stringify(legacyPaths, null, 2)};

for (const relativePath of removedLegacyPaths) {
  try {
    await access(path.join(root, relativePath));
    throw new Error(\`Legacy Player source must remain absent: \${relativePath}\`);
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

console.log(\`Player Terminal runtime cutover and legacy-source removal smoke passed (\${removedLegacyPaths.length} retired paths).\`);

function assertIncludes(value, expected) {
  if (!value.includes(expected)) throw new Error(\`Expected source to include: \${expected}\`);
}

function assertNotIncludes(value, unexpected) {
  if (value.includes(unexpected)) throw new Error(\`Expected source to exclude: \${unexpected}\`);
}
`);

const roadmapPath = at("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md");
let roadmap = readFileSync(roadmapPath, "utf8");
roadmap = replaceRequired(
  roadmap,
  "**Current audited main baseline:** `1d487afc766146b5e3e19f718252b3eff9a1168e`",
  "**Current audited main baseline:** `84bcf89e94425f2a6de9a1a15e0ff4e5fb74ee10`"
);
roadmap = replaceRequired(
  roadmap,
  "| Backend player reconciliation | `IN_PROGRESS` | PR #158, branch `agent/player-backend-reconciliation-v2` |\n| Seed-content foundation | `IN_PROGRESS` | PR #163, branch `agent/seed-content-foundation-v1` |",
  "| Backend player reconciliation | `VERIFIED_COMPLETE` | PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac` |\n| Seed-content foundation | `IN_PROGRESS` | PR #163, branch `agent/seed-content-foundation-v1` |\n| Player runtime cutover and legacy source removal | `IMPLEMENTED_NOT_MERGED` | PR #217 merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`; cleanup branch `agent/legacy-player-source-removal-v1` |"
);
roadmap = replaceRequired(
  roadmap,
  "### Current release condition\n\nThe application is not yet approved for beta or production runtime cutover because the following remain unresolved:\n\n- authoritative backend reconciliation;\n- Player Terminal runtime adapter installation;\n- capability manifest validation;\n- Contract acceptance;\n- inventory redemption;\n- executable seed content;\n- migration-history reconciliation;\n- legacy runtime containment;\n- isolated staging;\n- backup and restore rehearsal;\n- final end-to-end beta verification.",
  "### 2026-07-19 runtime reconciliation\n\n- PR #158 merged the authoritative Player backend boundary, logout, capability manifest, Contract acceptance, Inventory reads, notifications, and redemption Backend workflow as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.\n- PR #177 merged the Admin inventory-redemption review queue as `00ffc841cb7072cb98610e23d20eb4d0cfd60cf8`.\n- PR #217 merged the Player Terminal host-runtime cutover and removed the Cloudflare browser transport as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`.\n- `agent/legacy-player-source-removal-v1` physically removes the now-unmounted legacy Player source and installs a repository ratchet preventing its return.\n\n### Current release condition\n\nThe application is not yet approved for beta or production runtime cutover because the following remain unresolved:\n\n- merge and verify the physical legacy Player source-removal tranche;\n- connected isolated-staging Player and Admin verification;\n- production traffic evidence and credential rotation before live Cloudflare Worker shutdown;\n- executable seed content and staging activation;\n- migration-history reconciliation;\n- backup and restore rehearsal;\n- final end-to-end beta verification."
);
writeFileSync(roadmapPath, roadmap);

const amendmentPath = at("docs/roadmaps/econovaria-player-runtime-cutover-amendment-2026-07-19.md");
let amendment = readFileSync(amendmentPath, "utf8");
if (!amendment.includes("## Physical legacy-source removal")) {
  amendment += `\n\n## Physical legacy-source removal\n\n**Branch:** \`agent/legacy-player-source-removal-v1\`  \n**Status:** \`IMPLEMENTED_NOT_MERGED\`\n\nThis bounded cleanup deletes the dormant root-shell Player implementation, its feature modules, obsolete realtime adapter and test, compatibility marker, unused Player CSS screens/layouts, and the old behavior-preserving refactor note. The root authentication surface, Admin runtime, Player Terminal, Supabase API bridge, operational Cloudflare-retirement evidence, and seed-content authority remain intact.\n\nThe permanent runtime-cutover smoke now fails if any retired path returns or if active sources restore \`appShell\`, \`submitAction\`, \`workers.dev\`, or the legacy Cloudflare hostname.\n`;
}
writeFileSync(amendmentPath, amendment);

console.log(`Removed ${legacyPaths.length} dormant legacy Player paths and updated runtime ratchets.`);

function replaceRequired(source, before, after) {
  if (!source.includes(before)) {
    throw new Error(`Required roadmap replacement source was not found:\n${before}`);
  }
  return source.replace(before, after);
}
