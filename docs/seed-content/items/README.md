# Econovaria Base Item and Recipe Catalog v1

Status: definition-only design catalog; recipe graph structurally validated  
Branch: `agent/seed-content-foundation-v1`  
Pull request: draft PR #163  
Catalog version: `1.1.0-draft`  
Runtime status: blocked until the merged backend supports supply, crafting, equipment instances, maintenance, salvage, and effect execution

## Purpose

This directory establishes the first production-shaped physical economy for Econovaria.

The item catalog contains exactly **144 base item definitions**:

- 42 materials;
- 30 specialized components;
- 30 equipment items;
- 24 consumables;
- 18 blueprints, permits, licenses, and credentials.

The recipe graph contains exactly **60 deterministic recipes**:

- 18 Tier I recovery and entry-consumable recipes;
- 24 Tier II specialized-consumable and standard-equipment recipes;
- 12 Tier III advanced-equipment recipes;
- 6 regulated strategic-component recipes.

These records are reusable content definitions. They do not create live Store rows, player holdings, equipment instances, crafting jobs, prices, stock, or effects.

## Design objective

The physical economy should connect:

`country supply -> Store, Contracts, and Marketplace -> Inventory -> Crafting -> Equipment, consumables, and deliveries -> Maintenance, trade, salvage, and crisis use`

Every item must provide tangible player value through at least one supported destination:

- a recipe input;
- a Contract or institutional delivery;
- an equipment capability;
- a repair, charge, calibration, or maintenance action;
- a Marketplace or business good;
- a crisis or reconstruction use;
- an upgrade or salvage path.

No item is accepted solely because it sounds valuable.

## Item catalog files

| File | Count | Purpose |
|---|---:|---|
| `catalog-manifest-v1.json` | 144 | Catalog totals, file registry, source distribution, and validation summary. |
| `catalog/materials-v1.json` | 42 | Raw, refined, common, strategic, and country-specialized production inputs. |
| `catalog/components-v1.json` | 30 | Intermediate modules used by equipment, repair, regulated fabrication, and delivery recipes. |
| `catalog/equipment-v1.json` | 30 | Persistent unique-instance tools with concrete effects and equipment slots. |
| `catalog/consumables-v1.json` | 24 | Bounded repair, charge, calibration, logistics, data, and crisis supplies. |
| `catalog/blueprints-authorizations-v1.json` | 18 | Recipe blueprints, workshop permits, regulated licenses, and supplier credentials. |
| `base-item-allocation-v1.md` | n/a | Allocation rationale, country roles, difficulty policy, and implementation boundaries. |

## Recipe graph files

Directory: `recipes/`

| File | Count | Purpose |
|---|---:|---|
| `recipes/README.md` | n/a | Recipe contract, lifecycle, reservation boundary, and staging restrictions. |
| `recipes/recipe-manifest-v1.json` | 60 | Recipe allocation, output coverage, and graph invariants. |
| `recipes/tier-1-recipes-v1.json` | 18 | Accessible recovery, maintenance, repair, energy, water, logistics, and documentation supplies. |
| `recipes/tier-2-recipes-v1.json` | 24 | Specialized consumables and standard equipment. |
| `recipes/tier-3-recipes-v1.json` | 12 | Advanced analytical, industrial, environmental, and secure equipment. |
| `recipes/regulated-recipes-v1.json` | 6 | Permit-gated strategic component fabrication. |
| `recipes/difficulty-policy-v1.json` | policy | Canonical difficulty scaling and `standard` to `moderate` legacy alias. |
| `recipes/difficulty-resolved-matrix-v1.json` | 60 | Exact candidate ingredient quantities and durations at all four presets. |
| `recipes/substitution-groups-v1.json` | 12 | Approved substitutes, conversion ratios, duration effects, and permit requirements. |
| `recipes/equipment-maintenance-salvage-v1.json` | 30 | Operating resources, repair profiles, and bounded destructive salvage mappings. |
| `recipes/item-demand-matrix-v1.json` | 144 | Recipe, repair, operation, salvage, trade, delivery, and entitlement demand for every item. |
| `recipes/scarcity-restock-policy-v1.md` | policy | Session supply, scarcity bands, difficulty, restock, quotes, and recovery paths. |

Review evidence:

- `../reviews/base-item-catalog-validation-v1.md`;
- `../reviews/recipe-graph-validation-v1.md`.

## Difficulty rule

Difficulty is a versioned game-session policy.

Canonical authored presets:

- easy;
- moderate;
- hard;
- insane.

Legacy `standard` is read as `moderate`; new authored records do not write `standard`.

Difficulty may affect:

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
- change recipe output quantity;
- introduce hidden random crafting failure;
- rewrite accepted quotes or active crafting jobs;
- remove the core Tier I recovery path;
- create country-specific impossible states.

The difficulty resolver changes only ingredients explicitly authored as `elastic_common` or `elastic_energy`. Fixed identity and strategic inputs remain unchanged.

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

Existing inventory, accepted quotes, and active jobs are not rewritten or confiscated by later supply events.

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

Numeric prices are intentionally absent until economic simulation validates affordability, country divergence, scarcity pressure, crafting margins, salvage value, and currency conversion.

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

Until then, every item and recipe remains `definition-only`.

## Current structural status

The item catalog has passed structural review for:

- 144 unique item keys;
- canonical country sourcing and currencies;
- concrete equipment effects;
- bounded consumable effects;
- finite entitlement unlocks.

The recipe graph has passed structural review for:

- 60 unique recipe keys;
- complete item and entitlement reference resolution;
- one primary recipe for every equipment and consumable item;
- demand for all 42 materials and all 30 components;
- maintenance and salvage mappings for every equipment item;
- demand channels for all 144 item definitions;
- complete four-preset difficulty resolution;
- zero hidden random failure recipes;
- zero authored ownership UUIDs.

## Remaining approval gates

The catalog is not economically or technically production-ready until:

- item and material prices are simulated;
- country starting supply and restock values are calibrated;
- crafting margins and Marketplace fees are tested;
- craft-and-resell and salvage-and-recraft arbitrage are eliminated;
- backend schemas and RPCs are implemented after reconciliation;
- authorization, RLS, isolation, idempotency, and replay tests pass;
- Admin and Player Terminal integration passes in isolated staging;
- importer, repeated import, rollback, and content retirement are verified.

No production price, migration, deployment, import, or runtime activation is authorized by this catalog.
