from pathlib import Path
import subprocess


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True).strip()


OPEN_PR = {
    "agent/seed-content-foundation-v1": "PR #163 — active beta seed authority; not merge-ready",
    "agent/player-story-delivery-v1": "PR #244 — active beta story authority; not merge-ready",
    "agent/messaging-communication-v1": "PR #248 — product-owner-paused expansion; draft; outside beta queue",
    "agent/player-marketplace-lifecycle-v1": "PR #249 — product-owner-paused expansion; outside beta queue",
    "dependabot/github_actions/routine-actions-674967a53d": "PR #256 — independent tooling; failing required workflows",
    "agent/progression-reputation-achievements-v1": "PR #261 — product-owner-paused expansion; outside beta queue",
    "agent/isolated-staging-release-v1": "PR #280 — active beta release-tooling authority",
    "docs/beta-program-controller-v1": "PR #281 — sole beta program-control and roadmap authority",
}

ASSIGNED = {
    "agent/live-migration-reconciliation-v1": "Chat 3 reserved authority; no PR/implementation at inventory time",
    "agent/legacy-runtime-retirement-v1": "Chat 4 reserved authority; no PR/implementation at inventory time",
    "agent/beta-security-rate-limit-v1": "Chat 5 reserved authority; no PR/implementation at inventory time",
    "agent/beta-observability-performance-v1": "Chat 6 reserved authority; no PR/implementation at inventory time",
    "agent/beta-backup-restore-v1": "Chat 7 reserved authority; no PR/implementation at inventory time",
    "agent/beta-e2e-pilot-v1": "Chat 10 reserved authority; blocked on dependencies",
}

SPECIAL = {
    "frontend/admin-terminal-source-v1": "Retained exception under CONTRIBUTING.md; not active feature authority",
    "agent/platform-scope-integration-v1": "Closed donor PR #143; non-authoritative",
    "agent/admin-credential-renderer-cleanup-v1": "Superseded PR #226; do not revive",
    "agent/admin-credential-renderer-cleanup-clean-v1": "Historical clean authority PR #227; no current beta ownership",
    "agent/incident-readiness-rebase-v1": "Historical merged incident-readiness source; no current authority",
    "agent/player-backend-feature-parity": "Historical branch fully contained in main; no current authority",
    "agent/arrival-class-system-v1": "Branch-only expansion claim with no PR; non-authoritative and outside ten-workstream beta queue",
    "agent/admin-modal-drawer-accessibility-v1": "Branch-only test tranche with no PR; non-authoritative",
    "agent/market-minute-replay-v1": "Stale branch-only runtime/migration tranche with no PR; non-authoritative",
}

main = git("rev-parse", "origin/main")
refs = git("for-each-ref", "--format=%(refname:short)|%(objectname)", "refs/remotes/origin").splitlines()
rows = []
for line in refs:
    ref, sha = line.split("|", 1)
    if ref in {"origin/HEAD", "origin/main"}:
        continue
    branch = ref.removeprefix("origin/")
    counts = git("rev-list", "--left-right", "--count", f"origin/main...{ref}")
    behind, ahead = [int(value) for value in counts.split()]
    if ahead == 0 and behind == 0:
        divergence = "equal to main"
    elif ahead == 0:
        divergence = "fully contained / behind"
    elif behind == 0:
        divergence = "ahead only"
    else:
        divergence = "diverged"

    if branch in OPEN_PR:
        disposition = OPEN_PR[branch]
    elif branch in ASSIGNED:
        disposition = ASSIGNED[branch]
    elif branch in SPECIAL:
        disposition = SPECIAL[branch]
    else:
        disposition = "No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment"

    rows.append((branch, sha, ahead, behind, divergence, disposition))

rows.sort(key=lambda row: (0 if row[0] in OPEN_PR else 1 if row[0] in ASSIGNED else 2, row[0]))

out = [
    "# Econovaria Remote Branch Divergence Inventory",
    "",
    "**Generated from:** complete `refs/remotes/origin/*` after `git fetch origin --prune`",
    f"**Audited main:** `{main}`",
    "**Date:** 2026-07-20",
    "**Authority:** Chat 1 beta program controller",
    "",
    "This inventory is branch evidence, not capability completion evidence. An unmerged or branch-only ref is non-authoritative unless the beta coordination matrix assigns it and an active pull request establishes the bounded capability scope.",
    "",
    "| Remote branch | Tip SHA | Ahead | Behind | Divergence | Controller disposition |",
    "|---|---|---:|---:|---|---|",
]
for branch, sha, ahead, behind, divergence, disposition in rows:
    out.append(f"| `{branch}` | `{sha}` | {ahead} | {behind} | {divergence} | {disposition} |")

out.extend([
    "",
    "## Gate rule",
    "",
    "Branches not explicitly assigned in `docs/operations/econovaria-beta-coordination-matrix-v1.md` and not tied to an approved open PR are not merge candidates. They must not be revived, rebased, force-pushed, deleted, or used as donor sources until Chat 1 performs a collision audit and records an explicit disposition.",
    "",
])

Path("docs/operations/econovaria-remote-branch-inventory-v1.md").write_text("\n".join(out), encoding="utf-8")
