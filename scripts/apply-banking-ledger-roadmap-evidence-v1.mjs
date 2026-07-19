import fs from "node:fs";

const path = "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one anchor, found ${count}.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  "**Last baseline audit:** 2026-07-18  \n**Current audited main baseline:** `3b74340830da8db4fdabe2926915c3a32471b7c8`",
  "**Last baseline audit:** 2026-07-19  \n**Current audited main baseline:** `b8d227d8d8d0cd178efc63935371ab53eee8b78b`",
  "baseline",
);

replaceOnce(
  "| Store quote/purchase flow | `VERIFIED_COMPLETE` for frontend behavior | PR #145 merged |",
  "| Store quote/purchase flow | `VERIFIED_COMPLETE` for frontend behavior | PR #145 merged |\n| Banking reads and exactly-once ledger invariants | `IN_PROGRESS` | PR #213 merged as `aee11e06c44dc9b6cd3ee2a386be215cef3c5536`; correction PR #221 merged as `26eecaa1ed04e3aa0909c75be269491a975fad70`; invariant PR #230 merged as `b8d227d8d8d0cd178efc63935371ab53eee8b78b`; isolated-staging migration application remains open |",
  "program snapshot",
);

replaceOnce(
  "- PR #222 physically removed the now-unmounted legacy Player source and installed a repository ratchet preventing its return as `3b74340830da8db4fdabe2926915c3a32471b7c8`; final head `9073afaf58b16da3831fb3e7d67da6922acbf4c5` passed Repository Quality #909, Player Runtime Cutover Verify #12, Admin Shell Smoke #836, Exchange Calendar Runtime #156, and Required Game Market Timezone #168.",
  "- PR #222 physically removed the now-unmounted legacy Player source and installed a repository ratchet preventing its return as `3b74340830da8db4fdabe2926915c3a32471b7c8`; final head `9073afaf58b16da3831fb3e7d67da6922acbf4c5` passed Repository Quality #909, Player Runtime Cutover Verify #12, Admin Shell Smoke #836, Exchange Calendar Runtime #156, and Required Game Market Timezone #168.\n- PR #213 merged the authenticated Player Banking read boundary as `aee11e06c44dc9b6cd3ee2a386be215cef3c5536`; PR #221 completed connected pagination and full cross-currency balance display as `26eecaa1ed04e3aa0909c75be269491a975fad70`; PR #230 merged the economic mutation-to-ledger invariant matrix and idempotent staff-adjustment RPC as `b8d227d8d8d0cd178efc63935371ab53eee8b78b`. Final PR #230 head `1050d8bf8b667d627c032cf72b891f6a31b1c380` passed Backend Typecheck #1214 with complete smoke, Database Replay #306, Admin Shell Smoke #854, Admin API Check #696, Admin Bundle Contract Audit #556, Repository Quality #945, Exchange Calendar Runtime #171, and Required Game Market Timezone #188.",
  "runtime reconciliation",
);

replaceOnce(
  "- executable seed content and staging activation;\n- migration-history reconciliation;",
  "- executable seed content and staging activation;\n- apply migration `20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql` in isolated staging and verify connected Admin/Classroom retry replay before runtime promotion;\n- migration-history reconciliation;",
  "release condition",
);

replaceOnce(
  `**Overall status:** \`VERIFIED_COMPLETE\` for cash and ledger reads; expansion remains planned.

### Complete

- [x] Append-only ledger.
- [x] Account-balance projection.
- [x] Cash balances.
- [x] Multi-currency entries.
- [x] Attendance rewards.
- [x] Contract rewards.
- [x] Store debits.
- [x] Stock settlement.
- [x] Admin adjustments.
- [x] Banking summary.
- [x] Posted transaction history.
- [x] Per-entry currency preservation.
- [x] Fake unsupported savings, credit, and transfer behavior removed from connected Player UI.

### Remaining beta work

- [ ] \`BETA-BANK-001\` Merge authoritative ledger route.
- [ ] \`BETA-BANK-002\` Connect Player Terminal Banking read model.
- [ ] \`BETA-BANK-003\` Verify cross-currency display, pagination, stale state, and empty state.
- [ ] \`BETA-BANK-004\` Verify every economic mutation produces exactly one expected ledger outcome.`,
  `**Overall status:** \`VERIFIED_COMPLETE\` for authenticated cash and ledger read surfaces; exactly-once mutation invariants are merged and replay-verified, while the new staff-adjustment RPC remains pending isolated-staging deployment.

### Complete

- [x] Append-only ledger.
- [x] Account-balance projection.
- [x] Cash balances.
- [x] Multi-currency entries.
- [x] Attendance rewards.
- [x] Contract rewards.
- [x] Store debits.
- [x] Stock settlement.
- [x] Admin adjustments.
- [x] Banking summary.
- [x] Posted transaction history.
- [x] Per-entry currency preservation.
- [x] Fake unsupported savings, credit, and transfer behavior removed from connected Player UI.

### Beta completion and deployment boundary

- [x] \`BETA-BANK-001\` Merge authoritative ledger route. \`VERIFIED_COMPLETE\` through PR #213 merged as \`aee11e06c44dc9b6cd3ee2a386be215cef3c5536\`; the authenticated \`GET /players/me/ledger\` boundary is private/no-store, UUID-private, rate-limited, game-scoped, and cursor-bounded.
- [x] \`BETA-BANK-002\` Connect Player Terminal Banking read model. \`VERIFIED_COMPLETE\` through PR #213 plus correction PR #221 merged as \`26eecaa1ed04e3aa0909c75be269491a975fad70\`.
- [x] \`BETA-BANK-003\` Verify cross-currency display, pagination, stale state, and empty state. \`VERIFIED_COMPLETE\` through PRs #213 and #221 with Player Terminal Verify #298, complete Node verification, and desktop/mobile Chromium evidence.
- [ ] \`BETA-BANK-004\` Verify every economic mutation produces exactly one expected ledger outcome. \`IN_PROGRESS\`: repository and migration authority merged through PR #230 as \`b8d227d8d8d0cd178efc63935371ab53eee8b78b\`. The mandatory invariant matrix covers automatic and manual Attendance rewards, Contract cash rewards, Store purchases, stock buy/sell settlement, Admin/Classroom adjustments, exact balance projection, replay, conflicting-key reuse, rejection, locked state, invalid input, and cross-game zero-write behavior. Migration \`20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql\` replayed from zero twice and linted cleanly in Database Replay #306. Per the roadmap completion rule, this item remains open until that migration is applied and the connected retry/replay path is verified in isolated staging.`,
  "Banking section",
);

fs.writeFileSync(path, source);
console.log("Applied Banking ledger roadmap evidence reconciliation.");
