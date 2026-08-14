import { readFile } from "node:fs/promises";
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
  if (indexSource.includes(stylesheet)) throw new Error(`Retired Player stylesheet is still loaded: ${stylesheet}`);
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
console.log(`Player V2 legacy retirement passed: ${retiredStyles.length} legacy styles are not loaded and ${canonicalFiles.length} canonical owners are priority-clean.`);
