import { access, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = [
  "index.html",
  "css/player-terminal-base.css",
  "css/player-terminal.css",
  "css/player-terminal-ux.css",
  "css/player-terminal-polish.css",
  "css/player-terminal-normalization.css",
  "assets/images/econovaria-world-map.png",
  "assets/map/country-regions.json",
  "src/main.js",
  "src/app.js",
  "src/data/map-regions.js",
  "src/components/layout.js",
  "src/api/endpoints.js",
  "src/api/session-handoff.js",
  "src/pages/dashboard-page.js",
  "src/pages/news-page.js",
  "src/pages/market-page.js",
  "src/pages/portfolio-page.js",
  "src/pages/business-page.js",
  "src/pages/contracts-page.js",
  "src/pages/store-page.js",
  "src/pages/marketplace-page.js",
  "src/pages/inventory-page.js",
  "src/pages/crafting-page.js",
  "src/pages/banking-page.js",
  "src/pages/loans-page.js",
  "src/pages/messages-page.js",
  "src/pages/progression-page.js",
  "src/pages/profile-page.js",
  "UX_STABILIZATION.md",
  "UX_RESEARCH_AND_DECISIONS.md",
  "PLAYER_API_CONNECTIONS.md",
  "SESSION_ADAPTER.md",
  "V7_STYLE_LOCK.md",
  "UI_MAP_PASS.md",
  "VISUAL_NORMALIZATION.md",
  "VISUAL_AUDIT_V74.md",
  "preview/v7.4-visual-normalization/desktop-visual-normalization-v7.4.jpg",
  "preview/v7.4-visual-normalization/mobile-visual-normalization-v7.4.jpg",
  "preview/v7.4-visual-normalization/store-before-after-v7.4.jpg",
  "preview/v7.4-visual-normalization/audit.json",
  "preview/v7.4-visual-normalization/stress-audit-v7.4.json"
];

for (const relative of required) await access(path.join(root, relative));

const mapStats = await stat(path.join(root, "assets/images/econovaria-world-map.png"));
if (mapStats.size < 500_000) throw new Error("World map asset appears incomplete.");

const sourceFiles = [];
const ignoredDirectories = new Set([".git", "node_modules", "playwright-report", "test-results"]);
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    if (entry.isFile() && /\.(?:js|html|css|md)$/.test(entry.name)) sourceFiles.push(full);
  }
}
await walk(root);

const forbidden = [/TODO\b/i, /javascript:void\(0\)/i, /onclick\s*=/i];
for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`Audit failed: ${pattern} found in ${path.relative(root, file)}`);
  }
}

const baseCss = await readFile(path.join(root, "css/player-terminal-base.css"), "utf8");
if (baseCss.includes(".admin-terminal")) throw new Error("Admin CSS namespace leaked into the standalone player base stylesheet.");
if (!baseCss.includes(".player-terminal-shell")) throw new Error("Player shell styles are missing from the base stylesheet.");

const playerCss = await readFile(path.join(root, "css/player-terminal.css"), "utf8");
for (const marker of [
  "v2 stabilization pass",
  "v3 — unified player icon system",
  "v4 — focused core expansion",
  "v5 — controlled system expansion",
  "player-terminal-connector-modal > .player-terminal-modal-body"
]) {
  if (!playerCss.includes(marker)) throw new Error(`Required CSS marker is missing: ${marker}`);
}

const uxCss = await readFile(path.join(root, "css/player-terminal-ux.css"), "utf8");
for (const marker of [
  "v7 — stabilization and interaction-hardening pass",
  ".player-terminal-form-error",
  ".player-terminal-empty-state",
  ".player-terminal-route-error",
  ".player-terminal-holdings-table > button",
  ".player-terminal-notification-drawer"
]) {
  if (!uxCss.includes(marker)) throw new Error(`Required v7 UX marker is missing: ${marker}`);
}

const lockedHashes = {
  "css/player-terminal-base.css": "8da4902d9851b579704bf71d37c3e2e5b49f27c1f6c621746ffd0c77879fdd0e",
  "css/player-terminal.css": "004ffcf7265ebf0f72de2064cf9ed7e554aecd08568be54413f92a3833f3892a",
  "css/player-terminal-ux.css": "4f960ad2e878500569ed0863e43350c9b662f5de99de67bc20d6656cae642356",
  "css/player-terminal-polish.css": "09ea86afa5e977b628f2b65c394b0428437b4917c8e176e2a1a1988c0da1bbf8",
  "src/components/icons.js": "1cabd37bbcc4c98f73d12a64b6e95316d3b2cf18c304defd6612fc2dba8ef751"
};
for (const [relative, expected] of Object.entries(lockedHashes)) {
  const buffer = await readFile(path.join(root, relative));
  const actual = createHash("sha256").update(buffer).digest("hex");
  if (actual !== expected) throw new Error(`V7 style/icon lock changed: ${relative}`);
}

const polishCss = await readFile(path.join(root, "css/player-terminal-polish.css"), "utf8");
for (const marker of [
  "Country-border interaction layer",
  ".player-terminal-country-border",
  ".player-terminal-country-region:is(:hover, :focus-visible)",
  "Specific fit corrections found during the visual audit",
  ".player-terminal-contract-tabs"
]) {
  if (!polishCss.includes(marker)) throw new Error(`Required UI/map polish marker is missing: ${marker}`);
}

const normalizationCss = await readFile(path.join(root, "css/player-terminal-normalization.css"), "utf8");
for (const marker of [
  "Econovaria Player Terminal v7.4 — surgical visual normalization",
  "--player-terminal-space-6: 32px",
  ".player-terminal-business-product > div:nth-child(2)",
  ".player-terminal-crafting-summary article > div",
  ".player-terminal-loan-offer > div",
  "A row-oriented search field must not retain a 240px flex-basis"
]) {
  if (!normalizationCss.includes(marker)) throw new Error(`Required v7.4 normalization marker is missing: ${marker}`);
}

const indexSource = await readFile(path.join(root, "index.html"), "utf8");
if (!indexSource.includes("css/player-terminal-normalization.css")) {
  throw new Error("v7.4 normalization stylesheet is not loaded by index.html.");
}

const mapSource = await readFile(path.join(root, "src/data/map-regions.js"), "utf8");
for (const marker of ["ECONOVARIA_MAP_SIZE", "ECONOVARIA_COUNTRY_REGIONS", "countryRegionPath", "northreach", "syndalis"]) {
  if (!mapSource.includes(marker)) throw new Error(`Required map geometry marker is missing: ${marker}`);
}

const dashboardSource = await readFile(path.join(root, "src/pages/dashboard-page.js"), "utf8");
for (const marker of ["renderCountryOverlay", "player-terminal-country-overlay", "player-terminal-country-border", "data-player-country"]) {
  if (!dashboardSource.includes(marker)) throw new Error(`Required interactive map renderer marker is missing: ${marker}`);
}

const appSource = await readFile(path.join(root, "src/app.js"), "utf8");
for (const marker of [
  "ROUTE_TITLES",
  "focusAfterRender",
  "closeTopOverlay",
  "showFormError",
  "updateMarketOrderEstimate",
  "updateMarketplaceEstimate",
  "globalThis.addEventListener(\"offline\"",
  "document.title =",
  "form.noValidate = true",
  "form.checkValidity()",
  "keyboardCountry",
  "data-player-country"
]) {
  if (!appSource.includes(marker)) throw new Error(`Required v7 application behavior is missing: ${marker}`);
}

const layoutSource = await readFile(path.join(root, "src/components/layout.js"), "utf8");
for (const marker of ["aria-current", "player-terminal-bell-drawer", "tabindex=\"-1\"", "aria-label=\"Mobile primary navigation\""]) {
  if (!layoutSource.includes(marker)) throw new Error(`Required navigation accessibility marker is missing: ${marker}`);
}

const iconSource = await readFile(path.join(root, "src/components/icons.js"), "utf8");
for (const marker of ["player-terminal-icon--${definition.mode}", "market:", "news:", "portfolio:", "chevronLeft:", "chevronRight:"]) {
  if (!iconSource.includes(marker)) throw new Error(`Required icon definition is missing: ${marker}`);
}

const routerSource = await readFile(path.join(root, "src/core/router.js"), "utf8");
for (const route of ["dashboard", "news", "market", "portfolio", "business", "contracts", "store", "marketplace", "inventory", "crafting", "banking", "loans", "messages", "progression", "profile"]) {
  if (!routerSource.includes(`\"${route}\"`)) throw new Error(`Required route is missing: ${route}`);
}

const endpointSource = await readFile(path.join(root, "src/api/endpoints.js"), "utf8");
for (const endpoint of ["business:", "marketplace:", "crafting:", "loans:", "messages:", "progression:", "progressionUnlock:"]) {
  if (!endpointSource.includes(endpoint)) throw new Error(`Required endpoint is missing: ${endpoint}`);
}

const sessionSource = await readFile(path.join(root, "src/api/session-handoff.js"), "utf8");
for (const marker of ["normalizePlayerSessionHandoff", "applyPlayerSessionHandoff", "resolveExistingPlayerSession"]) {
  if (!sessionSource.includes(marker)) throw new Error(`Required session adapter marker is missing: ${marker}`);
}

if (!appSource.includes("connectSession")) throw new Error("Public connectSession handoff is missing.");
if (!appSource.includes("config.sessionReadyEvent") || !appSource.includes("config.sessionInvalidEvent")) throw new Error("Session handoff events are missing.");

console.log(`Audit passed: ${required.length} required files and ${sourceFiles.length} source artifacts verified for v7.4 visual normalization.`);
