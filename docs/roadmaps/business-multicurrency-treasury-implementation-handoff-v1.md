# Business Multi-Currency Treasury and Procurement Implementation Handoff v1

**Roadmap item:** `BUSINESS-V2-10A4C4`
**Certification checkpoint:** `BUSINESS-V2-10A4C4F`
**Status:** `IMPLEMENTED_NOT_MERGED`
**Branch:** `feat/business-multicurrency-treasury-v1`
**Draft PR:** #678
**Exact implementation and verification source:** `46bfc611834dca4db3084d9dce8197c499d61fcd`
**Parent C3 implementation:** `058162d7b9688809e885d9e6fe77ed42978c7a03`
**Parent C3F controller:** `18fde31be5e1599c7d9a65d681b248fcb4756dc4`
**Merge or deployment authorized:** No

## Certified result

C4 extends the existing B2 Banking/FX and C0 purchase-funding authorities to exact Player-or-Business ownership and completes atomic funded Business procurement without adding another wallet, balance, ledger, FX, funding, Store, or Inventory authority.

- One canonical Business Checking account may exist per active currency. Opening is idempotent, zero-value, ownership-stable, and public-key-only.
- Business standard and instant FX reuse the certified B1 fixing and B2 spread, fee, settlement-time, hold, clearing, liquidity, replay, cancellation, and worker semantics. The standard product retains the 0.50% spread and next strictly later game-local 08:00 settlement; instant retains the 0.50% spread plus the separate 2.00% source-currency fee.
- Business procurement funding accepts one to three unique owned Checking accounts through the one C0 authority and rejects Player, Savings, system, legacy, restricted, closed, wrong-game, and wrong-Business accounts.
- The Business Store commercial quote is immutably bound to its C0 funding quote, target account, exact amount/currency/quantity, pricing version, and context digest. Funding/FX, Store target credit and stock, Inventory delivery, Warehouse weighted-average cost, receipt, and activity evidence commit atomically or roll back together.
- Pre-C4 unbound procurement quotes remain immutable compatibility history and return `410 business_store_procurement_payment_retired` on attempted settlement.
- The Player Business workspace exposes Treasury accounts, account opening, standard/instant quote review, spread/fee/fixing/rounding disclosures, cancellation, procurement allocations, expiry/conflict states, immutable receipts, and committed-success refresh recovery within the retained Player Terminal shell.
- The inherited connected Marketplace quote-to-settlement transition was repaired without changing economic authority: settlement is authorized by the server-advertised `marketplacePurchase` descriptor, whose operations now advertise the real `/quotes` and `/settlements` routes instead of the retired `/purchase` route.

## Durable implementation surface

### Forward migrations

- `backend/supabase/migrations/20260831100000_business_multicurrency_owner_identity_v1.sql`
- `backend/supabase/migrations/20260831101000_business_treasury_fx_commands_v1.sql`
- `backend/supabase/migrations/20260831102000_business_procurement_funding_v1.sql`
- `backend/supabase/migrations/20260831103000_business_multicurrency_assertions_v1.sql`

C4 adds no game-scoped table, so the conditional purge-registry migration was not created.

### Authenticated Player routes

- `GET /players/me/business/treasury`
- `POST /players/me/business/treasury/accounts`
- `POST /players/me/business/treasury/fx/quotes`
- `POST /players/me/business/treasury/fx/orders/standard`
- `POST /players/me/business/treasury/fx/orders/instant`
- `POST /players/me/business/treasury/fx/orders/{fxo_...}/cancel`
- `POST /players/me/business/store/quotes`
- `POST /players/me/business/store/purchases`

### Public service commands and projections

The public service-role-only surface includes Business account list/open, Business FX quote/standard/instant/cancel/order/overview, Business purchase-funding quote, funded Business Store quote overloads, and funded Business Store purchase. Principal RPCs are:

- `list_player_business_bank_accounts_v1`
- `ensure_business_banking_account_v1`
- `create_business_fx_quote_v1`
- `submit_business_standard_fx_order_v1`
- `execute_business_instant_fx_v1`
- `cancel_business_standard_fx_order_v1`
- `list_business_fx_orders_v1`
- `get_business_treasury_overview_v1`
- `create_business_purchase_funding_quote_v1`
- `create_business_store_quote_v2`
- `purchase_business_store_quote_v2`

Browser DTOs include `BusinessTreasurySnapshotV1`, `BusinessFundingQuoteV1`, `BusinessFundingReceiptV1`, and the bounded Treasury account/rate/quote/order/receipt families. All contracts use public keys and exact currency/precision evidence; internal UUIDs, trusted scope, request hashes, and monetary outcomes remain server-private.

### Implementation groups

- Business contracts, route parsing, request validation, Treasury/Store handlers, projections, database-error mapping, Supabase repositories, and focused tests under `backend/src/domains/business/**` and `backend/src/domains/business-banking/**`.
- Owner-neutral standard FX settlement in `backend/src/domains/banking-fx/**`.
- Exact Player context dispatch, capability/rate-limit bindings, and Edge composition in `backend/supabase/functions/_shared/playerBusinessDispatch.ts`, `backend/supabase/functions/player-api/runtime.ts`, and `backend/supabase/functions/classroom-api/index.ts`.
- Player Terminal route/resource/read models, Treasury/procurement flows, preserved Business page and style, freshness/recovery, and desktop/mobile browser acceptance under `player-terminal/**`.
- Permanent evidence in `.github/workflows/business-multicurrency-treasury-v1.yml` and `scripts/business-multicurrency-treasury-{contract,database,concurrency}.mjs`.

## Exact-source certification evidence

Exact implementation `46bfc611834dca4db3084d9dce8197c499d61fcd` passed all 31 pull-request-triggered workflows returned for that SHA. No workflow remained failed, cancelled, timed out, queued, pending, or in progress.

The permanent C4 workflow [run `33351825999`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33351825999) passed:

- source, PR authority, public contracts, retained application boundaries, focused backend suites, and deterministic architecture inventory — [job `99366568097`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33351825999/job/99366568097);
- C0/C4 zero-to-head replay, rebuilt-schema lint evidence, database acceptance, rollback, isolation, and concurrency — [job `99366567927`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33351825999/job/99366567927);
- exact-money Player source plus desktop/mobile Chromium and accessibility — [job `99366568058`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33351825999/job/99366568058).

The retained multi-currency Marketplace workflow [run `33351825985`](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/33351825985) passed source, database, and the connected two-Player browser journey. Its sanitized evidence records listing creation/activation/persistence; quote creation and replay; settlement apply and replay; purchase persistence; dispute creation/persistence; listing cancellation/persistence; unauthenticated rejection; no public UUID leak; and no console or page error.

The complete exact-head workflow ledger is:

- Admin API Check `33351826031`; Backend Typecheck `33351826039`; Beta Security Contract `33351826016`; Business Banking Runtime `33351826005`; Business Economy V2 `33351825943`.
- Business Player Store Cutover V2 `33351826053`; Business Store Atomic Settlement V2 `33351826166`; Business Store Listing Inventory V2 `33351826047`; Business Store Seller Offers V2 `33351826003`; Business Store Withdrawal Safety V2 `33351825951`.
- Business Timed Manufacturing V2 `33351826069`; Business Workforce Hiring V2 `33351826050`; Business Workforce Payroll V2 `33351826023`; Business Workforce Production Payroll V2 `33351826065`.
- Database Replay `33351826026`; Environment Neutral Browser `33351826029`; Exchange Calendar Runtime `33351826076`; Player Runtime Cutover Verify `33351826101`; Player Terminal Verify `33351825986`.
- Progression Runtime `33351826000`; Repository Quality `33351825979`; Required Game Market Timezone `33351825948`; Runtime Interaction Wiring `33351826131`; Staging Readiness Preflight `33351825994`; Supply Chain Security `33351826012`; World Runtime `33351826020`.
- `banking-fx-clearing-v1` `33351826046`; `business-multicurrency-treasury-v1` `33351825999`; `multicurrency-marketplace-funding-v1` `33351825985`; `multicurrency-stock-funding-v1` `33351825974`; `multicurrency-store-funding-v1` `33351826041`.

Earlier Marketplace browser attempts on superseded C4 candidates correctly failed because the connected manifest-bound settlement action returned before transport. Commit `46bfc611` repaired the capability binding and route advertisement; the exact-source connected rerun then passed without weakening a test, privacy boundary, economic invariant, or production CORS rule.

## Source-of-truth rule

`46bfc611834dca4db3084d9dce8197c499d61fcd` is the immutable C4 implementation and verification identity. The commit adding this handoff and the later checkpoint/controller commit must be recorded separately and must not replace the tested source.

## Safety, blockers, and exclusions

PR #678 remains draft, open, unmerged, and undeployed. C4 did not merge a PR, deploy to staging or production, change a scheduler or secret, execute staging/production SQL, or mutate live data. All database and connected evidence used disposable local CI environments.

`BETA-LIVE-MIGRATION-PARITY-001` remains the release/runtime-evidence blocker. It does not invalidate repository implementation, but C4 cannot become `VERIFIED_COMPLETE` until normal merge to `main` and required runtime evidence exist.

C4 does not begin Phase 11 sales convergence, Player workspace v2, Admin supervision, financial statements, common equity, IPO, or Financial Market integration. It does not alter B1 fixing semantics, B2/C0 pricing, the personal Banking routes, or C1-C3 commercial ownership.

## Next checkpoint

`BUSINESS-V2-10A4D` — final Player Store/FX convergence — is the next authorized item. Its branch is `feat/business-player-store-fx-final-v2`, created only from the later clean C4F documentation/controller head.

10A.4D must compose `SupabasePlayerStoreFundingPublicRepository` for both seeded/NPC and Business seller offers, expose one-to-three Checking allocations and immutable funding evidence, remove same-currency-only validation/copy, repair the bounded loopback-Origin probe and PR authority binding, and prove the two-browser purchase/withdrawal race. It may not reopen C4, add another Store or funding authority, merge, deploy, change schedulers or secrets, execute staging/production SQL, or mutate live data.
