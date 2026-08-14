import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");
const [indexSource, tokensSource, foundationSource, packageSource, auditSource, v75AuditSource] = await Promise.all([
  read("index.html"),
  read("css/player-terminal-tokens.css"),
  read("css/player-terminal-foundation.css"),
  read("package.json"),
  read("tools/audit.mjs"),
  read("tools/v75-audit.mjs")
]);

const retired = [
  "player-terminal-base.css",
  "player-terminal.css",
  "player-terminal-ux.css",
  "player-terminal-polish.css",
  "player-terminal-normalization.css",
  "player-terminal-shell-compat.css",
  "player-terminal-route-compat.css"
];
for (const file of retired) {
  if (indexSource.includes(file)) throw new Error(`Retired stylesheet is still loaded: ${file}`);
}

const stylesheetOrder = [...indexSource.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*\/>/g)].map((match) => match[1]);
const requiredOrder = [
  "player-terminal-tokens.css",
  "player-terminal-foundation.css",
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
  "player-terminal-world-v2.css"
];
let previousIndex = -1;
for (const file of requiredOrder) {
  const currentIndex = stylesheetOrder.indexOf(file);
  if (currentIndex === -1) throw new Error(`Required stylesheet is not loaded: ${file}`);
  if (currentIndex <= previousIndex) throw new Error(`Stylesheet ownership order is invalid at ${file}`);
  previousIndex = currentIndex;
}

if (/!important\b/.test(tokensSource) || /!important\b/.test(foundationSource)) {
  throw new Error("Player tokens and the core foundation must not contain !important declarations.");
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
if (/player-terminal-(?:command-map|world-map|country-|map-)/.test(foundationSource)) throw new Error("The shell foundation must not style the protected interactive-map subsystem.");

const tokenStats = await stat(path.join(root, "css/player-terminal-tokens.css"));
const foundationStats = await stat(path.join(root, "css/player-terminal-foundation.css"));
if (tokenStats.size > 8_000) throw new Error("Player token file exceeded its 8 KB ownership budget.");
if (foundationStats.size > 24_000) throw new Error("Player shell foundation exceeded its 24 KB ownership budget.");

const packageJson = JSON.parse(packageSource);
for (const script of ["css:foundation", "map-protection"]) {
  if (!packageJson.scripts?.[script] || !packageJson.scripts.verify.includes(script)) throw new Error(`Player verification script is missing from verify: ${script}`);
}
for (const source of [auditSource, v75AuditSource]) {
  if (source.includes("lockedHashes") || source.includes("createHash(")) throw new Error("A visual byte hash lock returned.");
}
for (const file of retired) {
  try {
    await access(path.join(root, "css", file));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(`Player CSS foundation passed with ${stylesheetOrder.length} source-owned stylesheets and the legacy cascade disabled.`);
