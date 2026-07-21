# Econovaria Production-Beta Coordination Matrix

**Controller:** Chat 1 — beta program controller and merge gatekeeper  
**Controller authority:** PR #281 merged as `7bbd08e19641146282b58023a0a911c90f6a148b`  
**Current controller reconciliation:** branch `agent/beta-controller-reconciliation-v2`  
**Current authoritative main:** `990a56fa0e25c5e43cc1b6248184ba9b0cc62c99`  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Audit date:** 2026-07-21  
**Production deployment authorized:** No

Current GitHub PR heads, permanent diffs, divergence from `990a56fa0e25c5e43cc1b6248184ba9b0cc62c99`, final-head workflows, and connected synthetic-staging evidence are the queue source of truth. Repository tooling and contract tests are not equivalent to connected deployment, restore, load, or pilot acceptance.

## Control rules

1. Chat 1 exclusively owns the authoritative roadmap, this matrix, collision prevention, merge sequencing, and final completion reconciliation.
2. No workstream may edit the authoritative roadmap or self-certify final completion.
3. One capability has one existing branch and one PR authority. Replacement branches and overlapping donor merges are prohibited.
4. No production deployment, production credential change, manual production SQL, or manual production schema mutation is authorized.
5. Every active PR must contain current `main` and pass all required workflows on its permanent final head before merge.
6. A repository tranche may merge while connected evidence remains `IN_PROGRESS`, but the related roadmap capability may not be marked `VERIFIED_COMPLETE` until its runtime acceptance evidence exists.
7. PRs #248 and #261 remain product-owner-paused expansion work. Marketplace PR #249 was closed unmerged and reset; Marketplace remains paused and may not be recreated or reactivated without explicit owner direction.
8. No write-enabled finalizer, `pull_request_target`, push-triggered synchronizer, or direct-`main` helper may bypass the controller queue.
9. Synthetic staging is `ECON SIM STAGING` (`eecvbssdvarfcykcfrny`, `ap-northeast-2`). Production guard is `ECON SIM` (`cgiukdjwicykrmtkhudh`). These identities must never be interchanged.

## Current ten-workstream queue

| Chat | Roadmap ownership | Repository authority | Current state | Connected dependency | Merge/readiness state | Exact next action |
|---:|---|---|---|---|---|---|
| 1 | `P0-001`, `P0-002`, `P0-007`, `P0-008`; roadmap, collision control, queue, go/no-go | `agent/beta-controller-reconciliation-v2` from main `990a56fa…` | Roadmap and matrix reconciliation in progress | Current PR and staging evidence from all workstreams | Documentation PR not yet opened | Finish roadmap reconciliation, open one controller-only PR, pass final-head documentation gates, merge, and continue queue control |
| 2 | `OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, `OPS-ARTIFACT-002` | PR #280 merged as `93155e96d56323a33f723152d9fd979cea07a8c5`; environment-neutral browser PR #290 merged as `60a21adfd03ce28b6e9dc0ed25454929cd6fd97b` | Immutable build/promote tooling is authoritative; retained release from `93155e96…` exists | Exact-artifact Edge/frontend staging deployment, staging environment/reviewer evidence, smoke, rollback | Repository tranche complete; connected deployment incomplete | Synchronize active integration PR #295, build an immutable release from current merged main, deploy only to synthetic staging, and capture exact-artifact smoke/rollback evidence |
| 3 | `OPS-STAGE-001`, `OPS-STAGE-002`, `OPS-STAGE-003`; staging portion of `BETA-BANK-004` | PR #282 merged as `bcf176f152c563f562cd8365a89925edb11d57d9` | Canonical replay and ledger reconciliation complete; staging ledger now has 73 versions after security migrations | Preserve schema/ledger evidence and support later restore comparison | Repository and isolated migration reconciliation complete | Do not modify production; include the 73-version staging head in release, restore, and E2E evidence |
| 4 | `OPS-STAGE-004`, `OPS-STAGE-005` | PR #283 merged as `0c3996f31dacbff74854402cbc708644ae2a784a` | Retirement inventory, evidence contracts, and observation controls authoritative | Provider traffic, Cloudflare evidence, credential ownership, approval, 14/7/30-day windows | Repository tranche complete; live retirement approval-blocked | Collect bounded read-only evidence and ownership records; perform no disablement, deletion, rotation, or JWT change without approval |
| 5 | `BETA-AUTH-005`, `BETA-AUTH-006`, `OPS-RATE-001`, `OPS-ACCESS-001` | PR #284 merged as `990a56fa0e25c5e43cc1b6248184ba9b0cc62c99` from head `7608e30b…` | All 17 final-head workflows passed; two forward migrations applied to staging; bounded SQL acceptance passed 10 allowed/30 denied for both limiter paths | Edge deployment, trusted-ingress spoof proof, true concurrent HTTP/SQL, scanner burst, outage rollback, retained-evidence privacy, staff Auth/MFA review | Repository and staging-database contract complete; connected Edge/security acceptance incomplete | Execute remaining staging-only Edge, ingress, outage, concurrency, scanner, and privacy evidence through PR #295; keep production unchanged |
| 6 | `OPS-OBS-001`, `OPS-OBS-002`, `OPS-PERF-001`, `OPS-PERF-002` | PR #287 merged as `2d1bc94591df3e82055c4fcd21ee80a48771293e` | Event schema, 13 panels, 12 alerts, and 30/40-player load contract authoritative | Deployed staging runtime, real Admin/Player events, protected dashboards, load execution, post-load query plans | Repository tranche complete; runtime/load evidence absent | Activate telemetry in staging, verify privacy, execute 30/40-player profiles, capture p50/p95/failure/database/cold-start metrics, then review plans before indexes |
| 7 | `OPS-BACKUP-001`, `OPS-BACKUP-002`, `OPS-RESTORE-001`, `OPS-RESTORE-002` | PR #285 merged as `4de8bce73eb90872cf4cc066dac3967f63e52dbb` | Fail-closed backup/restore contract authoritative | Encrypted backup, immutable off-platform custody, distinct restore target, exact runtime reconstruction, smoke, measured RPO/RTO | Repository tranche complete; restore rehearsal absent | Execute one guarded encrypted backup and isolated restore; compare integrity and migration head; capture Admin/Player smoke and measured RPO/RTO |
| 8 | `BETA-NOTIF-005`, `BETA-NOTIF-006` | PR #244 merged as `35462edd60edbb86b0222f38cdb42bb41aac0efe` | Story-delivery lifecycle verified and authoritative | Consumed by campaign/world and E2E work | `VERIFIED_COMPLETE` for bounded story delivery | Preserve implementation and consume through stable interfaces; do not create replacement story-delivery branches |
| 9 | Phase 4 bounded executable seed release and `BETA-SEED-001` | PR #163, `agent/seed-content-foundation-v1`; currently contains main and is 480 commits ahead | Draft; 391-file content/importer tranche; repository claims exist but connected staging import/rollback/Admin/Player evidence is absent and PR text is stale | Scoped staging game, activation authorization, importer execution, replay, deactivation, rollback, Admin/Player verification; runtime consumer PR #294 | Not merge-ready | Audit zero-byte/generated evidence anomalies, rerun exact-head seed and repository CI, execute bounded staging import/replay/deactivation/rollback, verify surfaces, then controller review |
| 10 | Phase 6 E2E and pilot validation | PR #286 merged as `0ee9e121c3d556b2b3e4c1fa89e860a3a913a618` | Immutable 52-scenario catalog and evidence contract authoritative; no connected continuous run completed | Exact deployed release, migrations, security, restore, observability/load, seed activation, world runtime #294 | Repository contract complete; pilot dependency-blocked | Run all 52 scenarios continuously only after #163, #294, #295, restore, security, and load gates close; retain JSON, screenshots, JUnit, hashes, release identity, and defects |

## Active cross-workstream authorities

| PR | Branch | Ownership | Divergence/readiness | Exact next action |
|---:|---|---|---|---|
| #294 | `agent/story-arrival-world-runtime-v1` | `BETA-STORY-001..013`, `EXP-CLASS-001..011`, `EXP-GEO-001..009`, minimal onboarding runtime | 21 commits ahead and 62 behind current main; draft and nonmergeable | Synchronize the existing branch with main, reconcile security/package/migration collisions, complete runtime and UI integration, pass replay/browser/simulation gates, then stage playthrough |
| #295 | `agent/production-integration-gate-v1` | Combined connected staging and final evidence chain | 6 commits ahead and 62 behind current main; draft and nonmergeable; blocker record predates #284 merge | Synchronize existing branch, update staging ledger/security evidence, rerun final-head CI, then coordinate deployment/restore/load/seed/world/E2E evidence without production changes |

## Paused and maintenance queue

| PR | Capability | State | Controller disposition |
|---:|---|---|---|
| #248 | Messaging | Open draft, product-owner-paused | Preserve existing branch; no synchronization, merge, finalizer, or roadmap advancement until explicit reactivation |
| #249 | Marketplace | Closed unmerged; branch reset to main | Capability remains paused; do not create a replacement PR or claim removal without product-owner direction |
| #261 | Progression | Open draft, product-owner-paused | Preserve existing branch; planning/source work is not runtime completion and remains outside the beta queue |
| #256 | `actions/upload-artifact` v4→v7 | Stale Dependabot PR; recreation requested on 2026-07-21 | Do not merge stale head; review only a recreated current-main head with full CI |

## Migration and environment boundaries

- Merged migration history on `main` is immutable; only forward corrections are permitted.
- Staging records 73 migration versions through `20260721003228_repair_request_rate_limit_jsonb_object_length_v1`.
- Production remains at its previously audited ledger and was not modified by the security or controller work.
- PR #294 owns its proposed world-runtime migration and must synchronize after security migrations before replay or staging application.
- PR #163 may import only the bounded approved seed pack into synthetic staging with exact project/game/authorization guards.
- No chat may apply manual production SQL or use production as a staging target.

## Priority-ordered merge and evidence queue

1. Merge this controller reconciliation after final-head documentation CI.
2. Synchronize active PRs #294 and #295 with current main; rerun exact-head CI.
3. Audit PR #163’s large generated/evidence surface, then execute bounded staging import, replay, deactivation, rollback, and cross-surface verification.
4. Build and promote one immutable current-main artifact set to synthetic staging; deploy exact Edge/frontend artifacts and retain smoke/rollback evidence.
5. Execute remaining security ingress/outage/privacy evidence and the encrypted backup/restore rehearsal.
6. Activate observability/alerts and run 30/40-player load plus post-load query-plan review.
7. Complete and merge world runtime #294 after replay, browser, simulation, and staging playthrough evidence.
8. Execute the continuous 52-scenario run and controlled pilot evidence.
9. Chat 1 issues the final authoritative roadmap reconciliation and production-beta go/no-go decision. Production promotion requires a separate explicit owner authorization.

## Completion-claim decision rule

A capability is complete only when its permanent implementation is merged into `main`, all required final-head workflows pass, migration replay/lint and browser/security/idempotency evidence exist where applicable, and required connected staging/runtime/restore/load evidence is immutable and reviewable. Otherwise its highest valid status remains `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, or `BLOCKED`.
