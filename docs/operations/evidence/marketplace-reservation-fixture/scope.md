# Marketplace reservation fixture isolation

Roadmap item: `PLAYER-MARKETPLACE-FIXTURE-001`.
Status: `IMPLEMENTED_NOT_MERGED`; separate branch `fix/marketplace-reservation-fixture` based on main `ea24905ef5770567c96cf128897335f69074fcd6`. Actual PR-number authority registration, independent review and exact-head hosted qualification remain required. No production deployment.

## Observed failure and bounded cause

[Player Multiplayer and Load E2E run 42621623105, job 129174974746](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42621623105/job/129174974746) passed Inventory redemption at 13:07:39 UTC on 2026-11-09, with `beta-eldo-secure-ledger-substrate` and replay-safe reservation persistence. Banking/Loans passed at 13:10:35. The first Marketplace listing failed at 13:11:05 with HTTP 503 and database `MARKETPLACE_RESERVATION_PROJECTION_DRIFT`.

Inventory acceptance intentionally leaves an ALPHA redemption pending. The production `mirror_redemption_reservation_v2` trigger creates its active shared reservation. Marketplace fixture setup selected the oldest store item and overwrote only the holding's reserved projection with zero. Listing creation correctly rejects disagreement with authoritative active reservations. Logs do not contain a selected holding snapshot, so exact row-level attribution remains bounded by that visibility; the deterministic database proof covers the identified cross-journey failure mode explicitly.

## Change boundary

- `player-terminal/tools/marketplace-inventory-fixture.mjs`: disposable fixture SQL validates database identifiers, inserts an absent holding, locks it, invokes the existing reconciliation with repair disabled, raises owned stock only to ensure ten available units, and invokes reconciliation again. Existing reserved quantities and authoritative reservation rows are never rewritten. Genuine pre-existing drift and over-reservation fail before stock adjustment.
- `player-terminal/tools/connected-marketplace-mutation-runner.mjs`: delegates only its inventory fixture setup to this helper. Currency, policy and ledger fixtures and every browser journey assertion remain unchanged.
- `scripts/marketplace-inventory-fixture.test.mjs`: four deterministic boundary tests plus an opt-in PostgreSQL proof independent of browser state. The SQL proof uses temporary minimal tables and the exact current production projection/reconciliation functions and redemption mirror trigger, with transaction rollback. It covers fresh holdings; an actual pending redemption request mirrored into an active reservation; mixed crafting and inactive listing reservations; another player's reservation; repeated seeding; sufficient existing stock; drift and over-reservation rejection. It asserts the request and authoritative rows remain unchanged.
- `package.json`: adds boundary tests to the existing root runtime-cutover test command without removing checks.
- `.github/workflows/player-multiplayer-load-e2e.yml`: adds the regression file path trigger and a mandatory database proof after disposable database reset, before source provisioning and all existing connected journeys. The proof flag is explicitly enabled; missing PostgreSQL, failure, or a non-loopback target fails the step. No existing journey/load gate is removed, skipped or relaxed.
- This scope and additive roadmap entry record evidence. No runtime backend, route, RPC signature, production migration, UI, dependencies, or economic policy changes.

## Validation and remaining gates

- Local Node 22.23.1: full root `npm test` and full Player `npm --prefix player-terminal run verify` passed.
- Focused regressions: four passed; database proof explicitly unexecuted locally because `psql` and Docker are unavailable. No replacement stack was installed. Source checks are not a substitute for the required PostgreSQL and full ordered browser journeys.
- Backend TypeScript phase passed. `typecheck:all` Edge phase is blocked by connection refusal fetching the existing frozen `@supabase/supabase-js@2.108.2` dependency from esm.sh; no dependency/lock change proposed. Full backend smoke was attempted and encounters the same dependency boundary.
- Required hosted proof command: `MARKETPLACE_FIXTURE_DATABASE_PROOF=1 DATABASE_URL=<loopback-disposable-database> node --test scripts/marketplace-inventory-fixture.test.mjs`.
- Independent actual-diff review and exact-head hosted database proof, ordered Inventory-to-Marketplace lifecycle and 30/40-player load qualification remain required before merge. Existing prior workflow successes do not certify this new head. Register the actual PR authority with all current-main required and critical checks preserved, including the changed workflow and new fixture/test files in the bounded allowed paths.
