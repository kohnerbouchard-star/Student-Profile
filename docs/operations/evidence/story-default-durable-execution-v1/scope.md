# Default Story durable execution prerequisite

Base: main `956ad02db949ae9c4cff7d709a18ec28d20c0788`.
Status: local implementation, not merged or deployed.

`ARCH-STORY-DEFAULT-DURABLE-001` is a prerequisite for eventual legacy Story fallback deletion, not a deletion-completion claim.

The generic stock-market HTTP handler composes `createStockTickStorylineRunner`. It previously omitted `executionRepository`, selecting an in-memory legacy adapter which inserted a resolution before effects. The Edge-specific runner already supplied `SupabaseStoryEventExecutionRepository`. This tranche supplies that existing adapter to the generic composition too. No new RPC, SQL, permission, effect policy or browser contract is introduced.

Behavior intentionally changes: execution is claimed through existing durable RPCs, effects run after acquisition, resolution finalizes afterward. Busy/already-resolved claims and claim errors must not execute effects. Existing retry/lease machinery remains authoritative. This is not a behavior-neutral deletion and requires hosted qualification of the existing migration/RPC path before merge. The fallback remains for other existing consumers, including smoke/test fixtures; removing it is a separate step after migration and parity.

Tests exercise the real default and injected executor, acquired/busy/already-resolved/error outcomes, RPC game/event scoping, lazy/context failures, no legacy resolution insertion, and effect-before-finalize ordering. Retained adapter, lease/retry, replay-identity and game-scope tests must pass. These fake-RPC tests do not prove actual database semantics or hosted availability.

No live deployment, database or sync change is authorized or performed.

Local checks on candidate: composition10/10; retained adapter/lease/replay/game-scope17/17 (includes composition); core TypeScript passes. Against unchanged main composition source, the new tests fail8/10 as expected; restored candidate passes10/10. Legacy inventory audit and65 retirement tests passed before edits. Root aggregate started but is not yet certified; polling encountered an automatic approval-review failure. No full Edge, browser, disposable database or hosted acceptance claimed.


Independent review correction: the default Stocks handler injected the generic Contracts writer, which fails on duplicate23505 rather than recognizing Story retries. The Story composition now defaults to its existing `SupabaseStoryContractWriter`, and the Stocks handler stops injecting the generic writer. Explicit test injection remains available; generic Contracts behavior is unchanged. This brings the default path in line with the Edge path's existing Story-specific replay lookup, scoped by game/source/type/key.

The added regression executes the real default HTTP handler with the real Story contract adapter: first insert succeeds, finalization returns an error, the next execution encounters23505 and reads the same persisted contract, then finalizes. It preserves one contract row, performs two insert attempts and reaches successful finalization. New suite13/13 passes; reverting only the HTTP handler to the generic writer makes the HTTP replay test fail (12 pass/1 fail). Fake storage/RPCs are used; no database acceptance claimed.

Independent re-review cleared the real-writer replay correction. Final retained local selection36/36 and core TypeScript pass. The integration regression adds two test-only cross-domain imports (census68→70, unchanged ceiling71); no production deep import added and no ratchet weakened. Generated inventory is refreshed. Fresh root aggregate initially stopped on expected generated-inventory drift; commit the regenerated inventory and rerun. Browser, real lease SQL/database and hosted checks remain required/unqualified.


Published draft PR #999 source `bf29b5e87002b3b6b8a68942f4969c6c5e18e8a7`, exact tree `4c83e21bc826d51868c6fd0e7c90ef3b84abba64` matches reviewed local candidate. Fresh committed root aggregate passed (exit0), core TypeScript passes,36 focused/retained tests pass. Actual-number CI contract derives32 workflow families/68 active tuples/four guarded skips without workflow changes. Metadata review and final exact-head hosted checks remain pending; live/database acceptance not inferred.


Current-main reconciliation: main9df2064d (#998) merged normally; shared roadmap conflict resolved retaining both intakes. Runtime source remains the reviewed Story correction. Existing Story Replay Safety had no real SQL acceptance, so this draft adds a dedicated PR-only disposable PostgreSQL job: full schema replay, exact-head/local socket/fresh pinned container binding, rollback-only fixture tests of absent/acquired/busy, fail/retry frozen plan and identity, stale/cross-game lease denial, finalization/replay and RPC execute privileges. This is serial real SQL acceptance, not a concurrent race certification or live deployment. New guard/source tests2/2 pass locally; no local Docker, so SQL remains UNRUN until hosted job passes. CI contract rederived32 families/69 active tuples/four guarded skips. Independent harness review and final exact-head hosted qualification remain required.


First hosted SQL attempt on a1174382 reset the complete schema successfully, then failed on first claim with STORY_EXECUTION_GAME_NOT_MUTABLE. Root cause is the fixture: it set legacy status active but omitted canonical lifecycle_state, so initialize_game_lifecycle_v1 projected draft to disabled. Corrected fixture explicitly starts non-joinable draft/pending, proves draft claim denial, transitions only those rollback fixtures to matching active lifecycle/status, asserts persisted state, then retains every original lease assertion. No database guard or production code is weakened. Hosted requalification remains pending. Separate Seller Offers failure was an esm.sh521 dependency fetch after passing tests; one exact-head targeted retry was requested, not counted as a pass.
