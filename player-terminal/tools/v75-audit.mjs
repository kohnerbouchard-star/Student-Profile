import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = [
  "src/api/capabilities.js",
  "src/api/payload-normalizer.js",
  "src/api/request-context.js",
  "src/api/resource-plan.js",
  "src/api/response-normalizer.js",
  "src/data/empty-read-models.js",
  "tests/v75-hardening.mjs",
  "V75_API_READINESS.md",
  "ARCHITECTURE_BEFORE_AFTER_V75.md"
];
for (const file of required) await access(path.join(root, file));

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== "7.5.0") throw new Error("Package version must be 7.5.0.");
if (!packageJson.scripts?.hardening || !packageJson.scripts.verify.includes("hardening")) {
  throw new Error("The v7.5 hardening suite must be part of npm run verify.");
}

const endpointSource = await readFile(path.join(root, "src/api/endpoints.js"), "utf8");
if (/\blogout\s*:/.test(endpointSource)) throw new Error("Host-owned logout must not appear in the endpoint registry.");

const configSource = await readFile(path.join(root, "src/config/player-terminal.config.js"), "utf8");
for (const marker of ["environment === \"development\"", "allowPreviewMode", "!apiRequested", "developerDiagnostics: environment === \"development\""]) {
  if (!configSource.includes(marker)) throw new Error(`Production preview guard is missing: ${marker}`);
}

const playerApiSource = await readFile(path.join(root, "src/api/player-api.js"), "utf8");
for (const marker of ["loadRoute(route", "inFlightReads", "inFlightWrites", "idempotencyKey", "refreshResources", "WRITE_INVALIDATIONS", "sessionVersion", "sessionController.abort()", "mergeAbortSignals"]) {
  if (!playerApiSource.includes(marker)) throw new Error(`Player API hardening marker is missing: ${marker}`);
}
if (playerApiSource.includes("Promise.all(keys.map")) throw new Error("All-route bootstrap has returned.");

const adapterSource = await readFile(path.join(root, "src/api/adapter-transport.js"), "utf8");
for (const marker of ["AbortController", "REQUEST_TIMEOUT", "requestId", "signal: controller.signal"]) {
  if (!adapterSource.includes(marker)) throw new Error(`Adapter transport control is missing: ${marker}`);
}

const httpSource = await readFile(path.join(root, "src/api/http-transport.js"), "utf8");
for (const marker of ["x-econovaria-player-session-token", "x-request-id", "idempotency-key", "retry-after"]) {
  if (!httpSource.includes(marker)) throw new Error(`HTTP transport control is missing: ${marker}`);
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

const lockedHashes = {
  "css/player-terminal-base.css": "8da4902d9851b579704bf71d37c3e2e5b49f27c1f6c621746ffd0c77879fdd0e",
  "css/player-terminal.css": "004ffcf7265ebf0f72de2064cf9ed7e554aecd08568be54413f92a3833f3892a",
  "css/player-terminal-ux.css": "4f960ad2e878500569ed0863e43350c9b662f5de99de67bc20d6656cae642356",
  "css/player-terminal-polish.css": "09ea86afa5e977b628f2b65c394b0428437b4917c8e176e2a1a1988c0da1bbf8",
  "css/player-terminal-normalization.css": "980abdaa806a4247be1370143bcb1d5becb03385356500157a52062d80f14ded",
  "src/components/icons.js": "1cabd37bbcc4c98f73d12a64b6e95316d3b2cf18c304defd6612fc2dba8ef751",
  "preview/v7.4-visual-normalization/desktop-visual-normalization-v7.4.jpg": "0297dfd363d0aaeeabf8d0d53e3b913038255a5ecda112fb1b3ce1060ff5f2ba",
  "preview/v7.4-visual-normalization/mobile-visual-normalization-v7.4.jpg": "41fef67f999aa81e36767959814cba2d84ce9c92d9f0694e6dce150b7652b3e0",
  "preview/v7.4-visual-normalization/store-before-after-v7.4.jpg": "76535ccde4725adfb1ff3ca3f6aa0fe00d1c467a487d617cfbe033a6ae805b31",
  "preview/v7.4-visual-normalization/audit.json": "01b5393365dc8f368133ff8b726e7cccca0d0547916e292923ca300da68855b5",
  "preview/v7.4-visual-normalization/stress-audit-v7.4.json": "9e22aedbab8ebf8c7dd76bf521f593960e5cb2f1de9e1bbd045ee6bc8072b649"
};

for (const [file, expected] of Object.entries(lockedHashes)) {
  const content = await readFile(path.join(root, file));
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) throw new Error(`Approved v7 visual lock changed: ${file}`);
}

console.log(`v7.5 audit passed: ${required.length} hardening artifacts, production guards, transport controls, development-copy cleanup, and ${Object.keys(lockedHashes).length} visual locks verified.`);
