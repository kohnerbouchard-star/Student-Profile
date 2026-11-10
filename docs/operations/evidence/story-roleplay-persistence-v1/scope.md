# Story roleplay persistence extraction

Status: IMPLEMENTED_NOT_MERGED. Item: PERSISTENCE-STORY-ROLEPLAY-001 / ARCH-401.
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

Evidence/metadata: this directory, the three supporting package hashes in REF-003 candidates.json, actual-number PR authority, the generated architecture inventory and one
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

Published as draft [PR #934](https://github.com/kohnerbouchard-star/Student-Profile/pull/934); implementation `e31349cead6db5b23de5be1e3a2e60c6677887d6`, tree `2efc45c3b9d37b2fcd9e3d40e668eaf2266ae5b4`. Every uploaded blob was verified against the local Git blob identity. Exact-final-head CI remains pending.

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


## Actual-number registration

The metadata-only follow-up records PR #934, its implementation identity and the
exact path authority. It locks 12 changed paths plus two unchanged read-only
verifier/test paths. All 125 required and 92 critical predecessor checks from
current-main PR923 are preserved in order. Production deployment, mutation and
secret flags remain false. No existing authority, workflow or verifier changes.
Keep draft until final-head checks and any required acceptance evidence qualify.


## Committed-tree evidence refresh

A final check on committed head `50e18e40` detected stale REF-003 supporting
hashes for backend/package.json. The earlier root pass used the prior committed
HEAD while validating working-tree scripts. Review confirms the package change
only adds this parity test to the existing Contract suite. Refresh the three
supporting hashes and append that review record, preserving all classifications,
retirement gates, historical measurements and the invalidation assertion. This
necessary evidence maintenance is included in the 12-path authority; no source,
test, guard or budget change is introduced. The full root suite passed against corrected committed tree
`301114fd38ab3ce5be200f56bc0db15b7c2c8b94`; authority CLI, all 16 authority
tests, secrets and whitespace also passed. This result replaces the earlier
working-tree-only qualification for the hash-bound census.


## Main-forward integration after PR935

Observed main advanced to `c616ece3e1cebea79fd33c58f5f04ed961121407`, merging
Admin Crafting extraction PR935. Integrate that main as a merge parent without
changing either runtime tranche. Resolve only the two shared metadata conflicts:
retain both complete Scope Intake entries and regenerate the inventory from the
combined source. Preserve every inherited main file byte-for-byte except the
existing PR934 paths. PR935's historical unmerged intake below is superseded by
its observed merge; no feature or large-file work is added to PR934's own diff.
The PR934 authority now preserves all current-main 127 required/93 critical
checks, including the two new Crafting checks. Exact path locks and read-only,
production-denial and secret-denial flags remain unchanged.

Pre-integration head `eed95aae004e08f156171d7203820c09b652e77b` passed all 39
triggered workflows: 76 successful jobs and eight conditional staging/release
skips. Backend full smoke and all Edge checks passed hosted; the verified smoke
artifact confirms all 24 new parity cases. One database-startup job failed
because loopback port 54322 was occupied before replay/lint; its authorized
single-job retry passed startup, both replays and lint. These old-head results
are not qualification of the new integrated head. Keep draft pending independent
integration review and fresh required checks; no deployment is authorized.

Integrated local qualification: full root `npm test`, backend TypeScript,
Contract acceptance (124), Contract lifecycle (21), Player scope (85), Player
security (59), registered Admin tests (126), authority CLI (12 changed/14 locked),
all 16 authority regressions, secrets and whitespace pass. Exact comparisons
confirm the Story runtime/test/package bytes equal eed95aae, all inherited
Crafting runtime/test bytes equal main, and removing only this PR's intake entry
restores main's entire roadmap verbatim. Regenerated combined inventory measures
1,331 source files, 52 persistence candidates and 99 oversized sources, retaining
both tranches' reductions. Final integrated-head hosted checks and independent
integration review remain pending; old-head CI is historical evidence only.

## Serial reconciliation after PR937

Before publication, main advanced through merged PR937 to
`76a1a7734ffc1cebac29e723a8828e3dacce3d83`. Preserve its public-ID hashing source,
privacy tests, workflow and complete intake byte-for-byte. Only shared inventory
and roadmap conflicts require reconciliation; Story runtime, registration and
parity tests remain unchanged. PR934 now preserves all current-main 129 required
and 94 critical checks with unchanged exact paths and safety flags. The combined
inventory retains both merged improvements and this extraction, with 1,332 source
files, 52 lexical persistence candidates and 99 oversized sources. The owner
explicitly approved publishing this regenerated inventory to the public
Student-Profile repository for PR934. No production deployment is authorized.
Fresh combined-head tests and independent review are required; prior CI results
remain historical evidence and are not a waiver for the new head.
