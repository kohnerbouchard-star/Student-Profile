# Story roleplay persistence extraction

Status: IN_PROGRESS. Item: PERSISTENCE-STORY-ROLEPLAY-001 / ARCH-401.
Base: `a29f4439368aca18e14a06819e5a7ad6040ac74d`.
Owner: `refactor/story-roleplay-persistence-port`.

## Scope and ownership

The owner authorized reducing misplaced persistence and required a separate PR
from feature work and large-file refactors. This bounded read-only seam separates
three database queries from Story roleplay rendering. It does not reopen the
completed REF-033 effect-preparation task or claim overall ARCH-401 completion.

Current open PRs #668, #924, #927, #929, #624, #620, #731 and #735 were checked.
None owns the selected Story source. #668 shares `backend/package.json`; add only
the new test to the existing Contract acceptance command, preserving every other
script. Inventory and the beta intake are shared metadata and require additive
integration. Scanner, teacher features, context, auth, UI, provider behavior,
economic mutation, SQL, release workflows and large-file refactors are protected.

REF-019 remains untouched: its explicit unresolved-login/throttle stop condition
is not cleared by closed-unmerged #736. No incident-resolution claim is made.

Editable runtime/test paths:
- `backend/src/domains/storylines/services/storyDecisionRoleplayService.ts`
- `backend/src/domains/storylines/contracts/storyDecisionRoleplayReadRepository.ts`
- `backend/src/domains/storylines/infrastructure/supabaseStoryDecisionRoleplayReadRepository.ts`
- `backend/src/domains/storylines/index.ts`
- `backend/tests/domains/storylines/storyDecisionRoleplayParity.test.ts`
- `backend/package.json` (existing test registration only)

Evidence/metadata: this directory, actual-number PR authority (after creation), the generated architecture inventory and one
additive beta Scope Intake entry. No legacy path is deleted without reachability
and retirement evidence. The 53-file lexical count is not a removal target.

## Frozen behavior

The sole runtime caller is the Contract public-submit handler through the Story
public index. The already-authorized submission commits once before rendering;
rendering failure is caught and cannot invalidate or repeat that mutation.
Keep the public client/input signature and caller unchanged. Compose the new
repository inside Story, using the same request-owned client.

1. Read one decision by server-derived game/player plus contract key, selecting
   exactly decision/option/rationale/character/tags/dimensions. Query error,
   malformed row or missing required strings returns null before more reads.
2. Read one active definition by decision key. Existing behavior uses returned
   data even alongside an error; missing/malformed prompt uses defaults.
3. Only when character key is nonblank, read one relationship by game/player/key.
   Existing behavior uses returned data even alongside an error; missing data
   leaves default character/stage/trust/memory. No extra call, cache or retry.
4. Read the same provider settings after context. Preserve default/authored
   acknowledgement, 6-second abort, prompt, memory allowlist, tag truncation,
   structured output, 900-character cap and all provider fallback paths.
5. Database exceptions still propagate to the caller's existing catch. Returned
   database errors keep their distinct handling above. No write method exists
   on this read port; no policy, auth, rate limit or transaction is changed.

## Validation plan

Run the new public-boundary characterization cases on unchanged source before
extraction, then unchanged cases after it. Add repository-free service coverage.
Run Contract acceptance/lifecycle, Player security/request-scope, Story tests,
backend TypeScript, full Edge checks/smoke, root tests, architecture/boundary,
legacy and secret guards. Use pinned Node 22.23.1/npm 10.9.8/Deno 2.9.3.
Provider tests are synthetic and deny network. No hosted provider, database,
staging or production action is authorized or required for this read-only move.

Publication identity and exact-head CI remain pending below.

## Local qualification

Four runtime paths, one parity suite and its existing Contract-suite registration
implement this change. Twenty new characterization cases passed against unchanged
main source; all remain unchanged in the final suite. Four additional cases prove
repository-only injection, exceptions from both optional reads and the six-second
abort. The final 24 cases and 124-test registered Contract acceptance suite pass.
Independent review found no actionable defect and separately reran the final 24
cases. Contract submission, public API and provider block are unchanged.

Passed with pinned tooling:
- clean root/backend lockfile installs (npm cache explicitly in a writable temp directory);
- root `npm test`, backend TypeScript;
- Contract acceptance (124), Contract lifecycle (21), Player request-scope (85)
  and Player security (59);
- architecture inventory/ratchet, high-priority boundaries, legacy runtime,
  secrets and whitespace checks.

Full Edge-root checks and aggregate backend smoke are BLOCKED by connection
refusal fetching the unchanged pinned `esm.sh/@supabase/supabase-js@2.108.2`
module. Smoke passed its preceding suites, including economic ledger invariants,
then stopped in Game Sessions import resolution. Later aggregate stages are not
claimed passed. No dependency, lockfile, test guard or network policy was changed.
Exact-head hosted checks remain required. No staging/production evidence claimed.

Measured source inventory: 1,325 -> 1,327 files; lexical persistence candidates
53 -> 52. The Story renderer's three database calls are now zero, with the same
three in its repository. Other debt counts and all ceilings are unchanged.
The parity suite lives in `backend/tests/domains/storylines/`, matching the
existing domain characterization-test layout, and runs in Contract acceptance
and aggregate smoke. Its initial placement under src added one lexical
compatibility match solely because the tests assert the existing fallback
response. The suite was relocated intact, not obscured or weakened; no new
runtime fallback or compatibility path exists. The inventory's five-root source
denominator excludes backend/tests and must not be presented as test coverage.

Rollback is a normal revert of this bounded source change. No stored data,
transactional authority, existing legacy path or production state was modified.
