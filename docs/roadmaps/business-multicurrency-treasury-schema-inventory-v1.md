# Business Multi-Currency Treasury Schema and Runtime Inventory v1

**Roadmap item:** `BUSINESS-V2-10A4C4`  
**Inventory source:** `18fde31be5e1599c7d9a65d681b248fcb4756dc4`  
**Status:** `AUDITED_FOR_IMPLEMENTATION`

## Existing canonical authorities

### Business identity and authorization

- `public.business_entities`
- Business ownership/controller records and `resolve_player_business_v2(...)`
- extracted Business HTTP handler and exact-path router
- public Business identity `biz_...`

These remain the authority for which authenticated Player may act for a Business. Business monetary identity is never the controller Player identity.

### Banking identity, journal, balance, and holds

- `public.economic_parties`
- `public.bank_accounts`
- `public.bank_transactions`
- `public.ledger_entries`
- `public.account_balances`
- `public.bank_account_holds`
- `public.bank_account_hold_events`
- `private.ensure_business_bank_account_identity_v1(...)`
- `private.ensure_bank_account_projection_v1(...)`
- `private.post_bank_transaction_v1(...)`
- `private.active_bank_account_hold_amount_v1(...)`

No new money table or posting primitive is required.

### FX fixing, capacity, and settlement

- `private.fx_runtime_state`
- `public.fx_fixings`
- `public.fx_fixing_currency_values`
- `public.fx_policy_versions`
- `public.fx_liquidity_cap_snapshots`
- `public.fx_liquidity_events`
- `public.fx_quotes`
- `public.fx_orders`
- `public.fx_order_events`
- `public.fx_settlement_receipts`
- `private.fx_order_runtime_state`
- `private.player_fx_current_cap_v1(...)`
- `private.player_fx_system_account_v1(...)`
- existing standard-order claim/settle/fail worker commands

C4 extends owner identity and Business wrappers only. Rate, fee, timing, clearing, reserve, and worker authorities remain B2.

### Shared purchase funding

- `public.purchase_funding_quotes`
- `public.purchase_funding_quote_lines`
- `public.purchase_funding_receipts`
- `private.purchase_funding_quote_public_json_v1(...)`
- `private.purchase_funding_receipt_public_json_v1(...)`
- `public.create_purchase_funding_quote_v1(...)`
- `private.compose_purchase_funding_v1(...)`
- `private.purchase_funding_ceil_minor_v1(...)`

C4 extends exact owner identity and adds Business wrappers. Quote lines and pricing remain the same C0 authority.

### Store procurement and Inventory

- `public.business_store_purchase_quotes`
- `public.business_store_purchases`
- `public.create_business_store_quote_v2(...)`
- `public.purchase_business_store_quote_v2(...)`
- `public.resolve_store_quote_pricing_v2(...)`
- `public.store_items`
- `public.game_items`
- `public.inventory_accounts`
- `public.inventory_holdings`
- `public.inventory_transactions`
- `public.inventory_transaction_lines`
- `economy_private.ensure_business_inventory_account_v2(...)`
- `economy_private.post_inventory_transaction_v2(...)`
- named system party/account `store.seeded-revenue`

The existing commercial and Inventory roots remain. Only the active payment family changes.

## Existing source surfaces to retain

### Backend Business domain

- `backend/src/domains/business/api/playerBusinessRoutePaths.ts`
- `backend/src/domains/business/api/playerBusinessRequestValidation.ts`
- `backend/src/domains/business/api/playerBusinessHttpHandler.ts`
- `backend/src/domains/business/api/playerBusinessStoreProcurement.ts`
- `backend/src/domains/business/contracts/playerBusinessContracts.ts`
- `backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts`
- `backend/src/domains/business/index.ts`

### Banking FX domain and worker

- `backend/src/domains/banking-fx/**`
- `backend/src/domains/economy/**` Banking public-read boundaries
- `backend/supabase/functions/banking-fx-orchestrator/index.ts`

### Edge dispatch

- `backend/supabase/functions/_shared/playerBusinessDispatch.ts`
- `backend/supabase/functions/player-api/runtime.ts`
- `backend/supabase/functions/classroom-api/index.ts`
- Player capability and rate-limit dispatch contracts

### Player Terminal

- Business endpoints, routes, resource plan, read model, and page modules
- Business procurement forms and Business workspace rendering
- Student-Profile adapter and payload normalizer
- standalone and Chromium Business tests

## Required forward schema changes

### Migration 1 — owner identity and Business account read/open

Planned path:

`backend/supabase/migrations/20260831100000_business_multicurrency_owner_identity_v1.sql`

Required changes:

1. Add nullable `business_id` to `fx_quotes` and `fx_orders`.
2. Make their `player_id` columns nullable.
3. Backfill/validate exact-one-owner constraints without changing existing Player rows.
4. Replace Player-only idempotency uniqueness with owner-specific partial unique indexes.
5. Add Business scope foreign keys and Business-created/read indexes.
6. Add nullable `business_id` to `purchase_funding_quotes` and `purchase_funding_receipts`.
7. Make their `player_id` columns nullable.
8. Add exact-one-owner constraints, Business scope foreign keys, and owner-specific idempotency indexes.
9. Preserve existing quote/order/receipt public keys, hashes, amounts, rates, and timestamps.
10. Add service-only `ensure_business_banking_account_v1(...)` and `list_player_business_bank_accounts_v1(...)`.
11. Add bounded Business treasury overview read using Business ownership/controller authorization and public-key-only rows.

No existing evidence row is updated except deterministic owner-schema validation metadata implied by adding null Business columns and constraints.

### Migration 2 — Business treasury FX commands

Planned path:

`backend/supabase/migrations/20260831101000_business_treasury_fx_commands_v1.sql`

Required commands:

- `create_business_fx_quote_v1(...)`
- `submit_business_standard_fx_order_v1(...)`
- `execute_business_instant_fx_v1(...)`
- `cancel_business_standard_fx_order_v1(...)`
- Business order/read projection functions

Required worker convergence:

- standard-order claim remains game/order based;
- settlement resolves quote owner as exactly Player or Business;
- source/target ownership checks use the quote owner family;
- existing Player behavior and signatures remain unchanged;
- events, receipts, holds, liquidity effects, and transaction line roles remain B2 evidence.

### Migration 3 — Business C0 funding and procurement cutover

Planned path:

`backend/supabase/migrations/20260831102000_business_procurement_funding_v1.sql`

Required changes:

1. Add nullable funding bindings to `business_store_purchase_quotes`:
   - `funding_quote_id`;
   - `funding_context_hash`;
   - `target_bank_account_id`;
   - `funding_idempotency_key`;
   - request idempotency/hash fields if needed for exact replay.
2. Add nullable funded settlement evidence to `business_store_purchases`:
   - `funding_receipt_id`;
   - `bank_transaction_id`;
   - `target_bank_account_id`.
3. Enforce mutually exclusive legacy direct-debit versus C4 funded evidence families.
4. Add `create_business_purchase_funding_quote_v1(...)` as the Business owner-aware C0 wrapper.
5. Add private Business funding composition wrapper over the shared owner-aware C0 composer.
6. Replace the active Business Store quote command with a funded quote command that:
   - preserves Store commercial pricing;
   - uses the Business settlement/reporting currency and final total;
   - resolves `store.seeded-revenue` in that currency;
   - binds one to three owned Business Checking allocations;
   - stores the C0 quote and context evidence immutably.
7. Add funded procurement settlement that:
   - resolves replay first;
   - rejects unbound legacy quote execution with the stable retired code;
   - preserves Store-first and Warehouse lock ordering;
   - invokes C0 composition inside the same transaction;
   - transfers Store stock to Business Warehouse;
   - records Warehouse weighted-average cost in settlement currency;
   - completes Business purchase and activity evidence.

### Migration 4 — assertions and purge retention

Planned paths:

- `backend/supabase/migrations/20260831103000_business_multicurrency_assertions_v1.sql`
- `backend/supabase/migrations/20260831104000_business_multicurrency_purge_registry_v1.sql` only if new game-scoped evidence tables are introduced during implementation.

The assertions migration must prove:

- exact-one-owner constraints;
- existing Player row compatibility;
- Business foreign account identity/projection uniqueness;
- fixed search paths and grants;
- immutable evidence and direct DML denial;
- legacy/funded procurement evidence exclusivity;
- public-key formats and UUID denial boundaries;
- no Business account use through Player C0/B2 public commands.

No purge migration is needed if C4 only extends existing registered B2/C0 tables and adds no new game-scoped table.

## Required backend contracts

Planned Business source additions or bounded edits:

- `backend/src/domains/business/api/playerBusinessTreasury.ts`
- `backend/src/domains/business/api/playerBusinessTreasury.test.ts`
- `backend/src/domains/business/contracts/businessTreasuryContracts.ts`
- `backend/src/domains/business/infrastructure/supabaseBusinessTreasuryRepository.ts`
- `backend/src/domains/business/infrastructure/supabaseBusinessTreasuryRepository.test.ts`
- bounded route, request-validation, handler, repository, index, and procurement DTO edits

The Business domain may depend on Banking/FX through repository/RPC contracts. It must not import Banking infrastructure or create a domain cycle.

## Required API route additions

`PlayerBusinessRoute` additions:

- `businessTreasuryRead`
- `businessTreasuryAccountOpen`
- `businessTreasuryFxQuote`
- `businessTreasuryFxStandard`
- `businessTreasuryFxInstant`
- `businessTreasuryFxCancel`

Existing route kinds retained and upgraded:

- `businessStoreQuote`
- `businessStorePurchase`

Request validation must reject unknown fields and forbidden scope identifiers before repository execution.

## Required public DTO shape

### Treasury account

- `accountKey`
- `accountKind`
- `currencyCode`
- `status`
- `postedAmount`
- `heldAmount`
- `availableAmount`

### Treasury FX quote/order/receipt

Reuse B2 public field names where possible:

- `quoteKey`, `orderKey`, `receiptKey`
- `businessKey`
- source/target public account keys
- source/target currency and amounts
- reference/customer rate
- spread and fee disclosure
- product, expiry, settlement time, status, replay state

### Funded procurement

Extend the existing quote/receipt DTOs with:

- `fundingQuote`
- `targetAccountKey`
- `fundingReceipt`
- `bankTransactionKey`
- `paymentAuthority`
- immutable replay/refresh status

No DTO may expose an internal UUID, hash, private policy/cap ID, lease field, or browser-authored trusted monetary result.

## Required Player Terminal surface

Planned files may include bounded edits or focused modules under:

- `player-terminal/src/features/business/**`
- `player-terminal/src/pages/business-page.js`
- `player-terminal/src/api/**`
- `player-terminal/src/integrations/**`
- `player-terminal/tests/**`
- `player-terminal/tests/browser/**`

Required states:

- treasury loading/empty/error/ready;
- account-open pending/success/replay/error;
- FX quote review/expired/standard-pending/instant-settled/cancelled/failed;
- procurement allocation incomplete/exact/overfunded;
- funding quote review/expired;
- procurement settled/replayed/refresh-pending/error.

## Required permanent verification surface

Planned files:

- `.github/workflows/business-multicurrency-treasury-v1.yml`
- `scripts/business-multicurrency-treasury-contract.mjs`
- `scripts/business-multicurrency-treasury-database.mjs`
- `scripts/business-multicurrency-treasury-concurrency.mjs`

The permanent workflow must include at least:

1. source, scope, PR authority, backend/Edge, Player, and architecture contracts;
2. disposable PostgreSQL zero-to-head replay twice, C4 database acceptance, observed concurrency, lint, and teardown;
3. Chromium Business treasury/procurement acceptance with public-payload privacy enforcement.

## Paths explicitly outside C4

- B1 fixing calculation and scheduler implementation
- Store/Marketplace/Stock settlement source except retained tests
- final 10A.4D frozen Store cutover repair
- loans, credit, overdraft, tax, shipping, supplier contracts, wholesale catalogs
- automatic sales/demand, equity, IPO, financial statements
- release/deployment workflows, secrets, staging/production SQL, live data

## Inventory conclusion

The current schema already contains every core authority C4 needs. C4 is a bounded owner-generalization and orchestration tranche, not a new economic subsystem.