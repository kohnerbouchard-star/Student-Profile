import { readFile, stat } from "node:fs/promises";
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

const [indexSource, sharedRouteSources, compatSource, packageSource, mapTestSource] = await Promise.all([
  read("index.html"),
  Promise.all(sharedRouteFiles.map(read)),
  read("css/player-terminal-route-compat.css"),
  read("package.json"),
  read("tests/player-terminal-map-protection.mjs")
]);

const routeSource = sharedRouteSources.join("\n");

const stylesheetOrder = [...indexSource.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*\/>/g)].map((match) => match[1]);
const requiredOrder = [
  "player-terminal-shell-compat.css",
  "routes/player-terminal-shared-layout.css",
  "routes/player-terminal-shared-cards.css",
  "routes/player-terminal-shared-lists.css",
  "routes/player-terminal-shared-states.css",
  "routes/player-terminal-shared-details.css",
  "routes/player-terminal-shared-responsive.css",
  "routes/player-terminal-shared-overlays.css",
  "player-terminal-route-compat.css",
  "routes/player-terminal-dashboard.css",
  "player-terminal-skeletons.css"
];
let previousIndex = -1;
for (const file of requiredOrder) {
  const currentIndex = stylesheetOrder.indexOf(file);
  if (currentIndex === -1) throw new Error(`Required Player route stylesheet is not loaded: ${file}`);
  if (currentIndex <= previousIndex) throw new Error(`Player route stylesheet ownership order is invalid at ${file}.`);
  previousIndex = currentIndex;
}

if (/!important\b/.test(routeSource)) throw new Error("Shared route ownership must not introduce !important debt.");
if (/font-size\s*:\s*(?:[0-9]|10)px\b/.test(routeSource) || /font-size\s*:\s*(?:[0-9]|10)px\b/.test(compatSource)) {
  throw new Error("Player route refresh introduced sub-11px fixed text.");
}
if (/admin-(?:terminal|v2|shell|navigation|page)/i.test(routeSource + compatSource)) {
  throw new Error("Admin selectors leaked into Player route CSS.");
}
if (/\.player-terminal-(?:shell|left-menu|nav-item|app-topbar)/.test(routeSource + compatSource)) {
  throw new Error("Shared route ownership crossed into the shell subsystem.");
}
const protectedMapSelector = /player-terminal-(?:command-map|world-map|country-(?:overlay|region|hit|fill|border|marker)|map-(?:hud|instruction|legend|footer|home|metrics))/;
if (protectedMapSelector.test(routeSource) || protectedMapSelector.test(compatSource)) {
  throw new Error("Shared route ownership crossed into the protected map subsystem.");
}
for (const match of (routeSource + compatSource).matchAll(/clip-path\s*:\s*([^;]+);/g)) {
  if (match[1].trim() !== "none") throw new Error("Shared route ownership restored clipped control geometry.");
}

const takeoverMarker = "Temporary bounded route cascade takeover.";
if (!compatSource.includes(takeoverMarker)) throw new Error("The bounded route compatibility marker is missing.");
const takeoverImportantCount = (compatSource.match(/!important\b/g) || []).length;
if (takeoverImportantCount > 12) {
  throw new Error(`Route compatibility takeover exceeded the 12-declaration cap: ${takeoverImportantCount}.`);
}

for (const marker of [
  ".player-terminal-app-root .player-terminal-page",
  ".player-terminal-market-layout",
  ".player-terminal-news-layout",
  ".player-terminal-portfolio-layout",
  ".player-terminal-business-layout",
  ".player-terminal-contract-layout",
  ".player-terminal-bank-layout",
  ".player-terminal-profile-layout",
  ".player-terminal-marketplace-layout",
  ".player-terminal-messages-layout",
  ".player-terminal-loans-layout",
  ".player-terminal-crafting-layout",
  ".player-terminal-metric-card",
  ".player-terminal-store-card",
  ".player-terminal-inventory-card",
  ".player-terminal-contract-row",
  ".player-terminal-transaction-row",
  ".player-terminal-thread-row",
  ".player-terminal-modal:not(.player-terminal-country-modal)",
  ".player-terminal-empty-state",
  "@media (max-width: 38.75rem)"
]) {
  if (!routeSource.includes(marker)) throw new Error(`Shared route ownership marker is missing: ${marker}`);
}

const sharedRouteStats = await Promise.all(sharedRouteFiles.map((file) => stat(path.join(root, file))));
const routeBytes = sharedRouteStats.reduce((total, item) => total + item.size, 0);
const compatStats = await stat(path.join(root, "css/player-terminal-route-compat.css"));
const sharedBudgets = [8_000, 5_000, 5_000, 5_000, 5_000, 6_000, 6_000];
sharedRouteStats.forEach((item, index) => {
  if (item.size > sharedBudgets[index]) throw new Error(`${sharedRouteFiles[index]} exceeded its ${sharedBudgets[index]}-byte budget: ${item.size}.`);
});
if (routeBytes > 34_000) throw new Error(`Combined shared route ownership exceeded its 34 KB budget: ${routeBytes}.`);
if (compatStats.size > 4_000) throw new Error(`Route compatibility boundary exceeded its 4 KB budget: ${compatStats.size}.`);

const packageJson = JSON.parse(packageSource);
if (packageJson.scripts?.["route-refresh"] !== "node tests/player-terminal-route-refresh.mjs") {
  throw new Error("The route-refresh verification script is missing.");
}
if (!packageJson.scripts.verify.includes("route-refresh")) {
  throw new Error("route-refresh must run in npm run verify.");
}
for (const marker of [...sharedRouteFiles.map((file) => file.split("/").pop()), "player-terminal-route-compat.css"]) {
  if (!mapTestSource.includes(marker)) throw new Error(`Map protection does not inspect shared route ownership: ${marker}`);
}

for (const [name, source] of [["route foundation", routeSource], ["route compatibility", compatSource]]) {
  let depth = 0;
  for (const character of source.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) throw new Error(`${name} has an unmatched closing brace.`);
  }
  if (depth !== 0) throw new Error(`${name} has unmatched braces.`);
}

console.log(`Player route refresh passed: ${routeBytes}-byte split shared owners, ${compatStats.size}-byte compatibility boundary, ${takeoverImportantCount}/12 priority declarations, route cards/lists/modals, responsive density, and no map or shell ownership.`);
