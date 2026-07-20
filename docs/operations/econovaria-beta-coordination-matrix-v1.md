# Econovaria Production-Beta Coordination Matrix

**Controller:** Chat 1 — beta program controller and merge gatekeeper  
**Controller authority:** PR #281 merged as `7bbd08e19641146282b58023a0a911c90f6a148b`  
**Containment reconciliation:** PR #288 merged as `b047e322b18225d8a4136acc76e92da15bdbff1e`  
**Story merge reconciliation:** PR #289 (`docs/beta-controller-story-merge-v1`)  
**Current authoritative main:** `35462edd60edbb86b0222f38cdb42bb41aac0efe`  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Audit date:** 2026-07-20  
**Production deployment authorized:** No

Current GitHub PR heads, permanent diffs, divergence from `35462edd60edbb86b0222f38cdb42bb41aac0efe`, and final-head workflow results are the merge-queue source of truth. A workflow result from a head that predates current `main` is historical evidence only and does not satisfy the final-head merge gate.

## Control rules

1. Chat 1 exclusively owns the authoritative roadmap, this matrix, collision prevention, merge sequencing, and final completion reconciliation.
2. No workstream may edit the authoritative roadmap or self-certify completion.
3. One capability has one existing branch and one PR authority. Replacement branches and overlapping donor merges are prohibited.
4. No production deployment, production credential change, manual production SQL, or manual production schema mutation is authorized.
5. Every active PR must contain current `main` and pass all required workflows on its permanent final head before merge.
6. Repository tooling is not connected staging, runtime, restore, observability, load, or pilot evidence.
7. PRs #248, #249, and #261 are product-owner-paused expansion work. They remain open and draft but are excluded from the beta merge queue until explicit reactivation.
8. No write-enabled finalizer, `pull_request_target`, push-triggered synchronizer, or direct-`main` helper may bypass the controller queue.

## Current ten-workstream queue

| Chat | Roadmap ownership | PR and branch | Commits behind current main | CI state | Environment dependency | Merge readiness | Exact next action |
|---:|---|---|---:|---|---|---|---|
| 1 | `P0-001`, `P0-002`, `P0-007`, `P0-008`; authoritative roadmap, collision control, queue, final go/no-go | PR #289, `docs/beta-controller-story-merge-v1` | 0 | Permanent two-document diff exists; final-head Repository Quality, Supply Chain Security, and Staging Readiness Preflight are required | None for documentation authority | Draft until final-head CI is green | Pass all required workflows on this human-authored head, merge documentation only, then continue live PR-state monitoring |
| 2 | `OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, `OPS-ARTIFACT-002`; infrastructure for `BETA-PLAYER-010` and `BETA-ADMIN-007` | PR #280, `agent/isolated-staging-release-v1`, head `a6e26347947cd61c200ad2492e327587daf902eb` | 7 | Repository, release, supply-chain, preflight, incident, and Admin checks passed on the stale head; Database Replay was running at audit | Distinct synthetic Supabase project, separate frontend staging target, environment-neutral runtime configuration, protected reviewers/secrets, deployment adapters, connected smoke, rollback and promotion evidence | Not merge-ready; branch is stale and connected staging does not exist | Merge current `main` into the existing branch without replacement, resolve only owned-file conflicts, make a permanent final commit, rerun every required workflow, and retain draft status until controller review |
| 3 | `OPS-STAGE-001`, `OPS-STAGE-002`, `OPS-STAGE-003`; isolated evidence for `BETA-BANK-004` | PR #282, `agent/live-migration-reconciliation-v1`, head `e93267b93af62a7b143b7d5078fd2bff80d6136f` | 7 | Repository Quality, Supply Chain Security, and Staging Readiness Preflight passed on the stale head | Chat 2 isolated database; clean replay; canonical live/isolated schema comparison; Auth and Edge Function metadata; isolated retry/rollback evidence | Not merge-ready; stale and externally blocked | Synchronize the existing branch with current `main`, rerun complete final-head CI, then execute only read-only live comparison and isolated-staging replay/retry evidence |
| 4 | `OPS-STAGE-004`, `OPS-STAGE-005`; legacy runtime and credential retirement | PR #283, `agent/legacy-runtime-retirement-v1`, head `58d3a261254e1c9f3cb804ab94e498c21d8b1259` | 7 | Repository, Database Replay, supply-chain, preflight, incident, Admin, and legacy audit passed on the stale head | Approved read-only production and Cloudflare evidence; consumer attribution; credential rotation authority; observation windows; disable/delete approval and rollback owner | Not merge-ready; stale and live retirement remains approval-blocked | Keep outside the merge queue, synchronize the existing branch with current `main`, rerun final-head CI, then collect approval-gated evidence without changing production |
| 5 | `BETA-AUTH-005`, `BETA-AUTH-006`, `OPS-RATE-001`, `OPS-ACCESS-001` | PR #284, `agent/beta-security-rate-limit-v1`, head `a3fc83190fd7eea6af34831dc23a610df421526c` | 1 | No workflow runs exist on the actual current PR head; prior PR text references a different head and is not authoritative | Isolated migration deployment; SQL concurrency; proxy overwrite/strip; shared-NAT/brute-force; scanner burst/outage; privacy leak scan; staff Auth/MFA/recovery/revocation evidence | Rejected from merge queue until synchronized and fully green | Synchronize with current `main`, review collision with merged story rate-limit/capability files, publish one permanent final head, and rerun the complete affected Backend, database, Player, Admin, privacy, and repository matrix |
| 6 | `OPS-OBS-001`, `OPS-OBS-002`, `OPS-PERF-001`, `OPS-PERF-002` | PR #287, `agent/beta-observability-performance-v1`, head `d94185a7ee964c85ea2cd7634eb4741cfba0537a` | 7 | Observability, Backend, Database Replay, Repository Quality, supply-chain, preflight, incident, timezone, exchange, and Admin checks passed on the stale head | Shared-dispatch integration after Chat 5; isolated runtime events; protected dashboards/alerts; bounded 30/40-player load; post-load query-plan/index review | Not merge-ready; stale and operational evidence absent | Synchronize the existing branch with current `main`, rerun final-head CI, preserve the no-index-without-load decision, and wait for Chat 5 plus isolated staging before runtime/load execution |
| 7 | `OPS-BACKUP-001`, `OPS-BACKUP-002`, `OPS-RESTORE-001`, `OPS-RESTORE-002` | PR #285, `agent/beta-backup-restore-v1`, head `7039911d996e9ccc9de2096231c7c6c569ea4d9e` | 7 | Backup/Restore Contract, Database Replay, Repository Quality, supply-chain, preflight, incident, and Admin checks passed on the stale head | Managed backup/PITR evidence; approved distinct restore target; immutable off-platform storage; real encrypted backup; two-phase restore; connected Admin/Player smoke; measured RPO/RTO | Not merge-ready; stale and no restore rehearsal exists | Synchronize the existing branch with current `main`, rerun final-head CI, then execute the guarded rehearsal only against the approved isolated target |
| 8 | `BETA-NOTIF-005`, `BETA-NOTIF-006` | PR #244 merged from `agent/player-story-delivery-v1` as `35462edd60edbb86b0222f38cdb42bb41aac0efe` | 0 | All ten final-head workflows passed on `86f7243a89dc9e02cdd1dd939ccafaa552b06b9d`, including Backend, Database Replay, Player Terminal desktop/mobile, Repository Quality, supply-chain, preflight, runtime cutover, timezone/exchange, and Admin lifecycle | None for the bounded code-integrated story-delivery lifecycle; campaign scheduling, seed activation, and staging playthrough remain separate items | `VERIFIED_COMPLETE` for `BETA-NOTIF-005` and `BETA-NOTIF-006` | Preserve merged implementation; do not reopen or create replacement story-delivery branches; consume it as a dependency for seed and Phase 6 work |
| 9 | Phase 4 bounded executable seed release and `BETA-SEED-001`; campaign and active-content definitions | PR #163, `agent/seed-content-foundation-v1`, head `74bcac12127244f232c563b4b018703b53cab4ff` | 1 | No workflow runs exist on the actual current head | Complete calibration/editorial/map evidence; Backend stable-ID/import authority; idempotent importer/deactivation/rollback; isolated bounded load; Admin/Player cross-surface verification; activation approval | Not merge-ready; large definition branch remains non-activated and current-head CI is absent | Synchronize the existing branch with current `main`, rerun all seed and repository gates, finish the executable bounded pack and staging importer, and activate only after operations evidence is complete |
| 10 | Phase 6 E2E and pilot validation | PR #286, `agent/beta-e2e-pilot-v1`, head `34aafcb79ed7406db73f5500d91ebdacca31e603` | 7 | Beta E2E harness, Database Replay, Repository Quality, supply-chain, preflight, incident, and Admin checks passed on the stale head | Approved immutable isolated release; migrations; security/privacy; restore comparison; observability/load; bounded seed activation; no unresolved P0/P1 defects | Dependency-blocked and stale | Synchronize with current `main`, rerun final-head harness CI, update the dependency manifest to recognize merged story delivery, and execute no scenario until all preceding gates are authoritative |

## Paused expansion queue

| PR | Capability | State | Controller gate |
|---:|---|---|---|
| #248 | Messaging | Open draft | Preserve existing branch; no synchronization, finalizer, merge, or roadmap edit until explicit product-owner reactivation |
| #249 | Marketplace | Open draft | Preserve existing branch; remain outside the beta queue regardless of mergeability or CI |
| #261 | Progression | Open draft | Preserve existing branch; source/planning work is not runtime completion and remains outside the beta queue |

## Migration ownership and collision boundaries

- Merged migration history on `main` is immutable.
- Chat 3 / PR #282 owns migration-history reconciliation and isolated-staging application evidence; only forward corrective migrations are permitted.
- Chat 5 / PR #284 owns its rate-limit hardening migration set, subject to Chat 3 ordering and replay review after synchronization.
- Chat 9 may add the bounded seed importer only on PR #163 after Chat 3 confirms ordering and Chat 2 supplies isolated release controls.
- Paused PRs #248 and #249 retain their migration ownership but may not advance while paused.
- No chat may apply manual production SQL.

## Priority-ordered merge and evidence queue

1. Merge and reconcile PR #244 — **completed** as `35462edd60edbb86b0222f38cdb42bb41aac0efe`.
2. Synchronize PRs #280, #282, #283, #284, #285, #286, #287, and PR #163 with current `main`; require permanent final heads and complete CI.
3. Establish the distinct isolated staging environment and immutable release boundary.
4. Run migration reconciliation, `BETA-BANK-004`, rate-limit, privacy, access, and legacy-runtime evidence.
5. Run encrypted backup, restore, connected smoke, observability, alerts, bounded load, and post-load query-plan evidence.
6. Complete, import, verify, and explicitly authorize the bounded executable seed pack.
7. Execute the continuous 52-checkpoint Phase 6 run and controlled pilot evidence.
8. Chat 1 issues the final authoritative roadmap reconciliation and production-beta go/no-go decision.

## Completion-claim decision rule

A capability is complete only when its permanent implementation is merged into `main`, all required final-head workflows pass, migration replay/lint and browser/security/idempotency evidence exist where applicable, and any required connected staging/runtime/restore/load evidence is immutable and reviewable. Otherwise its highest valid status remains `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, or `BLOCKED`.
