# Econovaria Beta Controller Reconciliation — 2026-07-21

**Controller authority:** Chat 1  
**Applies to roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Audited main:** `990a56fa0e25c5e43cc1b6248184ba9b0cc62c99`  
**Production promotion authorized:** No

## Purpose

This controller amendment records repository and connected-environment changes that occurred after the baseline embedded in the authoritative V1 roadmap. It does not replace the roadmap’s scope, acceptance criteria, or status vocabulary. Where the V1 current-program snapshot conflicts with this dated reconciliation, the repository facts and statuses below govern until the next full roadmap consolidation.

## Repository reconciliation

The following repository/tooling tranches are merged and authoritative on `main`:

| Workstream | Pull request | Merge commit | Repository boundary |
|---|---:|---|---|
| Story delivery | #244 | `35462edd60edbb86b0222f38cdb42bb41aac0efe` | Bounded Player story delivery and notification state |
| Browser environment neutrality | #290 | `60a21adfd03ce28b6e9dc0ed25454929cd6fd97b` | Deployment-owned runtime configuration across browser surfaces |
| Migration reconciliation | #282 | `bcf176f152c563f562cd8365a89925edb11d57d9` | Canonical 71-migration replay, staging schema hardening, bank retry evidence |
| Immutable release platform | #280 | `93155e96d56323a33f723152d9fd979cea07a8c5` | Build-once artifacts, exact promotion, rollback contracts |
| Legacy-runtime retirement controls | #283 | `0c3996f31dacbff74854402cbc708644ae2a784a` | Inventory, traffic, credential, observation, rollback controls only |
| Backup and restore controls | #285 | `4de8bce73eb90872cf4cc066dac3967f63e52dbb` | Fail-closed backup/restore contract only |
| Observability and load controls | #287 | `2d1bc94591df3e82055c4fcd21ee80a48771293e` | Privacy-safe events, dashboards, alerts, 30/40-player load contract |
| 52-scenario pilot contract | #286 | `0ee9e121c3d556b2b3e4c1fa89e860a3a913a618` | Immutable continuous-run and evidence contract only |
| Security and rate-limit hardening | #284 | `990a56fa0e25c5e43cc1b6248184ba9b0cc62c99` | Repository implementation and staging-database contract |

A merged repository tranche does not by itself complete connected deployment, restore, load, retirement, or pilot acceptance.

## Connected environment reconciliation

- Synthetic staging: `ECON SIM STAGING`, project ref `eecvbssdvarfcykcfrny`, region `ap-northeast-2`.
- Production guard: `ECON SIM`, project ref `cgiukdjwicykrmtkhudh`.
- Project identities and database hosts are distinct.
- Production was not modified during this reconciliation.
- Staging records 73 migration versions through `20260721003228_repair_request_rate_limit_jsonb_object_length_v1`.
- Security migration `20260721002625_harden_request_rate_limit_operations_v3` and its PostgreSQL 17.6 compatibility repair are present in staging.
- A bounded staging SQL acceptance probe produced exactly 10 allowed and 30 denied results across 40 authenticated attempts and again across 40 pre-auth attempts.
- Bounded cleanup deleted four expired rate-limit rows with zero remaining expired rows.
- Aggregate telemetry remained bounded and exposed only reviewed dimensions.
- `anon` and `authenticated` cannot execute cleanup or telemetry RPCs; `service_role` can.
- Supabase security advisors reported no WARN or ERROR findings after the security DDL.

These results do not replace true concurrent requests, deployed Edge verification, trusted-ingress proof, scanner load, outage rollback, or retained-evidence privacy review.

## Current active authorities

### PR #163 — bounded executable seed pack

- Existing authority: `agent/seed-content-foundation-v1`.
- Branch contains current `main` and is approximately 480 commits ahead.
- The very large generated/content/evidence surface requires exact-head audit before merge.
- Connected staging now exists, so the prior “no staging project” blocker is obsolete.
- Remaining acceptance: exact-head CI, bounded import, idempotent replay, deactivation, rollback, integrity, scoped Admin/Player verification, and activation authorization.
- The full 3,200-instrument universe remains excluded from beta activation.

Status: `IN_PROGRESS`; not merge-ready.

### PR #294 — campaign, arrival class, geography, and travel runtime

- Existing authority: `agent/story-arrival-world-runtime-v1`.
- Owns `BETA-STORY-001` through `BETA-STORY-013`, `EXP-CLASS-001` through `EXP-CLASS-011`, `EXP-GEO-001` through `EXP-GEO-009`, and minimal onboarding runtime.
- Current branch is 21 commits ahead and 62 commits behind audited `main`.
- PR #163 remains the definition/content authority; #294 consumes stable interfaces.
- Remaining acceptance includes synchronization, atomic runtime execution, UI integration, replay/lint, browser evidence, simulation, and isolated-staging playthrough.

Status: `IN_PROGRESS`; not merge-ready.

### PR #295 — connected staging production-integration gate

- Existing authority: `agent/production-integration-gate-v1`.
- Current branch is 6 commits ahead and 62 commits behind audited `main`.
- Its recorded #284 and migration blockers are stale and must be reconciled after synchronization.
- Remaining acceptance includes exact-artifact Edge/frontend staging deployment, rollback artifact selection, encrypted restore rehearsal, security ingress/outage/privacy evidence, seed import, world runtime, observability/load, connected smoke, and all 52 scenarios.

Status: `IN_PROGRESS`; production remains `NO_GO`.

## Paused and closed expansion work

- PR #248 Messaging remains an open product-owner-paused draft.
- PR #261 Progression remains an open product-owner-paused draft.
- PR #249 Marketplace was closed unmerged and its branch reset. Marketplace remains paused; closure is not evidence of feature completion or owner removal.
- No paused capability may advance without explicit product-owner reactivation.

## Maintenance queue

PR #256 is a stale Dependabot update for `actions/upload-artifact` v7. Dependabot recreation was requested on 2026-07-21. The stale head must not merge; only a recreated current-main head with complete CI may be considered.

## Required sequence

1. Merge the controller matrix and this reconciliation amendment after final-head documentation CI.
2. Synchronize PRs #294 and #295 with current `main` and rerun exact-head CI.
3. Audit PR #163’s generated/evidence surface and execute bounded staging import, replay, deactivation, rollback, and cross-surface verification.
4. Build and deploy one exact immutable artifact set from current `main` to synthetic staging only.
5. Complete security Edge/ingress/outage/privacy evidence and encrypted backup/restore rehearsal.
6. Activate observability and alerts; execute 30/40-player load and post-load query-plan review.
7. Complete and merge #294 after repository and staging playthrough evidence.
8. Execute all 52 scenarios continuously against one immutable release.
9. Issue the final controller roadmap consolidation and production-beta go/no-go decision.

Production promotion requires a separate explicit product-owner authorization and is not authorized by this amendment.
