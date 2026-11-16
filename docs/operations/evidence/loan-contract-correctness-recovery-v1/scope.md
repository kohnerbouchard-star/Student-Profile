# Loan repayment / Contract timezone correctness: fresh reconstruction

Status: `IMPLEMENTED_NOT_MERGED`. Main baseline:
`eb6ccf77af2cab514c300ed6a05f3ddd37bc67f5` (#985).

## Provenance and scope

The prior unpublished workspace, object database and evidence disappeared before
publication. Its commit/tree could not be recovered locally or from GitHub.
This is newly reconstructed work from verified main, not an unchanged recovery
of that tree. Earlier test/review results are historical and are not credited to
this candidate. New tests and independent review are required.

The owner approved the bounded fixes below and explicitly retained existing
Supabase automatic production sync. Do not change that setting. Draft PR work
may proceed; any main merge remains coordinator-controlled, potentially triggers
production sync, and requires exact-head CI and deployment/data-safety review.
No manual deployment, live SQL, migration repair or permission expansion is
part of this work.

Proposed intake IDs, coordinated with the reserved #668 ledger owner:

- `MAINT-PLAYER-LOAN-REPAYMENT-ACCOUNT-001`
- `MAINT-ADMIN-CONTRACT-GAME-TIMEZONE-001`

The actual PR986 tranche adds only these two scoped intake rows, preserving
all prior ledger text and #668 ownership. No completion is claimed.

## Correctness changes

### Loan repayment

Remove only the client comparison against unrelated home Checking availability.
The repayment SQL uses the facility's persisted account type and currency,
including Savings or Business (`20260812113000_bind_loan_repayment_accounts_v1.sql`).
The active-loan DTO does not expose authoritative bound-account availability.
Native amount constraints, numeric normalization, game scope, idempotency and
server funds/account/currency validation remain intact. No balance is dual-written.

Fresh terminal integration regressions cover zero home Checking, invalid numeric
amounts, successful command dispatch and authoritative rejection without a
fabricated refresh or balance change. Transport fixtures named for Savings,
Business and another currency prove client dispatch only, not real database
acceptance. The existing native desktop/mobile browser suite covers required
input, an actual click and rejection.

### Contract dates

The canonical selected game zone is `stockMarketWindow.timezone`, written by
licensing activation and returned by the existing scoped settings read as
`data.settings.stockMarketWindow.timezone`. Attendance timezone is independent
and is not a fallback. `gameResourceReadModels.ts` owns the settings projection;
`readModels.ts` retains its facade export.

Read that existing endpoint alongside Contracts only with the existing
`settings.manage` grant. Carry the validated/canonicalized Intl zone through the
read model, controller and route into the form and all catalog/detail/participant
date presentation. Interpret publication, due and expiry controls in that zone,
including prefilling. Display the selected zone explicitly. If it cannot be
confirmed, read-only date presentation uses explicitly labelled UTC, never the
unlabelled browser-local zone.

Preserve unchanged stored instants and seconds, including both instants of a
repeated DST hour. Newly entered repeated wall times are rejected with guidance
instead of choosing an offset; skipped times are also rejected. This applies to
all three date fields in create/edit, including non-hour folds such as Lord Howe.

Unknown/invalid/unavailable settings keeps Contract reads/review and genuinely
dateless draft creation/editing or publish-now available. Date controls and
scheduled selection are disabled; dated actions and edits of existing dated
contracts fail safely without silently clearing dates. Session, MFA and abort
errors still propagate; stale/destroyed game loads cannot supply a new editor's
timezone. No guessed Seoul or attendance fallback is added.

Permission limitation: contracts-only staff retain authorized dateless flows,
but dated input/editing needs the selected game zone to be confirmed. A narrow
timezone endpoint would require a separate reviewed change; this patch does not
broaden settings access or add a backend endpoint.

## Tests and CI

All existing tests remain, except the characterization asserting the incorrect
Checking rejection is replaced by the new repayment behavior regressions.
New regressions are in already registered suites. The new helper is covered by
the existing Contracts `core/**` path. Two durable additive PR path registrations
also retain Loans Lifecycle Read and Required Game Market Timezone qualification:

- Player forms source in `.github/workflows/loans-lifecycle-read-v1.yml`.
- Contract timezone helper in
  `.github/workflows/configurable-stock-market-timezone-v1.yml`.

No old registration, assertion, command, pin, guard, timeout, permission,
threshold or enforcer is removed or weakened. The exact actual-PR authority must
use a real PR number, exact changed paths, the two unchanged mandatory verifier
files, four generic mandatory identities and every naturally applicable feature
workflow/job. Do not inherit unrelated held-refactor 151/105 exceptions or add
per-PR paths to unrelated workflows.

Hosted acceptance is conjunctive over workflow file, YAML job ID and matrix
identity, bound to exact head/run/attempt/actual job/check IDs. Duplicate display
labels cannot share one success. Existing guarded dispatch/production jobs get
zero assertion credit. Raw COE outcomes and their existing enforcers must pass;
family success alone is insufficient. CodeQL results are separately accounted.

## Fresh verification

Pinned tooling: Node22.23.1, npm10.9.8, Deno2.9.3.

- Root/backend/Player `npm ci`: passed.
- Fresh Contracts/form + terminal interaction suite: 103/103 passed, including
  nonlocal display, role/dateless flows, and create/edit overlap rejection.
- Syntax checks of all three affected browser scripts: passed.
- Fresh full root `npm test` passed on #985 main, including its unchanged runtime
  size and Player write-policy ratchets. Node's bounded 512 MiB heap is only an
  execution resource limit, not a test-assertion or timeout change.
- Player `npm run verify`: passed; Contracts workflow plus terminal interaction
  regressions: 228/228 passed.
- Backend TypeScript typecheck: passed.
- Mandatory Player boundary/resilience/authority tests: 72/72 passed.
- Loans Lifecycle Deno tests: 95/95 passed; runtime/surface contracts and all
  10 terminal forecast tests passed.
- Game Market Timezone Deno tests: 136/136 passed; selected-zone activation smoke,
  staff signup timezone tests 8/8, six unchanged generation validators, replay
  idempotency and generated-drift checks passed.
- Full Edge-root typecheck is blocked by `esm.sh` refusing the existing locked
  Supabase SDK import. No type-checking/lock/import policy was weakened.
- Root and Player pinned Chromium installation both received zero-size/truncated
  archives from the official download endpoint. Browser tests were not executed
  locally and remain mandatory exact-head hosted gates, not credited by syntax
  checking or mocked transport tests.
- Independent semantic review cleared selected-zone presentation, dateless role
  behavior and new-entry DST overlap rejection. Independent #985 integration
  review found identical feature diffs and unchanged outside-scope main files.
- No exact published-head CI or live production parity is claimed yet.
- Earlier lost-tree successes must not be substituted for these pending gates.

## Deployment and rollback

Candidate diff contains no SQL/migrations, backend/API/Edge Function source,
Supabase or Vercel configuration, dependency or deployment-workflow change.
Frontend release remains necessary to expose the changed frontend behavior.
Zero backend diff is not proof of zero production activity: the retained sync
can reconcile pre-existing pending migration or function state. The coordinator
must verify live branch/ledger/deployment consequences before merge and observe
sync and health afterward. No Supabase setting is changed.

Rollback is a revert of this bounded frontend correction; no schema/data
rollback is introduced. Final qualification and coordinated merge remain
pending; this record is not release approval.

## Actual PR986 metadata and publication

Draft [PR #986](https://github.com/kohnerbouchard-star/Student-Profile/pull/986)
initially published source head `bb452225021b89155e6e33e8c8974e5401cc8490`.
All 16 sequential contents-API commits preserve ordinary ancestry from qualified
main `eb6ccf77af2cab514c300ed6a05f3ddd37bc67f5`. The resulting full Git tree is
`1817f78cf504ca8210ae1695aa8599f500c628d1`, byte-identical to independently
reviewed local source `5a886eaf5c95951873234ac5e15ae4e2cb1a806d`; no force
update or main write occurred. This is fresh reconstructed source, not recovery
of the earlier lost unpublished tree.

Actual metadata includes `pr-986.json`, the standalone scope evidence and two
additive intake rows. Final scope is 18 changed / 20 locked paths, including
both unchanged read-only verifier files. It requires all 46 naturally applicable
ordinary PR families / 91 declared tuples / 86 executing tuples and 5 guarded
zero-credit jobs, plus separately accounted dynamic CodeQL. The actual authority
binds 131 required unique labels / 82 critical labels without composite names.

Independent planning review verified the prior source tree, exact predicates,
88-row source table, guards, all COEs and their enforcers. Final actual-number
metadata must be independently reviewed and exact final-head hosted execution
must still qualify. No earlier head's green status is credited to a later head.
The original local full backend smoke process became unavailable while retained
Contract suites were typechecking; completion cannot be recovered from the log,
so that run is incomplete, not a pass. Both new loan regressions were separately
confirmed to fail against unchanged main and pass with this correction.

The owner deferred Supabase quota investigation while retaining automatic sync.
Live services are restricted with 402, and no live verification is claimed or
substituted by repository tests. Keep deployment/data-safety review separate.

## Exact scoped CI preparation

Source diff has 16 paths. An in-memory numeric-shaped actual-PR authority adds
one path (17 changed / 19 locked including both unchanged verifier files).
A coordinated roadmap intake, if authorized, adds one further changed/locked
path and requires recomputation. A guessed authority file is not written.
The source-only and numeric-authority projection both select 45 ordinary
PR-open/synchronize/reopen workflow families: 88 declared tuples, 83 applicable
and 5 guarded zero-credit jobs. With roadmap intake, the projection is 46
families / 91 declared / 86 applicable, adding Admin Business Supervision's three existing jobs.
These are projections, not hosted execution results.

The actual authority keeps unique display-name strings supported by the current
schema. Before dynamic CodeQL, the projection is 126 required / 78 critical
unique labels; separately binding CodeQL gives 127 / 79. With intake those
figures become 130 / 81 before CodeQL, 131 / 82 with it. Exact hosted acceptance
must account for every tuple below and any observed additional automatic
CodeQL job, including matrix identity, head SHA, run ID, run attempt and actual
job/check IDs. A shared label never supplies credit to another tuple. All
workflow-family conclusions must also pass. There are no YAML matrices in this
selected set. Branch Hygiene is closed-event-only and is not an ordinary PR
qualification workflow.

The four mandatory generic identities are proved by source steps in
`player-terminal-verify.yml`: `Validate Player boundary contracts` runs both
trusted-IP entrypoint and production-secret-provision contracts;
`Validate bounded Player read resilience` runs read resilience;
`Verify standalone player terminal` (ID `player-terminal-verify`) runs the
retained terminal aggregate. These identities are not invented composite job
names and cannot be satisfied merely by a status-label match.

Both durable registrations preserve every prior path in its original order.
A source-only forms edit now selects Loans Lifecycle Read; a source-only helper
edit now selects Required Game Market Timezone. The pre-change path lists did
not select these two cases. No unrelated per-PR workflow selector is introduced.

### Actual 91-tuple inventory (including additive intake)

`required` means execution/assertions must succeed. `guarded` means the current
ordinary PR predicate is false, receives zero assertion credit, and is not run
by weakening that guard. Matrix identity is `none` throughout this source set.

| Workflow file (`.github/workflows/`) | YAML job ID | Display name | Ordinary PR requirement |
| --- | --- | --- | --- |
| `admin-business-supervision.yml` | `source` | admin-business-supervision-source | required |
| `admin-business-supervision.yml` | `database` | admin-business-supervision-database | required |
| `admin-business-supervision.yml` | `browser` | admin-business-supervision-browser | required |
| `admin-browser-e2e.yml` | `rendered-admin` | Rendered Admin browser and secure mutation journey | required |
| `admin-scroll-integrity.yml` | `rendered-scroll-ownership` | Rendered viewport and drawer scrolling | required |
| `admin-shell-smoke.yml` | `admin-shell-smoke` | admin-shell-smoke | required |
| `admin-v2-attendance.yml` | `focused` | focused | required |
| `admin-v2-contracts.yml` | `contracts-v2` | Contracts source-owned route | required |
| `admin-v2-messages.yml` | `messages` | Messages moderation contract and browser smoke | required |
| `admin-v2-news-events.yml` | `news-events` | News & Events contract and browser smoke | required |
| `admin-v2-production-cutover.yml` | `contract` | Verify Admin V2 cutover contract | required |
| `admin-v2-production-cutover.yml` | `production` | Build, verify, and switch production Admin to V2 | guarded |
| `backend-typecheck.yml` | `backend-typecheck` | backend-typecheck | required |
| `banking-fx-clearing-v1.yml` | `certify` | Certify Banking FX clearing source | required |
| `banking-fx-clearing-v1.yml` | `database-acceptance` | Verify Banking FX database acceptance | required |
| `banking-fx-clearing-v1.yml` | `chromium-acceptance` | Verify Banking FX Chromium acceptance | required |
| `business-economy-v2.yml` | `authority-contract` | Business economy authority contract | required |
| `business-economy-v2.yml` | `backend-typecheck` | Backend typecheck | required |
| `business-financial-market.yml` | `source` | business-financial-market-source | required |
| `business-financial-market.yml` | `database` | business-financial-market-database | required |
| `business-financial-market.yml` | `browser` | business-financial-market-browser | required |
| `business-multicurrency-treasury-v1.yml` | `source-contract` | Verify C4 source, public contracts, and retained application boundaries | required |
| `business-multicurrency-treasury-v1.yml` | `disposable-database` | Verify C4 database, replay, isolation, rollback, and concurrency | required |
| `business-multicurrency-treasury-v1.yml` | `player-browser` | Verify C4 Player exact-money, accessibility, desktop, and mobile Chromium | required |
| `business-player-store-cutover-v2.yml` | `verify-cutover-authority` | Verify Player Store cutover and retained authorities | required |
| `business-player-store-cutover-v2.yml` | `verify-backend-store-runtime` | Verify public Store, seller projection, capabilities, rates, and Edge roots | required |
| `business-player-store-cutover-v2.yml` | `verify-database-settlement` | Verify serial settlement, ordering races, and two-game isolation | required |
| `business-player-store-cutover-v2.yml` | `verify-database-replay` | Replay complete database twice and lint at warning level | required |
| `business-player-store-cutover-v2.yml` | `verify-player-terminal-and-chromium` | Verify standalone Player Terminal and full Chromium suite | required |
| `business-player-store-cutover-v2.yml` | `verify-connected-player-store` | Verify connected Buyer and seller Store journey in two games | required |
| `business-player-store-fx-final-v2.yml` | `source-contract` | business-player-store-fx-final-v2-source | required |
| `business-player-store-fx-final-v2.yml` | `disposable-database` | business-player-store-fx-final-v2-database | required |
| `business-player-store-fx-final-v2.yml` | `player-browser` | business-player-store-fx-final-v2-player-browser | required |
| `business-player-store-fx-final-v2.yml` | `connected-two-browser` | business-player-store-fx-final-v2-connected | required |
| `business-primary-ipo.yml` | `source` | business-primary-ipo-source | required |
| `business-primary-ipo.yml` | `database` | business-primary-ipo-database | required |
| `business-primary-ipo.yml` | `browser` | business-primary-ipo-browser | required |
| `business-store-atomic-settlement-v2.yml` | `verify-settlement-authority` | Verify atomic settlement authority and retained Store phases | required |
| `business-store-atomic-settlement-v2.yml` | `verify-database-settlement` | Verify database settlement, rollback, races, and isolation | required |
| `business-store-atomic-settlement-v2.yml` | `verify-database-replay` | Replay complete database twice and lint | required |
| `business-store-atomic-settlement-v2.yml` | `verify-retained-economic-runtime` | Verify retained Business, Store, Inventory, Backend, and Edge runtime | required |
| `business-store-atomic-settlement-v2.yml` | `verify-player-terminal-and-chromium` | Verify retained Player Terminal and Chromium | required |
| `business-store-listing-inventory-v2.yml` | `verify-store-listing-authority` | Verify Store-listing authority | required |
| `business-store-listing-inventory-v2.yml` | `verify-retained-economic-runtime` | Verify retained Store, Inventory, and Business runtime | required |
| `business-store-listing-inventory-v2.yml` | `verify-player-terminal-and-chromium` | Verify retained Player Terminal and Chromium | required |
| `business-store-sales-convergence-v2.yml` | `source-contract` | business-store-sales-convergence-v2-source | required |
| `business-store-sales-convergence-v2.yml` | `disposable-database` | business-store-sales-convergence-v2-database | required |
| `business-store-sales-convergence-v2.yml` | `worker-contract` | business-store-sales-convergence-v2-worker | required |
| `business-store-sales-convergence-v2.yml` | `player-admin-contract` | business-store-sales-convergence-v2-player-admin | required |
| `business-store-seller-offers-v2.yml` | `verify-store-seller-offers` | verify-store-seller-offers | required |
| `business-store-seller-offers-v2.yml` | `verify-retained-business-banking` | verify-retained-business-banking | required |
| `business-store-seller-offers-v2.yml` | `verify-player-terminal-and-chromium` | verify-player-terminal-and-chromium | required |
| `business-store-withdrawal-safety-v2.yml` | `verify-withdrawal-authority` | Verify withdrawal authority | required |
| `business-store-withdrawal-safety-v2.yml` | `verify-retained-economic-runtime` | Verify retained Store, Inventory, and Business runtime | required |
| `business-store-withdrawal-safety-v2.yml` | `verify-player-terminal-and-chromium` | Verify retained Player Terminal and Chromium | required |
| `business-timed-manufacturing-v2.yml` | `verify-manufacturing` | Verify timed manufacturing | required |
| `business-timed-manufacturing-v2.yml` | `player-edge-boot` | Boot reviewed Player Edge entrypoints | required |
| `business-workforce-payroll-v2.yml` | `authority-contract` | Workforce and payroll authority contract | required |
| `business-workforce-payroll-v2.yml` | `backend-typecheck` | Backend typecheck | required |
| `business-workforce-payroll-v2.yml` | `materialize-inventory` | Materialize Phase 4A architecture inventory | guarded |
| `button-action-coverage.yml` | `button-action-coverage` | button-action-coverage | required |
| `configurable-stock-market-timezone-v1.yml` | `apply-and-validate` | apply-and-validate | required |
| `crafting-item-runtime.yml` | `permanent-runtime` | permanent-runtime | required |
| `environment-neutral-browser.yml` | `runtime-config-contract` | runtime-config-contract | required |
| `loans-lifecycle-read-v1.yml` | `loans-lifecycle-read` | Loans Lifecycle Read | required |
| `multicurrency-marketplace-funding-v1.yml` | `source-contract` | Verify multi-currency Marketplace funding source and scope | required |
| `multicurrency-marketplace-funding-v1.yml` | `disposable-database` | Verify multi-currency Marketplace funding database | required |
| `multicurrency-marketplace-funding-v1.yml` | `connected-browser` | Verify connected multi-currency Marketplace funding browser journey | required |
| `multicurrency-stock-funding-v1.yml` | `source-contract` | Verify C3C Stock buy settlement source and retained C3A/C3B scope + C3D sell + C3E Player cutover | required |
| `multicurrency-stock-funding-v1.yml` | `disposable-database` | Verify C3C atomic Stock buy database and retained C3A/C3B authority + C3D sell + C3E cutover | required |
| `multicurrency-store-funding-v1.yml` | `source-contract` | Verify multi-currency Store funding source and scope | required |
| `multicurrency-store-funding-v1.yml` | `disposable-database` | Verify multi-currency Store funding database | required |
| `player-button-click-safety.yml` | `player-button-click-safety` | player-button-click-safety | required |
| `player-local-currency-authority.yml` | `contract` | Checking, Savings, and local-currency contract | required |
| `player-multiplayer-load-e2e.yml` | `connected-player-runtime` | Two-browser Player journey, secure mutations, and 30-40 Player load | required |
| `player-terminal-verify.yml` | `verify` | verify | required |
| `production-runtime-promotion-contract.yml` | `verify` | Verify production promotion remains fail-closed | required |
| `ref-009-contract-reward-qualification.yml` | `reward-qualification` | Contract reward database/race qualification | required |
| `ref-018-attendance-qualification.yml` | `attendance-qualification` | Staff Attendance and ledger adjustment database/race qualification | required |
| `ref-018-attendance-qualification.yml` | `campaign-qualification` | REF046 exclusive disposable qualification | required |
| `release-integrity.yml` | `static-integrity` | Verify static release integrity | required |
| `release-integrity.yml` | `live-parity` | Inspect staging and production parity read-only | guarded |
| `release-promote.yml` | `contract-tests` | Promotion contract tests | required |
| `release-promote.yml` | `authorize-promotion` | Verify and authorize unchanged artifacts | guarded |
| `repository-quality.yml` | `quality` | quality | required |
| `runtime-interaction-wiring.yml` | `trace-runtime-controls` | trace-runtime-controls | required |
| `staging-readiness-preflight.yml` | `validator-tests` | Validator tests | required |
| `staging-readiness-preflight.yml` | `staging-preflight` | Fail-closed staging evidence check | guarded |
| `supply-chain-security.yml` | `dependency-review` | dependency-review | required |
| `supply-chain-security.yml` | `verify-and-attest` | verify-and-attest | required |
| `world-runtime.yml` | `verify` | verify | required |

### Guard and raw step semantics

The five zero-credit guards are the production Admin cutover's manual/main/
release-authorization predicate; Workforce inventory's PR-657-only predicate;
Release Integrity live parity's manual/main predicate; Release Promote's manual
promotion authorization; and Staging Readiness's manual preflight. The two
ordinary-PR guards on Promotion contract tests and dependency review execute.
Do not use manual dispatch to evade PR guards or imply production authorization.

Nineteen step-level `continue-on-error` declarations are retained unchanged; no
job-level COE is declared. Fifteen active fixture/browser steps require their
raw `outcome` and their existing always-running enforcers, not just green
workflow conclusions:

- Admin Browser: `browser`, `ledger_mutation`, with `Enforce rendered browser
  results`, including evidence sanitization.
- Business Player Store Cutover connected job: `connected_store`, with
  `Enforce connected Player Store result` and evidence-privacy checks.
- Marketplace connected job: `multiplayer_fixture`, `marketplace_browser`,
  with `Enforce connected Marketplace evidence`, including retained JSON proofs.
- Player multiplayer: `player_browser`, `player_mutations`,
  `player_state_controls`, `player_commerce`, `player_inventory`,
  `player_contracts`, `player_market`, `player_business`, `player_world`,
  `player_load`, with `Enforce connected Player results`.

The other four COE steps are Repository Quality's two optional package-signature
probes and the guarded live-parity job's two comparisons. They do not provide
success credit for failed assertions. Exact hosted review must identify their
actual outcomes separately; optional nonblocking policy is not rewritten.
