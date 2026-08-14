import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");
const sharedRouteFiles = [
  "css/routes/player-terminal-shared-layout.css",
  "css/routes/player-terminal-shared-cards.css",
  "css/routes/player-terminal-shared-lists.css",
  "css/routes/player-terminal-shared-states.css",
  "css/routes/player-terminal-shared-details.css",
  "css/routes/player-terminal-shared-responsive.css",
  "css/routes/player-terminal-shared-overlays.css"
];
const [mapSource, dashboardSource, appSource, foundationSource, sharedRouteSources, dashboardCss, indexSource] = await Promise.all([
  read("src/data/map-regions.js"),
  read("src/pages/dashboard-page.js"),
  read("src/app.js"),
  read("css/player-terminal-foundation.css"),
  Promise.all(sharedRouteFiles.map(read)),
  read("css/routes/player-terminal-dashboard.css"),
  read("index.html")
]);
const routeCss = sharedRouteSources.join("\n");
const countryIds = ["northreach", "yrethia", "thaloris", "solvend", "eldoran", "valerion", "lumenor", "xalvoria", "dravenlok", "syndalis"];
for (const countryId of countryIds) {
  if (!mapSource.includes(`\"id\":\"${countryId}\"`)) throw new Error(`Protected map region is missing: ${countryId}`);
}
const regionCount = (mapSource.match(/\{"id":"/g) || []).length;
if (regionCount !== countryIds.length) throw new Error(`Expected ${countryIds.length} protected map regions, found ${regionCount}.`);
for (const marker of ["ECONOVARIA_MAP_SIZE = Object.freeze({ width: 1672, height: 941 })", "ECONOVARIA_COUNTRY_REGIONS", "countryRegionPath", ".join(\" L\")} Z`"]) {
  if (!mapSource.includes(marker)) throw new Error(`Protected map geometry contract is missing: ${marker}`);
}
for (const marker of ["renderCountryOverlay", "ECONOVARIA_COUNTRY_REGIONS.map", "countryRegionPath(region.polygons)", "player-terminal-country-overlay", "playerCountryGlow", "player-terminal-country-region", "data-player-country", "role=\"button\"", "tabindex=\"0\"", "is-home-country", "./assets/images/econovaria-world-map.png"]) {
  if (!dashboardSource.includes(marker)) throw new Error(`Protected map renderer contract is missing: ${marker}`);
}
for (const marker of ["keyboardCountry", "data-player-country", "closeTopOverlay"]) {
  if (!appSource.includes(marker)) throw new Error(`Protected map interaction contract is missing: ${marker}`);
}
if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationSource)) throw new Error("The Player shell foundation crossed into protected map ownership.");
const protectedSharedRouteMapSelector = /player-terminal-(?:command-map|world-map|country-(?:overlay|region|hit|fill|border|marker)|map-(?:hud|instruction|legend|footer|home|metrics))/;
if (protectedSharedRouteMapSelector.test(routeCss)) throw new Error("Shared route ownership crossed into protected map ownership.");
for (const marker of ["interactive-map chrome", ".player-terminal-country-overlay", ".player-terminal-country-hit", ".player-terminal-country-region:is(:hover, :focus-visible)", ".player-terminal-country-region.is-home-country", ".player-terminal-map-hud", ".player-terminal-map-footer"]) {
  if (!dashboardCss.includes(marker)) throw new Error(`Dashboard map route owner is missing: ${marker}`);
}
for (const destructivePattern of [/\.player-terminal-country-overlay\s*\{[^}]*display\s*:\s*none/s, /\.player-terminal-country-region\s*\{[^}]*pointer-events\s*:\s*none/s, /\.player-terminal-country-hit\s*\{[^}]*pointer-events\s*:\s*none/s]) {
  if (destructivePattern.test(dashboardCss)) throw new Error(`Dashboard map route owner disables interaction: ${destructivePattern}`);
}
if (!sharedRouteFiles.every((file) => indexSource.includes(file))) throw new Error("Shared route ownership is not loaded by index.html.");
if (!indexSource.includes("css/routes/player-terminal-dashboard.css")) throw new Error("The Dashboard map route owner is not loaded by index.html.");
for (const legacy of ["player-terminal-polish.css", "player-terminal-shell-compat.css", "player-terminal-route-compat.css"]) {
  if (indexSource.includes(legacy)) throw new Error(`Legacy map/cascade presentation is still loaded: ${legacy}`);
}
if (!dashboardSource.includes("./assets/images/econovaria-world-map.png")) throw new Error("The protected Econovaria map asset is no longer referenced.");
console.log(`Player map protection passed: ${countryIds.length} regions, geometry, renderer, keyboard hook, route-owned presentation, and interaction safety preserved without legacy CSS.`);
