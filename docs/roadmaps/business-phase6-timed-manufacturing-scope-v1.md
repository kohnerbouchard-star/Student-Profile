# Business V2 Phase 6 — Timed Manufacturing Scope v1

**Status:** COMPLETE — exact-head certified on `739f5540234b20e16ba34f69f0d741d986030113`; Phase 7 checkpoint 7A opened
**Branch:** `feat/business-timed-manufacturing-v2`  
**Parent branch:** `feat/business-equipment-capacity-v2`  
**Certified Phase 5 implementation:** `6f936abd61c6cd903f6e839790ceab24ed570748`  
**Phase 5 durable certification head:** `614be4f7d4eee2848e2c6140b643893fbac23834`  
**Certified Phase 6A source:** `0589e8015736a8b770622be6ad0e5abedda24c26`  
**Phase 6B–6E implementation source:** `bee7a5c6a98389ed9f238fc7191f8c4621f6e1ff`  
**Certified Phase 6 exact-head source:** `739f5540234b20e16ba34f69f0d741d986030113`

## Purpose

Phase 6 replaces instant physical Business production with an authoritative server-timed manufacturing lifecycle. The browser may request a product, quantity, and bounded priority, but it never declares recipe identity, material cost, labor time, equipment time, start time, completion time, output quantity, success, failure, or settlement.

The governing rule is:

> A manufacturing job exists only after exact canonical materials, eligible labor, and installed equipment are reserved. The server starts it, the server decides when it is due, and a bounded worker settles it exactly once.

A later documentation or certification commit must not replace `bee7a5c6a98389ed9f238fc7191f8c4621f6e1ff` as the immutable Phase 6B–6E implementation identity.

## Certified dependencies

Phase 6 builds only on already certified authorities:

- canonical catalog and recipe access from Phase 2;
- canonical Business Stockroom, cost basis, and procurement from Phase 3;
- finite employee labor reservations and recurring payroll from Phase 4;
- canonical installed-equipment capacity and equipment reservations from Phase 5;
- append-only canonical Inventory transaction posting;
- first-class Business money and audit authority.

No duplicate recipe, inventory, labor, equipment, money, Store, or Player-identity authority is permitted.

## Phase 6A — lifecycle and worker foundation

Phase 6A is certified on `0589e8015736a8b770622be6ad0e5abedda24c26`.

It establishes:

- game-scoped `business_manufacturing_jobs` with public `mfg_...` identity;
- exact Business, physical product, canonical recipe, output item, and requesting Player scope;
- server-derived duration from canonical recipe duration, game difficulty, recipe availability, route/event multipliers, quantity, and bounded priority;
- immutable request identity and server-owned recipe/timing snapshots;
- lifecycle states `queued`, `in_progress`, `completed`, `cancelled`, and `failed`;
- resource states `reserved`, `consumed`, and `released`;
- append-only transition evidence;
- deterministic queue start;
- due-job completion leases with `FOR UPDATE SKIP LOCKED`, lease expiry, bounded retry backoff, and attempt ceilings;
- public-key-only Player reads that exclude internal UUIDs, lease tokens, request hashes, and reservation ownership metadata.

## Phase 6B — atomic manufacturing start and resource hold

**Phase 6B — atomic manufacturing start and resource hold is IMPLEMENTED.**

The service-owned atomic start transaction:

- resolves the authenticated Player's exact active Business;
- accepts only public Business/product keys, quantity, bounded priority, and idempotency intent;
- resolves exactly one Business-owned active canonical recipe and exact output item;
- rejects unavailable, wrong-country, inactive-pack, ambiguous, and nonphysical production;
- derives duration server-side through the Phase 6A timing authority;
- resolves canonical Business Warehouse and Work in Progress accounts;
- moves exact canonical BOM quantities `Warehouse -> WIP` through `economy_private.post_inventory_transaction_v2`;
- records immutable material-line quantity, carried cost, and currency evidence;
- binds the existing labor and equipment reservation authorities to one manufacturing job instead of adding parallel capacity tables;
- reserves eligible role/headcount/skill employee minutes in deterministic employee public-key order;
- reserves installed equipment capability/time in deterministic installation public-key order;
- inserts one queued job and append-only Player/audit evidence in the same transaction;
- replays matching idempotency without moving or reserving resources again;
- rejects conflicting idempotency reuse;
- uses deferred exact-resource validation so no queued or running job can commit with missing or extra BOM, labor, or equipment holds;
- rolls back the complete transaction when any material, labor, equipment, ownership, recipe, or reconciliation check fails.

## Phase 6C — exact-once completion and Finished Goods settlement

**Phase 6C — exact-once completion is IMPLEMENTED.**

The due-job settlement authority:

- accepts only a valid, unexpired completion lease for an `in_progress` job whose server-derived `completes_at` has passed;
- locks the job, staged WIP materials, labor reservations, equipment reservations, and canonical output holding in deterministic order;
- consumes exact WIP quantities through canonical Inventory journal authority;
- creates the exact canonical output quantity in Business Finished Goods;
- carries actual material basis plus bounded labor allocation into finished-goods cost basis without another payroll cash debit;
- consumes labor and equipment reservations exactly once;
- writes append-only transition and audit evidence;
- marks `completed` only after output and resource settlement commit atomically;
- rejects replay, stale leases, mismatched leases, early completion, and terminal mutation.

## Phase 6D — cancellation, failure, and terminal recovery

**Phase 6D — exact-once recovery is IMPLEMENTED.**

Recovery authority:

- validates Player cancellation ownership and worker failure authority;
- permits cancellation only from eligible nonterminal lifecycle states;
- reverses staged material from WIP to Warehouse through canonical Inventory authority;
- releases labor and equipment reservations exactly once;
- records stable public terminal error state without exposing internal failure metadata;
- prevents a stale worker from releasing or completing another worker's job;
- preserves terminal immutability and replay safety;
- fails closed when the reviewed completion-attempt ceiling is exhausted without leaking held resources.

## Phase 6E — authenticated Player API and workspace cutover

**Phase 6E — authenticated Player cutover is IMPLEMENTED.**

Immutable implementation source: `bee7a5c6a98389ed9f238fc7191f8c4621f6e1ff`.

The cutover:

- adds authenticated public-key-only manufacturing collection and cancellation route parsing;
- exposes owned-Business manufacturing reads through the canonical Business Player API;
- accepts Player intent through server-validated start and cancellation requests;
- derives game, Player, Business ownership, canonical recipe, output, timing, materials, labor, and equipment authority server-side;
- validates every database result through bounded manufacturing contracts before returning it to the browser;
- adds same-origin Player BFF endpoint identities for manufacturing read, start, and cancellation;
- adds manufacturing resources to the Player resource plan and refresh invalidation boundary;
- connects the Player Business workspace to server-timed manufacturing jobs and status;
- removes the legacy instant-production form from the connected workspace;
- returns stable authenticated HTTP `410 Gone` with `business_instant_production_retired` for the legacy instant-production route;
- keeps service-owned manufacturing wrapper functions unavailable to browser database roles;
- preserves public-key-only browser contracts, cross-game isolation, idempotency, and audit evidence.

Phase 6E does not make a browser timer authoritative. The UI displays server state and timestamps only.

## Locked lifecycle

```text
Player intent
  -> validate exact owned Business, canonical product, recipe, quantity, and priority
  -> reserve/move exact BOM materials Warehouse -> WIP
  -> reserve eligible employee minutes
  -> reserve installed equipment minutes
  -> create queued job with resource_state=reserved
  -> bounded worker starts job
  -> in_progress until server-derived completes_at
  -> bounded worker leases due job
  -> atomically consume WIP and create exact output in Finished Goods
  -> consume labor/equipment reservations exactly once
  -> completed with resource_state=consumed
```

Cancellation/failure path:

```text
queued or in_progress
  -> validate cancellation or failure authority
  -> reverse canonical WIP material state
  -> release labor/equipment reservations exactly once
  -> cancelled or failed with resource_state=released
```

## Concurrency and recovery requirements

Phase 6 must prove on one exact source that:

- two requests cannot reserve the same material, labor, or equipment capacity;
- matching idempotency retries create one job;
- conflicting idempotency reuse is rejected;
- queue workers cannot start the same job twice;
- completion workers cannot lease the same due job concurrently;
- an expired lease can be reclaimed while an unexpired lease cannot;
- stale workers cannot complete or release another worker's job;
- completion cannot occur before `completes_at`;
- output and resource consumption occur exactly once;
- cancellation/failure releases every held resource exactly once;
- terminal jobs are immutable;
- two simultaneous games cannot claim, mutate, or settle one another's jobs;
- a browser cannot submit trusted ownership, game, recipe, material, labor, equipment, timing, or completion outcomes.

## Public read boundary

Player-visible manufacturing data may include only:

- Business public key;
- manufacturing job public key;
- product public key;
- canonical recipe key;
- canonical output item public/canonical key and name;
- status and resource state;
- quantity and bounded priority;
- server duration;
- queued, started, due, and terminal timestamps;
- bounded completion-attempt/blocking state and stable public error code.

It must not expose internal UUIDs, inventory account IDs, holding IDs, employee IDs, equipment installation IDs, lease tokens, request hashes, raw snapshots, service metadata, or trusted ownership fields.

## Exact-head certification requirements

Phase 6B–6E are certified on frozen exact source `739f5540234b20e16ba34f69f0d741d986030113`. The passing matrix included:

- Phase 6 foundation, lifecycle, start, completion, recovery, and authenticated Player API contracts;
- focused rollback, concurrency, idempotency, lease, and recovery simulations;
- complete database replay from zero twice and rebuilt-database lint;
- Backend and all Edge typechecks;
- retained Phase 4 labor/payroll and Phase 5 equipment gates;
- Business Economy and Business Banking gates;
- Repository Quality and Supply Chain Security;
- Player Terminal verification including Chromium;
- environment-neutral browser and runtime interaction wiring;
- 40-Player classroom load and two-game isolation acceptance;
- durable execution-plan and execution-log certification evidence.

## Explicit exclusions

Phase 6 does not authorize:

- browser-declared start/completion timestamps or completion outcomes;
- client-side timers as authority;
- Store seller offers or Store-listing inventory;
- automatic sales or revenue settlement;
- five-minute Store withdrawal processing;
- durability decay, random equipment failure, repair pricing, or maintenance settlement;
- corporate equity, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secret mutation, or live database mutation.

## Completion rule

Phase 6 is complete only when all of the following are durable:

1. atomic job-start command with material/WIP, labor, and equipment reservations;
2. authenticated Player API cutover and explicit instant-production compatibility retirement;
3. bounded queue start and due-job lease worker;
4. atomic exact-once completion into Finished Goods;
5. cancellation/failure recovery with exact resource release;
6. public-key-only Player manufacturing read and connected UI state;
7. focused concurrency/idempotency simulations and database integration tests;
8. database replay from zero twice and rebuilt-database lint;
9. backend, all Edge, security, repository, Player, Chromium, 40-Player, and two-game regressions;
10. exact implementation source and durable execution-plan/log certification.

Implementation requirements 1–7 remain rooted in `bee7a5c6a98389ed9f238fc7191f8c4621f6e1ff`. Requirements 8–10 were satisfied on exact source `739f5540234b20e16ba34f69f0d741d986030113` through replay-twice/database lint, backend/all Edge, security, repository, Player/Chromium, 40-Player, two-game isolation, and durable plan/log/evidence certification.

## Final certification result

Phase 6 is durably complete on exact tested source `739f5540234b20e16ba34f69f0d741d986030113`. The authoritative evidence matrix is recorded in `business-phase6-final-certification-inventory-v1.md` and the execution log. The exact-head suite passed every required manufacturing, database, backend, Edge, Business, workforce/payroll, equipment, repository, security, Player, Chromium, 40-Player, and two-game isolation gate.

Permanent Phase 6 workflows remain as ordinary regression gates. Temporary repair/certification machinery is not part of the final PR diff and the one-time durable-record finalizer must be removed immediately after its successful docs commit. No merge, staging deployment, production deployment, secret mutation, or live database mutation is authorized by this certification.

## Next authorized checkpoint

**Phase 7 checkpoint 7A — seller-offer authority and multi-offer catalog aggregation is OPEN.** Build a stacked draft branch/PR from the certified Phase 6 lineage. Reuse canonical Store/catalog, Business, Inventory, money, and economic-party authorities. Keep seller offers separate from catalog identity. Physical Store custody, Store-listing inventory movement, withdrawal safety, buyer settlement, automatic sales convergence, equity/IPO, merge, and deployment remain closed.
