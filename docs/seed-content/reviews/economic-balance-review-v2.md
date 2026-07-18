# Economic and Balance Review v2

Review status: changes still required
Supersedes for current status: `economic-balance-review-v1.md`
Scope reviewed: foundation plus compatibility matrix, classroom model, resolution model, interactions, and rubrics

## Executive finding

Iteration 2 materially improves implementation realism. The code-verified compatibility matrix confirms that country economic snapshots already support most macro concepts needed by the pilot and that ECO is used by authoritative stock trading as the player cash settlement currency. Numeric production seeding remains blocked because cross-system currency treatment, reward-price balance, company records, and country viability simulation are not complete.

## Findings resolved or reduced

### E-01: ECO role

Status: partially resolved

Current best canonical classification:

- ECO: global player cash, settlement, and accounting currency.
- NRC, YRC, THD, SLV, ELD, VAL, LUM, SYN, XAL, DRV: local country currencies used for country identity, economic snapshots, pricing, and conversion.

Remaining blocker:

Attendance, Contract payout, Store settlement, and ledger display must be audited to confirm one consistent conversion boundary.

### E-08: Unsupported macro concepts

Status: substantially reduced

The backend currently supports bounded session-scoped values for:

- growth;
- inflation;
- unemployment;
- interest rate;
- consumer and business confidence;
- cost of living;
- supply constraints;
- import dependency;
- exchange and currency stability;
- trade balance and export strength;
- market risk;
- political stability;
- infrastructure;
- energy security.

Concepts still lacking dedicated fields:

- strategic reserve quantity;
- water level;
- skilled vacancy count;
- port capacity;
- institution trust;
- narrative relationship.

These can drive supported deltas through authored events, but must not be displayed as direct mechanical meters unless modeled.

### E-06: Standard warning limit

Status: resolved at content-policy level

Standard profile:

- maximum two unresolved capacity warnings before the security event;
- one required action request per player at a time;
- one major global crisis at a time.

Staging must verify enforcement.

## Remaining blocking findings

### E2-01: Cross-system currency transaction model

Required:

- Attendance issuance currency and conversion timing;
- Contract reward issuance currency;
- Store authoring, display, and settlement currency;
- stock ECO account relationship;
- exchange-index formula and direction;
- precision and rounding;
- transaction snapshot recording;
- unavailable-index behavior.

### E2-02: Unified player-economy simulation

Still required:

- expected routine and substantial income;
- session or weekly income distribution;
- item acquisition times;
- store sink strength;
- savings yield;
- loan affordability;
- market risk contribution;
- difficulty effects;
- late, repeat, and group-reward behavior.

### E2-03: Market content not instantiated

Still required:

- first three pilot company files;
- exact stock-template schema mapping;
- financial arithmetic;
- event exposure;
- portfolio fixtures;
- national index decision.

### E2-04: Quantitative country viability simulation

Still required before starting values are approved.

### E2-05: Semantic-to-numeric event mapping

The catalog uses appropriate semantic classes. A reviewed conversion table is still required for every supported indicator and market shock.

### E2-06: Cumulative effect and recovery caps

Required:

- maximum total delta per period;
- maximum simultaneous major effects;
- decay schedule;
- baseline reversion policy;
- event overlap policy;
- instructor override limits.

## Additional findings

### E2-N01: Resolution conditions are economically defensible

Pass at conceptual level. Safety, participation, financing, physical readiness, governance, and safeguards are evaluated in a sensible order.

### E2-N02: Contract rubrics protect against ideology grading

Pass.

### E2-N03: Institution authority reduces unsupported policy effects

Pass at content level.

## Required next work

1. Audit Attendance, Contract payout, Store purchase, and ledger currency flows.
2. Create the unified player-economy model.
3. Create three pilot companies and map exact stock-template fields.
4. Create semantic-to-numeric event impact tables.
5. Create the country viability simulation specification and run initial scenarios.
6. Define cumulative impact and recovery caps.

## Approval gate

Numeric seed approval remains blocked by E2-01 through E2-05. Narrative and descriptive content may continue. No final prices, rewards, rates, starting stock values, or economic deltas should be marked approved.