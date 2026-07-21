# Scarcity, Restock, and Difficulty Policy v1

Status: candidate design policy; simulation and backend implementation required

## Objective

Scarcity should make sourcing, substitution, inventory, and production decisions matter without making the simulation impossible.

Scarcity is:

- game-session scoped;
- server owned;
- country and item specific;
- affected by difficulty and active events;
- visible in player quotes;
- future facing;
- auditable and reversible through declared recovery events.

## Authoritative supply resolution

Candidate resolution order:

1. Load the session copy of the item supply definition.
2. Apply the current versioned difficulty profile.
3. Apply country production and import conditions.
4. Apply active event, route, sanction, shortage, and recovery effects.
5. Subtract committed sales and active reason-specific reservations.
6. Enforce safety-stock and scenario restrictions.
7. Assign the player-facing scarcity band.
8. Create a short-lived server-owned quote.

Conceptual formula:

`available supply = floor(base supply × difficulty supply × country condition × event supply) - committed stock - active reservations`

The final implementation must use bounded typed factors rather than arbitrary content expressions.

## Scarcity classes

Catalog classes:

| Class | Normal role | Expected behavior |
|---|---|---|
| low | routine common input | broad supply, frequent restock, strong recovery |
| moderate | standard production input | ordinary variation and regional sourcing |
| high | constrained or import-sensitive input | meaningful shortages and substitute demand |
| strategic | regulated, concentrated, or campaign-sensitive input | permits, small stock, explicit scenario controls |

## Player-facing bands

Candidate coverage bands use available supply divided by projected near-term demand:

| Band | Candidate coverage | Quote behavior |
|---|---:|---|
| abundant | at least 2.00 | normal availability; small downward pressure allowed |
| available | 1.25–1.99 | normal quote |
| tight | 0.75–1.24 | warning and substitute preview |
| scarce | 0.35–0.74 | purchase limits and material price pressure |
| critical | above 0 and below 0.35 | strict limits, recovery notice, substitution emphasis |
| unavailable | 0 | no purchase quote; show valid recovery paths |

Coverage thresholds are candidates for simulation, not approved production numbers.

## Difficulty link

Candidate session modifiers:

| Modifier | Easy | Moderate | Hard | Insane |
|---|---:|---:|---:|---:|
| initial and restock supply | 1.20 | 1.00 | 0.85 | 0.70 |
| restock interval | 0.85 | 1.00 | 1.15 | 1.35 |
| scarcity-price sensitivity | 0.80 | 1.00 | 1.15 | 1.35 |
| safety-stock target | 1.25 | 1.00 | 0.90 | 0.80 |

These factors operate alongside recipe ingredient and duration resolution. They must be displayed as policy, not hidden multipliers.

## Price-pressure boundary

Candidate band adjustments before difficulty sensitivity:

- abundant: -0.05;
- available: 0;
- tight: +0.08;
- scarce: +0.18;
- critical: +0.30;
- unavailable: no quote.

The server applies the current scarcity-price sensitivity and clamps the result within approved Store pricing guardrails. Difficulty is never allowed to produce a zero or negative price.

Every quote records:

- base price and source currency;
- player settlement currency;
- exchange-rate snapshot;
- current scarcity band;
- largest active supply modifier;
- difficulty policy version;
- substitute options;
- expected restock or recovery information;
- quote expiration.

## Safety floors

The following rules are mandatory:

- Tier I recovery recipes retain at least one accessible acquisition path.
- No required introductory item may be unavailable in every country simultaneously.
- A player can obtain a needed core input through at least one of Store stock, Contract reward, substitute, salvage, or alternate-country sourcing.
- Strategic items may become unavailable, but core progression may not depend on one without a fallback.
- Existing inventory and accepted crafting quotes are not confiscated by a later shortage.
- Active crafting jobs retain their accepted ingredient and duration snapshot.
- Restock, price, and event changes affect future quotes only.
- Admin supply adjustments are audited and game scoped.
- Late-joining and low-participation players retain a bounded recovery route.

## Restock lifecycle

Target restock states:

`SCHEDULED -> ELIGIBLE -> APPLIED`

Additional outcomes:

- `PAUSED_BY_EVENT`;
- `PARTIALLY_APPLIED`;
- `CANCELLED`;
- `SUPERSEDED`;
- `ROLLED_BACK`.

A restock application must be idempotent. Retrying the same restock cannot issue stock twice.

## Event integration

Events may affect:

- producing-country output;
- import availability;
- route capacity;
- restock interval;
- safety stock;
- permit requirements;
- substitute eligibility;
- recovery timing.

Events must not directly mutate player-owned inventory. Severe events require a declared end, decay, or recovery event.

## Simulation acceptance

Before values are approved, test all four difficulties across all ten countries for:

- stockout frequency;
- time to first Tier I craft;
- substitute usage;
- median recipe completion;
- country acquisition-time divergence;
- price-pressure duration;
- strategic-material concentration;
- late-player recovery;
- event overlap;
- reservation contention;
- craft-and-resell arbitrage;
- salvage-and-recraft loops.
