# REF-028 — Contract availability read boundary

Status: IN_PROGRESS. Integration base main: `575ba64e62896ceac9ce63abb4023385ef65eb05`.
Original characterization base: `207eb2cd4e72e4cee7a95b147a3a0eeb37b00ed9`.
Intervening REF-025 blocked ownership and REF-023 qualification/closeout are preserved;
no runtime application change occurred in either integration.
Dependency REF-016 is VERIFIED_COMPLETE (merge `c80b0b515657eb4a0fec8797314f7ece4d53933a`).
Maps to ARCH-208/ARCH-401; does not close those wider programs.

## Scope lock and ownership

Rechecked open PRs #736/#735/#731/#730/#690/#668/#624/#620 and their changed
paths on 2026-10-01. None owns this Contract availability seam. Preserve their
Player binding/context, release, CSS and planning work. REF-023 runs separately;
shared documentation/inventory integration is serialized after its current main.
No backend package, workflow, SQL, UI, auth, Story or reward change is permitted.

Ten meaningful paths maximum:

- `backend/src/domains/contracts/services/playerContractAvailabilityService.ts`
- `backend/src/domains/contracts/infrastructure/supabaseContractAvailabilityReadRepository.ts`
- `backend/src/domains/contracts/api/playerContractHttpHandler.ts`
- `backend/src/domains/contracts/api/playerContractPublicListHttpHandler.ts`
- `backend/src/domains/contracts/api/playerContractPublicSubmitHttpHandler.ts`
- `backend/tests/domains/contracts/ref004Parity.test.ts` (already acceptance-registered)
- this evidence record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-028.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-028 only)
- `docs/operations/contracts/player-cross-cutting/pr-781.json`

Generated `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`
is separately counted. Only `resolveActivePlayerCountryCode` persistence moves;
its three HTTP callers import the infrastructure function directly. No forwarding
alias, extra policy, broad port or repeated query is introduced.

## Existing input precedence and parity contract

The service already has an explicit readonly player/game/country/roster/now input
and database-free `isContractAvailableNow`. Preserve its implementation: game
match precedes active/scheduled lifecycle, valid publication <= supplied now,
exclusive expiry > now, then public or case-insensitive player/country/roster
OR targeting. `deadlineAt` is not an availability filter; do not silently repair
that policy. List reads active and scheduled collections concurrently exactly
once, filters both, keeps the last duplicate ID, and sorts descending publication
(or creation) time. Repository rejection propagates unchanged.

Country lookup follows authenticated session resolution and existing scope checks.
Its first query selects `country_profile_id,assigned_at`, filters game, player and
active assignment, orders assigned_at descending, limits one, then maybeSingle.
A missing/error/blank assignment stops at one query. Otherwise the second query
selects country_code by profile ID only; trim/uppercase remains unchanged. Missing,
blank, database error and any thrown lookup all return null. No retry or broader
lookup is added. The country profile is existing reference data, not a newly
game-filtered table.

Accepted/completed/progress lock and action gating remain in existing HTTP/service
owners. Paused-game checks and acceptance limits stay in their existing acceptance
repository/RPC; this extraction adds no second authority. Optional Story roleplay
is post-submission decoration with null fallback, not an availability dependency.
The three consumers retain their distinct auth/validation ordering, clock
injection, errors, DTO privacy and progress rules.

## Verification and rollback

Characterize country query trace/error fallbacks and pure policy/list behavior on
the unchanged base before extraction, in the existing Contract acceptance suite.
Run acceptance/lifecycle and Player security, Player contracts-public,
contracts-connected, contracts-submit and story-decisions. Run root npm test,
backend typecheck:all/smoke, architecture/high-priority/legacy audits, secret scan
and diff check on final source; distinguish blocked checks from passes.
PR exact-head checks remain required. No production/staging mutation or runtime
certification is claimed. Roll back the extraction and three imports normally;
preserve unrelated later incident fixes. Stop if parity requires policy changes.

## Local characterization and implementation evidence

Draft [PR #781](https://github.com/kohnerbouchard-star/Student-Profile/pull/781),
initial published source `bd01ed9d98759ca7a230834561e54190ff3359de`, tree
`c50243d5f6c839392b2660e651c173d8a21f801d`, exactly matches the locally checked
rebased implementation. Publication uses the connected repository; no credentials
are introduced. The final authority/evidence commit changes no application source.

Pinned local tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Synthetic fixtures only.
All commands below exited 0 except the two explicitly blocked aggregate checks:

- `npm --prefix backend run test:player-contract-acceptance`: 67 passed before
  extraction, 67 after, and 67 after docs-only rebase. Includes 20 REF-028 cases
  and two previously existing pure-policy tests now registered in this suite.
- `npm --prefix backend run test:player-contract-lifecycle`: 1 passed.
- `npm --prefix backend run test:player-security`: 59 passed.
- Player `contracts-public`, `contracts-connected`, `contracts-submit`,
  `story-decisions`: all four fixture suites passed (not live/browser evidence).
- `npm test`: passed before and after rebase, including architecture,
  high-priority-boundary and legacy-runtime audits. `security:secrets` passed.
- `npm --prefix backend run typecheck:all`: TypeScript passed; Edge-root phase
  BLOCKED with exit 1 fetching pinned esm.sh Supabase 2.108.2 (connection refused).
- `npm --prefix backend run smoke`: BLOCKED with exit 1 at game-session imports
  for the same pinned network dependency, after preceding smoke suites passed.
  Neither aggregate receives local passing credit; exact-head CI must pass both.
- `git diff --check`: passed. Independent read-only review found no correctness
  issue and verified the resolver body and remaining policy are byte-identical.

Measured inventory: persistence outside infrastructure 53 → 52; source/test scan
1257 → 1258; Contract source files 43 → 44. Other inventory debt counts unchanged.
There remain exactly three production country-resolver consumers, all directly
importing the infrastructure owner; no service forwarding alias or raw query
remains. Ten meaningful changed files with authority, plus generated inventory.
No missing runtime gate is relabeled complete; parent owns serialized integration.

## Serialized integration

Pre-integration head `dd713411bee65f298536de62e9f85adad61064eb` passed all 29
PR workflows, 60 jobs and Vercel, with four expected conditional job skips.
Backend typecheck/smoke: run `36823736905`, job `110244694938`; all four critical
Store/FX jobs: run `36823736883`. Local network blocks are thereby explained,
not waived. After REF-023 closeout merge `575ba64e62896ceac9ce63abb4023385ef65eb05`,
regenerated inventory is unchanged; the combined head requires fresh full CI.
