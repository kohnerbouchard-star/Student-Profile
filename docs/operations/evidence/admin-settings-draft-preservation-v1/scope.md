# Admin Settings draft preservation

## Scope and ownership

- Item: `BETA-ADMIN-SETTINGS-DRAFT-001`, one bounded child of the teacher management request.
- Draft PR: [#924](https://github.com/kohnerbouchard-star/Student-Profile/pull/924). Actual-PR authority preserves all 118/87 predecessor gates and adds the Settings workflow/job, for 120 required and 88 critical checks under nine changed paths plus two read-only locks.
- Branch: `feat/teacher-management-flows-v1`, based on current main `08134650`.
- Preserve the in-memory Settings form and its validation/automatic Custom state across native route navigation and browser Back/Forward. No browser storage persists private drafts.
- Both refresh controls confirm before discarding unsaved values. Game switching checks before writing the selection; browser reload/close warns for unsaved or in-flight changes.
- Serialize saves, disable editing during pending save/read refresh, preserve failed-save retry identity and reset the reusable review dialog before retry. Clear the draft after acknowledgement, not at dispatch.
- Runtime paths: `admin/v2/src/app.js` and `admin/v2/src/routes/settings/{SettingsController,SettingsRoute}.js`.
- Regression paths: existing `scripts/admin-v2-settings-api.test.mjs` and `scripts/admin-v2-settings-browser-smoke.mjs`, already selected by the unchanged Settings workflow.
- Generated architecture inventory reflects only the app.js line-count change. Scope Intake records this child without editing other entries.

PR #668 retains backend context/global-roadmap ownership. Its branch and existing entries are untouched. Settings retirement remains separately owned by REF-015; no legacy loader, Settings compatibility, retirement register, deletion or observation gate changes. Game lifecycle controls are a separate, unfinished management slice.

## Verification

Local qualification at implementation `932fd111` plus the final browser harness correction:

- Settings API/controller: 9/9; registered Admin V2 suite: 91/91.
- Settings browser: 16/16 on pinned Playwright 1.65.0, including actual beforeunload cancellation, both refresh controls, Back/Forward, game-switch cancellation, in-flight navigation, failed-save retry, permission denial and mobile/Korean containment. Main comparison fails the new retention assertion: edited 1.35 reverts to 1.
- Root `npm test`, backend smoke, TypeScript/all 28 Edge roots, secrets and whitespace pass. Root retains its platform-specific GNU-tar skip. Local Deno is 2.8.3; hosted pinned-runtime checks remain necessary.
- Independent read-only source review found no actionable regression and independently reran all nine Settings contracts.
- Additional broad wildcard Admin tests: 164/166 pass. The Inventory wording assertion and World planned-route assertion also fail on untouched main. Those existing assertions are unchanged; the new two Settings unit tests fail on main and pass here.
- Additional full Admin browser suite reaches an unauthenticated-redirect failed-request assertion: imported modules are aborted by navigation. The identical unauthenticated-redirect assertion also fails on untouched main; no assertion was changed. This suite is not claimed passing.

The first Settings browser attempt found the retained confirmation dialog stayed busy after closing, preventing retry; fixed locally before qualification. A second fixture attempt exposed inconsistent two-game status/bootstrap data; corrected only the new fixture. Another new reload test wrongly expected Playwright ERR_ABORTED rather than a navigation timeout after cancellation; it now invokes browser reload and checks the actual beforeunload dialog and retained draft. Original failed attempts remain failure evidence, not passes.

Raw local logs and screenshots are retained outside the source diff under the `teacher-settings` prefix in the executor's temporary directory. Published exact-head CI is pending. These are synthetic local fixtures, not deployed or production qualification.

## Boundary and rollback

No API/BFF/backend, migration, route/RPC, economic policy, authorization, idempotency contract, dependency, workflow, release hold, credentials, hosted application data or production change. Keep draft. Revert this bounded source tranche to roll back; no database rollback is needed. Do not mark the parent teacher-controls request or REF-015 complete.


## Current-main integration, 9 November 2026

Merge exact main `0d314bbe53832afcdc94b9dab8d3e09515f2762f` into existing PR #924 head `e5e83a676392db8e69afdac20def5d94455e8bc1` with both parents retained. Only the additive Scope Intake section conflicted; both complete prior records are preserved, with a source-integration note. Every shared #928 implementation, workflow, authority and evidence file is byte-identical to main, and this feature's implementation/inventory/tests are byte-identical to its previous head. No feature or security behavior changes.

The feature authority keeps its exact path locks, false production/mutation/secret flags and all 120 required/88 critical prior entries. It inherits the new Shell/Scroll gates for 124 required/90 critical checks. Read-only validators and production holds are unchanged.

Cloud qualification uses Node22.23.1 and the locked dependencies. The full root suite, 9 focused feature tests, 95 retained Admin tests, backend TypeScript, 16 authority regressions, exact-scope validation, secret and whitespace checks pass on this integrated source. Every inherited shared-repair file and feature runtime/inventory/test file is byte-verified against its respective parent. Full backend smoke and Edge qualification are not claimed from this cloud: the unchanged external esm.sh dependency was unavailable during the shared-fix continuation. Full browser verification will run on the exact hosted merged head: this cloud cannot launch the pinned browser or reach the loopback fixture through its supported browser. Prior PR or #928 results do not qualify this new feature head. Keep draft pending independent integration review and fresh exact-head CI; no merge or production deployment is performed in this integration tranche.

## Current-main reconciliation and bounded qualification filters, 10 November 2026

Local review candidate preserves the original PR924 head `2df1aa48c3bf026f44ef82ad25047dbd32290f98` and merges exact main `a44d8e52119b9f2f3e6642dad0caabf845c46b39`. Only the additive roadmap intake conflicted; both complete records are retained. Original three Settings runtime files and two regression files remain byte-identical. Main's scanner implementation, mounted readiness, registrations, source-review bindings and unrelated authorities remain intact. Inventory is regenerated from the integrated tree; lifecycle PR927 is not imported.

Under the owner's filter-update and workflow-qualification instruction, the earlier no-workflow-change scope is amended only for exact `docs/operations/contracts/player-cross-cutting/pr-924.json` entries in the existing pull-request path filters below. An audit of the original nine Settings changed paths against all 28 scanner-qualified families finds fourteen already matched (including Crafting via app.js); only these fourteen are excluded and need scheduling:

- banking-fx-clearing-v1
- business-financial-market
- business-primary-ipo
- configurable-stock-market-timezone-v1
- crafting-item-runtime
- database-replay
- economic-core-request-claims
- exchange-calendar-runtime-v1
- loans-lifecycle-read-v1
- player-button-click-safety
- player-multiplayer-load-e2e
- player-response-privacy
- story-replay-safety
- world-runtime

Every workflow job, permission, concurrency setting, checkout, guard, non-PR trigger and existing path remains unchanged. No wildcard, manual dispatch, writer expansion, secret access or live action is added. Generic duplicate job names are not treated as instructions to enable unrelated workflows. The actual-number authority now locks exactly 23 changed paths and two unchanged read-only validators, retains all main 129 required/94 critical identities and adds the Settings workflow/job for 131/95. These mixed workflow/job identifiers are not a branch-protection inventory.

Local integrated Settings/controller and authority tests pass 25/25 (9 Settings, 16 authority); registered Admin V2 passes 126/126. Full root, backend TypeScript, source integrity and committed-tree scope verification are required before handoff and their final outcomes accompany the candidate commit. Prior browser evidence is historical only. Local full browser and frozen Edge/backend smoke qualification are not certified: the previously recorded unavailable pinned browser/external esm.sh SDK remain cloud limitations. Fresh exact-head hosted Settings browser, Shell, Scroll, Admin Browser, Player, Backend, database and retained cross-cutting gates are mandatory after publication; no missing or guarded check is waived. Independent review and publication are parent-controlled. Production deployment/mutation/secret flags remain false, the beta decision remains BLOCKED, and Settings/REF-015 and broader teacher controls are not complete.


## Serial World and Market reconciliation, 10 November 2026

The earlier scanner-main candidate was independently reviewed at `6e73235eda572d9a9c6bfdae2d8501b6e8331e8f`, but its publication paused for explicit approval of the unchanged disposable local test fixtures in the multiplayer workflow. That exact blob was accepted after approval. Before updating the branch, integrate actual merged main `3b6c713e460bea08565bf67b6314ec85c5183b64`, whose tree `db15c610465c4456ec2c72bb1c40ac9fe7a85dc0` includes qualified World #939 and Market #941. Preserve the original PR924 owner history and all current-main source, tests, metadata, source-review bindings and filter entries. Every Settings runtime/test file remains byte-identical to original `2df1aa48`; every World/Market runtime/test file remains byte-identical to current main. Each of the fourteen workflow deltas is still exactly one PR924 authority-path line; Market already selects the unchanged Settings-owned app.js path. No inherited job or guard changes.

The authority retains both ordered predecessor check sets, adds Market's workflow/job identities and now requires 133 checks/96 critical identities under the same 23 changed paths/25 locks. Generated inventory has 1,340 source files and 97 oversized sources; other current-main debt counts and ceilings are preserved. Both complete parent roadmap sequences are retained with additive status checkpoints only. Lifecycle #927 remains separate and unfinished.

Fresh local integrated source checks pass: full root suite, 25 Settings/authority cases (9 plus 16), and 177 registered Admin cases. TypeScript passes as the first stage of the aggregate; full Edge typecheck stops on the unchanged frozen esm.sh SDK connection refusal, so typecheck:all is not claimed passing. Pinned native browser remains unavailable locally, and no prior-head browser or Market/scanner result qualifies this Settings head. Committed-tree root, explicit TypeScript, exact scope, secrets, whitespace and independent review must finish before publication. Fresh hosted Settings and every retained identity, including the Market gate, remain required. No production deployment, live action, check waiver, legacy retirement or broader completion is authorized.
