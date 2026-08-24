# Business V2 Development Execution Plan v1

**Status:** ACTIVE — execution source of truth  
**Integration branch:** `refactor/business-ux-mechanics-v1`  
**Integration PR:** #648 — Redesign Business mechanics and authority model  
**Plan baseline:** `28cea05c4c3328430c3491e8a0c163bc0c0d96de`  
**Plan date:** 2026-08-19  

## Purpose

This document is the durable execution plan and cross-chat handoff for the Econovaria Business V2 redesign. It must be updated whenever a phase, tranche, or material checkpoint is completed.

Every completion update must record:

1. what changed;
2. what was verified;
3. blockers or unresolved risks;
4. architectural or gameplay decisions made;
5. exact branch/commit/PR state when known;
6. the next authorized step.

The primary invariant is:

> **Players make business decisions. Econovaria calculates economic outcomes.**

Business V2 must not become another client-authored simulation configuration surface.

---

# Locked gameplay and authority decisions

These decisions are in scope unless a later explicit product decision supersedes them.

## Product and recipe authority

- A Business may manufacture only an item that already exists in the authoritative catalog.
- A Business must possess/unlock the exact recipe for that catalog item before it can manufacture it.
- There is no free-form Product Creator for physical goods.
- There are no player-created product variants.
- There are no player-authored BOMs, input costs, labor costs, capacity values, demand values, quality scores, productivity values, or manufacturing durations.
- The catalog defines the item. The recipe defines how the item is made. The player chooses whether, when, and how much to manufacture.
- Legacy player-created Business products remain compatibility-only until they can be safely retired.

## Materials and stockroom

- Input cost is derived from the actual materials required by the recipe and the actual cost basis of material inventory owned by the Business.
- Business materials live in canonical Inventory accounts; there is no parallel Business-only inventory authority.
- Business inventory is presented to the Player as a Stockroom.
- Required operating locations are:
  - warehouse/materials;
  - work in progress;
  - finished goods;
  - in transit;
  - Store listing stock.
- Purchased materials move into the Business warehouse/stockroom.
- Starting production moves/reserves exact BOM quantities into WIP.
- Completing production consumes WIP and creates the exact catalog item in Finished Goods.

## Workforce

- Employees are hired from authoritative candidates/roles; the Player does not author employee productivity.
- Employees are paid every payroll cycle while employed regardless of whether the Business produced anything.
- Production does not charge payroll a second time.
- Production uses finite employee labor capacity/time.
- Recipe labor requirements define which roles and how much labor time are required.
- Labor used for manufacturing may be allocated into finished-goods cost basis for managerial/accounting purposes, but that allocation is not another cash debit.

## Equipment

- Required equipment is represented by canonical economic items/capabilities.
- A Business must own/install the required equipment before starting production.
- Equipment has finite productive capacity/time and cannot be double-booked across concurrent jobs.
- Production duration is server-derived from recipe manufacturing time plus bounded labor/equipment capacity rules.

## Production

- Physical production is server timed; the browser never declares completion.
- A production order may begin only when recipe, materials, required labor, required equipment, and available capacity are satisfied.
- Production orders are idempotent and concurrency safe.
- Target lifecycle: `queued -> in_progress -> completed`, with explicit blocked/cancelled/failed states where needed.
- Completed output goes to Business Finished Goods, never directly to the owner's personal Inventory.

## Store and seller offers

- The Store is the primary sales channel for Business-produced goods.
- The Marketplace remains secondary resale of items already owned by Players.
- One canonical catalog item may have multiple seller offers.
- Seeded/NPC supply and Player Business supply appear as offers under the same catalog item instead of duplicate product cards.
- A Business may have at most one active Store offer per catalog item.
- A Business controls its offer price and quantity offered, subject to server validation and real inventory.
- Seeded/NPC offers must use finite stock/restocking/scarcity rules so unlimited seeded supply cannot permanently suppress the Player economy.

## Physical Store listing stock

- Listing stock is physically moved out of Business Finished Goods into a canonical Store-listing inventory account.
- Increasing offered quantity moves additional stock `Finished Goods -> Store Listing` immediately if available.
- A buyer purchase moves stock `Store Listing -> Buyer Inventory` atomically with payment.
- Cancelling or reducing offered quantity returns only unsold stock to Finished Goods after the withdrawal safety process.
- Store-listed inventory cannot simultaneously satisfy production, Contracts, another Store offer, or any other inventory use.

## Store withdrawal cooling-off safety

- Cancelling a listing or reducing its offered stock immediately stops purchases against the affected stock.
- Remaining stock does **not** return to the Business immediately.
- A mandatory five-minute cooling-off/processing period applies.
- Target lifecycle for full cancellation:
  - `active`
  - `withdrawal_pending`
  - `cancelled`
- Purchases require an `active` purchasable offer.
- Purchase and withdrawal commands must lock/serialize the same authoritative offer state.
- If purchase settlement wins the lock first, it completes and the later withdrawal operates on the remaining stock.
- If withdrawal wins first, the purchase is rejected before payment.
- After at least five minutes, a bounded worker verifies no unresolved accepted purchase settlement remains, then returns unsold stock to Business Finished Goods.
- No buyer may be charged without receiving committed inventory.
- No seller may receive returned stock that has already been sold.

## Corporate/equity direction

- C corporations have authoritative shares and ownership positions.
- IPO/Financial Market integration is later than the first stable operating Business loop.
- Business fundamentals will eventually publish into Financial Markets through an explicit integration/event boundary rather than direct cross-domain table writes.

---

# Target backend boundary

```text
Player UI
  -> same-origin Player BFF
  -> Business Player API
  -> Business application command/query
  -> Business domain policy
       -> Inventory port
       -> Banking/Economy port
       -> Store port
       -> Contracts port
       -> World/Market policy inputs
       -> later Stocks/Financial Markets event port
  -> atomic database settlement where required
  -> immutable Business activity/audit event
  -> bounded Business read model
```

Rules:

- Browser payloads express intent, never trusted outcomes.
- Player/game scope is server-derived.
- Internal UUIDs remain private.
- Economic mutations are idempotent.
- Cross-game isolation is mandatory.
- Business does not create parallel money, inventory, Store, Contract, or Financial Market authorities.

---

# Target Business source structure

The current mixed `backend/src/domains/business-banking/` remains a temporary compatibility façade while Business is extracted.

Target:

```text
backend/src/domains/business/
├── api/
│   ├── playerBusinessRoutePaths.ts
│   ├── playerBusinessHttpHandler.ts
│   └── playerBusinessHttpHandler.test.ts
├── application/
│   ├── formation/
│   ├── recipes/
│   ├── stockroom/
│   ├── procurement/
│   ├── workforce/
│   ├── equipment/
│   ├── production/
│   ├── sales/
│   ├── governance/
│   └── capital/
├── contracts/
│   ├── businessContracts.ts
│   ├── manufacturingContracts.ts
│   ├── workforceContracts.ts
│   ├── storeSellerContracts.ts
│   └── businessEvents.ts
├── domain/
│   ├── manufacturingCapacity.ts
│   ├── productionCosting.ts
│   ├── laborCapacity.ts
│   ├── equipmentCapacity.ts
│   ├── valuation.ts
│   └── businessPolicy.ts
├── infrastructure/
│   ├── supabaseBusinessRepository.ts
│   ├── supabaseProductionRepository.ts
│   ├── supabaseWorkforceRepository.ts
│   └── supabaseBusinessReadRepository.ts
└── integration/
    ├── inventoryPort.ts
    ├── bankingPort.ts
    ├── storePort.ts
    ├── contractsPort.ts
    └── stocksPort.ts
```

Do not create this tree cosmetically. Extraction is complete only when runtime composition, contracts, tests, and compatibility forwarding are wired.

---

# Execution phases

## Phase 0 — Existing Business V2 convergence and validation

**Status:** COMPLETE

Goal: make the current #648 schema and runtime internally consistent before adding another feature wave.

Tasks:

- [ ] Re-audit every `20260819*` Business migration against the exact branch head.
- [ ] Fix schema/read-model/function naming drift.
- [ ] Verify migration ordering and forward-only compatibility.
- [ ] Replay the complete database from zero twice.
- [ ] Run database lint/advisors where available.
- [ ] Run Business authority contract tests.
- [ ] Run Backend Typecheck.
- [ ] Run Business/Banking focused tests.
- [ ] Run canonical Inventory regression tests.
- [ ] Verify no new Business table duplicates canonical Inventory or money authority.
- [ ] Update this execution document with fixes, blockers, verification, and exact commit state.

Known blocker at plan creation:

- `get_player_business_workspace_v2` is already inconsistent with the formation migration. The read model references names/fields such as `business_formation_proposal_owners`, `decision`, `total_capitalization`, and `expires_at`, while the formation migration defines `business_formation_owners`, `approval_status`, `total_initial_units`, and no proposal expiry field. Phase 0 must resolve this and scan for similar drift before any Store/UX expansion.

Exit criteria:

- clean replay twice;
- no known schema-contract drift;
- Business contracts/typechecks green;
- compatibility boundaries documented;
- no production deployment.

## Phase 1 — Business domain extraction

**Status:** COMPLETE

- [ ] Create the real Business domain boundary under `backend/src/domains/business/`.
- [ ] Split Business APIs/contracts/application logic from Banking without changing Banking behavior.
- [ ] Keep old `business-banking` Business entrypoints as thin compatibility forwarding only.
- [ ] Move Business reads to the authoritative V2 workspace read model after Phase 0 validation.
- [ ] Add route/handler/domain tests and capability/rate-limit coverage.

Exit: Player Business traffic reaches the Business domain through explicit API/application boundaries; Banking remains stable.

## Phase 2 — Canonical catalog/recipe authority

**Status:** COMPLETE

- [ ] Reconcile #648 Business recipe records with the existing Seed/Crafting recipe authority.
- [ ] Prefer references/adapters to the canonical recipe/BOM source; do not fork the catalog.
- [ ] Allow Business-specific manufacturing metadata only for genuinely Business-specific requirements such as labor/equipment/time when missing from canonical recipes.
- [ ] Enforce exact catalog output item.
- [ ] Enforce exact recipe unlock/ownership.
- [ ] Disable new free-form Business product creation.
- [ ] Preserve legacy custom products only as bounded compatibility data until retirement.

Exit: a Player cannot create or modify the definition/BOM of a physical product.

## Phase 3 — Stockroom and procurement

**Status:** COMPLETE — checkpoints A through D certified

- [x] Add bounded Business Stockroom read model over canonical Inventory accounts.
- [x] Materials/warehouse, WIP, Finished Goods, and In Transit are visible separately.
- [x] Procurement delivers canonical items into Business stockroom with actual cost basis.
- [x] Input/manufacturing cost derives from carried inventory basis.
- [x] Remove new reliance on abstract `unit_input_cost` purchasing.

Certified checkpoints:

- **3A:** canonical warehouse Stockroom read.
- **3B:** canonical Store procurement, certified source `acbbff20a4afa8296bdfb30dbc0c8e84e37702c9`.
- **3C:** coherent location-complete canonical Business Stockroom read, certified source `6799c0b44025dd71b54ed75636dd8f2af3358150`.
- **3D:** live abstract input-purchase authority retired while preserving authenticated `410 Gone` compatibility handling and historical records; certified implementation source `bd186ba86b4952bff7f4ab9b34c5e067dbd70116`, clean verification head `832c609679e4d423e968ee2e42bd810d7aa6a862`.

Exit: real materials flow supplier -> transit -> warehouse -> WIP -> finished goods.

## Phase 4 — Workforce capacity and payroll

**Status:** COMPLETE — checkpoints A through C certified

- [x] Preserve server-generated talent/candidate direction.
- [x] Add recipe labor-minute/headcount/role requirements.
- [x] Add finite employee labor availability/reservations for production jobs.
- [x] Prevent double-booking labor.
- [x] Keep recurring payroll independent of production utilization.
- [x] Ensure production does not debit payroll again.
- [x] Allocate labor into production cost basis without a second cash movement.
- [x] Add utilization/idle-capacity read model.

Certified checkpoints:

- **4A:** canonical workforce/payroll authority foundation and scope hardening, certified source `f72626f055004007823eb8de22569035ac897797`.
- **4B:** public candidate pools and candidate-only server-owned hiring, with browser-authored employee economics retired; certified source `73bb4bfb4a6d7eca1f36e8fd6ef707ca5c797cdf`.
- **4C:** production labor reservations, deterministic recurring payroll settlement and recovery, no second production wage debit, and public workforce utilization/idle-capacity read; certified implementation and exact-head verification source `857ab6ec77bf02ad619092632e2def80f12d4329`.

Exit: labor constrains production and payroll is economically correct with zero-production scenarios.

## Phase 5 — Equipment capacity

**Status:** COMPLETE — canonical equipment ownership, installation, finite capacity, production enforcement, and public read certified

- [x] Validate canonical equipment profiles/items.
- [x] Add recipe equipment capability/time requirements.
- [x] Add equipment-time reservations and deterministic concurrent-capacity authority.
- [x] Prevent equipment double-booking.
- [x] Keep equipment operational state bounded and server-owned while durability/repair remain disabled.

Certified checkpoint:

- **5:** canonical equipment-instance ownership through canonical Inventory/economic parties; trusted Business materialization and installation; server-derived capacity profiles and canonical recipe equipment requirements with future recipe synchronization; finite deterministic equipment reservations; exact-once consume/release transitions; production-side equipment capacity enforcement; and public-key-only equipment utilization read. **Certified implementation and exact-head verification source:** `6f936abd61c6cd903f6e839790ceab24ed570748`.

Exit: concurrent production attempts cannot exceed installed operational equipment capacity. **MET.**

## Phase 6 — Timed manufacturing

**Status:** COMPLETE — certified exact-head source `739f5540234b20e16ba34f69f0d741d986030113`; core Phase 6B–6E implementation source `bee7a5c6a98389ed9f238fc7191f8c4621f6e1ff`

- [x] Replace legacy instant physical production with V2 production jobs.
- [x] Validate exact recipe/material/labor/equipment prerequisites.
- [x] Atomically reserve/move BOM materials to WIP.
- [x] Reserve labor/equipment capacity across the job lifecycle.
- [x] Calculate server completion time.
- [x] Complete through bounded shared worker, never client timer.
- [x] Consume WIP and post exact catalog output into Finished Goods.
- [x] Release capacity exactly once.
- [x] Add cancellation/failure handling and replay protection.

Certified checkpoints:

- **6A:** server-owned lifecycle, timing, queue-start, due-job leasing, retry and public-read foundation; certified source `0589e8015736a8b770622be6ad0e5abedda24c26`.
- **6B:** atomic canonical Warehouse-to-WIP material staging plus finite eligible labor and installed-equipment reservation.
- **6C:** exact-once worker completion into canonical Finished Goods with WIP consumption and reservation consumption.
- **6D:** exact-once cancellation/failure recovery returning staged materials and releasing labor/equipment.
- **6E:** authenticated Player API/workspace cutover with browser-safe countdown state and explicit HTTP `410 Gone` retirement of instant production.
- **Final certification:** exact source `739f5540234b20e16ba34f69f0d741d986030113` passed the complete database, backend, Edge, Business, workforce/payroll, equipment, manufacturing, repository, security, Player, Chromium, 40-Player, and two-game isolation matrix recorded in `business-phase6-final-certification-inventory-v1.md`.

Exit: one end-to-end manufactured catalog item reliably reaches Finished Goods after authoritative server time. **MET.**
## Phase 7 — Store seller offers and multi-offer catalog presentation

**Status:** FOUNDATION COMPLETE — checkpoint 7A certified exact-head source `04db81436e75cea6c52d0c720508c3ea12baab05`; Player presentation cutover remains deferred until offer-aware quote and settlement semantics cannot diverge

**Checkpoint 7A boundary:** seller-offer identity, lifecycle/version invariants, seeded compatibility projection, bounded replenishment policy, and service-owned catalog aggregation reuse canonical Store, Business, Inventory, money, and economic-party authorities. Physical Store custody transfer, withdrawal safety, buyer settlement, automatic sales convergence, and IPO/equity remain closed for later phases.

- [x] Introduce Store-owned seller-offer authority separate from catalog item identity.
- [x] Aggregate seeded, NPC-capable, and Business seller offers under one canonical product in a service-owned read model; Player-facing presentation remains intentionally deferred.
- [x] Enforce one current non-retired offer per Business and canonical item plus one active offer per custody account.
- [x] Server-validate offer price, currency, seller kind, lifecycle, immutable identity/custody, and optimistic version progression.
- [x] Add deterministic Store aggregation: best price, total canonical availability, seller count, and public offer details.
- [x] Bind seeded compatibility offers to canonical finite Store inventory and bounded `canonical_supply`; retain bounded NPC seller support for later materialization.

Certified checkpoint:

- **7A:** additive `store_seller_offers` authority; immutable game/catalog/seller identity; service-only idempotent Business draft creation and optimistic mutation; seeded compatibility backfill/synchronization with fail-closed identity/custody rules; canonical Inventory-backed aggregation; typed Store contracts/repository; deterministic concurrency, idempotency, aggregation, and two-game isolation. **Certified implementation and exact-head verification source:** `04db81436e75cea6c52d0c720508c3ea12baab05`. Dedicated workflow: `32681497746`.

Exit: seller-specific offers aggregate under one canonical Store product without duplicating catalog identity. The service foundation is **MET**; Player-facing multi-offer presentation remains deferred until the quote/purchase path becomes offer aware.

## Phase 8 — Physical Store-listing inventory

**Status:** FOUNDATION COMPLETE — checkpoint 8A certified exact-head source `c0fd8650987a332f99b8173395dcf84fc3518c15`; buyer inventory transfer remains deferred to atomic Store purchase settlement

- [x] Create/resolve one canonical immutable Store-listing stock account scoped to the Business offer.
- [x] Listing quantity physically moves exact available units `Finished Goods -> Store Listing`.
- [x] Increasing stock moves additional units immediately under optimistic offer concurrency.
- [ ] Purchasing moves exact units `Store Listing -> Buyer Inventory` — deferred to Phase 10 so payment and inventory cannot diverge.
- [x] Store-listed goods cannot be consumed by another Business workflow because they leave canonical Finished Goods custody.
- [x] Preserve average cost, currency, public-key provenance, append-only Inventory evidence, retained stockroom convergence, and two-game isolation.

Certified checkpoint:

- **8A:** canonical poster support for Business-owned offer custody; deterministic offer-scoped `store_stock` account; service-only idempotent stock command; exact Finished Goods-to-Store transfer; reserved-quantity exclusion; optimistic offer versioning; canonical/retained stockroom convergence; typed Store contracts/repository; deterministic concurrency, cost, rollback, aggregation, and two-game tests. **Certified implementation and exact-head verification source:** `c0fd8650987a332f99b8173395dcf84fc3518c15`. Dedicated workflow: `32691204140`.

Exit: offer availability equals actual canonical inventory held in its Store-listing account. The physical listing foundation is **MET**; buyer transfer remains part of Phase 10 atomic settlement.

## Phase 9 — Five-minute Store withdrawal safety

**Status:** COMPLETE — checkpoint 9A certified exact-head source `bf17e2493654620229d1acdeaae0fbaba21caf63`

- [x] Add `withdrawal_pending` lifecycle/state and durable public `swr_...` request identity.
- [x] Store server-derived `withdrawal_requested_at` and `withdrawal_effective_at` with a minimum five-minute boundary.
- [x] Disable future offer-aware purchase eligibility immediately and exclude pending offers from active aggregation.
- [x] Preserve one pending request per offer, immutable request identity, optimistic offer versions, and authoritative replay receipts.
- [x] Add a bounded deterministic due-withdrawal processor using request-first locking and `FOR UPDATE SKIP LOCKED`.
- [x] Treat positive canonical Store-listing reservations as unresolved accepted-purchase evidence and defer the entire return.
- [x] Return only remaining unsold stock `Store Listing -> Finished Goods`, including bounded quantity reductions.
- [x] Preserve average cost, currency, canonical Inventory provenance, retained stockroom convergence, and exact-once completion.
- [x] Keep ordinary price/lifecycle mutation immediate outside `withdrawal_pending`; reject stock, price, custody, and lifecycle mutation while pending.
- [x] Establish the offer-first purchase lock boundary and deterministic purchase-first/withdrawal-first contract required by Phase 10.

Certified checkpoint:

- **9A:** Store-owned withdrawal requests and self-describing pending offer state; immediate non-purchasability; five-minute server-time cooling-off; bounded reservation-safe due processing; exact canonical Store Listing-to-Finished Goods return; immutable pending/completion receipts; replay-before-active-state validation; request/offer deadlock prevention; cost/provenance and retained stockroom convergence; typed Store contracts/repository; deterministic time, concurrency, replay, reservation, rollback, bounded-batch, catalog-resume, and two-game tests. **Certified implementation and exact-head verification source:** `bf17e2493654620229d1acdeaae0fbaba21caf63`. Dedicated workflow: `32729827704`.

Exit: the withdrawal side of purchase-vs-withdrawal safety is **MET**. Phase 10 must use the same offer-first lock boundary and prove both race orderings while atomically settling buyer money, seller money, and inventory.

## Phase 10 — Atomic Store purchase settlement

**Status:** FOUNDATION COMPLETE — checkpoint 10A.1 certified exact-head source `1abc8b878df5b08716107adb467bd013e85b6df4`; checkpoint 10A.2 offer-aware quote authority is OPEN

- [x] Freeze the immutable public purchase-receipt contract and trusted/browser command boundary.
- [x] Freeze one seller-offer-first economic row-lock order.
- [x] Prove purchase-first and withdrawal-first ordering plus replay, conflict, rollback, and two-game isolation in deterministic simulations.
- [ ] Add immutable offer-aware quote authority bound to exact offer, version, seller, custody, quantity, price, currency, and expiry.
- [ ] Lock offer and validate purchasable state in the runtime settlement command.
- [ ] Lock/check buyer balance and listing inventory.
- [ ] Atomically debit Buyer Checking, credit Business cash, transfer inventory, and update offer quantity.
- [ ] Enforce idempotency and exact-once revenue/inventory settlement.

Certified checkpoint:

- **10A.1:** non-mutating Store settlement authority foundation; immutable public `spr_...` receipt contract; trusted command boundary; fixed offer-first lock order; deterministic purchase/withdrawal ordering, replay, conflict, rollback, and two-game simulations; complete retained database, Business, Store, Inventory, backend/Edge, repository, security, Player, and Chromium matrix. **Certified implementation and exact-head verification source:** `1abc8b878df5b08716107adb467bd013e85b6df4`. Dedicated workflow: `32753253910`.

Exit: no paid-without-item or item-without-payment state is possible. **Not yet met; quote and settlement runtime remain open.**

## Phase 11 — Converge Business demand/sales onto Store offers

**Status:** NOT STARTED

- [ ] Remove/replace any independent automatic finished-goods sales authority that competes with Store settlement.
- [ ] If simulated consumer/NPC demand remains, make it consume active Store offers through the same seller-offer inventory authority.
- [ ] Keep competition game scoped and based on bounded price/reputation/availability/macroeconomic factors.

Exit: there is one sales inventory authority and one revenue settlement path.

## Phase 12 — Player Business workspace UX convergence

**Status:** NOT STARTED

Target modules:

- Overview
- Products / Recipes
- Stockroom
- Production
- Workforce
- Equipment
- Sales
- Finance
- Ownership / Governance
- Activity

Requirements:

- [ ] No simulation-engine numeric authoring.
- [ ] Product selection comes from exact available recipes/catalog items.
- [ ] Production readiness shows material/labor/equipment bottleneck.
- [ ] Stockroom exposes actual locations and quantities.
- [ ] Sales exposes Finished Goods, Listed stock, price, offer state, and withdrawal timer.
- [ ] Cancellation UI clearly states purchases are disabled while stock is processing back to the storeroom.

Exit: Player can operate Business V2 without legacy Business forms.

## Phase 13 — Admin Business supervision

**Status:** NOT STARTED

- [ ] Add read-only operational visibility for stockrooms, jobs, employees, payroll, equipment, Store offers, withdrawal-pending stock, financial health, tax, ownership and audit.
- [ ] Keep emergency intervention explicit, bounded, permissioned and audited.

## Phase 14 — Financial reporting, equity and IPO -> Financial Market

**Status:** NOT STARTED

- [ ] Stabilize Business financial statements/fundamentals from real operating activity.
- [ ] Complete common-share equity invariants for C corporations.
- [ ] Add IPO eligibility/terms/issuance.
- [ ] Publish versioned Business events to Stocks/Financial Markets integration.
- [ ] Never write Market internal tables directly from Business.
- [ ] Existing Financial Market/Portfolio becomes the secondary trading surface after listing.

---

# First playable Business V2 milestone

The first major milestone is complete only when one Player can perform this end-to-end:

```text
Form Business
-> possess/unlock exact recipe
-> inspect catalog product requirements
-> procure required materials
-> materials arrive in Stockroom
-> hire required workers
-> own/install required equipment
-> start production
-> server manufacturing time passes
-> exact catalog item enters Finished Goods
-> list 10 units in Store
-> 10 units physically leave Finished Goods into Store-listing stock
-> buyer purchases
-> buyer receives item and Business receives cash atomically
-> Business changes price and offered quantity safely
-> Business requests cancellation
-> purchases stop immediately
-> five-minute cooling-off period completes
-> unsold stock returns to Finished Goods
-> employee payroll occurs even if later production utilization is zero
```

---

# Non-negotiable acceptance gates

- [ ] Database replay from zero twice.
- [ ] Database lint/advisors where available.
- [ ] Backend typecheck.
- [ ] Browser cannot submit trusted ownership/game UUIDs.
- [ ] Cross-game isolation.
- [ ] Materials cannot be double-spent.
- [ ] Labor cannot be double-booked.
- [x] Equipment cannot be double-booked.
- [ ] Payroll executes with zero production.
- [ ] Production never double-debits payroll.
- [ ] Input cost derives from actual inventory basis.
- [ ] Only exact catalog items/recipes can enter new Business production.
- [ ] No new custom physical products or variants.
- [ ] Production output enters Finished Goods.
- [ ] Store listing physically removes listed stock from Finished Goods.
- [ ] Store withdrawal disables purchases immediately.
- [ ] Five-minute withdrawal cooling-off enforced server-side.
- [ ] Purchase-first race passes.
- [ ] Withdrawal-first race passes.
- [ ] Buyer payment and inventory transfer are atomic.
- [ ] Business Store revenue credits exactly once.
- [ ] Seeded and Business offers aggregate under one catalog item.
- [ ] One Business cannot spam duplicate active offers for the same item.
- [ ] 40-Player concurrent classroom acceptance.
- [ ] Two simultaneous games cannot affect one another.
- [ ] Player E2E: Business -> Store -> buyer Inventory.
- [ ] No production deployment until explicit release authorization.

---

# Development/PR strategy

PR #648 remains the Business V2 integration PR and stays draft until full convergence.

Prefer bounded stacked tranches rather than uncontrolled broad additions:

```text
fix/business-v2-schema-convergence
  -> refactor/business-domain-boundary-v2
  -> feat/business-manufacturing-authority-v2
  -> feat/business-store-seller-offers-v2
  -> refactor/player-business-workspace-v2
  -> feat/business-ipo-market-v1
```

If work is committed directly to the existing integration branch because of execution-environment constraints, every commit must still correspond to one bounded tranche and this document must record the boundary and verification.

---

# Running execution log

## 2026-08-19 — Plan committed / Phase 0 opened

### Completed

- Converted the Business redesign discussion into this durable phased execution plan.
- Locked the product/catalog/recipe authority decisions.
- Locked the Stockroom/WIP/Finished Goods model.
- Locked recurring payroll independent of production utilization.
- Locked multi-seller Store offers under one catalog item.
- Locked physical movement of Business stock into Store-listing inventory.
- Locked the five-minute Store withdrawal cooling-off rule and purchase-vs-withdrawal serialization requirement.

### Decisions

- PR #648 remains the integration PR and must stay draft.
- Phase 0 is validation/convergence, not feature expansion.
- Existing `business-banking` Business APIs are temporary compatibility surfaces; Business will receive its own domain boundary.
- Store listing stock is a real canonical inventory location, not merely a UI quantity.

### Known blockers / risks

- Workspace/formation schema drift exists on the current #648 head and must be corrected before adding new Store or UI mechanics.
- The current Business recipe implementation must be reconciled with canonical Seed/Crafting recipe authority to avoid a second recipe catalog.
- The current automatic Business sales engine must later converge onto Store seller offers to avoid two independent finished-goods sales authorities.

### Next step

- Execute Phase 0 schema/runtime convergence on the exact current #648 branch, update this log with findings/fixes/tests, then proceed to domain extraction only after the Phase 0 exit criteria are met.

---

## 2026-08-23 — Phase 4C COMPLETE and Phase 4 COMPLETE

### Certified state

- Exact certified implementation and verification source: `857ab6ec77bf02ad619092632e2def80f12d4329`.
- Feature branch: `feat/business-workforce-production-labor-v2`.
- Stacked draft PR: #659, based on certified Phase 4B branch `feat/business-workforce-hiring-v2`.
- PR #659 and integration PR #648 remain open, draft, unmerged, and undeployed.
- The certification documentation is later than the tested source and must not replace `857ab6ec77bf02ad619092632e2def80f12d4329` as the implementation identity.

### Completed authority

- Canonical recipe labor requirements now constrain production by role, headcount, skill, and finite payroll-period employee minutes.
- Labor reservations are deterministic, concurrency-safe, idempotent, and consumed or recoverable exactly once.
- Production no longer performs a synthetic wage cash debit; authoritative wage/capacity terms remain available as managerial production cost basis.
- Recurring payroll creates deterministic employee evidence even with zero production.
- Business Checking settlement supports completed, partially paid, and unpaid outcomes with exact-once recovery.
- Player-linked employees are credited through canonical ledger authority; system candidates retain evidence without fake Player accounts.
- Public-key-only utilization, idle-capacity, payroll due/paid/unpaid, and employee status data are published to the Player Business surface.

### Exact-head verification

All required workflows passed on the certified source, including Business Workforce Production Payroll V2 (`32601382383`), Business Workforce Payroll V2 (`32601382371`), Business Workforce Hiring V2 (`32601382382`), Database Replay (`32601382380`), Backend Typecheck (`32601382359`), Repository Quality (`32601382340`), Player Terminal Verify with Chromium (`32601382375`), Business Banking Runtime (`32601382366`), Business Economy V2 (`32601382376`), security and environment-neutral browser gates, and the retained Admin, World, market-timezone, exchange-calendar, progression, and interaction-wiring regressions.

### Decisions and remaining risks

- Phase 4 is complete. No remaining workforce/payroll blocker authorizes expanding Phase 4C further.
- Existing instant production remains a bounded compatibility lifecycle until Phase 6 replaces it with authoritative timed manufacturing.
- Equipment authority remains absent by design and is the next required production-capacity dependency.
- No merge, staging deployment, production deployment, secret change, or live data mutation was authorized or performed.

### Next authorized step

**Phase 5 — equipment capacity is OPEN.** Begin with a bounded audit of canonical equipment items/capabilities, existing recipe/equipment metadata, ownership/installation semantics, finite equipment-time reservations, condition/maintenance boundaries, and double-booking prevention. Do not widen this tranche into timed manufacturing, Store seller offers, IPO, merge, staging, or production deployment.

---

## 2026-08-23 — Phase 5 COMPLETE: canonical equipment capacity

### Certified state

- **Exact certified implementation and verification source:** `6f936abd61c6cd903f6e839790ceab24ed570748`.
- Feature branch: `feat/business-equipment-capacity-v2`.
- Stacked draft PR: #660, based on the Phase 4 certification head `213557d2028b7152562f7a23c167d9532d469203`.
- PR #660 and integration PR #648 remain open, draft, unmerged, and undeployed.
- Later certification commits are documentation/security-manifest only and must not replace `6f936abd61c6cd903f6e839790ceab24ed570748` as implementation evidence.

### Completed authority

- Canonical `equipment_instances`, `game_items`, equipment definitions, Inventory accounts and economic parties remain the equipment/ownership authority; no Business equipment catalog or shadow inventory was created.
- Business-owned serialized equipment is represented by a canonical Business warehouse account with `player_id = null`, while Player-owned equipment retains personal-account and Player provenance behavior.
- Server-owned capacity profiles derive capabilities and minutes from trusted equipment definitions.
- Canonical recipe `required_tools` derive finite Business equipment requirements and remain synchronized after future recipe/tool/duration/status changes.
- Trusted materialization creates at most one unique Business equipment instance per exact canonical warehouse unit and cannot fabricate instances beyond owned quantity.
- Business installation state is explicit, same-game/same-Business, audited and separate from Player equipped slots.
- Equipment reservations use a server-derived period, deterministic public-key ordering, exact minutes, idempotent replay/conflict checks and exact-once consume/release transitions.
- Production now reserves required equipment before Phase 4 material/labor settlement, consumes equipment reservations only after committed success, and rolls reservations back automatically if settlement fails.
- Matching production replay does not reserve or consume equipment twice.
- Public Business equipment reads expose only public Business/installation/equipment/item keys and bounded utilization/capacity fields; internal UUIDs and inventory-account IDs remain private.
- Durability/repair, random failure and maintenance settlement remain disabled; offline/retired equipment contributes zero capacity.

### Exact-head verification

- **Business Equipment Capacity V2 — PASS** (`32605009671`).
- **Database Replay ×2 + rebuilt-database lint — PASS** (`32605009709`).
- **Backend Typecheck — PASS** (`32605009722`).
- **Business Banking Runtime — PASS** (`32605009647`).
- **Business Economy V2 — PASS** (`32605009635`).
- **Business Workforce Production Payroll V2 — PASS** (`32605009705`).
- **Repository Quality — PASS** (`32605009728`).
- **Supply Chain Security — PASS** (`32605009711`).
- **Player Terminal Verify, including Chromium — PASS** (`32605009756`).
- **Admin API Check — PASS** (`32605009682`).
- **Staging Readiness Preflight — PASS** (`32605009637`).
- **Required Game Market Timezone — PASS** (`32605009732`).
- **Exchange Calendar Runtime — PASS** (`32605009702`).

### Decisions and remaining risks

- Phase 5 is complete. No equipment-capacity blocker remains before Phase 6.
- The overlapping early 08:xx equipment draft migrations discovered during implementation were removed; PR #660 contains one canonical equipment authority only.
- Equipment requirements and capacity remain server-owned; the Player cannot author equipment minutes, capabilities, condition or maintenance outcomes.
- Existing production is still instant compatibility behavior. Phase 6 must convert physical production to a server-timed lifecycle while reusing the certified material, labor and equipment reservations.
- No merge, staging deployment, production deployment, secret change, or live database mutation was authorized or performed.

### Next authorized step

**Phase 6 — timed manufacturing is OPEN.** Build a bounded production-job lifecycle that atomically reserves/moves BOM materials to WIP, retains certified labor/equipment capacity across server time, calculates completion server-side, completes through a bounded worker, posts exact catalog output to Finished Goods, and releases/consumes capacity exactly once. Do not widen into Store seller offers, IPO, merge, staging, or production deployment.
