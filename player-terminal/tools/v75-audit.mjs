import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = [
  "src/api/capabilities.js",
  "src/api/payload-normalizer.js",
  "src/api/player-api.js",
  "src/api/request-context.js",
  "src/api/resource-plan.js",
  "src/api/response-normalizer.js",
  "src/data/empty-read-models.js",
  "css/player-terminal-tokens.css",
  "css/player-terminal-foundation.css",
  "tests/player-terminal-css-foundation.mjs",
  "tests/player-terminal-map-protection.mjs",
  "tests/v75-hardening.mjs",
  "V75_API_READINESS.md",
  "ARCHITECTURE_BEFORE_AFTER_V75.md",
  "PLAYER_TERMINAL_REFRESH_FOUNDATION.md"
];
for (const file of required) await access(path.join(root, file));

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== "7.5.0") throw new Error("Package version must remain 7.5.0 during the visual foundation tranche.");
if (!packageJson.scripts?.hardening || !packageJson.scripts.verify.includes("hardening")) {
  throw new Error("The v7.5 hardening suite must be part of npm run verify.");
}
for (const script of ["css:foundation", "map-protection"]) {
  if (!packageJson.scripts?.[script] || !packageJson.scripts.verify.includes(script)) {
    throw new Error(`The ${script} suite must be part of npm run verify.`);
  }
}

const endpointSource = await readFile(path.join(root, "src/api/endpoints.js"), "utf8");
if (/\blogout\s*:/.test(endpointSource)) throw new Error("Host-owned logout must not appear in the endpoint registry.");

const configSource = await readFile(path.join(root, "src/config/player-terminal.config.js"), "utf8");
for (const marker of ["environment === \"development\"", "allowPreviewMode", "!apiRequested", "developerDiagnostics: environment === \"development\""]) {
  if (!configSource.includes(marker)) throw new Error(`Production preview guard is missing: ${marker}`);
}

const playerApiSource = await readFile(path.join(root, "src/api/player-api.js"), "utf8");
for (const marker of [
  "export class PlayerApi",
  "actionPathParams",
  "PLAYER_ENDPOINTS",
  "loadRoute(route",
  "inFlightReads",
  "inFlightWrites",
  "idempotencyKey",
  "refreshResources",
  "WRITE_INVALIDATIONS",
  "sessionVersion",
  "sessionController.abort()",
  "mergeAbortSignals"
]) {
  if (!playerApiSource.includes(marker)) throw new Error(`Player API hardening marker is missing: ${marker}`);
}
if (playerApiSource.includes("Promise.all(keys.map")) throw new Error("All-route bootstrap has returned.");
if (playerApiSource.includes("extends CorePlayerApi") || playerApiSource.includes("player-api-core")) {
  throw new Error("The retired duplicate Player API core has returned.");
}

const adapterSource = await readFile(path.join(root, "src/api/adapter-transport.js"), "utf8");
for (const marker of ["AbortController", "REQUEST_TIMEOUT", "requestId", "signal: controller.signal"]) {
  if (!adapterSource.includes(marker)) throw new Error(`Adapter transport control is missing: ${marker}`);
}

const httpSource = await readFile(path.join(root, "src/api/http-transport.js"), "utf8");
for (const marker of [
  "credentials: \"include\"",
  "x-econovaria-csrf-token",
  "x-econovaria-device-id",
  "x-request-id",
  "idempotency-key",
  "retry-after"
]) {
  if (!httpSource.includes(marker)) throw new Error(`HTTP transport control is missing: ${marker}`);
}
for (const forbidden of ["x-player-session-token", "x-econovaria-player-session-token", "headers.Authorization"]) {
  if (httpSource.includes(forbidden)) throw new Error(`Retired browser credential transport returned: ${forbidden}`);
}
if (httpSource.includes("body?.message")) throw new Error("Raw backend messages must not be displayed or promoted.");

const appSource = await readFile(path.join(root, "src/app.js"), "utf8");
for (const marker of ["routeLoading", "routeErrors", "loadRouteData", "applyCapabilityControls", "handleInvalidSession", "invalidatedResources", "terminalLoadVersion"]) {
  if (!appSource.includes(marker)) throw new Error(`Route isolation marker is missing: ${marker}`);
}
if (/console\.(?:log|error)\([^\n]*(?:token|authorization)/i.test(appSource)) {
  throw new Error("Session or authorization values must not be logged.");
}
const logoutBlock = appSource.match(/if \(action === "logout"\)[\s\S]{0,500}/)?.[0] || "";
if (!logoutBlock || logoutBlock.includes("playerSessionToken") || logoutBlock.includes("accessToken")) {
  throw new Error("Host-owned sign-out must not expose a session token through the global event.");
}

const pageSources = await Promise.all([
  "business-page.js", "banking-page.js", "market-page.js", "marketplace-page.js", "portfolio-page.js", "progression-page.js", "store-page.js"
].map((file) => readFile(path.join(root, "src/pages", file), "utf8")));
const combinedPages = pageSources.join("\n");
for (const forbidden of ["API READY", "REQUIRES API", "NOT WIRED", "Backend connection point", "Store purchase connector", "PREVIEW SERIES", "READ MODEL", "player market API", "backend must", "backend-confirmed"]) {
  if (combinedPages.includes(forbidden)) throw new Error(`Player-facing development copy remains: ${forbidden}`);
}

const [tokensCss, foundationCss, auditSource] = await Promise.all([
  readFile(path.join(root, "css/player-terminal-tokens.css"), "utf8"),
  readFile(path.join(root, "css/player-terminal-foundation.css"), "utf8"),
  readFile(path.join(root, "tools/audit.mjs"), "utf8")
]);
if (/!important\b/.test(tokensCss) || /!important\b/.test(foundationCss)) {
  throw new Error("The Player refresh foundation introduced !important debt.");
}
if (/lockedHashes|createHash\s*\(/.test(auditSource)) {
  throw new Error("The retired byte-for-byte visual hash lock returned.");
}
if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationCss)) {
  throw new Error("The shell foundation crossed into protected map ownership.");
}
const tokenStats = await stat(path.join(root, "css/player-terminal-tokens.css"));
const foundationStats = await stat(path.join(root, "css/player-terminal-foundation.css"));
if (tokenStats.size > 8_000 || foundationStats.size > 24_000) {
  throw new Error("Player refresh foundation exceeded its bounded CSS budget.");
}

console.log(`v7.5 audit passed: ${required.length} hardening and refresh artifacts, unified Player API ownership, production guards, cookie-session transport controls, protected map ownership, and bounded source-owned CSS verified.`);
