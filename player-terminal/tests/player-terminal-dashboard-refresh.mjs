import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");
const [indexSource, dashboardSource, dashboardCss, modalSource, packageSource] = await Promise.all([
  read("index.html"), read("src/pages/dashboard-page.js"), read("css/routes/player-terminal-dashboard.css"), read("src/components/modal.js"), read("package.json")
]);
const stylesheetOrder = [...indexSource.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*\/>/g)].map((match) => match[1]);
const sharedIndex = stylesheetOrder.indexOf("routes/player-terminal-shared-overlays.css");
const dashboardIndex = stylesheetOrder.indexOf("routes/player-terminal-dashboard.css");
const skeletonIndex = stylesheetOrder.indexOf("player-terminal-skeletons.css");
if (!(sharedIndex >= 0 && sharedIndex < dashboardIndex && dashboardIndex < skeletonIndex)) throw new Error("Dashboard route ownership must load after shared routes and before state-specific styles.");
for (const legacy of ["player-terminal-shell-compat.css", "player-terminal-route-compat.css", "player-terminal-polish.css"]) {
  if (stylesheetOrder.includes(legacy)) throw new Error(`Dashboard still depends on retired presentation: ${legacy}`);
}
if (/!important\b/.test(dashboardCss)) throw new Error("The Dashboard route owner must not introduce !important declarations.");
if (/font-size\s*:\s*(?:[0-9]|10)px\b/.test(dashboardCss)) throw new Error("The Dashboard refresh must not introduce sub-11px fixed text.");
const dashboardStats = await stat(path.join(root, "css/routes/player-terminal-dashboard.css"));
if (dashboardStats.size > 36_000) throw new Error(`Dashboard route CSS exceeded its 36 KB ownership budget: ${dashboardStats.size}.`);
for (const marker of ["player-terminal-dashboard-page", "player-terminal-map-hud", "player-terminal-map-legend", "player-terminal-map-footer", "player-terminal-map-home", "player-terminal-map-metrics", "HOME MARKET", "aria-label=\"Home market summary\""]) {
  if (!dashboardSource.includes(marker)) throw new Error(`Dashboard refresh markup is missing: ${marker}`);
}
for (const marker of [".player-terminal-dashboard-page", ".player-terminal-command-layout", ".player-terminal-command-map-panel", ".player-terminal-country-overlay", ".player-terminal-map-hud", ".player-terminal-map-footer", ".player-terminal-country-region:is(:hover, :focus-visible)", ".player-terminal-country-modal", "grid-template-areas:", "aspect-ratio: 1672 / 941"]) {
  if (!dashboardCss.includes(marker)) throw new Error(`Dashboard route ownership marker is missing: ${marker}`);
}
for (const forbidden of [".player-terminal-shell", ".player-terminal-left-menu", ".player-terminal-nav-item", ".player-terminal-app-topbar", ".player-terminal-store-", ".player-terminal-market-layout", ".player-terminal-bank-layout"]) {
  if (dashboardCss.includes(forbidden)) throw new Error(`Dashboard route CSS crossed into another owner: ${forbidden}`);
}
for (const marker of ["renderCountryOverlay", "ECONOVARIA_COUNTRY_REGIONS.map", "countryRegionPath(region.polygons)", "data-player-country", "role=\"button\"", "tabindex=\"0\"", "is-home-country"]) {
  if (!dashboardSource.includes(marker)) throw new Error(`Interactive map behavior was not preserved: ${marker}`);
}
for (const destructivePattern of [/\.player-terminal-country-overlay\s*\{[^}]*display\s*:\s*none/s, /\.player-terminal-country-region\s*\{[^}]*pointer-events\s*:\s*none/s, /\.player-terminal-country-hit\s*\{[^}]*pointer-events\s*:\s*none/s]) {
  if (destructivePattern.test(dashboardCss)) throw new Error(`Dashboard map presentation disables interaction: ${destructivePattern}`);
}
for (const marker of ["modal.type === \"country\"", "player-terminal-country-modal", "player-terminal-country-indicators", "player-terminal-country-intel-grid", "player-terminal-country-related"]) {
  if (!modalSource.includes(marker)) throw new Error(`Country intelligence contract is missing: ${marker}`);
}
const packageJson = JSON.parse(packageSource);
if (!packageJson.scripts?.["dashboard-refresh"] || !packageJson.scripts.verify.includes("dashboard-refresh")) throw new Error("The Dashboard refresh contract must run in npm run verify.");
console.log(`Player Dashboard refresh passed: source-owned hierarchy, protected map interactions, country modal, and ${dashboardStats.size}-byte bounded CSS verified without legacy presentation.`);
