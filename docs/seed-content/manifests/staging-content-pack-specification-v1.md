# Staging Content Pack Specification v1

Status: production design specification; no executable seed package included
Owner domains: content architecture, release engineering, data safety
Scope: converting approved catalog records into a validated staging import package

## Purpose

Define the package structure, metadata, validation, dependency ordering, environment restrictions, idempotency, audit, and rollback requirements for Econovaria seeded content.

This specification intentionally separates authored Markdown concepts from future machine-readable import records.

## Package principles

A content pack must be:

- versioned;
- immutable after release;
- environment restricted;
- dependency ordered;
- reference validated;
- idempotent;
- auditable;
- dry-run capable;
- reversible through an approved rollback or deactivation process;
- explicit about unsupported mechanics;
- incapable of mutating live player or game-session state during definition loading.

## Proposed directory layout

```text
content-pack/
  manifest.json
  checksums.json
  compatibility.json
  records/
    countries/
    currencies/
    institutions/
    characters/
    companies/
    contracts/
    events/
    interactions/
    news/
    store-items/
    banking-products/
    achievements/
    levels/
    locations/
    tutorials/
    notifications/
  fixtures/
    staging/
    test/
  mappings/
    database-fields.json
    capability-requirements.json
    assets.json
  validation/
    expected-counts.json
    reference-rules.json
    balance-bands.json
  release-notes.md
```

Fixtures remain physically and logically separated from reusable production definitions.

## Manifest schema

The exact implementation format may be JSON, YAML, or generated TypeScript, but the following fields are required.

```json
{
  "packId": "content-pack.econovaria.foundation.v1",
  "version": "1.0.0",
  "maturity": "staging-candidate",
  "createdAt": "ISO-8601 timestamp",
  "sourceCommit": "git SHA",
  "sourcePr": 163,
  "minimumApplicationContract": "declared contract version",
  "maximumApplicationContract": null,
  "allowedEnvironments": ["local", "test", "staging"],
  "productionAuthorized": false,
  "definitionCount": 0,
  "fixtureCount": 0,
  "dependencies": [],
  "domains": [],
  "requiredCapabilities": [],
  "blockedCapabilities": [],
  "currencyArchitecture": "adr-001",
  "stableIdStrategy": "declared owner",
  "checksumAlgorithm": "sha256",
  "records": [],
  "validationProfile": "foundation-v1",
  "rollbackStrategy": "deactivate-pack",
  "approvalEvidence": []
}
```

## Record descriptor

Every manifest record must include:

```json
{
  "stableContentId": "event.global.meridian-forum-announced.v1",
  "contentType": "event-definition",
  "version": "1.0.0",
  "path": "records/events/meridian-forum-announced.json",
  "checksum": "sha256 value",
  "ownerDomain": "events",
  "countryCodes": [],
  "dependencies": [],
  "assetDependencies": [],
  "requiredCapabilities": [],
  "implementationStatus": "definition-only",
  "loadPolicy": "upsert-definition",
  "deprecationReplacement": null,
  "reviewStatus": {
    "economic": "pass",
    "narrative": "pass",
    "gameplay": "pass",
    "technical": "blocked"
  }
}
```

## Stable ID requirements

- Every production-targeted definition has one stable content ID.
- Runtime UUIDs are never embedded in reusable records.
- A stable ID is not reused after retirement.
- A major breaking change receives a new major stable-ID suffix or declared migration.
- Display-name changes do not change a locked stable ID unless the record is still pre-release.
- The manifest declares which database field or registry owns the stable ID.
- Import fails when the ownership field is unresolved for a record marked executable.

## Definition versus runtime state

Allowed in a reusable record:

- names and descriptions;
- eligibility rules;
- effect bands;
- event and interaction templates;
- company templates;
- base prices and rewards approved for authoring;
- dependencies;
- asset keys;
- review metadata.

Prohibited in a reusable record:

- player UUIDs;
- Player IDs or Access Codes;
- live game IDs or session IDs;
- active event status;
- current market prices unless part of a reusable template;
- player balances or holdings;
- accepted Contract state;
- redemption requests;
- notification read state;
- instructor decisions from a live class.

## Load policies

Permitted definition load policies:

- `insert-definition`: fail when the stable ID already exists;
- `upsert-definition`: update only when the incoming version is allowed;
- `deactivate-definition`: retain history but prevent new runtime use;
- `alias-definition`: allowed only for released identifiers with explicit compatibility need;
- `reference-only`: validate that an authoritative existing record exists; do not overwrite it;
- `metadata-enrichment`: attach approved optional metadata without replacing authoritative mechanical fields.

Prohibited:

- deleting active definitions with runtime references;
- rewriting applied migration history;
- overwriting current game-session state;
- truncating production tables;
- creating fixture players in a classroom or production environment;
- loading unsupported mechanics as though operational.

## Dependency order

Recommended definition load order:

1. content-pack metadata;
2. countries and canonical codes as reference-only where already authoritative;
3. currencies and settlement units as reference-only or approved definitions;
4. industries and commodities;
5. institutions;
6. characters;
7. locations;
8. companies and market-template enrichments;
9. event definitions;
10. story arcs;
11. interactions;
12. news templates;
13. Contract templates and chains;
14. Store items;
15. banking products;
16. progression levels and achievements;
17. tutorials and notifications;
18. staging and test fixtures.

The importer performs a topological sort and rejects dependency cycles unless the record type explicitly permits a deferred reference.

## Capability gating

Each record declares required capabilities.

Examples:

- a narrative event definition may require only World news reads;
- an executable event impact requires an approved event-application capability;
- a Contract chain may require Contract list, acceptance, submission, and approval capabilities;
- redemption content requires Player request and Admin review capabilities;
- banking products remain definition-only when banking writes are unavailable.

Importer behavior:

- `definition-only` records may load into a non-runtime catalog when mechanics are unsupported;
- `executable` records fail when a required capability is unavailable;
- no capability is inferred from a frontend surface;
- donor PRs do not count as authoritative capability evidence;
- manifest and application contract versions must match the approved compatibility matrix.

## Environment guard

The importer requires an explicit environment identity.

Allowed values:

- local;
- test;
- staging;
- production.

A pack with `productionAuthorized: false` must refuse production.

Additional safeguards:

- environment allowlist checked server-side;
- database project identity verified;
- operator must pass dry-run before apply;
- fixture folders refused outside local, test, or explicitly isolated staging;
- production requires separate approval evidence and immutable release tag;
- no default environment fallback;
- no use of a classroom database as a staging substitute.

## Dry-run output

Dry-run reports:

- pack identity and source commit;
- application contract compatibility;
- record counts by domain;
- inserts, updates, no-ops, deactivations, and blocked records;
- unresolved references;
- unsupported capabilities;
- missing assets;
- invalid currency codes;
- missing currency pairs required by content;
- out-of-band monetary or event values;
- duplicate stable IDs;
- fixture leakage;
- environment violations;
- rollback plan;
- checksums.

A dry-run must not create partial audit or definition records that appear applied.

## Idempotency

Recommended import identity:

`pack ID + pack version + target environment + operation phase`

Required behavior:

- exact replay produces no duplicate definitions;
- unchanged records are no-ops;
- modified content under the same immutable version is rejected;
- a version conflict reports both checksums;
- interrupted imports can resume from committed phases;
- fixture creation uses deterministic fixture IDs scoped to the isolated environment;
- no import retry duplicates rewards, events, players, or ledger transactions.

## Validation layers

### Structural validation

- schema validity;
- required metadata;
- version syntax;
- stable-ID syntax;
- known content types;
- checksum match.

### Reference validation

- countries;
- currencies;
- institutions;
- characters;
- companies;
- industries;
- events and next states;
- Contract chains;
- news and interaction links;
- assets;
- deprecation replacements.

### Economic validation

- reward and price bands;
- currency declaration;
- conversion graph coverage;
- event-effect bands;
- stock-template arithmetic;
- banking cadence and rate bounds;
- progression thresholds.

### Narrative validation

- valid arc states;
- no impossible transition;
- terminal outcomes complete;
- correction lineage;
- speaker authority;
- knowledge limits;
- cancellation behavior.

### Security validation

- no ownership UUIDs in Player-facing definitions;
- no credentials;
- no live game/session identifiers;
- no production secrets;
- no browser-selected owner fields;
- no unsupported mutation path.

### Classroom validation

- reading level;
- response burden;
- teacher review burden;
- accessibility notes;
- political neutrality and fictionalization;
- equal country evidence quality.

## Apply phases

Recommended phases:

1. acquire import lock;
2. verify environment and compatibility;
3. verify checksums;
4. validate all records;
5. write pack registry row;
6. load reference and definition domains in dependency order;
7. verify counts and referential integrity;
8. activate eligible definitions;
9. load isolated fixtures when explicitly requested;
10. write immutable import audit;
11. release lock;
12. run post-load read verification.

Activation should be separate from definition loading when feasible, allowing validation before content becomes available to a session.

## Rollback

Default rollback is pack deactivation, not destructive deletion.

Rollback must:

- prevent new runtime instances from using the pack;
- preserve definitions referenced by existing runtime state;
- preserve audit history;
- preserve player submissions, rewards, ledger entries, and market activity;
- identify replacement definitions where required;
- remove or reset isolated fixtures separately;
- document any non-reversible external asset publication.

Destructive removal is allowed only in disposable local or test environments after environment verification.

## Fixture policy

Fixtures have separate manifests and naming.

Every fixture declares:

- fixture ID;
- environment restriction;
- purpose;
- deterministic reset key;
- generated player labels that clearly identify test data;
- cleanup operation;
- prohibited environments.

Fixture records must never reuse realistic classroom Player IDs or Access Codes.

## Acceptance tests

A staging content pack must demonstrate:

- clean import;
- exact replay no-op;
- interrupted import resume;
- checksum conflict rejection;
- unsupported capability rejection;
- missing-reference rejection;
- wrong-environment rejection;
- fixture isolation;
- definition deactivation;
- rollback preserving runtime references;
- Admin and Player read verification;
- no ownership UUID exposure;
- no duplicate ledger or event effect;
- deterministic expected counts.

## Foundation-pack maturity

The current documentation catalog may produce a `design-manifest` before it can produce an executable staging pack.

A design manifest records:

- stable IDs;
- file paths;
- relationships;
- review status;
- implementation mapping;
- blockers.

It must mark all unsupported domains as `definition-only` or `blocked`.

## Current blockers

1. Final Backend PR #158 contracts are not yet merged.
2. Stable-ID database or registry ownership remains undecided.
3. ECO registry ownership remains undecided.
4. Event application authority is unverified.
5. Narrative persistence is undecided.
6. Exact reward, price, banking, and progression values are not approved.
7. Country-specific starting baselines are not supported by the current shared baseline initializer.
8. No staging import or rollback has been rehearsed.

## Approval state

- manifest architecture: approved for design-manifest generation;
- executable format: pending implementation choice;
- staging import: blocked;
- production authorization: prohibited.