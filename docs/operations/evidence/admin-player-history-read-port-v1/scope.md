# Admin Player-history read ownership

Roadmap: `ARCH-401`, bounded tranche `PERSISTENCE-PLAYER-HISTORY-READ-001`.
Baseline: main `9193d4e9865cc591d9d4a3c7289b48b6721574c4` (merged #990).
Status: implemented in draft [PR #993](https://github.com/kohnerbouchard-star/Student-Profile/pull/993), not merged or live-qualified. Source publication `ea277b64b0dd43cd1e911e3605ad74e5756810ad` has tree `120993ce377f9b7a78f23ed63d029d8a4dff5429`, identical to locally qualified source plus evidence.

## Scope

The existing authorized Admin `/players/:id/history-audit` route continues to call
`loadPlayerHistoryAudit`. Its wrapper composes the Players-owned read-history
application with a narrow Supabase read adapter. The application depends only on
a typed read capability, not a database client. The adapter owns the existing
staff-only cross-domain read projection, not economic mutation authority.

Preserve the player lookup followed by seven concurrent reads, table/select/filter
arguments, game/player/target scoping, limits/order, null and settings fallbacks,
error identity and first-error precedence, timeline date fallbacks and stable sort,
response keys and original row objects. No route, permission, SQL, RPC, dependency,
frontend, write/idempotency or deployment configuration changes.

Changed runtime owners: `players/contracts/adminPlayerHistoryReadRepository.ts`,
`players/application/readAdminPlayerHistory.ts`,
`players/infrastructure/supabaseAdminPlayerHistoryReadRepository.ts` and the existing
`admin-api/playerHistoryAudit.ts` wrapper. `playerOperationSupport.ts` retains its
existing independently used player lookup and audit write unchanged.

## Ownership / exclusions

Fetched current main and checked local worktrees/branches and workspace recovery
paths before creating the owner; no existing history-read owner was found. Open
PR938 owns Player login and roster import, PR933 frontend roster, PR992 frontend
scanner. None is changed. Shared inventories and roadmaps need serial integration.
Do not broaden this into a generic repository or a cross-domain write service.

## Characterization

Twenty-two focused tests pass against BOTH the unchanged original handler and the
refactored candidate. They cover exact query traces, absence/wrong scope short
circuiting, each source failure, combined source precedence, row identity,
timeline ordering/ties/missing dates and settings fallback. The test file is
registered by existing `test:admin-api` wildcard and therefore backend smoke.

The finite playerOperations source reader follows only the new value-connected application and adapter; its regression retains query/projection visibility. Local reader suite passes 77/77; core TypeScript passes. Full Admin suite/route Edge check is blocked by the pinned Supabase SDK download at esm.sh (connection refused), not waived. Complete root npm test passes after linking the already-installed dependencies from an identical root lockfile; the first run failed five offline SDK tests because dependencies were absent (not waived). Secret scan and diff checks pass. Independent final source review is clear at source 5b43a241, with 22/22 focused and 77/77 reader tests rerun independently.
exact-head hosted qualification and coordinator approval are required before merge.
No migration, staging, production or complete application acceptance is claimed.
Rollback is a source-only revert of this bounded tranche.


## Actual-PR qualification authority

The exact PR993 allowlist contains 12 changed files and two read-only verifier/test
locks. Both existing denial controls remain unchanged: no production deployment,
production mutation or secret values. The current YAML derivation records 37
applicable workflow families, 74 active job tuples and six guarded skips; no selected
matrix expansion. Closed-only Branch Hygiene is not a PR-open gate. Dynamic CodeQL
is required separately. Duplicate check labels are disambiguated using workflow/job
tuples, not waived. The Admin API Check wildcard and Backend Typecheck full smoke
retain the focused history suite; no workflow changes are needed.

The authority CLI passes and all 16 existing authority regressions pass. Fresh
exact-head hosted results, independent metadata review and serial main reconciliation
after PR992 are still required. Source-stage hosted results do not qualify a later
metadata or integrated commit.
