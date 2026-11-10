# Names-only roster CSV input and import review

## Scope and ownership

- Roadmap item: `CLASSROOM-ROSTER-CSV-REVIEW-001`; paired backend item `CLASSROOM-ROSTER-ATOMIC-PROVISION-001`.
- Existing owner: `feat/classroom-roster-import-review-v1`; draft [PR #933](https://github.com/kohnerbouchard-star/Student-Profile/pull/933).
- Current-main integration: `56c72864`, including merged #932 Crafting guidance, #935 Crafting extraction and #937 public-ID hashing. Complete inherited source, scope entries and check requirements are preserved. Settings #924, lifecycle #927 and scanner/startup #929 remain separate.
- The owner explicitly requested CSV input mechanics, then clarified: student names only. The original `display_name,roster_label,player_identifier` preflight contract is superseded. No ID, password, email, roster label or other field is required from the CSV.
- The names-only amendment is published in draft PR #933; this fixture correction and main-forward integration await independent review and renewed exact-head qualification. No actual student data is collected or transmitted during development. Only synthetic fixtures are used. No production deployment is authorized.

## Input and account behavior

`roster-csv.js` accepts one name column, with or without a heading. Automatic detection recognizes `Name`, `Student name`, `student_name` and `display_name`; an explicit selector resolves ambiguous first rows. Preview makes heading treatment visible. The parser bounds UTF-8 input to 128 KiB and 200 students, trims/NFC-normalizes names, retains ordered repeated names as distinct rows, and rejects extra fields, malformed quotes, controls, invalid UTF-8 and internal UUIDs. Errors never echo source values. Invalid input produces no partial preview.

`RosterCsvReview.js` keeps the file and preview in dialog memory. Reading a file does not transmit it. An unchecked confirmation describes the student count, selected game, creation of new accounts and one-time credentials. Only an explicit checked Create action sends `{studentNames:[...]}` to the existing authenticated game-scoped import route. A raw CSV file is never uploaded. Existing students are not matched, overwritten or merged by name. Every confirmed row is intended to create a new account, including same-name students already in the game.

The separate backend owner `feat/classroom-names-roster-provision-v1` supplies the actual protected route, atomic migration and credential generation. This frontend branch alone leaves the backend's existing unavailable response intact. Both changes must pass combined qualification before release; no real import success is claimed here.

## Data and credential lifecycle

- Imported names persist in the Econovaria game roster and its private scoped import receipt through canonical account creation and idempotency. The aggregate audit event contains the count, not student names. No new external identity provider, invitation, notification or third-party destination is introduced.
- The browser sends no supplied IDs or credentials. The server generates a public sign-in identifier and strong random Access Code for each row. Existing canonical credential hashing is retained by the backend.
- Fresh successful responses show the generated sign-in details once. The dialog stays open without an automatic roster refresh that would destroy them. Teachers must privately copy the codes before closing. There is no clipboard, file-download, email or notification side effect.
- Replay contains no codes. It states that the import already completed and directs staff to the existing protected per-student credential replacement action if codes were lost. It never claims to recover old codes.
- The import controller retains only an in-memory names fingerprint and idempotency key, not names or codes. All failures keep the same key. Duplicate clicks are blocked; a retry is explicitly requested. Closing/reopening the same ordered roster in the same controller keeps its key. Browser reload/logout loses the in-memory retry context, so an uncertain outcome warns staff not to start a new import and to check the roster.
- Raw file content is cleared on submission; parsed names remain in dialog memory for a safe retry until success or dismissal. Visible code/name text is removed on close, navigation or controller destruction. Late file reads and responses cannot publish into a destroyed view. No sensitive values are placed in persistent browser storage, generic notifications or raw errors.
- Same-origin BFF transport retains cookies, CSRF/device/game scope, no-store, no-referrer and no redirect. Internal UUIDs, unexpected response fields and malformed result identities never become presentation data.

## Verification and unresolved gates

- Pinned Node 22.23.1/npm 10.9.8: 18 names-only parser/privacy cases, nine import API/controller cases and five retained Players tests pass (32 total). All 153 standard Admin tests pass.
- Full root validation passes for this amendment, including architecture, migration source, auth and release contracts.
- Browser suites now register names-only headings, repeated names, 1280/390/320 layouts, local-only preview, read races, explicit confirmation, fresh credentials, lost-response same-key replay, code dismissal and in-flight navigation. They use only synthetic browser routes. They have not run locally: official Chromium download was invalid/truncated; system Chromium's socket initialization was denied before any browser assertion. Hosted Players and local-preview suites passed on the prior published names-only amendment. The import suite passed its fresh creation/receipt/layout/dismissal assertions, then failed a storage assertion because a 16-character code prefix collided with the existing public synthetic CSRF fixture. The correction checks every full name, identifier and access code, proves fixture noncollision and detector sensitivity, and checks replay retains names/identifiers without codes. No runtime defect is evidenced; the complete corrected import suite remains mandatory.
- Independent frontend review found and resolved a pending-read race: import opening is disabled during roster reads, and new reads defer while the review/results dialog owns the view. A delayed-GET browser regression is registered. Re-review found no additional actionable source issue. The corrected nine three-row import scenarios subsequently passed hosted at exact head 1b38f0c1; the expanded 30/40-row suite below remains pending.
- Backend TypeScript passes.
- Backend-only source, migration and rollback SQL fixtures are being qualified in the separate owner branch. Local Docker/psql are unavailable. Real disposable PostgreSQL replay, rollback/ownership/replay assertions and lint remain mandatory.
- Resource feasibility remains a release blocker: existing 600,000-iteration PBKDF2 took 82 ms for one credential, 2,510 ms for 30 and 17,272 ms for 200 locally, not proof of Edge CPU limits. The Vercel BFF has a 30-second limit. Do not reduce hashing strength or treat mock tests as realistic bulk qualification. Bound or redesign execution if actual supported-runtime limits cannot be met.
- Inventory: 1,335 sources, 99 oversized files; all other debt counts and ceilings unchanged. Four new feature modules are below 500 lines. No dependency, build-tool or release-setting change.

## Historical preflight evidence

Original published source `c79dcdc198c66b4977b0c3da225dba2db3de1dd3` and final metadata head `d792cd924166b5066937740c2add1f18374abd06` implemented only local preflight. Independent source/metadata review was clear. Hosted Players browser, backend full typecheck/smoke, repository quality, Player Verify and database replay passed on that old head. The sole automatic failure was unchanged scanner startup cancellation in Admin Shell; #929 owns it. Those results do not qualify current names-only import code. Retained Multiplayer/Load and any other unselected gates are not waived.

## Authority and next step

`pr-933.json` retains every current-main predecessor requirement plus Players workflow/job and unchanged verifier/test read-only locks. Production deployment, production mutation and secret-value flags stay false. The 17 changed paths plus two read-only paths retain 131 required and 95 critical checks. The expanded scope covers the owner-requested input implementation.

Next: independently review this fixture correction and main integration, publish the permitted amendment without publishing a routine PR-description status update, then exact-head hosted frontend and paired-backend qualification. Keep draft and do not merge or deploy until all applicable gates are satisfied.


Current-main continuation after publication permission: preserve all merged #932 and #937 runtime, tests, workflow, authority and complete scope intake byte-for-byte. Only inventory regeneration and additive roadmap integration conflict with this roster owner. Prior local passes remain historical until this combined tree is rechecked. User explicitly approved publishing the generated architecture inventory for the names-only roster work; no production action is included.


## Typical classroom browser qualification

The owner expects about 30 students per roster. The synthetic import browser suite now registers 3, 30 and 40 rows at 1280/390/320 widths across fresh creation, lost-response same-key replay and in-flight navigation (27 scenarios). Repeated names remain distinct, all row identities/codes are checked, code-free replay and dismissal/storage/log privacy remain mandatory, and the 200-row limit is unchanged. The nine prior three-row scenarios passed hosted at exact head 1b38f0c1; expanded 30/40-row execution is still pending. This is mocked transport UI evidence, not deployed atomic-import or Edge CPU qualification. Paired backend draft #938 owns real SQL/class-size and runtime-limit qualification.
