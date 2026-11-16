# Business Store Sales Convergence Implementation Handoff v2

**Roadmap item:** `BUSINESS-V2-11`
**Status:** `IMPLEMENTED_NOT_MERGED`
**Branch:** `refactor/business-store-sales-convergence-v2`
**Draft PR:** #680
**Exact implementation and verification source:** `3cbca309e1e3c55e9b933803d304d2c5cc96f071`
**Parent 10A.4D controller:** `f92a61a61bdf336d608936577d8e5e48de11ae94`
**Parent 10A.4D implementation:** `e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b`
**Merge or deployment authorized:** No

## Certified result

Phase 11 converges every new physical-goods Business sale onto committed Store offer settlement and retires the competing simulated-cycle sales mutation authority while preserving historical evidence immutably.

- `settle_business_cycle_v1` is retired as a stable non-mutating compatibility failure, and the Admin settlement route fails closed before caller-authored economic outcomes can reach the database.
- Historical `business_sales` and `business_cycle_settlement_receipts` remain compatibility evidence; new revenue, COGS, gross margin, inventory consumption, and gross-receipts tax basis derive from committed Store purchase receipts.
- Business operating/payroll periods use a server-owned seven-day policy, snapshotted period policy, persisted `next_due_at`, bounded expiring leases, due-only claims, exact-once close identity, and replay/conflict guards.
- Period close composes payroll before Store-derived tax. Canonical Business Checking availability remains hold-aware, and unpaid tax closes as a retained liability rather than rolling back the completed operating period.
- An internal-runner-only Business operations worker claims due work and closes periods through the single database authority. It adds no scheduler, cron, secret, deployment, or browser-authored work scope.
- Player/Admin presentation no longer treats cached cycle demand/revenue/value or caller-authored settlement inputs as current economic authority. Accepted Player Terminal and Admin shells remain intact; Phase 12 workspace and Phase 13 supervision surfaces are not pulled forward.
- The retained Business formation compatibility path now uses canonical Player Checking for capitalization after the Checking cutover; persisted `cash` balance lookup is explicitly prevented by a forward-only installed-function assertion.

The Phase 11 exit invariant is therefore satisfied: there is one authoritative new sales-inventory path and one authoritative new Business revenue settlement path, both rooted in Store settlement.

## Durable implementation surface

### Forward migrations

- `backend/supabase/migrations/20260831232642_business_operating_period_clock_lease_v1.sql`
- `backend/supabase/migrations/20260831232656_business_store_period_tax_close_v1.sql`
- `backend/supabase/migrations/20260831232707_business_legacy_sales_retirement_v1.sql`
- `backend/supabase/migrations/20260831232719_business_store_sales_convergence_assertions_v1.sql`
- `backend/supabase/migrations/20260901050500_fix_business_formation_checking_wallet_v1.sql`

The first four migrations implement the scoped Phase 11 authority. Exact-head retained regression then exposed that the retirement migration had re-authored `create_or_acquire_player_business_v1` with a persisted `account_type = 'cash'` balance lookup after the Banking Checking cutover. The fifth migration is forward-only: it restores canonical Player Checking for the formation balance check and capitalization debit and asserts that the retired cash lookup is absent. No historical migration was edited or renamed.

### Runtime and domain implementation

- `backend/src/domains/business/**` contains the Business operations worker service, Supabase repositories, Player Business request validation/dispatch changes, stable error mapping, Store-derived demand-authority tests, and exact internal-runner HTTP boundary.
- `backend/supabase/functions/business-operations-worker/index.ts` is the trusted worker root and is registered in the existing Edge manifest/config without adding scheduler configuration.
- `backend/supabase/functions/admin-api/**` retires the Admin outcome-authoring settlement route while preserving bounded Banking/loan supervision compatibility.
- `backend/supabase/functions/game-data-purger/**` retains whole-game purge compatibility for the new game-scoped Phase 11 evidence.
- `player-terminal/**` removes stale cycle-authority presentation while preserving accepted Business banking/procurement/Store behavior.
- `admin/v2/src/routes/business/**` removes the retired settlement mutation surface without introducing Phase 13 mutations.
- Architecture and auth-boundary inventories were updated only for the new worker/runtime edges.

### Permanent evidence

The durable workflow is `.github/workflows/business-store-sales-convergence-v2.yml` with four exact-head jobs:

- Source / authority / contracts — job `99746288287`.
- Worker + internal-runner acceptance — job `99746288308`.
- Player / Admin acceptance — job `99746288314`.
- Database / concurrency / browser / release-regression acceptance — job `99746288321`.

## Exact-source certification evidence

Exact implementation `3cbca309e1e3c55e9b933803d304d2c5cc96f071` passed the permanent Phase 11 workflow run `33472963042` in all four jobs.

The database/release lane passed zero-to-head migration replay twice, Phase 11 serial database acceptance, claim/purchase-close/lock-order concurrency, desktop/mobile Business browser acceptance, and the retained Banking/C0/C4/D/Store database regression block. The retained block completed successfully after the forward Checking-formation repair; no implementation bypass or test weakening was required.

All 38 pull-request-triggered workflow runs returned for the exact SHA completed successfully. The exact-head ledger is:

- Repository Quality `33472963082`; Backend Typecheck `33472962837`; Database Replay `33472963047`; Beta Security Contract `33472962793`; Supply Chain Security `33472962977`; Required Game Market Timezone `33472963041`; Staging Readiness Preflight `33472962902`.
- Admin API Check `33472963073`; Admin V2 Loans `33472962786`; Admin Bundle Contract Audit `33472963026`; Admin Game Lifecycle Controls `33472962811`; Admin Shell Smoke `33472963018`.
- Player Terminal Verify `33472962858`; Environment Neutral Browser `33472963089`; Runtime Interaction Wiring `33472962927`; Progression Runtime `33472963008`; World Runtime `33472963010`; Exchange Calendar Runtime `33472962781`.
- Business Economy V2 `33472962914`; Business Banking Runtime `33472963055`; Business Workforce Hiring V2 `33472963061`; Business Workforce Payroll V2 `33472962909`; Business Workforce Production Payroll V2 `33472963056`; Business Timed Manufacturing V2 `33472963039`.
- Business Store Seller Offers V2 `33472963032`; Business Store Listing Inventory V2 `33472962806`; Business Store Withdrawal Safety V2 `33472962807`; Business Store Atomic Settlement V2 `33472962969`; Business Player Store Cutover V2 `33472963072`.
- `banking-fx-clearing-v1` `33472962958`; `multicurrency-store-funding-v1` `33472963064`; `multicurrency-marketplace-funding-v1` `33472962783`; `multicurrency-stock-funding-v1` `33472963063`; `business-multicurrency-treasury-v1` `33472963062`; `business-player-store-fx-final-v2` `33472963051`; `business-store-sales-convergence-v2` `33472963042`.
- Marketplace Preconvergence `33472963015`; License Issuance Queue Staging Release `33472962959`.

Superseded candidates are not certification identities. The retained economic-asset fixture was repaired to fund through canonical Checking with a balance derived from the actual Store purchase cost plus a bounded buffer. Exact-head replay then exposed the formation RPC's stale persisted-cash lookup; `20260901050500_fix_business_formation_checking_wallet_v1.sql` repaired the production authority forward-only. Neither repair creates a parallel balance, Store, Inventory, Banking, payroll, or tax authority.

## Source-of-truth rule

`3cbca309e1e3c55e9b933803d304d2c5cc96f071` is the immutable Phase 11 implementation and verification identity. This handoff commit and the later checkpoint/controller commit are documentation identities only and must never replace the tested source.

## Safety, blocker, and exclusions

PR #680 remains draft, open, unmerged, and undeployed. Phase 11 did not merge a PR, deploy to staging or production, change scheduler/cron configuration, mutate secrets, execute staging/production SQL, or mutate live data. Database/browser evidence used disposable local/CI services only.

`BETA-LIVE-MIGRATION-PARITY-001` remains a release/runtime-evidence blocker. It prevents `VERIFIED_COMPLETE` until the normal merge/runtime-evidence boundary is satisfied, but it does not invalidate repository implementation or block the next authorized Business V2 tranche.

Phase 11 does not implement the complete Player Business workspace, Admin Business supervision, stabilized financial reporting/equity, IPO issuance, or Financial Market integration.

## Next checkpoint

`BUSINESS-V2-12` — Player Business workspace UX convergence — is next on `feat/player-business-workspace-v2`, created only from the clean Phase 11 documentation/checkpoint controller head.

Phase 12 must make the complete Business V2 operating loop usable through the intended Player workspace: Overview, Products / Recipes, Stockroom, Procurement, Production, Workforce, Equipment, Sales, Finance, Ownership / Governance, and Activity. It must preserve canonical domain authority, eliminate remaining legacy/free-form simulation controls, expose authoritative readiness/treasury/sales/receipt state, and pass responsive, accessibility, and connected-browser acceptance without merging or deploying.