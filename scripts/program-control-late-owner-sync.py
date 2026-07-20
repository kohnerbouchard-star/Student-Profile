from pathlib import Path

roadmap = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
operations = Path("docs/operations/branch-cleanup-2026-07-17.md")
roadmap_text = roadmap.read_text(encoding="utf-8")
operations_text = operations.read_text(encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


roadmap_text = replace_once(
    roadmap_text,
    "| Player Marketplace lifecycle | `IN_PROGRESS` | PR #249, branch `agent/player-marketplace-lifecycle-v1`; owns `EXP-MP-001` through `EXP-MP-009` |\n| Program-control consolidation |",
    "| Player Marketplace lifecycle | `IN_PROGRESS` | PR #249, branch `agent/player-marketplace-lifecycle-v1`; owns `EXP-MP-001` through `EXP-MP-009` |\n| Progression, reputation, and achievements | `IN_PROGRESS` | PR #261, branch `agent/progression-reputation-achievements-v1`; owns `EXP-PROG-001` through `EXP-PROG-008` |\n| Program-control consolidation |",
    "active development table",
)
roadmap_text = replace_once(
    roadmap_text,
    "- Premature seal PR #255 was labeled `duplicate`, closed without merge, and `docs/program-control-phase0-seal-v1` no longer exists. The merged PR #251 branch was retired automatically.",
    "- Premature seal PR #255 was labeled `duplicate`, closed without merge, and `docs/program-control-phase0-seal-v1` no longer exists. Later incident-verification PR #260 overlapped this earlier roadmap seal; its unique amendment evidence was transplanted into PR #259, it was labeled `duplicate`, closed, and `docs/incident-readiness-verification-v1` no longer exists. The merged PR #251 branch was retired automatically.",
    "final duplicate disposition",
)
roadmap_text = replace_once(
    roadmap_text,
    "- Current active capability ownership is unique: seed content #163, story delivery #244, market/Portfolio #245, Messaging #248, and Marketplace #249. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "- Current active capability ownership is unique: seed content #163, story delivery #244, market/Portfolio #245, Messaging #248, Marketplace #249, and Progression #261. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "current active ownership",
)
roadmap_text = replace_once(
    roadmap_text,
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `ad889a2bdf9d5587fff3275d70751c79992171c7`; unique active capability authorities are PRs #163, #244, #245, #248, and #249.",
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `ad889a2bdf9d5587fff3275d70751c79992171c7`; unique active capability authorities are PRs #163, #244, #245, #248, #249, and #261.",
    "P0-001 authority list",
)
roadmap_text = replace_once(
    roadmap_text,
    "| Player Marketplace lifecycle | PR #249 / `agent/player-marketplace-lifecycle-v1` | `IN_PROGRESS` | Sole authority for `EXP-MP-001` through `EXP-MP-009`. |\n| Player recovery states |",
    "| Player Marketplace lifecycle | PR #249 / `agent/player-marketplace-lifecycle-v1` | `IN_PROGRESS` | Sole authority for `EXP-MP-001` through `EXP-MP-009`. |\n| Progression, reputation, and achievements | PR #261 / `agent/progression-reputation-achievements-v1` | `IN_PROGRESS` | Sole authority for `EXP-PROG-001` through `EXP-PROG-008`; does not own PR #163 seed definitions. |\n| Player recovery states |",
    "capability registry",
)
roadmap_text = replace_once(
    roadmap_text,
    "- Preserved PR #245 over duplicate market PR #246 and PR #247 over duplicate recovery PR #253; consumed or explicitly dispositioned useful donor material before retirement. Premature roadmap seal PR #255 was also retired without merge.",
    "- Preserved PR #245 over duplicate market PR #246 and PR #247 over duplicate recovery PR #253; consumed or explicitly dispositioned useful donor material before retirement. Premature roadmap seal PR #255 was retired without merge. Incident-verification PR #260 was also retired after its unique amendment evidence was transplanted into PR #259.",
    "change-ledger duplicate sentence",
)
roadmap_text = replace_once(
    roadmap_text,
    "- Recorded unique active capability authorities: #163 seed content, #244 story delivery, #245 market/Portfolio, #248 Messaging, and #249 Marketplace. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active owners.",
    "- Recorded unique active capability authorities: #163 seed content, #244 story delivery, #245 market/Portfolio, #248 Messaging, #249 Marketplace, and #261 Progression. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active owners.",
    "change-ledger active list",
)

operations_text = replace_once(
    operations_text,
    "- PR #255 was an aborted premature roadmap seal. It was labeled `duplicate`, closed without merge, and `docs/program-control-phase0-seal-v1` no longer exists.\n- The merged PR #251 branch was deleted automatically.",
    "- PR #255 was an aborted premature roadmap seal. It was labeled `duplicate`, closed without merge, and `docs/program-control-phase0-seal-v1` no longer exists.\n- PR #260 duplicated the incident-readiness roadmap verification already owned by earlier PR #259. Its unique completed-amendment evidence was transplanted into PR #259, it was labeled `duplicate` and closed, and `docs/incident-readiness-verification-v1` no longer exists.\n- The merged PR #251 branch was deleted automatically.",
    "operations duplicate list",
)
operations_text = replace_once(
    operations_text,
    "- PR #249 — Player Marketplace lifecycle.\n\nRecently completed parallel tranches",
    "- PR #249 — Player Marketplace lifecycle;\n- PR #261 — Progression, reputation, and achievements.\n\nRecently completed parallel tranches",
    "operations active list",
)

roadmap.write_text(roadmap_text, encoding="utf-8")
operations.write_text(operations_text, encoding="utf-8")
