# Multi-Currency Funding Core Implementation Handoff v1

## Canonical status

- Roadmap item: `BUSINESS-V2-10A4C0`.
- Owner branch: `feat/multicurrency-funding-core-v1`.
- Stacked draft PR: #673, base `feat/banking-fx-clearing-v1` / draft PR #672.
- Parent B2 exact implementation and verification source: `ce931f8320861117e64eba4403b84d6e7fe8da25`.
- Parent B2 clean documentation handoff/base: `029ea568adc722f0b7c1cd57a02c49f88ceaf716`.
- C0 controlling scope commit: `e0c7edd2cbdac627aef0cda2ce93253c92ee3c50`.
- Immutable C0 PR-authority handoff: `7ebc5d951a97988535054ac3de4c54d473e695c1`.
- **Exact C0 implementation and verification source:** `fd1511d716c1efd291cf6f45415a32a8d7550db4`.
- **Permanent C0 certification run:** `33053355142`.
- Canonical status: `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE`.
- This and any later documentation-only handoff is later than the tested implementation source and must never replace `fd1511d716c1efd291cf6f45415a32a8d7550db4` as the C0 certification identity.
- PR #673 remains open, draft, mergeable, unmerged, and undeployed. No scheduler installation, secret mutation, staging/production SQL, or live database mutation is claimed.

## Certification defects found and repaired

C0 runtime behavior was not weakened to obtain a green result. The reopened failures were confined to disposable acceptance fixtures:

1. The serial database harness inserted the canonical ten-country macro snapshot cohort with `clock_timestamp()` in the `INSERT ... SELECT`. PostgreSQL evaluates that volatile function per row, so the ten rows did not share one exact `effective_at`. B1 correctly blocked bootstrap with `FX_MACRO_SNAPSHOT_SET_INCOMPLETE` and `snapshotCount: 0`. The harness now uses statement-stable timestamps.
2. The independent concurrency harness rebuilt the database and repeated the same volatile timestamp pattern. Its first funding quote therefore failed closed with `FX_FIXING_NOT_FOUND`. That harness now uses the same statement-stable cohort rule.

Both corrections are acceptance-harness changes only. B1 remains the sole fixing authority, B2 remains the sole Banking/clearing authority, and C0 quote/composer production semantics were unchanged. Temporary diagnostic and repair workflows were deleted and have zero net presence in the certified diff.

## Implemented authority

C0 establishes one shared purchase-funding boundary for a trusted bill denominated in one target currency:

- one immutable, non-reserving `pfq_...` quote bound to game, Player, funding context, target currency, exact target amount, accepted B1 fixing, policy version, expiry, idempotency evidence, and one to three ordered source legs;
- one to three unique Player-owned canonical active Checking accounts only;
- exact positive target-currency contributions whose sum must equal the trusted bill exactly;
- same-currency legs at rate `1`, spread `0`, no fee, and no FX facility use;
- foreign-currency retail checkout legs using the accepted B1 fixing, a customer-adverse 1.00% spread, no separate checkout fee, and source-minor-unit ceiling so the recipient contribution remains exact;
- quote expiry at the earlier of 120 seconds or the next accepted fixing boundary;
- current posted, held, and available balance snapshots at quote time without reserving funds;
- settlement-time revalidation of ownership, account status, current available balance, fixing/policy evidence, quote expiry, target account, and trusted domain context;
- one private atomic funding composer that participates in the owning domain transaction and uses `private.post_bank_transaction_v1(...)` as the sole balanced monetary posting primitive;
- real B2 source clearing, target clearing/reserve, facility-cap, draw, and repayment semantics for foreign legs;
- one immutable `pfr_...` receipt linked to the quote and one balanced Banking transaction;
- matching replay before mutable reinterpretation and fail-closed conflicting reuse;
- rollback of all source debits, clearing/reserve movement, facility effects, recipient credit, Banking evidence, and funding receipt when the outer owning-domain transaction fails.

C0 creates no wallet, no reusable foreign balance, no Savings purchase path, no alternate exchange-rate engine, and no compatibility-offset funding line. It does not invoke the standard or instant Player bank-FX order surface to simulate checkout FX.

## Durable implementation surface

### Forward migrations

- `backend/supabase/migrations/20260827090000_multicurrency_funding_quote_v1.sql`
- `backend/supabase/migrations/20260827090500_multicurrency_funding_quote_stage_isolation_v1.sql`
- `backend/supabase/migrations/20260827091000_multicurrency_funding_composer_v1.sql`
- `backend/supabase/migrations/20260827092000_multicurrency_funding_assertions_v1.sql`

### Canonical evidence

- `public.purchase_funding_quotes`
- `public.purchase_funding_quote_lines`
- `public.purchase_funding_receipts`

Quote, line, and receipt evidence is immutable. RLS is enabled and forced. Browser roles receive no direct table authority, and direct mutation is denied. Public result projections expose opaque `pfq_...`, `pfr_...`, `bac_...`, `btx_...`, and accepted fixing/policy evidence rather than internal UUIDs.

### Commands and private composition

- `public.create_purchase_funding_quote_v1(...)` is the narrow service-only quote wrapper.
- `private.create_purchase_funding_quote_core_v1(...)` owns command-local staging and is not executable by browser roles or `service_role`.
- `private.compose_purchase_funding_v1(...)` is the owning-domain-only atomic composer and is not executable by browser roles or `service_role`.
- `private.purchase_funding_quote_public_json_v1(...)` and `private.purchase_funding_receipt_public_json_v1(...)` produce bounded public evidence.
- `private.purchase_funding_ceil_minor_v1(...)` performs the single source-minor-unit ceiling required by target-credit pricing.

### Permanent verification surface

- `.github/workflows/multicurrency-funding-core-v1.yml`
- stack-aware `.github/workflows/banking-fx-clearing-v1.yml`
- `scripts/multicurrency-funding-core-contract.mjs`
- `scripts/multicurrency-funding-core-simulation.mjs`
- `scripts/multicurrency-funding-database.mjs`
- `scripts/multicurrency-funding-concurrency.mjs`
- immutable PR authority `docs/operations/contracts/player-cross-cutting/pr-673.json`
- controlling scope `docs/roadmaps/multicurrency-funding-core-scope-v1.md`

## Exact-head verification on `fd1511d716c1efd291cf6f45415a32a8d7550db4`

### Permanent C0 certification gate

**`multicurrency-funding-core-v1` — PASS** (`33053355142`) with both exact-SHA jobs successful:

- `Verify multi-currency funding source and scope` — success (`98454099844`): PR-bound authority, changed-path boundary, structural contract, deterministic pricing simulation, retained Banking/FX tests, migration validation, local Edge runtime contract, and `git diff --check`.
- `Verify multi-currency funding database and races` — success (`98454099680`): disposable PostgreSQL startup, zero-to-head replay twice, retained B2 database acceptance, full C0 serial acceptance, independent rebuild, observed concurrency, rebuilt-schema lint, and clean teardown.

The serial database harness proved command-local quote-stage isolation, exact one-to-three-account composition, mixed same/foreign funding, exact target credit, per-currency zero sum, immutable quote/receipt evidence, replay with zero additional mutation, full outer rollback, no compatibility-offset line, and two-game isolation.

The observed concurrency harness proved:

- simultaneous matching quote idempotency resolves to one applied quote and one replay;
- simultaneous matching settlement resolves to one applied receipt and one replay;
- two settlements racing the same source account cannot overspend available balance;
- two foreign settlements racing the same target facility cannot exceed facility capacity;
- game-one held settlement does not block independent game-two funding;
- final funding evidence contains no compatibility-offset line.

### Retained B2 certification

**`banking-fx-clearing-v1` — PASS** (`33053355283`) with all three jobs successful:

- source certification `98454108723`;
- rebuilt-database acceptance and lint `98454108557`;
- full Chromium acceptance `98454108835`.

### Retained Store and Player convergence

**`Business Player Store Cutover V2` — PASS** (`33053355082`) with all six jobs successful:

- complete database replay twice and lint `98454057203`;
- Store/public projection/capability/rate-limit/Edge-root verification `98454057394`;
- connected authenticated Buyer/seller journey in two games `98454057403`;
- retained Phase 7A through 10A.3 authority verification `98454057435`;
- standalone Player Terminal, accessibility/responsive acceptance, and full Chromium `98454057465`;
- serial settlement, real-lock ordering races, and two-game isolation `98454057498`.

### Complete exact-head workflow inventory

All 11 pull-request-triggered workflows returned for the certified source completed successfully:

- `multicurrency-funding-core-v1` — `33053355142`.
- `banking-fx-clearing-v1` — `33053355283`.
- `Business Player Store Cutover V2` — `33053355082`.
- `Database Replay` — `33053355168`.
- `Backend Typecheck` — `33053355236`.
- `Supply Chain Security` — `33053355230`.
- `Repository Quality` — `33053355345`.
- `Exchange Calendar Runtime` — `33053355158`.
- `Required Game Market Timezone` — `33053355165`.
- `Staging Readiness Preflight` — `33053355383`.
- `Admin API Check` — `33053355395`.

The source produced 23 terminal check runs. No failure, cancellation, timeout, action-required, pending, or in-progress check remained at certification. Conditional failure diagnostics and release/deployment actions that were not applicable remained skipped rather than executed.

## Exit result

- Immutable exact-bill funding quotes: **met**.
- Maximum three unique Player Checking accounts: **met**.
- Exact funded-total equality with no implicit remainder: **met**.
- Same-currency and 1.00% retail checkout FX pricing: **met**.
- Source-minor-unit ceiling with exact target credit: **met**.
- B1 fixing and B2 clearing/facility reuse without competing authorities: **met**.
- Current balance/hold/facility revalidation: **met**.
- Balanced multi-currency Banking posting and immutable receipt: **met**.
- Replay, conflict, rollback, overspend/facility races, and two-game isolation: **met**.
- Public-key privacy and private composer boundary: **met**.
- Store, Marketplace, Stocks, and Business-specific settlement integration: **not included in C0**.
- Merge, deployment, scheduler, secret, staging/production, and live-environment completion: **not claimed**.

## Next authorized roadmap item

`BUSINESS-V2-10A4C1` may begin on a new stacked branch `feat/multicurrency-store-funding-v1` from the clean C0 documentation handoff.

C1 is limited to making seeded/NPC and Business Store offers consume the certified shared C0 funding authority while preserving Store-owned quote/order/receipt identity and offer-first lock ordering. It must receive its own controlling scope and immutable PR-bound authority before runtime implementation.

Marketplace remains C2, Stocks remains C3, Business foreign-Checking treasury/procurement remains C4, and final Store/FX convergence remains 10A.4D. No merge, deployment, secret change, scheduler change, staging/production SQL, or live database mutation is authorized by this handoff.
