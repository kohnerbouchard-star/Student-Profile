import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");
const [mapSource, dashboardSource, appSource, polishSource, foundationSource, compatSource, indexSource] = await Promise.all([
  read("src/data/map-regions.js"),
  read("src/pages/dashboard-page.js"),
  read("src/app.js"),
  read("css/player-terminal-polish.css"),
  read("css/player-terminal-foundation.css"),
  read("css/player-terminal-shell-compat.css"),
  read("index.html")
]);

const countryIds = [
  "northreach",
  "yrethia",
  "thaloris",
  "solvend",
  "eldoran",
  "valerion",
  "lumenor",
  "xalvoria",
  "dravenlok",
  "syndalis"
];

for (const countryId of countryIds) {
  if (!mapSource.includes(`\"id\":\"${countryId}\"`)) throw new Error(`Protected map region is missing: ${countryId}`);
}
const regionCount = (mapSource.match(/\{"id":"/g) || []).length;
if (regionCount !== countryIds.length) throw new Error(`Expected ${countryIds.length} protected map regions, found ${regionCount}.`);

for (const marker of [
  "ECONOVARIA_MAP_SIZE = Object.freeze({ width: 1672, height: 941 })",
  "ECONOVARIA_COUNTRY_REGIONS",
  "countryRegionPath",
  ".join(\" L\")} Z`"
]) {
  if (!mapSource.includes(marker)) throw new Error(`Protected map geometry contract is missing: ${marker}`);
}

for (const marker of [
  "renderCountryOverlay",
  "ECONOVARIA_COUNTRY_REGIONS.map",
  "countryRegionPath(region.polygons)",
  "player-terminal-country-overlay",
  "playerCountryGlow",
  "player-terminal-country-region",
  "data-player-country",
  "role=\"button\"",
  "tabindex=\"0\"",
  "is-home-country",
  "./assets/images/econovaria-world-map.png"
]) {
  if (!dashboardSource.includes(marker)) throw new Error(`Protected map renderer contract is missing: ${marker}`);
}

for (const marker of ["keyboardCountry", "data-player-country", "closeTopOverlay"]) {
  if (!appSource.includes(marker)) throw new Error(`Protected map interaction contract is missing: ${marker}`);
}

for (const marker of [
  "Country-border interaction layer",
  ".player-terminal-country-hit",
  ".player-terminal-country-region:is(:hover, :focus-visible)",
  ".player-terminal-country-region.is-home-country",
  ".player-terminal-map-instruction"
]) {
  if (!polishSource.includes(marker)) throw new Error(`Protected map presentation contract is missing: ${marker}`);
}

if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationSource) || /player-terminal-(?:command-map|world-map|country-|map-)/.test(compatSource)) {
  throw new Error("The Player refresh foundation or shell compatibility boundary crossed into protected map ownership.");
}
if (!indexSource.includes("./assets/images/econovaria-world-map.png") && !dashboardSource.includes("./assets/images/econovaria-world-map.png")) {
  throw new Error("The protected Econovaria map asset is no longer referenced.");
}

console.log(`Player map protection passed: ${countryIds.length} regions, geometry, renderer, keyboard hook, and presentation ownership preserved.`);
