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

## Current checkpoint

Completed in the current execution pass:

- Northreach, Yrethia, Thaloris, and Solvend each have a validated 24-instrument bounded active-market candidate;
- the four-country issuer audit verified 72 unique issuers or administrators in total: 21 Northreach and 17 each for Yrethia, Thaloris, and Solvend;
- all 96 instrument-to-issuer references and issuer-to-instrument backreferences are complete and bidirectionally consistent;
- Northreach, Yrethia, and Thaloris financial enrichment and reproducible pilot simulations are complete with documented balance blockers;
- Solvend financial enrichment covers all 17 issuers and all 24 instruments and has passed structural and arithmetic validation;
- Northreach has a recalibrated long-end reference curve and v2 simulation evidence;
- automated issuer-reference and Solvend financial audits run through Repository Quality;
- no asset, country, importer, or runtime capability is authorized for activation.

## Milestone 1 — Ingest the 3,200-instrument universe

Status: in progress

Deliverables:

- ten country JSONL files with 320 records each;
- universe manifest with counts and checksums;
- validation for IDs, symbols, names, countries, currencies, exchanges, types, sectors, and issuers;
- editorial collision report;
- repository paths recorded in the design manifest.

Acceptance gate:

- exactly 3,200 records and 320 per country;
- no duplicate stable ID, symbol, or display name;
- no ticker collision with official currency codes;
- every exchange, country, currency, type, sector, and issuer reference is valid;
- all records remain `activationAuthorized: false`.

Immediate execution:

- continue ingesting the ten full country files;
- preserve the 240-instrument active-subset candidate as a separate bounded layer;
- do not confuse active-candidate records with the full reusable universe.

## Milestone 2 — Market reference and issuer system

Status: started; first four countries verified

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

Current progress:

- Northreach issuer enrichment: candidate-complete, 21 verified issuers or administrators;
- Yrethia issuer enrichment: candidate-complete, 17 verified issuers or administrators;
- Thaloris issuer enrichment: candidate-complete, 17 verified issuers or administrators;
- Solvend issuer enrichment: candidate-complete, 17 verified issuers or administrators;
- issuer-reference regression audit: active in Repository Quality;
- Eldoran, Valerion, Lumenor, Xalvoria, Dravenlok, and Syndalis: queued.

## Milestone 3 — Bounded active market and financial enrichment

Status: in progress; first four countries enriched

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
- event, currency, commodity, interest-rate, shipping, cyber, and war exposure.

Acceptance gate:

- arithmetic valid;
- no guaranteed-return path;
- assumptions are simulation-ready;
- event sensitivities are explainable;
- selected assets represent each country’s canonical economy.

Current progress:

- Northreach: financial enrichment and v2 simulation complete with blockers;
- Yrethia: financial enrichment and pilot simulation complete with blockers;
- Thaloris: financial enrichment and pilot simulation complete with blockers;
- Solvend: financial enrichment, exact source coverage, and structural/arithmetic validation complete; simulation next;
- Eldoran, Valerion, Lumenor, Xalvoria, Dravenlok, and Syndalis: selection queued.

Four-country findings requiring continued calibration:

- defensive labels must not imply immunity to inflation, rate, currency, confidence, or route shocks;
- broad recovery must remain viable without becoming guaranteed;
- strategic wartime exposures must not dominate diversified portfolios;
- technology concentration and interest-rate sensitivity require explicit Solvend stress testing;
- bank capital, issuer default, recovery, refinancing, liquidity, real-return, transaction-cost, cyber, and player-order mechanics remain incomplete.

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

Status: Northreach, Yrethia, and Thaloris pilots executed; Solvend simulation next; cross-country simulation pending

Committed evidence currently includes:

- 250 deterministic seeds and 60 cycles per completed country pilot;
- country-specific baseline, stress, disruption, war, confidence, and recovery scenarios;
- zero non-finite results in completed final runs;
- zero guaranteed-positive instrument or portfolio cases in completed final runs;
- checksummed scripts, inputs, summaries, manifests, and retained evidence declarations.

Immediate simulation work:

- execute the Solvend pilot with technology-concentration, rate-shock, cyber-disruption, Meridian-disruption, strategic-demand, confidence-crisis, and recovery scenarios;
- verify that no Solvend instrument or portfolio has a guaranteed-positive path;
- compare all four enriched countries for concentration, resilience, recovery, and exploitability;
- begin cross-country currency, trade, strategic-component, route, and event propagation calibration.

Remaining simulation domains:

- Solvend and the six future country markets;
- cross-country currency, trade, and event propagation;
- starting-package viability;
- reward sources and price sinks;
- lending affordability and default recovery;
- concentration and exploit strategies;
- long-session recovery;
- class-country matrix after Milestone 11.

Acceptance gate:

- every approved value traces to reproducible evidence;
- exploit and non-viability thresholds pass;
- no unsupported numerical claim remains;
- raw evidence is stored in the repository or an immutable artifact store.

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
- invalid references and checksums are rejected;
- fixtures cannot enter classroom or production environments;
- rollback preserves referenced history and runtime records.

## Milestone 10 — Bounded staging and cross-surface verification

Status: blocked

Deliverables:

- selected staging content pack;
- Admin read and lifecycle verification;
- Player list, detail, search, filtering, pagination, empty, unavailable, and loading verification;
- responsive and accessibility verification;
- performance checks for the bounded market;
- staged deactivation and rollback verification.

Acceptance gate:

- no unsupported feature appears operational;
- no private UUID or ownership field reaches the browser;
- market and player-economy states remain game scoped;
- all required evidence is retained.

## Milestone 11 — Arrival class system

Status: deferred by design

Deliverables:

- arrival questionnaire;
- six to eight base classes;
- ten country-specific variants per class;
- deterministic scoring;
- recommendation explanation;
- player override;
- starting grants and trade-offs;
- retraining or career movement;
- class-country simulation matrix.

Acceptance gate:

- no sensitive demographic questions;
- no objectively superior class;
- no permanent lockout from alternative economic paths;
- every class-country pairing remains viable;
- grants are idempotent and session scoped.

## Immediate next execution order

1. Execute the reproducible Solvend market simulation.
2. Validate Solvend integrity, technology concentration, rate sensitivity, cyber and Meridian disruption, strategic wartime demand, confidence crisis, and recovery behavior.
3. Correct any Solvend balance defects and record checksummed evidence.
4. Begin four-country cross-market calibration after the Solvend pilot passes its integrity gate.
5. Select the remaining six country candidates without creating duplicate issuer entities.
6. Continue the complete 3,200-record repository ingest and editorial collision review.
7. Advance geography, arrival-package, and core-gameplay content in dependency-safe parallel tranches.
