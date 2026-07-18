# Econovaria Recipe Graph v1

Status: definition-only design catalog  
Branch: `agent/seed-content-foundation-v1`  
Pull request: draft PR #163  
Runtime status: blocked until backend reconciliation, recipe persistence, inventory reservations, crafting jobs, equipment instances, and effect execution are implemented

## Purpose

This directory converts the 144-item physical-economy catalog into a bounded production graph.

The first recipe graph contains exactly **60 deterministic recipes**:

- 18 Tier I recovery and entry-consumable recipes;
- 24 Tier II specialized-consumable and standard-equipment recipes;
- 12 Tier III advanced-equipment recipes;
- 6 regulated strategic-component recipes.

The graph provides one primary recipe for all 24 consumables and all 30 equipment items. Six strategic components gain regulated fabrication paths. The remaining components are supplier, Store, Contract, Marketplace, salvage, or business-production inputs until later processing recipes are approved.

## Files

| File | Records | Purpose |
|---|---:|---|
| `recipe-manifest-v1.json` | 60 summary | File registry and graph-level invariants. |
| `tier-1-recipes-v1.json` | 18 | Entry consumables, maintenance, repair, documentation, energy, and recovery supplies. |
| `tier-2-recipes-v1.json` | 24 | Six specialized consumables and eighteen standard equipment recipes. |
| `tier-3-recipes-v1.json` | 12 | Advanced analytical, infrastructure, industrial, and secure equipment. |
| `regulated-recipes-v1.json` | 6 | Strategic component fabrication requiring Tier III and explicit permits. |
| `difficulty-policy-v1.json` | policy | Canonical difficulty resolution and legacy `standard` alias handling. |
| `difficulty-resolved-matrix-v1.json` | 60 | Exact candidate ingredient quantities and durations at all four presets. |
| `substitution-groups-v1.json` | 12 groups | Approved material substitutes, ratios, duration effects, and permit requirements. |
| `equipment-maintenance-salvage-v1.json` | 30 equipment | Operating resources, repair profiles, and bounded salvage candidates. |
| `item-demand-matrix-v1.json` | 144 items | Recipe and non-recipe demand channels for every base item. |
| `scarcity-restock-policy-v1.md` | policy | Session supply, scarcity bands, restock, quote, and recovery rules. |

## Recipe contract

Every recipe defines:

- stable recipe key;
- workshop tier;
- category;
- deterministic output;
- base duration;
- difficulty-duration profile;
- required blueprints and permits;
- ingredients with explicit scaling classes;
- optional approved substitution groups;
- status and activation boundary.

The supported scaling classes are:

- `fixed_identity`: an identity-defining component that never scales;
- `fixed_strategic`: a strategic input that never scales;
- `elastic_common`: a common material quantity that may change with difficulty;
- `elastic_energy`: an operating-energy quantity that may change with difficulty.

Output quantities, equipment effect power, blueprint requirements, and identity-defining components never scale with difficulty.

## Difficulty behavior

Difficulty is resolved when the backend creates a crafting quote.

The accepted quote must record:

- game-session difficulty profile and version;
- resolved ingredient quantities;
- selected substitutions;
- resolved duration;
- Store or inventory source references;
- quote expiration;
- server-generated price and currency breakdown;
- resulting reservation plan.

Starting the job converts the quote into authoritative reservations. Later difficulty changes do not rewrite the quote or active job.

## Crafting lifecycle

Target lifecycle:

`AVAILABLE -> QUOTED -> RESERVED -> QUEUED -> IN_PROGRESS -> COMPLETED -> CLAIMED`

Additional outcomes:

- `QUOTE_EXPIRED`;
- `CANCELLED`;
- `FAILED_BEFORE_COMMIT`;
- `ADMIN_REVERSED` where an audited rollback contract permits it.

There is no hidden crafting failure roll. A valid committed job produces its declared output exactly once.

## Reservation boundary

A crafting job must reserve every ingredient before entering the queue.

The browser never:

- decrements inventory;
- creates equipment instances;
- chooses trusted player or game ownership;
- supplies final ingredient quantities;
- supplies final prices;
- completes its own job.

Reservations must remain reason-specific so crafting, redemption, Marketplace, Contract delivery, repair, and salvage cannot spend the same quantity.

## Staging boundary

No file in this directory is executable seed data.

Before staging activation:

1. PR #158 or its successor must merge and its capability and redemption contracts must be re-audited.
2. Item, recipe, supply, difficulty, crafting, and equipment schemas must be approved.
3. A deterministic importer, validation command, rollback contract, and idempotent re-import path must exist.
4. Economic simulation must validate supply, acquisition time, crafting margins, salvage, substitutions, country divergence, and difficulty recovery.
5. Admin and Player Terminal integration must pass end-to-end staging verification.
