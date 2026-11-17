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
