# Econovaria Production-Beta Coordination Matrix

**Controller:** Chat 1 — beta program controller and merge gatekeeper  
**Controller PR:** #281 (`docs/beta-program-controller-v1`, draft)  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Complete branch inventory:** `docs/operations/econovaria-remote-branch-inventory-v1.md`  
**Audited main:** `f44b0735763da6700fc18513fa7026dbd95aff86`  
**Audit date:** 2026-07-20  
**Production deployment authorized:** No

## Control rules

1. Chat 1 exclusively owns the authoritative roadmap, this coordination matrix, collision prevention, merge sequencing, and final completion reconciliation.
2. No workstream may edit the authoritative roadmap. Completion claims require merged code, passing final-head workflows, and required staging/runtime evidence.
3. One capability has one existing branch and one PR authority. Replacement branches are prohibited.
4. No production deployment, production credential change, manual production SQL, or manual production schema mutation is authorized.
5. A failing, missing, cancelled, `action_required`, queued, or running required workflow blocks merge.
6. Repository tooling is not staging evidence. An undeployed migration is not runtime evidence. A source snapshot is not implementation evidence.
7. PRs #248, #249, and #261 are product-owner-paused expansion work. They remain open and preserved but are excluded from the beta merge queue until explicit reactivation.
8. No chat may silently expand beyond the owned files and roadmap items below.

## Ten-workstream matrix

| Roadmap item / capability | Chat | Branch / PR | Owned scope | Prohibited scope | CI state at reconciliation | Merge readiness | Blocker / next exact action |
|---|---:|---|---|---|---|---|---|
| `P0-001`, `P0-002`, `P0-007`, `P0-008`; roadmap, coordination, queue, final reconciliation | 1 | `docs/beta-program-controller-v1`; PR #281 | Authoritative roadmap; coordination matrix; remote-branch inventory; bounded controller evidence | Application source, runtime routes, migrations, credentials, environments, deployment | Three-document permanent diff; final-head workflows must rerun after this reconciliation | Not ready until all final-head required checks pass | Keep draft; obtain green Repository Quality, Supply Chain Security, and Staging Readiness Preflight; merge documentation only |
| Release platform for `OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, `OPS-ARTIFACT-002`, `BETA-PLAYER-010`, `BETA-ADMIN-007` evidence | 2 | `agent/isolated-staging-release-v1`; PR #280; head `849f320064c3ede18e3a5e3a5b81d9741c3ec020` | Release manifests, immutable artifacts, promotion/rollback guards, environment templates, runbooks, focused workflows/tests | Roadmap, application behavior, seed/story files, migrations, production deployment | Release Build, Promote, Database Replay, Repository Quality, supply-chain, staging preflight, and incident checks pass; Admin lifecycle was still running | Hold until every final-head required check completes; tooling merge would not complete staging | Finish CI and controller review; distinct staging identities, deployment, connected smoke, approval, rollback, and restore evidence remain open |
| Migration-history reconciliation and isolated-staging migration application | 3 | `agent/live-migration-reconciliation-v1`; PR #282; head `6349747548066a8a36c00bae75737ec2fd290b54` | Read-only migration inventory, schema comparison, redacted metadata export, replay/lint and staging-only evidence | Roadmap, rewritten migrations, manual production SQL, production schema changes, unrelated features | Repository Quality, Supply Chain Security, and Staging Readiness Preflight pass | Tooling may be reviewable; roadmap completion is not ready | Review seven-file read-only tranche; provide clean replay, migration digest/head, isolated-staging application and `BETA-BANK-004` retry evidence |
| Live legacy-runtime and Cloudflare Worker retirement | 4 | `agent/legacy-runtime-retirement-v1`; PR #283; head `de0463170547593d506fc64af24155c6d105d795` | Route inventory/allowlist, traffic and auth probes, credential-rotation/shutdown/rollback evidence | Roadmap, restored legacy source, unrelated runtime work, unapproved production shutdown | Supply Chain Security passes; Repository Quality queued and retirement audit running | Not ready | Complete CI; obtain current traffic, connected auth, credential rotation, owner-approved shutdown window, and rollback evidence without changing production |
| `BETA-AUTH-005`, `BETA-AUTH-006`, `OPS-RATE-001`; shared rate limits and abuse controls | 5 | `agent/beta-security-rate-limit-v1`; PR #284; head `5c22a4025b302d214fdc6fdbb39b88ea9841273a` | Rate-limit keying/policy, attendance abuse integration, focused tests, forward migration `20260720150000_harden_request_rate_limit_operations_v2.sql`, staging probes | Roadmap, expansion features, seed/story work, production config/schema mutation | Admin API passes; Database Replay, Repository Quality, timezone, supply-chain, lifecycle, and exchange workflows were cancelled; Backend and preflight queued | Rejected until a clean final-head run passes | Stabilize branch activity, rerun every required workflow, review migration ordering with Chat 3, then collect proxy/HMAC/concurrency/NAT/privacy staging evidence |
| Phase 5 observability, SLOs, performance budgets, redacted error capture | 6 | `agent/beta-observability-performance-v1`; no PR; equals audited `main` | Telemetry contracts, redaction, SLO/error-budget definitions, performance tests and staging evidence | Roadmap, feature expansion, student-data logging, production deployment | No implementation and no CI | Not started | Define bounded redacted metrics and performance budgets; commit only to the existing branch and open one draft PR |
| Backup, restore, rollback rehearsal, RPO/RTO | 7 | `agent/beta-backup-restore-v1`; PR #285; head `77c26c354ccf2f88a83591cb53d14138badc4dc4` | Backup/restore runbooks, retention/manifest contracts, synthetic isolated rehearsal and evidence | Roadmap, production restore, manual production schema changes, application features | Backup/Restore Contract and Repository Quality running; preflight and supply-chain queued | Not ready | Complete CI; add/review referenced automation; execute against a distinct synthetic target and record integrity, connected Admin/Player smoke, RPO, and RTO evidence |
| `BETA-NOTIF-005`, `BETA-NOTIF-006`; Player story cutscene/purpose-built delivery | 8 | `agent/player-story-delivery-v1`; PR #244; head `b1894660a33f77d3f8fb8452c24910c9520bdf08` | Bounded story-delivery Backend/Player implementation and tests | Roadmap, PR #163 campaign definitions, generic raw payload rendering, runner scheduling, redesign | Branch is synchronized with main, but all visible final-head workflows are `action_required` | Rejected | Permanent PR diff still consists of temporary patch carriers; materialize actual source, remove carriers, make a human-authored final commit, and pass all checks |
| Phase 4 bounded executable seed release and `BETA-SEED-001` | 9 | `agent/seed-content-foundation-v1`; PR #163; head `ad73fbe23dffd8556e58f363b6dd833daa93cd74` | `docs/seed-content/**`, generators, validators, simulations, bounded importer/rollback/staging evidence | Roadmap, PR #244 runtime delivery, production activation/deployment, unrelated features | No current-head workflow evidence found | Rejected | Branch is 407 ahead/132 behind and non-mergeable; synchronize existing branch, close calibration/map gates, add idempotent importer/rollback, and prove a bounded staging load |
| Phase 6 complete E2E sequence and pilot | 10 | `agent/beta-e2e-pilot-v1`; PR #286; head `36c4fec92059def11902d1373c8253c290d21c42` | 52-scenario orchestration, synthetic fixtures, defect/evidence contracts, pilot controls/results | Roadmap, feature implementation, production deployment, manual production data/schema changes | Staging preflight passes; Database Replay, Repository Quality, incident, lifecycle, supply-chain, and Beta E2E workflows were running/queued | Dependency-blocked even if harness CI passes | Keep draft; do not record scenario completion until release, migration, security, story, seed, observability, and restore dependencies are merged and deployed to isolated staging |

## Open pull-request gate status

| PR | Capability | Queue | Current gate decision |
|---:|---|---|---|
| #281 | Controller documents | Independent coordination/evidence | Draft; merge only after permanent final-head green CI |
| #280 | Immutable release tooling | Independent beta tooling | Candidate only after every final-head check completes; merge does not prove staging |
| #282 | Migration reconciliation tooling | Release foundation | Green visible repository checks; require controller diff review; no completion claim without connected evidence |
| #283 | Legacy-retirement audit | Release foundation | Hold while CI runs and live evidence is absent |
| #284 | Security/rate limits | Security foundation | Reject while required workflows are cancelled/missing and migration/staging review remains open |
| #285 | Backup/restore controls | Recovery foundation | Hold while CI runs and automation/rehearsal evidence is absent |
| #286 | Final E2E harness | Final evidence | Keep draft and dependency-blocked |
| #256 | Dependabot artifact action | Independent tooling | Reject; stale and required Admin workflows fail |
| #244 | Story delivery | Beta capability | Reject; patch carriers remain and final-head workflows require action |
| #163 | Seed release | Beta capability | Reject; stale, non-mergeable, non-executable, and lacks current-head CI/staging evidence |
| #248 | Messaging | Paused expansion | Draft, preserved, and excluded from beta queue |
| #249 | Marketplace | Paused expansion | Preserved and excluded; four required workflows fail |
| #261 | Progression | Paused expansion | Preserved and excluded; planning/source snapshot is not runtime evidence |

## Migration ownership and collision boundaries

- Merged migration history on `main` is immutable.
- Chat 3 / PR #282 owns migration-history reconciliation and isolated-staging application evidence; only forward corrections are permitted.
- Chat 5 / PR #284 owns `20260720150000_harden_request_rate_limit_operations_v2.sql`, subject to Chat 3 ordering/replay review.
- Paused PR #248 owns `20260720123000_add_messaging_communication_v1.sql`.
- Paused PR #249 owns `20260720042500_add_marketplace_reference_scopes_v1.sql`, `20260720043000_add_player_marketplace_lifecycle_v1.sql`, and `20260720044500_fix_marketplace_order_settlement_state_v1.sql`.
- Chat 9 may add a bounded seed importer migration only on PR #163 after Chat 3 confirms ordering and Chat 2 supplies isolated release controls.
- No chat may apply manual production SQL.

## Merge sequence

1. Controller/evidence and independent tooling with complete green CI: PR #281, then eligible portions of PRs #280 and #282; PR #256 only after refresh and full green CI.
2. Security and release foundations: PRs #284, #283, #285, and a future Chat 6 observability PR, in dependency-safe order and only at their repository-tooling boundaries.
3. PR #244 after permanent implementation materialization and green CI.
4. PR #163 after synchronization, executable import/rollback, calibration/map closure, and isolated-staging evidence.
5. PR #286 execution against the approved immutable isolated-staging release.
6. Chat 1 final authoritative roadmap completion reconciliation.

## Completion-claim decision rule

Chat 1 accepts completion only when the capability is merged into `main`, all required final-head workflows pass, migrations replay/lint where applicable, required browser/security/idempotency evidence exists, and required staging/runtime/release evidence is immutable and reviewable. Otherwise the highest permitted status is `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, or `BLOCKED`.
