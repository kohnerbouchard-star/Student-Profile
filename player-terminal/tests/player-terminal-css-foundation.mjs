import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [indexSource, tokensSource, foundationSource, compatSource, packageSource, auditSource, v75AuditSource, lockSource] = await Promise.all([
  read("index.html"),
  read("css/player-terminal-tokens.css"),
  read("css/player-terminal-foundation.css"),
  read("css/player-terminal-shell-compat.css"),
  read("package.json"),
  read("tools/audit.mjs"),
  read("tools/v75-audit.mjs"),
  read("V7_STYLE_LOCK.md")
]);

const stylesheetOrder = [...indexSource.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*\/>/g)].map((match) => match[1]);
const requiredOrder = [
  "player-terminal-normalization.css",
  "player-terminal-tokens.css",
  "player-terminal-foundation.css",
  "player-terminal-shell-compat.css",
  "player-terminal-skeletons.css"
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

const takeoverMarker = "Temporary bounded legacy cascade takeover.";
const takeoverIndex = compatSource.indexOf(takeoverMarker);
if (takeoverIndex === -1) throw new Error("The bounded shell compatibility marker is missing.");
if (/!important\b/.test(compatSource.slice(0, takeoverIndex))) {
  throw new Error("Compatibility !important declarations must be isolated after the bounded takeover marker.");
}
const takeoverImportantCount = (compatSource.match(/!important\b/g) || []).length;
if (takeoverImportantCount > 40) {
  throw new Error(`Shell compatibility takeover exceeded the 40-declaration cap: ${takeoverImportantCount}.`);
}

for (const [name, source] of [["tokens", tokensSource], ["foundation", foundationSource], ["shell compatibility", compatSource]]) {
  if (/font-size\s*:\s*(?:[0-9]|10)px\b/.test(source)) {
    throw new Error(`${name} CSS must not introduce sub-11px fixed text.`);
  }
}

for (const token of [
  "--player-text-label: 0.75rem",
  "--player-text-body: 0.9375rem",
  "--player-control-md: 2.75rem",
  "--player-icon-nav: 1.25rem",
  "--player-nav-size: 16.5rem",
  "--player-page-max: 96rem",
  "--player-terminal-type-label: var(--player-text-label)"
]) {
  if (!tokensSource.includes(token)) throw new Error(`Player refresh token is missing: ${token}`);
}

for (const selector of [
  ".player-terminal-shell",
  ".player-terminal-left-menu",
  ".player-terminal-nav-item",
  ".player-terminal-app-topbar",
  ".player-terminal-page-heading h2",
  ".player-terminal-primary-button",
  ".player-terminal-mobile-nav"
]) {
  if (!foundationSource.includes(selector)) throw new Error(`Foundation ownership selector is missing: ${selector}`);
}

const protectedMapSelector = /player-terminal-(?:command-map|world-map|country-|map-)/;
if (protectedMapSelector.test(foundationSource) || protectedMapSelector.test(compatSource)) {
  throw new Error("The shell foundation and compatibility boundary must not style the protected interactive-map subsystem.");
}

const cssFiles = (await readdir(path.join(root, "css"))).filter((file) => file.endsWith(".css"));
const allowedLegacyLayers = new Set([
  "player-terminal-ux.css",
  "player-terminal-polish.css",
  "player-terminal-normalization.css"
]);
for (const file of cssFiles) {
  if (!/(?:override|overrides|fix|fixes|polish|normalization|ux)/i.test(file)) continue;
  if (!allowedLegacyLayers.has(file)) throw new Error(`New append-only CSS layer is not allowed: ${file}`);
}

const tokenStats = await stat(path.join(root, "css/player-terminal-tokens.css"));
const foundationStats = await stat(path.join(root, "css/player-terminal-foundation.css"));
const compatStats = await stat(path.join(root, "css/player-terminal-shell-compat.css"));
if (tokenStats.size > 8_000) throw new Error("Player token file exceeded its 8 KB ownership budget.");
if (foundationStats.size > 24_000) throw new Error("Player shell foundation exceeded its 24 KB ownership budget.");
if (compatStats.size > 5_000) throw new Error("Player shell compatibility boundary exceeded its 5 KB retirement budget.");

const packageJson = JSON.parse(packageSource);
for (const script of ["css:foundation", "map-protection"]) {
  if (!packageJson.scripts?.[script]) throw new Error(`Player verification script is missing: ${script}`);
  if (!packageJson.scripts.verify.includes(script)) throw new Error(`${script} must run in npm run verify.`);
}

for (const [name, source] of [["audit", auditSource], ["v7.5 audit", v75AuditSource]]) {
  if (source.includes("import { createHash") || source.includes("const lockedHashes =")) {
    throw new Error(`${name} still contains byte-for-byte visual hash locking.`);
  }
}
if (/SHA-256|byte-for-byte unchanged/.test(lockSource)) {
  throw new Error("V7_STYLE_LOCK.md still presents the legacy CSS stack as immutable.");
}

console.log(`Player CSS foundation passed: ${stylesheetOrder.length} stylesheets, token/core/compat budgets, ${takeoverImportantCount}/40 bounded takeover declarations, no generic override layer, and no byte hash lock.`);
