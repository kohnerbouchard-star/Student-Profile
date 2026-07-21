# Technical Compatibility and Data Safety Review v1

Review status: changes required
Scope reviewed: full seed-content foundation branch
Review perspective: authoritative contracts, identity, session scope, idempotency, environment safety, and implementation feasibility

## Executive finding

The branch is correctly documentation-only and does not modify backend, migrations, Admin, Player Terminal, or assets. The catalog consistently distinguishes reusable definitions from game-session runtime instances and preserves the immutable UUID versus mutable Player ID boundary. It is not implementation-ready because field-level mapping to current backend contracts has not been performed and several narrative concepts are likely unsupported or only planned.

## Repository scope finding

Current branch diff:

- documentation only under `docs/seed-content/**`;
- no migration changes;
- no backend changes;
- no Admin changes;
- no Player Terminal changes.

This is the correct isolation boundary.

The branch is currently one commit behind `main` and must be synchronized before merge.

## Strengths

### T-S01: Reusable versus runtime ownership

Pass.

Definitions and active instances are consistently separated.

### T-S02: Game-session scope

Pass at documentation level.

Events, prices, choices, contracts, and outcomes are repeatedly identified as session-owned.

### T-S03: Identity boundary

Pass at documentation level.

The country-exposure contract explicitly states that browser requests must not submit ownership UUIDs and assigned country must derive from authenticated session state.

### T-S04: Idempotency and rollback

The foundation defines:

- stable IDs;
- no duplicate reward;
- repeated load behavior;
- deactivation rather than unsafe deletion;
- preservation of ledger and ownership history.

### T-S05: Unsupported features are meant to remain planned

The documentation repeatedly avoids claiming that concepts are already implemented.

## Blocking findings

### T-01: No field-level compatibility matrix

Severity: blocking

Required matrix for each domain:

- content field;
- authoritative backend field or route;
- read/write ownership;
- current support status;
- validation;
- lifecycle mapping;
- session scope;
- planned gap.

Priority domains:

- countries and currencies;
- contracts;
- companies and stocks;
- store and inventory;
- redemption;
- notifications;
- progression;
- banking;
- events and story state.

### T-02: Story arc and event persistence likely unsupported or incomplete

Severity: blocking for implementation

The current capability manifest and backend must be inspected to determine whether there are authoritative models for:

- story definitions;
- story instances;
- stages;
- decisions;
- event definitions;
- active events;
- delayed effects;
- character interactions;
- no-response expiry.

If absent, the pilot remains content-only and must not be represented as connected.

### T-03: Contract-definition fields exceed known current Admin contract shape

Severity: blocking for direct seeding

Likely gaps include:

- prerequisites;
- story-stage requirements;
- event-instance binding;
- chain progression;
- learning objectives;
- structured rubrics;
- expiry grace behavior;
- reputation effects.

Required action:

Map every pilot contract field to existing contract storage and API behavior. Separate display-only metadata from authoritative behavior.

### T-04: Stable content-ID storage unknown

Severity: blocking

The catalog defines human-readable stable IDs, but implementation must decide:

- database column or registry location;
- uniqueness constraints;
- version storage;
- replacement and deprecation;
- relationship to existing UUID primary keys;
- whether stable IDs are global or game/session scoped.

### T-05: Currency and ECO compatibility unresolved

Severity: blocking

Official currency manifest aligns ten countries, but current attendance or ledger behavior may use ECO. Technical audit must reconcile code, database defaults, Admin settings, and player conversion behavior.

### T-06: Effect vocabulary not mapped to supported runtime actions

Severity: blocking for event seeding

Terms such as inflation, confidence, capacity, reserves, trust, water, talent, and ownership may not exist as mutable fields.

Required classification:

- mechanically supported;
- represented through company or market exposure;
- notification or narrative only;
- planned and unavailable.

### T-07: Group aggregation and resolution selection unsupported until verified

Severity: blocking for automatic resolution

No assumption should be made that the current backend can aggregate player recommendations, votes, or country support.

### T-08: Seed implementation format absent

Severity: major

Future work must choose:

- SQL seeds;
- JSON or TypeScript registries;
- migration-owned templates;
- Admin import;
- application-bundled content;
- hybrid approach.

The choice must respect applied migration history and existing domain ownership.

## Major findings

### T-M01: Location mapping

All planned location IDs must map to the existing map region and asset model. Do not alter country region identifiers for content convenience.

### T-M02: Notification delivery

Interactions may need to be represented through notifications or messaging until a dedicated interaction model exists. The UI must not pretend response options are authoritative if they are not persisted.

### T-M03: Contract cancellation

Accepted contract behavior during arc cancellation must match current atomic contract acceptance and reward paths.

### T-M04: Delayed effects

Delayed consequences require a scheduler or event-processing mechanism. If unavailable, use instructor-triggered follow-up definitions or narrative-only sequencing.

### T-M05: Branch synchronization

The branch diverged because `main` advanced after creation. Synchronize without touching active backend or frontend work.

## Security requirements

- authenticated session derives player and game ownership;
- no browser-submitted durable ownership UUID;
- no private identifiers in news or interactions;
- fixture environments isolated;
- no tactical cyber content;
- Admin-only actions authorized server-side;
- reward, inventory, and ledger operations remain atomic and idempotent;
- content IDs never substitute for authorization.

## Required next work

1. Inspect current capability manifest and backend domain contracts.
2. Build field-level compatibility matrix.
3. Resolve ECO and currency flow.
4. Classify all event effects by support status.
5. Map five pilot contracts to current storage and API.
6. Decide content-ID persistence and seed format.
7. Define an interim narrative delivery method if full story persistence is absent.
8. Synchronize branch with latest `main` before PR merge.

## Approval gate

Implementation approval remains blocked by T-01 through T-07. Documentation development may continue. No migration or seed script should begin until the compatibility matrix is reviewed.