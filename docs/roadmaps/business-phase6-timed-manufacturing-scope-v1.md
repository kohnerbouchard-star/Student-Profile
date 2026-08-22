# Business V2 Phase 6 — Timed Manufacturing Scope v1

**Status:** IN PROGRESS — Phase 6A lifecycle and worker foundation implemented; live manufacturing cutover remains closed  
**Branch:** `feat/business-timed-manufacturing-v2`  
**Parent branch:** `feat/business-equipment-capacity-v2`  
**Certified Phase 5 implementation:** `6f936abd61c6cd903f6e839790ceab24ed570748`  
**Phase 5 durable certification head:** `614be4f7d4eee2848e2c6140b643893fbac23834`  

## Purpose

Phase 6 replaces instant physical Business production with an authoritative server-timed manufacturing lifecycle. The browser may request a quantity and priority, but it never declares recipe identity, material cost, labor time, equipment time, start time, completion time, output quantity, success, failure, or settlement.

The governing rule is:

> A manufacturing job exists only after exact canonical materials, eligible labor, and installed equipment are reserved. The server starts it, the server decides when it is due, and a bounded worker settles it exactly once.

## Certified dependencies

Phase 6 builds only on already certified authorities:

- canonical catalog and recipe access from Phase 2;
- canonical Business Stockroom, cost basis, and procurement from Phase 3;
- finite employee labor reservations and recurring payroll from Phase 4;
- canonical installed-equipment capacity and equipment reservations from Phase 5;
- append-only canonical Inventory transaction posting;
- first-class Business money and audit authority.

No duplicate recipe, inventory, labor, equipment, money, or Store authority is permitted.

## Phase 6A implemented foundation

The first bounded checkpoint adds:

- a game-scoped `business_manufacturing_jobs` lifecycle with public `mfg_...` identity;
- exact Business, product, canonical recipe, output item, and requesting Player scope;
- server-derived duration from canonical recipe duration, game difficulty, current recipe availability, route/event multipliers, quantity, and bounded priority policy;
- immutable request identity and server-owned recipe/timing snapshot;
- lifecycle states `queued`, `in_progress`, `completed`, `cancelled`, and `failed`;
- resource-state invariants requiring held resources before queue/start, consumed resources before completion, and released resources before cancellation/failure;
- append-only transition evidence;
- deterministic same-game queue start using row locks;
- due-job completion leases using `FOR UPDATE SKIP LOCKED`, bounded batches, lease expiry, retry backoff, and attempt limits;
- a public-key-only Player read model that excludes internal UUIDs, request hashes, leases, and trusted ownership metadata.

Phase 6A deliberately does **not** expose a Player job-creation route or a completion settlement function. This prevents a partially implemented lifecycle from accepting jobs that do not yet hold all canonical resources or from marking output complete without WIP settlement.

## Locked lifecycle

Target lifecycle:

```text
request intent
  -> validate exact Business-owned canonical recipe and output
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

Failure/cancellation path:

```text
queued or in_progress
  -> validate cancellation/failure authority
  -> release or reverse canonical material reservation/WIP state
  -> release labor/equipment reservations exactly once
  -> cancelled or failed with resource_state=released
```

## Required Phase 6B start command

The live Player production cutover remains closed until one command can atomically prove all of the following before inserting a job:

- authenticated Player owns or controls exactly one active Business;
- one active Business product resolves to one Business-owned canonical recipe;
- the product output equals an exact canonical recipe output item;
- game pack, country, scarcity, and recipe availability permit production now;
- exact BOM quantities are available in the canonical Business warehouse;
- BOM quantities move or reserve into canonical WIP without double-spend;
- eligible role/headcount/skill employee minutes are reserved in deterministic order;
- required installed equipment capabilities and minutes are reserved in deterministic order;
- server-derived duration and snapshot are frozen;
- matching idempotency replays the same job and conflicting reuse fails closed.

The legacy instant production RPC must remain intact until this complete start transaction is implemented and certified. It must then be retired through an explicit compatibility boundary rather than silently changed underneath old clients.

## Required completion worker

Phase 6 completion must:

- claim only due `in_progress` jobs with an unexpired exclusive lease;
- reject stale or mismatched leases;
- lock the job, WIP holdings, labor reservations, equipment reservations, and output holding in deterministic order;
- consume exact WIP quantities through canonical Inventory journal authority;
- create the exact canonical output quantity in Business Finished Goods;
- carry actual material basis plus labor allocation into finished-goods cost basis without a second payroll cash debit;
- consume labor and equipment reservations exactly once;
- write append-only transition and audit evidence;
- mark `completed` only after all settlement is committed;
- roll back the entire transaction on any failure;
- release the lease with bounded retry timing for retryable failures;
- fail closed after the reviewed attempt ceiling without leaking held resources.

## Concurrency and recovery requirements

Phase 6 must prove:

- two requests cannot reserve the same material, labor, or equipment capacity;
- matching idempotency retries create one job;
- conflicting idempotency reuse is rejected;
- queue workers cannot start the same job twice;
- completion workers cannot lease the same due job concurrently;
- an expired lease can be reclaimed, while an unexpired lease cannot;
- stale workers cannot complete or release another worker's job;
- completion cannot occur before `completes_at`;
- output and resource consumption occur exactly once;
- cancellation/failure releases every held resource exactly once;
- terminal jobs are immutable;
- two simultaneous games cannot claim or settle one another's jobs.

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

## Explicit exclusions

Phase 6 does not authorize:

- browser-declared start/completion timestamps or completion outcomes;
- client-side timers as authority;
- Store seller offers or Store-listing inventory;
- automatic sales or revenue settlement;
- durability decay, random equipment failure, repair pricing, or maintenance settlement;
- corporate equity, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secret mutation, or live database mutation.

## Completion rule

Phase 6 is not complete until all of the following are durable:

1. atomic job-start command with material/WIP, labor, and equipment reservations;
2. authenticated Player API cutover and explicit instant-production compatibility retirement;
3. bounded queue start and due-job lease worker;
4. atomic exact-once completion into Finished Goods;
5. cancellation/failure recovery with exact resource release;
6. public-key-only Player manufacturing read and connected UI state;
7. focused concurrency/idempotency simulations and database integration tests;
8. database replay from zero twice and rebuilt-database lint;
9. backend, all Edge, security, repository, Player, Chromium, and 40-Player/two-game regressions;
10. exact implementation source and durable execution-plan/log certification.

## Next authorized checkpoint

**Phase 6B — atomic manufacturing start and resource hold is OPEN.** Implement the complete canonical Warehouse -> WIP material reservation/movement plus labor/equipment reservation transaction and create one queued job only after every prerequisite is committed. Do not add output completion or Store sales in the same checkpoint.
