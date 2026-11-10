# Admin Banking route extraction

- Roadmap ID: `ARCH-LARGE-ADMIN-BANKING-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, owner branch `refactor/admin-banking-route-extraction`; draft [PR #940](https://github.com/kohnerbouchard-star/Student-Profile/pull/940).
- Base: freshly fetched main `b77c9610e9b6ed3be93d8f4c888cacbc706df8ca` (2026-11-10).
- No deployment, hosted data mutation, merge, auto-merge or gate waiver.

## Scope and ownership

The owner approved continuing independent large-file refactors. All twelve current open PR pathsets (#939, #938, #936, #933, #929, #927, #924, #735, #731, #668, #624 and #620) were audited. None owns the Banking route or its dedicated test files. #927's shared Admin unit registration is not edited; the new characterization is imported through the existing Banking suite. Main now contains merged #935 Crafting, #937 public-ID hashing, #932 Player Crafting and #934 Story persistence. Their older unmerged ledger wording is historical source status, not new runtime-completion evidence. World draft #939 and the separate Market candidate are not imported. The publication ownership check found no competing Banking owner; the authorized branch and draft #940 were then created.

Runtime scope is only `admin/v2/src/routes/banking/`:

- `BankingRoute.js`: 619 physical lines to 268. Public entry point, six-state rendering, nested correction form/validation/confirmation, callback identity, dialog cleanup and route destruction stay together.
- `BankingAccountCatalog.js`: 181 lines, summary, account presentation, filter controls and student actions.
- `BankingActivityPanel.js`: 123 lines, activity table and six-state history presentation.
- `BankingViewHelpers.js`: 58 lines, display formatting, buttons and teacher authority note.

All fifteen complete original top-level functions are byte-identical after removing only export keywords. The retained route body includes every nested correction function unchanged. The public module still exports only `BankingRoute`. Every DOM label, attribute, class, order, column, disabled reason and callback remains intact. No API, controller, response adapter, database, migration, RPC, permission, idempotency, CSS, dependency, existing workflow or other feature change.

Generated inventory is 99 to 98 oversized files, with source count 1,333 to 1,336. The scanner includes the trailing newline (original route 620). All other debt counts and ceilings remain unchanged, including 52 persistence exceptions. The existing lexical fallback marker moves to the view helper. This branch-relative reduction must not be blindly added to other unmerged branch inventories; regenerate after integration.

## Characterization and browser gate

Thirty new characterization cases were run against the unchanged main route before extraction and pass unchanged on the candidate. These cover native public import, all fifteen full-function digests, route/history states, accessibility contracts, currency/search filters, public row identity, disabled actions, correction constraints and validation, review before mutation, exact account/amount/reason, success/failure/rejection, cancellation, replacement, delayed cleanup and idempotent destruction. Existing fourteen Banking API/controller tests remain unchanged except the additive characterization import. Shared-component doubles exercise the actual route graph; they do not certify real focus, layout or shared dialog behavior.

No dedicated native Banking browser runner or workflow existed in audited main. New isolated `scripts/admin-v2-banking-browser-smoke.mjs` runs the actual application, controller and shared components on the existing local fixture server, with only synthetic Banking BFF interception. Desktop/mobile cases cover native boundary/navigation, all route states, filters/history, initial and return focus, invalid review, cancel/keep/discard, explicit confirmation, duplicate pending clicks, failed retry with identical idempotency, navigation cleanup/Back, privacy, request identity, layout and runtime/resource health. No real ledger is written. It is not hosted database/financial qualification.

New `.github/workflows/admin-v2-banking.yml` pins Node 22.23.1/npm 10.9.8, checks out the exact PR head without stored credentials, uses contents-read only, runs the full existing Admin suite and official pinned Chromium before the new mandatory smoke. A registered source regression locks these gate requirements. Existing checks are not removed or changed. Actual-number PR authority must retain every current-main required/critical gate and add this workflow and its job before publication qualification.

## Verification status

- Clean root and backend npm installs pass with pinned tools; manifests/lockfiles unchanged.
- Unchanged main: 30/30 new characterization plus 14/14 existing Banking cases pass.
- Final registered candidate: 46/46 Banking and 158/158 Admin pass (30 characterization, two new browser/workflow-source gate regressions, fourteen existing Banking cases).
- Full root `npm test`, backend TypeScript stage, architecture/seam ratchets, secret scan and whitespace checks pass. Full backend smoke and Edge typechecking stop at the unchanged frozen Supabase esm.sh dependency with connection refused; no aggregate backend pass is claimed.
- Browser launch is blocked because pinned Chromium headless shell is absent; the new runner has not passed. The official matching Chrome Headless Shell 158.0.8127.18 (Playwright v1254) download was also attempted and fails with an invalid/truncated ZIP. No substitute browser or gate waiver is used.
- Independent source review found two deterministic browser-runner assumptions, both corrected without changing shared UI: required form labels use scoped control names, and navigation cleanup checks only open dialog layers plus Banking forms rather than persistent shell drawers. A new registered regression covers both. Independent re-review verifies all fifteen original function bodies and passes 158 Admin cases with no remaining actionable finding. Exact-head hosted browser/Edge/backend qualification and public PR registration remain required. The owner explicitly approved retained-content public roadmap updates for the six named route refactors, clearing this candidate's earlier publication hold. The separate scanner roadmap hold is not covered or changed.

## Rollback and next step

Revert only this bounded extraction/test/gate addition and regenerate the inventory. No database or hosted-state rollback is involved. Independently review and publish the bounded actual-number authority metadata, then qualify that exact final head. PR940 authority retains all 129 required and 94 critical current-main PR934 checks in order and adds workflow `Admin V2 Banking` and job `Banking V2 contracts and browser smoke`, giving 131 required and 95 critical checks. Sixteen exact locks cover fourteen changed paths plus the unchanged read-only verifier/test files, with all production and secret denials unchanged. Preliminary hosted qualification does not replace fresh main-forward reconciliation, inventory regeneration, independent union review and exact-head qualification after World and Market merge. Parent owns the serial merge order: World, Market, Banking, News & Events, Attendance, Messages. This worker must not merge, mark ready or deploy. No overall architecture or beta completion claim.

## Publication checkpoint

The independently reviewed implementation remains `b656c83ffbe2e353e14c7fb82409c55eb5f4e3fa`, tree `1648c7091bb069c8ceb02a69c5b426374159a64d`. Only scope and Banking intake publication metadata change at this checkpoint; all eleven other reviewed paths are byte-identical, including runtime, tests, workflow, browser runner and deterministic inventory. Fresh main remains `b77c9610e9b6ed3be93d8f4c888cacbc706df8ca`, and every pre-existing main roadmap byte is retained. No hosted success or merge-readiness is claimed.

Draft #940 initial remote head is `d0e8311172bd00a3086683bf8917293ee5dd6c8c`, with tree `9303118102e1bb166d071205bd7cc3401ba2ed54` matching independently reviewed local publication checkpoint `0550ac8b3910c627966ea02209a5d5bc996323a0`. All thirteen blob IDs were checked before branch creation. Fresh 46 Banking, 158 Admin and full root tests pass. Final metadata review and new exact-head hosted qualification remain pending at this source checkpoint; initial-head workflow results must not certify the amended head.

## Hosted fixture correction

Initial-head Banking workflow [42827534012](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42827534012), job `129868651732`, successfully installed official Chromium 158.0.8127.18 but timed out waiting for initial loading. The runner intercepted the API client's `/api/admin` alias, while the unchanged runtime transport sends the fixture request to `/functions/v1/web-session-api/proxy`. Correct only the synthetic interception path and explicitly wait for that held request before asserting the still-required initial-loading state. A new registered test executes the real fixture runtime configuration, Banking API and BFF transport; it fails on the prior runner path and passes after the correction. All original assertions and financial/privacy/resource gates remain. Final focused counts are 47 Banking and 159 Admin, passing. Runtime extraction, shared components, API/controller, workflow and inventory remain byte-identical to reviewed `b656c83f`. Renewed independent review and exact-head hosted browser qualification are still required; the failed initial run is retained, not called a pass.
