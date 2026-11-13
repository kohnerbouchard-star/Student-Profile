# Admin Attendance controller read-model extraction

## Local scope and ownership

- Roadmap item: `ARCH-LARGE-ADMIN-ATTENDANCE-CONTROLLER-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, implemented locally and independently reviewed, not published or merged. Hosted/runtime and integration gates remain open.
- Base: `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7` on current fetched `main`.
- Local implementation commit: `959782e574a0e507d1b91afe7a07521a547b1b7c`. No published pull request, hosted workflow result or merge exists for this tranche.
- Owner branch: `refactor/admin-attendance-controller-read-model`.
- Ownership check on 2026-11-13: open PRs #938, #933, #735, #731, #668, #624, and #620 do not own the Attendance controller, the new read-model module, or the added test paths. Shared roadmap and architecture inventory updates must be reconciled additively during integration. PR #943's earlier Attendance presentation extraction is already merged at `db21044f560e44d5aee8d99076513d608ce7260a`; this tranche starts from its current-main result.
- PR #938 owns pending workflow repairs. This tranche does not edit workflows or overlap the separately staged World controller extraction.

## Change

Extract the existing pure payload normalization and scanner outcome projection into `admin/v2/src/routes/attendance/AttendanceReadModel.js`. Keep controller orchestration, mutation routing, scanner lifecycle, timers, error handling, permission checks and private UUID reference ownership unchanged. Re-export the existing `normalizeAttendanceReadModel` entry point from `AttendanceController.js`; its two public exports are unchanged.

The controller falls from 531 to 342 physical lines, with a 198-line focused helper. The standalone architecture inventory changes from 1,353 to 1,354 source files and 93 to 92 oversized files. These counts do not include any unmerged World work.

There are no new API routes, RPCs, migrations, database operations, feature semantics, UI styling changes, deployment settings or production actions.

## Verification

- Baseline characterization: the three new behavioral tests passed against the unmodified controller before extraction, alongside the original Attendance tests (32 total).
- Candidate focused Attendance suite: 33 tests passed on Node 22.23.1.
- Admin V2 aggregate suite: 250 tests passed on Node 22.23.1.
- Complete-function preservation fixture covers all 22 original top-level functions, including the complete controller and its nested operations. SHA-256 hashes are identical to the fetched-main baseline after normalizing only the `export` keyword.
- New behavioral tests cover aliases, source precedence, privacy-safe/frozen projections, malformed inputs, bounded arrays, duplicate labels, sequential loads and timer teardown. They do not claim new stale-read or correction-routing coverage; those controller operations are preserved byte-for-byte.
- Independent read-only review verified all 22 full-function hashes, seven constants, fixture provenance and focused test success without runtime findings.
- Full `npm test` passed, including architecture and regenerated inventory checks. Its existing PostgreSQL-backed mixed-reservation integration case is skipped in this environment.
- Core backend TypeScript passed. `typecheck:all` then stopped at the frozen `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` connection refusal. No dependency, lock or network-permission changes were made to bypass it.
- Backend `smoke` passed 18 Node cases and 23 Deno groups containing 968 cases before the same frozen SDK import prevented the game-session group. This is not an aggregate smoke pass.
- Secret scanning, syntax and whitespace validation passed.
- Browser launch failed because pinned Chromium headless shell 1254 is absent. Installing that exact shell from the official Playwright source failed with a truncated/non-ZIP download (missing central-directory signature). No browser test executed, so native browser qualification remains open.
- No CI, staging, merge or production success is implied by these local results.

## Follow-up and integration restrictions

The current candidate triggers the Attendance workflow through `admin/v2/**` and the existing API test file. Future changes limited to the new test or hash fixture are not covered by its existing path filter. Coordinate adding those paths with the workflow owner; do not silently broaden this extraction into CI repair.

Keep the candidate private until CI safety and the active merge queue allow publication. Recheck current main, ownership, exact-head required checks, and shared inventory/roadmap reconciliation before publishing. Do not push, merge, trigger remote workflows, weaken checks, or deploy production as part of this local tranche.
