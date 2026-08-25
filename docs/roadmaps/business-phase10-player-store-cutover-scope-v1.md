# Business V2 Phase 10A.4 — Authenticated Player Store Cutover Scope v1

**Roadmap item:** `BUSINESS-V2-10A4A` under parent `BUSINESS-V2-10A4`
**Status:** `IMPLEMENTED_NOT_MERGED` — implementation candidate frozen; certification blocked by canonical FX and shared multi-currency funding
**Branch:** `feat/business-player-store-cutover-v2`
**Parent branch:** `feat/business-store-atomic-settlement-v2`
**Parent draft PR:** #667
**Stacked draft PR:** #670
**Scope commit:** `75d2a3c0b594017bc38f78e2618926f78ca2754e`
**Certified parent implementation source:** `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2`
**Clean parent handoff:** `6f9231b0030a7851bba5abe8519afa790071c32c`
**Frozen implementation candidate:** `88944e18520913ca9779c2706bd005f644c60050`
**Certification state:** not exact-head certified; canonical FX/funding dependency and three secondary failures remain open

## Decision

Checkpoint 10A.4 connects authenticated Player Store presentation, offer selection, quote intent, settlement, receipt access, and committed-state refresh to the exact Business seller-offer authorities certified in Phases 7A through 10A.3.

The governing invariant is:

> The offer displayed and selected by the Buyer, the immutable quote, the locked settlement, the credited Business, the transferred canonical Inventory, the Buyer receipt, and the seller-visible accounting/activity projection all refer to the same public seller offer and one committed `spr_...` receipt.

The retained seeded Store compatibility channel remains functional and keeps its historical quote, purchase, receipt, pricing, and Inventory meaning. Phase 10A.4 must discriminate seeded and Business-offer intent explicitly; it must not infer authority from key shape, silently reinterpret a retained quote, or dual-write two purchase paths.

The runtime/UI candidate at `88944e18520913ca9779c2706bd005f644c60050` implements this bounded Store cutover contract, but it is frozen rather than certified. Its same-currency settlement assumption exposed a prerequisite architecture gap: canonical FX, Banking-owned clearing and holds, and one shared multi-currency funding authority must precede permanent Store certification. This amendment records that dependency without expanding PR #670 into an FX or Banking owner.

## Included authority

Checkpoint 10A.4 may add only:

1. Authenticated, same-origin Player BFF routes for Business-offer quote, purchase, and authorized public receipt reads.
2. A bounded Player Store catalog projection that aggregates seeded and Business seller offers under one canonical product card while retaining explicit offer identities.
3. Public seller-kind and bounded Business/seller identity required to make a purchase decision.
4. Route-level or command-level discrimination that cannot confuse seeded and Business-offer purchases.
5. Store-domain application/repository adapters that reuse the certified Phase 7A aggregation, 10A.2 quote, and 10A.3 settlement authorities.
6. Buyer-authorized receipt projection and seller-authorized Business Sales/Finance/Activity projection derived from committed immutable evidence.
7. Player Terminal offer selection, quote review, settlement confirmation, receipt presentation, error recovery, and canonical invalidation/refetch behavior.
8. Permanent structural, typed, connected-database, accessibility, responsive, two-browser, rollback/replay, and two-game verification.
9. One permanent read-only exact-head workflow for this checkpoint.

This checkpoint does not create a new money, Inventory, quote, receipt, accounting, seller, product, or settlement authority.

## Retained and Business-offer route separation

The retained seeded collection paths stay unchanged:

- `GET /players/me/store/items`;
- `POST /players/me/store/quotes`;
- `GET|POST /players/me/store/purchases`.

The default bounded Business-offer path design is:

- `POST /players/me/store/offer-quotes`;
- `POST /players/me/store/offer-purchases`;
- `GET /players/me/store/receipts/:receiptKey`.

Implementation may choose an equally explicit discriminator only if route, contract, capability, rate-limit, browser, replay, and compatibility tests prove the two authorities cannot be confused. Existing seeded routes may not accept Business offer keys, and Business-offer routes may not reinterpret seeded quotes.

## Public catalog and offer contract

`GET /players/me/store/items` must preserve one canonical product card per Store item and provide a bounded, deterministic offer collection.

Each card must expose only browser-safe fields needed for display and selection, including:

- public Store item/canonical product identity;
- name, description, category, media identity, and authored sort order;
- aggregate available quantity, seller count, and deterministic best offer;
- retained seeded compatibility price/stock fields while that channel exists;
- explicit offers ordered by authoritative price, seller kind, and stable public key.

Each offer may expose only:

- public offer key;
- seller kind such as `seeded` or `business`;
- bounded public seller-party key and display label;
- bounded public Business key and display name for a Business seller;
- exact unit price and currency;
- available unreserved quantity snapshot;
- optimistic offer version;
- public lifecycle/purchasability state required for truthful UI.

It must not expose game UUIDs, Player UUIDs, Business UUIDs, economic-party UUIDs, Store item UUIDs, canonical item UUIDs, account/holding UUIDs, ledger IDs, Inventory event IDs, trusted hashes, private ownership, or unrestricted Business data.

## Trusted command boundary

For a Business-offer quote, browser intent is limited to:

- public `offerKey`;
- positive integer `quantity`;
- exact displayed `expectedVersion`;
- bounded idempotency intent supplied through the existing Player API convention.

For Business-offer settlement, browser intent is limited to:

- public `offerKey`;
- public `quoteKey`;
- positive integer `quantity`;
- exact quoted `expectedVersion`;
- bounded idempotency intent;
- optional client timestamp for audit context only.

The authenticated service derives and validates:

- game session and Buyer Player from the active HttpOnly Player session;
- exact seller Business/economic party;
- Store catalog and canonical item identity;
- offer-scoped Store-listing custody;
- offer lifecycle/version and current unreserved availability;
- price, currency, quote expiry, and immutable request binding;
- Buyer Checking and Business cash;
- Buyer canonical Inventory account/holding;
- source cost basis and cost currency;
- ledger, Inventory, Business activity, and receipt provenance.

No browser-submitted game, Buyer, seller, Business, owner, custody, item, price, currency, balance, cost, revenue, COGS, margin, account, Inventory, receipt, or completion value is trusted.

## Authentication, authorization, capability, and rate limits

- Routes use the existing same-origin Player BFF and active HttpOnly Player session boundary.
- Mutation requests preserve the repository's publishable-key, device-binding, and CSRF conventions. A browser session token, service key, Staff credential, or trusted game/Player header must not enter browser storage or payloads.
- Scope is resolved server-side before Store repository execution.
- Existing Store quote and purchase capability semantics remain authoritative; any new endpoint keys must map to those capabilities rather than creating a bypass.
- Business-offer quote and purchase routes receive explicit existing-equivalent rate-limit classification before dispatch.
- Receipt reads are Buyer-scoped by trusted session. Seller visibility is limited to an owner-authorized Business projection and must not permit arbitrary receipt enumeration.
- Requests with unexpected query, body, or trusted-scope fields fail before persistence.

## Quote, settlement, receipt, and retry behavior

- A quote is created by the certified `create_business_store_offer_quote_v2` authority and binds the exact selected offer, version, seller, Business, custody, item, quantity, price, currency, and expiry.
- Settlement is performed only by the certified `settle_business_store_offer_v2` authority and returns its public-key-only immutable receipt projection.
- Displayed offer, selected offer, quote, payment, seller credit, transferred Inventory, and receipt must match exactly.
- Matching replay returns the same public receipt and `alreadyCompleted` outcome without a second debit, credit, transfer, revenue/COGS record, quote consumption, or offer-version increment.
- Conflicting idempotency reuse fails closed.
- Buyer receipt reads return only receipts owned by the trusted Buyer in the trusted game.
- Seller Sales/Finance/Activity reads derive quantity, cash credit, revenue, COGS, margin, timestamp, public offer, and public receipt identity from committed canonical evidence. They do not write summary totals a second time.

## Stable browser-safe failure states

The API and Player Terminal must provide stable non-sensitive errors and truthful UI recovery for:

- malformed or unexpected intent;
- invalid/expired Player session;
- Store capability unavailable or rate limited;
- offer missing, paused, retired, `withdrawal_pending`, or otherwise unavailable;
- stale optimistic version;
- quote missing, expired, consumed, mismatched, or otherwise terminal;
- sold-out or newly reserved/insufficient stock;
- insufficient Buyer Checking funds;
- unsupported currency/cost-basis state;
- self-purchase rejection;
- idempotency conflict or committed request still in progress;
- game paused, ended, archived, or unavailable;
- receipt not found or not authorized;
- committed purchase followed by transient refresh failure.

Server errors must not copy database text, internal identifiers, trusted hashes, or private seller/Buyer state to the browser.

## Committed-state convergence

After successful settlement:

- Buyer Store data refreshes authoritative remaining offer availability/version;
- Buyer Banking refreshes canonical Checking once;
- Buyer Inventory refreshes canonical delivered quantity/cost/provenance;
- Buyer purchase history/receipt state refreshes from committed receipt evidence;
- Seller Business Sales/Finance/Activity reflects committed cash, revenue, COGS, margin, quantity, offer, and receipt;
- ordinary convergence requires no manual browser reload.

Use the repository's canonical invalidation registry, bounded refetch, polling, or existing realtime architecture. Buyer-local invalidation alone is insufficient proof of seller convergence. A transient post-commit refresh failure must keep the purchase visibly complete and offer a safe bounded retry; it must never resubmit economic settlement implicitly.

## Player Terminal presentation and accessibility

The accepted Player Terminal visual system and interactive shell remain authoritative.

The Store UI must:

- render one canonical product card with deterministic aggregate availability and seller count;
- identify seeded versus Business sellers truthfully;
- allow keyboard-accessible explicit offer selection before quote creation;
- show selected seller, exact offer price/currency, available quantity, and version in quote review;
- preserve separate loading, empty, unavailable, stale, expired, conflict, insufficient-funds, sold-out, committed, replayed, and refresh-pending states;
- show the immutable public receipt identity and appropriate seller/provenance fields without internal IDs;
- preserve focus return, focus trapping, Escape behavior, visible focus, reduced motion, screen-reader labels/status, and logical heading/order semantics;
- remain usable at the repository's accepted narrow, tablet, desktop, and zoom bounds;
- preserve all unrelated Player routes and controls.

## Required connected acceptance

Permanent connected verification must use disposable local infrastructure only and prove:

1. Two authenticated Player browser contexts represent a Buyer and the authorized Business owner/seller.
2. The Buyer sees the exact Business offer under one canonical product card and selects it explicitly.
3. The Buyer receives an immutable quote for that exact offer/version.
4. The Buyer confirms settlement once.
5. Buyer Checking decreases exactly once by the quoted total.
6. Business cash increases exactly once by the same total.
7. Buyer Inventory receives the exact canonical item/quantity once with preserved source cost/currency/provenance.
8. Store-listing quantity decreases and offer version advances exactly once.
9. Business revenue and COGS/margin/activity appear exactly once and identify the same public receipt.
10. Buyer and seller see the same immutable public receipt identity/provenance where authorized.
11. Matching replay returns that receipt with no second economic mutation.
12. Withdrawal-first rejects before payment.
13. Purchase-first leaves only remaining stock withdrawable.
14. The retained seeded Store quote/purchase/receipt path remains functional.
15. Two simultaneous games expose and mutate only their own offers, Buyers, Businesses, money, Inventory, and receipts.
16. Browser-visible post-refresh state matches the committed database state without ordinary manual reload.

## Required permanent verification

One exact implementation SHA must pass:

- Phase 10A.4 structural route/contract/privacy/capability/rate-limit tests;
- typed public DTO and trusted command adapter tests;
- public catalog aggregation and deterministic offer-order tests;
- seeded/Business route-discrimination and compatibility tests;
- exact selected-offer quote/settlement/receipt binding tests;
- stable failure and committed-refresh state tests;
- receipt Buyer authorization and seller Business projection tests;
- real database-backed success, replay, conflict, stale, expiry, sold-out, funds, withdrawal-ordering, and two-game tests;
- connected two-authenticated-browser acceptance and database-vector reconciliation;
- keyboard, screen-reader, focus, reduced-motion, responsive, zoom, loading, empty, error, and stale-state acceptance;
- retained Phase 7A through 10A.3 permanent contracts, serial/concurrency suites, and exact settlement invariants;
- complete migration validation and database replay from zero twice;
- rebuilt-database lint at warning level or stricter;
- Backend TypeScript and every Edge/Deno entrypoint;
- retained Business formation/Economy/Banking/workforce/payroll/equipment/manufacturing;
- canonical Store and Inventory lifecycle suites;
- Repository Quality, deterministic architecture inventory, Runtime Interaction Wiring, and Supply Chain Security;
- standalone Player Terminal verification and full Chromium suite;
- `git diff --check`.

No connected test may use staging or production credentials, databases, functions, sessions, or student data.

## Persistence and migration boundary

No new persistence is expected by default. Existing certified authorities already provide Store aggregation, immutable offer-aware quotes, atomic settlement, immutable receipts, and Business activity evidence.

If repository audit proves that an authorized read projection cannot be implemented safely from existing indexed evidence, a separately documented forward migration after `20260825110030` may add only a service-role read projection with:

- public-key-only result columns;
- trusted game/Buyer or game/Business authorization inputs;
- explicit least privilege and forced/private backing-table RLS preservation;
- no new economic writes, summary dual-writes, or browser grants;
- query-plan and two-game evidence.

The private receipt helper and receipt table grants may not be widened for browser access.

## Explicit exclusions

Checkpoint 10A.4 does **not authorize**:

- automatic consumer/NPC demand or sales convergence;
- changes to `settle_business_cycle_v1` or other Phase 11 authorities;
- tax, fee, refund, dispute, reversal, or FX-clearing systems;
- broad Player Business workspace redesign beyond bounded seller committed-state visibility;
- Admin Business supervision;
- equity, shares, capitalization, dividends, IPO, or Financial Market publication;
- Store context-propagation refactoring owned by `ARCH-100I` unless separately reconciled;
- merge;
- staging or production deployment;
- secret mutation;
- staging or production database mutation.

The FX-clearing exclusion continues to apply to PR #670. FX, Banking clearing, and shared funding are separately owned prerequisite checkpoints; their insertion does not authorize additional runtime edits on the frozen branch.

## Collision and ownership boundary

- No pre-existing Phase 10A.4 branch or PR owned this capability at scope creation.
- Player Terminal and realtime/CSS files overlap open PR #624 and must avoid overwriting that owner. PR #626 closed without merge at `474370b4e96670c4a3e394ac41779ed87ce26d15`; its overlapping Business acceptance/capability work is donor evidence only, not an active owner.
- Future `ARCH-100I` owns Store context propagation. This checkpoint consumes current authenticated scope derivation and does not absorb that refactor.
- Active ARCH-100F PR #668 owns the global beta roadmap file. Scope Intake reconciliation must preserve that owner's work and may not independently mark an unmerged Business checkpoint `VERIFIED_COMPLETE`.
- The Business stack is intentionally unmerged. This branch starts from the exact Phase 10A.3 clean handoff rather than rebasing or replacing parent authorities.

## 2026-08-26 implementation freeze amendment

### Frozen candidate and current certification failures

- Exact frozen implementation candidate: `88944e18520913ca9779c2706bd005f644c60050` on draft PR #670. It is an implementation identity only and must not be described as an exact-head certified source.
- Canonical status: `IMPLEMENTED_NOT_MERGED`; not `VERIFIED_COMPLETE` and not certified. No merge, deployment, secret mutation, or staging/production database mutation occurred.
- Canonical dependency blocker: Store checkout remains same-currency-only while the repository lacks one ECO-based daily fixing, Banking-owned account identities and holds, a named game-scoped clearing/reserve authority, and a shared maximum-three-account funding planner.
- Connected readiness currently fails because `scripts/local-edge-runtime-isolation.mjs` sends a loopback `Origin` to `bootstrap-api`; the function correctly rejects non-HTTPS/non-allowlisted origins with `403`. Final 10A.4D must probe health without weakening production CORS.
- `player-terminal/tests/store-local-currency.mjs` asserts obsolete THD-conversion copy. Final 10A.4D must replace it with authoritative direct, retail-FX, account-selection, seller-currency, spread, and committed-balance semantics after those authorities exist.
- The Player cross-cutting verifier reads one mutable singleton authority record that is still bound to PR #661. Final 10A.4D must use immutable `pr-<number>.json` records selected from trusted PR context and fail closed for ambiguous local execution.
- These failures are preserved as evidence. None may be hidden by weakening CORS, accepting stale currency semantics, rebinding a prior PR record in place, or removing required checks.

### Required dependency order

1. `BUSINESS-V2-10A4A`: freeze this candidate and correct the durable plan/log/PR record.
2. `BUSINESS-V2-10A4B1` / `BETA-FX-V1-001` on `feat/canonical-fx-authority-v1`: add ECO and the deterministic game-local 08:00 fixing authority, immutable history, Story-shock convergence, and guarded legacy cutover.
3. `BUSINESS-V2-10A4B2` on `feat/banking-fx-clearing-v1`: add canonical Banking account identities, balanced postings, holds, named clearing/reserve parties, capped liquidity, and standard/instant FX.
4. `BUSINESS-V2-10A4C0` through `BUSINESS-V2-10A4C4`: add the shared maximum-three-Checking-account funding planner, then converge Store, Marketplace, Stocks, and Business procurement/treasury on separate dependency-ordered branches.
5. `BUSINESS-V2-10A4D` on `feat/business-player-store-fx-final-v2`: converge the frozen Store candidate with those authorities, repair the three secondary failures, and run the complete final exact-head certification matrix.

PR #670 remains frozen after the 10A.4A documentation handoff. Each prerequisite is a separate bounded draft PR against its immediate predecessor. Phase 11 and later phases remain closed until 10A.4D is exactly certified and handed off.

## Completion rule

Checkpoint 10A.4 is complete at the development boundary only when:

1. one final 10A.4D exact implementation SHA is identified after the B1, B2, and C0–C4 dependency stack;
2. every required exact-head job reaches terminal `success` on that SHA;
3. connected Buyer/seller/two-game browser and committed database evidence match exactly;
4. seeded compatibility remains green;
5. this scope, the Phase 10 index, Business execution plan/log, draft PR, and integration PR #648 record matching exact evidence;
6. temporary repair, writer, controller, certifier, finalizer, and source-snapshot machinery has zero net presence;
7. the PR remains draft, open, unmerged, and without a Business staging/production release;
8. the final 10A.4D clean documentation-only handoff SHA is recorded for Phase 11.

Because the Business stack is unmerged, the checkpoint status must remain `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE` in the global beta ledger.

After the 10A.4D clean handoff, the next exact phase is **Phase 11 — converge automatic demand and physical sales onto the Store seller-offer settlement authority** through separately bounded stacked checkpoints.
