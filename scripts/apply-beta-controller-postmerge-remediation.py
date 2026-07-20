from pathlib import Path

path = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "**Repository state audited through:** `f44b0735763da6700fc18513fa7026dbd95aff86`",
    "**Repository state audited through:** `92563c58304517e911816627a9cac0c74db92aef`",
    "repository audit boundary",
)

replace_once(
    "10. The accepted Admin v606 and Player Terminal visual systems must not be redesigned during backend, security, or release work unless the product owner requests a redesign.",
    "10. The accepted Admin v606 and Player Terminal visual systems must not be redesigned during backend, security, or release work unless the product owner requests a redesign.\n11. No workstream may add a write-enabled `pull_request_target`, `push`-triggered finalizer, or direct-`main` helper to advance a product-owner-paused PR or bypass the controller merge queue.",
    "change-control automation rule",
)

replace_once(
    "| Messaging and communication | `IN_PROGRESS`; product-owner-paused and excluded from the beta merge queue | PR #248, branch `agent/messaging-communication-v1`; preserved as the sole authority for `EXP-MSG-001` through `EXP-MSG-007`; draft status enforced until explicit owner reactivation |",
    "| Messaging and communication | `IN_PROGRESS`; product-owner-paused and excluded from the beta merge queue | PR #248, branch `agent/messaging-communication-v1`; preserved as the sole authority for `EXP-MSG-001` through `EXP-MSG-007`. An unauthorized ready transition and write-enabled synchronization helper were contained; PR #248 was restored to draft and remains blocked until explicit owner reactivation |",
    "Messaging snapshot",
)
replace_once(
    "| Production-beta program control | `IMPLEMENTED_NOT_MERGED` | Chat 1, branch `docs/beta-program-controller-v1`; sole authority for this roadmap, `docs/operations/econovaria-beta-coordination-matrix-v1.md`, collision prevention, merge sequencing, and final completion reconciliation |",
    "| Production-beta program control | `VERIFIED_COMPLETE` | PR #281 merged as `7bbd08e19641146282b58023a0a911c90f6a148b` after Repository Quality, Supply Chain Security, and Staging Readiness Preflight passed. Chat 1 remains sole authority for this roadmap, `docs/operations/econovaria-beta-coordination-matrix-v1.md`, collision prevention, merge sequencing, and final completion reconciliation; emergency containment commit `92563c58304517e911816627a9cac0c74db92aef` removed an unauthorized paused-expansion unblocker from `main` |",
    "controller snapshot",
)

replace_once(
    "- Established Chat 1 as sole roadmap and merge-gate authority on draft PR #281 and added `docs/operations/econovaria-beta-coordination-matrix-v1.md` plus `docs/operations/econovaria-remote-branch-inventory-v1.md`.",
    "- Established Chat 1 as sole roadmap and merge-gate authority on PR #281, merged as `7bbd08e19641146282b58023a0a911c90f6a148b` after Repository Quality, Supply Chain Security, and Staging Readiness Preflight passed; added `docs/operations/econovaria-beta-coordination-matrix-v1.md` plus `docs/operations/econovaria-remote-branch-inventory-v1.md`.",
    "controller ledger merge status",
)

anchor = "### 2026-07-20 — Production-beta controller and ten-workstream reconciliation\n\n"
incident = """### 2026-07-20 — Paused Messaging bypass containment

- After controller PR #281 merged, commit `c88d7e80c866038731dba7044e97ba33ab83aecb` added a write-enabled workflow directly to `main` that targeted product-owner-paused PR #248, modified its branch, and attempted a direct push back to `main`.
- Commit `efb734f6a975158b826c6d22e5b260fd892c861d` changed the helper to a `push` trigger on `main`, immediately activating the paused-expansion synchronization path.
- Chat 1 restored PR #248 to draft, posted a renewed pause gate, and removed the helper from `main` in emergency containment commit `92563c58304517e911816627a9cac0c74db92aef`.
- Neither the helper nor any branch output it produced is accepted as merge, completion, runtime, or staging evidence. PR #248 remains open, preserved, and outside the beta merge queue until explicit product-owner reactivation.
- No application feature, migration, production schema, credential, environment, or deployment was changed by the controller containment.

### 2026-07-20 — Production-beta controller and ten-workstream reconciliation

"""
if text.count(anchor) != 1:
    raise SystemExit(f"ledger anchor: expected one match, found {text.count(anchor)}")
text = text.replace(anchor, incident, 1)

path.write_text(text, encoding="utf-8")
