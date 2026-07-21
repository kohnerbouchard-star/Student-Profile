# Production Roadmap and Definition of Done

Status: active seed-data execution  
Primary execution program: `15-seed-data-execution-program-v1.md`  
Production authorization: false

## Objective

Move from documented concepts to a validated, machine-readable, idempotent, reversible, and staging-tested Econovaria seed pack.

The roadmap is ordered by dependency. Content may be drafted in parallel, but no domain becomes staging-ready until its reference, capability, simulation, and validation gates are complete.

## Tranche 1: Foundation and governance

Current state: substantially documented; review findings remain open.

Deliverables:

- catalog and program charter;
- canonical country and currency registry;
- world timeline and narrative architecture;
- economic, market, Contract, event, Store, banking, progression, location, tutorial, notification, and staging frameworks;
- ten country files and immigrant openings;
- stable-ID standard;
- domain reviews and blocker tracking.

Exit gate:

- official countries and currencies aligned with authoritative sources;
- stable-ID strategy defined;
- reusable definitions separated from runtime state;
- unsupported mechanics labeled;
- no code, schema, or production-data claims inside the documentation tranche.

## Tranche 2: Market-universe reconciliation

Current state: generated package exists; full repository ingestion and financial calibration remain incomplete.

Long-term target: **3,200 fictional instrument definitions**, exactly 320 per country.

Allocation:

- 1,500 common equities;
- 100 preferred or convertible equities;
- 600 corporate bonds;
- 350 sovereign or public-agency bonds;
- 200 exchange-traded funds;
- 150 listed trusts;
- 150 indexes;
- 150 commodity or sector reference benchmarks.

Deliverables:

- ten country JSONL files;
- authoritative manifest and checksums;
- deterministic generation metadata;
- editorial review queue;
- stable issuer references;
- instrument-class capability map;
- tradable versus reference-only status;
- bounded first active subset.

Exit gate:

- exactly 3,200 unique IDs, symbols, and names;
- exactly 320 records per country;
- all country, currency, exchange, issuer, sector, and type references valid;
- unsupported classes blocked;
- generated records clearly marked uncalibrated.

## Tranche 3: Market reference entities and calibration

Deliverables:

- ten exchange definitions;
- issuer master registry;
- issuer-type taxonomy;
- parent sectors and subindustries;
- commodity and benchmark registry;
- national-index methodologies;
- fund and trust holdings methodologies;
- active-equity financial profiles;
- bond terms and yield curves;
- event-exposure mappings;
- corporate-action support matrix;
- market fixtures.

Exit gate:

- active equities pass valuation arithmetic;
- active bonds have coherent terms, pricing, maturity, and recovery rules;
- indexes and funds have valid constituents and weights;
- no guaranteed-return or positive-carry exploit;
- all active values pass simulation and staging review.

## Tranche 4: Canonical geography and player arrival

Deliverables:

- 50–70 locations;
- verified map coordinates;
- country adjacency;
- maritime, rail, road, energy, and data routes;
- Meridian segment definitions;
- disruption and attack-site rules;
- capital versus centroid marker semantics;
- ten player arrival packages;
- starting housing, skills, credentials, contacts, messages, Contracts, tutorials, goals, and recovery routes.

Exit gate:

- every location and route reference resolves;
- map and text geography agree;
- Lumenor and Xalvoria profile conflicts are corrected in the appropriate runtime tranche;
- all ten starting packages are viable;
- starting grants are idempotent;
- starting values pass affordability simulation.

## Tranche 5: Contracts and player economy

Targets:

- approximately 50 Contracts;
- 10 Contract chains;
- 30–40 Store products;
- 8–12 banking products;
- 10 levels;
- approximately 20 achievements.

Deliverables:

- arrival, employment, entrepreneurship, market, public-service, crisis, war, and reconstruction Contract families;
- Store item effects and redemption lifecycle;
- banking terms, affordability, delinquency, default, and recovery;
- progression thresholds, unlocks, and achievement conditions;
- reward, price, rate, and acquisition-time calibration;
- deterministic fixtures.

Exit gate:

- rewards issue exactly once;
- item effects map to supported capabilities;
- inventory and redemption remain auditable;
- banking arithmetic passes;
- no opaque or irreversible player failure;
- progression is measurable and balanced.

## Tranche 6: Events, news, interactions, and campaign expansion

Targets:

- 25 standalone events;
- 10 event chains;
- 5 crisis arcs;
- 40–60 interactions;
- 15–20 mechanical decision points;
- 25–30 news templates.

Deliverables:

- prewar escalation;
- Meridian attack and disputed attribution;
- country-specific wartime civilian economy;
- housing, residency, employment, market, route, and public-trust effects;
- ceasefire and reconstruction;
- correction lineage;
- relationship consequences;
- separate personal and world endings;
- recovery content for every severe event family.

Exit gate:

- triggers are evaluable;
- immediate and delayed effects are distinct;
- effects apply once;
- choices are mechanically different;
- severe events remain recoverable;
- uncertain claims use correct fact status;
- no player-private state leaks through news or interactions.

## Tranche 7: Tutorials, notifications, search, and accessibility

Targets:

- 10–12 tutorials;
- 25–30 notification templates;
- canonical glossary and search metadata.

Deliverables:

- login and identity;
- dashboard;
- country and currency;
- Contracts;
- Store and inventory;
- banking;
- equities, bonds, funds, indexes, and benchmarks;
- economic indicators;
- events and news;
- progression;
- help, privacy, and unavailable features;
- lifecycle, transactional, narrative, deadline, and reliability notifications;
- map alternatives and accessible copy.

Exit gate:

- tutorials are replayable and idempotent;
- terminology matches Admin and Player;
- notifications deduplicate;
- links resolve to supported routes;
- urgent presentation is reserved for urgent conditions;
- keyboard, screen-reader, reduced-motion, and responsive checks pass.

## Tranche 8: Machine-readable manifest and simulation

Deliverables:

- full design manifest;
- content descriptors and checksums;
- dependency graph;
- capability requirements;
- expected counts;
- versioned simulation inputs;
- committed simulation runner;
- multiple deterministic seeds;
- raw player, country, market, event, and integrity outputs;
- generated summaries.

Exit gate:

- manifest count equals record count;
- checksums match;
- references resolve;
- results are reproducible;
- values are revised when simulations fail;
- no prose claim substitutes for execution evidence.

## Tranche 9: Staging importer, fixtures, and bounded activation

Deliverables:

- environment verification;
- preflight and dry run;
- schema, reference, economic, narrative, security, and capability validation;
- dependency-ordered import;
- idempotent replay;
- interrupted-run recovery;
- immutable audit;
- pack deactivation;
- deterministic fixture creation and cleanup;
- bounded active staging subset.

Recommended first active market subset:

- approximately 20–30 instruments per country;
- approximately 200–300 instruments total;
- only fully mapped and calibrated instrument types.

Exit gate:

- wrong environment rejected before writes;
- exact replay is a no-op;
- checksum conflicts rejected;
- fixtures isolated;
- counts and references correct;
- rollback preserves historical runtime references.

## Tranche 10: Admin and Player end-to-end verification

Deliverables:

- Admin content inventory and search verification;
- definition, runtime instance, fixture, deprecation, and pack-state distinction;
- Player arrival verification;
- market pagination, search, filtering, detail, and unavailable-state verification;
- Contract, Store, inventory, banking, progression, event, news, tutorial, and notification verification;
- desktop, compact, and narrow responsive checks;
- accessibility checks;
- staging rollback rehearsal.

Exit gate:

- authoritative data appears correctly;
- preview data never appears as live;
- all failure states remain usable;
- terminology matches;
- no UUID, Player ID, Access Code, credential, or secret is exposed;
- rollback behavior is visible and verified.

## Tranche 11: Arrival class system

Status: deliberately last in the current list.

The player answers questions on arrival and receives a recommended economic pathway class. The player may review and override the result before confirmation.

Required future deliverables:

- six to eight balanced class definitions;
- arrival questionnaire;
- scoring and tie-breaking rules;
- recommendation explanations;
- ten country variants per class;
- starting-skill, resource, opportunity, tutorial, Contract, and reputation effects;
- path-change or retraining behavior;
- machine-readable definitions;
- comparative class-country simulations;
- Admin and Player UI verification;
- accessibility, privacy, and representation review.

Exit gate:

- no class is objectively superior;
- every class-country combination is viable;
- results are deterministic and explainable;
- player override works;
- no sensitive demographic answer is required;
- class does not permanently lock other economic paths;
- all starting grants remain idempotent.

Reference: `players/arrival-class-system-backlog-v1.md`.

## Current quantity targets

| Domain | Target |
|---|---:|
| Countries | 10 |
| Country currencies | 10 |
| Market instruments | 3,200 |
| Active first-staging instruments | approximately 200–300 |
| Exchanges | 10 |
| Parent sectors | 18 |
| Initial reference benchmarks | 20 |
| Locations | 50–70 |
| Route families | at least 13 initial candidates |
| Arrival packages | 10 |
| Institutions | 10–20 core, expanding by country |
| Recurring characters | at least 20 |
| Contracts | approximately 50 |
| Contract chains | 10 |
| Store products | 30–40 |
| Banking products | 8–12 |
| Levels | 10 |
| Achievements | approximately 20 |
| Standalone events | 25 |
| Event chains | 10 |
| Crisis arcs | 5 |
| Interactions | 40–60 |
| Decision points | 15–20 |
| News templates | 25–30 |
| Tutorials | 10–12 |
| Notification templates | 25–30 |
| Arrival classes | 6–8 candidate target, pending research |

## Cross-domain readiness questions

Every domain must answer:

- What is reusable canon?
- What is game-session runtime state?
- What is the stable content ID?
- Which references are required?
- Which lifecycle states exist?
- What happens on failure, expiry, deactivation, retirement, and retry?
- Which economic and narrative effects exist?
- Which Player and Admin copy is required?
- Which capabilities are authoritative?
- Which capabilities remain planned?
- Which fixtures verify the record?
- How is the record rolled back or replaced?

## Production blockers

Production is blocked by any of the following:

- unresolved canon conflict;
- duplicate stable ID, symbol, name, or manifest descriptor;
- invalid reference;
- unsupported capability represented as active;
- uncalibrated monetary or market value represented as approved;
- missing recovery for severe events or player hardship;
- invalid company, bond, index, fund, or banking arithmetic;
- non-idempotent issuance or import;
- fixture leakage;
- no rollback or deactivation path;
- cross-session state leakage;
- private identifier or credential exposure;
- inconsistent Admin and Player terminology;
- failed accessibility, classroom-suitability, representation, or war-sensitivity review.

## Production-grade definition of done

The seed system is production grade only when:

1. Canon and stable identifiers are coherent.
2. All reusable records are machine-readable and versioned.
3. Runtime state is game-session and player scoped.
4. The 3,200-instrument library is repository-controlled and validated.
5. The active market subset is calibrated and understandable.
6. Locations and routes are map-verified.
7. Arrival packages and classes are viable and balanced.
8. Contracts, Store, banking, progression, events, news, interactions, tutorials, and notifications have complete lifecycles.
9. Values pass real simulations.
10. Manifest, checksums, dependencies, and capabilities validate.
11. Import is idempotent, audited, environment-restricted, and reversible.
12. Fixtures are deterministic and isolated.
13. Admin and Player behavior passes end-to-end staging verification.
14. Rollback is rehearsed.
15. Production release has explicit approval evidence, release notes, monitoring, and incident response.

## Immediate execution backlog

1. Ingest and reconcile the generated 3,200-instrument package.
2. Build issuer, exchange, industry, commodity, index, fund, and bond reference records.
3. Verify and normalize 50–70 locations and route relationships.
4. Convert ten arrival packages into machine-readable records.
5. Expand Contracts and player-economy content.
6. Expand events, news, interactions, tutorials, and notifications.
7. Generate the complete design manifest.
8. Implement and run simulation.
9. Implement importer, fixtures, and bounded staging activation.
10. Verify Admin and Player behavior and rollback.
11. Develop the arrival class system after the above workstreams are structurally underway.
