# Business V2 Phase 4C — Production Labor and Deterministic Payroll Scope v1

**Status:** COMPLETE — exact-head certified  
**Branch:** `feat/business-workforce-production-labor-v2`  
**Parent branch:** `feat/business-workforce-hiring-v2`  
**Certified parent implementation:** `73bb4bfb4a6d7eca1f36e8fd6ef707ca5c797cdf`  
**Certified Phase 4C implementation and verification source:** `857ab6ec77bf02ad619092632e2def80f12d4329`  
**Certification date:** 2026-08-23  

## Purpose

Phase 4C connects the certified workforce/payroll foundation to the existing production and cycle-settlement authorities without creating parallel money, inventory, recipe, employee, production, or payroll systems.

The governing rule remains:

> Players choose whether and how much to produce. Econovaria determines eligible labor, capacity, cost allocation, payroll obligations, settlement, and recovery.

## Defects replaced

1. Legacy production capacity was derived from a sum of `business_employees.productivity_index` rather than canonical recipe-role labor requirements and finite employee minutes.
2. Legacy production immediately debited `unit_labor_cost * quantity` as cash even though employed workers were also owed recurring payroll.
3. Legacy cycle settlement aggregated wages directly and hard-failed the whole cycle when Business cash could not fund all wages.
4. Payroll evidence tables existed but were not the settlement authority.
5. Labor reservation authority existed but was not coupled to production.

## Certified production-labor authority

- Resolve the owned active Business and exact product/recipe authority server-side.
- Read canonical `business_recipe_labor_requirements` for role, headcount, skill, and labor minutes.
- Derive the payroll period key server-side from authoritative game time/cycle identity.
- Select only active canonical employees in the same game and Business whose role and skill satisfy each requirement.
- Lock employee rows and existing reservations in a deterministic order.
- Reserve finite labor minutes before production is committed.
- Reject insufficient headcount, missing role coverage, insufficient skill, and insufficient remaining minutes with stable machine-readable errors.
- Prevent the same employee minutes from being reserved twice in one payroll period.
- Bind reservations to the exact production run.
- Mark reservations consumed exactly once when the current instant production transaction completes.
- Preserve explicit release/recovery support for failed or cancelled future production lifecycles.

## Certified production-cost authority

- Remove the immediate synthetic production wage ledger debit.
- Do not reduce Business cash merely because labor was used in production.
- Calculate labor allocation from authoritative wage and capacity terms for managerial cost basis.
- Record input cost, allocated labor cost, and total production cost on the production run.
- Preserve real material cost basis and exact inventory settlement.
- Keep recurring payroll independent of production utilization.

## Certified payroll authority

- Create one deterministic payroll run per Business and payroll period.
- Create one payroll entry per employee who was employed during the relevant period, including zero-production employees.
- Freeze wage due, employee linkage, country, currency, and source employment evidence.
- Lock the Business money authority before settlement.
- Settle through canonical ledger posting only.
- Prefer full payment when funded.
- When underfunded, allocate available cash deterministically and record `partially_paid` or `unpaid` instead of rolling back the entire cycle.
- Credit Player-linked employees through canonical Player Checking ledger authority.
- Preserve paid/unpaid evidence for system candidates without inventing a fake Player account.
- Matching retries replay the existing run; conflicting reuse fails closed.
- A later retry/recovery settles remaining unpaid wages exactly once.

## Certified read model

The Player receives a public-key-only workforce operations view containing:

- payroll period key and generated timestamp;
- employee public key and role;
- labor minutes available, reserved, consumed, and idle;
- utilization basis points;
- latest payroll status, wage due, wage paid, and wage unpaid;
- aggregate Business payroll due, paid, and unpaid;
- no internal UUIDs or trusted scope fields.

## Concurrency and idempotency evidence

Phase 4C contracts and simulations prove:

- two production attempts cannot reserve the same remaining employee minutes;
- replaying a production idempotency key returns the original receipt without new reservations or inventory movement;
- conflicting production idempotency reuse is rejected;
- two payroll settlement attempts for the same Business/period create one run and one set of entries;
- partial-payment retry pays only the remaining unpaid amount;
- zero-production payroll still creates and settles payroll evidence;
- two games with the same public-looking business data remain isolated;
- production never creates a second payroll cash debit.

## Exact-head verification

All required checks passed on `857ab6ec77bf02ad619092632e2def80f12d4329`:

- **Business Workforce Production Payroll V2 — PASS** (`32601382383`).
- **Business Workforce Payroll V2 — PASS** (`32601382371`).
- **Business Workforce Hiring V2 — PASS** (`32601382382`).
- **Database Replay from zero twice and rebuilt-database lint — PASS** (`32601382380`).
- **Backend Typecheck and backend smoke — PASS** (`32601382359`).
- **Repository Quality — PASS** (`32601382340`).
- **Player Terminal Verify, including Chromium — PASS** (`32601382375`).
- **Business Banking Runtime — PASS** (`32601382366`).
- **Business Economy V2 — PASS** (`32601382376`).
- **Progression Runtime — PASS** (`32601382338`).
- **Environment Neutral Browser — PASS** (`32601382374`).
- **Supply Chain Security — PASS** (`32601382337`).
- **Runtime Interaction Wiring — PASS** (`32601382351`).
- **Admin API Check — PASS** (`32601382356`).
- **World Runtime — PASS** (`32601382370`).
- **Staging Readiness Preflight — PASS** (`32601382342`).
- **Required Game Market Timezone — PASS** (`32601382363`).
- **Exchange Calendar Runtime — PASS** (`32601382357`).

## Explicit exclusions retained

Phase 4C does not authorize:

- equipment requirements or equipment reservations;
- timed manufacturing, queues, workers, or browser-declared completion;
- Store seller offers or Store-listing inventory;
- automatic sales convergence;
- corporate equity, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secrets, or live data mutation.

## Completion result

The implementation, focused contracts, database replay, backend and Edge typechecks, Business and payroll gates, Player and Chromium regressions, concurrency/idempotency evidence, and exact implementation source are durable. Phase 4C is complete.

PR #659 remains intentionally open, draft, mergeable, unmerged, and undeployed. The certification documentation is later than the tested implementation source and must not replace `857ab6ec77bf02ad619092632e2def80f12d4329` as the implementation identity.

## Next authorized step

**Phase 5 — equipment capacity is OPEN.** Begin with a bounded canonical-equipment authority audit and scope lock. Do not widen Phase 5 into timed manufacturing, Store seller offers, IPO, merge, staging, or production deployment.
