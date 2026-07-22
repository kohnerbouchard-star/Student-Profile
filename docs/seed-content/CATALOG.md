# Econovaria Seed Content Catalog

Status: working catalog index
Catalog version: 1.0.0-draft
Branch: `agent/seed-content-foundation-v1`
Pull request: draft PR #161
Scope: documentation-only content architecture and production concepts

## Purpose

This file is the primary navigation index for the Econovaria seeded-content foundation.

Use it to locate content by:

- domain;
- country;
- stable content ID;
- Meridian story role;
- student-facing or reviewer-facing audience;
- current maturity and implementation status.

The catalog does not mean every concept is mechanically supported. Each entity file states whether it is:

- definition only;
- metadata candidate;
- mapped to an existing authoritative model;
- blocked on backend reconciliation;
- awaiting economic, narrative, gameplay, or technical review.

## Catalog conventions

- One production-targeted entity per file.
- UUIDs remain authoritative database identities where current systems use them.
- Human-readable stable content IDs support catalog relationships and search; their runtime persistence owner is unresolved.
- Reusable definitions never contain live player, game-session, market, balance, or story-instance state.
- Runtime country economics, events, prices, choices, assignments, Contracts, rewards, holdings, and outcomes remain game-session scoped.
- Files marked draft are not production seed records.

# 1. Program governance and architecture

| File | Purpose |
|---|---|
| `README.md` | Catalog entrypoint and current scope. |
| `00-program-charter.md` | Program objective, workstreams, gates, and exclusions. |
| `01-canonical-identity-and-stable-ids.md` | Identity, canonical keys, UUID boundaries, and stable-ID rules. |
| `02-world-premise-starting-situation-and-timeline.md` | Initial world premise and historical foundation. |
| `03-economic-system-and-balance-framework.md` | Economic indicators, balance philosophy, and review requirements. |
| `04-story-narrative-and-interaction-framework.md` | Narrative hierarchy, state, choices, and continuity. |
| `05-institution-and-character-framework.md` | Institution authority and recurring-character design. |
| `06-event-news-and-interaction-framework.md` | Event, news, interaction, correction, and consequence framework. |
| `07-contract-content-framework.md` | Contract structure, lifecycle, rewards, and instructional use. |
| `08-company-stock-and-market-framework.md` | Company, stock-template, market, and event-exposure framework. |
| `09-store-inventory-banking-and-progression-framework.md` | Store, inventory, banking, lending, progression, and achievement framework. |
| `10-location-tutorial-notification-and-system-copy-framework.md` | Locations, tutorials, notifications, and system language. |
| `11-seeding-environments-fixtures-and-validation.md` | Environment separation, fixtures, validation, staging, and rollback. |
| `12-production-roadmap-and-definition-of-done.md` | Production sequence, deliverables, gates, and completion criteria. |
| `13-current-system-compatibility-matrix.md` | Code-verified mapping to current country, stock, Contract, Store, Attendance, currency, Admin, and Player systems. |
| `14-country-baseline-and-viability-model.md` | Current shared baseline, candidate differentiated pack, diagnostic scores, and stress-test requirements. |
| `templates/entity-file-standard.md` | Required one-entity file format, review block, and machine-conversion readiness. |
| `currencies/currency-architecture-v1.md` | ECO and local-currency roles, conversion architecture, current conflicts, and recommended transaction model. |
| `world/econovaria-relative-chronology-v1.md` | CEE chronology, institutional anchors, company-history rules, and CEE 100 game opening. |

# 2. Country design catalogs

Directory: `countries/`

| Country | Stable ID | File |
|---|---|---|
| Northreach | `country.global.northreach.v1` | `countries/northreach.md` |
| Yrethia | `country.global.yrethia.v1` | `countries/yrethia.md` |
| Thaloris | `country.global.thaloris.v1` | `countries/thaloris.md` |
| Solvend | `country.global.solvend.v1` | `countries/solvend.md` |
| Eldoran | `country.global.eldoran.v1` | `countries/eldoran.md` |
| Valerion | `country.global.valerion.v1` | `countries/valerion.md` |
| Lumenor | `country.global.lumenor.v1` | `countries/lumenor.md` |
| Xalvoria | `country.global.xalvoria.v1` | `countries/xalvoria.md` |
| Dravenlok | `country.global.dravenlok.v1` | `countries/dravenlok.md` |
| Syndalis | `country.global.syndalis.v1` | `countries/syndalis.md` |

Supporting index:

- `countries/README.md`

Each country file catalogs:

- player-facing strategic promise;
- strengths and vulnerabilities;
- external dependencies;
- currency concept;
- industries and commodities;
- institutions and recurring characters;
- company directions;
- Meridian role;
- early and transformation arcs;
- event, Contract, Store, banking, achievement, location, and news directions;
- balance, classroom, sensitivity, and technical constraints.

# 3. Student country briefings

Directory: `briefings/countries/`

| Country | Stable briefing ID | File |
|---|---|---|
| Northreach | `briefing.player.country.northreach.v1` | `briefings/countries/northreach.md` |
| Yrethia | `briefing.player.country.yrethia.v1` | `briefings/countries/yrethia.md` |
| Thaloris | `briefing.player.country.thaloris.v1` | `briefings/countries/thaloris.md` |
| Solvend | `briefing.player.country.solvend.v1` | `briefings/countries/solvend.md` |
| Eldoran | `briefing.player.country.eldoran.v1` | `briefings/countries/eldoran.md` |
| Valerion | `briefing.player.country.valerion.v1` | `briefings/countries/valerion.md` |
| Lumenor | `briefing.player.country.lumenor.v1` | `briefings/countries/lumenor.md` |
| Xalvoria | `briefing.player.country.xalvoria.v1` | `briefings/countries/xalvoria.md` |
| Dravenlok | `briefing.player.country.dravenlok.v1` | `briefings/countries/dravenlok.md` |
| Syndalis | `briefing.player.country.syndalis.v1` | `briefings/countries/syndalis.md` |

These files provide assignment-equivalent evidence and decision quality across all ten countries.

# 4. Global story and classroom operation

| Stable ID | File | Purpose |
|---|---|---|
| `story-arc.global.meridian-corridor.v1` | `story-arcs/global/meridian-corridor.md` | First production-shaped global arc. |
| `resolution-model.global.meridian-corridor.v1` | `story-arcs/global/meridian-resolution-model.md` | Deterministic and instructor-compatible outcome model. |
| `operation-model.global.meridian-classroom.v1` | `story-arcs/global/meridian-classroom-operation.md` | Five-period classroom cadence, group modes, workload, and accessibility. |
| `policy.story-arc.meridian-cancellation.v1` | `story-arcs/global/meridian-cancellation-matrix.md` | Stage-specific cancellation, supersession, correction, and accepted-work behavior. |
| `policy.narrative.cross-arc-concurrency.v1` | `story-arcs/cross-arc-concurrency-policy.md` | Arc classes, suppression families, priority, merge, pause, and effect-order rules. |

# 5. Global student briefings

| Stable ID | File |
|---|---|
| `briefing.player.meridian-overview.v1` | `briefings/global/meridian-player-briefing.md` |
| `briefing.player.meridian-models.v1` | `briefings/global/meridian-models-briefing.md` |

# 6. Institutions

## 6.1 Lead institutions

| Country | Stable ID | File |
|---|---|---|
| Lumenor | `institution.lumenor.starfall-meridian-forum.v1` | `institutions/lumenor/starfall-meridian-forum.md` |
| Northreach | `institution.northreach.strategic-resources-office.v1` | `institutions/northreach/strategic-resources-office.md` |
| Yrethia | `institution.yrethia.maritime-insurance-council.v1` | `institutions/yrethia/maritime-insurance-council.md` |
| Thaloris | `institution.thaloris.dusk-harbor-commercial-authority.v1` | `institutions/thaloris/dusk-harbor-commercial-authority.md` |
| Solvend | `institution.solvend.advanced-systems-consortium.v1` | `institutions/solvend/advanced-systems-consortium.md` |
| Eldoran | `institution.eldoran.commodity-stability-board.v1` | `institutions/eldoran/commodity-stability-board.md` |
| Valerion | `institution.valerion.water-energy-commission.v1` | `institutions/valerion/water-energy-commission.md` |
| Xalvoria | `institution.xalvoria.development-authority.v1` | `institutions/xalvoria/development-authority.md` |
| Dravenlok | `institution.dravenlok.industrial-coordination-ministry.v1` | `institutions/dravenlok/industrial-coordination-ministry.md` |
| Syndalis | `institution.syndalis.network-security-directorate.v1` | `institutions/syndalis/network-security-directorate.md` |

## 6.2 Independent and supporting institutions

| Country | Stable ID | File |
|---|---|---|
| Northreach | `institution.northreach.northern-workers-federation.v1` | `institutions/northreach/northern-workers-federation.md` |
| Yrethia | `institution.yrethia.dockworkers-logistics-guild.v1` | `institutions/yrethia/dockworkers-logistics-guild.md` |
| Thaloris | `institution.thaloris.trade-legitimacy-commission.v1` | `institutions/thaloris/trade-legitimacy-commission.md` |
| Solvend | `institution.solvend.skilled-talent-mobility-council.v1` | `institutions/solvend/skilled-talent-mobility-council.md` |
| Eldoran | `institution.eldoran.consumer-price-council.v1` | `institutions/eldoran/consumer-price-council.md` |
| Valerion | `institution.valerion.public-water-access-office.v1` | `institutions/valerion/public-water-access-office.md` |
| Lumenor | `institution.lumenor.starfall-public-media-trust.v1` | `institutions/lumenor/starfall-public-media-trust.md` |
| Xalvoria | `institution.xalvoria.project-accountability-office.v1` | `institutions/xalvoria/project-accountability-office.md` |
| Dravenlok | `institution.dravenlok.workers-congress.v1` | `institutions/dravenlok/workers-congress.md` |
| Syndalis | `institution.syndalis.data-rights-tribunal.v1` | `institutions/syndalis/data-rights-tribunal.md` |

# 7. Recurring characters

## 7.1 Lead characters

| Country | Character | Stable ID | File |
|---|---|---|---|
| Lumenor | Ila Meren | `character.lumenor.ila-meren.v1` | `characters/lumenor/ila-meren.md` |
| Northreach | Darek Voss | `character.northreach.darek-voss.v1` | `characters/northreach/darek-voss.md` |
| Yrethia | Mira Sen | `character.yrethia.mira-sen.v1` | `characters/yrethia/mira-sen.md` |
| Thaloris | Tovan Rell | `character.thaloris.tovan-rell.v1` | `characters/thaloris/tovan-rell.md` |
| Solvend | Dr. Sena Oris | `character.solvend.sena-oris.v1` | `characters/solvend/sena-oris.md` |
| Eldoran | Halden Marr | `character.eldoran.halden-marr.v1` | `characters/eldoran/halden-marr.md` |
| Valerion | Elia Varen | `character.valerion.elia-varen.v1` | `characters/valerion/elia-varen.md` |
| Xalvoria | Cassian Rhyl | `character.xalvoria.cassian-rhyl.v1` | `characters/xalvoria/cassian-rhyl.md` |
| Dravenlok | Mara Volsk | `character.dravenlok.mara-volsk.v1` | `characters/dravenlok/mara-volsk.md` |
| Syndalis | Neris Vale | `character.syndalis.neris-vale.v1` | `characters/syndalis/neris-vale.md` |

## 7.2 Supporting characters

| Country | Character | Stable ID | File |
|---|---|---|---|
| Northreach | Rian Kest | `character.northreach.rian-kest.v1` | `characters/northreach/rian-kest.md` |
| Yrethia | Nadi Oran | `character.yrethia.nadi-oran.v1` | `characters/yrethia/nadi-oran.md` |
| Thaloris | Sera Noll | `character.thaloris.sera-noll.v1` | `characters/thaloris/sera-noll.md` |
| Solvend | Amara Tey | `character.solvend.amara-tey.v1` | `characters/solvend/amara-tey.md` |
| Eldoran | Eren Vale | `character.eldoran.eren-vale.v1` | `characters/eldoran/eren-vale.md` |
| Valerion | Sola Merin | `character.valerion.sola-merin.v1` | `characters/valerion/sola-merin.md` |
| Lumenor | Dena Sol | `character.lumenor.dena-sol.v1` | `characters/lumenor/dena-sol.md` |
| Xalvoria | Nara Esen | `character.xalvoria.nara-esen.v1` | `characters/xalvoria/nara-esen.md` |
| Dravenlok | Ilya Dren | `character.dravenlok.ilya-dren.v1` | `characters/dravenlok/ilya-dren.md` |
| Syndalis | Asha Coren | `character.syndalis.asha-coren.v1` | `characters/syndalis/asha-coren.md` |

# 8. Meridian Contracts

| Stable ID | File |
|---|---|
| `contract.meridian.evaluate-corridor.v1` | `contracts/meridian/evaluate-corridor.md` |
| `contract.meridian.analyze-country-exposure.v1` | `contracts/meridian/analyze-country-exposure.md` |
| `contract.meridian.compare-financing-governance.v1` | `contracts/meridian/compare-financing-governance.md` |
| `contract.meridian.respond-first-disruption.v1` | `contracts/meridian/respond-first-disruption.md` |
| `contract.meridian.review-outcome.v1` | `contracts/meridian/review-outcome.md` |

# 9. Contract rubrics

| Contract | File |
|---|---|
| Evaluate Corridor | `rubrics/meridian/evaluate-corridor-rubric.md` |
| Country Exposure | `rubrics/meridian/analyze-country-exposure-rubric.md` |
| Financing and Governance | `rubrics/meridian/compare-financing-governance-rubric.md` |
| First Disruption | `rubrics/meridian/respond-first-disruption-rubric.md` |
| Outcome Review | `rubrics/meridian/review-outcome-rubric.md` |

# 10. Meridian event definitions

| Stable ID | File |
|---|---|
| `event.meridian.forum-announced.v1` | `events/meridian/forum-announced.md` |
| `event.meridian.sableport-capacity-warning.v1` | `events/meridian/sableport-capacity-warning.md` |
| `event.meridian.eldoran-harvest-revision.v1` | `events/meridian/eldoran-harvest-revision.md` |
| `event.meridian.northreach-export-review.v1` | `events/meridian/northreach-export-review.md` |
| `event.meridian.valerion-reservoir-warning.v1` | `events/meridian/valerion-reservoir-warning.md` |
| `event.meridian.solvend-talent-constraint.v1` | `events/meridian/solvend-talent-constraint.md` |
| `event.meridian.customs-security-intrusion.v1` | `events/meridian/customs-security-intrusion.md` |

Quantitative mapping:

- `events/effect-band-mapping-v1.md`

# 11. Meridian interaction definitions

| Stable ID | File |
|---|---|
| `interaction.meridian.invitation-to-starfall.v1` | `interactions/meridian/invitation-to-starfall.md` |
| `interaction.meridian.mineral-access-proposal.v1` | `interactions/meridian/mineral-access-proposal.md` |
| `interaction.meridian.port-compliance-warning.v1` | `interactions/meridian/port-compliance-warning.md` |
| `interaction.meridian.alternate-route-offer.v1` | `interactions/meridian/alternate-route-offer.md` |
| `interaction.meridian.technology-ownership-request.v1` | `interactions/meridian/technology-ownership-request.md` |
| `interaction.meridian.food-security-alert.v1` | `interactions/meridian/food-security-alert.md` |
| `interaction.meridian.environmental-energy-condition.v1` | `interactions/meridian/environmental-energy-condition.md` |
| `interaction.meridian.infrastructure-financing-offer.v1` | `interactions/meridian/infrastructure-financing-offer.md` |
| `interaction.meridian.manufacturing-guarantee.v1` | `interactions/meridian/manufacturing-guarantee.md` |
| `interaction.meridian.cybersecurity-warning.v1` | `interactions/meridian/cybersecurity-warning.md` |

# 12. Company and stock-template enrichment

These files enrich existing authoritative global stock templates; they do not create duplicate companies.

| Ticker | Company | Stable ID | File |
|---|---|---|---|
| AURA | Aurora Aerospace Systems | `company.solvend.aurora-aerospace-systems.v1` | `companies/solvend/aurora-aerospace-systems.md` |
| XFIN | Xalvoria Infrastructure Finance | `company.xalvoria.xalvoria-infrastructure-finance.v1` | `companies/xalvoria/xalvoria-infrastructure-finance.md` |
| IRST | Ironhold Steel Works | `company.dravenlok.ironhold-steel-works.v1` | `companies/dravenlok/ironhold-steel-works.md` |

# 13. Meridian news and corrections

| Stable ID | File |
|---|---|
| `news.meridian.forum-announced.v1` | `news/meridian/forum-announced.md` |
| `news.meridian.sableport-capacity-warning.v1` | `news/meridian/sableport-capacity-warning.md` |
| `news.meridian.eldoran-harvest-revision.v1` | `news/meridian/eldoran-harvest-revision.md` |
| `news.meridian.northreach-export-review.v1` | `news/meridian/northreach-export-review.md` |
| `news.meridian.valerion-reservoir-warning.v1` | `news/meridian/valerion-reservoir-warning.md` |
| `news.meridian.solvend-talent-constraint.v1` | `news/meridian/solvend-talent-constraint.md` |
| `news.meridian.customs-security-intrusion.v1` | `news/meridian/customs-security-intrusion.md` |
| `news.meridian.security-attribution-correction.v1` | `news/meridian/security-attribution-correction.md` |
| `news.meridian.outcome-centralized.v1` | `news/meridian/outcome-centralized-corridor.md` |
| `news.meridian.outcome-multilateral.v1` | `news/meridian/outcome-multilateral-corridor.md` |
| `news.meridian.outcome-regional.v1` | `news/meridian/outcome-regional-corridors.md` |
| `news.meridian.outcome-suspended.v1` | `news/meridian/outcome-suspended-corridor.md` |

# 14. Independent review records

## Iteration 1

- `reviews/economic-balance-review-v1.md`
- `reviews/narrative-continuity-review-v1.md`
- `reviews/gameplay-learning-review-v1.md`
- `reviews/technical-compatibility-review-v1.md`

## Iteration 2

- `reviews/economic-balance-review-v2.md`
- `reviews/narrative-continuity-review-v2.md`
- `reviews/gameplay-learning-review-v2.md`
- `reviews/technical-compatibility-review-v2.md`

The review records are retained rather than overwritten so reviewers can see which blockers were closed and which remain.

# 15. Current coverage summary

| Domain | Current catalog coverage | Current readiness |
|---|---:|---|
| Country design profiles | 10 of 10 | Complete draft set |
| Student country briefings | 10 of 10 | Complete draft set |
| Lead institutions | 10 of 10 | Complete draft set |
| Supporting institutions | 10 of 10 | Complete draft set |
| Lead characters | 10 of 10 | Complete draft set |
| Supporting characters | 10 of 10 | Complete draft set |
| Meridian Contracts | 5 of 5 pilot chain | Complete draft set |
| Meridian rubrics | 5 of 5 | Complete draft set |
| Meridian core events | 7 | Complete pilot set |
| Meridian lead interactions | 10 | Complete pilot set |
| Meridian news and outcomes | 12 | Complete pilot set |
| Global player briefings | 2 | Complete pilot set |
| Company enrichments | 3 existing templates | Pilot sample only |
| Economic effect bands | 1 controlled mapping | Simulation draft |
| Country baseline model | Current baseline plus 10-country candidate pack | Simulation draft only |
| Currency architecture | Current behavior audited | Decision draft |
| Story persistence | Framework only | Blocked/unverified |
| Store production items | Framework only | Not yet cataloged as individual production records |
| Banking products | Framework only | Blocked/unverified |
| Progression and achievements | Framework only | Blocked/unverified |
| Named sub-country locations | Country directions only | Planned |
| Tutorials and notifications | Framework only | Individual records pending |

# 16. Production blockers

The catalog must not become technical seed data until these blockers are resolved:

1. Final backend and Player capability baseline after the reconciliation tranche.
2. ECO and local-currency transaction architecture across Attendance, Contracts, Store, ledger, stocks, and future banking.
3. Event-application authorization, additive semantics, idempotency, replay protection, and recovery.
4. Stable content-ID persistence owner and uniqueness model.
5. Narrative stage, interaction, decision, delayed-effect, and resolution persistence strategy.
6. Contract prerequisite, chain, event binding, revision, grace, and cancellation mapping.
7. Redemption backend and lifecycle availability.
8. Banking and progression authoritative contracts.
9. Full company universe and exact market-balance validation.
10. Unified reward, price, interest, progression, and Store-affordability simulation.
11. Country stress testing and event-band calibration.
12. Searchable manifest and domain-adapter design for future staging import.
13. Branch synchronization with the latest `main` before merge.

# 17. Search examples

Repository searches can use:

- exact stable ID, such as `interaction.meridian.cybersecurity-warning.v1`;
- ticker, such as `AURA`;
- country code, such as `NORTHREACH`;
- institution name, such as `Starfall Public Media Trust`;
- topic family, such as `food security`, `data access`, `port capacity`, or `debt concentration`;
- maturity marker, such as `Maturity: draft`;
- implementation marker, such as `Implementation status:`;
- review state, such as `technical: pending` or `changes required`.

# 18. Catalog maintenance rules

- Add every new entity to this index in the same tranche that creates the file.
- Never reuse a stable content ID.
- Never silently rename a canonical country code, currency code, ticker, or event key.
- Deprecate rather than delete approved records.
- Keep student-facing copy separate from design, reviewer, and technical notes.
- Preserve superseded review iterations.
- Update coverage and blocker tables after every major iteration.
- Run reference, duplicate-ID, and scope validation before requesting merge.
