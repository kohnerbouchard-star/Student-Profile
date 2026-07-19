import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";
let source = readFileSync(path, "utf8");

source = replaceRequired(
  source,
  "**Current audited main baseline:** `84bcf89e94425f2a6de9a1a15e0ff4e5fb74ee10`",
  "**Current audited main baseline:** `26eecaa1ed04e3aa0909c75be269491a975fad70`"
);
source = replaceRequired(
  source,
  "| Player runtime cutover and legacy source removal | `IMPLEMENTED_NOT_MERGED` | PR #217 merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`; cleanup branch `agent/legacy-player-source-removal-v1` |",
  "| Player runtime cutover and legacy source removal | `IMPLEMENTED_NOT_MERGED` | PR #217 merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`; cleanup PR #222 |"
);
source = replaceRequired(
  source,
  "- `agent/legacy-player-source-removal-v1` physically removes the now-unmounted legacy Player source and installs a repository ratchet preventing its return.",
  "- PR #222 physically removes the now-unmounted legacy Player source and installs a repository ratchet preventing its return."
);

writeFileSync(path, source);
console.log("Final legacy Player cleanup roadmap metadata reconciled.");

function replaceRequired(value, before, after) {
  if (!value.includes(before)) throw new Error(`Required ledger source not found: ${before}`);
  return value.replace(before, after);
}
