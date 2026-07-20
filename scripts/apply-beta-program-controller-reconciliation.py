from pathlib import Path

ROADMAP = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = ROADMAP.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "**Repository state audited through:** `e167ea3976da3a5825cc1cc079c994c4f887eaf6`",
    "**Repository state audited through:** `f44b0735763da6700fc18513fa7026dbd95aff86`",
    "repository audit boundary",
)

replace_once(
    "| Seed-content foundation | `IN_PROGRESS`; branch synchronization required | PR #163, branch `agent/seed-content-foundation-v1`; sole seed-content authority |",
    "| Seed-content foundation | `IN_PROGRESS`; not merge-ready | PR #163, branch `agent/seed-content-foundation-v1`; sole seed-content authority; 407 commits ahead and 132 behind audited `main`, non-mergeable, with no current-head workflow evidence and no executable importer or staging activation |",
    "seed snapshot row",
)
replace_once(
    "| Player story-notification delivery | `IN_PROGRESS` | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006` without owning campaign content |",
    "| Player story-notification delivery | `IN_PROGRESS`; not merge-ready | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006`; branch is 32 commits behind audited `main`, the permanent diff still contains patch carriers rather than application source, and the application workflow fails |",
    "story snapshot row",
)
replace_once(
    "| Messaging and communication | `IN_PROGRESS` | PR #248, branch `agent/messaging-communication-v1`; owns `EXP-MSG-001` through `EXP-MSG-007` |",
    "| Messaging and communication | `IN_PROGRESS`; product-owner-paused and excluded from the beta merge queue | PR #248, branch `agent/messaging-communication-v1`; preserved as the sole authority for `EXP-MSG-001` through `EXP-MSG-007`; draft status enforced until explicit owner reactivation |",
    "messaging snapshot row",
)
replace_once(
    "| Player Marketplace lifecycle | `IN_PROGRESS` | PR #249, branch `agent/player-marketplace-lifecycle-v1`; owns `EXP-MP-001` through `EXP-MP-009` |",
    "| Player Marketplace lifecycle | `IN_PROGRESS`; product-owner-paused and excluded from the beta merge queue | PR #249, branch `agent/player-marketplace-lifecycle-v1`; preserved as sole authority for `EXP-MP-001` through `EXP-MP-009`; four required workflows currently fail |",
    "marketplace snapshot row",
)
replace_once(
    "| Progression, reputation, and achievements | `IN_PROGRESS` | PR #261, branch `agent/progression-reputation-achievements-v1`; owns `EXP-PROG-001` through `EXP-PROG-008` |",
    "| Progression, reputation, and achievements | `IN_PROGRESS`; product-owner-paused and excluded from the beta merge queue | PR #261, branch `agent/progression-reputation-achievements-v1`; preserved as sole authority for `EXP-PROG-001` through `EXP-PROG-008`; current branch contains planning/source-snapshot files rather than runtime completion evidence |",
    "progression snapshot row",
)
replace_once(
    "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; isolated environment evidence, rollback, restore, approval, and promotion remain open |",
    "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; Chat 2 now owns bounded release-platform PR #280, while distinct staging identities, migration reconciliation, connected smoke, approval, rollback, restore, and promotion evidence remain open |\n| Production-beta program control | `IMPLEMENTED_NOT_MERGED` | Chat 1, branch `docs/beta-program-controller-v1`; sole authority for this roadmap, `docs/operations/econovaria-beta-coordination-matrix-v1.md`, collision prevention, merge sequencing, and final completion reconciliation |\n| Live migration reconciliation | `PLANNED`; branch reserved | Chat 3, branch `agent/live-migration-reconciliation-v1`; no PR or implementation evidence yet |\n| Live legacy-runtime retirement | `PLANNED`; branch reserved | Chat 4, branch `agent/legacy-runtime-retirement-v1`; no PR or production-traffic evidence yet |\n| Beta security and rate-limit closure | `PLANNED`; branch reserved | Chat 5, branch `agent/beta-security-rate-limit-v1`; branch currently equals audited `main` |\n| Beta observability and performance | `PLANNED`; branch reserved | Chat 6, branch `agent/beta-observability-performance-v1`; branch currently equals audited `main` |\n| Backup and restore rehearsal | `PLANNED`; branch reserved | Chat 7, branch `agent/beta-backup-restore-v1`; branch currently equals audited `main` |\n| Final Phase 6 E2E and pilot | `BLOCKED`; branch reserved | Chat 10, branch `agent/beta-e2e-pilot-v1`; blocked on release, migration, story, seed, security, observability, and restore gates |",
    "release snapshot and controller rows",
)

replace_once(
    "- Current active capability ownership is unique: seed content #163, story delivery #244, Messaging #248, Marketplace #249, and Progression #261. Market/Portfolio #245, Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "- Current capability ownership remains unique: seed content #163 and story delivery #244 are active beta capability authorities; release-platform PR #280 is active beta tooling; Messaging #248, Marketplace #249, and Progression #261 remain preserved sole authorities but are product-owner-paused and excluded from the beta merge queue. Market/Portfolio #245, Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "active capability summary",
)

replace_once(
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `e167ea3976da3a5825cc1cc079c994c4f887eaf6`; unique active capability authorities are PRs #163, #244, #248, #249, and #261. Market/Portfolio PR #245 is merged as `64d6a5badc52a1fad4394b0eaa53ac1f97e8855a`.",
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, workflow state, migrations, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `f44b0735763da6700fc18513fa7026dbd95aff86`; active beta authorities are PR #280 release tooling, PR #244 story delivery, and PR #163 seed content. PRs #248, #249, and #261 remain unique expansion authorities but are product-owner-paused and excluded from the beta merge queue.",
    "P0-001 audit line",
)

replace_once(
    "| Seed-content definition, calibration, and executable-content preparation | PR #163 / `agent/seed-content-foundation-v1` | `IN_PROGRESS` | Sole active seed authority; do not create another seed-content branch or merge/activate before its gates close. |",
    "| Seed-content definition, calibration, and executable-content preparation | PR #163 / `agent/seed-content-foundation-v1` | `IN_PROGRESS`; not merge-ready | Sole active seed authority; continue the existing branch only. Synchronize with `main`, rerun required CI, and provide bounded importer, rollback, calibration/map, and isolated-staging evidence before merge. |",
    "seed registry row",
)
replace_once(
    "| Player story-notification delivery | PR #244 / `agent/player-story-delivery-v1` | `IN_PROGRESS` | Owns `BETA-NOTIF-005` and `BETA-NOTIF-006`; does not own campaign definitions or runner scheduling. |",
    "| Player story-notification delivery | PR #244 / `agent/player-story-delivery-v1` | `IN_PROGRESS`; not merge-ready | Owns `BETA-NOTIF-005` and `BETA-NOTIF-006`; continue the existing branch only. The application workflow must materialize a permanent bounded source diff and pass after synchronization. |",
    "story registry row",
)
replace_once(
    "| Messaging and communication | PR #248 / `agent/messaging-communication-v1` | `IN_PROGRESS` | Sole authority for `EXP-MSG-001` through `EXP-MSG-007`. |",
    "| Messaging and communication | PR #248 / `agent/messaging-communication-v1` | `IN_PROGRESS`; product-owner-paused | Sole preserved authority for `EXP-MSG-001` through `EXP-MSG-007`; draft and excluded from the beta merge queue until explicit owner reactivation. |",
    "messaging registry row",
)
replace_once(
    "| Player Marketplace lifecycle | PR #249 / `agent/player-marketplace-lifecycle-v1` | `IN_PROGRESS` | Sole authority for `EXP-MP-001` through `EXP-MP-009`. |",
    "| Player Marketplace lifecycle | PR #249 / `agent/player-marketplace-lifecycle-v1` | `IN_PROGRESS`; product-owner-paused | Sole preserved authority for `EXP-MP-001` through `EXP-MP-009`; draft, failing required workflows, and excluded from the beta merge queue until explicit owner reactivation. |",
    "marketplace registry row",
)
replace_once(
    "| Progression, reputation, and achievements | PR #261 / `agent/progression-reputation-achievements-v1` | `IN_PROGRESS` | Sole authority for `EXP-PROG-001` through `EXP-PROG-008`; does not own PR #163 seed definitions. |",
    "| Progression, reputation, and achievements | PR #261 / `agent/progression-reputation-achievements-v1` | `IN_PROGRESS`; product-owner-paused | Sole preserved authority for `EXP-PROG-001` through `EXP-PROG-008`; current source-snapshot/planning files are not runtime completion evidence; excluded from the beta merge queue until explicit owner reactivation. |",
    "progression registry row",
)
replace_once(
    "| Staging readiness validation | PR #169 / merge `ca642b1dfd6a2965612869e05b4fa1bd5840c437` | tooling `VERIFIED_COMPLETE`; external evidence `IN_PROGRESS` | Do not claim staging readiness from validator tests alone; supply current environment, migration, artifact, rollback, restore, and approval evidence. |",
    "| Staging readiness validation | PR #169 / merge `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; PR #280 / `agent/isolated-staging-release-v1` | preflight tooling `VERIFIED_COMPLETE`; release platform `IMPLEMENTED_NOT_MERGED`; external evidence `IN_PROGRESS` | Do not claim staging readiness from tooling alone; distinct environment, migration, connected smoke, immutable artifact, rollback, restore, and approval evidence remain required. |\n| Production-beta coordination and merge gates | Chat 1 / `docs/beta-program-controller-v1` | `IMPLEMENTED_NOT_MERGED` | Sole authority for the roadmap and coordination matrix. No workstream may edit this roadmap or self-certify completion. |\n| Live migration reconciliation | Chat 3 / `agent/live-migration-reconciliation-v1` | `PLANNED` | Branch reserved; no replacement branch, rewritten migration, manual production SQL, or roadmap edit. |\n| Live legacy-runtime retirement | Chat 4 / `agent/legacy-runtime-retirement-v1` | `PLANNED` | Branch reserved; evidence and rollback planning only until explicit live-change approval. |\n| Beta security and rate-limit closure | Chat 5 / `agent/beta-security-rate-limit-v1` | `PLANNED` | Branch reserved; no expansion features or production configuration changes. |\n| Beta observability and performance | Chat 6 / `agent/beta-observability-performance-v1` | `PLANNED` | Branch reserved; redacted evidence only and no student-data logging. |\n| Backup and restore rehearsal | Chat 7 / `agent/beta-backup-restore-v1` | `PLANNED` | Branch reserved; isolated synthetic staging only and no production restore. |\n| Final Phase 6 E2E and pilot | Chat 10 / `agent/beta-e2e-pilot-v1` | `BLOCKED` | Branch reserved; execution waits for all release and capability dependencies. |",
    "operations registry and ten-chat rows",
)

replace_once(
    "**Exit gate:** Met. No overlapping active pull request owns the same capability, superseded duplicate refs and finalizer artifacts are retired, and this roadmap reflects the repository through `e167ea3976da3a5825cc1cc079c994c4f887eaf6`.",
    "**Exit gate:** Met at the ownership-policy boundary. No overlapping pull request owns the same capability; paused expansion authorities are outside the beta merge queue; the ten-chat matrix is maintained in `docs/operations/econovaria-beta-coordination-matrix-v1.md`; and this roadmap reflects audited `main` through `f44b0735763da6700fc18513fa7026dbd95aff86`.",
    "Phase 0 exit gate",
)

replace_once(
    "## 24. Player Marketplace\n\n**Status:** `PLANNED`; current surfaces remain read-only.",
    "## 24. Player Marketplace\n\n**Status:** `IN_PROGRESS` on PR #249, but product-owner-paused and excluded from the production-beta merge queue. Preserve the existing branch and PR; do not merge, close, delete, or expand scope until explicit owner reactivation. Current required-workflow failures remain blockers.",
    "Marketplace expansion status",
)
replace_once(
    "## 26. Messaging and communication\n\n**Status:** `PLANNED`.",
    "## 26. Messaging and communication\n\n**Status:** `IN_PROGRESS` on PR #248, but product-owner-paused and excluded from the production-beta merge queue. Preserve the existing branch and draft PR; do not merge, close, delete, or expand scope until explicit owner reactivation.",
    "Messaging expansion status",
)
replace_once(
    "## 27. Progression, reputation, and achievements\n\n**Status:** `IMPLEMENTED_NOT_MERGED` for basic activation-disabled level and achievement definitions on PR #163; authoritative reads, claims, unlocks, reputation, Admin correction, and full balance remain `PLANNED`.",
    "## 27. Progression, reputation, and achievements\n\n**Status:** `IN_PROGRESS` across PR #163 definition artifacts and PR #261 planning/source-snapshot work, but PR #261 is product-owner-paused and excluded from the production-beta merge queue. Authoritative reads, claims, unlocks, reputation, Admin correction, and full balance are not complete. Preserve both existing ownership boundaries and do not merge, close, delete, or expand PR #261 until explicit owner reactivation.",
    "Progression expansion status",
)

ledger_anchor = "## 33. Change ledger\n\nAppend entries in reverse chronological order.\n\n"
ledger_entry = """## 33. Change ledger

Append entries in reverse chronological order.

### 2026-07-20 — Production-beta controller and ten-workstream reconciliation

- Audited `main` at `f44b0735763da6700fc18513fa7026dbd95aff86`, `CONTRIBUTING.md`, the authoritative roadmap, all open PRs, assigned workstream branches, divergence, changed files, migrations, and current-head workflow evidence.
- Established Chat 1 as sole roadmap and merge-gate authority on `docs/beta-program-controller-v1` and added `docs/operations/econovaria-beta-coordination-matrix-v1.md` with exact ownership, prohibited-file, dependency, CI, blocker, and next-action fields for all ten chats.
- Reserved missing prescribed branches `agent/live-migration-reconciliation-v1` and `agent/legacy-runtime-retirement-v1`; Chats 5, 6, 7, and 10 remain zero-commit placeholders at audited `main`; Chat 2 owns draft PR #280.
- Returned PR #248 to draft and recorded product-owner pause gates on PRs #248, #249, and #261 without closing or deleting them. They remain sole expansion authorities but are excluded from the production-beta merge queue.
- Rejected current merge readiness for PR #256 because required Admin workflows fail; PR #244 because its application workflow fails and permanent source has not materialized; PR #163 because it is non-mergeable, 132 commits behind audited `main`, lacks current-head workflow evidence, and remains non-executable; and PR #249 because four required workflows fail.
- No application feature, database migration, production schema, credential, environment, or deployment behavior changed in this controller reconciliation.

"""
if text.count(ledger_anchor) != 1:
    raise SystemExit(f"ledger anchor: expected exactly one match, found {text.count(ledger_anchor)}")
text = text.replace(ledger_anchor, ledger_entry, 1)

ROADMAP.write_text(text, encoding="utf-8")
