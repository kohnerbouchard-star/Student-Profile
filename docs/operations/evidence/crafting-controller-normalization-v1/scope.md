# Admin Crafting controller normalization separation

Roadmap: ARCH-CRAFTING-CONTROLLER-NORMALIZATION-001.
Base: 03adc6891995fe1d780fe34629b1daf14470ea39.

## Boundary
Move DTO parsing, privacy filtering, bounded projection, recipe aggregation and freezing from CraftingController.js into CraftingReadModel.js. Retain the existing normalizeCraftingReadModel export as an identity-preserving re-export. The controller consumes the same item-key normalization and status membership predicate rather than duplicating policy. Controller lifecycle/mutation bodies remain unchanged except the equivalent status predicate call.

No API, SQL, RPC, permission, CSS, dependency, browser storage, network request or deployment change. Existing mutation replay, cancellation, stale reads, delayed refresh and destroy semantics remain authoritative. This is ownership separation, not feature completion or a reduction in persistence/import debt.

## Verification
Original 38 focused tests pass. Expanded 44 tests cover malformed/wrapped DTOs, 250/500/1000 bounds, immutable results/input preservation, identifier filtering, stale response ordering, initial/refresh deactivation, retry-key reuse, in-flight mutation deduplication and destroy while operations are pending. The 43 applicable tests also pass against the original main controller (the new-module identity test is excluded there).

Controller: 498 to 269 lines; pure read-model owner: 238 lines. Inventory source count1636 to1637; debt counters unchanged. Independent review, final aggregate checks and exact-head hosted qualification remain pending. No merge or deployment authorized in this tranche.

## Source qualification
Reviewed local source eeb14905e: independent reviewer confirmed exact normalization declaration preservation (only added export) and exact lifecycle/mutation preservation modulo equivalent status membership call; 44/44 focused cases passed independently. Full root, full Player and backend core TypeScript pass locally on pinned Node22.23.1/npm10.9.8; existing root database skips remain explicit. Secret scan passes. The initial root run stopped on the intentionally uncommitted generated inventory; the committed rerun passed. No local Chromium/full Edge/live pass is claimed. Actual-PR scope authority and exact-head hosted checks remain next before any merge consideration.

## Actual PR qualification metadata
Draft #1008 source c72a865d matches reviewed local tree. Exact authority locks eight changed paths plus two read-only verifier/test paths. Fresh derivation:35 workflow families,69 active tuples,five guarded skips. Production/secret denials remain false; no workflow or test command edits. Metadata review and fresh published-head hosted qualification remain pending.

## Roster qualification pin repair
Hosted e7d0e919 failed the pre-install runtime-equivalence check. Local exported verifier reproduces runtime-head-projection-drift: inherited integrated pins60a08987 describe the pre-refactor repository, while the gate intentionally compares every non-exempt repository input. This is not a Crafting behavior failure. Preserve the entire default-deny verifier, workflow and both full mode suites. Add only sources.json to the exact authority scope, then bind both integrated source pins to the reviewed published source checkpoint containing this metadata. The final pin-only commit must pass exact projection and disk integrity against that checkpoint. Nine changed paths, eleven locked paths; no production changes or weakened checks. Fresh hosted qualification is required.

## Actual-main serial integration (2026-11-18)

Normally merge #1007 main `4d5d1116453e8148675b486c58448a764cd85331` into this existing owner. Resolve only additive roadmap intake and inherited source pins; retain every Loans runtime, test, authority and scheduling byte. Crafting runtime and tests remain byte-identical to qualified `65291e20`. Nine-path own scope and eleven locks remain unchanged. Rebind both integrated pins to the metadata-complete published integration, then independently review and rerun full exact-head hosted gates. No manual release, live DB operation, provider setting change or live completion claim.
