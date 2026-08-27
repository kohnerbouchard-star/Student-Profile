# Banking FX Clearing Implementation Handoff v1

## Canonical status

- Roadmap item: `BUSINESS-V2-10A4B2`.
- Owner branch: `feat/banking-fx-clearing-v1`.
- Stacked draft PR: #672, base `feat/canonical-fx-authority-v1` / draft PR #671.
- Parent B1 implementation source: `41bc2d978fe67cd06a8f2133f7310075492ecd99`.
- Parent B1 documentation handoff/base: `5e427e8f5b39e5b77cac0c912873fe505493565d`.
- B2 controlling scope commit: `ce50306400b3173a489e2413f0531cef58c863a6`.
- **Exact B2 implementation and verification source:** `ce931f8320861117e64eba4403b84d6e7fe8da25`.
- **Permanent three-lane B2 certification run:** `33045836351`.
- Canonical status: `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE`.
- This and any later documentation-only handoff is later than the tested implementation source and must never replace `ce931f8320861117e64eba4403b84d6e7fe8da25` as the B2 certification identity.
- PR #672 remains open, draft, mergeable, unmerged, and undeployed. No scheduler installation, secret mutation, staging/production SQL, or live database mutation is claimed.

## Why certification was reopened and what closed it

The earlier B2 certification at `1d26af9df17cb7fa8334a299b4c78d29c0249904` remains historical evidence only. C0 and retained Store acceptance exposed three certification/compatibility gaps that required B2 to reopen:

1. B2-owned post-cutover tables were not all registered with the canonical resumable game-purge authority, and the standalone database acceptance harness still referenced the retired `fx_receipts` name rather than `fx_settlement_receipts`.
2. Retained Store settlement fixtures directly overwrote `account_balances`, which is correctly forbidden after the Banking projection cutover. Those fixtures now fund through canonical `record_business_ledger_entry_v2` and `record_player_ledger_entry` calls.
3. The permanent B2 workflow proved source/static and disposable PostgreSQL behavior but lacked a separate Chromium certification lane. The temporary self-mutating finalizer was also unsafe as durable certification plumbing.

The repair keeps Banking strict. The final permanent workflow is read-only, has no branch-writing finalizer, and certifies the exact PR SHA in three independent lanes: source/static, disposable PostgreSQL acceptance, and Chromium.

## Implemented authority

B2 establishes the Banking-owned monetary layer required before shared multi-currency purchase funding:

- canonical opaque `bac_...` bank-account identity for Player, Business, and named system parties;
- deterministic backfill of historical monetary projections without rewriting historical economic amounts;
- immutable grouped Banking transactions and per-currency-balanced `balanced_v2` journal posting;
- a signed, non-spendable compatibility-offset account for retained legacy monetary gateways;
- posted, held, and available balance authority with append-only hold lifecycle evidence;
- direct monetary DML denial and narrow fixed-search-path service commands;
- named FX clearing, reserve, and fee-revenue accounts;
- capped per-fixing liquidity with the 10% operating buffer, reservations, draws, repayments, and fail-closed `FX_LIQUIDITY_UNAVAILABLE` behavior;
- immutable customer FX quote/order/event/receipt evidence;
- standard one-day FX settlement and immediate FX settlement with the configured instant-conversion fee policy;
- Player Banking FX public routes/read models/UI using browser-safe public keys only;
- Business canonical Checking identity compatibility required by retained Store settlement;
- game isolation, idempotency, rollback, concurrency, hold enforcement, and exact replay behavior across retained monetary domains.

B2 does **not** implement maximum-three-account purchase funding, Store/Marketplace/Stocks listing-currency convergence, Business foreign-Checking treasury controls, or final Phase 10A.4 Store FX convergence. Those remain ordered under C0-C4 and 10A.4D.

## Durable implementation surface

### Forward migrations

The B2 implementation/hardening surface contains these forward migrations:

- `backend/supabase/migrations/20260826010811_banking_fx_purge_registry_v1.sql`
- `backend/supabase/migrations/20260826090000_banking_account_identity_v1.sql`
- `backend/supabase/migrations/20260826091000_banking_transaction_holds_v1.sql`
- `backend/supabase/migrations/20260826092000_fx_clearing_liquidity_v1.sql`
- `backend/supabase/migrations/20260826093000_player_banking_fx_v1.sql`
- `backend/supabase/migrations/20260826094000_player_banking_fx_commands_v1.sql`
- `backend/supabase/migrations/20260826095000_player_banking_fx_order_commands_v1.sql`
- `backend/supabase/migrations/20260826096000_player_banking_fx_settlement_v1.sql`
- `backend/supabase/migrations/20260826097000_player_banking_fx_worker_v1.sql`
- `backend/supabase/migrations/20260826098000_banking_fx_readiness_v1.sql`
- `backend/supabase/migrations/20260826100000_business_bank_identity_runtime_v1.sql`
- `backend/supabase/migrations/20260826101000_banking_staff_adjustment_compatibility_v1.sql`
- `backend/supabase/migrations/20260826102000_banking_fx_postcutover_purge_registry_v1.sql`

### Canonical tables/evidence

B2 introduces or owns the post-cutover semantics of the following Banking/FX records while retaining `ledger_entries` and `account_balances` as the canonical journal/projection:

- `public.bank_accounts`
- `public.bank_transactions`
- `public.bank_account_holds`
- `public.bank_account_hold_events`
- `public.fx_liquidity_cap_snapshots`
- `public.fx_liquidity_events`
- `public.fx_quotes`
- `public.fx_orders`
- `public.fx_order_events`
- `public.fx_settlement_receipts`
- `private.fx_order_runtime_state`

The post-cutover purge-registration migrations bind B2-owned game-scoped evidence into the canonical resumable whole-game purge contract rather than creating a separate deletion authority.

### Service RPCs and worker commands

Public service-only commands/read projections used by the B2 runtime include:

- `record_player_ledger_entry(...)`
- `record_business_ledger_entry_v2(...)`
- `list_player_bank_accounts_v1(...)`
- `create_player_fx_quote_v1(...)`
- `get_player_banking_fx_overview_v1(...)`
- `list_player_bank_activity_v1(...)`
- `list_player_fx_rate_history_v1(...)`
- `list_player_fx_orders_v1(...)`
- `submit_player_standard_fx_order_v1(...)`
- `cancel_player_standard_fx_order_v1(...)`
- `execute_player_instant_fx_v1(...)`
- `claim_due_standard_fx_orders_v1(...)`
- `settle_standard_fx_order_v1(...)`
- `fail_standard_fx_order_v1(...)`

The single private balanced posting primitive remains `private.post_bank_transaction_v1(...)`; browser roles and `service_role` do not receive direct execution authority over that primitive or direct monetary-table mutation authority.

### Player Banking FX routes

The authenticated Player Banking surface is exact-path parsed under `/players/me/banking/fx`:

- `GET /players/me/banking/fx`
- `GET /players/me/banking/fx/history`
- `GET /players/me/banking/fx/orders`
- `POST /players/me/banking/fx/quotes`
- `POST /players/me/banking/fx/orders/standard`
- `POST /players/me/banking/fx/orders/instant`
- `POST /players/me/banking/fx/orders/{fxo_...}/cancel`

Capability and rate-limit dispatch are kept in parity across the Player and Classroom API roots. Browser contracts expose opaque public keys and server-derived monetary results, not internal UUIDs.

### Main source and acceptance files

The permanent source surface is centered in:

- `backend/src/domains/banking-fx/**`
- the Banking public-read portions of `backend/src/domains/economy/**`
- the B1 FX fixing integration required for synchronous liquidity-cap snapshots;
- Player capability/rate-limit/Edge dispatch files;
- `player-terminal/src/features/banking/**`, `player-terminal/src/pages/banking-page.js`, and Banking FX adapters/read models;
- `player-terminal/tests/banking-fx-surface.mjs` and `player-terminal/tests/browser/player-banking-fx.spec.mjs`;
- `scripts/banking-fx-database-acceptance.mjs` / `.sql`;
- retained Store settlement/connected-browser harnesses repaired to use canonical Banking posting rather than projection overwrites;
- `.github/workflows/banking-fx-clearing-v1.yml`.

## Final compatibility corrections included in the certified source

The final repaired source preserves the closed compatibility allowlist while admitting legitimate retained gateways, resolves Business monetary identity through `business_id` rather than the Business owner's Player identity, resolves Player monetary identity through `player_id`, and requires test/retained Store funding to use canonical journal commands. No production runtime authority was weakened to make acceptance pass.

The connected Player Store journey that previously failed at `Buyer funding returned 500` is green at the held SHA. Its setup now crosses the same balanced Banking gateways required in production semantics instead of bypassing the projection guard.

## Exact-head verification on `ce931f8320861117e64eba4403b84d6e7fe8da25`

### Permanent B2 certification gate

**`banking-fx-clearing-v1` — PASS** (`33045836351`) with all three exact-SHA jobs successful:

- `Certify Banking FX clearing source` — success (`98429498128`): authority contract, Banking/FX tests, Deno/backend verification, migration validation, local Edge runtime contract, and `git diff --check`.
- `Verify Banking FX database acceptance` — success (`98429498313`): disposable Supabase/PostgreSQL startup, zero-to-head reset, Banking/FX database acceptance, rebuilt-database lint, and clean teardown.
- `Verify Banking FX Chromium acceptance` — success (`98429498040`): exact-SHA Player Terminal install, Chromium install, browser-only runtime fixture, and full Playwright browser verification.

### Complete retained exact-head matrix

Every pull-request-triggered workflow returned for the held source completed successfully. High-signal run IDs include:

- **Database Replay — PASS** (`33045836076`).
- **Business Player Store Cutover V2 — PASS** (`33045836240`): connected authenticated Buyer/seller Store journey in two games, real database vectors, replay/concurrency/withdrawal ordering, standalone Player verification, and full Chromium.
- **Business Store Atomic Settlement V2 — PASS** (`33045836230`).
- **Business Store Seller Offers V2 — PASS** (`33045836311`).
- **Business Store Withdrawal Safety V2 — PASS** (`33045836342`).
- **Business Store Listing Inventory V2 — PASS** (`33045836231`).
- **Player Terminal Verify — PASS** (`33045836354`).
- **Backend Typecheck — PASS** (`33045836366`).
- **Repository Quality — PASS** (`33045836246`).
- **Beta Security Contract — PASS** (`33045836157`).
- **Supply Chain Security — PASS** (`33045836208`).
- **Business Banking Runtime — PASS** (`33045836219`).
- **Player Local Currency Authority — PASS** (`33045836277`).
- **Business Economy V2 — PASS** (`33045836303`).
- **Business Timed Manufacturing V2 — PASS** (`33045836323`).
- **Business Workforce Hiring V2 — PASS** (`33045836267`).
- **Business Workforce Payroll V2 — PASS** (`33045836126`).
- **Business Workforce Production Payroll V2 — PASS** (`33045836302`).
- **Marketplace Preconvergence — PASS** (`33045836116`).
- **Environment Neutral Browser — PASS** (`33045836347`).
- **Progression Runtime — PASS** (`33045836266`).
- **Runtime Interaction Wiring — PASS** (`33045836299`).
- **World Runtime — PASS** (`33045836348`).
- **Required Game Market Timezone — PASS** (`33045836180`).
- **Exchange Calendar Runtime — PASS** (`33045836279`).
- **Admin API Check — PASS** (`33045836109`).
- **Admin Game Lifecycle Controls — PASS** (`33045836310`).
- **Staging Readiness Preflight — PASS** (`33045836289`).

The exact source exposed 30 pull-request-triggered workflow runs; all 30 completed successfully. Its 60 check runs were terminal with no failure, cancellation, timeout, or pending/in-progress check at certification. Conditional diagnostics and unauthorized release/deployment actions that were not applicable remained skipped rather than executed.

## Exit result

- Banking-owned account identity and public-key privacy: **met**.
- Historical amount preservation and deterministic backfill: **met**.
- Per-currency balanced grouped journal: **met**.
- Compatibility gateways produce balanced economic + offset evidence: **met**.
- Direct monetary DML denial and immutable journal/projection identity: **met**.
- Holds, available-balance enforcement, races, replay, and rollback: **met**.
- FX clearing/reserve/fee identities and bounded facility capacity: **met**.
- Standard and instant Player FX order authority: **met**.
- Cross-domain retained Business/Store/Marketplace/Banking compatibility: **met** for the B2 boundary.
- Permanent static + disposable-database + Chromium B2 workflow: **met**.
- Complete inherited exact-head matrix, connected Store, and two-game evidence: **met**.
- Merge/deployment/live-environment completion: **not claimed**.

## Next authorized roadmap item

`BUSINESS-V2-10A4C0` may begin only from the clean documentation-only B2 handoff on a new stacked branch `feat/multicurrency-funding-core-v1`.

C0 is limited to the shared purchase-funding authority:

- one immutable server-authoritative funding quote for a bill denominated in one target/listing currency;
- at most three selected canonical Player Checking accounts;
- exact account/currency/available-balance snapshots and deterministic allocation validation;
- same-currency legs plus FX-backed legs that consume the already-certified B2 Banking/FX authority rather than implementing another exchange-rate or conversion engine;
- a private atomic funding composer that can later be consumed by Store, Marketplace, Stocks, and Business treasury/procurement integrations;
- total funded target amount must equal the bill exactly; partial/underfunded completion is forbidden;
- browser contracts expose only public account/funding/quote keys and user-selected allocation intent, never internal UUIDs or trusted economic outcomes;
- replay, conflicting reuse, expiration, stale balance/hold/FX evidence, insufficient funds, FX liquidity failure, rollback, concurrency, and two-game isolation must fail closed.

C0 must not modify Store, Marketplace, Stocks, or Business-specific purchase settlement yet. Those integrations remain C1-C4. No merge, deployment, secret change, scheduler change, staging/production SQL, or live database mutation is authorized by this handoff.
