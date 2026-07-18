# ADR-002: Market Universe Scale

Status: accepted for seeded-content authoring  
Runtime implementation: pending  
Production authorization: false

## Context

The original foundation documents proposed approximately 30 listed companies, 10 national indexes, and a small commodity catalog.

That quantity is sufficient for a demonstration watchlist but not for the intended long-term Econovaria economy, which must support:

- ten differentiated national markets;
- equities and fixed income;
- sector and country diversification;
- multiple game-session market selections;
- company and issuer substitution;
- broad and specialized indexes;
- country-specific commodities and benchmarks;
- varied classroom assignments and campaign restarts;
- later scenario expansion without inventing assets at runtime.

## Decision

The authoritative long-term market-content target is **3,200 fictional instrument definitions**.

The catalog is allocated evenly at **320 instruments per country** across all ten countries.

Per country:

- 150 common equities;
- 10 preferred or convertible equities;
- 60 corporate bonds;
- 35 sovereign or public-agency bonds;
- 20 exchange-traded funds;
- 15 listed property or infrastructure trusts;
- 15 indexes;
- 15 commodity or sector reference benchmarks.

## Superseded targets

This decision supersedes the approximate 30-company and 10-index quantity targets in:

- `08-company-market-and-commodity-framework.md`;
- `12-production-roadmap-and-definition-of-done.md`.

Those smaller quantities remain useful only as a **pilot activation subset**, not as the total content-universe target.

## Active-session boundary

The 3,200 records form a reusable content library.

A normal game session should activate a bounded subset rather than exposing all assets simultaneously.

Recommended first staging range:

- 20–40 active instruments per country;
- 200–400 instruments across the ten-country session;
- a deliberate mix of equities, bonds, funds, indexes, and reference benchmarks;
- only instrument classes supported by the authoritative market capability.

The active subset may vary by scenario, difficulty, story arc, classroom objective, and performance constraints.

## Runtime rules

The content universe does not itself establish:

- prices;
- financial statements;
- shares outstanding;
- coupons or yields;
- maturity dates;
- index constituents or weights;
- fund holdings;
- order-book liquidity;
- tradability;
- market hours;
- corporate actions;
- game-session ownership.

Those values and states must be produced by reviewed runtime or scenario systems.

## Validation requirements

Before staging:

1. All IDs, symbols, names, countries, currencies, types, and issuer references must be unique and valid.
2. Instrument types must map to explicit backend capabilities.
3. Indexes and reference benchmarks must remain non-tradable unless a supported product references them.
4. A bounded active subset must receive complete financial and event-exposure profiles.
5. Market, economy, UI, pagination, search, and classroom-usability tests must pass.
6. Seed operations must be idempotent and reversible.
7. Generated names must complete editorial, representation, and real-world resemblance review.

## Consequences

Positive:

- the world can support broad national markets;
- market content can vary across sessions;
- fixed income and benchmark analysis become first-class content domains;
- country identity can be represented through sector depth rather than three companies;
- later scenarios can draw from an existing library.

Costs and risks:

- large editorial-review burden;
- greater schema, pagination, search, and performance requirements;
- more complex event and valuation calibration;
- risk of repetitive generated names;
- risk of overwhelming players if activation is not bounded;
- substantially larger staging and simulation workload.

## Related files

- `markets/README.md`;
- `markets/instrument-universe-allocation-v1.md`;
- `markets/instrument-schema-v1.md`;
- `markets/universe/manifest-v1.json`;
- `reviews/market-universe-validation-v1.md`.
