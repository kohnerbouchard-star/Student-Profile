# Production Roadmap and Definition of Done

Status: draft foundation

## Objective

Move from documented concepts to a validated production seed pack through bounded, reviewable tranches.

## Tranche 1: Foundation and governance

Deliverables:

- catalog index;
- program charter;
- canonical registry;
- starting world and timeline;
- economic balance framework;
- narrative framework;
- event and interaction framework;
- contract framework;
- market framework;
- player-economy framework;
- locations and communication framework;
- seeding and fixture policy;
- ten country files;
- four independent reviews.

Exit gate:

- no unresolved canon conflict in official countries or currencies;
- content ownership and identifiers defined;
- major lifecycle concepts defined;
- first review findings recorded;
- no code or schema changes included.

## Tranche 2: Pilot vertical slice

Create a complete Meridian Corridor pilot.

Required content:

- one global arc;
- 10 country perspectives;
- 10 institutions;
- 10 recurring characters;
- 3 companies;
- 1 national or cross-country index example if supported;
- 5 contracts and one contract chain;
- 5 store products;
- 2 banking products;
- 10 interactions;
- 3 mechanical decisions;
- 5 news reports;
- 1 severe disruption;
- 1 recovery sequence;
- 1 resolution and 1 follow-up arc;
- complete fixture scenarios.

Exit gate:

- all references valid;
- decisions mechanically distinct;
- economic effects reviewed;
- technical compatibility mapped;
- unsupported mechanics removed or visibly planned.

## Tranche 3: Country and institution expansion

Deliverables:

- complete country profile fields;
- 5–7 locations per country;
- at least two recurring voices per country;
- institution relationships;
- national objectives;
- country story arcs;
- development contracts;
- event hooks;
- country-specific notification and news variations.

Exit gate:

- every country has strengths and vulnerabilities;
- no country is structurally unplayable;
- country-specific content uses actual differences;
- cultural and classroom-suitability review complete.

## Tranche 4: Market content

Deliverables:

- approximately 30 companies;
- 10 national indexes;
- industries and commodities;
- company financial profiles;
- logos and asset requirements;
- event exposure;
- company story arcs;
- market fixtures.

Exit gate:

- arithmetic passes;
- tickers unique;
- risk and volatility visible;
- no guaranteed-return sequence;
- all corporate actions supported or excluded.

## Tranche 5: Contracts and player economy

Deliverables:

- approximately 50 contracts;
- 10 contract chains;
- 30–40 store products;
- 8–12 bank products;
- 10 levels;
- approximately 20 achievements;
- final reward and price architecture;
- redemption and progression fixtures.

Exit gate:

- reward economy balanced;
- duplicate issuance blocked;
- item effects supported;
- bank arithmetic and affordability tested;
- acquisition times measured;
- classroom policies explicit.

## Tranche 6: Events, news, and interactions

Deliverables:

- 25 standalone events;
- 10 event chains;
- 5 crisis arcs;
- 40–60 interactions;
- 15–20 decision points;
- 25–30 news templates;
- recovery and correction content;
- narrative observability requirements.

Exit gate:

- triggers evaluable;
- effects bounded;
- branches valid;
- delayed consequences scheduled safely;
- severe events recoverable;
- news uses correct fact status.

## Tranche 7: Tutorials and communication

Deliverables:

- 10–12 tutorials;
- lifecycle notifications;
- system and reliability messages;
- search metadata;
- glossary;
- accessibility copy.

Exit gate:

- tutorials safe and replayable;
- notification deduplication defined;
- terminology aligned across Player and Admin;
- planned capabilities clearly labeled.

## Tranche 8: Technical mapping

Deliverables:

- authoritative schema and route mapping;
- supported fields;
- unsupported fields;
- stable ID storage;
- import ordering;
- pack manifest;
- validation design;
- staging and rollback plan.

Exit gate:

- no speculative field mapped as authoritative;
- game-session ownership correct;
- identities and UUID boundaries correct;
- all blocking backend dependencies resolved or deferred.

## Tranche 9: Staging seed implementation

Deliverables:

- technical seed pack;
- staging fixtures;
- preflight tool or equivalent validation;
- idempotent load;
- rollback or deactivation path;
- end-to-end verification.

Exit gate:

- repeated load safe;
- counts and references correct;
- Admin and Player rendering verified;
- no fixture leakage;
- no unsupported capability represented as live.

## Tranche 10: Production release

Deliverables:

- approved manifest;
- release notes;
- production import;
- post-load audit;
- classroom launch checklist;
- monitoring and issue response plan.

## Initial quantity targets

| Domain | Target |
|---|---:|
| Countries | 10 |
| Country currencies | 10 |
| Industries | 12–15 |
| Commodities | about 10 |
| Institutions | 10–15 core, expanding by country |
| Recurring characters | about 20 |
| Companies | about 30 |
| National indexes | 10 |
| Global index | 1 only if supported |
| Contracts | about 50 |
| Contract chains | 10 |
| Store products | 30–40 |
| Bank products | 8–12 |
| Levels | 10 |
| Achievements | about 20 |
| Standalone events | 25 |
| Event chains | 10 |
| Crisis arcs | 5 |
| Interactions | 40–60 |
| Decision points | 15–20 |
| Locations | 50–70 |
| Tutorials | 10–12 |
| Notification templates | 25–30 |

## Cross-domain readiness matrix

Every domain must answer:

- What is reusable canon?
- What is game-session runtime state?
- What is the stable content ID?
- What references does it require?
- What lifecycle states exist?
- What happens on failure, expiry, deactivation, or retirement?
- What economic effects exist?
- What narrative effects exist?
- What Player copy exists?
- What Admin observability is required?
- What is currently supported?
- What remains planned?
- What fixtures verify it?

## Release blockers

Any of the following blocks production:

- unresolved official country or currency conflict;
- duplicate stable ID;
- invalid reference;
- missing required asset without approved fallback;
- company arithmetic error;
- reward or banking exploit;
- unsupported lifecycle represented as active;
- missing recovery for severe event;
- fake or mechanically identical choices;
- session state stored as global canon;
- browser-selectable ownership UUID;
- fixture data in production pack;
- non-idempotent seed operation;
- no rollback or safe deactivation path;
- inconsistent Player and Admin terminology;
- classroom-suitability rejection.

## Production-grade definition of done

The complete seeded-content system is production grade when:

1. Canon is versioned and internally coherent.
2. Every reusable definition has a stable ID.
3. Mutable state is correctly scoped to a game session.
4. Countries are differentiated and viable.
5. Economic indicators and event effects use approved ranges.
6. Reward sources and sinks are balanced together.
7. Company and banking arithmetic passes.
8. Contracts have complete lifecycle, learning, reward, and narrative fields.
9. Inventory and redemption behavior is idempotent and auditable.
10. Story arcs have valid stages, choices, delayed consequences, and resolutions.
11. News represents facts and uncertainty correctly.
12. Characters have consistent authority and voice.
13. Tutorials and notifications use one canonical terminology system.
14. All content is searchable by stable ID and human-facing aliases.
15. Test fixtures are deterministic and environment-restricted.
16. Seed packs are idempotent, versioned, preflighted, and reversible.
17. Staging verification covers Admin and Player behavior.
18. Unsupported capabilities are visibly planned, not falsely connected.
19. Reviews are recorded and blocking findings closed.
20. Production release has manifest, audit, and rollback documentation.

## Immediate execution backlog

1. Complete ten separate country files.
2. Complete four review files against this foundation.
3. Resolve reviewer findings.
4. Add a normalized Meridian pilot catalog.
5. Perform repository compatibility audit against current backend and Player capability contracts.
6. Decide the role, if any, of ECO outside the official country-currency manifest.
7. Build field-level templates for the pilot entities.
8. Produce the first production-shaped content records only after the technical review approves mapping.