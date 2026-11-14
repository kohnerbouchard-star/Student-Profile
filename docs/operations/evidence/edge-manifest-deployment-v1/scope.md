# Manifest-driven Edge deployment

Roadmap item: `BETA-EDGE-DEPLOY-MANIFEST-001`.
Owner: `fix/edge-manifest-deployment-20261114`.
Baseline: `2198e7a907d2d87a9eb79867abf9c2f6615cdd59` (merged PR #964).

## Source-only correction

The staging and production convergence steps each hard-coded 20 functions, while the unchanged canonical/compatibility manifest contains 22. Both lists omitted `banking-fx-orchestrator` and `fx-orchestrator`. A read-only deployment planner now validates the complete manifest before producing any output, selects only canonical plus compatibility entries, and supplies the exact `verifyJwt` setting to both deployment loops. The result summary counts that executed plan instead of reporting a constant 20.

The plan rejects duplicate/overlapping categories, unsafe slugs, mismatched entrypoints, missing/empty deployment arrays, non-boolean JWT settings and invalid manifest policy. Temporary staging, source-only and retired functions remain excluded. Shell loops stop on validation or deployment failure. The existing inventory validator remains the single manifest-policy validator; its only source change is exporting that function.

## Preserved boundaries

- Explicit owner-authorized manual dispatch, current-main binding, staging-before-production, protected environments, action pins, Supabase CLI version and every release hold remain unchanged.
- No runtime source, manifest/config policy, API, route, RPC, migration, economic write, credentials, dependency/lockfile, release branch or hosted data changes.
- No workflow dispatch, deployment, live deletion, scheduler activation or production mutation is part of this task.
- Active dependency PR #620 retains its action-version scope. Open #735/#731 release work, #933/#938 roster, #624 CSS and #668 global-ledger ownership remain separate; no donor commits are imported.

## Verification

- On the original baseline workflow, 21 of 22 new regression cases fail. The sole passing test checks the new pure planner independently of the workflow.
- The candidate passes all 22 new cases and all 50 focused inventory/config/runtime/release contracts under Node 22.23.1. Tests execute the actual workflow shell against a temporary mock Supabase binary, never a real deployment.
- Covered: exact 22 slugs and JWT/project flags in both environments; future manifest additions; invalid-manifest zero-call behavior; stop-on-first-deploy-failure; dynamic summary count; retained CI registration.
- Full root `npm test`, core TypeScript, architecture inventory/ratchets, secret scan and whitespace checks pass. Pinned tooling uses Node 22.23.1 and npm 10.9.8.
- Full Edge typecheck cannot complete locally because the frozen Supabase SDK URL at esm.sh refuses connections. Backend smoke has the same external retrieval prerequisite; no local full-backend pass is claimed.
- Independent read-only review found no actionable introduced defect and separately passed all 29 planner/inventory tests. Runtime source, release guards and action pins were compared against baseline.

## Remaining qualification

Publish a draft, record its exact head and actual PR number, qualify applicable hosted checks, and merge normally only after gates pass. Current source preparation is `IMPLEMENTED_NOT_MERGED`; it is not live release or runtime completion evidence. `BETA-LIVE-MIGRATION-PARITY-001` remains separately blocked. A future deployment requires a separate owner-authorized release under production change control.

## Actual PR qualification registration

Draft [PR #967](https://github.com/kohnerbouchard-star/Student-Profile/pull/967) published reviewed source `341fca499f4d0eb83b2c7e6c959339debb3a5f16`, tree `8ebacf4d58d1891c91c4a8e84e0e09abae7790c6`, identical to local source `9eec46c653e43a27ad5bbbb26a2e2022b754aabf`. GitHub connector publication was used because the restored shell lacks push credentials.

The mandatory roadmap update triggers the existing Admin Business authority gate. The actual-numbered PR967 authority therefore preserves the complete ordered PR964 prefix of 149 required and 104 critical identities, adds the Edge inventory and production Git release static contracts for 153 required/106 critical identities, and retains the read-only verifier/test locks. Forty-nine existing qualification workflows receive only a PR967 trigger-path registration. No assertion, job, deployment guard or existing trigger is removed. Final exact-head hosted qualification is required; initial-head results are not final evidence.

## Bounded PR contract concurrency correction

The exact-head PR967 promotion-contract run `43605373700` was cancelled while pending, before any jobs existed. GitHub's annotation says a higher-priority waiting request for `release-promote-contract` exists. Every PR previously shared that group; `cancel-in-progress: false` protects a running workflow but does not preserve all older pending workflows.

A one-line group expression now selects `release-promote-contract-pr-<number>` only for `pull_request` events. Actual manual promotions keep the exact existing `release-promote-staging` and `release-promote-production` groups. `cancel-in-progress: false`, job conditions, protected environments, immutable-artifact/source checks, approval/staging/rollback validation, permissions and action pins remain unchanged. Different PRs no longer replace one another's pending contract runs; repeated updates to the same PR retain the existing concurrency policy.

The existing registered `scripts/release-platform.test.mjs` now pins the complete concurrency expression, non-cancellation policy and independent PR/manual-promotion job boundaries. The new concurrency regression fails on the original workflow; its companion authorization regression passes there and on the corrected workflow. No new package or workflow family is needed. The actual PR authority adds only this test path and preserves all 153 required/106 critical identities.

Pinned local qualification passes all 15 release-platform/neutrality/determinism cases, all 16 authority regressions, the retained Vercel release guard contract, full root tests, secrets and whitespace checks. Independent read-only review found no actionable issue and reran all 9 release-platform cases. An exact before/after comparison confirms the workflow differs by only the concurrency group line.

This correction stays local until PR966's existing promotion check completes. It does not authorize deployment, release dispatch, cancellation or bypass of any required check. After permitted publication, fresh exact-head hosted qualification remains required.

Primary references: [GitHub concurrency behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) and [GitHub expression operators/format](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions).

## Final registration audit

The initial actual-number registration copied PR964 qualification families, but that refactor also naturally triggered Workforce Payroll through its architecture inventory change. This source-only workflow correction does not change inventory, so final identity auditing found the retained Workforce Payroll workflow/job missing. One additive PR967 authority-path trigger now schedules that existing workflow; its file is added to the exact scope locks. All 153 required/106 critical identities, existing jobs and conditions remain unchanged. No missing check is waived.

## Integration onto merged PR966

PR966 merged as `dc5cdd52d5332c83bd39a35b048fce9428c48250`, with the exact qualified tree `5dad0605cd4417a67d53dd6dd720eaa3c7cfb881`. Normal main integration preserves its complete session runtime, production-handler regressions, root registration, inventory, authority and evidence. The only conflicts were 49 adjacent PR966/PR967 path registrations, resolved by retaining both exact lines. The earlier local concurrency hold is historical: PR966 promotion contract `43604958652` succeeded before reviewed concurrency tree `ad9290d90a5f79c33a86895b3639793dfd930081` was published at `a08cd02fd236e91b8c66085d4eac911509a0aa80`. Final qualification includes the missing Workforce registration and will use the new exact integrated head. All deployment holds remain in effect.

## Retained Business deployment contract reconciliation

Integrated head `4e69c80ba221746bb81ae133f3f6fc586bc8f477` correctly failed the retained Store Sales source job `132496174471`: its old assertion counted a literal worker name in each removed hard-coded deployment list. The same failure reproduces locally. Database, worker and player/admin companion jobs passed; that head is not merged.

The source contract now checks the validated manifest plan contains `business-operations-worker` exactly once with `verifyJwt: false`, pins the complete fail-fast deployment loop and canonical manifest binding independently for both environments, and retains both exact once-only security smoke probes. No runtime/workflow deployment code or release guard changes. Thirty registered positive/negative contract cases cover missing/duplicate/excluded worker, JWT drift, wrong manifest/project, broken plan producer/consumer, skipped/duplicate deployment, missing fail-fast and smoke drift; the 22 actual mocked deployment cases remain required and unchanged. The existing Store Sales source job runs the new contract tests; actual-number authority adds only the two contract paths and retains all153/106 check identities. A fresh complete exact-head qualification is required again.

All 68 focused contract/planner/authority cases, the complete retained Store Sales source-step commands, full root tests and whitespace checks pass. Independent review found no actionable defect and separately passed all 52 Business/planner cases plus the full retained Store Sales source contract. Deployment/planner/promotion runtime bytes and all 153 required/106 critical identities are unchanged.
