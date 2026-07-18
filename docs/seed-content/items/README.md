# Econovaria Base Item Catalog v1

Status: definition-only design catalog  
Branch: `agent/seed-content-foundation-v1`  
Pull request: draft PR #163  
Catalog version: `1.0.0-draft`  
Runtime status: blocked until the merged backend supports supply, crafting, equipment instances, and effect execution

## Purpose

This directory establishes the first production-shaped physical-economy catalog for Econovaria.

The catalog expands the earlier 48-item planning target to exactly **144 base item definitions**:

- 42 materials;
- 30 specialized components;
- 30 equipment items;
- 24 consumables;
- 18 blueprints, permits, licenses, and credentials.

These records are reusable content definitions. They do not create live Store rows, player holdings, equipment instances, crafting jobs, prices, stock, or effects.

## Design objective

The physical economy should connect:

`country supply -> Store, Contracts, and Marketplace -> Inventory -> Crafting -> Equipment, consumables, and deliveries -> Maintenance, trade, salvage, and crisis use`

Every item must provide tangible player value through at least one supported destination:

- a recipe input;
- a Contract or institutional delivery;
- an equipment capability;
- a repair, charge, calibration, or maintenance action;
- a marketplace or business good;
- a crisis or reconstruction use;
- an upgrade or salvage path.

No item is accepted solely because it sounds valuable.

## Catalog files

| File | Count | Purpose |
|---|---:|---|
| `catalog-manifest-v1.json` | 144 | Catalog totals, file registry, source distribution, and validation summary. |
| `catalog/materials-v1.json` | 42 | Raw, refined, common, strategic, and country-specialized production inputs. |
| `catalog/components-v1.json` | 30 | Intermediate modules used by multiple equipment, repair, and delivery recipes. |
| `catalog/equipment-v1.json` | 30 | Persistent unique-instance tools with concrete effects and equipment slots. |
| `catalog/consumables-v1.json` | 24 | Bounded repair, charge, calibration, logistics, data, and crisis supplies. |
| `catalog/blueprints-authorizations-v1.json` | 18 | Recipe blueprints, workshop permits, regulated licenses, and supplier credentials. |
| `base-item-allocation-v1.md` | n/a | Allocation rationale, country roles, difficulty policy, and implementation boundaries. |

## Difficulty rule

Difficulty is a versioned game-session policy.

It may affect:

- starting supply;
- restock amount and interval;
- scarcity-price sensitivity;
- elastic common-material quantities;
- energy and maintenance consumption;
- crafting time;
- salvage recovery ceilings;
- shortage-event duration.

It must not:

- multiply identity-defining components;
- change equipment effect power;
- introduce hidden random crafting failure;
- rewrite active crafting jobs;
- remove the core Tier I recovery path;
- create country-specific impossible states.

Each item declares its own difficulty policy.

## Scarcity rule

All scarcity must be server-owned, session-scoped, and player-readable.

Approved player-facing bands:

- abundant;
- available;
- tight;
- scarce;
- critical;
- unavailable.

Core materials and introductory recipes require at least one recovery path through restock, substitution, Contract acquisition, salvage, or alternate sourcing.

## Currency rule

The catalog uses only the ten official country currencies:

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

No item or crafting settlement is denominated in ECO.

Numeric prices are intentionally absent until the economy simulation validates affordability, country divergence, scarcity pressure, crafting margins, salvage value, and currency conversion.

## Runtime boundaries

Before activation, the backend must provide:

- reusable item and recipe definition import;
- session-scoped supply and scarcity;
- holdings and reason-specific reservations;
- unique equipment instances;
- crafting quotes and jobs;
- deterministic output issuance;
- equipment loadouts;
- charges, condition, maintenance, and salvage;
- effect allowlisting;
- capability-manifest gating;
- audit, idempotency, concurrency, rollback, and staging verification.

Until then, every item remains `definition_only`.

## Acceptance criteria

The catalog advances to recipe authoring only when:

- all 144 stable IDs and item keys are unique;
- every material and component has multiple planned uses;
- every equipment item has a concrete effect code;
- every consumable has a bounded quantity-consumed effect;
- every authorization unlocks a named, finite capability set;
- difficulty and scarcity policies are explicit;
- no effect promises unsupported backend behavior;
- all country sourcing and currencies are canonical;
- no production price or runtime activation is implied.
