# Econovaria Seed Content Catalog

Status: foundation tranche in progress

This directory is the authoritative planning and content-design workspace for production-grade seeded Econovaria content. It extends the existing country lore and current runtime contracts without changing database schema, migrations, Admin behavior, Player Terminal behavior, or game-session runtime state.

## Operating rules

1. Canonical lore and reusable templates may be global.
2. Prices, holdings, active events, player choices, country conditions, story progress, and other mutable state must remain scoped to a game session.
3. Display names are editable content. Stable content identifiers are not.
4. Every seeded record must have a gameplay purpose, economic rationale, narrative purpose, learning purpose, administrative purpose, or test purpose.
5. Test fixtures must be visibly and technically separated from classroom production content.
6. Content must be idempotent, versioned, searchable, reviewable, and reversible before production import.
7. This directory is documentation-only until the compatibility audit approves an implementation mapping.

## Catalog map

### Program control

- `00-program-charter.md` — scope, governance, gates, tranche rules, and quality bar.
- `01-canon-and-identifier-registry.md` — official entities, stable identifier conventions, ownership, and terminology.
- `02-world-state-and-historical-timeline.md` — starting world, historical sequence, unresolved tensions, and session-opening state.
- `03-economic-system-and-balance-framework.md` — indicators, effect scales, currencies, rewards, prices, and balance controls.
- `04-narrative-system-and-story-state.md` — story architecture, states, branches, continuity, and consequence rules.
- `05-institutions-and-character-catalog.md` — institution and recurring-character design requirements.
- `06-event-news-and-interaction-framework.md` — events, news, interaction trees, triggers, and follow-up logic.
- `07-contract-content-framework.md` — contract families, narrative chains, rewards, approval, difficulty, and learning alignment.
- `08-company-market-and-commodity-framework.md` — companies, equities, indexes, sectors, commodities, and market-event exposure.
- `09-store-inventory-banking-progression-framework.md` — products, ownership, redemption, banking, lending, achievements, and progression.
- `10-locations-tutorials-notifications-framework.md` — map locations, instructional content, system language, and notification governance.
- `11-seeding-environments-fixtures-and-validation.md` — production seed policy, staging, fixture separation, validation, rollback, and auditability.
- `12-production-roadmap-and-definition-of-done.md` — tranche order, quantities, acceptance gates, backlog, and completion criteria.

### Countries

Country-specific narrative and economic planning lives in `countries/`. Each country has its own file so names, institutions, events, companies, contracts, locations, and dependencies can be searched independently.

### Reviews

Independent review passes live in `reviews/`:

- economics and balance;
- narrative continuity and choice quality;
- gameplay and classroom learning;
- technical compatibility and data safety.

A concept is not approved because it appears in the catalog. It is approved only when its review status is recorded and all blocking findings are resolved.

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

- consolidated production plan;
- content concepts and templates;
- ten country narrative files;
- opening Meridian Corridor arc;
- economic, narrative, gameplay, and technical reviews;
- catalog structure and future implementation map.

Excluded:

- migrations;
- seed SQL;
- API changes;
- runtime event engine changes;
- Admin or Player Terminal UI changes;
- Supabase deployment;
- live classroom content import.

## Existing canon references

This catalog must remain aligned with:

- `docs/worldbuilding/econovaria-country-lore-v1.md`;
- `frontend/src/assets/currency-symbols/currency-symbols.manifest.json`;
- current backend country, stock, contract, inventory, notification, and capability contracts;
- game-session scoping requirements documented in the existing market and country systems.

Where this catalog conflicts with authoritative code or applied migration history, the conflict must be recorded in the technical review rather than silently changing canon or implementation.