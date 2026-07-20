from pathlib import Path

roadmap_path = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = roadmap_path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one roadmap match, found {count}: {old[:140]!r}")
    text = text.replace(old, new, 1)


replace_once(
    "**Repository state audited through:** `222fd3e5b6491b32f79d7c56c0d84455411f6f77`",
    "**Repository state audited through:** `89bfadfb0d609ef92081fda575f0e1e998b2650d`",
)

replace_once(
    "| Program-control consolidation | `IMPLEMENTED_NOT_MERGED` | PR #251, branch `chore/program-control-consolidation-v1`; reconciles overlapping ownership and hardens owner-safe branch retirement |",
    "| Program-control consolidation | `VERIFIED_COMPLETE` | PR #251 merged as `89bfadfb0d609ef92081fda575f0e1e998b2650d`; Branch Hygiene run #100 retired duplicate PR #246's branch |",
)

replace_once(
    "- PRs #245 and #246 both claimed `BETA-MKT-003` through `BETA-MKT-007`. PR #245 contains the substantive public-safe market contract implementation and is the surviving authority. PR #246 contains only a temporary source-snapshot workflow and claim marker; its artifact was consumed for this audit and the PR is approved for explicit duplicate retirement.\n"
    "- PR #251 owns only Phase 0 program control. It adds fail-closed branch retirement for merged branches and explicitly `duplicate`-labeled closed branches, preserves the default and accepted Admin source refs, and adds a repository test ratchet.\n"
    "- Until PR #251 merges and PR #246 is closed/deleted, `P0-006` remains `IMPLEMENTED_NOT_MERGED`; no market, story, seed, Player, Admin, migration, runtime, or deployment capability is advanced by this program-control tranche.",
    "- PRs #245 and #246 both claimed `BETA-MKT-003` through `BETA-MKT-007`. PR #245 contains the substantive public-safe market contract implementation and remains the sole authority. PR #246 contained only a temporary source-snapshot workflow and claim marker; its artifact was consumed, it was labeled `duplicate`, closed, and its head ref was deleted by Branch Hygiene run #100.\n"
    "- PR #251 merged the fail-closed retirement policy as `89bfadfb0d609ef92081fda575f0e1e998b2650d`, preserving the default and accepted Admin source refs and adding a five-test repository ratchet.\n"
    "- `P0-006` and Phase 0 are `VERIFIED_COMPLETE`. Active feature ownership is unique: PR #163 owns seed content, PR #244 owns story delivery, and PR #245 owns market reconciliation. No market, story, seed, Player, Admin, migration, runtime, or deployment capability was advanced by the program-control tranche.",
)

replace_once("| Program control | 9 | 1 | 10 |", "| Program control | 10 | 0 | 10 |")
replace_once("| **Total identified items** | **66** | **172** | **238** |", "| **Total identified items** | **67** | **171** | **238** |")

replace_once(
    "- **Phase 0 — Program control:** `IMPLEMENTED_NOT_MERGED` on PR #251; duplicate market ownership is reconciled and safe duplicate-branch retirement is pending merge and execution against PR #246.",
    "- **Phase 0 — Program control:** `VERIFIED_COMPLETE`; all ten items are merged and evidence-backed, duplicate PR #246 is closed, and its superseded head ref is deleted.",
)

replace_once(
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 for `main` `222fd3e5b6491b32f79d7c56c0d84455411f6f77`; PR #163 owns seed content, PR #244 owns story delivery, PR #245 owns market reconciliation, and duplicate PR #246 is approved for retirement by PR #251.",
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `89bfadfb0d609ef92081fda575f0e1e998b2650d`; PR #163 owns seed content, PR #244 owns story delivery, and PR #245 owns market reconciliation. Duplicate PR #246 is closed and its head ref is deleted.",
)

replace_once(
    "- [ ] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. `IMPLEMENTED_NOT_MERGED` on PR #251: open-PR ownership was reconciled, substantive market work was preserved on PR #245, PR #246 was classified as the duplicate after its source artifact was consumed, and Branch Hygiene now fail-closes deletion to merged or explicitly `duplicate`-labeled same-repository PRs. Completion requires PR #251 merge plus PR #246 closure and branch-deletion evidence.",
    "- [x] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. `VERIFIED_COMPLETE` through PR #251 merged as `89bfadfb0d609ef92081fda575f0e1e998b2650d`: PR #245 was preserved as the substantive market authority; PR #246's source artifact was consumed, the PR was labeled `duplicate` and closed, Branch Hygiene run #100 passed, and ref `agent/player-market-portfolio-v1` no longer resolves. Repository Quality #1084, Database Replay #345, Staging Readiness Preflight #99, and Admin Game Lifecycle Controls #33 passed on the final implementation head.",
)

replace_once(
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `IN_PROGRESS` | Sole surviving authority for `BETA-MKT-003` through `BETA-MKT-007`; PR #246 is a duplicate retirement target. |",
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `IN_PROGRESS` | Sole authority for `BETA-MKT-003` through `BETA-MKT-007`; do not create another market reconciliation branch. |",
)

replace_once(
    "| Program-control consolidation | PR #251 / `chore/program-control-consolidation-v1` | `IMPLEMENTED_NOT_MERGED` | Owns only `P0-006`, ownership reconciliation, and branch-hygiene policy; no feature implementation. |",
    "| Program-control consolidation | PR #251 / merge `89bfadfb0d609ef92081fda575f0e1e998b2650d` | `VERIFIED_COMPLETE` | Phase 0 is sealed; future ownership changes must preserve the unique-authority registry and fail-closed branch-retirement policy. |",
)

replace_once(
    "**Exit gate:** No overlapping active branch owns the same capability, and this roadmap reflects the current repository.",
    "**Exit gate:** Met. No overlapping active branch owns the same capability, superseded duplicate work is retired, and this roadmap reflects the current repository.",
)

replace_once(
    "Append entries in reverse chronological order.\n\n### 2026-07-20 — Parallel-work ownership reconciliation on PR #251",
    "Append entries in reverse chronological order.\n\n"
    "### 2026-07-20 — Phase 0 completion seal\n\n"
    "- PR #251 merged the program-control consolidation as `89bfadfb0d609ef92081fda575f0e1e998b2650d` after Repository Quality #1084, Database Replay #345, Staging Readiness Preflight #99, and Admin Game Lifecycle Controls #33 passed.\n"
    "- Preserved PR #245 as the sole market authority; PR #246 was labeled `duplicate`, closed, and Branch Hygiene run #100 deleted `agent/player-market-portfolio-v1`. The PR #251 branch was also automatically retired after merge.\n"
    "- Marked `P0-006` and all of Phase 0 `VERIFIED_COMPLETE`, updated the Program-control scoreboard to 10/10, and reduced total open identified items from 172 to 171.\n"
    "- Active feature ownership is now unique: seed content on PR #163, story delivery on PR #244, and market reconciliation on PR #245.\n"
    "- Roadmap-only completion seal; no application source, migration, route, RPC, seed definition, credential, environment, runtime, or deployment changed.\n\n"
    "### 2026-07-20 — Parallel-work ownership reconciliation on PR #251",
)

roadmap_path.write_text(text, encoding="utf-8")
