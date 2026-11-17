# Teacher attendance timing controls

Roadmap ID: `TEACHER-ATTENDANCE-TIMING-001`.
Status: `IMPLEMENTED_NOT_MERGED`, draft [PR #1002](https://github.com/kohnerbouchard-star/Student-Profile/pull/1002), branch `feat/teacher-attendance-timing-v1` from main `9df2064d6835b64ab9f7a3bde19ed1da5356cded`.

## Bounded capability

Native Admin Settings exposes the existing attendance timezone and optional late cutoff alongside rewards. Both participate in draft retention, reset, validation, review, pending-save locking and authoritative refresh. The existing Settings API and idempotent save controller remain unchanged. No new command, migration, RPC, permission, CSS or deployment.

Server contract verification: `game-sessions/application/updateGameSettings.ts` accepts the attendanceWindow object through the existing settings patch. `attendance/api/attendanceHttpHelpers.ts` reads its timezone and lateCutoff. `platform/supabase/edgeTime.ts` accepts a valid Intl timezone and H:MM/HH:MM clock time. Player clock-in uses the configured timezone. Staff scanner uses its supplied valid device timezone first and configured timezone as fallback. Both paths classify an arrival as late only when their local minutes are strictly greater than cutoff minutes. Empty cutoff disables this classification. The UI says that the cutoff minute is present and changes apply to future clock-ins; existing attendance records are not reclassified. Server remains authoritative for timestamp, date, status and reward settlement.

Client validation rejects blank/invalid zones and malformed/out-of-range cutoff times. It does not change device timezone or invent a schedule. Drafts without new fields preserve prior values. Unrelated authoritative attendance settings are retained.

## Ownership

No active runtime overlap with #933/#938 roster, #994 Business, #995 Messages, #996 Loans, #997 Market pagination, #999 Story or #1000 Marketplace. #924 native Settings draft preservation and #927 lifecycle are merged; their behavior stays intact. #998 Crafting is merged in this source base. #1001 Contracts is separate. Shared roadmap changes must be unioned during reconciliation.

## Qualification

- Existing Settings API/controller suite plus added timing cases: 12/12 pass.
- Existing legacy save-lifecycle suite with Settings suite before additions: 75/75 pass.
- Final inventory regeneration records one additional compatibility-marker candidate from the accurate UI hint word `fallback` (208 to 209); all other counts and ceilings unchanged. This is a presentation string, not a compatibility implementation.
- Extended native Settings browser proof verifies review text, outgoing timezone/cutoff and authoritative refreshed values. Local execution blocked before browser launch because Playwright Chromium is absent; no browser pass claimed.
- Full root `npm test`, 312 Admin unit cases and core TypeScript pass. Independent review corrected the hint to distinguish Player configured timezone from staff scanner device-timezone precedence, then cleared source head `0fabb23fb` with no remaining blocking finding. Edge all-roots fails at the unchanged frozen Supabase SDK download (connection refused); complete smoke reaches 24 passing Deno groups before the same unchanged frozen SDK refusal, not an aggregate pass. Hosted exact-head qualification remains pending.

No merge or runtime-completion claim. No deployment or live data mutation. Actual-number authority locks all nine changed paths plus two read-only verifier/test files. CI derivation records 34 workflow families, 69 active job tuples and four guarded skips. No workflow, verifier, guard or permission changed. Next: independent metadata review and fresh exact-head hosted checks before serial merge.
