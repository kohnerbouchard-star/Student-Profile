# Seed Data Execution Program v1

Status: active planning and design-record production  
Pull request: draft PR #163  
Runtime activation: prohibited  
Production authorization: false

## Purpose

Convert the existing Econovaria worldbuilding foundation into a complete, machine-readable, validated seed-data system.

This program replaces open-ended lore generation with an ordered execution sequence. Each workstream must produce searchable records, validation evidence, explicit technical mapping, and a defined staging gate.

The workstreams are deliberately ordered. Later work may be prepared in parallel, but it cannot be marked staging-ready before its dependencies are complete.

## Current verified position

Already available in design form:

- ten countries and ten local currencies;
- the immigrant fortune-and-war campaign premise;
- ten country immigrant openings;
- Meridian story, event, interaction, Contract, news, and outcome concepts;
- institutions and recurring-character concepts;
- market-universe allocation and schema;
- a generated 3,200-instrument package outside the committed branch;
- map-location audit;
- staging-package architecture;
- economic, narrative, gameplay, and technical review frameworks.

Not yet available as production seed data:

- complete machine-readable records across every domain;
- approved financial values;
- authoritative location and route data;
- approved player starting values;
- executable import tooling;
- runtime activation;
- staging evidence;
- production authorization.

## Execution principles

1. Reusable definitions remain separate from game-session and player state.
2. Stable content IDs are mandatory before executable import.
3. No value is approved merely because it was generated.
4. All monetary, market, reward, rate, and progression values require simulation and staging validation.
5. All location-dependent content requires a canonical location and route registry.
6. Unsupported mechanics remain definition-only or blocked.
7. The 3,200-instrument catalog is a content library; a bounded subset is activated per session.
8. Severe events require recovery paths.
9. Imports must be idempotent, auditable, environment-restricted, and reversible.
10. Admin and Player surfaces must be verified against the same terminology and lifecycle states.

# Ordered workstreams

## 1. Reconcile and ingest the 3,200-instrument universe

Status: **in progress**

Objective:

Move the generated market package from an external review artifact into repository-controlled, checksum-verified, machine-readable content.

Required deliverables:

- ten country JSONL files with 320 records each;
- one authoritative universe manifest;
- one flat review export;
- deterministic generation metadata;
- file checksums;
- duplicate-ID, symbol, and name validation;
- currency-code collision validation;
- editorial review queue;
- instrument-class capability mapping;
- explicit tradable versus reference-only status.

Required decisions:

- repository location and file-size strategy;
- stable issuer ownership;
- whether generated records are preserved verbatim or regenerated from committed source;
- how versions and deprecations are handled;
- which 20–40 instruments per country form the first active subset.

Exit gate:

- all 3,200 definitions are repository-controlled;
- counts equal the manifest;
- all identifiers are unique;
- all countries have exactly 320 records;
- no generated record is represented as financially calibrated;
- unsupported instrument classes are blocked from activation.

## 2. Create industries, commodities, issuers, exchanges, and market methodologies

Status: **started**

Objective:

Create the reference entities required for the 3,200 instruments to function as a coherent market rather than a list of names.

Required deliverables:

- ten exchange definitions;
- issuer-type taxonomy;
- issuer master registry;
- parent-sector and subindustry taxonomy;
- commodity and benchmark registry;
- bond issuer and credit-band rules;
- national-index methodology templates;
- fund and trust administrator rules;
- event-exposure vocabulary;
- corporate-action support matrix.

First artifact:

- `markets/issuer-exchange-and-reference-taxonomy-v1.md`.

Exit gate:

- every instrument references valid country, currency, exchange, issuer type, sector, and instrument type;
- every index and fund has an administrator and methodology status;
- every benchmark is explicitly tradable or reference-only;
- no unsupported corporate action is active.

## 3. Build the canonical location, adjacency, and route registry

Status: **started**

Objective:

Create authoritative geographic records for capitals, economic sites, transport routes, Meridian segments, disruptions, and map integration.

Required deliverables:

- 5–7 locations per country;
- 50–70 location definitions;
- location categories;
- map coordinates or verified region references;
- country adjacency declarations;
- maritime, rail, road, energy, and data routes;
- route capacity and vulnerability classes;
- Meridian Corridor segment registry;
- attack-site and disruption-site rules;
- map marker semantics;
- non-map accessibility paths.

First artifact:

- `locations/canonical-location-adjacency-route-registry-v1.md`.

Exit gate:

- every location belongs to a valid country or declared cross-border zone;
- every route references valid endpoints;
- map and text representations agree;
- Lumenor and Xalvoria profile conflicts are corrected in the appropriate runtime tranche;
- location-dependent events and Contracts use registry IDs.

## 4. Complete ten player arrival and starting packages

Status: **started**

Objective:

Convert each immigrant opening into a complete starting-data package.

Required deliverables per country:

- arrival package ID;
- country and starting city;
- temporary residency type;
- sponsor or settlement contact;
- housing starting state;
- starting balance and currency;
- initial skills and credentials;
- first employment or business leads;
- first message;
- first Contract;
- first tutorial;
- personal goal;
- former-home connection;
- initial reputation and restrictions;
- recovery path for early financial failure;
- class-system integration hook reserved for Workstream 11.

First artifact:

- `players/arrival-starting-package-schema-v1.md`.

Exit gate:

- all ten packages are mechanically viable;
- no country has a clearly dominant opening;
- starting values pass affordability and progression simulations;
- starting records contain no live player identifiers;
- arrival packages can be instantiated independently per game session.

## 5. Expand Contracts, Store, banking, progression, events, news, interactions, tutorials, and notifications

Status: **queued with existing frameworks**

Target content:

- approximately 50 Contracts;
- 10 Contract chains;
- 30–40 Store products;
- 8–12 banking products;
- 10 levels;
- approximately 20 achievements;
- 25 standalone events;
- 10 event chains;
- 5 crisis arcs;
- 40–60 interactions;
- 15–20 mechanical decisions;
- 25–30 news templates;
- 10–12 tutorials;
- 25–30 notification templates.

Required content families:

- arrival and stabilization;
- employment and professional development;
- entrepreneurship;
- markets and finance;
- logistics and infrastructure;
- food and energy security;
- technology and information;
- public administration and journalism;
- prewar escalation;
- wartime civilian economy;
- ceasefire and reconstruction.

Exit gate:

- every executable record has complete lifecycle and failure behavior;
- rewards, prices, rates, and thresholds are calibrated together;
- item effects map to supported capabilities;
- every severe event has recovery content;
- tutorials and notifications use canonical terminology.

## 6. Generate the machine-readable design manifest

Status: **started from the staging-pack specification**

Objective:

Create one authoritative manifest that enumerates every content definition, dependency, review status, capability requirement, and implementation state.

Required deliverables:

- pack metadata;
- content descriptors;
- stable IDs;
- file paths;
- checksums;
- owner domains;
- dependency graph;
- country scopes;
- asset dependencies;
- required and blocked capabilities;
- review status;
- load policy;
- deprecation replacement;
- expected counts.

Exit gate:

- every production-targeted record is represented;
- dependency cycles are absent or explicitly deferred;
- all checksums match;
- blocked records cannot be activated;
- manifest count equals file-level count.

## 7. Build and run real economic and market simulations

Status: **protocol exists; execution not started**

Objective:

Validate starting balances, prices, rewards, rates, market behavior, country viability, progression, and wartime shocks using reproducible code.

Required deliverables:

- committed simulation source;
- explicit input files;
- deterministic random seeds;
- multiple simulation runs;
- raw outputs;
- generated summaries;
- checksums;
- repeatable command;
- documented failures and revisions.

Required test areas:

- affordability;
- bankruptcy and recovery;
- wealth concentration;
- country divergence;
- contract income;
- Store acquisition time;
- loan affordability and default;
- market volatility;
- bond pricing and maturity;
- index behavior;
- war shocks and reconstruction;
- no dominant player strategy.

Exit gate:

- results are reproducible;
- raw data is retained;
- candidate values are revised when tests fail;
- no narrative document is used as substitute evidence.

## 8. Implement the staging importer, preflight validation, rollback, and fixtures

Status: **design specification complete; implementation blocked**

Required deliverables:

- environment identity verification;
- dry-run command;
- schema validation;
- reference validation;
- capability validation;
- checksum verification;
- dependency ordering;
- import lock;
- idempotent upsert behavior;
- interrupted-run recovery;
- immutable import audit;
- pack deactivation;
- deterministic staging fixtures;
- fixture cleanup.

Exit gate:

- replay is a no-op;
- checksum conflicts are rejected;
- wrong-environment import is rejected;
- fixtures cannot enter production;
- rollback preserves referenced runtime history;
- no duplicate reward, event effect, holding, or ledger mutation is possible.

## 9. Load and validate a bounded active staging subset

Status: **blocked by Workstreams 1–8**

Recommended first staging scope:

- ten countries and currencies as authoritative references;
- 20–40 active instruments per country;
- one national index per country where supported;
- Meridian opening arc;
- ten arrival packages;
- five initial Contracts;
- five Store products;
- two banking products;
- selected events, news, interactions, tutorials, and notifications;
- deterministic test players and scenarios.

Required validation:

- correct counts;
- complete references;
- acceptable query and rendering performance;
- safe pagination and filtering;
- search usefulness;
- no fixture leakage;
- no unsupported capabilities displayed as live;
- rollback rehearsal.

## 10. Verify Admin and Player behavior end to end

Status: **blocked by staging activation**

Admin verification:

- content discoverability;
- lifecycle status;
- review and approval controls;
- fixture separation;
- audit events;
- deactivation and rollback visibility;
- no private player identifiers in reusable definitions.

Player verification:

- arrival flow;
- country and currency rendering;
- market search and pagination;
- instrument details;
- Contract lifecycle;
- Store and inventory lifecycle;
- banking arithmetic and explanations;
- events, news, and corrections;
- tutorial replay;
- notifications;
- unavailable-capability treatment;
- accessibility and responsive behavior.

Exit gate:

- required routes work with authoritative data;
- failure states remain usable;
- terminology matches across Admin and Player;
- no stale preview data appears as live;
- no ownership UUID or credential is exposed;
- staging rollback is verified after UI testing.

# 11. Arrival class system

Status: **explicitly deferred until the ten seed-data workstreams above are structurally underway**

The player will answer a short set of questions during arrival. Those answers will determine or recommend an initial economic pathway class.

This class system must be developed as a separate design tranche because it affects:

- starting skills;
- starting capital;
- credentials;
- available jobs and Contracts;
- early tutorials;
- reputation;
- risk tolerance assumptions;
- class-specific dialogue and opportunities;
- country-specific variants;
- balance between player backgrounds.

The system must not create a permanent caste or irreversible restriction. The default design direction is:

- answers produce a recommended starting class;
- the player can review the result before confirmation;
- classes provide different starting opportunities and trade-offs;
- players can later change economic paths through play;
- no class is objectively superior;
- every class remains viable in every country, with country-specific variants;
- sensitive demographic answers are not required;
- the class result is game-session player state, not global profile identity.

Reserved integration field:

- `arrivalClassDefinitionId`

No final class names, scoring rules, bonuses, or starting values are approved yet.

Planned artifact:

- `players/arrival-class-system-backlog-v1.md`.

# Immediate checkpoint

The current execution checkpoint is:

1. correct the obsolete 30-company roadmap references;
2. formalize the issuer, exchange, industry, and commodity registries;
3. formalize location and route records;
4. formalize arrival-package records;
5. add design-manifest and fixture scaffolding;
6. document the class system as Workstream 11 without prematurely locking its mechanics.

This program remains design-only until authoritative backend mapping and staging gates are satisfied.
