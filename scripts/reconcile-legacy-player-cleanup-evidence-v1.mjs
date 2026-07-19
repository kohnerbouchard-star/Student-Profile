import { readFileSync, writeFileSync } from "node:fs";

const roadmapPath = "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";
let roadmap = readFileSync(roadmapPath, "utf8");

roadmap = replaceRequired(
  roadmap,
  "**Current audited main baseline:** `26eecaa1ed04e3aa0909c75be269491a975fad70`",
  "**Current audited main baseline:** `3b74340830da8db4fdabe2926915c3a32471b7c8`"
);
roadmap = replaceRequired(
  roadmap,
  "| Player runtime cutover and legacy source removal | `IMPLEMENTED_NOT_MERGED` | PR #217 merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`; cleanup PR #222 |",
  "| Player runtime cutover and legacy source removal | `IN_PROGRESS` | PR #217 merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`; PR #222 merged as `3b74340830da8db4fdabe2926915c3a32471b7c8`; connected staging and live Worker retirement remain open |"
);
roadmap = replaceRequired(
  roadmap,
  "- PR #222 physically removes the now-unmounted legacy Player source and installs a repository ratchet preventing its return.",
  "- PR #222 physically removed the now-unmounted legacy Player source and installed a repository ratchet preventing its return as `3b74340830da8db4fdabe2926915c3a32471b7c8`; final head `9073afaf58b16da3831fb3e7d67da6922acbf4c5` passed Repository Quality #909, Player Runtime Cutover Verify #12, Admin Shell Smoke #836, Exchange Calendar Runtime #156, and Required Game Market Timezone #168."
);
roadmap = replaceRequired(
  roadmap,
  "- merge and verify the physical legacy Player source-removal tranche;\n- connected isolated-staging Player and Admin verification;",
  "- connected isolated-staging Player and Admin verification;"
);
writeFileSync(roadmapPath, roadmap);

const amendmentPath = "docs/roadmaps/econovaria-player-runtime-cutover-amendment-2026-07-19.md";
let amendment = readFileSync(amendmentPath, "utf8");
amendment = replaceRequired(
  amendment,
  "**Status:** `IN_PROGRESS` — repository cutover merged; physical cleanup implemented and awaiting merge; connected operational evidence remains open",
  "**Status:** `IN_PROGRESS` — repository cutover and physical cleanup merged; connected operational evidence remains open"
);
amendment = replaceRequired(
  amendment,
  "**Status:** `IN_PROGRESS` — browser dependency removed; physical source cleanup awaiting merge; live service shutdown pending",
  "**Status:** `IN_PROGRESS` — browser dependency and dormant repository source removed; live service shutdown pending"
);
amendment = replaceRequired(
  amendment,
  "**Base main:** `26eecaa1ed04e3aa0909c75be269491a975fad70`  \n**Status:** `IMPLEMENTED_NOT_MERGED`",
  "**Base main:** `26eecaa1ed04e3aa0909c75be269491a975fad70`  \n**Merge commit:** `3b74340830da8db4fdabe2926915c3a32471b7c8`  \n**Status:** `VERIFIED_COMPLETE`"
);
amendment = replaceRequired(
  amendment,
  "Pre-review reconciliation evidence:\n\n- the bounded cleanup application completed successfully;\n- the complete repository test chain passed after deletion;\n- the complete Player Terminal package verification passed unchanged;\n- the cleanup and ledger reconciliation workflows removed their own temporary helpers;\n- the effective PR diff contains only permanent source removals, the login stylesheet reduction, the permanent regression ratchet, and roadmap evidence.",
  "Completion evidence:\n\n- final reviewed head: `9073afaf58b16da3831fb3e7d67da6922acbf4c5`;\n- squash merge: `3b74340830da8db4fdabe2926915c3a32471b7c8`;\n- Repository Quality #909 passed;\n- Player Runtime Cutover Verify #12 passed the source-removal ratchet, complete Player Terminal package verification, Chromium startup, and authenticated handoff;\n- Admin Shell Smoke #836 passed all 87 stages;\n- Exchange Calendar Runtime #156 and Required Game Market Timezone #168 passed;\n- the bounded cleanup and ledger reconciliation workflows passed and removed their own temporary helpers;\n- the effective merged diff contains only permanent source removals, the login stylesheet reduction, the permanent regression ratchet, and roadmap evidence."
);
amendment = replaceRequired(
  amendment,
  "Pass the full normal workflow suite on the final PR #222 head, confirm the permanent diff remains isolated, then squash-merge PR #222. After merge, complete connected isolated-staging verification and the controlled live Cloudflare Worker retirement procedure.",
  "Complete connected isolated-staging verification for Player and Admin flows, confirm production browser traffic no longer reaches the Cloudflare Worker, then perform the controlled credential rotation and live Worker retirement procedure."
);
writeFileSync(amendmentPath, amendment);

console.log("Merged legacy Player cleanup evidence reconciled.");

function replaceRequired(source, before, after) {
  if (!source.includes(before)) throw new Error(`Required evidence source not found:\n${before}`);
  return source.replace(before, after);
}
