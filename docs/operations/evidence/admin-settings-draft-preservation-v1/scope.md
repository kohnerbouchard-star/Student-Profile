# Admin Settings draft preservation

## Scope and ownership

- Item: `BETA-ADMIN-SETTINGS-DRAFT-001`, one bounded child of the teacher management request.
- Branch: `feat/teacher-management-flows-v1`, based on current main `08134650`.
- Preserve the in-memory Settings form and its validation/automatic Custom state across native route navigation and browser Back/Forward. No browser storage persists private drafts.
- Both refresh controls confirm before discarding unsaved values. Game switching checks before writing the selection; browser reload/close warns for unsaved or in-flight changes.
- Serialize saves, disable editing during pending save/read refresh, preserve failed-save retry identity and reset the reusable review dialog before retry. Clear the draft after acknowledgement, not at dispatch.
- Runtime paths: `admin/v2/src/app.js` and `admin/v2/src/routes/settings/{SettingsController,SettingsRoute}.js`.
- Regression paths: existing `scripts/admin-v2-settings-api.test.mjs` and `scripts/admin-v2-settings-browser-smoke.mjs`, already selected by the unchanged Settings workflow.
- Generated architecture inventory reflects only the app.js line-count change. Scope Intake records this child without editing other entries.

PR #668 retains backend context/global-roadmap ownership. Its branch and existing entries are untouched. Settings retirement remains separately owned by REF-015; no legacy loader, Settings compatibility, retirement register, deletion or observation gate changes. Game lifecycle controls are a separate, unfinished management slice.

## Verification

Local Settings API/controller tests: 9 passing. Source browser regression qualification is in progress; existing checks are retained and extended for route/history preservation, refresh cancel/accept, browser reload cancellation, game-switch cancellation, save-in-flight navigation, and failed-save retry.

The first browser run found the retained confirmation dialog stayed busy after closing, which prevented retry. Settings now resets that dialog only before a new permitted submission. A second fixture run exposed an incomplete two-game session fixture; status and bootstrap now agree. These failed attempts are not successful qualification.

Backend TypeScript/all Edge roots pass. Full backend smoke and root aggregate are in progress. Root first stopped at the expected regenerated app.js inventory delta; no audit was weakened. Published exact-head CI is pending. These are local synthetic fixtures, not deployed or production qualification.

## Boundary and rollback

No API/BFF/backend, migration, route/RPC, economic policy, authorization, idempotency contract, dependency, workflow, release hold, credentials, hosted application data or production change. Keep draft. Revert this bounded source tranche to roll back; no database rollback is needed. Do not mark the parent teacher-controls request or REF-015 complete.
