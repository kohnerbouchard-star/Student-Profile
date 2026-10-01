# REF-038 pure country-exposure family extraction

Status: IN_PROGRESS. Base main `09fd066c44a8b49f69b36eca1ba6b3baacddd8ce`.
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
