# Player feature read-model extraction

## Scope and ownership

- Roadmap item: `ARCH-LARGE-PLAYER-FEATURE-READ-MODELS-001`.
- Base: freshly fetched main `c59ed0afe1ac794bb5c4788f477020e535c3587b`, including merged #953, #954 and #955. Historical unmerged intake wording for those branches is not a new implementation owner or blanket completion evidence.
- Reviewed implementation commit: `08000383c28718af6c7b60bdf7fc4a07c746d3ad`, tree `f86022c03cf14ad2df3b2c3c0437f51a905b8c16`. The subsequent record-only checkpoint does not alter source/tests.
- Owner: local branch `refactor/player-feature-read-models-20261113`. No PR, publication or production action in this tranche.
- Open-PR audit on 2026-11-13: #624's CSS/disclosure/live-update work and roster #933/#938 do not touch the selected projections. #668 owns broader global-roadmap reconciliation. Only this bounded intake is added to that shared ledger.
- Move existing Market, Banking, Store/Inventory, Contracts and Portfolio normalization into five cohesive API-layer modules. Keep the existing `read-model-values.js` primitives; do not introduce a generic utilities layer or another feature orchestrator.
- `read-model.js` remains the only bootstrap/endpoint merge owner and keeps exactly `readSessionContext`, `normalizeTerminalBootstrap` and `mergeTerminalRead` as its public API. Session public-ID handling, default shape, Dashboard cross-projection updates, merge order, identities, coercion and exception behavior stay unchanged. Existing Country/News projection is untouched.
- No API/route/RPC, schema/migration, economic write, authentication, persistence, UI/CSS, dependency, production or roster change. This is structural maintenance, not feature completion or correction of inherited coercion behavior.

## Implementation

- `player-terminal/src/api/read-model.js`: 932 → 406 physical lines.
- `market-read-model.js`: 117 lines; stock/holding/news projection and read reconciliation.
- `banking-read-model.js`: 106 lines; balances, ledger pagination and freshness projection.
- `store-inventory-read-model.js`: 217 lines; catalog/offer/inventory normalization and shared artwork selection.
- `contracts-read-model.js`: 62 lines; contract lifecycle/reward/submission projection.
- `portfolio-read-model.js`: 34 lines; valuation/allocation/exposure projection.
- Every original function remains present exactly once. `function-preservation.json` records baseline-body hashes and final owners; only module imports/exports and inter-function spacing change.
- Existing Store source-token contract reads the aggregate plus its extracted Store/Inventory dependency. Every existing assertion is retained.
- Register twenty public-API characterization cases in Player `verify`. Two Store/FX workflows formerly selecting the aggregate by exact path now additionally select all five helper paths under both PR and main-push filters; tests, actions, permissions, guards and all other triggers are unchanged. Other workflows that previously selected `read-model.js` also select the new helpers through existing API/terminal globs. This preserves aggregate-trigger coverage; it does not claim that every possible consumer runs on every helper change.

## Verification record

- Twenty new public-API characterization tests passed on unchanged main before extraction and pass on the extracted candidate. They cover Market joins/history/selection, Banking currency/availability/staleness/pagination, Store offers and ownership, Inventory capacity/artwork, Contracts aliases/rewards, Portfolio exposure, sibling identities, malformed input and exact public exports.
- Body-preservation check confirms every baseline function is byte-identical after ignoring only the module export prefix and separating whitespace.
- Deterministic architecture inventory: 1,363 sources, 87 oversized files (88 on main), 52 persistence candidates and 70 cross-domain deep-import matches. No ceiling increases. All five helpers are below 500 lines.
- Full `npm --prefix player-terminal run verify` and `npm test` pass on pinned Node 22.23.1/npm 10.9.8. Backend core `npm --prefix backend run typecheck` passes. Source contract, both workflow YAML parses, secret scan, whitespace and both architecture ratchets pass.
- Independent read-only review separately confirms all 31 exact function bodies, public/merge/identity preservation, no apparent import cycle, 20 characterization and 16 Country/News tests, retained Store assertions, test registration and all 29 existing aggregate-selecting workflow event filters covering all five helpers. No code/security finding. Documentation wording was narrowed to avoid claiming every possible consumer is selected.
- `typecheck:all` stops in unchanged Edge imports at the frozen `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` connection refusal. Full backend smoke passes 23 Deno groups / 968 cases and 18 neutral-config Node cases, then stops at that same dependency during Game Sessions. These aggregates remain incomplete, not passing.
- Browser attempt targets the retained seven-case Market receipt lifecycle suite. Chromium is not installed, so launch fails before assertions. Pinned Playwright Chromium v1217 installation also failed during the official download; no browser/runtime assertion or hosted check is claimed passed.

## Remaining gates and next step

Local source/test review and committed-inventory validation are complete. Preserve and independently restore the recovery artifact, then hand the frozen candidate to the parent for serial integration. Re-fetch main and reconcile generated inventory/shared metadata without overwriting another owner. Actual-number authority and fresh exact-head hosted browser/backend gates are required before merge; no PR number is guessed here. Production remains on hold. The independent Stocks extraction remains separate.

## PR #956 publication and exact-head qualification

The owner now authorizes publication and qualified serial merge; earlier local-only wording describes preparation. Main remains `c59ed0afe1ac794bb5c4788f477020e535c3587b`, and #955's postmerge checks have cleared. Draft [PR #956](https://github.com/kohnerbouchard-star/Student-Profile/pull/956) publishes source `d11c3129428bf5dda81035ca84774a72fcc0037a` with exact reviewed tree `6c26f7d2e7d1e69c28e9627c9f48faf8c6f3e3d0`. Remote tree equality and source bytes were verified. Private recovery was downloaded, hash-checked and independently restored: exact head/tree, all 15 source paths, 36 characterization/Country-News cases and deterministic inventory pass.

Actual-number authority inherits all ordered 147 required / 103 critical identities from #955, including all 55 required workflow families and false production/secret flags. Its exact path locks cover the new source/test/evidence paths and only necessary own-authority PR selectors. No existing check, guard, permission, non-PR trigger or workflow command is removed or weakened. Fresh final-head hosted verification follows publication of this reviewed amendment; initial-source CI is interim only. Production stays on hold.
