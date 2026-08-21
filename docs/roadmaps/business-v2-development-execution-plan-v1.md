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

**Status:** IN PROGRESS — checkpoints A, B, and C complete; legacy abstract input-purchase retirement remains open

- [x] Add bounded Business Stockroom read model over canonical Inventory accounts.
- [x] Materials/warehouse, WIP, Finished Goods, and In Transit are visible separately.
- [x] Procurement delivers canonical items into Business stockroom with actual cost basis.
- [x] Input/manufacturing cost derives from carried inventory basis.
- [ ] Remove new reliance on abstract `unit_input_cost` purchasing.

Certified checkpoints:

- **3A:** canonical warehouse Stockroom read.
- **3B:** canonical Store procurement, certified source `acbbff20a4afa8296bdfb30dbc0c8e84e37702c9`.
- **3C:** coherent location-complete canonical Business Stockroom read, certified source `6799c0b44025dd71b54ed75636dd8f2af3358150`.

Exit: real materials flow supplier -> transit -> warehouse -> WIP -> finished goods.

## Phase 4 — Workforce capacity and payroll

**Status:** NOT STARTED

- [ ] Preserve server-generated talent/candidate direction.
- [ ] Add recipe labor-minute/headcount/role requirements.
- [ ] Add finite employee labor availability/reservations for production jobs.
- [ ] Prevent double-booking labor.
- [ ] Keep recurring payroll independent of production utilization.
- [ ] Ensure production does not debit payroll again.
- [ ] Allocate labor into production cost basis without a second cash movement.
- [ ] Add utilization/idle-capacity read model.

Exit: labor constrains production and payroll is economically correct with zero-production scenarios.

## Phase 5 — Equipment capacity

**Status:** NOT STARTED

- [ ] Validate canonical equipment profiles/items.
- [ ] Add recipe equipment capability/time requirements.
- [ ] Add equipment-time reservations or equivalent concurrent-capacity authority.
- [ ] Prevent equipment double-booking.
- [ ] Keep equipment condition/maintenance behavior bounded and server-owned.

Exit: concurrent jobs cannot exceed installed operational equipment capacity.

## Phase 6 — Timed manufacturing

**Status:** NOT STARTED

- [ ] Replace legacy instant physical production with V2 production jobs.
- [ ] Validate exact recipe/material/labor/equipment prerequisites.
- [ ] Atomically reserve/move BOM materials to WIP.
- [ ] Reserve labor/equipment capacity.
- [ ] Calculate server completion time.
- [ ] Complete through bounded shared worker, never client timer.
- [ ] Consume WIP and post exact catalog output into Finished Goods.
- [ ] Release capacity exactly once.
- [ ] Add cancellation/failure handling and replay protection.

Exit: one end-to-end manufactured catalog item reliably reaches Finished Goods after authoritative server time.

## Phase 7 — Store seller offers and multi-offer catalog presentation

**Status:** NOT STARTED

- [ ] Introduce seller-offer authority separate from catalog item identity.
- [ ] Seeded/NPC and Business sellers share one catalog product presentation.
- [ ] One active offer per Business per item.
- [ ] Offer price/version/status are server validated.
- [ ] Add Store aggregation: best price, total available, seller count, offer details.
- [ ] Give seeded/NPC offers finite stock/replenishment rules.

Exit: duplicate sellers do not create duplicate Store product cards.

## Phase 8 — Physical Store-listing inventory

**Status:** NOT STARTED

- [ ] Create/resolve canonical Store-listing stock account scoped to the offer.
- [ ] Listing quantity physically moves `Finished Goods -> Store Listing`.
- [ ] Increasing stock moves additional units immediately.
- [ ] Purchasing moves exact units `Store Listing -> Buyer Inventory`.
- [ ] Store-listed goods cannot be consumed by another Business workflow.
- [ ] Preserve cost/provenance/audit journal.

Exit: offer availability equals actual inventory held in its Store-listing account.

## Phase 9 — Five-minute Store withdrawal safety

**Status:** NOT STARTED

- [ ] Add `withdrawal_pending` lifecycle/state.
- [ ] Store `withdrawal_requested_at` and `withdrawal_effective_at`.
- [ ] Disable purchase eligibility immediately when cancellation/reduction begins.
- [ ] Enforce a minimum five-minute cooling-off period.
- [ ] Serialize purchase and withdrawal against the same offer row/version.
- [ ] Add bounded due-withdrawal processor.
- [ ] Verify unresolved accepted purchases before returning stock.
- [ ] Return only remaining unsold stock to Finished Goods.
- [ ] Apply the same safety to quantity reductions.
- [ ] Keep ordinary price changes immediate with optimistic concurrency.

Exit: buyer/seller inventory cannot be lost in purchase-vs-withdrawal races.

## Phase 10 — Atomic Store purchase settlement

**Status:** NOT STARTED

- [ ] Lock offer and validate purchasable state.
- [ ] Lock/check buyer balance and listing inventory.
- [ ] Atomically debit Buyer Checking, credit Business cash, transfer inventory, and update offer quantity.
- [ ] Enforce idempotency and exact-once revenue/inventory settlement.
- [ ] Add both lock-order race tests: purchase-first and withdrawal-first.

Exit: no paid-without-item or item-without-payment state is possible.

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
- [ ] Equipment cannot be double-booked.
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
