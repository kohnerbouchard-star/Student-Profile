# Business Store Sales Convergence Scope v2

**Roadmap item:** `BUSINESS-V2-11`
**Status:** `SCOPED_NOT_IMPLEMENTED`
**Branch:** `refactor/business-store-sales-convergence-v2`
**Draft PR:** pending
**Parent branch:** `feat/business-player-store-fx-final-v2`
**Parent 10A.4D implementation:** `e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b`
**Parent 10A.4D checkpoint/controller:** `f92a61a61bdf336d608936577d8e5e48de11ae94`
**Merge or deployment authorized:** No

## Decision

Phase 11 removes simulated Business-cycle sales from the active economy. After its cutover, a committed `store_offer_purchase_receipts` row is the only source for a new physical-goods sale, revenue, cost of goods sold, gross margin, inventory consumption, or gross-receipts tax basis. No NPC consumer, fake Player, consumer wallet, second Store settlement path, or browser-authored sale outcome is introduced.

Historical `business_sales`, `business_cycle_settlement_receipts`, and cached `business_entities` aggregates remain compatibility evidence. They are not rewritten or treated as current authority. New writes to the legacy sale and cycle-receipt tables are prohibited, the exact legacy settlement RPC returns a stable retirement error without mutation, and the Admin settlement route returns `410 business_cycle_settlement_retired` without parsing caller-authored economic outcomes.

## Guarded operating-period authority

Add a versioned server-owned operating/payroll-period policy whose first version has a seven-day duration. Every opened period snapshots its policy identity, duration, tax rate, currency-precision rules, start, end, and `next_due_at`. Policy changes apply only when a later unopened period is created and never reinterpret an open or closed period.

Legacy payroll clocks retain their current period number and start boundary and receive a seven-day due boundary. Missing eligible Business clocks are backfilled onto the same seven-day cadence. Backfill creates no sale, tax, payroll, balance, Inventory, or cached-total outcome and does not reinterpret pre-cutover Store receipts as post-cutover revenue.

Only database time may establish due work. A bounded worker claim uses exact-once period identity, `FOR UPDATE SKIP LOCKED`, expiring leases, replay/conflict guards, and an anchored successor boundary. Calls before `next_due_at` fail closed. Concurrent callers cannot advance one Business period twice or skip a boundary.

## Payroll, Store source, tax, and liability order

One lease-bound database close command performs the financial transition atomically:

1. validate the active lease and due period;
2. settle due payroll through canonical Banking, respecting active holds;
3. claim every eligible, post-cutover, previously unassigned Store purchase receipt for the Business and period;
4. derive immutable gross revenue, COGS, margin, and tax source evidence from those receipts only;
5. assess versioned gross-receipts tax;
6. pay as much tax as canonical Business Checking availability permits after payroll;
7. retain the unpaid amount as an immutable liability instead of rolling back;
8. close the period exactly once and open its anchored successor under the policy effective for that unopened period.

Payroll and tax postings use the canonical balanced Banking transaction composer and its game monetary advisory/account/hold lock order. New monetary evidence uses canonical currency precision and `numeric(38,18)` storage; Phase 11 does not add a wallet, balance projection, compatibility offset, direct ledger write, or hard-coded two-decimal economic rule.

## Forward migration boundary

Generate four forward migrations from this exact live predecessor with `supabase migration new`; do not preassign versions or edit predecessor migrations:

1. operating-period policy, clock, due boundary, and lease authority;
2. Store-receipt-derived assessment, payment, liability, and close authority;
3. legacy sale/cycle retirement and immutable-history guards;
4. convergence assertions and purge-registry coverage.

Every new game-scoped table must explicitly enable and force RLS, revoke `public`, `anon`, and `authenticated`, grant only required service reads, use command-only mutation functions, and register with the whole-game purge authority. Security-definer functions use a fixed `search_path`, explicit execute revokes, server-derived scope, bounded inputs, and stable replay/conflict errors.

## Internal worker boundary

Add `business-operations-worker` behind the existing internal-runner publishable-key, timestamped-HMAC, nonce-claim, and raw-secret-denial boundary. Its public request is fixed and contains no game, Business, clock, rate, tax, demand, quantity, price, inflation, exchange, interest, difficulty, or outcome input. It returns bounded aggregate counts without UUIDs, Business keys, lease tokens, request hashes, or private evidence.

The worker claims due periods, invokes one atomic close command per claim, and releases failed leases for bounded retry. It accepts no browser cookies, bearer sessions, Origin, CSRF headers, or browser CORS path. No scheduler/cron configuration or secret provisioning/change is part of this tranche.

## Read and UI convergence

Stop presenting `business_entities.revenue_total`, `expense_total`, `profit_total`, `valuation`, `demand_index`, or browser-authored product demand as current Player or Admin financial authority. Phase 11 may expose only bounded Store-receipt/period evidence required to remove simulated-cycle copy; the complete keyed Player workspace belongs to Phase 12 and full Admin supervision belongs to Phase 13.

The accepted Player Terminal and Admin v606 visual systems remain unchanged. No optimistic balance, inventory, payroll, sale, tax, or period result is synthesized in a browser.

## Required permanent evidence

Add durable `business-store-sales-convergence-v2` source, database, concurrency, worker, and focused browser gates. Exact-head acceptance must prove:

- zero-to-head replay twice and rebuilt-schema advisors;
- early close denial, seven-day policy pinning, due-only bounded claims, lease expiry/recovery, exact replay, and conflict;
- payroll-before-tax, active-hold availability, full/partial/zero tax payment, and unpaid liability without period rollback;
- committed Store receipts are the only new sale/revenue/COGS/tax source and are assigned exactly once across close/purchase races;
- no new legacy sale/cycle row, cached aggregate mutation, simulated demand, or direct legacy Inventory consumption occurs;
- legacy Admin settlement returns the stable retirement response and issues no economic RPC;
- internal-runner HMAC/nonce/path/body binding, replay denial, browser-credential denial, privacy, bounded batches, and recovery;
- canonical forward/reverse monetary lock ordering and two-game isolation;
- retained Store, Inventory, Banking, C0-C4/D, Marketplace, Stocks, workforce, manufacturing, Backend/all Edge, Player, Admin, security, architecture, and repository gates remain green.

## Safety and next boundary

This branch remains draft-only, unmerged, and undeployed. No scheduler/cron, secret, staging/production SQL, staging/production deployment, or live-data mutation is authorized. Disposable local/CI database mutation is permitted only for replay and acceptance evidence.

`BETA-LIVE-MIGRATION-PARITY-001` remains a release/runtime-evidence blocker, not a repository-development blocker. Phase 12 may open only after one exact Phase 11 implementation SHA is green and receives a separate clean documentation handoff and checkpoint/controller head.
