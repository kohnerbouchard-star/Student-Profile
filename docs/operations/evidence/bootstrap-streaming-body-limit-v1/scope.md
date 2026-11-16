# Bootstrap streaming request-body limit: local preparation

## Status and source boundary

Isolated branch `fix/bootstrap-streaming-body-limit-v1` contains local integration
`cf60e53dbafabf650f5f2e23bd275aa4371cd37f`, normally merged with verified main
`8092e8fc12507bc77621ca851549fe7beb64fcd4` (PR #981). The earlier source
candidate `dcacecefdc99909301486c5b916a72a268e6363e` was based on
`cb584be1b40091329f552a2b8d3f144dce77a942`. The integration had no conflicts:
all 116 incoming changed paths retain main's blobs. The initial integration
had only the two source/test files and this note as main-relative changes.
PR #981 postmerge qualification was cleared by the coordinator. Draft PR #984
began with a scope-only seed; this candidate adds the reviewed source and the
exact PR-bound authority as its fourth main-relative path. The subsequent
additive Scope Intake entry is the fifth path, coordinated in PR #668 without
changing its branch or other ledger text. Final-head qualification remains
pending; no merge into main, deployment, production mutation or release is
claimed.

The existing `bootstrap-api` applies a 32,768-byte body policy before its
publishable-key validation. A request without a trustworthy `Content-Length`
previously could be completely buffered before its actual size was rejected.
The fix reads a bounded, lazily grown buffer, cancels at the first oversized
chunk without waiting for cancellation, and preserves accepted bytes and the
existing errors and validation order. It changes no route, authorization, rate
limit, public API contract, database, dependency, workflow or production control.
Each application buffer is capped at the policy limit, although old and new
buffers can coexist briefly. Upstream allocation of an individual chunk,
aggregate concurrency and slow-client duration are outside this change.

Reviewed implementation and test blobs:

- `backend/src/security/edgeRequestBoundary.ts`: `c4f88cbb361f723ab528283d556573ba6d2edb7b`.
- `backend/src/security/edgeRequestBoundary.test.ts`: `959ea7f02873e139b6ae4438bd82e7bc723cfc2c`.

## Local verification and limits

On the fresh-main union with Node 22.23.1, npm 10.9.8 and Deno 2.9.3:

- Boundary tests passed 16/16; against the original implementation the same
  tests produced 11 passes and five expected over-read/cancellation failures.
- Authentication convergence passed 56/56; Player security passed 67/67; the
  authority regression suite passed 16/16. Root `npm test` passed with 406
  passes and one optional PostgreSQL skip. Focused format, lint, secret scan
  and diff checks passed.
- Backend TypeScript passed. Full Edge typechecking stopped at the locked
  Supabase SDK fetch (`esm.sh` connection refused). Full backend smoke stopped
  at the same fetch during `test:game-sessions` after 1,299 Deno and 18 Node
  executions passed. Neither aggregate is claimed as passing.
- Independent source/integration review verified both merge parents, every
  incoming #981 blob and the source/test blobs; it independently reran the 16
  boundary tests and format/lint/diff checks. A separate review tested 150
  size/chunk combinations. No live hosted gateway, persistent database or
  production browser environment was tested.

## Scope-specific CI and intake plan

This section supersedes the earlier, conservative proposal to copy PR #981's
151/105 check lists and add 43 workflow selectors. Those were not a generic
requirement, and no such filters are proposed. Preserve the existing validators,
permissions, U1/held14 guards and all naturally applicable checks without adding
unrelated workflows. The global roadmap has one additive intake entry; the
separate #668 owner was notified to preserve it on later reconciliation. No
other ledger text is changed. Recompute the plan if main, the final diff or
GitHub rules change.

The four source, evidence and intake paths select 21 PR workflow families on
the usual opened/synchronize/reopened events. The actual `pr-984.json`
authority also selects Player Terminal Verify, for **22 predicted families**.
Twenty-one have active PR jobs; the PR361-only deployment job is expected to
be skipped. Job conditions and actual results, not these source-derived counts, determine
qualification. Dynamic CodeQL and GitHub branch-protection checks must be
independently discovered and reconciled; do not infer that this list is the
repository's protection configuration.

A real PR-number-bound cross-cutting authority is necessary because the
naturally selected Banking FX source job invokes the existing verifier with the
actual PR number. Its exact allowlist comprises the four source, evidence and
intake paths above, the actual-number authority path, and the two existing
verifier/test paths. The latter two remain unchanged and are independently
compared to main; `readOnlyPaths` is descriptive and the generic verifier alone does not enforce
that restriction. Preserve the four required Player check literals, set all
production-deployment, production-mutation and secret-value flags to false,
and account for every applicable workflow/job below. Explicitly distinguish
`Beta Security Contract / verify` from `Player Terminal Verify / verify`; the
same bare job label cannot prove both outcomes. The earlier four-path
actual-number authority had 46 unique required strings and 25 critical strings.
The five-path authority includes the four newly selected workflow families and
their 14 job names, with 64 unique required strings and 39 critical strings.
Those are scope metadata, not GitHub-required check counts or a substitute for
checking real workflow/job pairs. Both shapes retain the four mandatory
literals and `CodeQL`.

PR #984 was opened after #981 postmerge clearance with a scope-only seed.
Independently review its actual-number authority against the exact final
five-path diff, verify both verifier/test files and every other control against
main, then qualify all naturally triggered final-head workflows and their jobs;
seed-head checks are not final-head qualification.
Record guarded skips separately. Where a retained workflow checks out the PR
merge commit rather than the head, record the exact PR head, base and tested
merge identity; do not relabel it as a head checkout. No production or staging
deployment, manual workflow dispatch, ready-for-review, or merge is authorized
by this note.

### Predicted PR workflow and job selection

- `.github/workflows/admin-browser-e2e.yml` (Admin Browser E2E): PR jobs `rendered-admin`.
- `.github/workflows/admin-business-supervision.yml` (Admin Business Supervision): PR jobs `source`, `database`, `browser`.
- `.github/workflows/backend-typecheck.yml` (Backend Typecheck): PR jobs `backend-typecheck`.
- `.github/workflows/banking-fx-clearing-v1.yml` (banking-fx-clearing-v1): PR jobs `certify`, `database-acceptance`, `chromium-acceptance`.
- `.github/workflows/beta-security-contract.yml` (Beta Security Contract): PR jobs `verify`.
- `.github/workflows/business-multicurrency-treasury-v1.yml` (business-multicurrency-treasury-v1): PR jobs `source-contract`, `disposable-database`, `player-browser`.
- `.github/workflows/business-player-store-cutover-v2.yml` (Business Player Store Cutover V2): PR jobs `verify-cutover-authority`, `verify-backend-store-runtime`, `verify-database-settlement`, `verify-database-replay`, `verify-player-terminal-and-chromium`, `verify-connected-player-store`.
- `.github/workflows/business-player-store-fx-final-v2.yml` (business-player-store-fx-final-v2): PR jobs `source-contract`, `disposable-database`, `player-browser`, `connected-two-browser`.
- `.github/workflows/business-store-sales-convergence-v2.yml` (business-store-sales-convergence-v2): PR jobs `source-contract`, `disposable-database`, `worker-contract`, `player-admin-contract`.
- `.github/workflows/configurable-stock-market-timezone-v1.yml` (Required Game Market Timezone): PR jobs `apply-and-validate`.
- `.github/workflows/exchange-calendar-runtime-v1.yml` (Exchange Calendar Runtime): PR jobs `validate`.
- `.github/workflows/player-multiplayer-load-e2e.yml` (Player Multiplayer and Load E2E): PR jobs `connected-player-runtime`.
- `.github/workflows/pr361-staging-game-provisioning-repair.yml` (PR361 Staging Game Provisioning Repair): guarded skip `deploy-and-provision`.
- `.github/workflows/production-runtime-promotion-contract.yml` (Production Runtime Promotion Contract): PR jobs `verify`.
- `.github/workflows/production-web-session-hotfix.yml` (Web Session Recovery Candidate): PR jobs `validate-and-package`; guarded skip `deploy-staging-candidate`.
- `.github/workflows/production-web-session-release.yml` (Production Web Session Release Orchestrator): PR jobs `validate-and-package`; guarded skip `deploy-staging`, `deploy-and-verify-production`.
- `.github/workflows/release-integrity.yml` (Release Integrity): PR jobs `static-integrity`; guarded skip `live-parity`.
- `.github/workflows/release-promote.yml` (Release Promote Exact Artifacts): PR jobs `contract-tests`; guarded skip `authorize-promotion`.
- `.github/workflows/repository-quality.yml` (Repository Quality): PR jobs `quality`.
- `.github/workflows/staging-readiness-preflight.yml` (Staging Readiness Preflight): PR jobs `validator-tests`; guarded skip `staging-preflight`.
- `.github/workflows/supply-chain-security.yml` (Supply Chain Security): PR jobs `dependency-review`, `verify-and-attest`.
- `.github/workflows/player-terminal-verify.yml` (Player Terminal Verify): PR jobs `verify`.

### Predicted main-push workflow selection, if later merged

The same five-path scenario selects nine main-push families. Edge Function
Inventory Convergence jobs remain manual-dispatch-only; Production Git
Release's live evidence and release-branch publication remain manual-dispatch-
only. These source conditions are not authorization to merge or deploy, and
external integrations require separate review.

- `.github/workflows/backend-typecheck.yml`: Backend Typecheck
- `.github/workflows/beta-e2e-pilot.yml`: Beta Pilot Contract
- `.github/workflows/beta-security-contract.yml`: Beta Security Contract
- `.github/workflows/business-player-store-cutover-v2.yml`: Business Player Store Cutover V2
- `.github/workflows/configurable-stock-market-timezone-v1.yml`: Required Game Market Timezone
- `.github/workflows/edge-function-inventory-converge.yml`: Edge Function Inventory Convergence
- `.github/workflows/production-git-release.yml`: Production Git Release
- `.github/workflows/repository-quality.yml`: Repository Quality
- `.github/workflows/supply-chain-security.yml`: Supply Chain Security

The event lists are forecasts from current repository YAML, not evidence that
checks ran or passed. Reconcile actual event type, exact head, job name,
conclusion, branch protection and expected guarded skips after any authorized
publication; refresh if the final changed paths differ. Separately authorized
release, recovery and live-parity work remains outside this tranche.

Independent read-only review of the original four-path plan separately
reproduced 18 PR and nine main-push families at `8092e8fc`, confirmed that
Backend Typecheck retains full Edge and smoke checks and Beta Security runs
the boundary suite, and verified that all workflows, inherited authority files,
held14 controls and verifier/test files remain identical to main. The five-path
plan adds four PR families and no main-push family; it requires fresh
independent review and exact-head hosted qualification. Earlier head results
are historical and do not qualify this revised candidate.
