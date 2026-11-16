# Banking FX Clearing Scope v1

**Roadmap item:** `BUSINESS-V2-10A4B2`
**Status:** `IMPLEMENTED_NOT_MERGED` — exact certified implementation source `ce931f8320861117e64eba4403b84d6e7fe8da25`; PR #672 remains draft, open, unmerged, and undeployed
**Branch:** `feat/banking-fx-clearing-v1`
**Parent branch:** `feat/canonical-fx-authority-v1`
**Parent draft PR:** #671
**Exact parent implementation:** `41bc2d978fe67cd06a8f2133f7310075492ecd99`
**Exact parent documentation handoff:** `5e427e8f5b39e5b77cac0c912873fe505493565d`
**Scope commit:** `ce50306400b3173a489e2413f0531cef58c863a6`
**Exact certified B2 source:** `ce931f8320861117e64eba4403b84d6e7fe8da25`
**Permanent B2 certification run:** `33045836351`
**Production deployment authorized:** No

## Decision

Checkpoint B1 established one canonical game-local reference fixing but deliberately did not create monetary ownership or settlement. B2 makes Banking the sole authority for monetary accounts, posted balances, holds, balanced journal transactions, clearing liquidity, and Player customer FX.

The governing invariants are:

- `public.economic_parties` remains the only Player, Business, Store, country, escrow, and system-party registry.
- `public.ledger_entries` remains the only canonical money journal and `public.account_balances` remains Banking's only canonical posted-balance projection; no wallet, reserve-balance cache, or new parallel treasury is introduced. The pre-existing `marketplace_treasury_balances` competitor remains explicit debt until C2 and is neither consumed nor legitimized by B2.
- Every pre-B2 ledger entry keeps immutable economic identity and amount and is explicitly `legacy_v1`; projection/account-link metadata may change only for deterministic identity backfill. Every monetary write after cutover, including a compatibility call from an older domain, must be an account-linked `balanced_v2` transaction that sums to zero independently in every currency.
- Compatibility balancing uses a dedicated `banking.compatibility-offset` system party and never the FX central reserve. Its per-currency account is a non-spendable signed contra that records net issuance or retirement already authorized by an allowlisted legacy gateway; it is not liquidity, cannot fund a customer/domain/FX transaction, cannot carry holds, and is excluded from facility-cap inputs. It preserves an older domain command's economic meaning without performing the C1-C4 currency/funding convergence early.
- Available balance is posted balance minus active holds and is always derived. A second reserved-balance projection is forbidden.
- Clearing accounts may never be negative. Reserve accounts may become negative only inside the private FX-liquidity primitive and never beyond persisted cap less utilization and reservations.
- Browser requests use public keys and economic intent only. Internal UUIDs, rates, balances, game scope, parties, policy versions, fees, and settlement totals remain server derived.
- No historical amount, prior B1 fixing, Story authorization, certified SHA, stock trade, Store purchase, Marketplace settlement, or Business posting is rewritten.

## Canonical Banking identity and legacy cutover

### Account model

- Add `public.bank_accounts` as identity only: internal UUID, `bac_...` public key, game, economic party, account kind, currency, status, and timestamps.
- Account kinds cover personal `checking` and `savings`, the existing Business home-currency `checking` account, plus named `fx_clearing`, `fx_reserve`, `fx_fee_revenue`, and `compatibility_offset` system accounts. Savings never funds FX or purchases; Business foreign Checking creation and actions remain C4-owned.
- Enforce one canonical projection per bank account and game-scoped composite foreign keys to party, currency, journal, and projection identities.
- Make legacy `account_balances.player_id` nullable so Business and system accounts are representable. Retain `player_id`, `business_id`, `account_type`, and `currency_code` as compatibility/evidence columns, but make `bank_account_id` the authoritative projection identity.
- Widen legacy fixed two-decimal storage without changing any stored amount. All new amounts must conform to the linked currency's registry precision; calculations use exact PostgreSQL `numeric` and round only at the final monetary boundary.

### Deterministic backfill

- Backfill Player accounts to Player economic parties and authoritative Business balances to Business economic parties without changing ledger amounts or projection totals.
- Classify stale prior-controller Business rows separately. A nonzero ambiguous or phantom `business:biz_...` row blocks cutover; zero legacy rows are preserved under closed legacy account identities and are never summed into a Business balance.
- Reject any non-owner Player row masquerading as a Business balance. Canonical Business identity comes from `business_id` and the Business party, not the current owner.
- Map any otherwise unowned historical signature to an explicit closed `banking.legacy-unassigned` system identity rather than leaving an account link null.
- Create one immutable `legacy_v1` transaction header per historical ledger entry, link every historical journal line and projection to canonical account identity, validate exact row counts/sums, and only then require account identity for future journal/projection writes.
- The cutover is forward-only. It does not delete, consolidate, round, revalue, or relabel historical money.

## Balanced journal and posting authority

- Add immutable `public.bank_transactions` grouping headers with a `btx_...` public key, game, accounting version, source identity, idempotency key, canonical request hash, status, metadata, and committed time.
- Extend `ledger_entries` with canonical account, transaction, deterministic line ordinal, and accounting-version identity. Posted lines are immutable; reversals are new balanced transactions.
- Implement exactly one private `post_bank_transaction_v1`. It remains safe when a trusted caller already holds the same header/account locks in canonical order, but exposes no skip-validation or alternate posting path: replay, game/currency/party checks, precision, per-currency balance, available funds, reserve authority, line insertion, and projection updates always run. The primitive is not executable by browser roles or `service_role`; narrow public service-only commands own intent validation and composition.
- Replay lookup precedes lifecycle, expiry, balance, or rate interpretation. Same key and same request hash returns the original committed result; the same key with another hash fails without mutation.
- Aggregate net deltas per account, then lock projection rows in immutable bank-account UUID order. Validate game, party, kind, currency, status, precision, active holds, reserve authority, and per-currency zero sum before inserting any line.
- Preserve multiple logical lines against one account where the receipt needs separate principal and fee evidence. Insert deterministic line ordinals and update each projection once.
- Global monetary lock order is domain/order root, quote, bank-transaction/idempotency header, accounts sorted by canonical UUID, then holds sorted deterministically. A later prelocking C0 caller must acquire that same header before accounts; the one primitive may reacquire already-owned locks in the same order but may never skip validation or invert it.
- Redefine the active Player and Business ledger wrappers and every direct legacy money-write gateway so post-cutover calls compose a balanced transaction against the compatibility-offset account. Only explicitly allowlisted source-domain/action gateways may move that signed contra, and every movement records the original authorization identity and digest. The wrappers retain their public signatures only where compatibility requires them.
- A table-level projection guard applies to balanced and compatibility paths and rejects any ordinary debit that would leave posted balance below active holds. Payroll and other allocators must calculate from available balance or fail before emitting credits.
- New projection rows, journal rows, transactions, events, receipts, and facility evidence are not directly mutable by `service_role`. Explicitly revoke broad inherited DML/TRUNCATE grants after creation/backfill, retain only required reads, and expose fixed-search-path public command wrappers.
- Guards reject direct raw journal insertion, posted-row update/delete, projection fabrication, and unauthorized reserve overdraft. Trusted child-first whole-game purge behavior remains intact only after the owning game is gone.

## Holds

- Add `public.bank_account_holds` for current reservation identity/state and append-only `public.bank_account_hold_events` for create, claim, consume, release, expire, and terminal-failure evidence.
- A hold is game/account/currency scoped, has one public key, immutable purpose/owner/amount identity, explicit lifecycle, expiry where applicable, and exactly-once terminal transition.
- Hold creation locks the account projection before the hold row. It validates posted minus all active holds and cannot race another debit or reservation into overspend.
- Every balance-changing path, including legacy Store, Marketplace, Stocks, Travel, Story, loan, formation, production, payroll, staff correction, and account-transfer wrappers, reaches the table-level available-balance guard.
- Hold consumption happens inside the same transaction as its monetary posting. Cancellation is permitted only before a worker claim; claim/cancel races produce exactly one terminal outcome and release capacity exactly once.

## Clearing, reserve facility, and readiness

- Provision game-scoped system parties `fx.clearing-house`, `fx.central-reserve`, `fx.fee-revenue`, and `banking.compatibility-offset` through the existing economic-party registry.
- Provision one clearing account, reserve account, fee-revenue account, and compatibility-offset account per active registry currency. Clearing, reserve, and fee accounts never mix currencies.
- Persist one immutable facility-cap snapshot per B1 fixing/currency, including formula inputs, prior utilization/reservations, operating-buffer target, cap, and canonical digest. Future cap snapshots are created synchronously in the same transaction that advances B1's current-fixing pointer, under the same game-scoped monetary advisory lock acquired by every B2 post; the fixing cannot commit current without a complete cap set. The initial B2 cutover snapshot is explicitly distinguished because balances at historical fixing boundaries cannot be reconstructed.
- Policy v1 cap is the greater of 100 times that currency's approved arrival starting balance or twice all positive non-system posted balances in the currency. ECO uses the largest approved arrival package converted through the accepted fixing.
- A later cap never falls below utilized capacity plus active reserve reservations. No mutable headroom cache is stored.
- Seed a 10%-of-cap operating buffer with an explicit balanced reserve-debit/clearing-credit transaction and immutable draw evidence. It counts as utilized capacity.
- Clearing inflows first preserve the current operating-buffer target; eligible excess repays outstanding reserve utilization through an explicit clearing-debit/reserve-credit transaction and immutable repayment evidence. Draws, repayments, utilization, and reservations must reconcile to journal balances.
- Standard orders reserve both payer principal and target-currency clearing/facility capacity. Reserve availability derives from cap, posted reserve balance/utilization, and active reserve holds.
- Add idempotent game-readiness provisioning for parties, accounts, current-fixing cap evidence, and Player/Business canonical-account links. Forward-redefine `verify_provisioned_game_v1` so an incomplete Banking/FX authority cannot become ready.
- Future fixing publication and B2 processing are atomic at the runtime-pointer boundary: cap evidence is complete before the new fixing becomes current. Failure rolls back pointer advancement and cap/buffer writes together, leaving the prior fixing active and the failed publication observable without rewriting evidence.

## Customer FX products

### Immutable evidence

- Add immutable `public.fx_quotes`, `public.fx_orders`, append-only order events, settlement receipts, clearing evidence, cap snapshots, and draw/repayment evidence.
- Browser-visible keys use `fxq_...`, `fxo_...`, and `fxr_...`. **Superseding interface decision:** the approved outline also proposed `fxf_...` for clearing evidence, but B1 already immutably owns that prefix for fixing identity. B2 therefore uses distinct `fxc_...` clearing evidence or keeps it internal and never overloads `fxf_...`.
- Every quote binds source/target public account identity, amount mode, exact debits/credits, currency precision, accepted fixing, policy, reference rate, customer rate, spread, explicit fee, rounding disclosure, expiry, and settlement boundary.
- Quote creation reserves nothing. Submission revalidates ownership, game, account state, unconsumed quote, exact fixing/policy binding, expiry, and liquidity.

### Pricing and timing

- Standard bank: accepted mid-rate less 0.50%, no separate fee.
- Instant bank: the same 0.50% customer rate plus a separately posted 2.00% source-currency fee.
- Same-currency: rate `1`, spread `0`, no FX order, no FX fee, and no reserve use.
- Quote expiry is the earlier of 120 seconds or the next game-local fixing boundary derived from the accepted fixing. If that boundary has already passed because a fixing is delayed or overdue, quote creation fails closed rather than selling a stale rate.
- Standard submission locks the quote rate and creates both reservations. Settlement occurs at the next strictly later game-local 08:00 boundary, including weekends, through a leased worker.
- Standard cancellation is allowed only before claim. Terminal failure and cancellation release payer and facility reservations exactly once. Lease expiry is recoverable without duplicate settlement.
- Exhausted or concurrently reserved facility headroom returns exact contract `FX_LIQUIDITY_UNAVAILABLE` with no journal, projection, hold, order, event, draw, or receipt mutation.
- Instant conversion posts payer principal, source clearing, separate payer fee, fee revenue, any target reserve draw/clearing movement, and recipient credit atomically. A failure after any stage rolls back every line, projection, event, and receipt.
- Standard settlement consumes its reservations and posts the same economic legs without an instant fee. Clearing/reserve capacity is never oversold across concurrent instant, standard, or later retail demand.

## Player API and Banking experience

- Extend Player Banking balances with `bac_...` account key, kind, currency, posted amount, held amount, and available amount. Query personal canonical accounts so Business compatibility metadata cannot leak into the Player balance list.
- Add exact routes under `/players/me/banking/fx/**` for overview/current status, cursor history, quote creation, standard submission, standard cancellation, instant conversion, and bounded order history.
- Parse exact methods and path shapes without prefix fallback. Add capability-manifest and rate-limit entries and keep dispatch identical in both `player-api` and `classroom-api` roots.
- Player Banking shows authoritative source/target selectors, last and next fixing, 7-day/30-day/game-to-date history, mid/customer rate, spread, explicit instant fee, expected credit, settlement time, pending/completed orders, and posted/held/available currency balances.
- Keep B2 UI changes inside the Banking read flow/page and dedicated FX adapters/specs where practical. Recheck PR #624 before touching its overlapping `player-terminal/src/main.js` or existing pagination browser spec.

## Explicit transition boundary

- B2 changes monetary identity, holds, journal safety, clearing, and Player FX. It may redefine old money gateways solely to preserve their existing command semantics as balanced compatibility transactions and to enforce available balance.
- B2 does not add retail checkout FX, multi-account funding, listing-currency Store/Marketplace/Stocks behavior, Business foreign-account actions, procurement FX, owner-fund shortcuts, or domain asset mutations.
- Store, Marketplace, Stocks, and Business remain scheduled for C1-C4. Marketplace's competing treasury projection remains known debt until C2. Their pre-existing idempotency and domain lock-order limitations are not represented as globally repaired by B2; B2 proves only that they cannot bypass account holds or create a new one-sided money row after cutover.
- The global beta roadmap remains owned by draft PR #668 and is not edited here. PR #648 remains the stack index.
- No merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live-environment mutation is authorized.

## Required proof

- Replay every forward migration from zero twice against clean PostgreSQL databases; inspect final installed function bodies with `pg_get_functiondef`; run rebuilt-schema lint/advisors; and prove RLS, forced RLS, explicit grants, fixed search paths, Data API exposure, and whole-game purge behavior.
- Preserve exact historical ledger/projection counts and sums through backfill. Prove Player/Business/system classification, closed zero legacy rows, explicit unassigned identity, rejection of phantom/ambiguous nonzero Business rows, and no amount rewrite.
- Prove direct `service_role` journal, balance, transaction, hold, order, receipt, and facility mutation is denied while every intended narrow command succeeds.
- With posted 100 and an active hold of 80, prove every legacy and new debit of 21 fails with no mutation and a debit of 20 succeeds. Race debit versus hold creation and prove posted balance never falls below active holds.
- Prove exact replay/conflict semantics, sorted reverse-order account races without B2 deadlock, per-currency zero sum, line/projection reconciliation, append-only guards, and full rollback after every journal line, projection update, hold event, order event, receipt, clearing, draw, and repayment stage.
- Prove cap formula branches, ECO conversion, synchronous fixing/cap binding under the shared monetary lock, utilization floor, 10% buffer, draw, repayment, exact no-mutation `FX_LIQUIDITY_UNAVAILABLE`, two-game isolation, and no negative clearing under concurrent standard/instant demand.
- Prove standard 0.50%, instant 0.50% plus separate 2.00% source fee, same-currency 1/0/no-fee behavior, registry precision, one final monetary rounding, quote expiry, strictly later settlement, cancellation/claim races, terminal release, lease recovery, and stale/overdue fixing rejection.
- Cover 07:59:59/08:00, DST, weekends, delayed workers/fixings, repeated delivery, conflicting hashes, and simultaneous orders in both account input orders.
- Exercise hold enforcement through account transfers, loans, staff correction, provisioning, Store, Business Store, Marketplace settlement/reversal, Stocks, Travel, Story payments, Business formation/material/production, and payroll/recovery. Payroll must allocate from available balance or fail atomically before employee credit.
- Run Banking, Business Banking, Economy ledger, B1 FX, World, Store, Inventory, Marketplace, Stocks, Business, security, repository-quality, Player Terminal, Chromium, all Backend TypeScript, every Edge root, route/capability/rate-limit parity, public-payload UUID denial, and `git diff --check`.

## Certification closure — 2026-08-27

B2's certification recovery is complete at exact implementation and verification source `ce931f8320861117e64eba4403b84d6e7fe8da25`.

The permanent workflow `banking-fx-clearing-v1` run `33045836351` passed three exact-SHA lanes: source/static (`98429498128`), disposable PostgreSQL (`98429498313`), and Chromium (`98429498040`). The self-mutating certification finalizer was removed; the permanent workflow is read-only.

The complete exact-head PR matrix also passed. Thirty pull-request-triggered workflows completed successfully, including Database Replay (`33045836076`), Player Terminal Verify (`33045836354`), Business Player Store Cutover V2 (`33045836240`), Business Store Atomic Settlement V2 (`33045836230`), Store seller/withdrawal/listing gates, Business Banking, workforce/payroll/manufacturing, Marketplace, security, repository quality, World/calendar, Admin, and runtime wiring. The exact source exposed 60 terminal check runs with no failure, cancellation, timeout, or pending/in-progress check.

The inherited connected Store blocker is resolved without bypassing Banking. Retained Store acceptance now funds Player and Business balances through canonical ledger commands rather than direct `account_balances` writes, and Business/Player account identity resolves by `business_id` or `player_id` rather than treating a Business owner as the Business monetary identity.

The detailed durable migration/table/RPC/route and exact-run inventory is recorded in `docs/roadmaps/banking-fx-clearing-implementation-handoff-v1.md`. No runtime implementation after `ce931f8320861117e64eba4403b84d6e7fe8da25` is required for this certification claim; later documentation-only commits must not replace that tested source identity.

No merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation occurred as part of this certification closure.

## Completion boundary

This checkpoint is `IMPLEMENTED_NOT_MERGED` because one exact implementation SHA has passed the complete exact-head matrix and the later documentation-only handoff records the implementation surface and evidence.

It may not become `VERIFIED_COMPLETE` while unmerged or without required runtime evidence. After this clean B2 handoff, the next exact item is `BUSINESS-V2-10A4C0` on `feat/multicurrency-funding-core-v1`.
