# Econovaria Production-Beta Coordination Matrix

**Controller:** Chat 1  
**Audited main:** `990a56fa0e25c5e43cc1b6248184ba9b0cc62c99`  
**Controller branch:** `docs/econovaria-controller-reconciliation-v2`  
**Audit date:** 2026-07-21  
**Detailed audit:** `docs/operations/econovaria-controller-reconciliation-v2.md`

Current PR heads, diffs, divergence, review threads and exact-head workflows are authoritative. Repository tooling is not connected environment evidence.

## Rules

1. Chat 1 alone owns the roadmap, this matrix, capability assignment, collisions, merge order, scoreboard and final go/no-go.
2. Continue existing PRs and branches. No replacement branches, overlapping donor merges or unauthorized roadmap edits.
3. Every implementation PR must contain current `main`, publish one permanent human-authored final head, resolve all review threads and pass all required workflows on that head.
4. Direct-main helpers, write-enabled finalizers, `pull_request_target` bypasses, push synchronizers and self-certifying roadmap workflows are prohibited.
5. Migrations are forward-only and require replay plus Chat 3 ordering review. No manual production operation is authorized.
6. Product-owner instruction dated 2026-07-21 reactivates PRs #248, #249 and #261. They remain draft until verified, but are no longer paused.

## Open implementation authorities

| PR | Authority | Branch | Audited head | Behind main | Status and next action |
|---:|---|---|---|---:|---|
| #163 | Seed definitions, calibration, executable pack, importer and rollback | `agent/seed-content-foundation-v1` | `9ad9bf260eae7edbad09b7087a2295aedb9bd10b` | 216 | `RE_AUDIT_REQUIRED`. Remove reconciliation automation, synchronize manually, rerun full CI and prove bounded isolated import, replay, deactivation and rollback. |
| #248 | Messaging, `EXP-MSG-001`–`007` | `agent/messaging-communication-v1` | `39573342c6de8638d24930b59b0a4c5aa9e2ebda` | 1 | `IN_PROGRESS`. Record reactivation, remove stale pause language, synchronize after #284 and rerun the complete affected matrix. |
| #249 | Marketplace, `EXP-MP-001`–`009` | `agent/player-marketplace-lifecycle-v1` | `7d07a3b335bd88cf0ecbbddba6068c3de06be0b0` | 249 | `RE_AUDIT_REQUIRED`. Synchronize, repair failed checks, replay migrations and prove concurrent exactly-once settlement. |
| #261 | Progression, `EXP-PROG-001`–`008` | `agent/progression-reputation-achievements-v1` | `ee0c09f26de072746758c77b0739f837c24fe971` | 249 | `IN_PROGRESS`. Synchronize and replace snapshot/planning-only state with bounded runtime implementation and simulations. |
| #294 | Campaign, onboarding, Arrival Class, geography and travel runtime | `agent/story-arrival-world-runtime-v1` | `aeb43bb0aee75f3d764690e91e8c6866667a637f` | 1 | `IN_PROGRESS`. Synchronize after #284 and complete persistence, scheduling, clients, migrations, browser tests and isolated playthrough while consuming #163 definitions. |

All five authorities had zero unresolved review threads at audit. Refresh moving heads before review.

## Ten-chat assignment

| Chat | Owned scope | Authority and boundary |
|---:|---|---|
| 1 | Roadmap, scoreboard, ownership, collisions, queue and go/no-go | This controller branch only. No product or operational implementation. |
| 2 | Immutable staging release, connected Admin/Player smoke and Phase 6 orchestration | Merged #280/#290/#286. Reserve `ops/isolated-staging-beta-execution-v1` for evidence only. |
| 3 | Migration ordering, forward corrections, backup and restore execution | Merged #282/#285. Reserve `ops/isolated-recovery-evidence-v1`; no history rewrites or manual production SQL. |
| 4 | Legacy runtime evidence, observability, alerts, load and post-load plans | Merged #283/#287. Reserve `ops/runtime-observability-evidence-v1`; no feature code, raw identifiers or speculative indexes. |
| 5 | Connected security closure after merged PR #284 | No active implementation PR; use a controller-assigned evidence branch only. No feature overlap. |
| 6 | Bounded seed pack and import/rollback | PR #163 only; publishes stable definitions and does not own runtime campaign code. |
| 7 | Campaign/onboarding/Arrival Class/world runtime | PR #294 only; consumes rather than edits #163 definitions. |
| 8 | Messaging | PR #248 only. Uses canonical notification, public-ID, rate-limit and audit interfaces. |
| 9 | Marketplace | PR #249 only. Uses Inventory reservation and ledger interfaces; does not own stock-market orders. |
| 10 | Progression | PR #261 only. Does not own Arrival Class, seed definitions or campaign runtime. |

## Migration ownership

- Chat 8 / #248 owns Messaging migrations.
- Chat 9 / #249 owns Marketplace migrations.
- The merged #284 security migration is authoritative on `main`; later corrections require a new forward migration and Chat 3 review.
- Chat 10 / #261 owns future Progression migrations after Chat 3 review.
- Chat 7 / #294 owns future campaign, Arrival Class and geography migrations after Chat 3 review.
- Chat 6 / #163 owns seed mappings and importer behavior, not production schema authority.

## Merged foundations

PRs #244, #282, #290, #280, #283, #285, #287, #286 and #284 are merged. `OPS-STAGE-001`–`003` and `BETA-BANK-004` have connected isolated evidence. Release execution, legacy retirement, backup/restore, observability/load, connected security and the 52-scenario pilot remain open.

## Merge order

1. Controller reconciliation after final-head documentation CI and product-owner review.
2. #248 after reactivation, synchronization and exact-head CI.
3. #249 after synchronization, repair and concurrency evidence.
4. #261 after runtime implementation and simulations.
5. #163 after manual synchronization and bounded import/rollback evidence.
6. #294 after stable #163 interfaces and complete runtime/staging evidence.
7. Exact immutable staging release, connected security, recovery, observability/load and continuous 52-scenario evidence.
8. Final controller go/no-go.

#163 and #294 may exchange reviewed versioned interfaces but may not absorb each other’s authority. Historical CI, generated finalizer commits and temporary synchronization heads are not merge evidence.

## Current blockers

- #163 is heavily diverged and non-mergeable.
- #249 and #261 are heavily behind `main`; #249 has failed workflows and #261 lacks runtime implementation.
- #248 and #294 must synchronize after the #284 merge and publish new final heads.
- Connected security evidence remains open after the #284 repository merge.
- Final staging smoke, backup/restore, observability/load, legacy-provider evidence and one connected 52-scenario run are incomplete.

`VERIFIED_COMPLETE` requires merged authority plus every applicable exact-head and connected evidence gate. Otherwise use only `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, `PLANNED`, `BLOCKED` or `RE_AUDIT_REQUIRED`.
