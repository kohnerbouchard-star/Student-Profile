# Player World Runtime row translation

## Scope and ownership

- Roadmap item: `ARCH-LARGE-WORLD-RUNTIME-ROWS-001`, a bounded behavior-preserving large-file follow-on. This does not advance the separately owned context-propagation program.
- Baseline: freshly fetched `main` at `96fa4df0f3d6a6de6579a69cefb8ddc11031e4a4`, containing merged Player interactions #960. Older pending #958/#959/#960 entries describe source preparation rather than current branch ownership.
- Owner: `refactor/player-world-runtime-rows-20261114`. Seven current open PR pathsets (#938, #933, #735, #731, #668, #624, #620) contain no World repository runtime/test ownership overlap. Roster, CSS, release control and global-ledger owners remain separate. Shared inventory and additive roadmap intake will be reconciled serially.
- Extract only adapter-local row definitions and pure row interpretation/validation from `backend/src/domains/world/infrastructure/supabasePlayerWorldRuntimeRepository.ts`. Keep the complete repository factory, reads, writes, ordered guards, game/player filters, follow-up query order and public exports unchanged.
- No API, route, RPC, migration/schema, economic policy, persistence behavior, UI, dependency, credential, permission, live-data or production change. Existing workflow checks and production guards remain mandatory.

## Implementation and structural review

- Repository: 996 to 475 physical lines. The retained owner still contains all asynchronous orchestration and database result guards.
- `playerWorldRuntimeRowMapping.ts`: 391 lines of pure interpretation and validation. Its only runtime dependency is the existing `WorldRuntimeError` contracts owner; no client, mutable state or repository dependency is introduced.
- `playerWorldRuntimeRows.ts`: 189 lines of adapter-local interfaces. The original module preserves the client type reexport and its sole runtime factory export.
- All 58 original top-level declarations, including 35 functions and every nested repository method, remain byte-identical except internal export keywords. Independent comparison and caller/binding review agree. No initialization, query timing, filter, error-order, coercion, freezing or public-identity semantics changed. `structural-comparison.json` binds the source hashes.
- Deterministic inventory: 1,381 sources and 83 oversized files, down from 84. Every other debt count and ceiling remains unchanged. Five cohesive test/fixture modules remain below 500 lines.

## Verification

- The identical 146-case adapter suite passes against untouched baseline runtime and candidate: 133 new public-entrypoint characterizations plus all 13 retained REF032 cases. Three additive imports retain the existing World suite/smoke registration; no previous test, command or gate is removed.
- Coverage includes all eight public methods, exact query/RPC/write order and payloads, game/player filters, Promise.all admission, error precedence and cardinality, optional rows, public/internal journey identity, Campaign/Arrival registry interpretation, malformed/coerced values, timestamp/null behavior and shallow freeze/reference identity.
- Independent source review, existing 74-case World suite, core TypeScript, complete Player verification, Admin World publication contract, structural comparison and secret scan pass. The expanded registered World suite passes 207/207 on baseline and candidate. Full root tests and final core TypeScript and secret checks pass.
- Full local `typecheck:all` and backend smoke are incomplete at the unchanged frozen SDK import `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` (network connection TTL expiry). Before that blocker, smoke passed 1,027 Deno cases in 23 groups and 18 Node cases. This partial run predates final additive test registration and is not an aggregate pass. Fresh exact-head hosted backend checks remain required.
- No browser assertion, staging acceptance, live data access, publication or completion is claimed by local source preparation.

## Next gate

Finish local extraction and characterization, independently review and restore recovery, then request parent-controlled serial publication. Publication must be draft with actual-number authority preserving all predecessor required/critical identities. Merge requires fresh exact-head hosted qualification and postmerge verification. Production remains held.

## Serial-lane release

The parent confirmed the integration lane is clear and roster remains local pending its separate decision. After local and independent qualification and private recovery, this unrelated candidate may be published as draft, receive its actual-number authority and fresh exact-head hosted checks, then merge normally if qualified and undergo full postmerge verification. This does not relax any check or authorize production deployment.

## PR #961 publication and authority

Draft [PR #961](https://github.com/kohnerbouchard-star/Student-Profile/pull/961) publishes source `1f5fcc048aa2fb9ee0859b34a74018d45f8fe9f0` with independently reviewed tree `28e6c01189b9ce895519e56f857e3c388f5098f0`. Frozen recovery reproduces all 13 changed paths and that exact tree from baseline only, verifies 41 checksums, passes 146 restored adapter cases and regenerates inventory byte-identically. Actual-number authority preserves the ordered 147 required and 103 critical identities and all 55 workflow families. The authority locks 39 changed paths plus two unchanged read-only verifier paths. Twenty-five additive own-authority selectors schedule otherwise-unselected families; preserve every job, command, permission, non-PR trigger and production denial. Final-head local gates and independent metadata review precede publication of the qualification amendment. Source-stage checks cannot qualify the amended head.
