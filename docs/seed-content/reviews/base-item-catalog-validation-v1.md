# Base Item Catalog Validation v1

Status: generated structural review  
Catalog version: `1.0.0-draft`

## Result

- expected records: 144;
- actual records: 144;
- unique item keys: 144;
- duplicate item keys: 0;
- records with tangible uses or finite unlocks: 144;
- class catalogs with explicit difficulty policy: 5 of 5;
- class catalogs with explicit scarcity or availability policy: 5 of 5;
- numeric prices approved: no;
- executable recipes approved: no;
- production import approved: no.

## Class counts

| Class | Count |
|---|---:|
| Materials | 42 |
| Components | 30 |
| Equipment | 30 |
| Consumables | 24 |
| Blueprints and authorizations | 18 |
| **Total** | **144** |

## Primary-source distribution

| Source | Count |
|---|---:|
| Dravenlok | 14 |
| Eldoran | 13 |
| Global | 8 |
| Lumenor | 14 |
| Northreach | 13 |
| Solvend | 13 |
| Syndalis | 13 |
| Thaloris | 13 |
| Valerion | 14 |
| Xalvoria | 15 |
| Yrethia | 14 |

The `global` records are workshop permits, commercial licenses, emergency authorizations, and cross-border credentials. Their runtime issuer and settlement currency must be selected by the active game session or issuing institution.

## Structural findings

- Materials use `elastic_common` or `fixed_strategic` difficulty classes.
- Components use `fixed_identity`; recipe difficulty must not multiply identity-defining parts.
- Equipment effects are concrete action or information capabilities, not generic percentage boosts.
- Equipment effect power remains fixed across difficulty presets.
- Consumables use bounded one-unit effects and do not directly generate unrestricted cash.
- Blueprints and authorizations are non-stackable entitlements and are not consumed by recipes.
- Every country has a defined production specialization and cross-country dependency.
- No record uses ECO as its authoring currency.

## Required follow-up validation

The next content tranche must create the recipe graph and prove:

- every material and component reaches its minimum planned demand;
- no recipe references an undefined item key;
- every equipment item has at least one build, repair, and salvage mapping;
- every consumable has a build or controlled acquisition path;
- every Tier I path remains viable on Hard and Insane;
- every strategic shortage has an alternate sourcing, substitution, Contract, or recovery path;
- no country is self-sufficient across all equipment families;
- no craft-and-sell or craft-and-salvage loop creates guaranteed value.

## Validation limits

This review proves catalog structure and record counts only.

It does not prove:

- price balance;
- country affordability;
- recipe feasibility;
- output value;
- salvage balance;
- marketplace margins;
- supply sufficiency;
- difficulty fairness;
- war-scenario resilience;
- backend compatibility;
- import idempotency;
- runtime effect correctness.

Those require recipe authoring, backend implementation, deterministic simulation, and staging rehearsal.
