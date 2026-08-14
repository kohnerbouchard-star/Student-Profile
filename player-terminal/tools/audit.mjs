import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = [
  "index.html",
  "css/player-terminal-tokens.css",
  "css/player-terminal-foundation.css",
  "css/routes/player-terminal-shared-layout.css",
  "css/routes/player-terminal-shared-cards.css",
  "css/routes/player-terminal-shared-lists.css",
  "css/routes/player-terminal-shared-states.css",
  "css/routes/player-terminal-shared-details.css",
  "css/routes/player-terminal-shared-responsive.css",
  "css/routes/player-terminal-shared-overlays.css",
  "css/routes/player-terminal-dashboard.css",
  "css/player-terminal-interior-v2.css",
  "css/player-terminal-finance-v2.css",
  "css/player-terminal-communications-v2.css",
  "css/player-terminal-economy-items-v2.css",
  "css/player-terminal-operations-v2.css",
  "css/player-terminal-world-v2.css",
  "assets/images/econovaria-world-map.png",
  "assets/map/country-regions.json",
  "src/main.js", "src/app.js", "src/data/map-regions.js", "src/components/layout.js",
  "src/api/endpoints.js", "src/api/session-handoff.js",
  "src/pages/dashboard-page.js", "src/pages/news-page.js", "src/pages/market-page.js", "src/pages/portfolio-page.js",
  "src/pages/business-page.js", "src/pages/contracts-page.js", "src/pages/store-page.js", "src/pages/marketplace-page.js",
  "src/pages/inventory-page.js", "src/pages/crafting-page.js", "src/pages/banking-page.js", "src/pages/loans-page.js",
  "src/pages/messages-page.js", "src/pages/progression-page.js", "src/pages/profile-page.js",
  "tests/player-terminal-css-foundation.mjs", "tests/player-terminal-map-protection.mjs", "tests/player-terminal-route-refresh.mjs",
  "tests/player-terminal-dashboard-refresh.mjs", "tests/player-v2-legacy-retirement.mjs", "tests/browser/player-dashboard-refresh.spec.mjs"
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
for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  for (const pattern of [/TODO\b/i, /javascript:void\(0\)/i, /onclick\s*=/i]) {
    if (pattern.test(text)) throw new Error(`Audit failed: ${pattern} found in ${path.relative(root, file)}`);
  }
}

const indexSource = await readFile(path.join(root, "index.html"), "utf8");
for (const legacy of ["player-terminal-base.css", "player-terminal.css", "player-terminal-ux.css", "player-terminal-polish.css", "player-terminal-normalization.css", "player-terminal-shell-compat.css", "player-terminal-route-compat.css"]) {
  if (indexSource.includes(legacy)) throw new Error(`Retired Player visual layer is still active: ${legacy}`);
}

const tokensCss = await readFile(path.join(root, "css/player-terminal-tokens.css"), "utf8");
const foundationCss = await readFile(path.join(root, "css/player-terminal-foundation.css"), "utf8");
const dashboardCss = await readFile(path.join(root, "css/routes/player-terminal-dashboard.css"), "utf8");
const canonicalV2 = await Promise.all([
  "css/player-terminal-interior-v2.css", "css/player-terminal-finance-v2.css", "css/player-terminal-communications-v2.css",
  "css/player-terminal-economy-items-v2.css", "css/player-terminal-operations-v2.css", "css/player-terminal-world-v2.css"
].map((file) => readFile(path.join(root, file), "utf8")));
for (const [name, source] of [["tokens", tokensCss], ["foundation", foundationCss], ["dashboard", dashboardCss], ...canonicalV2.map((source, index) => [`v2-${index + 1}`, source])]) {
  if (/!important\b/.test(source)) throw new Error(`Source-owned Player CSS contains !important debt: ${name}`);
}
for (const marker of ["refresh foundation — design tokens", "--player-text-label: 0.75rem", "--player-control-md: 2.75rem", "--player-icon-nav: 1.25rem"]) {
  if (!tokensCss.includes(marker)) throw new Error(`Required Player token is missing: ${marker}`);
}
for (const marker of ["refresh foundation — shell ownership", ".player-terminal-shell", ".player-terminal-nav-item", ".player-terminal-app-topbar", ".player-terminal-mobile-nav"]) {
  if (!foundationCss.includes(marker)) throw new Error(`Required Player foundation marker is missing: ${marker}`);
}
if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationCss)) throw new Error("The Player shell foundation crossed into protected map ownership.");
for (const marker of ["Dashboard and interactive-map chrome", ".player-terminal-dashboard-page", ".player-terminal-command-layout", ".player-terminal-country-overlay", ".player-terminal-map-hud", ".player-terminal-map-footer", ".player-terminal-country-modal"]) {
  if (!dashboardCss.includes(marker)) throw new Error(`Required Dashboard route marker is missing: ${marker}`);
}
if (/\.player-terminal-(?:shell|left-menu|nav-item|app-topbar)/.test(dashboardCss)) throw new Error("The Dashboard route owner crossed into shell ownership.");
if ((await stat(path.join(root, "css/player-terminal-tokens.css"))).size > 8_000) throw new Error("Player token budget exceeded.");
if ((await stat(path.join(root, "css/player-terminal-foundation.css"))).size > 24_000) throw new Error("Player foundation budget exceeded.");
if ((await stat(path.join(root, "css/routes/player-terminal-dashboard.css"))).size > 36_000) throw new Error("Dashboard owner budget exceeded.");

const stylesheetOrder = [...indexSource.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*\/>/g)].map((match) => match[1]);
for (const requiredStyle of ["player-terminal-tokens.css", "player-terminal-foundation.css", "routes/player-terminal-shared-layout.css", "routes/player-terminal-dashboard.css", "player-terminal-interior-v2.css", "player-terminal-world-v2.css"]) {
  if (!stylesheetOrder.includes(requiredStyle)) throw new Error(`Canonical Player stylesheet is not loaded: ${requiredStyle}`);
}

const mapSource = await readFile(path.join(root, "src/data/map-regions.js"), "utf8");
for (const marker of ["ECONOVARIA_MAP_SIZE", "ECONOVARIA_COUNTRY_REGIONS", "countryRegionPath", "northreach", "syndalis"]) {
  if (!mapSource.includes(marker)) throw new Error(`Required map geometry marker is missing: ${marker}`);
}
const dashboardSource = await readFile(path.join(root, "src/pages/dashboard-page.js"), "utf8");
for (const marker of ["renderCountryOverlay", "player-terminal-country-overlay", "player-terminal-country-border", "data-player-country", "player-terminal-map-hud", "player-terminal-map-footer"]) {
  if (!dashboardSource.includes(marker)) throw new Error(`Required Dashboard or map renderer marker is missing: ${marker}`);
}
const appSource = await readFile(path.join(root, "src/app.js"), "utf8");
for (const marker of ["ROUTE_TITLES", "focusAfterRender", "closeTopOverlay", "showFormError", "updateMarketOrderEstimate", "updateMarketplaceEstimate", "globalThis.addEventListener(\"offline\"", "keyboardCountry", "data-player-country"]) {
  if (!appSource.includes(marker)) throw new Error(`Required application behavior is missing: ${marker}`);
}
const routerSource = await readFile(path.join(root, "src/core/router.js"), "utf8");
for (const route of ["dashboard", "news", "market", "portfolio", "business", "contracts", "store", "marketplace", "inventory", "crafting", "banking", "loans", "messages", "progression", "profile"]) {
  if (!routerSource.includes(`\"${route}\"`)) throw new Error(`Required route is missing: ${route}`);
}
console.log(`Audit passed: ${required.length} canonical artifacts and ${sourceFiles.length} source files verified with legacy visual layers disabled.`);
