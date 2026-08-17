import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");
const [indexSource, resetSource, tokensSource, foundationSource, shellStructureSource, packageSource] = await Promise.all([
  read("index.html"),
  read("css/player-terminal-reset.css"),
  read("css/player-terminal-tokens.css"),
  read("css/player-terminal-foundation.css"),
  read("css/player-terminal-shell-structure.css"),
  read("package.json")
]);

const retired = [
  "player-terminal-base.css",
  "player-terminal.css",
  "player-terminal-ux.css",
  "player-terminal-polish.css",
  "player-terminal-normalization.css",
  "player-terminal-shell-compat.css",
  "player-terminal-route-compat.css",
];
for (const file of retired) {
  if (indexSource.includes(file)) throw new Error(`Retired stylesheet is still loaded: ${file}`);
}

const inactiveRecoveryTakeovers = [
  "player-terminal-recovery-base.css",
  "player-terminal-recovery-ux.css",
  "player-terminal-recovery-polish.css",
  "player-terminal-recovery-normalization.css",
  "player-terminal-recovery-shell-compat.css",
  "player-terminal-recovery-route-compat.css",
];
for (const file of inactiveRecoveryTakeovers) {
  if (indexSource.includes(file)) throw new Error(`Recovery takeover layer is active: ${file}`);
}

const stylesheetOrder = [...indexSource.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*\/>/g)].map((match) => match[1]);
const requiredOrder = [
  "player-terminal-recovery-core.css",
  "player-terminal-reset.css",
  "player-terminal-tokens.css",
  "player-terminal-foundation.css",
  "player-terminal-shell-structure.css",
  "routes/player-terminal-shared-layout.css",
  "routes/player-terminal-shared-cards.css",
  "routes/player-terminal-shared-lists.css",
  "routes/player-terminal-shared-states.css",
  "routes/player-terminal-shared-details.css",
  "routes/player-terminal-shared-responsive.css",
  "routes/player-terminal-shared-overlays.css",
  "routes/player-terminal-dashboard.css",
  "player-terminal-skeletons.css",
  "player-terminal-interior-v2.css",
  "player-terminal-finance-v2.css",
  "player-terminal-communications-v2.css",
  "player-terminal-economy-items-v2.css",
  "player-terminal-operations-v2.css",
  "player-terminal-world-v2.css",
];
let previousIndex = -1;
for (const file of requiredOrder) {
  const currentIndex = stylesheetOrder.indexOf(file);
  if (currentIndex === -1) throw new Error(`Required stylesheet is not loaded: ${file}`);
  if (currentIndex <= previousIndex) throw new Error(`Stylesheet ownership order is invalid at ${file}`);
  previousIndex = currentIndex;
}

if (/!important\b/.test(tokensSource) || /!important\b/.test(foundationSource) || /!important\b/.test(shellStructureSource)) {
  throw new Error("Player tokens, shell foundation, and shell structure must remain priority-clean.");
}
const resetPriority = resetSource.match(/!important\b/g) || [];
if (resetPriority.length !== 1 || !/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/s.test(resetSource)) {
  throw new Error("Player reset may use !important only for [hidden] semantics.");
}

for (const [name, source] of [["tokens", tokensSource], ["foundation", foundationSource]]) {
  if (/font-size\s*:\s*(?:[0-9]|10)px\b/.test(source)) throw new Error(`${name} CSS must not introduce sub-11px fixed text.`);
}
for (const token of ["--player-text-label: 0.75rem", "--player-text-body: 0.9375rem", "--player-control-md: 2.75rem", "--player-icon-nav: 1.25rem", "--player-nav-size: 16.5rem", "--player-page-max: 96rem"]) {
  if (!tokensSource.includes(token)) throw new Error(`Player refresh token is missing: ${token}`);
}
for (const selector of [".player-terminal-shell", ".player-terminal-left-menu", ".player-terminal-nav-item", ".player-terminal-app-topbar", ".player-terminal-page-heading h2", ".player-terminal-primary-button", ".player-terminal-mobile-nav"]) {
  if (!foundationSource.includes(selector)) throw new Error(`Foundation ownership selector is missing: ${selector}`);
}
for (const selector of [".player-terminal-shell", ".player-terminal-nav-item > strong", ".player-terminal-collapse-control", ".player-terminal-context-nav", ".player-terminal-mobile-nav", ".player-terminal-mobile-sheet"]) {
  if (!shellStructureSource.includes(selector)) throw new Error(`Shell structural ownership selector is missing: ${selector}`);
}
if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationSource) || /player-terminal-(?:command-map|world-map|country-|map-)/.test(shellStructureSource)) {
  throw new Error("Shell ownership crossed into the protected interactive-map subsystem.");
}

if ((await stat(path.join(root, "css/player-terminal-reset.css"))).size > 4_000) throw new Error("Player reset exceeded its 4 KB ownership budget.");
if ((await stat(path.join(root, "css/player-terminal-tokens.css"))).size > 8_000) throw new Error("Player token file exceeded its 8 KB ownership budget.");
if ((await stat(path.join(root, "css/player-terminal-foundation.css"))).size > 24_000) throw new Error("Player shell foundation exceeded its 24 KB ownership budget.");
if ((await stat(path.join(root, "css/player-terminal-shell-structure.css"))).size > 16_000) throw new Error("Player shell structure exceeded its 16 KB ownership budget.");

const packageJson = JSON.parse(packageSource);
for (const script of ["css:foundation", "map-protection"]) {
  if (!packageJson.scripts?.[script] || !packageJson.scripts.verify.includes(script)) throw new Error(`Player verification script is missing from verify: ${script}`);
}
for (const file of retired) {
  try {
    await access(path.join(root, "css", file));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await import("./player-v2-legacy-retirement.mjs");
console.log(`Player CSS foundation passed with ${stylesheetOrder.length} active stylesheets, one bounded route-coverage predecessor, and current shell ownership authoritative.`);
