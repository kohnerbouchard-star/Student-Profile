import { access, readFile, readdir, stat } from "node:fs/promises";
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
  "css/player-terminal-tokens.css",
  "css/player-terminal-foundation.css",
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
  "tests/player-terminal-css-foundation.mjs",
  "tests/player-terminal-map-protection.mjs",
  "UX_STABILIZATION.md",
  "UX_RESEARCH_AND_DECISIONS.md",
  "PLAYER_API_CONNECTIONS.md",
  "SESSION_ADAPTER.md",
  "V7_STYLE_LOCK.md",
  "PLAYER_TERMINAL_REFRESH_FOUNDATION.md",
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

const tokensCss = await readFile(path.join(root, "css/player-terminal-tokens.css"), "utf8");
for (const marker of [
  "refresh foundation — design tokens",
  "--player-text-label: 0.75rem",
  "--player-control-md: 2.75rem",
  "--player-icon-nav: 1.25rem",
  "--player-terminal-type-label: var(--player-text-label)"
]) {
  if (!tokensCss.includes(marker)) throw new Error(`Required Player token is missing: ${marker}`);
}

const foundationCss = await readFile(path.join(root, "css/player-terminal-foundation.css"), "utf8");
for (const marker of [
  "refresh foundation — shell ownership",
  ".player-terminal-shell",
  ".player-terminal-nav-item",
  ".player-terminal-app-topbar",
  ".player-terminal-mobile-nav"
]) {
  if (!foundationCss.includes(marker)) throw new Error(`Required Player foundation marker is missing: ${marker}`);
}
if (/!important\b/.test(tokensCss) || /!important\b/.test(foundationCss)) {
  throw new Error("The Player refresh foundation must not add !important declarations.");
}
if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationCss)) {
  throw new Error("The Player shell foundation must not style the protected interactive map.");
}

const polishCss = await readFile(path.join(root, "css/player-terminal-polish.css"), "utf8");
for (const marker of [
  "Country-border interaction layer",
  ".player-terminal-country-border",
  ".player-terminal-country-region:is(:hover, :focus-visible)",
  "Specific fit corrections found during the visual audit",
  ".player-terminal-contract-tabs"
]) {
  if (!polishCss.includes(marker)) throw new Error(`Required UI/map presentation marker is missing: ${marker}`);
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
  if (!normalizationCss.includes(marker)) throw new Error(`Required v7.4 compatibility marker is missing: ${marker}`);
}

const indexSource = await readFile(path.join(root, "index.html"), "utf8");
const normalizationIndex = indexSource.indexOf("css/player-terminal-normalization.css");
const tokensIndex = indexSource.indexOf("css/player-terminal-tokens.css");
const foundationIndex = indexSource.indexOf("css/player-terminal-foundation.css");
const skeletonIndex = indexSource.indexOf("css/player-terminal-skeletons.css");
if (!(normalizationIndex >= 0 && normalizationIndex < tokensIndex && tokensIndex < foundationIndex && foundationIndex < skeletonIndex)) {
  throw new Error("Player refresh stylesheets are not loaded in the required ownership order.");
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

console.log(`Audit passed: ${required.length} required files and ${sourceFiles.length} source artifacts verified with Player refresh foundation and protected map ownership.`);
