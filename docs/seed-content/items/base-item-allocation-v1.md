# Base Item Allocation and Expansion Plan v1

Status: draft content architecture  
Supersedes: the 30–40 product quantity target in `09-store-inventory-banking-progression-framework.md`  
New target: 144 physical-economy definitions plus a separate, smaller services catalog

## Allocation

| Class | Count | Share | Primary role |
|---|---:|---:|---|
| Materials | 42 | 29.2% | Resource supply, crafting inputs, Contracts, trade, and scarcity. |
| Components | 30 | 20.8% | Intermediate production and equipment identity. |
| Equipment | 30 | 20.8% | Persistent tangible player capabilities. |
| Consumables | 24 | 16.7% | Repair, charges, calibration, logistics, data, and crisis sinks. |
| Blueprints and authorizations | 18 | 12.5% | Controlled recipe, workshop, commercial, and regulated access. |
| **Total** | **144** | **100%** | Physical economy foundation. |

Classroom benefits, report services, extensions, cosmetics, and optional access products remain valid but move to a separate auxiliary catalog. They are not counted among these 144 physical definitions.

## Country production identities

| Country | Production identity | Representative inputs and outputs |
|---|---|---|
| Northreach | precision sensors and cold-environment engineering | rare-earth concentrate, cryogenic processors, precision survey and assay equipment |
| Yrethia | maritime logistics and cargo integrity | marine resins, navigation processors, route consoles and cargo monitors |
| Thaloris | portable power and thermal systems | lithium salt, energy cells, load analyzers and thermal rigs |
| Solvend | advanced research and long-distance navigation | research substrates, instrument cores, research terminals and orbital consoles |
| Eldoran | secure financial, identity, and contract systems | ledger substrates, encrypted chips, market and currency terminals |
| Valerion | water, environmental, and infrastructure resilience | membranes, environmental sensors, water analyzers and monitoring stations |
| Lumenor | translation, public information, and evidence workflows | display films, translation processors, field kits and sentiment analyzers |
| Xalvoria | machine tooling, fabrication, storage, and construction | steel billets, control modules, fabricators and warehouse systems |
| Dravenlok | heavy industry, maintenance, and structural systems | alloy, motors, maintenance rigs and structural scanners |
| Syndalis | secure communications, signal processing, and verification | signal silicon, encryption modules, receivers and verification terminals |

The catalog intentionally includes cross-country inputs. No country should be fully self-sufficient.

## Item graph requirements

Each material or component must satisfy one of the following before staging:

1. used by at least two recipes and one non-recipe system;
2. used by one high-value recipe, one Contract family, and one repair or salvage path;
3. classified as scenario-specific with a bounded event and explicit retirement behavior.

Each equipment item must support at least two meaningful decisions:

- equip versus sell;
- operate versus preserve charges;
- repair versus replace;
- use personally versus deliver under Contract;
- install in a business versus retain in player inventory;
- upgrade versus salvage.

Each consumable must replenish or execute a concrete bounded resource. Generic percentage boosters are prohibited.

## Difficulty resolution

### Material classes

- `elastic_common`: quantity may scale within authored integer bounds.
- `elastic_energy`: energy requirements may scale more strongly than identity components.
- `fixed_identity`: the quantity does not change because it defines the output.
- `fixed_strategic`: quantity remains fixed; difficulty acts through availability, sourcing, time, or price.
- `never_consumed`: blueprint, permit, license, or persistent entitlement.

### Session policy

Candidate dimensions, pending simulation:

| Dimension | Easy | Moderate | Hard | Insane |
|---|---:|---:|---:|---:|
| base supply | 1.20 | 1.00 | 0.85 | 0.70 |
| restock interval | 0.85 | 1.00 | 1.15 | 1.35 |
| scarcity sensitivity | 0.80 | 1.00 | 1.15 | 1.35 |
| elastic common input burden | 0.90 | 1.00 | 1.10 | 1.20 |
| crafting time | 0.85 | 1.00 | 1.15 | 1.35 |
| energy and maintenance | 0.90 | 1.00 | 1.15 | 1.30 |
| salvage ceiling | 0.70 | 0.60 | 0.50 | 0.40 |

These are test inputs, not approved production values.

## Scarcity safety

- Core Tier I materials always retain a recovery path.
- Every required introductory output has at least one substitute recipe or Contract acquisition path.
- Strategic materials may become temporarily unavailable, but existing reservations remain valid.
- Active crafting jobs keep their original recipe and difficulty snapshot.
- Restocks and event changes affect future quotes and jobs only.
- Difficulty does not change equipment effect power.
- Hidden random crafting failure is prohibited.
- Hard and Insane must increase pressure without producing impossible country starts.

## Backend sequence

1. Finish and merge backend reconciliation PR #158.
2. Re-audit the merged capability manifest and inventory-redemption contract.
3. Add item-definition, difficulty-profile, and country-supply foundations.
4. Add session supply, restock, scarcity bands, and stock history.
5. Add reason-specific inventory reservations.
6. Add recipe definitions, quotes, jobs, deterministic completion, cancellation, and claim.
7. Add unique equipment instances, loadouts, charges, condition, maintenance, and salvage.
8. Connect Admin difficulty, supply, recipe, and fulfillment surfaces.
9. Connect Player Store, Inventory, Crafting, Equipment, and Marketplace surfaces.
10. Import the bounded active item and recipe pack into isolated staging.
11. Execute economy, concurrency, authorization, and rollback simulations.
12. Approve production activation only after all gates pass.

## Recipe expansion target

The 144-item catalog is designed to support a later first-wave recipe set of approximately 60 recipes:

- 18 Tier I;
- 24 Tier II;
- 12 Tier III;
- 6 regulated or scenario recipes.

Recipe files must reference catalog item keys. They may not invent ingredients outside this catalog without a catalog revision.

## Implementation boundary

This file changes the content target only. It does not authorize:

- backend migrations;
- Supabase deployment;
- Store activation;
- inventory writes;
- crafting jobs;
- equipment effects;
- numeric prices;
- recipe quantities;
- production import.
