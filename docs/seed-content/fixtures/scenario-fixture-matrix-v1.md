# Scenario Fixture Matrix v1

Status: design candidate  
Fixture creation: not implemented  
Allowed environments: local, test, isolated staging  
Production authorization: false

## Purpose

Define deterministic scenarios required to validate the Econovaria seed pack, economic systems, narrative progression, and recovery behavior.

Fixtures are not reusable production definitions and must remain physically and logically separate from classroom and production content.

## Fixture requirements

Every fixture must declare:

- stable fixture ID;
- purpose;
- environment allowlist;
- deterministic reset key;
- random seed where applicable;
- prerequisite definitions;
- generated runtime records;
- expected counts;
- expected initial state;
- expected actions;
- expected outcomes;
- cleanup operation;
- prohibited environments;
- privacy and identity constraints.

Fixtures must never contain realistic Player IDs, Access Codes, credentials, live classroom identifiers, or production project references.

## Core fixture matrix

### 1. New immigrant — stable boom

- Fixture ID: `fixture.staging.arrival-stable-boom.v1`
- Purpose: validate ordinary arrival, first Contract, first income, and first market access
- Countries: all ten through parameterized variants
- Expected state: normal prices, normal employment, no active crisis
- Required checks: no duplicate starting grants; first-day actions are affordable; tutorial is completable

### 2. New immigrant — low starting liquidity

- Fixture ID: `fixture.staging.arrival-low-liquidity.v1`
- Purpose: test early hardship and recovery routes
- Expected state: minimum candidate starting cash, high housing pressure
- Required checks: emergency support and recovery Contract prevent permanent lockout

### 3. High inflation

- Fixture ID: `fixture.staging.macro-high-inflation.v1`
- Purpose: validate prices, wages, rates, household affordability, and news explanations
- Expected state: elevated food, housing, and transport costs
- Required checks: no silent retroactive fixed-rate changes; affordability warnings render correctly

### 4. Eldoran food shortage

- Fixture ID: `fixture.staging.eldoran-food-shortage.v1`
- Purpose: test harvest downgrade, reserve policy, food-market instruments, and recovery
- Expected state: lower supply, higher food benchmark, active policy choices
- Required checks: severe event has multiple responses and a recovery state

### 5. Sableport congestion

- Fixture ID: `fixture.staging.yrethia-port-congestion.v1`
- Purpose: test shipping delays, insurance pressure, freight rates, and alternate routes
- Expected state: lower capacity, higher logistics friction
- Required checks: Yrethia and Thaloris effects differ; routes and news use valid location IDs

### 6. Currency pressure

- Fixture ID: `fixture.staging.currency-pressure.v1`
- Purpose: test exchange rates, local prices, foreign-currency exposure, and Player copy
- Expected state: one selected country currency weakens within approved bounds
- Required checks: no cross-session leakage; conversion uses authoritative rates

### 7. Market correction

- Fixture ID: `fixture.staging.market-correction.v1`
- Purpose: validate equity losses, bond behavior, indexes, portfolio rendering, and risk explanations
- Expected state: broad but non-uniform market decline
- Required checks: no guaranteed hedge; holdings and totals remain arithmetically consistent

### 8. Suspended instrument

- Fixture ID: `fixture.staging.instrument-suspension.v1`
- Purpose: test market-state handling for one unavailable security
- Expected state: selected security suspended, positions preserved
- Required checks: trading disabled; holdings not deleted; Player and Admin copy agree

### 9. Bond maturity

- Fixture ID: `fixture.staging.bond-maturity.v1`
- Purpose: validate maturity, principal return, coupon completion, and idempotency
- Expected state: one candidate bond reaches maturity
- Required checks: principal and final coupon occur exactly once; repeated processing is a no-op

### 10. Loan delinquency and recovery

- Fixture ID: `fixture.staging.loan-delinquency.v1`
- Purpose: test missed payment, explanation, penalty control, and recovery plan
- Expected state: one due payment fails
- Required checks: no duplicate penalty; player receives an understandable recovery route

### 11. Redemption approval and rejection

- Fixture ID: `fixture.staging.inventory-redemption-lifecycle.v1`
- Purpose: validate reservation, review, approval, rejection, fulfillment, and cleanup
- Expected state: two requests using separate items
- Required checks: rejection releases once; fulfillment consumes once; transfer cannot double-spend reserved quantity

### 12. Meridian attack onset

- Fixture ID: `fixture.staging.meridian-attack-onset.v1`
- Purpose: validate escalation from boom into crisis and open-war state
- Expected state: attack with unresolved attribution, route disruption, market and residency pressure
- Required checks: uncertainty preserved; no country guilt is silently confirmed; multiple systems react

### 13. Wartime civilian economy

- Fixture ID: `fixture.staging.wartime-civilian-economy.v1`
- Purpose: test jobs, shortages, housing, strategic sectors, residency, relationships, and essential services
- Expected state: active war phase without player military command
- Required checks: at least three viable economic strategies remain available

### 14. Ceasefire and recovery

- Fixture ID: `fixture.staging.ceasefire-recovery.v1`
- Purpose: validate event decay, reopening, rebuilding, corrections, and reconstruction Contracts
- Expected state: war effects partially unwind with persistent consequences
- Required checks: recovery does not erase history; prices and access normalize gradually

### 15. Wealthy diversified player

- Fixture ID: `fixture.staging.wealthy-diversified-player.v1`
- Purpose: test large portfolio, multiple asset classes, high Store access, and progression rendering
- Expected state: diversified holdings without guaranteed profit
- Required checks: performance and pagination remain acceptable; no overflow or clipping

### 16. Insolvent player

- Fixture ID: `fixture.staging.insolvent-player.v1`
- Purpose: test zero or negative available liquidity, debt, missed opportunities, and recovery
- Expected state: no immediately available discretionary funds
- Required checks: player is not permanently trapped; essential recovery work is available

### 17. Empty and unavailable market

- Fixture ID: `fixture.staging.market-empty-unavailable.v1`
- Purpose: verify zero-result, backend-unavailable, and partially available states
- Expected state: no active instruments or failed market resource
- Required checks: no preview data appears as live; other routes remain usable

### 18. Duplicate pack import

- Fixture ID: `fixture.staging.import-replay.v1`
- Purpose: verify idempotent seed-pack replay
- Expected state: same pack and version applied twice
- Required checks: second apply is a no-op; no duplicate definitions or runtime state

### 19. Checksum conflict

- Fixture ID: `fixture.staging.import-checksum-conflict.v1`
- Purpose: verify immutable pack-version enforcement
- Expected state: content modified without version change
- Required checks: import rejected; existing content remains unchanged

### 20. Wrong environment

- Fixture ID: `fixture.staging.import-wrong-environment.v1`
- Purpose: verify environment restriction
- Expected state: staging-only pack directed at production identity
- Required checks: operation refused before writes; audit records the rejection without partial application

### 21. Class-system combinations — deferred

- Fixture ID: `fixture.staging.arrival-class-matrix.v1`
- Purpose: future test of every arrival class in every country
- Status: blocked by Workstream 11
- Expected scope: class × country × difficulty combinations
- Required checks: every combination viable; no dominant class; no duplicate starting grants

## Expected fixture coverage

The matrix must collectively cover:

- all ten countries;
- all supported currencies;
- every active instrument class;
- ordinary, adverse, crisis, and recovery phases;
- zero, normal, and high balances;
- empty and unavailable read states;
- success, rejection, expiry, cancellation, and retry paths;
- idempotent import and runtime actions;
- rollback and deactivation;
- Admin and Player rendering;
- class system after Workstream 11.

## Fixture isolation

Required safeguards:

- fixture IDs use the `fixture.` prefix;
- fixture player labels visibly identify test data;
- fixture creation requires explicit environment confirmation;
- production and ordinary classroom environments reject fixture manifests;
- cleanup does not delete reusable definitions or real runtime history;
- fixture reset keys are deterministic;
- fixture data is excluded from production exports and analytics.

## Immediate next actions

1. Convert these concepts into a machine-readable fixture manifest.
2. Map each fixture to required backend and frontend capabilities.
3. Define deterministic input values only after simulation input contracts exist.
4. Add expected database and API counts.
5. Implement local and isolated-staging cleanup operations.
6. Run each fixture during staging verification.
