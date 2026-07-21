# Seeding, Environments, Fixtures, and Validation

Status: draft foundation

## Purpose

Define how approved content will eventually move from documentation into technical seed packs without duplication, cross-environment leakage, session-state corruption, or confusion between production classroom content and test data.

## Content layers

### Canon library

Reusable definitions:

- countries;
- currencies;
- industries;
- commodities;
- institutions;
- characters;
- companies;
- contract templates;
- event definitions;
- story arcs;
- interactions;
- store products;
- bank products;
- achievements;
- locations;
- tutorials;
- notification templates.

### Scenario pack

Reusable configuration selecting:

- starting conditions;
- enabled arcs;
- available content;
- severity ranges;
- timing policy;
- instructor options.

### Game-session runtime

Mutable instances:

- assigned countries;
- balances;
- holdings;
- prices;
- active events;
- story states;
- decisions;
- contracts;
- submissions;
- inventory;
- redemptions;
- loans;
- notifications.

### Test fixture pack

Deterministic records used only for:

- automated tests;
- local development;
- staging demonstrations;
- error and edge-state validation.

## Environment policy

### Local development

May use synthetic fixtures and reset frequently.

Requirements:

- unmistakable fixture names;
- no production credentials;
- no dependency on remote classroom data;
- deterministic reset path.

### Automated test

Uses the smallest deterministic data needed for each test.

Requirements:

- isolated game-session ownership;
- stable identifiers;
- no timing dependence where avoidable;
- teardown or transaction isolation;
- no reliance on unordered random selection.

### Staging

Uses production-shaped content and selected fixture scenarios.

Requirements:

- clear environment banners;
- no real student data unless explicitly authorized;
- migration and seed rehearsal;
- rollback verification;
- Admin and Player end-to-end checks.

### Production

Uses only approved production packs.

Requirements:

- no fixture pack;
- manifest and checksum;
- explicit version;
- preflight validation;
- backup or rollback procedure;
- post-load verification;
- audit record.

## Seed-pack manifest

Every technical content pack should eventually include:

- pack ID;
- semantic version;
- content release date;
- minimum compatible application version or contract version;
- scenario compatibility;
- included files and record counts;
- content IDs and versions;
- required assets;
- dependencies;
- retired or replaced IDs;
- environment eligibility;
- checksum;
- release notes;
- rollback notes;
- review approvals.

## Idempotency standard

Reapplying the same approved pack should:

- not create duplicate definitions;
- not duplicate rewards, holdings, events, assignments, or runtime instances;
- update only fields allowed by the pack's change classification;
- preserve runtime state;
- preserve owned inventory and completed work;
- report no-op, created, updated, skipped, and conflict counts.

## Upsert policy

A reusable definition may be upserted by stable content ID and version only when:

- ownership domain matches;
- content type matches;
- change is compatible;
- no immutable identifier is being repurposed;
- active runtime instances can continue safely.

Breaking content should use a new major-version content ID or an explicit migration path.

## Fixture naming

Fixture records should use visible prefixes or metadata.

Examples:

- display name: `[FIXTURE] New Player`;
- content ID: `fixture.player.new.v1`;
- game name: `[STAGING] Meridian Crisis`;
- company fixture only when a real content definition is not the subject of the test.

Never use plausible real student names for generic fixtures.

## Required fixture scenarios

### Player state

- new player;
- active player;
- player from every country;
- low balance;
- high balance;
- no inventory;
- owned inventory;
- reserved inventory;
- pending redemption;
- rejected redemption;
- fulfilled redemption;
- no contracts;
- active contract;
- submitted contract;
- changes requested;
- approved contract;
- expired contract;
- no holdings;
- diversified holdings;
- loss position;
- gain position;
- active loan;
- overdue loan if supported;
- progression empty state;
- advanced progression.

### World state

- stable baseline;
- one minor event;
- one major country event;
- global crisis;
- recovery;
- conflicting event eligibility;
- event expired;
- event cancelled;
- unavailable read model.

### Content state

- active definition;
- scheduled definition;
- deprecated definition;
- missing asset;
- invalid reference rejected by validation;
- unsupported capability displayed as planned;
- empty catalog.

## Validation layers

### Structural

- required fields present;
- correct types;
- valid enum or vocabulary;
- no duplicate IDs;
- version valid;
- no prohibited keys.

### Referential

- all IDs resolve;
- no circular contract chain unless allowed;
- valid country and currency references;
- valid character and institution relationship;
- valid event branch;
- valid asset path.

### Economic

- units and currencies present;
- company arithmetic valid;
- reward and price bands valid;
- bank arithmetic valid;
- event effects bounded;
- no obvious arbitrage.

### Narrative

- stage graph valid;
- choices distinct;
- delayed effects defined;
- news fact status present;
- character authority valid;
- resolution reachable.

### Classroom and copy

- reading level reviewed;
- instructions actionable;
- sensitive content reviewed;
- terminology consistent;
- accessibility copy present.

### Technical compatibility

- maps to authoritative schema and API;
- correct game-session scope;
- no browser-submitted ownership UUID;
- lifecycle supported;
- unavailable features marked planned;
- import order documented.

## Preflight report

A staging or production seed operation should generate:

- environment;
- pack version;
- records to create;
- records to update;
- records unchanged;
- records blocked;
- breaking conflicts;
- missing assets;
- unresolved references;
- unsupported mechanics;
- planned deprecations;
- expected post-load counts.

No production write should occur when blocking validation fails.

## Post-load verification

Verify:

- expected record counts;
- stable IDs;
- currency and country relationships;
- company and ticker uniqueness;
- contract availability;
- store product rendering;
- inventory ownership preservation;
- bank product calculations;
- event and story definitions available;
- no runtime events unintentionally activated;
- Admin reads;
- Player reads;
- fixture absence in production;
- audit log.

## Rollback policy

Rollback must distinguish definition changes from runtime activity.

Safe rollback may:

- deactivate newly added definitions;
- restore prior compatible copy or values;
- remove unreferenced draft definitions;
- restore prior scenario selection.

Rollback must not silently delete:

- completed contracts;
- issued ledger transactions;
- owned inventory;
- redemption history;
- player decisions;
- active loans;
- stock orders or holdings;
- audit history.

Where deletion is unsafe, use deprecation, inactivation, or compensating behavior.

## Content conflict handling

Conflicts include:

- stable ID used by a different content type;
- existing record has a newer version;
- immutable field changed;
- active runtime instance depends on removed behavior;
- currency or country reference changed incompatibly;
- unsupported effect introduced.

A conflict should be reported and blocked, not resolved by last-write-wins.

## Release acceptance

A pack is production eligible only when:

- all required reviews approved;
- preflight clean;
- staging load idempotent;
- rollback rehearsed;
- Player and Admin behavior verified;
- fixture separation verified;
- security checks passed;
- record counts and assets verified;
- known limitations documented;
- release owner approves.