# Econovaria Production-Beta Coordination Matrix

**Controller:** Chat 1 — beta program controller and merge gatekeeper  
**Controller authority:** PR #281 merged as `7bbd08e19641146282b58023a0a911c90f6a148b`  
**Containment reconciliation:** PR #288 merged as `b047e322b18225d8a4136acc76e92da15bdbff1e`  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Complete branch inventory:** `docs/operations/econovaria-remote-branch-inventory-v1.md`  
**Controller evidence reconciled through:** `b047e322b18225d8a4136acc76e92da15bdbff1e`  
**Audit date:** 2026-07-20  
**Production deployment authorized:** No

The branch inventory is a dated divergence snapshot. For concurrently moving workstreams, the current GitHub PR head, diff, and workflow state are the source of truth. PRs #282 through #287 were opened after the generated inventory and supersede its earlier “no PR” disposition for those assigned branches.

## Control rules

1. Chat 1 exclusively owns the authoritative roadmap, this coordination matrix, collision prevention, merge sequencing, and final completion reconciliation.
2. No workstream may edit the authoritative roadmap. Completion claims require merged code, passing final-head workflows, and required staging/runtime evidence.
3. One capability has one existing branch and one PR authority. Replacement branches are prohibited.
4. No production deployment, production credential change, manual production SQL, or manual production schema mutation is authorized.
5. A failing, missing, cancelled, `action_required`, queued, or running required workflow blocks merge.
6. Repository tooling is not staging evidence. An undeployed migration is not runtime evidence. A source snapshot is not implementation evidence.
7. PRs #248, #249, and #261 are product-owner-paused expansion work. They remain open and preserved but are excluded from the beta merge queue until explicit reactivation.
8. No chat may silently expand beyond the owned files and roadmap items below.
9. No workstream may add a write-enabled `pull_request_target`, `push`-triggered finalizer, or direct-`main` helper to advance a paused PR or bypass the controller merge queue.

## Ten-workstream matrix

| Roadmap item / capability | Chat | Branch / PR | Owned scope | Prohibited scope | Latest controller finding | Merge readiness | Next exact action |
|---|---:|---|---|---|---|---|---|
| `P0-001`, `P0-002`, `P0-007`, `P0-008`; roadmap, coordination, queue, final reconciliation | 1 | PR #281 merged as `7bbd08e19641146282b58023a0a911c90f6a148b`; PR #288 merged as `b047e322b18225d8a4136acc76e92da15bdbff1e` | Authoritative roadmap; coordination matrix; remote-branch inventory; bounded controller evidence and emergency collision containment | Application source, runtime routes, migrations, credentials, environments, deployment | Controller authority and the paused-expansion containment record are merged after all required final-head workflows passed. | `VERIFIED_COMPLETE` at the program-control boundary | Continue auditing current PR heads and enforce the dependency-ordered queue; perform final roadmap reconciliation after Phase 6 evidence |
| Release platform for `OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, `OPS-ARTIFACT-002`, `BETA-PLAYER-010`, `BETA-ADMIN-007` evidence | 2 | `agent/isolated-staging-release-v1`; PR #280 | Release manifests, immutable artifacts, promotion/rollback guards, environment templates, runbooks, focused workflows/tests | Roadmap, application behavior, seed/story files, migrations, production deployment | An earlier head passed all checks, but the branch advanced during review and was returned to draft; its current final-head diff and CI are authoritative | Not ready; prior green evidence cannot authorize a moved head | Stabilize the branch, audit the permanent final diff, pass all required final-head workflows, then merge tooling only; staging identities/deployment/smoke/rollback/restore remain open |
| Migration-history reconciliation and isolated-staging migration application | 3 | `agent/live-migration-reconciliation-v1`; PR #282 | Read-only migration inventory, schema comparison, redacted metadata export, replay/lint and staging-only evidence | Roadmap, rewritten migrations, manual production SQL, production schema changes, unrelated features | Read-only findings record 53 live identities, 66 repository identities, 13 repository-only identities, no live-only identity, and no live mutation | Tooling/evidence may be reviewable only after the final head stabilizes; roadmap completion is not ready | Re-audit final diff/CI, run clean replay, compare live and isolated schemas, reconcile function artifacts, and execute the isolated `BETA-BANK-004` retry probe |
| Live legacy-runtime and Cloudflare Worker retirement | 4 | `agent/legacy-runtime-retirement-v1`; PR #283 | Route/runtime inventory, traffic/auth probes, credential-rotation/shutdown/rollback controls | Roadmap, restored legacy source, unrelated runtime work, unapproved production shutdown | Preparatory inventory and tooling identify unresolved runtime and provider evidence gaps; no live change occurred | Preparatory tooling may merge only after stable green final-head review; live retirement remains incomplete | Complete final CI and controller review; obtain approved traffic, Cloudflare, auth, credential rotation, disablement, observation, and rollback evidence |
| `BETA-AUTH-005`, `BETA-AUTH-006`, `OPS-RATE-001`, `OPS-ACCESS-001` | 5 | `agent/beta-security-rate-limit-v1`; PR #284 | Rate-limit keying/policy, proxy controls, attendance abuse integration, access policy, tests, forward migration and staging probes | Roadmap, expansion features, seed/story work, production config/schema mutation | Substantial bounded security tranche exists, but an audited head had multiple cancelled required workflows | Rejected until one stable final head passes the complete affected workflow matrix | Stabilize branch, rerun Backend/Database Replay/security/Player/Admin/repository gates, review migration ordering with Chat 3, then collect proxy/HMAC/concurrency/NAT/privacy/access staging evidence |
| `OPS-OBS-001`, `OPS-OBS-002`, `OPS-PERF-001`, `OPS-PERF-002`; observability and performance | 6 | `agent/beta-observability-performance-v1`; PR #287 | Structured-event/request-observation contracts, dashboard/alert definitions, load profile/runner, query-plan review and evidence | Roadmap, shared dispatcher/session/rate-limit integration, migrations, live runtime configuration, student-data logging | Repository/evidence tranche has green visible CI and intentionally defers runtime integration and load activation | Repository tranche is a tooling/evidence candidate, not operational completion | Controller-review stable final diff; merge only at the repository boundary; later integrate shared dispatch after Chat 5 and prove protected dashboards, runtime events, bounded load, and post-load index decisions in isolated staging |
| Backup, restore, rollback rehearsal, RPO/RTO | 7 | `agent/beta-backup-restore-v1`; PR #285 | Backup/restore runbooks, retention/manifest contracts, synthetic isolated rehearsal and evidence | Roadmap, production restore, manual production schema changes, application features | Runbooks, templates, and contract workflow exist; no approved distinct target or executed restore evidence exists | Not ready | Stabilize final diff and CI, review/complete referenced automation, execute against a distinct synthetic target, and record integrity, connected Admin/Player smoke, RPO, and RTO evidence |
| `BETA-NOTIF-005`, `BETA-NOTIF-006`; Player story cutscene/purpose-built delivery | 8 | `agent/player-story-delivery-v1`; PR #244 | Bounded story-delivery Backend/Player implementation and tests | Roadmap, PR #163 campaign definitions, generic raw payload rendering, runner scheduling, redesign | Permanent implementation and clean final-head evidence must be re-audited from current GitHub state | Not merge-ready without permanent source and complete final-head CI | Materialize actual source, remove carriers/finalizers, make a human-authored final commit, and pass all required checks |
| Phase 4 bounded executable seed release and `BETA-SEED-001` | 9 | `agent/seed-content-foundation-v1`; PR #163 | `docs/seed-content/**`, generators, validators, simulations, bounded importer/rollback/staging evidence | Roadmap, PR #244 runtime delivery, production activation/deployment, unrelated features | Stale, non-mergeable, non-executable, and no current-head staging evidence was found at controller audit | Rejected | Synchronize the existing branch, close calibration/map gates, add idempotent importer/rollback, and prove a bounded isolated-staging load |
| Phase 6 complete E2E sequence and pilot | 10 | `agent/beta-e2e-pilot-v1`; PR #286 | 52-scenario orchestration, synthetic fixtures, defect/evidence contracts, pilot controls/results | Roadmap, feature implementation, production deployment, manual production data/schema changes | Harness/preflight work exists and correctly records `BLOCKED_BY_ENVIRONMENT`; no scenario is complete | Dependency-blocked even if harness CI passes | Stabilize final diff/CI; execute only after release, migration, security, story, seed, observability, and restore dependencies are merged and deployed to isolated staging |

## Open pull-request gate status

| PR | Capability | Queue | Current gate decision |
|---:|---|---|---|
| #281 | Controller documents | Merged coordination/evidence | `VERIFIED_COMPLETE` as `7bbd08e19641146282b58023a0a911c90f6a148b` |
| #288 | Controller containment record | Merged coordination/evidence | `VERIFIED_COMPLETE` as `b047e322b18225d8a4136acc76e92da15bdbff1e` |
| #280 | Immutable release tooling | Independent beta tooling | Draft after head movement; re-audit current final diff and workflows |
| #282 | Migration reconciliation tooling/evidence | Release foundation | Final-head review required; connected migration evidence remains open |
| #283 | Legacy-retirement preparation | Release foundation | Preparatory merge only after stable green CI; live retirement remains approval/evidence blocked |
| #284 | Security/rate limits/access | Security foundation | Draft and rejected until stable complete green CI plus migration/staging review |
| #287 | Observability/performance tooling/evidence | Operations foundation | Repository boundary may be reviewable; runtime/load/dashboard evidence remains open |
| #285 | Backup/restore controls | Recovery foundation | Hold until stable green CI and reviewed automation; rehearsal evidence remains open |
| #286 | Final E2E harness | Final evidence | Keep draft and dependency-blocked |
| #256 | Dependabot artifact action | Independent tooling | Reject; stale and required Admin workflows failed at audit |
| #244 | Story delivery | Beta capability | Reject until permanent source and complete final-head evidence exist |
| #163 | Seed release | Beta capability | Reject; stale, non-mergeable, non-executable, and lacks staging evidence |
| #248 | Messaging | Paused expansion | Draft restored after unauthorized ready transition; preserved and excluded from beta queue |
| #249 | Marketplace | Paused expansion | Preserved and excluded; required workflows failed at audit |
| #261 | Progression | Paused expansion | Preserved and excluded; planning/source snapshot is not runtime evidence |

## Migration ownership and collision boundaries

- Merged migration history on `main` is immutable.
- Chat 3 / PR #282 owns migration-history reconciliation and isolated-staging application evidence; only forward corrections are permitted.
- Chat 5 / PR #284 owns its forward rate-limit/telemetry migration set, subject to Chat 3 ordering/replay review.
- Paused PR #248 owns `20260720123000_add_messaging_communication_v1.sql` but may not advance while paused.
- Paused PR #249 owns `20260720042500_add_marketplace_reference_scopes_v1.sql`, `20260720043000_add_player_marketplace_lifecycle_v1.sql`, and `20260720044500_fix_marketplace_order_settlement_state_v1.sql` but may not advance while paused.
- Chat 9 may add a bounded seed importer migration only on PR #163 after Chat 3 confirms ordering and Chat 2 supplies isolated release controls.
- No chat may apply manual production SQL.

## Merge sequence

1. Stable independent tooling/evidence boundaries from PRs #280 and #282; PR #256 only after refresh and full green CI.
2. Security and release foundations: PRs #284, #283, #287, and #285 in dependency-safe order and only at their reviewed repository boundaries.
3. PR #244 after permanent implementation materialization and green CI.
4. PR #163 after synchronization, executable import/rollback, calibration/map closure, and isolated-staging evidence.
5. PR #286 execution against the approved immutable isolated-staging release.
6. Chat 1 final authoritative roadmap completion reconciliation.

## Controller incident record — paused Messaging bypass

- PR #248 was explicitly product-owner-paused and returned to draft by Chat 1.
- Commit `c88d7e80c866038731dba7044e97ba33ab83aecb` nevertheless added a write-enabled workflow to `main` that listened for PR #248 becoming ready, modified the paused branch, and attempted a direct push back to `main`.
- Commit `efb734f6a975158b826c6d22e5b260fd892c861d` changed that workflow to a `push` trigger on `main`, immediately activating the same paused-expansion synchronization path.
- Chat 1 restored PR #248 to draft and removed the workflow from `main` in emergency containment commit `92563c58304517e911816627a9cac0c74db92aef`.
- The workflow, its finalizers, and any branch changes it produced are not completion or merge evidence. PR #248 remains excluded until explicit product-owner reactivation.

## Completion-claim decision rule

Chat 1 accepts completion only when the capability is merged into `main`, all required final-head workflows pass, migrations replay/lint where applicable, required browser/security/idempotency evidence exists, and required staging/runtime/release evidence is immutable and reviewable. Otherwise the highest permitted status is `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, or `BLOCKED`.
