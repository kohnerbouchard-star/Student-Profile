import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = [
  "src/api/capabilities.js", "src/api/payload-normalizer.js", "src/api/player-api.js", "src/api/request-context.js",
  "src/api/resource-plan.js", "src/api/response-normalizer.js", "src/data/empty-read-models.js",
  "css/player-terminal-tokens.css", "css/player-terminal-foundation.css", "css/routes/player-terminal-dashboard.css",
  "css/player-terminal-interior-v2.css", "css/player-terminal-finance-v2.css", "css/player-terminal-communications-v2.css",
  "css/player-terminal-economy-items-v2.css", "css/player-terminal-operations-v2.css", "css/player-terminal-world-v2.css",
  "tests/player-terminal-css-foundation.mjs", "tests/player-terminal-map-protection.mjs", "tests/player-terminal-dashboard-refresh.mjs",
  "tests/player-v2-legacy-retirement.mjs", "tests/browser/player-dashboard-refresh.spec.mjs", "tests/v75-hardening.mjs"
];
for (const file of required) await access(path.join(root, file));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== "7.5.0") throw new Error("Package version must remain 7.5.0 during the Player V2 retirement tranche.");
for (const script of ["hardening", "css:foundation", "map-protection", "dashboard-refresh", "route-refresh"]) {
  if (!packageJson.scripts?.[script] || !packageJson.scripts.verify.includes(script)) throw new Error(`The ${script} suite must remain part of npm run verify.`);
}
const endpointSource = await readFile(path.join(root, "src/api/endpoints.js"), "utf8");
if (/\blogout\s*:/.test(endpointSource)) throw new Error("Host-owned logout must not appear in the endpoint registry.");
const configSource = await readFile(path.join(root, "src/config/player-terminal.config.js"), "utf8");
for (const marker of ["environment === \"development\"", "allowPreviewMode", "!apiRequested", "developerDiagnostics: environment === \"development\""]) {
  if (!configSource.includes(marker)) throw new Error(`Production preview guard is missing: ${marker}`);
}
const playerApiSource = await readFile(path.join(root, "src/api/player-api.js"), "utf8");
for (const marker of ["export class PlayerApi", "actionPathParams", "PLAYER_ENDPOINTS", "loadRoute(route", "inFlightReads", "inFlightWrites", "idempotencyKey", "refreshResources", "WRITE_INVALIDATIONS", "sessionVersion", "sessionController.abort()", "mergeAbortSignals"]) {
  if (!playerApiSource.includes(marker)) throw new Error(`Player API hardening marker is missing: ${marker}`);
}
if (playerApiSource.includes("Promise.all(keys.map") || playerApiSource.includes("extends CorePlayerApi") || playerApiSource.includes("player-api-core")) throw new Error("A retired Player API architecture returned.");
const httpSource = await readFile(path.join(root, "src/api/http-transport.js"), "utf8");
for (const marker of ["credentials: \"include\"", "x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id", "idempotency-key", "retry-after"]) {
  if (!httpSource.includes(marker)) throw new Error(`HTTP transport control is missing: ${marker}`);
}
for (const forbidden of ["x-player-session-token", "x-econovaria-player-session-token", "headers.Authorization"]) {
  if (httpSource.includes(forbidden)) throw new Error(`Retired browser credential transport returned: ${forbidden}`);
}
const appSource = await readFile(path.join(root, "src/app.js"), "utf8");
for (const marker of ["routeLoading", "routeErrors", "loadRouteData", "applyCapabilityControls", "handleInvalidSession", "invalidatedResources", "terminalLoadVersion"]) {
  if (!appSource.includes(marker)) throw new Error(`Route isolation marker is missing: ${marker}`);
}
const pageSources = await Promise.all(["business-page.js", "banking-page.js", "market-page.js", "marketplace-page.js", "portfolio-page.js", "progression-page.js", "store-page.js"].map((file) => readFile(path.join(root, "src/pages", file), "utf8")));
const combinedPages = pageSources.join("\n");
for (const forbidden of ["API READY", "REQUIRES API", "NOT WIRED", "Backend connection point", "Store purchase connector", "PREVIEW SERIES", "READ MODEL", "player market API", "backend must", "backend-confirmed"]) {
  if (combinedPages.includes(forbidden)) throw new Error(`Player-facing development copy remains: ${forbidden}`);
}
const indexSource = await readFile(path.join(root, "index.html"), "utf8");
for (const legacy of ["player-terminal-base.css", "player-terminal.css", "player-terminal-ux.css", "player-terminal-polish.css", "player-terminal-normalization.css", "player-terminal-shell-compat.css", "player-terminal-route-compat.css"]) {
  if (indexSource.includes(legacy)) throw new Error(`Retired Player visual layer is active: ${legacy}`);
}
const [tokensCss, foundationCss, dashboardCss, auditSource] = await Promise.all([
  readFile(path.join(root, "css/player-terminal-tokens.css"), "utf8"),
  readFile(path.join(root, "css/player-terminal-foundation.css"), "utf8"),
  readFile(path.join(root, "css/routes/player-terminal-dashboard.css"), "utf8"),
  readFile(path.join(root, "tools/audit.mjs"), "utf8")
]);
if (/!important\b/.test(tokensCss) || /!important\b/.test(foundationCss) || /!important\b/.test(dashboardCss)) throw new Error("Source-owned Player token/foundation/Dashboard CSS introduced !important debt.");
if (/lockedHashes|createHash\s*\(/.test(auditSource)) throw new Error("The retired visual hash lock returned.");
if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationCss)) throw new Error("The shell foundation crossed into protected map ownership.");
if (/\.player-terminal-(?:shell|left-menu|nav-item|app-topbar)/.test(dashboardCss)) throw new Error("The Dashboard route owner crossed into shell ownership.");
for (const marker of [".player-terminal-country-overlay", ".player-terminal-map-hud", ".player-terminal-map-footer", ".player-terminal-country-modal"]) {
  if (!dashboardCss.includes(marker)) throw new Error(`Dashboard route ownership is incomplete: ${marker}`);
}
if ((await stat(path.join(root, "css/player-terminal-tokens.css"))).size > 8_000 || (await stat(path.join(root, "css/player-terminal-foundation.css"))).size > 24_000 || (await stat(path.join(root, "css/routes/player-terminal-dashboard.css"))).size > 36_000) {
  throw new Error("Player refresh CSS exceeded a bounded ownership budget.");
}
console.log(`v7.5 audit passed: ${required.length} hardening and V2 ownership artifacts verified with the legacy visual cascade disabled.`);
