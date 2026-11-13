# Retained Admin test coverage repair

- Item: `MAINT-ADMIN-RETAINED-TEST-COVERAGE-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, local only. No PR, merge, hosted run, or production change.
- Implementation commit: `2fae1916bd0c6bc29256b9365835ad0fcee9b3ca`.
- Base: `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7`.
- Owner: `fix/admin-retained-test-coverage-20261113`.
- Scope: two independently reproduced stale test expectations; focused suite registration; existing Admin Shell Smoke test-path selection. No runtime files, migrations, routes, RPCs, queue operations, permissions, secrets, or roster changes.

## Baseline evidence

Running the retained World Management and Inventory test files on fetched main yields 13 passes and 2 failures. Inventory expects superseded disclosure text. World expects planned News & Events and Marketplace routes and an older World description. Current code and the already-registered Admin unit tests verify both routes are V2, with separate capabilities and controllers.

## Implementation

- `scripts/admin-v2-world-management.test.mjs`: align V2 route and separate-monitor wording; add capability/mode and separate-controller assertions. Retain mutation isolation and responsive checks.
- `scripts/admin-v2-inventory-contract.test.mjs`: require current-page scope and no second owned-balance ledger disclosure. Retain provenance and cross-domain isolation assertions.
- `package.json`: register both retained files and the registration guard in the existing `test:admin-v2` command. Existing tests remain registered.
- `.github/workflows/admin-shell-smoke.yml`: add both retained files, the registration guard, Marketplace/read-model test paths, and package/lockfile inputs to pull-request and main-push filters. Existing jobs, checks, permissions, and commands are unchanged.
- `scripts/admin-v2-test-registration.test.mjs`: require focused runner registration and both event filters. The read-model test path anticipates the separate Marketplace extraction and does not assert that unmerged source is present.

## Ownership and integration

The seven current open PRs include roster #933/#938 and shared architecture/authority #668. This lane does not change their owned runtime or workflow files. Reconcile the append-only roadmap entry with the integrator's shared roadmap update; do not overwrite intervening entries. The parallel Marketplace extraction at `872b90a5` imports its read-model tests from the already-registered `scripts/admin-v2-marketplace.test.mjs`. Preserve that import when integrating; do not also add the read-model file as a separate CLI argument, which would execute it twice.

No new workflow or hosted run is introduced. Tests added to an existing suite strengthen coverage without bypassing required gates.

## Verification and next step

All local checks used Node `22.23.1` and npm `10.9.8` where applicable:

- Retained World/Inventory tests plus registration guard: 18/18 pass (baseline retained files alone: 13/15).
- `npm run test:admin-v2`: 264/264 pass, with no skips.
- `node --test scripts/admin-v2*.test.mjs`: 595/595 pass. This is the broader Admin selection, not the focused CI suite count.
- Full `npm test`: passes, including current architecture inventory, boundaries, source contracts, and repository tests. Root dependencies reuse the exact matching lockfile's installed dependencies; no dependency changes.
- Registration negative checks in an isolated fixture: 19/19 deliberately removed runner registrations, event filters, or workflow suite invocations are rejected.
- Independent review repeats the 18/18 and 264/264 checks and independently rejects all 19 omissions. It confirms the workflow equals base plus 14 additive path entries and original runner entries/order remain intact. No blocking findings.
- YAML parsing, unchanged event/job/permission structure, no duplicate paths, JavaScript syntax, secrets scan, and `git diff --check`: pass.

Browser, database, backend typecheck/smoke, hosted CI, and production qualification were not run for this test/config-only tranche; no runtime files changed. No hosted jobs were dispatched or cancelled. The final integrated tree still needs its applicable checks.

Next: integrate this reviewed test-only patch with current local batches, retain the Marketplace read-model test import, and qualify the combined tree before publication. If the separate World extraction relocated presentation strings, preserve its helper-aware source reads while retaining the corrected route/capability assertions. Runtime refactor inventory regeneration remains integrator-owned.

## Combined integration qualification (2026-11-13)

The two reviewed local candidates `feac09e4f1441a021f8e6145b1380d5946bd6b1c` and `b17683daf7ebe98f8d091b9d5c152f4baf35fc4f` are integrated on freshly fetched and API-verified main `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7` in `fix/admin-contracts-preservation-coverage-20261113`. Integrated source/evidence commit `71e43e1494f1cfef0f270150d77a0cf529192967` has tree `ed709f36099f72f599097605d9c2d960b4a6c2be`. The only conflict was the two new Scope Intake entries; both and every historical entry were preserved. No roster or other active PR source was changed.

Fresh combined validation passes all 601 Admin cases, the 264-case focused Admin suite, full root tests, backend TypeScript, the seven frozen-lock Deno adapter cases, inventory equality and whitespace checks. Independent review repeated Contracts/teacher safety 16/16, retained coverage 18/18, focused Admin 264/264 and adapters 7/7, finding no introduced blocking defect. The combined tree removes the two inherited stale-test failures rather than excluding them.

Aggregate Edge typecheck remains blocked by the frozen Supabase SDK connection refusal. Full backend smoke and native-browser qualification are not claimed complete; the pinned Chromium installer returned truncated archive errors. These local environment limits do not waive exact-head hosted qualification. Current production release and Admin cutover workflows require separate manual authorization; no production dispatch or deployment was performed. The existing 24-country targeting cap remains a separate unresolved limitation.

Next: publish this bounded correction as a draft, verify the exact public tree and all applicable hosted checks (including native Contracts/browser and database checks), and merge only after they pass. The four-controller extraction follows the resulting current-main commit and must preserve these correction and coverage semantics. No feature, full-roadmap or staging completion claim.

## PR #953 exact-head qualification authority

Draft PR #953 publishes source `ab8340524b3158d8e599e70d265297dda3b20f78` with the exact independently reviewed tree `126c5da651aa329983d94404d96c19880af10e07`, sole parent main `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7`. Initial source CI is interim, not merge qualification.

The actual-number authority `docs/operations/contracts/player-cross-cutting/pr-953.json` preserves all ordered 143 required and 101 critical predecessor checks, then adds the Contracts and Admin API workflow/job identities for 147 required and 103 critical identities across 55 workflow families. Its exact scope is 27 changed paths and 29 locks, with the existing verifier/test read-only. Eleven otherwise-unselected prerequisite workflows receive only the exact PR953 authority path. Admin API checkout binds the actual PR head with persisted credentials disabled; its commands, tests, permissions and guards remain unchanged. All existing workflow events and paths remain. Production deployment, production mutation and secret handling are denied by the authority.

The complete authority/source union must pass its fresh hosted checks before normal merge. Earlier local-only and no-PR statements above describe candidate preparation, not the current published state. No roster merge, live staging certification or production action is authorized by this change.
