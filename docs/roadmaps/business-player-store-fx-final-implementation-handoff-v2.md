# Business Player Store / FX Final Convergence Implementation Handoff v2

**Roadmap item:** `BUSINESS-V2-10A4D`
**Status:** `IMPLEMENTED_NOT_MERGED`
**Branch:** `feat/business-player-store-fx-final-v2`
**Draft PR:** #679
**Exact implementation and verification source:** `e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b`
**Parent C4 implementation:** `46bfc611834dca4db3084d9dce8197c499d61fcd`
**Parent C4F controller:** `51ffd008ed84f6a9acd029c8941b3f9b40733735`
**Merge or deployment authorized:** No

## Certified result

10A.4D composes one funded Store mutation authority for seeded/NPC catalog offers and Business seller offers. The live Player handler no longer reaches a legacy Store purchase command, and the browser no longer assumes a same-currency wallet.

- Both Player Edge roots compose one `SupabasePlayerStoreFundingPublicRepository` for quote, settlement, and immutable receipt reads. Narrow catalog/history adapters remain read-only.
- The Buyer supplies one to three ordered, unique Player Checking public keys. Each non-final row has a positive canonical target contribution and the final row is null; the server derives the exact remainder only after authoritative Store price, currency, precision, version, quantity, and seller identity are fixed.
- C0 remains the one funding quote/composer authority and B1/B2 remain the fixing, FX, hold, liquidity, reserve, posting, and clearing authorities. D adds no wallet, balance, ledger, FX engine, funding composer, Store receipt, or Inventory authority.
- Seeded/NPC and Business offers preserve offer currency/version, seller proceeds, listing custody, exact Inventory delivery, Store receipt identity, full funding evidence, replay/conflict behavior, and purchase-versus-withdrawal lock order.
- Public money is returned as canonical decimal strings while stored economic evidence is unchanged. PostgreSQL fixed-scale zero padding is accepted only in the connected evidence parser; nonzero sub-minor-unit residue still fails.
- The Player Store exposes allocation controls, final-remainder and all-foreign funding review, fixing/spread/rounding disclosures, immutable receipt reread, quote invalidation, expiry/conflict states, and committed-success refresh recovery without `LOCAL WALLET`, THD, or same-currency-only copy.

## Durable implementation surface

### Forward migration

- `backend/supabase/migrations/20260831103001_business_player_store_fx_final_v2.sql`

The Supabase CLI generated the forward migration from the live C4 predecessor. Because the CLI's UTC version sorted behind C4's reserved versions, it was reconciled to the first mechanically later free version under the documented newer-predecessor procedure. No predecessor migration changed.

The migration adds bounded nullable seeded-offer bindings and consistency guards to existing Store quote/purchase evidence, redefines the seeded funded settlement authority for offer custody, adds ordered final-null intent normalizers/materializers, and publishes service-only adapters/read projections. It creates no table, RLS policy, direct monetary DML grant, C0/B2 composer, or purge-registry entry.

Principal public service-role-only RPCs are:

- `create_system_store_offer_funding_quote_v2`
- `settle_seeded_store_funding_v1` (redefined, with historical item-rooted compatibility retained)
- `settle_system_store_offer_funding_v2`
- `settle_business_store_offer_funding_v2`
- `read_business_store_offer_funding_receipt_v1`
- `read_store_catalog_offer_groups_v2`

The allocation normalizer/materializer remains a private implementation detail. Every security-definer function has a fixed `search_path` and explicit execute revokes; only the public entrypoint RPCs grant execute to `service_role`.

### Authenticated Player routes

- `GET /players/me/store/items`
- `POST /players/me/store/quotes`
- `GET /players/me/store/purchases`
- `POST /players/me/store/purchases`
- `POST /players/me/store/offer-quotes`
- `POST /players/me/store/offer-purchases`
- `GET /players/me/store/receipts/{spr_...}`

Both Edge roots forward the authenticated Player/game context into the same funded handler. Public requests and responses contain public keys only; internal UUIDs, trusted scope, request hashes, account internals, and idempotency evidence are rejected or withheld.

### Implementation groups

- Store contracts, validation, response projection, error mapping, funded command/read repository, catalog-only adapters, and focused tests under `backend/src/domains/store/**`.
- Player route composition in `backend/supabase/functions/player-api/runtime.ts` and `backend/supabase/functions/classroom-api/index.ts`.
- Player Terminal route descriptors, response validation, funding intent, quote/purchase convergence, modal/recovery behavior, Store page, preserved visual system, desktop/mobile acceptance, and accessibility under `player-terminal/**`.
- Permanent static/database/concurrency/browser evidence in `.github/workflows/business-player-store-fx-final-v2.yml`, `scripts/business-player-store-fx-final-*.mjs`, and the retained connected Store harness.

## Exact-source certification evidence

Exact implementation `e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b` passed all 35 pull-request-triggered workflows returned for that SHA. No workflow remained failed, cancelled, timed out, queued, pending, or in progress.

The permanent D workflow [run `33377788370`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33377788370) passed:

- connected authenticated two-browser/two-game Store settlement, seeded and Business all-foreign funding, seller proceeds, immutable reread, committed-success recovery, withdrawal ordering, privacy, and clean console/page state — [job `99443203694`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33377788370/job/99443203694);
- source, exact PR authority, funded handler, all Edge roots, retained application contracts, canonical database-decimal tests, and deterministic architecture inventory — [job `99443203926`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33377788370/job/99443203926);
- zero-to-head replay twice, D serial database acceptance, observed locks, reverse account ordering, withdrawal races, retained C0/C1/C4/Store gates, rebuilt-schema lint, and advisors — [job `99443204017`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33377788370/job/99443204017);
- exact-money Player source plus desktop/mobile Chromium and accessibility — [job `99443204056`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33377788370/job/99443204056).

The retained Business Player Store Cutover workflow [run `33377788283`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33377788283) also passed. Its connected Buyer/seller two-game job is [job `99443148484`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33377788283/job/99443148484); serial/concurrency/isolation is `99443148440`; public Store/Edge composition is `99443148210`; replay/lint is `99443148195`; Player Chromium is `99443148081`; retained authority/quality/security is `99443148341`.

The complete 35-run exact-head workflow ledger is:

- Admin API Check `33377788371`; Admin Game Lifecycle Controls `33377788303`; Backend Typecheck `33377788328`; Beta Security Contract `33377788349`; Business Banking Runtime `33377788399`; Business Economy V2 `33377788388`.
- Business Player Store Cutover V2 `33377788283`; Business Store Atomic Settlement V2 `33377788309`; Business Store Listing Inventory V2 `33377788396`; Business Store Offer-Aware Quotes V2 `33377788363`; Business Store Seller Offers V2 `33377788365`; Business Store Withdrawal Safety V2 `33377788377`.
- Business Timed Manufacturing V2 `33377788339`; Business Workforce Hiring V2 `33377788323`; Business Workforce Payroll V2 `33377788295`; Database Replay `33377788316`; Environment Neutral Browser `33377788321`; Exchange Calendar Runtime `33377788281`.
- Marketplace Preconvergence `33377788486`; Player Local Currency Authority `33377788400`; Player Terminal Verify `33377788315`; Progression Runtime `33377788292`; Repository Quality `33377788298`; Required Game Market Timezone `33377788308`; Runtime Interaction Wiring `33377788288`; Staging Readiness Preflight `33377788331`; Supply Chain Security `33377788364`; World Runtime `33377788325`.
- `banking-fx-clearing-v1` `33377788360`; `business-multicurrency-treasury-v1` `33377788381`; `business-player-store-fx-final-v2` `33377788370`; `multicurrency-funding-core-v1` `33377788351`; `multicurrency-marketplace-funding-v1` `33377788342`; `multicurrency-stock-funding-v1` `33377788369`; `multicurrency-store-funding-v1` `33377788340`.

Superseded candidates failed closed and are not certification identities. `995306c6` exposed noncanonical public decimal strings; `73e44576` exposed PostgreSQL fixed-scale balance text; `7109d546` reached the complete connected journey and exposed a stale pre-funding withdrawal error expectation. The repairs canonicalize only the public response boundary, accept only harmless database zero padding in evidence, and align the harness with the funded command it invokes. No stored economics, lock order, authority, privacy rule, or acceptance criterion was weakened.

## Source-of-truth rule

`e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b` is the immutable 10A.4D implementation and verification identity. The commit adding this handoff and the later checkpoint/controller commit are separate documentation identities and must never replace the tested source.

## Safety, blockers, and exclusions

PR #679 remains draft, open, unmerged, and undeployed. 10A.4D did not merge a PR, deploy to staging or production, change a scheduler or secret, execute staging/production SQL, or mutate live data. Database and connected evidence used disposable local/CI services only.

`BETA-LIVE-MIGRATION-PARITY-001` remains the release/runtime-evidence blocker. It prevents `VERIFIED_COMPLETE` until normal merge to `main` and required runtime evidence exist, but it does not invalidate repository implementation.

10A.4D does not begin Store-only Business sales, guarded operating periods, the complete Player Business workspace, Admin supervision, financial reporting, common-share actions, IPO issuance, or Financial Market integration.

## Next checkpoint

`BUSINESS-V2-11` — Store-only Business sales and guarded operating/payroll periods — is next on `refactor/business-store-sales-convergence-v2`, created only from the later clean 10A.4D checkpoint/controller head.

Phase 11 must preserve historical `business_sales` and cycle receipts while retiring new simulated sales; derive new revenue, COGS, and gross-receipts tax only from committed Store receipts; enforce versioned seven-day unopened-period policy, `next_due_at`, leases, exact-once claims, payroll-before-tax ordering, and unpaid tax liabilities; expose the worker only through the existing internal-runner boundary; and make no scheduler, deployment, secret, staging/production SQL, or live-data change.
