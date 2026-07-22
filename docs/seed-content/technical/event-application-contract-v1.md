# Event Application Contract v1

Status: production design specification; runtime implementation unverified
Owner domains: country economics, events, audit, narrative runtime
Scope: applying a reusable event definition to one game-session country state

## Purpose

Define the minimum safe contract for turning an approved seeded event definition into an authoritative game-session economic change.

An event document, news article, interaction, or instructor action is not itself authority to mutate country economics. Economic changes occur only through an authenticated, authorized, idempotent event-application operation.

## Core distinction

### Reusable event definition

Contains:

- stable content ID and version;
- eligible countries and conditions;
- semantic effect directions;
- allowed quantitative bands;
- duration and recovery design;
- news and interaction references;
- cancellation and correction policy.

It contains no live player or game-session state.

### Event instance

Contains:

- runtime identifier;
- game-session identifier;
- event-definition identifier and version;
- affected country or global scope;
- current stage and status;
- trigger evidence;
- selected effect values;
- application and recovery references;
- timestamps;
- authorized actor;
- audit and idempotency data.

### Economic application

A durable operation that applies one authorized effect set to one authoritative country snapshot or approved global target.

## Required authority

The application path must derive or validate:

- authenticated administrative or system actor;
- actor's authority over the target game;
- target game-session identity;
- target country identity from an approved canonical key;
- event instance belonging to the same game session;
- event definition and version allowed by the active content pack;
- current event stage eligible for the requested transition.

The browser must not select ownership UUIDs, another game's event instance, or another game's country snapshot.

## Command model

Conceptual command:

`ApplyCountryEventImpact`

Required fields:

- `event_instance_id`;
- `expected_event_stage`;
- `target_country_code`;
- `impact_set_id` or approved semantic profile;
- `effective_at`;
- `idempotency_key`;
- optional operator note;
- optional source-evidence references.

Server-derived fields:

- game ID;
- game-session ID;
- actor identity;
- event-definition version;
- current country snapshot;
- difficulty profile;
- allowed effect bands;
- audit correlation ID.

Client-submitted raw deltas should be rejected for ordinary authored events. A privileged simulation or emergency tool may accept raw values only under a separate audited capability.

## Impact selection

The preferred production model is semantic selection rather than arbitrary numeric entry.

Example:

- definition declares `food_supply_shock.moderate`;
- effect-band mapping resolves permitted deltas;
- difficulty and country exposure may adjust inside the approved band;
- server records the exact selected values.

The operation must reject:

- indicators absent from the approved mapping;
- values outside event and global bounds;
- direction reversals not permitted by the definition;
- effects on countries outside event scope;
- duplicate application of the same stage;
- recovery before the required stage or minimum duration;
- terminal event changes after resolution without an explicit reopening transition.

## Additive semantics

Country event effects are additive to the current authoritative state unless the definition explicitly uses another approved operation type.

Approved operation types:

- `delta`: add or subtract from the current value;
- `set_floor`: raise a value only when it is below a declared floor;
- `set_ceiling`: lower a value only when it is above a declared ceiling;
- `replace`: prohibited for ordinary events; reserved for controlled baseline or repair operations;
- `multiplier`: allowed only for derived price or exposure calculations, not as an undocumented country-snapshot rewrite.

Every applied effect records:

- previous value;
- requested delta or rule;
- bounded applied delta;
- resulting value;
- global bound used;
- event-specific band used;
- whether clamping occurred.

Silent clamping is not sufficient. Clamping must be visible in audit output and should block publication of copy that claims the full requested effect occurred.

## Idempotency

The authoritative uniqueness boundary should include:

- game session;
- event instance;
- event stage or impact-set identifier;
- idempotency key.

Required behavior:

- exact replay returns the original committed result;
- same idempotency key with different payload returns a conflict;
- a new key cannot reapply a stage already marked applied;
- retry after an ambiguous network result does not duplicate the impact;
- publication or refresh failure after commit does not report the economic write as failed.

## Transaction boundary

One transaction should atomically:

1. lock and validate the event instance;
2. lock or version-check the country snapshot;
3. verify event and global effect bands;
4. calculate exact resulting values;
5. append the event-impact record;
6. update the country snapshot or authoritative derived state;
7. transition the event stage when applicable;
8. append an audit entry;
9. persist the idempotency result.

News publication, notification delivery, Player refresh, and analytics fan-out occur after commit and must be retryable independently.

## Concurrency

The operation must prevent lost updates when two events affect the same country.

Acceptable strategies:

- row lock within a database transaction;
- optimistic version check with bounded retry;
- serialized event-impact queue per game-session country.

The audit record must preserve ordering.

Cross-arc concurrency follows the catalog's priority and suppression rules. A higher-priority emergency may pause a lower-priority arc, but it may not erase already committed effects.

## Difficulty and exposure

Difficulty and country exposure may influence event magnitude only through a documented resolver.

The resolver records:

- base semantic band;
- difficulty modifier;
- country exposure modifier;
- protective or vulnerability modifiers;
- final bounded delta.

Narrative copy must not claim a country was affected more strongly without a recorded exposure basis.

## Recovery

A recovery is a new authorized impact stage, not deletion or reversal of the original row.

Recovery requirements:

- references the original event instance;
- declares which indicators recover;
- uses approved recovery bands;
- cannot produce a better-than-baseline outcome unless explicitly designed;
- records previous, delta, and resulting values;
- may be partial;
- preserves the original event and news history.

Cancellation before application creates no impact. Cancellation after application stops future stages but does not remove committed effects; recovery or corrective impacts are required.

## Corrections

A factual correction can change attribution, confidence, source status, or future decision eligibility.

A correction does not automatically reverse economic impacts that were already justified by confirmed operational conditions.

When a correction invalidates the factual basis of an applied impact:

- the event enters review;
- an authorized corrective impact may be applied;
- the original impact remains in history;
- ledger, market, and player actions are not rewritten;
- new news records explain the correction.

## Publication contract

News and interactions consume committed event state.

A publication record must reference:

- event instance;
- event stage;
- effective time;
- fact status;
- supporting sources;
- exact country and indicator summary suitable for players;
- correction lineage when relevant.

News text never supplies the values applied to the economy.

## Failure states

Required failure codes or equivalent categories:

- unauthorized actor;
- wrong game or session;
- event instance not found;
- event definition not active;
- invalid stage transition;
- target country outside scope;
- missing impact mapping;
- impact outside allowed band;
- country state unavailable;
- stale snapshot version;
- duplicate stage application;
- idempotency conflict;
- terminal or canceled event;
- recovery not yet eligible.

Failures produce no partial update.

## Audit fields

At minimum:

- correlation ID;
- actor type and identifier;
- game and session;
- event instance and definition version;
- target country;
- stage and impact set;
- idempotency key hash or safe reference;
- previous values;
- applied values;
- resulting values;
- modifiers and bounds;
- clamping;
- effective and committed timestamps;
- source-evidence references;
- success or failure category.

No private ownership UUID should enter Player-facing output.

## Rollback and repair

Production rollback does not delete event history.

Approved repair patterns:

- compensating event impact;
- restore from a verified snapshot under a privileged repair capability;
- mark an impact superseded while preserving audit history;
- replay deterministic impacts into an isolated environment.

A repair action requires stronger authority than ordinary event application.

## Required tests

### Authorization

- valid game administrator;
- wrong game;
- inactive or expired game session;
- browser ownership injection;
- system actor allowlist.

### Idempotency

- exact replay;
- payload mismatch;
- duplicate stage with new key;
- timeout after commit;
- publication failure after commit.

### Bounds

- minimum and maximum valid values;
- value outside event band;
- value inside event band but outside global bound;
- clamped result audit;
- invalid direction.

### Concurrency

- two events on the same country;
- recovery racing another impact;
- stale optimistic version;
- deterministic ordering.

### Lifecycle

- setup to active;
- active to escalation;
- escalation to recovery;
- cancellation before application;
- cancellation after application;
- correction and compensating impact;
- terminal event rejection.

### Isolation

- no cross-session leakage;
- same event definition in two sessions;
- fixture versus classroom environment separation;
- no Player ownership UUID in read models.

## Implementation status

- content semantics: specified;
- effect-band mapping: available in the seed-content catalog;
- existing country-event data structures: partially mapped;
- authoritative application route or RPC: must be verified after backend reconciliation;
- production authorization: not granted;
- staging rehearsal: required.