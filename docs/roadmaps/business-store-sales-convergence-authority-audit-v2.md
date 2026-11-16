# Business Store Sales Convergence Authority Audit v2

**Roadmap item:** `BUSINESS-V2-11`
**Audit source:** `f92a61a61bdf336d608936577d8e5e48de11ae94`
**Audit date:** 2026-09-01
**Status:** `RESOLVED_FOR_SCOPE`

## Repository and owner identity

- Owner branch: `refactor/business-store-sales-convergence-v2`.
- Draft pull request: #680, based on `feat/business-player-store-fx-final-v2`.
- Exact parent implementation: `e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b`.
- Exact clean parent checkpoint/controller: `f92a61a61bdf336d608936577d8e5e48de11ae94`.
- PR-bound authority: `docs/operations/contracts/player-cross-cutting/pr-680.json`.
- Merge, deployment, scheduler, secret, staging/production SQL, and live-data mutation remain prohibited.

No pre-existing branch or open pull request owned Phase 11 at intake. Existing Business, Store, and funding owner branches remain frozen predecessors and are not edited, rebased, replaced, or force-pushed.

## Resolved sales authority

`store_offer_purchase_receipts` is immutable, forced-RLS, service-read-only evidence that already binds game, Buyer, seller Business, offer/version, listing custody, Store item, Inventory delivery, price, revenue, source unit cost, COGS, gross margin, funding receipt, Banking transaction, target Business Checking account, idempotency, and completion identity.

Phase 11 therefore adds no sale or Inventory settlement path. A new immutable period-source junction assigns each eligible post-cutover receipt exactly once to one Business period. Period close totals and gross-receipts tax derive only from that junction and its Store receipt rows. The close command does not trust cached `business_entities` totals, `business_inventory`, product demand, or caller-authored economic inputs.

## Resolved legacy retirement

The inherited `settle_business_cycle_v1(uuid,text,text,numeric,numeric,numeric,numeric)` accepts caller inflation, exchange, interest, and difficulty values; simulates demand; consumes legacy `business_inventory`; writes `business_sales`; posts synthetic revenue and tax; invokes payroll; and updates cached totals and valuation.

Phase 11 redefines that exact compatibility signature to fail with `BUSINESS_CYCLE_SETTLEMENT_RETIRED` before any write. Historical `business_sales` and `business_cycle_settlement_receipts` remain selectable but become immutable except during canonical whole-game purge. Admin `POST /businesses/{businessKey}/settle` maps directly to HTTP 410 `business_cycle_settlement_retired` before economic body parsing or RPC dispatch.

## Resolved period and payroll authority

The inherited `business_payroll_clocks` table has a period number and start time but no policy identity, due boundary, claim, or lease. `settle_business_payroll_current_period_v2` can advance immediately, pre-locks a balance before canonical Banking, ignores active holds, uses compatibility-offset postings, and hard-codes two-decimal arithmetic.

Phase 11 adds a versioned seven-day policy and snapshots it on every opened period. Existing clocks retain their period/start identity and derive `next_due_at` from that boundary; missing eligible clocks are added on the same cadence without economic mutation. Later policy versions apply only when opening a later period. Due work uses database time, bounded `FOR UPDATE SKIP LOCKED` claims, expiring leases, exact-once close identity, anchored advancement, and replay/conflict errors.

The lease-bound close command owns payroll, Store-source assignment, tax, liability, close, and successor opening as one transaction. It posts payroll through the canonical balanced Banking composer before tax, uses posted balance less active holds, pays tax only from canonical Business Checking availability, and retains any remainder as an immutable liability without rolling back the period. New monetary evidence uses canonical currency precision and `numeric(38,18)`.

## Resolved Banking and lock authority

`private.post_bank_transaction_v1` already owns the game monetary advisory, UUID-sorted account/balance/hold locks, active-hold availability, per-currency balancing, canonical balance projection, ledger journal, and replay/hash conflict. The Phase 11 postgres-owned close command may compose this private helper only after the period/lease guard and must not pre-lock an account balance or write `account_balances`/`ledger_entries` directly.

Payroll uses one Business Checking debit and bounded recipient credits in a balanced transaction. Tax uses Business Checking to the canonical tax authority account. Account, receipt-source, period, and Banking lock order must be covered in both forward and reverse concurrency tests.

## Resolved worker authority

The new `business-operations-worker` reuses `authorizeInternalRunnerRequest`, the persistent internal nonce claim, publishable request validation, and the existing internal signing secret. Its request contains no game, Business, due time, policy, rate, amount, or outcome. Database claims derive scope and time; responses contain aggregate counts only.

Browser bearer/session/cookie/Origin/CSRF inputs and raw internal-secret forwarding are rejected. The worker has no successful browser CORS path and no direct table mutation. Edge/auth manifests may register the new root, but scheduler/cron files, deployment commands, and secret provisioning are outside scope.

## Forward migration and purge decisions

Four logical migrations must be generated with `supabase migration new` from the exact predecessor and must sort strictly after `20260831103001_business_player_store_fx_final_v2.sql`. No prior migration may be renamed or edited. Every new game-scoped table must enable and force RLS, revoke browser roles, expose command-only mutation, and register with `private.game_data_purge_table_registry`; the final migration must rerun the global unregistered-table assertion.

Security-definer functions require a fixed `search_path` and explicit execute revokes from `public`, `anon`, and `authenticated`. Only the minimal worker/service commands and read projections may be granted to `service_role`.

## Read and presentation decision

Phase 11 removes simulated cycle/cached aggregate presentation from current Player and Admin financial authority while preserving the accepted shells. It does not implement the Phase 12 keyed workspace or Phase 13 supervision surface early. Historical compatibility rows must be labeled and treated as history, never merged into current Store-derived period totals.

## Audit conclusion

Phase 11 can retire the competing sales path and close guarded periods using existing Store, Inventory, Banking, workforce, and internal-runner authorities. Source implementation is authorized only within PR #680's exact-path manifest. Phase 12 remains closed until one exact Phase 11 implementation and later clean handoff/controller are green.
