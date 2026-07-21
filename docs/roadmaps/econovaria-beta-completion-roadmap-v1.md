# Econovaria Complete Development Roadmap

**Document ID:** `ECON-BETA-ROADMAP-V1`  
**Roadmap authority:** Chat 1  
**Audited main:** `990a56fa0e25c5e43cc1b6248184ba9b0cc62c99`  
**Audit date:** 2026-07-21  
**Capability manifest:** `2026-07-20.3`  
**Current decision:** `BLOCKED`

The stable item definitions and acceptance criteria from the roadmap at parent `0ee9e121c3d556b2b3e4c1fa89e860a3a913a618` remain incorporated by reference. This reconciliation supersedes that parent for current status, authority, scoreboard and sequencing.

## Status vocabulary

Use only `VERIFIED_COMPLETE`, `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, `PLANNED`, `BLOCKED`, and `RE_AUDIT_REQUIRED`.

## Current authorities

- #163 seed pack: `RE_AUDIT_REQUIRED`.
- #248 Messaging: `IN_PROGRESS`; reactivated.
- #249 Marketplace: `RE_AUDIT_REQUIRED`; reactivated.
- #261 Progression: `IN_PROGRESS`; reactivated.
- #294 campaign, onboarding, Arrival Class and world runtime: `IN_PROGRESS`.

PR #284 is merged at the repository boundary. Its connected security evidence remains `IN_PROGRESS`.

## Scoreboard

| Scope | Verified | Open | Total |
|---|---:|---:|---:|
| Program | 10 | 0 | 10 |
| Beta | 65 | 31 | 96 |
| Seed | 0 | 1 | 1 |
| Operations | 5 | 17 | 22 |
| Expansion | 0 | 109 | 109 |
| **Total** | **80** | **158** | **238** |

`BETA-BANK-004` and `OPS-STAGE-001` through `OPS-STAGE-003` are newly `VERIFIED_COMPLETE` through merged connected isolated evidence.

## Corrections

- The manifest source is `2026-07-20.3`; older `.2` references are superseded.
- [x] Phase 3 story cutscene modal and purpose-built delivery are complete through PR #244.
- Minimal onboarding, tutorial instantiation and a complete campaign chain remain open under #163/#294.
- Product-owner instruction dated 2026-07-21 reactivates #248, #249 and #261; prior pause language is superseded.
- Repository foundations for release, migration, retirement, recovery, observability, pilot and security are merged. Connected acceptance remains open except the explicitly completed migration and ledger items above.

## Dependency order

1. Controller documentation review.
2. Synchronize and complete #248.
3. Synchronize, repair and complete #249.
4. Synchronize and implement #261.
5. Synchronize and prove the bounded #163 seed workflow.
6. Complete #294 against stable #163 interfaces.
7. Complete final staging, security, recovery, observability/load and pilot evidence.
8. Chat 1 issues the final go/no-go.

Exact branches, ownership boundaries, migration ownership, blockers and next actions are maintained in `docs/operations/econovaria-beta-coordination-matrix-v1.md`. Audit evidence is maintained in `docs/operations/econovaria-controller-reconciliation-v2.md`.
