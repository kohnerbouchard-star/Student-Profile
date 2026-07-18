# Econovaria Seed Data Delivery Roadmap v1

Status: active execution tracker  
Owner branch: `agent/seed-content-foundation-v1`  
Pull request: #163  
Production authorization: false

## Objective

Convert the Econovaria content foundation into a validated, machine-readable, simulation-tested, staging-ready seed pack without activating unsupported mechanics or mixing live player/session state into reusable definitions.

This document is the controlling roadmap for the remaining seed-data work. Milestones may overlap only when dependencies and file ownership are explicit.

## Delivery rules

1. Reusable definitions and runtime state remain separate.
2. Every record receives a stable content ID.
3. Numerical values are not approved until they are calibrated and reproducibly tested.
4. The 3,200-instrument universe is a reusable library, not the default player-facing market.
5. Staging activation must be bounded, idempotent, auditable, and reversible.
6. Country differences create strategic trade-offs, not objectively superior starts.
7. Severe economic and narrative states require recovery paths.
8. Unsupported mechanics remain `definition-only` or `blocked`.
9. Fixture data remains isolated from classroom and production definitions.
10. The arrival class system remains Milestone 11.

## Milestone 1 — Ingest the 3,200-instrument universe

Status: in progress

Deliverables:

- ten country JSONL files with 320 records each;
- universe manifest with counts and checksums;
- validation for IDs, symbols, names, countries, currencies, exchanges, types, and sectors;
- editorial collision report;
- repository paths recorded in the design manifest.

Acceptance gate:

- exactly 3,200 records and 320 per country;
- no duplicate stable ID, symbol, or display name;
- no ticker collision with official currency codes;
- every exchange, country, currency, type, sector, and issuer reference is valid;
- all records remain `activationAuthorized: false`.

Immediate execution:

- establish a 240-instrument active-subset candidate;
- establish its issuer registry;
- use that bounded package to define financial enrichment, simulation, importer, and UI requirements while the full JSONL universe is ingested.

## Milestone 2 — Market reference and issuer system

Status: started

Deliverables:

- issuer master registry;
- exchange registry;
- sector and subindustry registry;
- commodity and benchmark registry;
- index methodology registry;
- bond lifecycle standard;
- fund and trust holdings schema.

Acceptance gate:

- each instrument references one valid issuer or administrator;
- multiple securities from one issuer do not create duplicate companies;
- every benchmark is explicitly tradable or reference-only;
- maturity, suspension, default, retirement, and deactivation behavior is defined.

## Milestone 3 — Bounded active market and financial enrichment

Status: started

First review package:

- 24 instruments per country;
- 240 instruments total;
- later staging target approximately 200–300 active instruments.

Per-country allocation:

- 12 common equities;
- 1 preferred or convertible security;
- 4 corporate bonds;
- 2 sovereign or public-agency bonds;
- 2 exchange-traded funds;
- 1 listed trust;
- 1 index;
- 1 commodity or sector benchmark.

Required enrichment:

- equity financial statements, shares, price, market capitalization, dividends, growth, leverage, liquidity, and volatility;
- bond face value, coupon, term, price, yield, credit band, payment schedule, and default treatment;
- index constituents, methodology, starting level, rebalancing, and suspension treatment;
- fund and trust holdings and NAV methodology;
- event, currency, commodity, interest-rate, shipping, and war exposure.

Acceptance gate:

- arithmetic valid;
- no guaranteed-return path;
- assumptions are simulation-ready;
- event sensitivities are explainable;
- selected assets represent each country’s canonical economy.

## Milestone 4 — Canonical geography

Status: started

Deliverables:

- 50–70 verified locations;
- map coordinates and country ownership;
- land and maritime adjacency;
- border crossings, ports, terminals, and strategic chokepoints;
- Meridian Corridor segments;
- wartime closures and recovery routes;
- corrected Lumenor and Xalvoria profiles.

Acceptance gate:

- every location is placed correctly;
- map markers and written records agree;
- routes reference valid locations;
- polygon geometry is not treated as authoritative adjacency without review;
- attack and disruption locations are unambiguous.

## Milestone 5 — Ten arrival and starting packages

Status: started

Each country requires:

- arrival city and residency status;
- starting balance and ordinary expenses;
- housing;
- employment leads;
- sponsor and local contact;
- first message, tutorial, and Contract;
- emergency recovery path;
- initial banking, Store, and market availability.

Acceptance gate:

- all ten starts are viable;
- no country has a structurally superior wealth path;
- grants and initialization are idempotent;
- numerical values are simulation-validated;
- runtime ownership remains player/session scoped.

## Milestone 6 — Core gameplay content

Status: partially authored

Targets:

- approximately 50 Contracts and 10 chains;
- 30–40 Store items;
- 8–12 banking products;
- 10 levels and approximately 20 achievements;
- 25 standalone events, 10 chains, and 5 crisis arcs;
- 40–60 interactions;
- 25–30 news templates;
- 10–12 tutorials;
- 25–30 notification templates.

Acceptance gate:

- complete lifecycles;
- supported effects only;
- bounded rewards and prices;
- severe events have recovery paths;
- notifications follow authoritative state changes;
- Player and Admin terminology match.

## Milestone 7 — Machine-readable manifests

Status: scaffold exists

Deliverables:

- design and release manifests;
- record descriptors;
- dependency graph;
- expected counts;
- reference and validation rules;
- asset and capability requirements;
- compatibility declaration;
- review status and checksums.

Acceptance gate:

- dependency order is valid;
- stable-ID ownership is resolved for executable records;
- unsupported domains are blocked or definition-only;
- fixtures are excluded from production definitions.

## Milestone 8 — Reproducible simulation and calibration

Status: input contract exists; no run completed

Required simulation domains:

- starting-package viability;
- active-market behavior;
- inflation, interest-rate, currency, shipping, commodity, and war shocks;
- reward sources and price sinks;
- lending affordability and default recovery;
- concentration and exploit strategies;
- long-session recovery;
- class-country matrix after Milestone 11.

Required evidence:

- committed source and versioned inputs;
- multiple deterministic seeds;
- raw outputs and checksums;
- integrity report;
- exact run command;
- generated summary.

Acceptance gate:

- every approved value traces to reproducible evidence;
- exploit and non-viability thresholds pass;
- no unsupported numerical claim remains.

## Milestone 9 — Staging importer, fixtures, and rollback

Status: planned

Deliverables:

- environment-restricted importer;
- dry-run and preflight validation;
- idempotent load;
- interrupted-load recovery;
- immutable import audit;
- definition deactivation;
- deterministic fixture loader;
- rollback rehearsal.

Acceptance gate:

- exact replay produces no duplicates;
- wrong-environment, checksum-conflict, missing-reference, and fixture-leakage tests fail safely;
- rollback preserves referenced runtime history.

## Milestone 10 — Bounded staging activation and end-to-end verification

Status: blocked by Milestones 1–9

Verification includes:

- Admin list, search, filtering, detail, status, and audit views;
- Player market, country, Contract, inventory, notification, and tutorial views;
- empty, loading, error, unavailable, and suspended states;
- pagination and performance;
- desktop, compact, and narrow rendering;
- keyboard and accessible naming;
- no internal UUID or credential exposure;
- rollback evidence.

Acceptance gate:

- staging subset renders and behaves correctly;
- all activated capabilities are authoritative;
- rollback succeeds;
- verification evidence is attached to the release candidate.

## Milestone 11 — Arrival class system

Status: deliberately deferred

Player flow:

1. Answer a short arrival questionnaire.
2. Receive an explainable class recommendation.
3. Review advantages and trade-offs.
4. Accept or override the recommendation.
5. Receive a country-specific class variant.
6. Retain access to retraining or later economic-path changes.

Requirements:

- six to eight balanced base classes;
- ten country-specific variants per class;
- deterministic scoring;
- no sensitive demographic questions;
- no objectively superior class;
- no permanent path lockout;
- idempotent grants;
- player/session-scoped state;
- simulation of every class-country combination.

Acceptance gate:

- class choice changes strategy without determining success;
- questionnaire language is clear and non-discriminatory;
- every class is viable in every country;
- classes, starting packages, Contracts, progression, Store items, and banking remain balanced together.

## Current checkpoint

Completed or started:

- 3,200-instrument allocation and generated library;
- market reference taxonomy;
- 50 candidate locations and route concepts;
- ten arrival-package definitions;
- design-manifest scaffold;
- fixture matrix;
- simulation input contract;
- staging and UI verification plan;
- deferred class-system requirements;
- deterministic 240-instrument active-subset selection;
- active-subset issuer-registry generation.

Blocked:

- production prices and yields;
- final map coordinates and adjacency;
- approved starting economic values;
- executable importer;
- staging activation;
- class implementation.

## Next three execution actions

1. Commit and validate the 240-instrument active-subset candidate and its issuer registry.
2. Complete a Northreach financial-enrichment pilot, then generalize the model across all ten countries.
3. Complete the full 3,200-record repository ingest and reconcile its manifest and checksums.

## Change control

Update this tracker whenever a milestone changes state, quantity targets change, a capability becomes authoritative, values are recalibrated, or a staging/production release candidate is created.
