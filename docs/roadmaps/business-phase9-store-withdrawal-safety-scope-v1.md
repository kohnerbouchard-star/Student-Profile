# Business V2 Phase 9 — Store Withdrawal Safety Scope v1

**Status:** IN PROGRESS — checkpoint 9A scope locked; implementation not certified
**Branch:** `feat/business-store-withdrawal-safety-v2`
**Parent branch:** `feat/business-store-listing-inventory-v2`
**Parent draft PR:** #663
**Certified Phase 8A exact-head source:** `c0fd8650987a332f99b8173395dcf84fc3518c15`
**Clean Phase 8A durable handoff head:** `42e52c38eea7402aefadb4ec3fad0b6743a22588`

## Purpose

Checkpoint 9A adds a deterministic cooling-off boundary before Business-owned Store inventory can leave listing custody. A withdrawal request must make the offer unavailable to the future offer-aware purchase authority immediately, remain pending for at least five minutes, and then return only eligible unsold units from canonical Store-listing custody to canonical Finished Goods.

The governing rule is:

> Requesting withdrawal stops new offer-aware purchases immediately; physical inventory moves only after the minimum cooling-off period, under one locked offer/request state, and never while canonical inventory reservations remain unresolved.

Checkpoint 9A establishes withdrawal request and due-processing authority. It does not create buyer purchasing or settlement authority.

## Existing authority

The certified Phase 7A and Phase 8A stack already defines:

- Store-owned seller-offer identity, lifecycle, optimistic versioning, and canonical aggregation;
- one immutable Business-owned `store_stock` account per Business offer;
- canonical Store-listing availability from `inventory_holdings`;
- exact idempotent `Finished Goods -> Store Listing` transfers;
- canonical cost/currency/provenance preservation;
- retained `business_inventory` Finished Goods projection convergence;
- service-only mutation boundaries and public-key-only contracts.

Checkpoint 9A must extend those authorities. It must not create a second offer table, a shadow listed-quantity field, a Business-specific inventory ledger, or a buyer settlement path.

## Included authority

Checkpoint 9A may implement only the following:

1. Extend the Store seller-offer lifecycle with `withdrawal_pending`.
2. Add current-withdrawal fields sufficient to make the offer state self-describing and fail closed:
   - current withdrawal request identity;
   - `withdrawal_requested_at`;
   - `withdrawal_effective_at`;
   - prior/resume lifecycle status;
   - requested withdrawal mode and quantity where applicable.
3. Add Store-owned durable withdrawal-request authority with:
   - public `swr_...` identity;
   - same-game offer and Business seller identity;
   - `full` or `reduce` mode;
   - positive integer requested quantity for reductions and no quantity for full withdrawal;
   - pending/completed lifecycle;
   - request, effective, retry, and completion timestamps;
   - idempotency key and immutable request hash;
   - returned quantity and canonical Inventory transaction identity after completion;
   - optimistic request version;
   - one pending request per offer.
4. Add a service-only request command accepting only:
   - trusted game scope;
   - public Business key;
   - public offer key;
   - withdrawal mode;
   - optional reduction quantity;
   - expected offer version;
   - idempotency key.
5. Validate the request server-side:
   - active same-game Business and seller party;
   - Business-owned offer and immutable listing account;
   - offer status is `draft`, `active`, or `paused` and no pending withdrawal exists;
   - canonical listing holding exists for the offer item;
   - a reduction quantity is positive and does not exceed current unreserved availability;
   - full withdrawal omits quantity;
   - exact retries replay even after the offer version advances;
   - conflicting idempotency reuse fails closed.
6. On a newly committed request:
   - create one durable request;
   - set the offer to `withdrawal_pending` immediately;
   - preserve the prior status for deterministic completion;
   - set `withdrawal_effective_at` no earlier than server time plus five minutes;
   - increment the offer version exactly once;
   - make the offer disappear immediately from active Phase 7A aggregation.
7. Reject seller-offer price/state/custody mutation and additional stock placement while `withdrawal_pending`.
8. Keep ordinary optimistic price and lifecycle mutation immediate when no withdrawal is pending.
9. Add a service-only bounded due-withdrawal processor using server time and a caller-supplied bounded batch limit.
10. Select due requests deterministically and process them with skip-locked or equivalent bounded concurrency control.
11. Before returning inventory, validate:
   - request remains pending and is the offer's current request;
   - the five-minute minimum has elapsed;
   - offer, seller, account, item, and game remain consistent;
   - canonical listing holding and Finished Goods account remain active;
   - retained Finished Goods projection still equals canonical Finished Goods state;
   - `quantity_reserved = 0` for the listing holding.
12. If canonical listing reservations remain unresolved:
   - move no units;
   - keep the request and offer pending;
   - record a bounded next-attempt time to avoid hot-loop processing.
13. When eligible, calculate the exact return quantity:
   - `full`: all remaining owned Store-listing units;
   - `reduce`: the lesser of requested quantity and remaining owned Store-listing units;
   - never return reserved units.
14. Post one canonical Inventory `transfer` transaction:
   - negative line from the offer's Store-listing account;
   - positive line to the Business Finished Goods account;
   - source Store-listing average cost and currency carried to the destination line;
   - immutable public Business, offer, and withdrawal-request provenance.
15. Synchronize retained Finished Goods `business_inventory` to the canonical post-state inside the same transaction.
16. Complete the durable request exactly once and clear the offer's current-withdrawal fields.
17. Deterministic completion status:
   - full withdrawal completes to `paused`;
   - reduction resumes the prior `draft`, `active`, or `paused` status;
   - if no units remain, an active resume status is normalized to `paused`.
18. Increment the offer version exactly once for a newly completed due request.
19. Return public request, offer, account, and transaction keys only; never expose internal UUIDs.
20. Add typed Store-domain request/result/processor contracts and repository publication.
21. Add deterministic tests for:
   - full and reduction requests;
   - immediate active-aggregation exclusion;
   - five-minute boundary at one microsecond before, exactly at, and after effective time;
   - exact request replay and conflicting reuse;
   - stale offer version and duplicate pending request;
   - wrong Business, seller, item, account, and game;
   - unresolved reservation blocking and bounded retry scheduling;
   - full and partial physical return;
   - returned quantity after intervening inventory depletion;
   - cost-basis and retained projection convergence;
   - exact processor replay and duplicate-worker concurrency;
   - stock and price/state mutation rejection while pending;
   - ordinary price mutation remaining immediate outside pending state;
   - deterministic bounded batch ordering;
   - two simultaneous games remaining isolated.

## Lifecycle invariants

- `withdrawal_pending` is non-purchasable and excluded from active offer aggregation.
- Only Business offers with bound canonical Store-listing custody may enter withdrawal pending.
- One offer can reference at most one pending withdrawal request.
- One pending request belongs to exactly one offer, Business seller party, game, and canonical item.
- Request and effective timestamps are server-derived and immutable.
- `withdrawal_effective_at` must be at least five minutes after `withdrawal_requested_at`.
- A completed request cannot return to pending or execute a second Inventory transfer.
- Retired offers remain terminal and cannot request withdrawal.
- A pending offer cannot be stocked, repriced, activated, paused, or retired through the ordinary mutation command.
- Completion clears current-withdrawal fields but retains the durable request history.

## Inventory and accounting invariants

- Listed quantity remains canonical `inventory_holdings.quantity_owned`; it is never copied to the offer or request as an availability authority.
- Canonical `quantity_reserved` is the unresolved accepted-purchase safety signal. Any positive reservation blocks due withdrawal in checkpoint 9A.
- Returning listing inventory is a custody transfer, not a sale, purchase, refund, revenue, wage, expense, tax, or COGS event.
- The listing holding's average unit cost and cost currency carry into Finished Goods.
- The retained Finished Goods row is synchronized to canonical Finished Goods after the transfer.
- No cash or ledger entry is created.
- One withdrawal request can produce at most one committed canonical Inventory transaction.
- Matching retries cannot move units, update the projection, complete the request, or advance the offer twice.

## Concurrency and lock ordering

Request creation must use one transaction and fixed order:

1. Business and seller identity;
2. offer row;
3. listing account and canonical item holding;
4. pending-request uniqueness/idempotency authority;
5. offer withdrawal state and version.

Due processing must use bounded deterministic candidate selection and fixed per-request order:

1. withdrawal request row;
2. offer row;
3. listing account and holding;
4. Finished Goods account;
5. retained Finished Goods projection;
6. canonical Finished Goods holding;
7. canonical Inventory transaction/posting;
8. retained projection convergence;
9. request completion;
10. offer lifecycle/version completion.

The processor must tolerate duplicate workers without duplicate returns. A future Phase 10 purchase path must lock the same offer before inventory and therefore cannot begin after the offer becomes `withdrawal_pending`; accepted reservations created before that transition remain protected by the reservation block. Purchase-first/withdrawal-first settlement integration remains a later checkpoint because no offer-aware buyer purchase authority exists yet.

## Explicit exclusions

Checkpoint 9A does **not** authorize:

- offer-aware buyer quote creation;
- buyer payment, seller cash credit, tax, revenue, COGS, or buyer Inventory settlement;
- migration of the retained Player Store purchase path onto seller offers;
- Player Business withdrawal routes or UI;
- Player Store multi-offer read cutover;
- cancellation of a pending withdrawal by the seller;
- an administrator override that bypasses the five-minute minimum;
- returning inventory while canonical reservations remain positive;
- automatic demand or simulated consumer sales;
- seeded/NPC Store withdrawal behavior;
- Marketplace or Contracts integration;
- equity, shares, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secret mutation, or live database mutation.

## Required implementation artifacts

- forward-only migrations for lifecycle/request authority, request command, bounded due processor, and schema assertions;
- typed Store-domain withdrawal contracts and repository publication;
- deterministic structural contract;
- deterministic time-boundary, concurrency, reservation, cost, and two-game simulation;
- dedicated exact-head workflow;
- deterministic architecture inventory update when required;
- durable execution-plan/log update only after one exact implementation SHA passes the complete required matrix.

## Required acceptance gates

One frozen implementation SHA must pass:

- Phase 9A structural, time-boundary, concurrency, reservation, cost, projection, and two-game tests;
- Phase 8A stock-placement contract/simulation/type regressions;
- Phase 7A seller-offer contract/simulation/type regressions;
- canonical Store quote/purchase lifecycle tests;
- canonical Inventory lifecycle and negative-state tests;
- Business Stockroom and timed-manufacturing regressions;
- Database Replay from zero twice and rebuilt-database lint;
- Backend Typecheck and backend smoke;
- all Backend and Edge TypeScript checks;
- Business Economy, Banking, workforce/payroll, equipment, and manufacturing gates;
- Repository Quality and deterministic architecture inventory;
- Supply Chain Security;
- standalone Player Terminal and Chromium regression verification;
- `git diff --check`.

## Completion rule

Checkpoint 9A is complete only when:

1. implementation exists on the stacked branch;
2. one exact implementation SHA is frozen;
3. every required exact-head gate passes on that SHA;
4. this scope, the Business execution plan, and the Business execution log record the certified source and evidence;
5. temporary repair/finalizer artifacts have zero net presence;
6. the PR remains draft, unmerged, and undeployed.

## Next step after scope lock

Implement the bounded Store-owned withdrawal-request authority, immediate pending transition, five-minute server-time gate, reservation-safe bounded due processor, exact Store Listing-to-Finished Goods transfer, retained stockroom convergence, typed contracts, simulations, assertions, and dedicated CI. Do not widen checkpoint 9A into buyer settlement or Player routes/UI.
