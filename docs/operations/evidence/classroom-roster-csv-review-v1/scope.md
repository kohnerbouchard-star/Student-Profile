# Classroom roster CSV readiness check

## Scope and ownership

- Roadmap item: `CLASSROOM-ROSTER-CSV-REVIEW-001`.
- Base: freshly fetched main `a29f4439368aca18e14a06819e5a7ad6040ac74d`.
- Owner: `feat/classroom-roster-import-review-v1`; draft [PR #933](https://github.com/kohnerbouchard-star/Student-Profile/pull/933).
- Reviewed implementation: published source `c79dcdc198c66b4977b0c3da225dba2db3de1dd3`, tree `82f493bfe7c3898d6dadf2d24a3764c662c6db31` (identical to independently reviewed local `a011b41e2c6e965d0cf118874a9e1574c8e96805`). Publication metadata does not change runtime source.
- The owner requested feature-roadmap changes in separate PRs. Current open PR and branch inspection found no active roster-import implementation owner. Existing #924 Settings, #927 lifecycle, #929 startup qualification and the scanner focus correction remain independent and untouched.
- This is only the first local validation slice of secure roster import. Import remains unavailable. No player creation, updates, credential generation, roster matching or upload is implemented or claimed.

## Implementation

`admin/v2/src/routes/players/roster-csv.js` parses a bounded UTF-8 CSV with exactly `display_name,roster_label,player_identifier`, validates names and identifiers, rejects unsupported columns, malformed quotes, invalid/control characters and internal UUIDs, and identifies duplicate IDs within the file. It allows 200 rows and 128 KiB. Errors contain row numbers and instructions, never source values; any error suppresses the entire preview.

`RosterCsvReview.js` owns local file reading and the native modal. It uses text nodes for all values, clears the preview on close/route destruction, prevents late or superseded reads from publishing, and does not use any API or persistent browser storage. The header, instructions and success text all state that import is unavailable and no players were created. There is no submit action. The Players route only opens this dialog, retaining all existing enrollment and credential behavior.

The local check does not establish a server match or validate against an existing roster. The next provisioning tranche must independently validate the submitted file server-side and must not treat this client check as authority.

## Verification

- Pinned Node 22.23.1/npm 10.9.8: 20 new parser/privacy regressions, 115 standard Admin V2 tests, and five retained Players API/controller tests pass.
- Full root `npm test` passes, including architecture, migration, source integrity, auth and release contracts.
- Backend TypeScript passes. Full backend smoke and the Edge check are blocked by the unchanged frozen Supabase SDK import from `esm.sh` (connection refused); neither full smoke nor typecheck-all is reported as passing.
- Real Chromium execution is not locally qualified: the official Playwright Chromium 158 download is invalid/truncated and the executable is unavailable. The new responsive browser suite is syntax-checked and registered in the existing Players workflow without removing any retained gate. It covers safe rendering, no submission/network/storage, duplicate and malformed data, read failures, newer selection ownership, late completion after Close, Escape/focus return, route changes and Back/Forward at 1280, 390 and 320 pixels.
- Regenerated architecture inventory retains 100 oversized files and every existing debt count. Two small source modules are added; no ceiling is raised. Secret and whitespace scans pass.
- Independent read-only review found no actionable defect and independently passed all 20 parser tests plus 2,500 deterministic escaped Unicode/punctuation round-trips. Supplemental system Chromium also failed before browser assertions: `process_singleton_posix.cc socket() Operation not permitted`; fixture configuration was restored. Exact-final-head hosted results remain required before merge. No staging, live-data, full-import or merged-main completion claim is made.

## Next exact item and release hold

`CLASSROOM-ROSTER-ATOMIC-PROVISION-001`: define and qualify server-authorized, game-scoped atomic batch provisioning, secure credential generation and one-time delivery, replay behavior, existing-roster conflict validation and denial cases. This must include a forward migration and real database/security tests before enabling submission. The existing `roster_csv_import_not_configured` response remains unchanged until that tranche is complete.

Attendance history/export stays sequenced after scanner reliability; Contract messaging/materials and notification delivery are separate features with their own authorization and delivery contracts. This PR changes no backend route, RPC, schema, migration, dependency, credential, economic write, release configuration or production state. Keep draft until required qualification passes. No production deployment is authorized.

## Actual-number verification scope

`docs/operations/contracts/player-cross-cutting/pr-933.json` locks these 11 edited files and the two unchanged read-only authority verifier/test paths. It preserves every predecessor check from current-main PR931 and adds the existing Players workflow/job, for 127 required and 93 critical checks. Production deployment, production mutation and secret-value flags remain false. Final-head hosted qualification is pending; initial-head results do not certify the metadata head.
