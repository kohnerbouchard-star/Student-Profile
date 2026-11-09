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
