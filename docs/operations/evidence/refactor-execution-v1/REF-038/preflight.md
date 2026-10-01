# REF-038 pure country-exposure family extraction

Status: VERIFIED_COMPLETE. Base main `09fd066c44a8b49f69b36eca1ba6b3baacddd8ce`.
REF-005 is VERIFIED_COMPLETE; REF-037 has an independent Dashboard owner and is
not a prerequisite. No active Stock-engine owner overlaps. Preserve all current
incident, release and paused-task gates.

## Exact scope and mechanical movement

Eight meaningful paths: stockMarketEngine.ts, new countryExposureProfiles.ts,
existing stockMarketEngine.test.ts, existing stockMarketRunnerHttpHandler.test.ts
(registration only), this record, REF-038 task, only its backlog entry and the
exact-PR Player authority manifest. Generated architecture inventory is separate.
All four source/test paths live under backend/src/domains/stocks/. No workflow,
package, SQL, seed, RNG, tick-order, rounding, price-rule or coefficient changes.

One cohesive pure module owns the constants/types/profile table and existing
country resolver/normalizer. Keep one-way named engine compatibility re-exports
for existing imports. The engine's official-country Set remains where it was;
the imported array and profile objects retain their shared identities. The new
module has no imports, clock, RNG call, persistence or other initialization effect.
Sector normalization remains in the engine, unchanged.

The literal move comprises 300 data/type lines plus eight resolver lines and
four normalizer lines. The first two blocks are byte-identical; the normalizer
only gains an export modifier. Mechanical removal/addition is measured separately
from imports, comments, tests, evidence and registration; nonmechanical changes
must remain below 400 lines and the eight-file ceiling. No arbitrary profile
fragmentation is introduced to disguise the cohesive move.

Unmoved block SHA256 identities:
- Data/types: `b8a674e992814842f4fef22b273541b61bde7975c068dd488e6f5fbb5c9c1320`
- Resolver: `fd3ed224ee5c6f2b13b7aaf00490bf752084c357492e5d8f79e54e35ed722122`
- Normalizer before export modifier: `be919afea51f2bf10a1023a4d0569afd40fb486fa772212ac556fe438ddcc631`

## Characterize first and prove parity

Baseline engine suite passes 27 tests. Four added cases pass before the move
(31): full profile value/order snapshot, six fixed-seed full-output digests,
country normalization/object identity/unknown absence, and supported sector
spelling parity with existing display spelling retained. The matrix has 63
assets per regime across ten countries, all supported/profile sector keys and
an unknown sector, six regimes/seeds, macro extremes and country/exposure shocks.
No golden price or digest is changed after extraction.

Independent baseline execution loads the original main engine/random/contracts
files, using the identical fixture builder. Its complete profile plus full tick
outputs are byte-equal to the extracted engine's output, not just selected prices:
877,813 bytes, SHA256 `3538500a61e9e3b0a27ff52dbd4833bbed0dce8d123468537efec09475347c17`.
Rows, ticks, timestamps, volume, history, rounding and serialized explanations
are compared together. The old source is only a temporary characterization
input, not a committed second implementation.

Register existing engine tests through the existing calendar/runner test module,
without changing frozen package scripts; owning calendar suite now passes 60
(29 retained + 31 engine). Required checks include Player assets/market flows,
full backend typecheck/smoke, architecture/privacy and exact-head CI. Existing
multicurrency-stock-funding-v1 workflow matches stocks/** and supplies disposable
Stock settlement/race regression. Production release workflows are not edited
or dispatched. Completion requires qualified merge and main verification.

After removing only the selected old blocks and new import/re-export wiring,
the remaining engine is byte-identical, SHA256
`9c6932bb4594f694fa624ce800b4d5ca3b7e1b35fc3b1390bbd6f32ccba47380`.
Conservative mechanical credit is 616 changed lines (306 exact data/resolver
lines plus two unchanged normalizer body lines, each removed/added). All other
changes are counted against the semantic budget; generated inventory is separate.
Engine size falls 1667→1371 inventory lines; source/test denominator 1264→1265,
Stocks 94→95; debt counts/ceilings remain unchanged.

Local calendar 60, Player assets 73, market-flow/holdings, backend TypeScript,
architecture/boundary/legacy guards, root tests and secrets pass. Full Edge/smoke
remain required exact-head CI gates under the known local pinned esm.sh import
limitation; no new local aggregate passing credit is claimed.

[PR801](https://github.com/kohnerbouchard-star/Student-Profile/pull/801) binds
`docs/operations/contracts/player-cross-cutting/pr-801.json` to the nine changed
paths. Verifier/test paths are locked but unchanged. All eight meaningful files
plus generated inventory remain within the approved cohesive scope.

Pre-integration head `a2c3eb44c50614100607ab6d6738317ab796524e` passed all 31
workflows, 66 jobs and Vercel with four expected conditional skips. Backend
`36860753261`, Calendar `36860753046` and Stock funding/race `36860753151`
passed. REF-037 closeout main `900ab8691959dca8cb9279fde871de711355abed`
is merged normally; the generated inventory conflict is resolved by regeneration
from both accepted sources, preserving all other 49 task records. Calendar 60
and architecture re-pass. Fresh combined-head qualification remains mandatory.

## Qualified source and guarded merge

[PR801](https://github.com/kohnerbouchard-star/Student-Profile/pull/801) qualified
combined head `18942fcd1e33ead95cbaa549e8691cba4553cd02` and merged with an
expected-head-guarded merge as `cbaef4b12316287543d69787db149c938c05dbb6`.
Both trees equal `f08a92356d03007560ce10316acf8a1e6241b5ca`. Final nine-path
diff is 550 additions/322 deletions: conservative mechanical credit 616,
generated inventory 16, remaining semantic changes 240. Eight meaningful
files remain within the approved scope. REF-037 source/evidence is preserved;
combined inventory contains 1266 source/test files, including 95 Stocks files.

All 31 exact-head workflows and Vercel passed: 66 successful jobs and four
expected conditional staging/live/release/materialization skips. No unresolved
review threads. [Backend run 36864220022](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36864220022),
job `110375598063`, passed full typecheck/smoke. Downloaded
[smoke artifact 11163113543](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36864220022/artifacts/11163113543)
independently verifies SHA256
`1ea8d5404ba653813691d6ced7afa925b20abe0376693c097f1fd874ba452559`,
status 0, all four REF-038 parity cases and Calendar 60. The engine suite is
registered exactly once through the existing runner suite; package scripts
are unchanged. [Calendar run 36864219871](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36864219871),
job `110375597055`, also passed.

[Stock funding run 36864219979](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36864219979)
passed source job `110375597425` and disposable database job `110375597862`.
Inspected logs confirm two fresh replays with C3B quote, C3C serial settlement
and true-concurrency, C3D sell settlement, fail-closed market/liquidity and
concurrent sell oversubscription acceptance passing each time. These are
retained R3 regression results, not a new transaction or production certificate.
The independent complete-output comparison and unchanged residual-engine proof
above establish calculation parity without changing golden expected prices.

## Merged-main verification and completion

All applicable automatic main checks are terminal: 16 workflows, 15 successful
and one expected skipped Edge inventory workflow; 33 successful jobs and seven
expected conditional skips (two Edge convergence, dependency review and four
live-parity/release jobs). No pending or failed jobs.

- [Backend Typecheck 36866302181](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36866302181): passed
- [Repository Quality 36866302438](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36866302438): passed
- [Store Cutover 36866302559](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36866302559): passed
- Store Atomic Settlement `36866302430`, Listing Inventory `36866302361`, Seller Offers `36866302255`, Withdrawal Safety `36866302395`: passed
- Manufacturing `36866302161`, Supply Chain `36866302182`, Beta Security `36866302029`, Beta Pilot `36866302134`, timezone `36866302432`, Runtime Wiring `36866302456`, Production Git Release contracts `36866302067`, CodeQL `36866300125`: passed
- Edge Inventory `36866302047`: expected skipped

REF-038 is VERIFIED_COMPLETE for this bounded pure-family extraction. The exact
qualified and merged trees match; no additional runtime test credit is claimed
for this three-existing-doc closeout. Other 49 task records, REF-037 completion
and blocked/paused gates remain unchanged. REF-041 is separately owned in
parallel. Next dependent task: REF-039, after its own current-source/ownership
preflight; REF-040 is also newly eligible but is not implemented here.
