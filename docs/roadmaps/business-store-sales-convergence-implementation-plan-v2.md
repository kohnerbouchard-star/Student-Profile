# Business Store Sales Convergence Implementation Plan v2

**Roadmap item:** `BUSINESS-V2-11`
**Status:** `SCOPED_NOT_IMPLEMENTED`
**Branch:** `refactor/business-store-sales-convergence-v2`
**Parent 10A.4D controller:** `f92a61a61bdf336d608936577d8e5e48de11ae94`

## 11A — Authority and legacy retirement

1. Open one bounded draft PR against `feat/business-player-store-fx-final-v2`.
2. Add a PR-number-bound exact-path authority manifest denying deployment, production mutation, and secret values.
3. Redefine the exact `settle_business_cycle_v1` signature to return a stable retirement failure without mutation.
4. Make historical `business_sales` and `business_cycle_settlement_receipts` immutable except for whole-game purge.
5. Retire Admin `POST /businesses/{businessKey}/settle` as HTTP 410 before caller outcome parsing or RPC dispatch.
6. Remove cached Business aggregates and caller-authored demand from current Player/Admin authority.

## 11B — Seven-day guarded period authority

1. Generate a forward migration for a versioned seven-day operating-period policy, snapshotted open periods, `next_due_at`, claims, leases, attempts, and exact-once close identity.
2. Backfill existing clocks without changing their current period/start identity and create missing eligible clocks on the seven-day cadence without economic mutation.
3. Use database time, due-only bounded `FOR UPDATE SKIP LOCKED` claims, expiring leases, anchored successor periods, and replay/conflict guards.
4. Select changed policy only when opening a later period; never reinterpret an already-open period.

## 11C — Store-derived close, payroll, tax, and liability

1. Generate a forward migration for immutable Store source assignments, assessment, payment, liability, and period-close evidence.
2. Compose payroll, Store receipt aggregation, tax assessment/payment, liability retention, close, and successor opening inside one lease-bound database command.
3. Post payroll and tax through canonical balanced Banking after its game monetary advisory and sorted account/hold locks; never pre-lock a balance.
4. Derive revenue, COGS, margin, and gross-receipts tax only from committed, post-cutover, unassigned Store purchase receipts.
5. Settle payroll before tax, subtract active holds from availability, and close with any unpaid tax retained as a liability.

## 11D — Internal operations worker

1. Add a narrow Business operations worker service, Supabase repository, HTTP handler, Edge root, and focused tests.
2. Reuse the existing internal-runner publishable-key, HMAC, nonce-claim, exact-path/body-digest, and raw-secret-denial authority.
3. Accept only a fixed empty work request; derive time and all work scope in the database.
4. Claim bounded due periods, close each through the single atomic RPC, release transient failures for retry, and return privacy-safe aggregate counts.
5. Update Edge/auth manifests and architecture inventory without adding scheduler, deployment, or secret configuration.

## 11E — Read and presentation convergence

1. Remove Player presentation of cached cycle revenue/value/demand as current authority.
2. Keep historical evidence explicitly historical and expose only the bounded Store/period state needed by this tranche.
3. Preserve the accepted Player Terminal and Admin v606 shells and all authentication, capability, game-scope, CSRF, rate-limit, audit, and `no-store` behavior.
4. Add no Phase 12 keyed workspace or Phase 13 supervision surface early.

## 11F — Permanent evidence and handoff

1. Add `.github/workflows/business-store-sales-convergence-v2.yml` with exact-head source, database, concurrency, worker, and focused browser jobs.
2. Run zero-to-head replay twice, advisors, period/receipt/hold/replay races, reverse lock order, two-game isolation, internal-runner security, and retained gates.
3. Repair genuine failures without weakening economic authority, privacy, lock ordering, RLS, replay, or acceptance criteria.
4. Commit and push one exact implementation SHA until the permanent and inherited matrix is green.
5. Record `IMPLEMENTED_NOT_MERGED`, files, migrations, RPCs, routes, workflow runs, runtime evidence, blockers, and next exact item in the roadmap and execution log.
6. Add a clean implementation handoff commit, then a separate checkpoint/controller commit that preserves the exact implementation identity.
7. Verify the terminal documentation head and draft PR before creating `feat/player-business-workspace-v2`.

## Stop conditions

Stop and reopen scope if implementation requires another Store, Banking, balance, Inventory, sales receipt, payroll, or tax authority; browser-authored economic inputs; production RLS/CORS weakening; scheduler or secret changes; deployment; staging/production SQL; live data; or Phase 12–14 behavior.
