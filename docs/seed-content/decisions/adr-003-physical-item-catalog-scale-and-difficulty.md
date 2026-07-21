# ADR-003: Physical Item Catalog Scale and Difficulty Integration

Status: accepted for content design; runtime implementation not authorized  
Date: 2026-07-18  
Decision owner: Econovaria seeded-content program

## Context

The original Store framework proposed approximately 30–40 products, weighted toward classroom benefits, reports, cosmetics, and access items.

Subsequent Player Terminal review established that Econovaria already presents broader product concepts:

- materials;
- components;
- equipment;
- consumables;
- workshop access;
- crafting recipes;
- production queues;
- marketplace listings;
- business production;
- equipment finance.

A service-heavy Store would not provide sufficient tangible value to Inventory, Crafting, Marketplace, Business, country trade, scarcity events, or the immigrant-war campaign.

Difficulty also needs to affect more than prices. It must influence the physical economy without changing equipment effect power or creating impossible states.

## Decision

The first physical-economy catalog target is exactly **144 base item definitions**:

- 42 materials;
- 30 components;
- 30 equipment items;
- 24 consumables;
- 18 blueprints, permits, licenses, and credentials.

This target supersedes the 30–40-product quantity target in `09-store-inventory-banking-progression-framework.md`.

Classroom benefits, economic reports, cosmetics, extensions, and optional access products remain a separate auxiliary catalog and do not count toward the 144 physical items.

## Tangible-value rule

Every physical item must do at least one of the following:

- participate in multiple recipes;
- fulfill a Contract or institutional delivery;
- enable a concrete interface, information, storage, production, repair, or logistics capability;
- restore equipment condition or charges;
- provide a marketplace or business good;
- support a crisis, reconstruction, or humanitarian action;
- act as an upgrade, substitution, or salvage input.

Generic invisible percentage bonuses are prohibited.

## Difficulty decision

Difficulty is a versioned game-session policy.

It may change:

- base supply;
- restock amount and interval;
- scarcity-price sensitivity;
- elastic common-material requirements;
- energy and maintenance requirements;
- crafting duration;
- salvage recovery ceilings;
- shortage-event duration.

It may not change:

- equipment effect power;
- identity-defining component quantities;
- active crafting-job requirements;
- fulfilled transactions;
- the existence of the core Tier I recovery path.

Hidden random crafting failure is not part of the first implementation.

## Recipe-scaling classes

- `elastic_common`: bounded integer quantity may change by difficulty.
- `elastic_energy`: energy burden may change by difficulty.
- `fixed_identity`: quantity defines the output and remains fixed.
- `fixed_strategic`: quantity remains fixed; difficulty changes availability, sourcing, time, or price.
- `never_consumed`: authorization or entitlement.

## Scarcity decision

Scarcity is authoritative session state, not static item copy.

Player-facing bands are:

- abundant;
- available;
- tight;
- scarce;
- critical;
- unavailable.

Core items require a recovery path through one or more of:

- restock;
- substitution;
- Contract acquisition;
- salvage;
- alternate country sourcing;
- instructor-authorized emergency supply.

## Currency decision

Physical items and crafting use the ten official country currencies only:

- NRC;
- YRC;
- THD;
- SLV;
- ELD;
- VAL;
- LUM;
- XAL;
- DRV;
- SYN.

No new item or crafting settlement is denominated in ECO.

Numeric prices remain unapproved until simulation.

## Backend consequence

The current authenticated inventory read is insufficient to activate this catalog.

Required backend capabilities include:

- reusable item and recipe definitions;
- session copies;
- country supply and restock;
- scarcity history;
- reason-specific inventory reservations;
- crafting quotes and jobs;
- deterministic completion and claim;
- unique equipment instances;
- loadouts, charges, condition, repair, maintenance, and salvage;
- allowlisted effect handlers;
- capability-manifest gating;
- idempotency, concurrency, audit, correction, and rollback.

These capabilities must be implemented after backend reconciliation PR #158 merges and is re-audited. They must not be inserted into PR #158 in a way that expands or destabilizes its current reconciliation scope.

## Consequences

Positive:

- Inventory and Crafting receive real economic purpose.
- Countries gain concrete production identities and dependencies.
- Scarcity and war events affect goods players actually need.
- Equipment creates strategic specialization.
- Consumables and maintenance create recurring voluntary sinks.
- Marketplace and Business systems can reuse the same item graph.

Costs:

- significantly larger content and validation surface;
- new equipment-instance and reservation persistence;
- more demanding simulation and anti-arbitrage review;
- additional Admin supply and recipe controls;
- larger staging and migration program.

## Rejected alternatives

### Keep the 30–40 service-heavy Store

Rejected because it leaves materials, equipment, crafting, maintenance, and marketplace systems largely decorative.

### Apply one difficulty multiplier to every recipe ingredient

Rejected because integer rounding can double identity components and make recipes incoherent.

### Increase difficulty by adding random crafting failure

Rejected because hidden failure is difficult to explain, audit, balance, and operate in a classroom setting.

### Make every country self-sufficient

Rejected because it removes trade, currency, logistics, substitution, and geopolitical value.

## Verification

The first catalog contains 144 unique item keys across five machine-readable class files. Structural validation is recorded in `reviews/base-item-catalog-validation-v1.md`.

No runtime activation, migration, price, recipe quantity, or production seed import is approved by this ADR.
