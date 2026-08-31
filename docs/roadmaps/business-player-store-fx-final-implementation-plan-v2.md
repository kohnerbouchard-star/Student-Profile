# Business Player Store / FX Final Convergence Implementation Plan v2

**Roadmap item:** `BUSINESS-V2-10A4D`
**Status:** `PLANNED`
**Branch:** `feat/business-player-store-fx-final-v2`
**Parent C4F controller:** `51ffd008ed84f6a9acd029c8941b3f9b40733735`

## D1 — Authority and runtime cutover

1. Open one bounded draft PR against `feat/business-multicurrency-treasury-v1`.
2. Add a PR-number-bound exact-path authority manifest denying deployment, production mutation, and secret values.
3. Separate read-only seeded catalog/history and Business offer-product adapters from all mutation-capable legacy repositories.
4. Compose one `SupabasePlayerStoreFundingPublicRepository` in the live handler for seeded and Business quote, purchase, and receipt routes.
5. Add static two-root proof that no legacy Store purchase function or repository mutation method remains reachable.

## D2 — Ordered funding intent and forward repair

1. Generate one forward function-only migration from the live C4 handoff.
2. Accept one to three ordered unique Checking account intents with positive non-final target amounts and one final null amount.
3. Derive price, bill currency, precision, and exact final remainder server-side before calling the unchanged C0 funding authority.
4. Preserve the legacy all-positive signature for inherited replay/compatibility.
5. Bind replay/conflict to the original ordered intent and preserve canonical Store/Inventory/C0/B2 locks.
6. Keep fixed `search_path`, explicit execute revokes, and service-only grants. Add no table, RLS change, or purge migration.

## D3 — Public DTO and error convergence

1. Version quote inputs for ordered allocation intent and keep purchase inputs quote-key/idempotency-only.
2. Preserve full nested funding quote and receipt evidence through response projection and immutable reread.
3. Validate public keys, money/currency/precision, Store/offer version, target/seller amounts, context binding, rate/spread/rounding, transaction identity, and replay state.
4. Map account, allocation, final-remainder, Store race, funding, hold, liquidity, expiry, and conflict failures to stable bounded public errors.

## D4 — Player Store UI convergence

1. Add a bounded Store funding-intent helper for account filtering, ordered rows, canonical decimals, precision, and final remainder.
2. Add one-to-three Checking controls to the existing Store quote modal and invalidate quotes on changed intent.
3. Render authoritative funding review and immutable receipt evidence for seeded and Business sellers.
4. Preserve committed-success refresh recovery and nested evidence equality.
5. Remove `LOCAL WALLET`, `LOCAL AVAILABLE BALANCE`, THD, same-currency-only, and obsolete cross-currency copy/tests.
6. Keep catalog reads available but checkout fail-closed when Banking evidence is unavailable.

## D5 — Permanent evidence

1. Add `.github/workflows/business-player-store-fx-final-v2.yml`.
2. Add focused static, database, and concurrency contracts.
3. Extend the connected two-browser/two-game Store journey for seeded and Business cross-currency purchases, seller proceeds, withdrawal races, replay/conflict, and privacy.
4. Run zero-to-head twice, advisors, reverse account-order, Store-versus-withdrawal, and same/mixed/foreign funding evidence.
5. Run Backend/all Edge, Player desktop/mobile Chromium/accessibility, authority, security, Repository Quality, and all retained C0-C4/Store/Marketplace/Stocks gates.

## D6 — Exact-head certification and handoff

1. Repair failures without weakening an authority, privacy rule, lock order, economic invariant, or test.
2. Commit one exact implementation SHA and push until its permanent and inherited matrix is green.
3. Record `IMPLEMENTED_NOT_MERGED`, migrations, routes, functions, files, workflow runs, browser/runtime evidence, blockers, and next exact item in the roadmap and execution log.
4. Add a clean implementation handoff commit, then a separate checkpoint/controller commit that preserves the exact implementation identity.
5. Verify the terminal documentation head, update the draft PR, and only then create the Phase 11 branch.

## Stop conditions

Stop and reopen scope if implementation requires another Store/funding/FX/Inventory authority, a C0/B2 composer change, a new game-scoped table, production CORS widening, scheduler/secret changes, deployment, staging/production SQL, live data, or Phase 11 sales/period behavior.
