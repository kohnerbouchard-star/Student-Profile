# Econovaria Production-Beta Coordination Matrix

**Controller:** Chat 1 — beta program controller and merge gatekeeper  
**Controller PR:** #281 (`docs/beta-program-controller-v1`, draft)  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Complete branch inventory:** `docs/operations/econovaria-remote-branch-inventory-v1.md`  
**Audited main:** `f44b0735763da6700fc18513fa7026dbd95aff86`  
**Audit date:** 2026-07-20  
**Production deployment authorized:** No

The branch inventory is a dated divergence snapshot. For concurrently moving workstreams, the current GitHub PR head, diff, and workflow state are the source of truth. PRs #282 through #286 were opened after the generated inventory and supersede its earlier “no PR” disposition for those assigned branches.

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

| Roadmap item / capability | Chat | Branch / PR | Owned scope | Prohibited scope | Latest controller finding | Merge readiness | Next exact action |
|---|---:|---|---|---|---|---|---|
| `P0-001`, `P0-002`, `P0-007`, `P0-008`; roadmap, coordination, queue, final reconciliation | 1 | `docs/beta-program-controller-v1`; PR #281 | Authoritative roadmap; coordination matrix; remote-branch inventory; bounded controller evidence | Application source, runtime routes, migrations, credentials, environments, deployment | Permanent three-document diff; all temporary applicators removed | Not ready until this final human-authored head passes every required workflow | Keep draft, obtain green Repository Quality, Supply Chain Security, and Staging Readiness Preflight, then merge documentation only |
| Release platform for `OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, `OPS-ARTIFACT-002`, `BETA-PLAYER-010`, `BETA-ADMIN-007` evidence | 2 | `agent/isolated-staging-release-v1`; PR #280 | Release manifests, immutable artifacts, promotion/rollback guards, environment templates, runbooks, focused workflows/tests | Roadmap, application behavior, seed/story files, migrations, production deployment | An earlier 22-file head passed all checks, but the branch advanced to a larger head during review and was returned to draft; new final-head CI is pending | Not ready; prior green evidence cannot authorize the moved head | Stabilize the branch, audit the permanent final diff, pass all required final-head workflows, then merge tooling only; staging identities/deployment/smoke/rollback/restore remain open |
| Migration-history reconciliation and isolated-staging migration application | 3 | `agent/live-migration-reconciliation-v1`; PR #282 | Read-only migration inventory, schema comparison, redacted metadata export, replay/lint and staging-only evidence | Roadmap, rewritten migrations, manual production SQL, production schema changes, unrelated features | Read-only findings record 53 live identities, 66 repository identities, 13 repository-only identities, no live-only identity, and no live mutation; branch continued after its first green head | Tooling/evidence may be reviewable only after the final head stabilizes; roadmap completion is not ready | Re-audit final diff/CI, run clean replay, compare live and isolated schemas, reconcile function artifacts, and execute the isolated `BETA-BANK-004` retry probe |
| Live legacy-runtime and Cloudflare Worker retirement | 4 | `agent/legacy-runtime-retirement-v1`; PR #283 | Route/runtime inventory, traffic/auth probes, credential-rotation/shutdown/rollback controls | Roadmap, restored legacy source, unrelated runtime work, unapproved production shutdown | Preparatory inventory and tooling identify unresolved `server`, `admin-api-staging`, `make-server-0dbf686f`, former Cloudflare Worker, and disappeared-function evidence gaps; no live change occurred | Preparatory tooling may merge only after stable green final-head review; live retirement remains incomplete | Complete final CI and controller review; obtain approved traffic, Cloudflare, auth, credential rotation, disablement, observation, and rollback evidence |
| `BETA-AUTH-005`, `BETA-AUTH-006`, `OPS-RATE-001`, `OPS-ACCESS-001` | 5 | `agent/beta-security-rate-limit-v1`; PR #284 | Rate-limit keying/policy, proxy controls, attendance abuse integration, access policy, tests, forward migration and staging probes | Roadmap, expansion features, seed/story work, production config/schema mutation | Substantial bounded security tranche exists, but the branch is still moving and an audited head had multiple cancelled required workflows | Rejected until one stable final head passes the complete affected workflow matrix | Stabilize branch, rerun Backend/Database Replay/security/Player/Admin/repository gates, review migration ordering with Chat 3, then collect proxy/HMAC/concurrency/NAT/privacy/access staging evidence |
| Phase 5 observability, SLOs, performance budgets, redacted error capture | 6 | `agent/beta-observability-performance-v1`; no PR; equals audited `main` | Telemetry contracts, redaction, SLO/error-budget definitions, performance tests and staging evidence | Roadmap, feature expansion, student-data logging, production deployment | No implementation and no CI | Not started | Define bounded redacted metrics and performance budgets; commit only to the existing branch and open one draft PR |
| Backup, restore, rollback rehearsal, RPO/RTO | 7 | `agent/beta-backup-restore-v1`; PR #285 | Backup/restore runbooks, retention/manifest contracts, synthetic isolated rehearsal and evidence | Roadmap, production restore, manual production schema changes, application features | Runbooks, templates, and contract workflow exist; no approved distinct target or executed restore evidence exists | Not ready | Stabilize final diff and CI, review/complete referenced automation, execute against a distinct synthetic target, and record integrity, connected Admin/Player smoke, RPO, and RTO evidence |
| `BETA-NOTIF-005`, `BETA-NOTIF-006`; Player story cutscene/purpose-built delivery | 8 | `agent/player-story-delivery-v1`; PR #244 | Bounded story-delivery Backend/Player implementation and tests | Roadmap, PR #163 campaign definitions, generic raw payload rendering, runner scheduling, redesign | Branch is synchronized with main, but its permanent diff still consists of temporary patch carriers and visible final-head workflows require action | Rejected | Materialize actual source, remove carriers/finalizers, make a human-authored final commit, and pass all required checks |
| Phase 4 bounded executable seed release and `BETA-SEED-001` | 9 | `agent/seed-content-foundation-v1`; PR #163 | `docs/seed-content/**`, generators, validators, simulations, bounded importer/rollback/staging evidence | Roadmap, PR #244 runtime delivery, production activation/deployment, unrelated features | 407 commits ahead and 132 behind audited main, non-mergeable, non-executable, and no current-head workflow evidence found | Rejected | Synchronize the existing branch, close calibration/map gates, add idempotent importer/rollback, and prove a bounded isolated-staging load |
| Phase 6 complete E2E sequence and pilot | 10 | `agent/beta-e2e-pilot-v1`; PR #286 | 52-scenario orchestration, synthetic fixtures, defect/evidence contracts, pilot controls/results | Roadmap, feature implementation, production deployment, manual production data/schema changes | Harness/preflight work exists and correctly records `BLOCKED_BY_ENVIRONMENT`; no scenario is complete | Dependency-blocked even if harness CI passes | Stabilize final diff/CI; execute only after release, migration, security, story, seed, observability, and restore dependencies are merged and deployed to isolated staging |

## Open pull-request gate status

| PR | Capability | Queue | Current gate decision |
|---:|---|---|---|
| #281 | Controller documents | Independent coordination/evidence | Draft; merge only after permanent final-head green CI |
| #280 | Immutable release tooling | Independent beta tooling | Returned to draft after head moved; re-audit new final diff and workflows |
| #282 | Migration reconciliation tooling/evidence | Release foundation | Open; final-head review required; connected migration evidence remains open |
| #283 | Legacy-retirement preparation | Release foundation | Preparatory merge only after stable green CI; live retirement remains approval/evidence blocked |
| #284 | Security/rate limits/access | Security foundation | Draft and rejected until stable complete green CI plus migration/staging review |
| #285 | Backup/restore controls | Recovery foundation | Hold until stable green CI and reviewed automation; rehearsal evidence remains open |
| #286 | Final E2E harness | Final evidence | Keep draft and dependency-blocked |
| #256 | Dependabot artifact action | Independent tooling | Reject; stale and required Admin workflows fail |
| #244 | Story delivery | Beta capability | Reject; patch carriers remain and final-head workflows require action |
| #163 | Seed release | Beta capability | Reject; stale, non-mergeable, non-executable, and lacks current-head CI/staging evidence |
| #248 | Messaging | Paused expansion | Draft, preserved, and excluded from beta queue |
| #249 | Marketplace | Paused expansion | Preserved and excluded; required workflows fail |
| #261 | Progression | Paused expansion | Preserved and excluded; planning/source snapshot is not runtime evidence |

## Migration ownership and collision boundaries

- Merged migration history on `main` is immutable.
- Chat 3 / PR #282 owns migration-history reconciliation and isolated-staging application evidence; only forward corrections are permitted.
- Chat 5 / PR #284 owns its forward rate-limit/telemetry migration set, subject to Chat 3 ordering/replay review.
- Paused PR #248 owns `20260720123000_add_messaging_communication_v1.sql`.
- Paused PR #249 owns `20260720042500_add_marketplace_reference_scopes_v1.sql`, `20260720043000_add_player_marketplace_lifecycle_v1.sql`, and `20260720044500_fix_marketplace_order_settlement_state_v1.sql`.
- Chat 9 may add a bounded seed importer migration only on PR #163 after Chat 3 confirms ordering and Chat 2 supplies isolated release controls.
- No chat may apply manual production SQL.

## Merge sequence

1. PR #281 controller evidence after complete green final-head CI.
2. Stable independent tooling/evidence boundaries from PRs #280 and #282; PR #256 only after refresh and full green CI.
3. Security and release foundations: PRs #284, #283, #285, and a future Chat 6 observability PR, in dependency-safe order and only at their reviewed repository boundaries.
4. PR #244 after permanent implementation materialization and green CI.
5. PR #163 after synchronization, executable import/rollback, calibration/map closure, and isolated-staging evidence.
6. PR #286 execution against the approved immutable isolated-staging release.
7. Chat 1 final authoritative roadmap completion reconciliation.

## Completion-claim decision rule

Chat 1 accepts completion only when the capability is merged into `main`, all required final-head workflows pass, migrations replay/lint where applicable, required browser/security/idempotency evidence exists, and required staging/runtime/release evidence is immutable and reviewable. Otherwise the highest permitted status is `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, or `BLOCKED`.
