# Econovaria Remote Branch Divergence Inventory

**Generated from:** complete `refs/remotes/origin/*` after `git fetch origin --prune`
**Audited main:** `f44b0735763da6700fc18513fa7026dbd95aff86`
**Date:** 2026-07-20
**Authority:** Chat 1 beta program controller

This inventory is branch evidence, not capability completion evidence. An unmerged or branch-only ref is non-authoritative unless the beta coordination matrix assigns it and an active pull request establishes the bounded capability scope.

| Remote branch | Tip SHA | Ahead | Behind | Divergence | Controller disposition |
|---|---|---:|---:|---|---|
| `agent/isolated-staging-release-v1` | `849f320064c3ede18e3a5e3a5b81d9741c3ec020` | 24 | 0 | ahead only | PR #280 — active beta release-tooling authority |
| `agent/messaging-communication-v1` | `7d88b89478aa3a289d6af2c0174855fb8d23e0b4` | 16 | 22 | diverged | PR #248 — product-owner-paused expansion; draft; outside beta queue |
| `agent/player-marketplace-lifecycle-v1` | `7d07a3b335bd88cf0ecbbddba6068c3de06be0b0` | 50 | 25 | diverged | PR #249 — product-owner-paused expansion; outside beta queue |
| `agent/player-story-delivery-v1` | `b1894660a33f77d3f8fb8452c24910c9520bdf08` | 14 | 0 | ahead only | PR #244 — active beta story authority; not merge-ready |
| `agent/progression-reputation-achievements-v1` | `ee0c09f26de072746758c77b0739f837c24fe971` | 2 | 25 | diverged | PR #261 — product-owner-paused expansion; outside beta queue |
| `agent/seed-content-foundation-v1` | `ad73fbe23dffd8556e58f363b6dd833daa93cd74` | 407 | 132 | diverged | PR #163 — active beta seed authority; not merge-ready |
| `dependabot/github_actions/routine-actions-674967a53d` | `17749c58d0a562c1193405aca439faedbac4000f` | 1 | 29 | diverged | PR #256 — independent tooling; failing required workflows |
| `docs/beta-program-controller-v1` | `9b34bb769ef4d8dffbd317b66e731830930b9085` | 8 | 0 | ahead only | PR #281 — sole beta program-control and roadmap authority |
| `agent/beta-backup-restore-v1` | `77c26c354ccf2f88a83591cb53d14138badc4dc4` | 6 | 0 | ahead only | Chat 7 reserved authority; no PR/implementation at inventory time |
| `agent/beta-e2e-pilot-v1` | `9e2a30d491b72cd4c529c3b3954df46219929798` | 3 | 0 | ahead only | Chat 10 reserved authority; blocked on dependencies |
| `agent/beta-observability-performance-v1` | `f44b0735763da6700fc18513fa7026dbd95aff86` | 0 | 0 | equal to main | Chat 6 reserved authority; no PR/implementation at inventory time |
| `agent/beta-security-rate-limit-v1` | `5adf2f72119c768f27ab9bce6bec7a01454b1ec1` | 13 | 0 | ahead only | Chat 5 reserved authority; no PR/implementation at inventory time |
| `agent/legacy-runtime-retirement-v1` | `7f88b1bdbf5554c160e5de1793b1ef86c10f61ac` | 2 | 0 | ahead only | Chat 4 reserved authority; no PR/implementation at inventory time |
| `agent/live-migration-reconciliation-v1` | `67d405140f91e4254193664c6af9c21b2eeda1bc` | 3 | 0 | ahead only | Chat 3 reserved authority; no PR/implementation at inventory time |
| `agent/admin-credential-renderer-cleanup-v1` | `fe79e63092bc3785a1222bb45d756cc436f31e40` | 8 | 94 | diverged | Superseded PR #226; do not revive |
| `agent/admin-modal-drawer-accessibility-v1` | `c546878c9aafce8321d81fd88953fd126e8b6b1b` | 1 | 113 | diverged | Branch-only test tranche with no PR; non-authoritative |
| `agent/arrival-class-system-v1` | `2d3c5ea7d9fa8995c955ff452ab48aa68f667244` | 1 | 32 | diverged | Branch-only expansion claim with no PR; non-authoritative and outside ten-workstream beta queue |
| `agent/incident-readiness-rebase-v1` | `afdbd18882db30b3b08d7815a4cacb527dc7b766` | 11 | 30 | diverged | Historical merged incident-readiness source; no current authority |
| `agent/market-minute-replay-v1` | `d12d2dffd5a7f5a8ac8fa624558420c2e1e51ee9` | 24 | 109 | diverged | Stale branch-only runtime/migration tranche with no PR; non-authoritative |
| `agent/platform-scope-integration-v1` | `a1068966bc0a9a884f8b1881a93e80c04b2f7c71` | 53 | 464 | diverged | Closed donor PR #143; non-authoritative |
| `agent/player-backend-feature-parity` | `2b39b8af714d84ed6392185a09e53e5cde6cf307` | 0 | 243 | fully contained / behind | Historical branch fully contained in main; no current authority |
| `agent/progression-main-sync-snapshot-temp` | `8b949ba9512f09ceaed9a0c9fc8968bd3285663a` | 1 | 0 | ahead only | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `agent/skeleton-loader-only-correction-v1` | `54bed555823126c88adb5cb9e4211aeaf7d96ec4` | 8 | 113 | diverged | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `automation/player-banking-sync-trigger-v1` | `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e` | 0 | 99 | fully contained / behind | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `chore/program-control-stale-helper-cleanup-v1` | `239850aa188aeeedccdbd2623ed01bbab0ebd44f` | 2 | 14 | diverged | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `docs/incident-readiness-final-v4` | `997c8e9186223fa9b726b3712d3467300d8757ee` | 1 | 10 | diverged | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `docs/program-control-phase0-seal-v1` | `f1267163e1f086b59cfe7ee016fe2ce3b2edf3ca` | 3 | 31 | diverged | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `feat/contracts-end-to-end-wiring` | `2b39b8af714d84ed6392185a09e53e5cde6cf307` | 0 | 243 | fully contained / behind | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `feat/player-recovery-states-v1` | `bce1766262e5a9d6d4f54e03a7b658af8df267d4` | 28 | 28 | diverged | No current controller-approved beta authority; branch-only ref must not be merged or revived without collision audit and explicit assignment |
| `frontend/admin-terminal-source-v1` | `a772fbd7757f01c6b383a7ccb944be23f48a5d18` | 6 | 837 | diverged | Retained exception under CONTRIBUTING.md; not active feature authority |

## Gate rule

Branches not explicitly assigned in `docs/operations/econovaria-beta-coordination-matrix-v1.md` and not tied to an approved open PR are not merge candidates. They must not be revived, rebased, force-pushed, deleted, or used as donor sources until Chat 1 performs a collision audit and records an explicit disposition.
