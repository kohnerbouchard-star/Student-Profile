import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const indexSource = await readFile(path.join(root, "index.html"), "utf8");
const retiredStyles = [
  "player-terminal-base.css",
  "player-terminal.css",
  "player-terminal-ux.css",
  "player-terminal-polish.css",
  "player-terminal-normalization.css",
  "player-terminal-shell-compat.css",
  "player-terminal-route-compat.css",
];
for (const stylesheet of retiredStyles) {
  if (indexSource.includes(`./css/${stylesheet}`)) throw new Error(`Retired Player stylesheet name was reactivated: ${stylesheet}`);
  try {
    await access(path.join(root, "css", stylesheet));
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  throw new Error(`Retired Player stylesheet still exists under its old ownership name: ${stylesheet}`);
}

const inactiveRecoveryStyles = [
  "player-terminal-recovery-base.css",
  "player-terminal-recovery-ux.css",
  "player-terminal-recovery-polish.css",
  "player-terminal-recovery-normalization.css",
  "player-terminal-recovery-shell-compat.css",
  "player-terminal-recovery-route-compat.css",
];
for (const stylesheet of inactiveRecoveryStyles) {
  if (indexSource.includes(`./css/${stylesheet}`)) throw new Error(`Player recovery takeover layer was reactivated: ${stylesheet}`);
}

const recoveryStyle = "player-terminal-recovery-core.css";
if (!indexSource.includes(`./css/${recoveryStyle}`)) throw new Error(`Bounded Player route coverage is not loaded: ${recoveryStyle}`);
const recoverySource = await readFile(path.join(root, "css", recoveryStyle), "utf8");
const recoveryStats = await stat(path.join(root, "css", recoveryStyle));
if (recoveryStats.size === 0) throw new Error("Bounded Player route coverage is empty.");
if (recoveryStats.size > 140_000) throw new Error(`Bounded Player route coverage exceeded 140 KB: ${recoveryStats.size}`);
const recoveryPriorityCount = (recoverySource.match(/!important\b/g) || []).length;
if (recoveryPriorityCount > 64) throw new Error(`Bounded Player route coverage accumulated excessive priority debt: ${recoveryPriorityCount}`);
for (const selector of ["shell", "left-menu", "app-topbar", "page-host", "page-heading", "panel-header"]) {
  const priorityTakeover = new RegExp(`\\.player-terminal-${selector}[^\\{]*\\{[^\\}]*!important`, "s");
  if (priorityTakeover.test(recoverySource)) throw new Error(`Bounded Player route coverage contains a high-priority ${selector} takeover.`);
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
];
let previousIndex = -1;
for (const stylesheet of requiredOrder) {
  const currentIndex = stylesheetOrder.indexOf(stylesheet);
  if (currentIndex === -1) throw new Error(`Required Player convergence stylesheet is not loaded: ${stylesheet}`);
  if (currentIndex <= previousIndex) throw new Error(`Player convergence cascade order is invalid at ${stylesheet}`);
  previousIndex = currentIndex;
}

const priorityCleanFiles = [
  "css/player-terminal-tokens.css",
  "css/player-terminal-foundation.css",
  "css/player-terminal-shell-structure.css",
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
];
for (const file of priorityCleanFiles) {
  if (!indexSource.includes(file.replace(/^css\//, ""))) throw new Error(`Canonical Player stylesheet is not loaded: ${file}`);
  const source = await readFile(path.join(root, file), "utf8");
  if (/!important\b/.test(source)) throw new Error(`Canonical Player owner contains !important debt: ${file}`);
}

const resetSource = await readFile(path.join(root, "css/player-terminal-reset.css"), "utf8");
const resetPriorityCount = (resetSource.match(/!important\b/g) || []).length;
if (resetPriorityCount !== 1 || !/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/s.test(resetSource)) {
  throw new Error("Player reset may use !important only for the native hidden-state contract.");
}
if ((await stat(path.join(root, "css/player-terminal-reset.css"))).size > 4_000) throw new Error("Player reset exceeded its 4 KB ownership budget.");
if ((await stat(path.join(root, "css/player-terminal-shell-structure.css"))).size > 16_000) throw new Error("Player shell structure exceeded its 16 KB ownership budget.");

console.log(`Player UI convergence contract passed: one ${recoveryStats.size}-byte bounded route-coverage layer remains while ${priorityCleanFiles.length} current owners are priority-clean.`);
