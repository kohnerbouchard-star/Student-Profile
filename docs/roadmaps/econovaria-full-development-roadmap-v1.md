# Econovaria Full Development Roadmap

**Document ID:** `ECON-FULL-ROADMAP-V1`  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Created:** 2026-07-23  
**Status:** Proposed repository-owned roadmap  
**Production authorized:** No  

## 1. Purpose

This document defines the end-to-end development sequence from the current serial feature queue through Econovaria v1.0 production completion.

It complements, rather than silently replaces, the existing beta completion ledger and controller records. Live pull-request metadata, current `main`, exact migration state, workflow results, staging state, and product-owner decisions remain authoritative whenever they differ from a historical statement in this document.

## 2. Definition of game-development completion

Econovaria v1.0 is complete only when the game is:

- feature-complete for the approved v1.0 scope;
- production-deployed from an immutable tested artifact;
- calibrated across all ten countries and approved difficulties;
- playable as a complete campaign rather than a collection of isolated systems;
- secure, observable, recoverable, accessible, and supportable;
- independent of provisional migrations and unknown legacy runtime paths;
- operable by a teacher without developer intervention;
- free of unresolved P0/P1 security, integrity, or availability defects.

The authoritative game loop is:

> An administrator creates and configures a game. A player joins as a new immigrant, receives a country and starting package, earns money through attendance and Contracts, buys and uses items, trades financial assets, builds businesses, crafts goods, participates in the Marketplace, communicates, develops skills and reputation, travels through the world, and experiences rivalry, war, adaptation, and reconstruction while the administrator supervises, corrects, moderates, and audits the simulation.

## 3. Current program position

The project has materially completed or merged the following foundations:

- authenticated Player and Admin boundaries;
- attendance and classroom economy;
- Contracts;
- Store purchasing and inventory redemption;
- stock market, Portfolio, and Banking foundations;
- Seed content authority;
- World, arrival, geography, travel, residency, and campaign foundations;
- Business, Banking, savings, loans, and credit;
- Items, effects, equipment, materials, salvage, and Crafting;
- Player Marketplace;
- core lifecycle, security, frontend, and release-preparation controls.

The immediate serial queue is:

```text
Messaging #248
    ↓
Progression #261
    ↓
Roadmap re-baseline
    ↓
Final connected release gate #295
    ↓
Beta pilot
    ↓
Architecture stabilization
    ↓
Full Financial Markets #305
    ↓
Content, balance, UX, privacy, and accessibility completion
    ↓
Econovaria v1.0 release
```

## 4. Phase 1 — Complete Messaging

**Authority:** PR #248, branch `agent/messaging-communication-v1`  
**Position:** Immediate critical path

### Scope

Messaging must provide:

- Player threads;
- teacher announcements;
- system threads;
- Contract-linked threads;
- participant-only access;
- same-game participant lookup through public identifiers;
- participant addition and removal;
- idempotent thread creation and message sends;
- read receipts and monotonic read state;
- unread counts;
- bounded private search and cursor pagination;
- closing, disabling, hiding, and reversible moderation;
- immutable moderation audit;
- retention and deletion enforcement;
- metadata-only Notifications integration;
- Player and Admin interfaces;
- per-action, per-player, per-staff, per-thread, per-game, and per-IP abuse controls;
- wrong-game, removed-participant, hidden-participant, pause, ended-game, and expired-session denial.

Attachments remain disabled and must fail closed.

### Required completion work

1. Freeze the final candidate head.
2. Preserve exactly the assigned four-slot Messaging migration family.
3. Prove no provisional or fifth Messaging migration remains.
4. Replay the database from zero twice.
5. Run database lint.
6. Run complete Backend, Player, Admin, desktop, mobile, accessibility, privacy, moderation, retention, and rate-limit verification.
7. Execute protected isolated-staging acceptance.
8. Verify cleanup and zero synthetic residue.
9. Confirm zero unresolved review threads.
10. Merge PR #248 through the controller.
11. Hand the exact merge SHA, migration family, public contracts, and rollback notes to Progression.

### Exit gate

Messaging is merged, exact-head green, staging-accepted, abuse-resistant, residue-free, and production-neutral.

## 5. Phase 2 — Complete Progression

**Authority:** PR #261, branch `agent/progression-reputation-achievements-v1`  
**Dependency:** Exact Messaging merge SHA

### Scope

Progression must provide:

- experience and bounded level curves;
- skills and prerequisites;
- atomic skill unlock;
- achievements and immutable completion state;
- atomic reward claims;
- country, career, story, and relationship reputation;
- public and private Player fields;
- filtered public profiles;
- Admin review, correction, and immutable audit;
- event compatibility for Business, Crafting, Marketplace, and Story;
- duplicate, delayed, out-of-order, stale, malformed, and conflicting event handling;
- idempotent replay and committed-success retry;
- pause, ended-game, wrong-game, wrong-player, and expired-session denial;
- progression-speed, concentration, farming, inflation, and dominant-path simulation.

### Required completion work

1. Assign the final post-Messaging migration range.
2. Rekey provisional Progression migrations exactly once.
3. Synchronize once with final post-Messaging `main`.
4. Reconstruct shared Classroom API, Admin API, capability, rate-limit, Player endpoint, resource, invalidation, and Admin boot files additively.
5. Prove stable event compatibility with all merged predecessor domains.
6. Replay the database from zero twice and lint.
7. Run complete exact-head CI.
8. Execute isolated-staging acceptance.
9. Re-run progression-speed and exploit simulations.
10. Merge PR #261 through the controller.

### Exit gate

Experience, skills, achievements, rewards, and reputation are atomic, balanced, private where required, event-compatible, and merged into the complete game runtime.

## 6. Phase 3 — Re-baseline and lock the roadmap

After Progression merges, the repository must be re-audited before additional shared architecture or expansion integration.

### Required work

- fetch current `main`;
- inventory all open PRs and branches;
- recalculate every stable roadmap item;
- mark merged World, Business, Crafting, Marketplace, Messaging, and Progression work accurately;
- remove stale pause, migration, branch, and dependency statements;
- publish the canonical migration sequence;
- update capability ownership;
- identify remaining beta and v1.0 work;
- define the exact v1.0 scope lock;
- prohibit unowned expansion work after scope lock unless required for security, integrity, accessibility, legal compliance, or release reliability.

### Exit gate

One current roadmap exists, one owner exists per remaining capability, and no implementation decision depends on stale status records.

## 7. Phase 4 — Assemble the immutable beta release

**Authority:** PR #295, branch `agent/production-integration-gate-v1`

### Release identity

The final release must bind:

- exact source SHA;
- exact artifact digest;
- canonical migration head;
- migration-set digest;
- Edge Function inventory and digests;
- frontend artifact identity;
- runtime configuration identity;
- capability-manifest identity;
- Seed pack identity and digest;
- staging project identity;
- explicit production-project denial during acceptance.

### Required work

1. Synchronize release tooling with final post-Progression `main`.
2. Build the immutable frontend and Edge Function artifacts.
3. Generate the signed or hashed release manifest.
4. Reconcile repository and staging migration history.
5. Preserve staging drift through forward-only reconciliation.
6. Deploy the exact application functions to isolated staging.
7. Deploy the exact Player and Admin frontend artifacts.
8. Run connected Player and Admin smoke.
9. Run every domain acceptance matrix.
10. Verify cleanup and zero synthetic residue.
11. Prove production was not modified.

### Exit gate

A single reviewed artifact can be identified, promoted unchanged, tested, rolled back, and reconstructed from evidence.

## 8. Phase 5 — Security and operational readiness

### 8.1 Authentication and authorization

- verify platform JWT enforcement;
- verify server-side `auth.getUser` validation;
- authorize staff through controlled metadata and repository-owned staff records;
- verify game ownership on every Admin operation;
- derive Player and game scope from authenticated sessions;
- deny wrong-game, wrong-player, removed-user, hidden-user, expired, revoked, paused, ended, and archived access;
- prevent ownership UUIDs from reaching URLs, payloads, DTOs, logs, fixtures, or rendered output;
- rotate all legacy credentials.

### 8.2 API boundaries

- introduce strict shared request parsing;
- enforce permitted methods;
- enforce `application/json` where required;
- enforce endpoint-specific body-size limits;
- reject malformed JSON and unknown keys;
- standardize correlation IDs;
- standardize sanitized error responses;
- enforce route-specific rate limits;
- verify shared-school-NAT behavior;
- reject duplicate, replayed, and conflicting idempotency use.

### 8.3 Legacy runtime retirement

For every legacy route:

1. inventory current consumers;
2. observe traffic over a representative classroom window;
3. identify the modern replacement;
4. move callers without dual writes;
5. block new legacy writes;
6. rotate embedded credentials;
7. disable through an approved maintenance window;
8. monitor rollback conditions;
9. delete only after the observation period.

### 8.4 Recovery and observability

- create encrypted off-platform backups;
- verify artifact and encryption metadata;
- restore into a distinct isolated target;
- verify schema, policies, functions, and row-count contracts;
- record and rehearse RPO/RTO;
- activate structured logs, dashboards, and alerts;
- run partial-outage exercises;
- capture query plans under realistic load;
- verify zero test residue and no temporary privileged functions.

### Exit gate

The beta is secure, observable, recoverable, supportable, and no longer dependent on unknown legacy execution paths.

## 9. Phase 6 — Complete connected beta acceptance

Run the complete staging-backed acceptance against the exact immutable release.

### Required scenarios

- Admin signs in and creates/configures a game.
- Players are created, assigned countries, and receive credentials.
- Player joins and completes arrival onboarding and class selection.
- Attendance issues exactly one local-currency reward.
- Player accepts, submits, revises, and completes a Contract.
- Contract cash and item rewards issue exactly once.
- Player obtains a Store quote and purchases an item.
- Inventory updates and redemption completes.
- Player crafts, equips, repairs, salvages, or uses approved items.
- Player creates, activates, purchases, cancels, disputes, or settles Marketplace listings as authorized.
- Market ticks update.
- Player adds a watchlist item and executes buy/sell activity.
- Portfolio and Banking reconcile.
- Business operations, staffing, production, credit, and loan paths settle.
- Messaging works for valid participants and denies invalid scope.
- Moderation, retention, search, and unread state work.
- Progression awards experience, skills, achievements, and reputation once.
- Story events activate news, notifications, Contracts, scarcity, and market effects.
- Travel, residency, and route disruption work.
- Admin reviews logs, moderation, corrections, and audit history.
- Session expiry exits safely.
- Offline, timeout, ambiguous-write, and retry behavior do not duplicate mutations.
- Cross-game access is denied.
- Pause blocks mutations without corrupting reads.
- Ended and archived games block new writes.
- Backup and restore preserve authoritative state.

### Load profiles

- expected classroom load: 30 Players;
- maximum supported beta load: 40 Players;
- bounded request rate;
- phased ramp-up and cooldown;
- synthetic identities and deterministic idempotency keys;
- replay, pause, ended-game, session-expiry, partial-outage, and cleanup scenarios.

### Exit gate

The exact release passes the complete connected matrix at classroom scale with no unresolved security or integrity defect.

## 10. Phase 7 — Classroom beta pilot and stabilization

### Pilot controls

- define class and Player limits;
- define support hours;
- define data retention and privacy terms;
- define daily health review;
- define rollback rules;
- define P0/P1 stop conditions;
- record defects and feedback in the roadmap;
- require immediate rollback for economic corruption, cross-game leakage, credential exposure, or unrecoverable state divergence.

### Stabilization work

- fix every P0 and P1 defect;
- correct repeated P2 usability failures;
- correct economic exploits and dominant loops;
- measure onboarding abandonment and confusion;
- measure teacher workload;
- review rate limits under shared school networks;
- review database and function performance;
- rerun the complete pilot after material corrections.

### Exit gate

Two consecutive pilot runs complete without unresolved P0/P1 defects, unexplained economic corruption, or unacceptable teacher intervention.

## 11. Phase 8 — Architectural refactor for v1.0

This phase begins only after the beta candidate is stable.

### 11.1 Characterization contracts

Capture current behavior before restructuring:

- route contracts;
- request and response DTOs;
- capability manifests;
- authentication and authorization behavior;
- rate limits;
- resource invalidation;
- game-clock behavior;
- error responses;
- replay and committed-success behavior.

### 11.2 Declarative route registry

Replace long central dispatch chains with domain route descriptors containing:

- route key;
- method;
- path matcher;
- authentication class;
- authorization class;
- rate-limit class;
- body-size limit;
- capability key;
- handler;
- request and response schema references.

### 11.3 Single API contract authority

Derive or generate from one repository-owned definition:

- Backend registration;
- Player endpoint mapping;
- Admin endpoint mapping;
- capability manifest;
- request schema;
- response schema;
- contract fixtures;
- documentation;
- parity tests.

### 11.4 Browser-safe DTO boundary

- retain internal UUIDs only inside persistence and trusted services;
- introduce opaque public and Admin references;
- translate references after authorization;
- automate UUID-leakage rejection;
- preserve mutable Player ID as the Player-facing identifier.

### 11.5 Canonical game clock

The backend must issue:

- game timezone;
- authoritative UTC timestamp;
- game-local date;
- market date and state;
- lifecycle state;
- clock version.

Attendance, Contracts, Markets, Story, Messaging retention, Progression, Travel, Business, Crafting, and Marketplace must consume that authority rather than hardcoded or browser-local dates.

### 11.6 Secure session gateway

Target architecture:

- same-origin session gateway or BFF;
- `HttpOnly`, `Secure`, and appropriate `SameSite` cookies;
- no refresh token in application JavaScript;
- CSRF protection for cookie-authenticated mutations;
- short-lived sessions;
- explicit revocation;
- compatibility migration before removal of header-token behavior.

### 11.7 Admin de-bundling

Migrate bounded Admin contexts incrementally while preserving the accepted visual system:

1. Settings;
2. Attendance;
3. Players;
4. Inventory;
5. Contracts;
6. Marketplace;
7. Messaging;
8. Progression;
9. Story and World controls;
10. Overview.

### Exit gate

The application has one coherent integration architecture without changing approved game semantics.

## 12. Phase 9 — Complete Financial Markets

**Authority:** PR #305, branch `agent/full-financial-markets-expansion-v1`  
**Current boundary:** Isolated domain work only until controller authorization

### Content and registries

- editorially review the 3,200-instrument library;
- finalize issuer registry;
- complete sectors, industries, exchanges, commodities, and benchmarks;
- select bounded active subsets by country;
- keep the remaining universe inactive by default.

### Instruments

- common equities;
- corporate bonds;
- sovereign and agency bonds;
- preferred equity;
- approved convertible behavior;
- ETFs and holdings;
- listed trusts;
- indexes;
- commodity and sector benchmarks.

### Fixed income

- coupon schedules;
- clean and dirty prices;
- accrued interest;
- maturity settlement;
- yield curves;
- duration and convexity;
- credit spread;
- issuer default and recovery;
- exactly-once coupon and maturity payments.

### Trading

- price-time-priority order books;
- maker limit orders;
- reservations;
- cancellation and replacement;
- partial fills;
- exchange hours;
- fees and market rules;
- crossed-book prevention;
- self-trade prevention;
- replay and stale-version protection;
- manipulation and wash-trading resistance.

### Analytics

- realized and unrealized return;
- exposure by issuer, country, sector, and asset class;
- duration and convexity;
- liquidity;
- drawdown;
- concentration;
- deterministic scenario loss.

### Publication

- final migrations;
- Classroom and Admin APIs;
- capability contracts;
- Player Terminal surfaces;
- Admin oversight;
- staging acceptance;
- simulations and performance gates;
- release integration.

Short selling, derivatives, unrestricted complex pricing, real-world feeds, physical commodity delivery, and automatic activation of all 3,200 definitions remain disabled unless separately approved.

### Exit gate

A bounded multi-asset market operates coherently without unbounded complexity, state divergence, or exploitable settlement behavior.

## 13. Phase 10 — Complete content breadth

### Ten-country coverage

Every country must have:

- arrival package;
- class variants;
- calibrated starting economy;
- Store catalog;
- Contract library;
- Business and employment opportunities;
- active financial instruments;
- items and recipes;
- locations and routes;
- news and notification styles;
- story events and crisis reactions;
- reconstruction outcomes;
- late-player and failure-recovery paths.

### Campaign completion

The complete campaign must cover:

1. immigrant arrival;
2. economic opportunity;
3. Meridian boom;
4. rivalry and shortages;
5. political hostility;
6. Meridian attack with uncertain attribution;
7. open conflict;
8. civilian economic adaptation;
9. loyalty, residency, and relationship pressure;
10. ceasefire, continued conflict, or reconstruction.

The player remains economically influential without automatically becoming a national leader or military commander.

### Content requirements

- tutorial Contract chains;
- country- and difficulty-specific Contracts;
- Business opportunities;
- approved Crafting recipes;
- Marketplace supply patterns;
- Messaging and announcement content;
- Achievement and reputation conditions;
- Story-linked choices and consequences;
- News, notifications, and Admin guidance;
- recovery content for late or unsuccessful Players.

### Exit gate

Every country supports a complete, understandable, replayable, and balanced campaign rather than a technical demonstration.

## 14. Phase 11 — Economic balance and exploit resistance

Run deterministic and connected simulations across:

- all ten countries;
- every approved difficulty;
- every arrival class;
- early, middle, and late campaign;
- peace, shortage, war, and reconstruction;
- new and experienced Players;
- 30- and 40-Player sessions.

Validate:

- income and affordability;
- inflation and currency conversion;
- Contract reward pacing;
- Store scarcity and restock;
- Crafting profitability;
- Marketplace spreads and reservation behavior;
- Business profitability and failure;
- loan affordability, delinquency, and default;
- Progression speed and farming;
- Financial Market manipulation;
- circular valuation and arbitrage;
- duplicate rewards and replay;
- inventory duplication and negative reservations;
- late-player catch-up and recovery.

Required outcomes:

- no permanently dominant country;
- no permanently dominant class;
- no single mandatory economic path;
- no infinitely repeatable money, XP, reputation, or inventory loop;
- no duplicate settlement or reward;
- no unbounded cross-domain arbitrage;
- meaningful recovery remains possible after failure.

### Exit gate

The one-year simulation remains competitive, coherent, and recoverable under the complete cross-domain economy.

## 15. Phase 12 — Final Player and Admin UX

### Player requirements

- clear onboarding and class explanation;
- understandable Dashboard priorities;
- World and travel clarity;
- Business and loan management;
- Crafting, equipment, repair, and salvage usability;
- Marketplace lifecycle clarity;
- Messaging moderation feedback;
- Progression and reputation explanations;
- Financial Market disclosures;
- desktop, compact, narrow, and mobile support;
- loading, empty, stale, offline, timeout, 401, and 429 states;
- keyboard and screen-reader support;
- safe session exit;
- no raw technical identifiers.

### Admin requirements

- game creation and configuration;
- Player lifecycle;
- Attendance;
- Contracts;
- Store and Inventory;
- Business and Banking oversight;
- Crafting oversight;
- Marketplace moderation;
- Messaging moderation;
- Progression correction;
- Story and World controls;
- Financial Market controls;
- logs, audit, backup, release, and operational status;
- clear pause, end, archive, and emergency controls.

### Exit gate

A teacher can run the complete game without developer intervention, and a student can understand every required action without hidden instructions.

## 16. Phase 13 — Privacy, accessibility, and governance

Before v1.0, complete:

- data inventory;
- privacy classification;
- retention schedules;
- deletion workflows;
- data export workflows;
- staff access policy;
- audit-log policy;
- third-party processor inventory and review;
- keyboard-only audit;
- screen-reader audit;
- contrast and zoom audit;
- mobile usability audit;
- classroom accommodation guidance;
- incident communications;
- correction procedures.

### Exit gate

Student data handling is documented, testable, auditable, and accessible operation is demonstrated.

## 17. Phase 14 — v1.0 release candidate

Create a final code and content freeze.

Required evidence:

- all required PRs merged;
- zero provisional migrations;
- database replay from zero twice;
- database lint clean;
- exact source and artifact digests;
- exact frontend and function inventories;
- final Seed and content digests;
- complete desktop/mobile browser suite;
- complete Admin suite;
- security and privacy suite;
- economic simulation suite;
- 30/40-player load acceptance;
- backup and restore acceptance;
- rollback rehearsal;
- zero staging residue;
- zero unresolved P0/P1 defects;
- all known P2 defects dispositioned;
- operator handbook;
- teacher quick-start guide;
- Player tutorial;
- incident runbook;
- release notes and known limitations.

### Exit gate

The product owner records an explicit `GO` decision for the exact v1.0 release artifact.

## 18. Phase 15 — Production v1.0

Production must receive the exact tested artifact rather than a rebuild.

### Promotion sequence

1. Capture production pre-state.
2. Confirm production project identity.
3. Confirm encrypted backup and rollback readiness.
4. Apply approved migrations.
5. Deploy exact Edge Function artifacts.
6. Deploy exact frontend artifacts.
7. Verify runtime configuration and capability identity.
8. Run bounded production smoke.
9. Verify authentication, authorization, and game isolation.
10. Verify one approved synthetic lifecycle.
11. Clean up synthetic state and prove zero residue.
12. Activate monitoring and alerts.
13. Begin controlled classroom rollout.
14. Monitor stop and rollback criteria.
15. Publish the immutable release record.

### Final completion condition

```text
Feature-complete game
+ calibrated content
+ connected acceptance
+ secure production architecture
+ recoverable operations
+ successful classroom rollout
+ zero unresolved critical defects
= Econovaria v1.0 complete
```

## 19. Critical path from the current state

1. Finish and merge Messaging.
2. Finish and merge Progression.
3. Re-baseline and scope-lock the roadmap.
4. Assemble the immutable beta release.
5. Run connected security, restore, load, and staging acceptance.
6. Run the classroom beta pilot.
7. Stabilize pilot defects.
8. Complete the bounded architectural refactor.
9. Integrate Full Financial Markets.
10. Complete ten-country content and campaign breadth.
11. Complete balance, UX, privacy, accessibility, and governance work.
12. Run the v1.0 release candidate.
13. Promote the exact v1.0 artifact to production.

## 20. Change-control rules

- Fetch live metadata before every implementation session.
- Trust current repository and connected evidence over historical roadmap text.
- Preserve one authority per capability.
- Do not create replacement branches for active authorities.
- Do not synchronize active serial branches without controller authorization.
- Do not rewrite applied migration history.
- Do not dual-write authoritative economic state.
- Do not deploy production from an unmerged branch.
- Do not mark work complete because code exists; require merged, tested, and connected evidence at the stated boundary.
- Production promotion always requires a separate explicit product-owner instruction.
