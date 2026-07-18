# Physical Economy Backend Contract v1

Status: post-reconciliation implementation specification; no runtime implementation authorized  
Seed-content branch: `agent/seed-content-foundation-v1`  
Backend dependency: PR #158 or its consolidated successor

## Purpose

Define the authoritative backend boundaries required to implement the 144-item catalog and 60-recipe graph without creating a parallel inventory, identity, pricing, or authorization model.

This contract is subordinate to merged backend code. After PR #158 merges, every route, DTO, table, RPC, and public-key assumption in this file must be re-audited against `main` before implementation begins.

## Current dependency boundary

PR #158 currently provides or reports complete:

- authenticated player request scope;
- country and news reads;
- Market asset reads and watchlists;
- authenticated Inventory read;
- notifications list and mark-read;
- Player logout.

Its remaining sequence is:

1. capability manifest;
2. atomic Contract acceptance;
3. Inventory redemption schema and routes;
4. final security, runtime, staging, and verification work.

Crafting, equipment instances, supply, scarcity, maintenance, and salvage must not be added to PR #158. They form a later backend tranche created from updated `main` after the reconciliation PR merges.

## Authority rules

The backend must derive:

- player UUID;
- game-session UUID;
- active player-session scope;
- country assignment;
- difficulty profile and version;
- wallet and settlement context;
- inventory and equipment ownership.

The browser may submit only public content and transaction keys. It must never submit trusted ownership UUIDs, game UUIDs, prices, exchange rates, ingredient totals, output quantities, or final effect parameters.

Public item and recipe identifiers are stable per content definition. Database UUIDs remain internal.

## Domain ownership

Recommended backend domains:

```text
backend/src/domains/items/
backend/src/domains/inventory/
backend/src/domains/crafting/
backend/src/domains/equipment/
backend/src/domains/supply/
backend/src/domains/difficulty/
```

Each domain should separate contracts, API adapters, services, infrastructure, and tests. The Edge Function dispatcher remains thin.

## Definition layer

Reusable definitions should be imported through versioned content packs rather than authored as live player state.

Candidate definition records:

- `item_templates`;
- `recipe_templates`;
- `recipe_ingredient_templates`;
- `recipe_output_templates`;
- `equipment_effect_definitions`;
- `difficulty_profile_definitions`;
- `country_supply_templates`;
- `substitution_group_templates`.

Required definition properties:

- stable public key;
- schema and content version;
- active, disabled, or archived status;
- source country and currency where applicable;
- item or recipe class;
- effect or entitlement code;
- difficulty scaling class;
- scenario and progression constraints;
- provenance and import batch;
- created, updated, and retired timestamps.

Definitions never contain player ownership, live stock, live prices, active jobs, or current effects.

## Session layer

Existing session structures should remain authoritative where compatible:

- `store_items`;
- `inventory_holdings`;
- `inventory_events`;
- `game_settings`;
- ledger, balances, audit, player, game, country, and session records.

Candidate new session records:

- `game_session_recipes`;
- `game_session_item_supply`;
- `item_supply_events`;
- `inventory_reservations`;
- `crafting_quotes`;
- `crafting_jobs`;
- `crafting_job_inputs`;
- `crafting_job_outputs`;
- `equipment_instances`;
- `equipment_loadouts`;
- `equipment_maintenance_events`;
- `equipment_salvage_events`;
- `item_effect_grants`.

## Inventory model

Stackable holdings remain appropriate for:

- materials;
- components;
- consumables;
- transferable or consumable access tokens where approved.

Durable equipment requires unique instances because condition, charges, installed modules, slot, maintenance state, recipe version, and difficulty snapshot can differ between two copies of the same item.

Candidate equipment-instance fields:

- internal UUID;
- game session and player ownership;
- public equipment-instance key;
- Store item or template reference;
- condition and maximum condition;
- charges and maximum charges;
- operational status;
- equipped slot;
- installed module payload constrained by schema;
- source recipe and job;
- recipe and difficulty versions;
- created, updated, retired, and destroyed timestamps.

## Reservation model

Inventory availability must account for every concurrent use:

```text
available = owned
  - crafting reservations
  - redemption reservations
  - Marketplace reservations
  - Contract-delivery reservations
  - maintenance reservations
  - salvage reservations
```

`inventory_holdings.quantity_reserved` may remain a projection, but reason-specific reservation rows should be the auditable source detail.

Candidate reservation reasons:

- `CRAFTING_INPUT`;
- `REDEMPTION`;
- `MARKETPLACE_LISTING`;
- `CONTRACT_DELIVERY`;
- `EQUIPMENT_MAINTENANCE`;
- `EQUIPMENT_SALVAGE`.

Required invariants:

- owned and reserved quantities are nonnegative;
- reserved never exceeds owned;
- one reservation cannot be consumed or released twice;
- an expired quote releases its reservation once;
- a committed job owns its input reservations;
- cancellation and failure behavior are explicit by lifecycle state;
- deactivating a definition does not erase valid ownership.

## Difficulty model

Difficulty is session scoped and versioned.

Canonical presets:

- `easy`;
- `moderate`;
- `hard`;
- `insane`;
- `custom` with validated bounded values.

Legacy `standard` is read as `moderate` and is not emitted by new writes.

A difficulty update creates a new policy version. It affects future Store quotes, supply calculations, crafting quotes, maintenance quotes, and salvage quotes. It does not rewrite:

- completed transactions;
- owned inventory;
- accepted Store quotes;
- accepted crafting quotes;
- active crafting jobs;
- existing equipment effect power;
- previously settled salvage.

## Supply and scarcity model

`game_session_item_supply` should hold the current supply projection by game, item, and source country.

Candidate fields:

- item reference;
- source country;
- base and current quantity;
- safety-stock quantity;
- committed quantity;
- reserved quantity;
- restock amount and interval;
- next eligible restock;
- scarcity class and current band;
- difficulty version;
- latest event version;
- optimistic concurrency version;
- updated timestamp.

All restock and event applications require idempotency keys and append-only supply events.

Player-facing scarcity bands:

- abundant;
- available;
- tight;
- scarce;
- critical;
- unavailable.

The quote DTO should explain the largest active supply modifier and display valid substitutes or recovery paths.

## Crafting quote

Target route:

```text
POST /players/me/crafting/quotes
```

Candidate request:

```json
{
  "recipeKey": "recipe.t2.market-lens.v1",
  "quantity": 1,
  "substitutions": [],
  "idempotencyKey": "client-generated-uuid"
}
```

The server resolves:

- authenticated ownership and game;
- recipe and recipe version;
- workshop and entitlement eligibility;
- current difficulty version;
- exact ingredient quantities;
- selected substitution validity;
- available inventory;
- workshop fee and currency conversion;
- duration;
- queue and capacity constraints;
- reservation plan;
- quote expiry.

Quote creation does not consume inventory or issue output.

## Crafting job start

Target route:

```text
POST /players/me/crafting/jobs
```

Candidate request:

```json
{
  "quoteKey": "public-crafting-quote-key",
  "idempotencyKey": "client-generated-uuid",
  "clientSubmittedAt": "ISO-8601 timestamp"
}
```

The atomic start operation must:

1. lock and validate the quote;
2. resolve the exact token-owned player and game scope;
3. recheck expiry, eligibility, capacity, balance, and availability;
4. create reason-specific input reservations;
5. debit the declared workshop fee through the ledger where applicable;
6. create one crafting job with immutable recipe and difficulty snapshots;
7. mark the quote used;
8. write inventory, ledger, crafting, and audit events;
9. return committed success separately from follow-up refresh state.

A repeated request with the same idempotency key returns the original committed result. A conflicting reuse fails without additional mutation.

## Crafting completion and claim

Completion is trusted server work, never a client timer.

Target lifecycle:

```text
QUOTED -> RESERVED -> QUEUED -> IN_PROGRESS -> COMPLETED -> CLAIMED
```

Completion must atomically:

- verify one eligible job transition;
- consume reserved input exactly once;
- create stackable holdings or unique equipment instances exactly once;
- write crafting-job outputs and inventory events;
- mark the job complete;
- preserve an auditable input and output snapshot.

Claim may be automatic or explicit, but one job cannot issue outputs twice.

## Equipment operations

Target routes:

```text
GET    /players/me/equipment
PUT    /players/me/equipment/:equipmentKey/equipped-slot
DELETE /players/me/equipment/:equipmentKey/equipped-slot

POST /players/me/equipment/:equipmentKey/maintenance/quotes
POST /players/me/equipment/:equipmentKey/maintenance
POST /players/me/equipment/:equipmentKey/salvage/quotes
POST /players/me/equipment/:equipmentKey/salvage
```

Rules:

- one instance occupies at most one slot;
- one slot holds at most one instance;
- listed, reserved, in-repair, or in-salvage equipment cannot be equipped;
- ordinary wear cannot delete ownership;
- inoperable equipment remains owned;
- maintenance inputs and results are deterministic;
- salvage destroys one instance and issues bounded recovery exactly once;
- component recovery requires the advanced salvage license;
- salvage cannot recover more than original eligible inputs or the difficulty ceiling.

## Effect execution

Equipment and consumable effects use a closed, versioned allowlist.

Each handler validates:

- effect code and schema version;
- equipment or holding ownership;
- active slot or activation rule;
- target type and target ownership;
- charges and consumable quantities;
- cooldown, stacking, and duration;
- capability support;
- event and scenario restrictions;
- idempotency and audit context.

No generic content JSON may execute arbitrary database changes.

## Player reads

Target reads:

```text
GET /players/me/crafting
GET /players/me/crafting/recipes/:recipeKey
GET /players/me/crafting/jobs
GET /players/me/crafting/jobs/:jobKey
GET /players/me/equipment
GET /players/me/inventory/reservations
```

Reads must be bounded, deterministic, private, and non-cacheable where ownership state is present. Internal UUIDs remain absent from browser DTOs.

## Admin reads and actions

Target Admin surfaces:

```text
GET   /games/:gameId/settings/difficulty
PATCH /games/:gameId/settings/difficulty
GET   /games/:gameId/settings/difficulty/preview

GET   /games/:gameId/supply
GET   /games/:gameId/supply/items/:itemKey
PATCH /games/:gameId/supply/items/:itemKey
POST  /games/:gameId/supply/restocks

GET   /games/:gameId/crafting/recipes
PATCH /games/:gameId/crafting/recipes/:recipeKey
GET   /games/:gameId/crafting/jobs
```

Admin authorization is game scoped. Difficulty and supply updates show a future-effect preview and write append-only audit records.

## Capability manifest

Candidate capability keys:

- `inventory.read`;
- `inventory.redeem`;
- `crafting.read`;
- `crafting.quote`;
- `crafting.start`;
- `crafting.cancel`;
- `crafting.claim`;
- `equipment.read`;
- `equipment.manage`;
- `equipment.maintain`;
- `equipment.salvage`;
- `supply.read`;
- `difficulty.read`.

A capability is advertised only after its route, parser, service, persistence, authorization, privacy, idempotency, and focused tests pass.

## Migration and database requirements

The post-reconciliation backend tranche must include:

- forward-only migrations;
- foreign keys scoped by game and owner where applicable;
- check constraints for quantities and lifecycle states;
- unique public keys and idempotency boundaries;
- indexes for player/game/status reads;
- row locks or equivalent concurrency control around spending and transition rows;
- RLS on exposed Supabase tables;
- trusted server functions for all economic mutation;
- append-only inventory, supply, crafting, maintenance, salvage, and audit events;
- clean zero-state replay twice;
- database lint and rollback rehearsal in isolated staging.

## Required atomic RPC boundaries

At minimum:

- create or apply item-supply restock;
- start crafting job from accepted quote;
- cancel eligible crafting job and release inputs;
- complete job and issue output;
- perform equipment maintenance;
- salvage equipment instance;
- equip or unequip instance with slot uniqueness.

Each RPC returns one committed result that can be safely replayed through an idempotency key.

## Test matrix

Required focused tests:

- missing, expired, revoked, inactive, and wrong-game player session;
- ownership UUID injection through path, query, headers, and body;
- invalid or disabled recipe;
- missing blueprint or permit;
- stale difficulty or recipe version;
- unavailable and partially available inputs;
- substitution ratio and permit enforcement;
- concurrent jobs spending the same material;
- quote expiry and release;
- duplicate start, completion, claim, maintenance, and salvage;
- equipment slot races;
- listed or reserved equipment mutation attempts;
- active-job protection after difficulty change;
- supply restock replay;
- no partial ledger or inventory mutation on failure;
- committed success preserved after refresh failure;
- browser DTO UUID leakage audit;
- capability fail-closed behavior.

## Implementation sequence after PR #158

1. Re-audit merged Store, Inventory, redemption, capability, identity, currency, and ledger contracts.
2. Approve the exact schema delta and public-key ownership.
3. Implement item definitions, difficulty versions, and session supply.
4. Integrate scarcity into Store quotes.
5. Implement crafting definitions, quotes, reservations, and jobs.
6. Implement equipment instances, slots, maintenance, salvage, and effects.
7. Connect Admin surfaces.
8. Connect Player Terminal surfaces.
9. Import only a bounded fixture catalog into isolated staging.
10. Run economic simulation, migration replay, concurrency tests, security review, and end-to-end verification.
11. Approve production activation separately.

## Explicit exclusions

This specification does not authorize:

- adding crafting to PR #158;
- a new backend branch before reconciliation merges;
- production migrations or Edge deployments;
- direct browser writes to Supabase economic tables;
- arbitrary JSON effect execution;
- production prices or supply quantities;
- activation of regulated or wartime recipes;
- Marketplace or business-production mutation before their own reviewed contracts exist.
