# Business V2 Phase 4C — Production Labor and Deterministic Payroll Scope v1

**Status:** OPEN — implementation not yet complete  
**Branch:** `feat/business-workforce-production-labor-v2`  
**Parent branch:** `feat/business-workforce-hiring-v2`  
**Certified parent implementation:** `73bb4bfb4a6d7eca1f36e8fd6ef707ca5c797cdf`  
**Parent durable plan/log head:** `26778c4e2a90f32baef005b916f803d432b4a4d3`  

## Purpose

Phase 4C connects the certified workforce/payroll foundation to the existing production and cycle-settlement authorities without creating parallel money, inventory, recipe, employee, production, or payroll systems.

The governing rule remains:

> Players choose whether and how much to produce. Econovaria determines eligible labor, capacity, cost allocation, payroll obligations, settlement, and recovery.

## Current defects being replaced

1. Legacy production capacity is derived from a sum of `business_employees.productivity_index` rather than canonical recipe-role labor requirements and finite employee minutes.
2. Legacy production immediately debits `unit_labor_cost * quantity` as cash even though employed workers are also owed recurring payroll.
3. Legacy cycle settlement aggregates wages directly and hard-fails the whole cycle when Business cash cannot fund all wages.
4. Payroll evidence tables exist but are not yet the settlement authority.
5. Labor reservation authority exists but is not yet coupled to production.

## Required production-labor authority

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

## Required production-cost authority

- Remove the immediate synthetic production wage ledger debit.
- Do not reduce Business cash merely because labor was used in production.
- Calculate labor allocation from authoritative wage and capacity terms for managerial cost basis.
- Record input cost, allocated labor cost, and total production cost on the production run.
- Preserve real material cost basis and exact inventory settlement.
- Keep recurring payroll independent of production utilization.

## Required payroll authority

- Create one deterministic payroll run per Business and payroll period.
- Create one payroll entry per employee who was employed during the relevant period, including zero-production employees.
- Freeze wage due, employee linkage, country, currency, and source employment evidence.
- Lock the Business money authority before settlement.
- Settle through canonical ledger posting only.
- Prefer full payment when funded.
- When underfunded, allocate available cash deterministically and record `partially_paid` or `unpaid` instead of rolling back the entire cycle.
- Credit Player-linked employees through canonical Player Checking ledger authority.
- Preserve paid/unpaid evidence for system candidates without inventing a fake Player account.
- Matching retries must replay the existing run; conflicting reuse must fail closed.
- A later retry/recovery may settle remaining unpaid wages exactly once.

## Required read model

Expose public-key-only workforce operations data:

- payroll period key and generated timestamp;
- employee public key and role;
- labor minutes available, reserved, consumed, and idle;
- utilization basis points;
- latest payroll status, wage due, wage paid, and wage unpaid;
- aggregate Business payroll due/paid/unpaid;
- no internal UUIDs or trusted scope fields.

## Concurrency and idempotency tests

Phase 4C must prove:

- two production attempts cannot reserve the same remaining employee minutes;
- replaying a production idempotency key returns the original receipt without new reservations or inventory movement;
- conflicting production idempotency reuse is rejected;
- two payroll settlement attempts for the same Business/period create one run and one set of entries;
- partial-payment retry pays only the remaining unpaid amount;
- zero-production payroll still creates and settles payroll evidence;
- two games with the same public-looking business data remain isolated;
- production never creates a second payroll cash debit.

## Explicit exclusions

Phase 4C does not authorize:

- equipment requirements or equipment reservations;
- timed manufacturing, queues, workers, or browser-declared completion;
- Store seller offers or Store-listing inventory;
- automatic sales convergence;
- corporate equity, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secrets, or live data mutation.

## Completion evidence

Phase 4C remains **in progress** until all of the following are durable:

1. forward migration and runtime integration;
2. focused production-labor/payroll contracts;
3. database replay from zero twice and database lint;
4. backend and all Edge typechecks;
5. Business Economy, Business Banking, Workforce/Payroll, security, repository-quality, Player, and Chromium gates;
6. exact implementation source SHA;
7. execution-plan and execution-log certification with remaining blockers and next authorized step.
