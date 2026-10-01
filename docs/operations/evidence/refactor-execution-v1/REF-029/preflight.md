# REF-029 — Contract progress read projection

Status: IN_PROGRESS. Base: `28257436a9603b5e7d4094c15a501dbeb7cd55dc`.
Maps to ARCH-401; dependencies REF-007/008/009/028 are VERIFIED_COMPLETE.

## Scope and ownership

2026-10-01 open-PR check: #783 owns independent Marketplace qualification;
#736/#735/#731/#730/#690/#668/#624/#620 retain their existing protected scopes.
None owns this progress read family. Shared inventory/backlog/authority integration
is serialized with the parent before merging; global beta ledger stays untouched.

Permitted files (ten maximum):
- `backend/src/domains/contracts/infrastructure/supabaseContractRepository.ts`
- `backend/src/domains/contracts/infrastructure/contractProgressReadProjection.ts`
- `backend/tests/domains/contracts/ref004Parity.test.ts` (registered acceptance suite)
- this record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-029.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-029 only)
- PR-specific `docs/operations/contracts/player-cross-cutting/pr-785.json`

Generated architecture inventory is counted separately. No package, SQL, auth,
UI, workflow, transaction or production changes. Existing repository tests remain
in their owning file and are imported by the registered acceptance suite.

## Characterization contract

Extract only getPlayerContractProgress, listPlayerContractProgress,
listContractProgressForStaff and getContractProgressById, reusing the same client.
Each makes exactly one player_contract_progress select with the same 12 columns.
Player single: game/contract/player predicates, maybeSingle, missing => null.
Player list: game/player, optional nonempty status filter, created_at descending.
Staff list: game/contract, optional nonempty statuses and truthy player, submitted_at
(descending, nulls last), then created_at descending. ID single: game/contract/id,
maybeSingle, missing => null. List null data => []; no pagination or joins.
Query errors precede mapping, retain code/table/operation/message and empty-message
fallback. Existing mapper retains null timestamps, config validation and payloads.
Progress DTO mapping/select are reused by unchanged write methods; no duplicate
queries, per-row reads or mutation extraction. Single projection ownership is
internal infrastructure, no public repository API change.

Callers remain playerContractHttpHandler (list/submit),
playerContractPublicListHttpHandler (list), playerContractPublicSubmitHttpHandler
(submit lookup), staffContractHttpHandler (progress/review/reward lookups).
Auth/capability/DTO ordering remains in those unedited handlers.

Validation: baseline/post acceptance and repository query traces, lifecycle,
Admin API, Player fixture flows, root npm test, typecheck:all, smoke, architecture,
high-priority/legacy audits, secrets and diff. Network-blocked checks must be
reported as blocked pending exact-head CI, never credited as local passes.
Rollback: revert projection and forwarding together, with no database operation.

## Local evidence checkpoint

Pinned Node 22.23.1, npm 10.9.8 and Deno 2.9.3 with the existing frozen lock/cache.
- Unchanged baseline acceptance: 67 passed; repository: 18 passed.
- Pre-extraction characterization: 95 passed (67 existing acceptance, 18 existing
  repository cases, ten new REF-029 trace/error/filter cases).
- Post-extraction acceptance: 95 passed; lifecycle: 1 passed.
- Player contracts-public, contracts-connected, contracts-submit and
  story-decisions fixture suites passed. These are not live runtime evidence.
- Architecture ratchet, high-priority boundaries, legacy runtime, secrets and
  diff checks passed. Initial root test stopped only because freshly generated
  inventory was not committed; final committed-source rerun is required.
- Backend TypeScript passes; typecheck:all Edge phase and Admin API are locally
  BLOCKED fetching pinned esm.sh Supabase 2.108.2 (connection refused). Full
  smoke is subject to the same unavailable dependency. Exact-head CI must pass
  those checks; local blocked stages receive no passing credit.

Measured production lines: repository 835 -> 726, new projection 199. The
single responsibility is now independently reviewable; net source increases
90 lines for typed read-only seam/delegation rather than claiming code deletion.
Tests add 77 lines; existing 1,131-line repository test remains unchanged.
Of the 417 source/test textual additions/deletions, 121 removed production lines
move verbatim apart from export markers and are not new behavior. Remaining
semantic surface is below the 400-line threshold: internal client interface,
read-only composition/forwarding, equivalent query-error construction and tests.
Scan denominator: source/test files 1,258 -> 1,259, Contracts files 44 -> 45.
All debt and zero-tolerance counts remain unchanged, including oversized files
99. No unsupported score, percentage or debt-count reduction is claimed.

Final committed-source `npm test` passed. Draft PR #785 published from connector
commit `fa18ddcc651cef73e74a184558b63323366b63ae`; its tree equals locally
validated tree `3b4ae3eb9c3b0cc8a7afbcad79281f896f6ebe1b`. PR authority
is added in a following bounded commit, before final exact-head CI qualification.

Independent static review at local `97ca76b4e05f64befb8b57895ec68a8aa5b29369`
(the same published tree) found no actionable defect. All four selected method
bodies/signatures, all ten remaining methods, row/select and mapper match base
exactly. Equivalent direct error construction, unchanged client identity and
acyclic imports were checked. Conservative non-move source/test surface is at
most 177 lines. Review does not replace unavailable live/Edge aggregate evidence.
