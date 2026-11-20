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

const recoveryStyles = [
  "player-terminal-recovery-base.css",
  "player-terminal-recovery-core.css",
  "player-terminal-recovery-ux.css",
  "player-terminal-recovery-polish.css",
  "player-terminal-recovery-normalization.css",
  "player-terminal-recovery-shell-compat.css",
  "player-terminal-recovery-route-compat.css",
];
for (const stylesheet of recoveryStyles) {
  if (!indexSource.includes(`./css/${stylesheet}`)) throw new Error(`Player recovery stylesheet is not loaded: ${stylesheet}`);
  const stats = await stat(path.join(root, "css", stylesheet));
  if (stats.size === 0) throw new Error(`Player recovery stylesheet is empty: ${stylesheet}`);
}

const stylesheetOrder = [...indexSource.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*\/>/g)].map((match) => match[1]);
const requiredOrder = [
  "player-terminal-recovery-base.css",
  "player-terminal-recovery-core.css",
  "player-terminal-recovery-ux.css",
  "player-terminal-recovery-polish.css",
  "player-terminal-recovery-normalization.css",
  "player-terminal-tokens.css",
  "player-terminal-foundation.css",
  "player-terminal-recovery-shell-compat.css",
  "routes/player-terminal-shared-layout.css",
  "routes/player-terminal-shared-cards.css",
  "routes/player-terminal-shared-lists.css",
  "routes/player-terminal-shared-states.css",
  "routes/player-terminal-shared-details.css",
  "routes/player-terminal-shared-responsive.css",
  "routes/player-terminal-shared-overlays.css",
  "player-terminal-recovery-route-compat.css",
  "routes/player-terminal-dashboard.css",
];
let previousIndex = -1;
for (const stylesheet of requiredOrder) {
  const currentIndex = stylesheetOrder.indexOf(stylesheet);
  if (currentIndex === -1) throw new Error(`Required Player recovery/canonical stylesheet is not loaded: ${stylesheet}`);
  if (currentIndex <= previousIndex) throw new Error(`Player recovery cascade order is invalid at ${stylesheet}`);
  previousIndex = currentIndex;
}

const canonicalFiles = [
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
];
for (const file of canonicalFiles) {
  if (!indexSource.includes(file.replace(/^css\//, ""))) throw new Error(`Canonical Player stylesheet is not loaded: ${file}`);
  const source = await readFile(path.join(root, file), "utf8");
  if (/!important\b/.test(source)) throw new Error(`Canonical Player owner contains !important debt: ${file}`);
}

console.log(`Player UI recovery contract passed: ${recoveryStyles.length} bounded recovery layers restore the pre-cutover cascade while ${canonicalFiles.length} V2 owners remain loaded and priority-clean.`);
