# Econovaria Seed Content Catalog

Status: foundation tranche in progress
Pull request: draft PR #163

This directory is the authoritative planning and content-design workspace for seeded Econovaria content.

It does not change database schema, migrations, Admin behavior, Player Terminal behavior, Supabase data, or live game-session state.

## Current narrative direction

The player begins as a new immigrant in one of Econovaria's ten countries.

They arrive during the Meridian economic boom with limited money, temporary status, one local contact, and the goal of building wealth, security, relationships, and belonging.

Economic rivalry then escalates through shortages, cyber incidents, political hostility, and a major attack against Meridian infrastructure. The standard campaign may develop into open war.

War is experienced primarily through civilian and economic consequences:

- jobs;
- prices;
- shortages;
- companies and markets;
- housing;
- borders;
- residency;
- financial controls;
- relationships;
- public trust;
- reconstruction.

The player is not automatically a national leader or battlefield commander. Influence must be earned through supported work, evidence, reputation, relationships, and economic activity.

Personal wealth and world success are evaluated separately.

Primary narrative references:

- `story-arcs/global/immigrant-fortune-and-war-premise.md` — core player premise and arrival-to-war story spine.
- `story-arcs/countries/immigrant-opening-framework-v1.md` — required structure for every country opening.
- `story-arcs/countries/README.md` — index and comparison guide for all ten immigrant openings.
- `02-world-state-and-historical-timeline.md` — durable world history, Meridian boom, fracture, attack, and runtime war sequence.
- `04-narrative-system-and-story-state.md` — player-centered choice, relationship, consequence, war, and ending rules.
- `story-arcs/global/meridian-corridor.md` — central opening arc.
- `briefings/global/meridian-player-briefing.md` — player-facing arrival and Meridian briefing.
- `reviews/map-location-canon-audit-v1.md` — map geometry, capital, profile, route, and location-registry audit.

## Operating rules

1. Canonical lore and reusable templates may be global.
2. Prices, holdings, active events, player choices, relationships, residency, country conditions, war state, and story progress remain game-session scoped.
3. Display names are editable content. Stable content identifiers are not reassigned after release.
4. Every seeded record must have a gameplay, economic, narrative, learning, administrative, or test purpose.
5. Test fixtures must be visibly and technically separated from classroom production content.
6. Content must be idempotent, versioned, searchable, reviewable, and reversible before production import.
7. This directory remains documentation-only until an implementation mapping is approved.
8. News, interactions, and authored documents are not authority to mutate economic or player state.
9. Unsupported mechanics must remain labeled as planned.
10. A prose simulation design is not evidence that a simulation ran.
11. Location-dependent content is not staging-ready until a canonical location, adjacency, and route registry exists.

## Catalog map

### Program control

- `00-program-charter.md` — scope, governance, gates, tranche rules, and quality bar.
- `01-canon-and-identifier-registry.md` — official entities, stable identifiers, ownership, and terminology.
- `02-world-state-and-historical-timeline.md` — world history, player arrival, Meridian boom, fracture, and possible war.
- `03-economic-system-and-balance-framework.md` — indicators, effect scales, currencies, rewards, prices, and balance controls.
- `04-narrative-system-and-story-state.md` — player-centered story architecture, choices, relationships, and consequences.
- `05-institutions-and-character-catalog.md` — institution and recurring-character design requirements.
- `06-event-news-and-interaction-framework.md` — events, news, interaction trees, triggers, corrections, and follow-up logic.
- `07-contract-content-framework.md` — Contract families, narrative chains, rewards, approval, difficulty, and learning alignment.
- `08-company-market-and-commodity-framework.md` — companies, equities, sectors, commodities, and market-event exposure.
- `09-store-inventory-banking-progression-framework.md` — products, ownership, redemption, banking, lending, achievements, and progression.
- `10-locations-tutorials-notifications-framework.md` — locations, instructional content, system language, and notifications.
- `11-seeding-environments-fixtures-and-validation.md` — staging, fixture separation, validation, rollback, and auditability.
- `12-production-roadmap-and-definition-of-done.md` — tranche order, acceptance gates, backlog, and completion criteria.
- `13-current-system-compatibility-matrix.md` — code and capability mapping.
- `14-country-baseline-and-viability-model.md` — candidate country baseline and future stress-test requirements.

### Global story

- `story-arcs/global/immigrant-fortune-and-war-premise.md`
- `story-arcs/global/meridian-corridor.md`
- `story-arcs/global/meridian-resolution-model.md`
- `story-arcs/global/meridian-classroom-operation.md`
- `story-arcs/global/meridian-cancellation-matrix.md`
- `story-arcs/global/meridian-outcome-reaction-matrix.md`
- `story-arcs/cross-arc-concurrency-policy.md`

### Country immigrant openings

Directory: `story-arcs/countries/`

- `northreach-immigrant-opening.md`
- `yrethia-immigrant-opening.md`
- `thaloris-immigrant-opening.md`
- `solvend-immigrant-opening.md`
- `eldoran-immigrant-opening.md`
- `valerion-immigrant-opening.md`
- `lumenor-immigrant-opening.md`
- `xalvoria-immigrant-opening.md`
- `dravenlok-immigrant-opening.md`
- `syndalis-immigrant-opening.md`

Each opening defines:

- the player’s reason for choosing the country;
- the arrival scene and immediate need;
- multiple initial economic paths;
- sponsor, friend, rival, and institutional gatekeeper;
- Meridian-boom connection;
- fracture, attack, and wartime transformation;
- belonging crisis;
- personal ending hooks;
- validation and representation constraints.

### Country world design

Country-specific economic and canonical planning lives in `countries/`. Each country has its own file so institutions, events, companies, Contracts, locations, dependencies, and strategic roles can be searched independently.

### Player briefings

- `briefings/global/meridian-player-briefing.md`
- `briefings/global/meridian-models-briefing.md`
- `briefings/countries/<country>.md`

The country briefings still require revision so each one explains what arrival, opportunity, migration, escalation, and war mean from the player's adopted-country perspective.

### Reviews

Review passes live in `reviews/`:

- economics and balance;
- narrative continuity and choice quality;
- gameplay and classroom learning;
- technical compatibility and data safety;
- map location and canon alignment;
- future migration and representation review;
- future war sensitivity review.

Current map review:

- `reviews/map-location-canon-audit-v1.md`

The map audit conditionally accepts the ten country polygons and broad placement, rejects the stale Lumenor and Xalvoria profile metadata, and blocks location-dependent executable content until capital-marker semantics, location nodes, adjacency, routes, and visual artwork are validated.

These are documented workstreams, not independent external validation.

A concept is not approved because it appears in the catalog. It is approved only when its review status is recorded and blocking findings are resolved.

## Simulation status

No economic simulation has been executed for this content foundation.

`reviews/economic-simulation-review-v1.md` contains a proposed reproducible protocol only.

No reward, price, affordability, progression, concentration, currency, or wartime-economy value is simulation-validated.

## Content maturity states

- `concept` — idea recorded but not normalized.
- `draft` — full fields present; review incomplete.
- `reviewed` — domain review completed; changes may remain.
- `approved` — content and technical mapping accepted.
- `staging-ready` — identifiers, references, and values validated.
- `production-ready` — staging behavior, rollback, and classroom suitability verified.
- `deprecated` — retained for history but blocked from new sessions.
- `retired` — unavailable and excluded from normal seed operations.

## Current tranche boundaries

Included:

- consolidated production planning;
- content concepts and templates;
- ten-country world design;
- immigrant fortune-and-war premise;
- revised Meridian Corridor arc;
- ten distinct country immigrant openings;
- structural map-location and canon audit;
- economic, narrative, gameplay, and technical review structures;
- catalog structure and future implementation map.

Excluded:

- migrations;
- seed SQL;
- executable content packs;
- API changes;
- runtime event or war engine changes;
- player-background or residency persistence;
- relationship persistence;
- Player Terminal map-data or artwork corrections;
- location, adjacency, or route runtime implementation;
- Admin or Player Terminal UI changes;
- Supabase deployment;
- live classroom content import.

## Existing authority references

This catalog must remain aligned with:

- `docs/worldbuilding/econovaria-country-lore-v1.md`;
- `frontend/src/assets/currency-symbols/currency-symbols.manifest.json`;
- current backend country, stock, Contract, inventory, notification, and capability contracts;
- game-session scoping requirements documented in existing systems.

Where this catalog conflicts with authoritative code or applied migration history, the conflict must be recorded in technical review rather than silently changing implementation.
