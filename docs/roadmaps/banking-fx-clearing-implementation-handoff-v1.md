# Banking FX Clearing Implementation Handoff v1

## Canonical status

- Roadmap item: `BUSINESS-V2-10A4B2`.
- Owner branch: `feat/banking-fx-clearing-v1`.
- Stacked draft PR: #672, base `feat/canonical-fx-authority-v1` / draft PR #671.
- Parent B1 implementation source: `41bc2d978fe67cd06a8f2133f7310075492ecd99`.
- Parent B1 documentation handoff/base: `5e427e8f5b39e5b77cac0c912873fe505493565d`.
- B2 controlling scope commit: `ce50306400b3173a489e2413f0531cef58c863a6`.
- **Exact B2 implementation and verification source:** `1d26af9df17cb7fa8334a299b4c78d29c0249904`.
- Canonical status: `IMPLEMENTED_NOT_MERGED`.
- This documentation-only handoff is later than the tested implementation source and must never replace `1d26af9df17cb7fa8334a299b4c78d29c0249904` as the B2 certification identity.
- PR #672 remains open, draft, mergeable, unmerged, and undeployed. No scheduler installation, secret mutation, staging/production SQL, or live database mutation is claimed.

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

## Final compatibility corrections included in the certified source

Two late failures were acceptance/compatibility boundary defects rather than reasons to weaken Banking.

1. `backend/supabase/migrations/20260826101000_banking_staff_adjustment_compatibility_v1.sql` preserves the closed compatibility allowlist while admitting the legitimate staff-adjustment provenance used by the Admin Player, Admin Banking, and Admin Attendance routes. Unknown provenance remains denied.
2. `scripts/business-phase10-player-store-browser-acceptance.mjs` was corrected to recognize the B2 journal contract: a Business Store settlement creates four `balanced_v2` ledger lines, consisting of two requested economic lines plus two signed compatibility-offset lines. The economic Buyer debit and Business credit remain exactly one each and the full Banking journal nets to zero.

No production runtime authority was weakened to make those tests pass.

## Exact-head verification on `1d26af9df17cb7fa8334a299b4c78d29c0249904`

Every workflow returned by the exact-head PR matrix completed successfully. Required and high-signal gates include:

- **banking-fx-clearing-v1 — PASS** (`33028780271`).
- **Database Replay — PASS** (`33028780264`): complete zero-to-head replay twice and rebuilt-schema lint.
- **Business Player Store Cutover V2 — PASS** (`33028780165`): retained Store cutover, connected two-browser/two-game journey, real database vectors, replay, convergence, withdrawal ordering, and browser privacy.
- **Business Store Atomic Settlement V2 — PASS** (`33028780200`): serial settlement, rollback, observed races, two-game isolation, retained Store/Business/Inventory runtime, and Chromium.
- **Player Terminal Verify — PASS** (`33028780303`), including exact PR scope authorization, standalone verification, and Chromium.
- **Backend Typecheck — PASS** (`33028780371`).
- **Beta Security Contract — PASS** (`33028780304`).
- **Repository Quality — PASS** (`33028780447`).
- **Supply Chain Security — PASS** (`33028780276`).
- **Business Banking Runtime — PASS** (`33028780342`).
- **Player Local Currency Authority — PASS** (`33028780163`).
- **Environment Neutral Browser — PASS** (`33028780306`).
- **Staging Readiness Preflight — PASS** (`33028780262`).
- **Runtime Interaction Wiring — PASS** (`33028780315`).
- **Business Economy V2 — PASS** (`33028780258`).
- **Business Store Withdrawal Safety V2 — PASS** (`33028780273`).
- **Business Store Listing Inventory V2 — PASS** (`33028780222`).
- **Business Store Seller Offers V2 — PASS** (`33028780320`).
- **Business Timed Manufacturing V2 — PASS** (`33028780329`).
- **Business Workforce Production Payroll V2 — PASS** (`33028780256`).
- **Business Workforce Payroll V2 — PASS** (`33028780246`).
- **Business Workforce Hiring V2 — PASS** (`33028780350`).
- **Marketplace Preconvergence — PASS** (`33028780220`).
- **World Runtime — PASS** (`33028780184`).
- **Required Game Market Timezone — PASS** (`33028780195`).
- **Exchange Calendar Runtime — PASS** (`33028780180`).
- **Admin API Check — PASS** (`33028780275`).
- **Admin Game Lifecycle Controls — PASS** (`33028780318`).

No exact-head workflow in the observed matrix was red, cancelled, or unfinished when this handoff was authorized.

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
- Database replay, backend/all Edge, security, repository, Player, Chromium, connected Store, and two-game evidence: **met**.
- Merge/deployment/live-environment completion: **not claimed**.

## Next authorized roadmap item

`BUSINESS-V2-10A4C0` is now open on a new stacked branch `feat/multicurrency-funding-core-v1` based on this documentation-only B2 handoff.

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
