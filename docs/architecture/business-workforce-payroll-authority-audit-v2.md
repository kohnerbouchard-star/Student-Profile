# Business V2 Workforce and Payroll Authority Audit

**Roadmap phase:** 4 — Workforce capacity and payroll  
**Checkpoint:** 4A — authority and schema foundation  
**Branch:** `feat/business-workforce-payroll-foundation-v2`  
**Release status:** draft only; unmerged; undeployed

## Purpose

This checkpoint establishes the data and authority boundaries required before the
current Business hiring, production-cost, and cycle-settlement paths can be
replaced safely. It is deliberately additive. It does not change Player-visible
hiring, production, payroll, or Business UX.

The design reuses the existing authoritative objects:

- `business_entities` for company identity;
- `business_employees` for employment identity;
- `physical_economy_recipe_definitions` for recipe identity;
- `business_production_runs` for production evidence;
- `ledger_entries` and Business ledger functions for money;
- the existing Player and game-session scopes.

It does not create a second company, employee, recipe, inventory, or balance
authority.

## Audit findings

### Players currently author economic employee outcomes

The current `businessHire` request accepts `role`, `wagePerCycle`, and
`productivityIndex`. The application layer forwards those values directly to
`hire_business_employee_v1`, which writes them into `business_employees`.

That boundary is unsuitable for the target simulation. A Player may choose from
server-generated candidates, but must not define the candidate's wage, labor
capacity, skill, role economics, or productivity multiplier.

### Labor is charged twice

The current production function computes:

`quantity × business_products.unit_labor_cost`

and debits that amount during each production run. The cycle settlement function
then sums every active employee's `wage_per_cycle` and posts another wage debit.

Those are two charges for the same labor system. Phase 4B must remove per-run
cash labor charging and make production consume reserved labor minutes instead.
Recurring payroll must remain due even when an employee is idle.

### Zero-sale cycles do not provide a payroll idempotency key

The current settlement replay evidence is stored in `business_sales`. When a
Business sells zero units, no sale row is created for that product. Payroll
therefore lacks a Business-and-period evidence row that exists independently of
sales.

Phase 4A introduces `business_payroll_runs` with a unique
`(game_session_id, business_id, payroll_period_key)` boundary. This is the
required idempotency authority even when revenue is zero.

### Labor has no finite reservation authority

An active employee currently has a scalar productivity value, but no explicit
availability budget, reservation journal, period allocation, or double-booking
guard. Multiple jobs can therefore assume the same employee is fully available.

Phase 4A introduces finite labor minutes on canonical candidate-backed employees
and a reservation journal. Reservation creation locks the employee row, totals
all capacity-consuming reservations for the period, and rejects allocations
above the employee's capacity.

### Distress persistence requires a later transactional correction

The current settlement path updates a Business to `distressed` and then raises
an exception when cash is insufficient. In ordinary PostgreSQL transaction
semantics, the exception can roll back the status update along with the failed
settlement.

Phase 4A records payroll states capable of representing unpaid and partially
paid obligations. Phase 4B must post that evidence and persist Business distress
without depending on a transaction that is subsequently aborted.

## Phase 4A authority model

### Role definitions

`business_workforce_role_definitions` is a trusted-service catalog. It contains
role identity, labor class, default capacity, and minimum skill. It intentionally
contains no wage or salary field; compensation belongs to a game-scoped
candidate offer.

No role values are seeded in this checkpoint. Role economics must be added
through reviewed content or administration, not guessed in a migration.

### Candidate offers

`business_workforce_candidates` is game-scoped and generated only through a
service-role function. It owns the offered wage, labor minutes per cycle, skill,
country, currency, availability window, and source evidence.

A source key and request hash make candidate generation idempotent. Browser
roles receive no table or function permission.

### Recipe labor requirements

`business_recipe_labor_requirements` attaches role requirements directly to
`physical_economy_recipe_definitions`. Each requirement supports:

- fixed setup minutes per production run;
- labor minutes per output unit;
- minimum headcount;
- minimum skill.

No Business-specific recipe table is created.

### Existing employee authority

The migration extends `business_employees`; it does not replace it. Existing
rows are marked `historical_v1` and remain readable. New canonical rows must
reference a candidate and role definition, carry finite labor minutes and skill,
and keep the old `productivity_index` fixed at `1`.

This prevents the old multiplier from becoming a second productivity authority
during the transition.

### Labor reservations

`business_labor_reservations` is the allocation journal. Capacity-consuming
states are `reserved`, `active`, and `consumed`. Released and cancelled rows no
longer consume capacity but remain as evidence.

`reserve_business_labor_v2`:

1. resolves the Business and employee inside one game;
2. locks the canonical employee row;
3. requires a candidate-backed employee and matching active role;
4. validates idempotency;
5. sums period reservations;
6. rejects any allocation above `labor_minutes_per_cycle`;
7. writes one public reservation record.

The function is service-role only. It does not create a Player endpoint.

### Payroll evidence

`business_payroll_runs` provides one Business-and-period payroll authority,
independent of sales. `business_payroll_entries` records each employee's due,
paid, and unpaid amounts and future ledger references.

The tables are evidence and state foundations only. Phase 4A does not post
payroll or change current settlement behavior.

## Security and isolation

All new tables:

- enable and force row-level security;
- revoke all privileges from `public`, `anon`, and `authenticated`;
- grant explicit access only to `service_role`;
- preserve game-scoped foreign keys for candidates, employees, Businesses,
  production runs, payroll, and Player recipients.

All new functions are `SECURITY DEFINER`, pin `search_path` to
`pg_catalog, public`, revoke browser execution, and grant execution only to
`service_role`.

## Explicitly deferred to Phase 4B

Phase 4 is not complete after this checkpoint. The following cutover remains
required:

1. Replace Player-authored role, wage, and productivity fields with selection of
   a server-generated candidate key.
2. Add the authoritative candidate-hire transaction that copies server-owned
   wage, role, capacity, and skill into `business_employees`.
3. Bind products to canonical recipes and calculate required labor from recipe
   requirements.
4. Reserve labor before production and consume or release reservations through
   the production lifecycle.
5. Remove per-run cash labor debits based on `unit_labor_cost`.
6. Materialize exactly one payroll run per Business and period, including
   zero-sale periods.
7. Post Business wage debits and linked employee credits through canonical
   ledger authority.
8. Persist unpaid payroll and distress without rolling back the state evidence.
9. Add bounded read models and Player UX only after the authority cutover is
   verified.

Equipment, timed manufacturing, Store seller offers, IPO, integration merge,
staging deployment, and production deployment remain outside Phase 4A.
