from pathlib import Path

roadmap_path = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = roadmap_path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one roadmap match, found {count}: {old[:120]!r}")
    text = text.replace(old, new, 1)


replace_once(
    "**Repository state audited through:** `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`",
    "**Repository state audited through:** `222fd3e5b6491b32f79d7c56c0d84455411f6f77`",
)

replace_once(
    "| Seed-content foundation | `IN_PROGRESS`; branch synchronization required | PR #163, branch `agent/seed-content-foundation-v1`, head `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; 407 seed commits beyond the common base and 98 commits behind the audited repository state |\n",
    "| Seed-content foundation | `IN_PROGRESS`; branch synchronization required | PR #163, branch `agent/seed-content-foundation-v1`, head `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; 407 seed commits beyond the common base and 98 commits behind the audited repository state |\n"
    "| Player story-notification delivery | `IN_PROGRESS` | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006` without owning campaign content |\n"
    "| Player market orders and Portfolio | `IN_PROGRESS` | PR #245, branch `agent/player-market-reconciliation-v1`; surviving authority for `BETA-MKT-003` through `BETA-MKT-007` after duplicate PR #246 retirement |\n"
    "| Program-control consolidation | `IMPLEMENTED_NOT_MERGED` | PR #251, branch `chore/program-control-consolidation-v1`; reconciles overlapping ownership and hardens owner-safe branch retirement |\n",
)

replace_once(
    "- Operations and architecture are partially implemented: pinned toolchains, dependency audits, package-signature checks, repeated migration replay/lint, fail-closed staging validation, repository runtime cutover, and Admin architecture ratchets exist. They do not provide isolated environments, immutable release artifacts, SBOM/provenance, observability, backup/restore, incident readiness, or live legacy retirement evidence.\n\n### Current release condition",
    "- Operations and architecture are partially implemented: pinned toolchains, dependency audits, package-signature checks, repeated migration replay/lint, fail-closed staging validation, repository runtime cutover, and Admin architecture ratchets exist. They do not provide isolated environments, immutable release artifacts, SBOM/provenance, observability, backup/restore, incident readiness, or live legacy retirement evidence.\n\n"
    "### 2026-07-20 parallel-work ownership reconciliation\n\n"
    "- Re-audited open pull requests after parallel roadmap sessions created overlapping claims. PR #163 remains the sole seed-content authority and PR #244 uniquely owns Player story-notification delivery.\n"
    "- PRs #245 and #246 both claimed `BETA-MKT-003` through `BETA-MKT-007`. PR #245 contains the substantive public-safe market contract implementation and is the surviving authority. PR #246 contains only a temporary source-snapshot workflow and claim marker; its artifact was consumed for this audit and the PR is approved for explicit duplicate retirement.\n"
    "- PR #251 owns only Phase 0 program control. It adds fail-closed branch retirement for merged branches and explicitly `duplicate`-labeled closed branches, preserves the default and accepted Admin source refs, and adds a repository test ratchet.\n"
    "- Until PR #251 merges and PR #246 is closed/deleted, `P0-006` remains `IMPLEMENTED_NOT_MERGED`; no market, story, seed, Player, Admin, migration, runtime, or deployment capability is advanced by this program-control tranche.\n\n"
    "### Current release condition",
)

replace_once(
    "- **Phase 0 — Program control:** substantially complete; superseded branch-ref cleanup remains open.",
    "- **Phase 0 — Program control:** `IMPLEMENTED_NOT_MERGED` on PR #251; duplicate market ownership is reconciled and safe duplicate-branch retirement is pending merge and execution against PR #246.",
)

replace_once(
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 for repository state through `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`; PR #163 remains the only open PR.",
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 for `main` `222fd3e5b6491b32f79d7c56c0d84455411f6f77`; PR #163 owns seed content, PR #244 owns story delivery, PR #245 owns market reconciliation, and duplicate PR #246 is approved for retirement by PR #251.",
)

replace_once(
    "- [ ] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. Temporary roadmap branches were removed after merge; a reliable owner-safe inventory and cleanup of older superseded refs remains open because the branch-search connector returned no authoritative listing.",
    "- [ ] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. `IMPLEMENTED_NOT_MERGED` on PR #251: open-PR ownership was reconciled, substantive market work was preserved on PR #245, PR #246 was classified as the duplicate after its source artifact was consumed, and Branch Hygiene now fail-closes deletion to merged or explicitly `duplicate`-labeled same-repository PRs. Completion requires PR #251 merge plus PR #246 closure and branch-deletion evidence.",
)

replace_once(
    "| Seed-content definition, calibration, and executable-content preparation | PR #163 / `agent/seed-content-foundation-v1` | `IN_PROGRESS` | Sole active seed authority; do not create another seed-content branch or merge/activate before its gates close. |\n",
    "| Seed-content definition, calibration, and executable-content preparation | PR #163 / `agent/seed-content-foundation-v1` | `IN_PROGRESS` | Sole active seed authority; do not create another seed-content branch or merge/activate before its gates close. |\n"
    "| Player story-notification delivery | PR #244 / `agent/player-story-delivery-v1` | `IN_PROGRESS` | Owns `BETA-NOTIF-005` and `BETA-NOTIF-006`; does not own campaign definitions or runner scheduling. |\n"
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `IN_PROGRESS` | Sole surviving authority for `BETA-MKT-003` through `BETA-MKT-007`; PR #246 is a duplicate retirement target. |\n"
    "| Program-control consolidation | PR #251 / `chore/program-control-consolidation-v1` | `IMPLEMENTED_NOT_MERGED` | Owns only `P0-006`, ownership reconciliation, and branch-hygiene policy; no feature implementation. |\n",
)

replace_once(
    "Append entries in reverse chronological order.\n\n### 2026-07-20 — Comprehensive repository and roadmap re-audit",
    "Append entries in reverse chronological order.\n\n"
    "### 2026-07-20 — Parallel-work ownership reconciliation on PR #251\n\n"
    "- Re-audited current open PRs and identified duplicate ownership between PRs #245 and #246 for `BETA-MKT-003` through `BETA-MKT-007`.\n"
    "- Preserved PR #245 as the substantive market authority; classified PR #246 as duplicate after consuming its temporary source-snapshot artifact and confirming it contains no unique application implementation.\n"
    "- Added fail-closed Branch Hygiene support for merged or explicitly `duplicate`-labeled same-repository PRs, retained the default and accepted Admin source branches, and added `scripts/branch-hygiene-policy.test.mjs`.\n"
    "- Updated `docs/operations/branch-cleanup-2026-07-17.md`, the capability ownership registry, and current program snapshot. `P0-006` remains `IMPLEMENTED_NOT_MERGED` until PR #251 merges and PR #246 is closed with branch-deletion evidence.\n"
    "- No application source, migration, route, RPC, seed definition, credential, environment, or deployment changed.\n\n"
    "### 2026-07-20 — Comprehensive repository and roadmap re-audit",
)

roadmap_path.write_text(text, encoding="utf-8")
