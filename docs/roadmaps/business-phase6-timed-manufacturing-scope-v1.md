# Business V2 Phase 6 — Timed Manufacturing Scope v1

**Status:** IN PROGRESS — Phase 6A certified; Phase 6B–6D implementation present; Phase 6E authenticated Player cutover implemented and pending exact-head certification
**Branch:** `feat/business-timed-manufacturing-v2`  
**Parent branch:** `feat/business-equipment-capacity-v2`  
**Certified Phase 5 implementation:** `6f936abd61c6cd903f6e839790ceab24ed570748`  
**Phase 5 durable certification head:** `614be4f7d4eee2848e2c6140b643893fbac23834`  
**Certified Phase 6A source:** `0589e8015736a8b770622be6ad0e5abedda24c26`  

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

## Phase 6A — lifecycle and worker foundation

Phase 6A is implemented and exact-head verified on `0589e8015736a8b770622be6ad0e5abedda24c26`.

It adds:

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

Phase 6A deliberately does not expose a Player job-creation route or a completion settlement function. This prevents a partially implemented lifecycle from accepting jobs without canonical resources or marking output complete without WIP settlement.

## Phase 6B — atomic manufacturing start and resource hold

**Phase 6B — atomic manufacturing start and resource hold is OPEN.**

The Phase 6B implementation now adds one service-owned atomic start transaction. Exact-head certification is pending the full required gate set.

The command:

- resolves the authenticated Player's exact active Business;
- accepts only public Business/product keys, quantity, bounded priority, and idempotency intent;
- resolves exactly one Business-owned active canonical recipe and exact output item;
- rejects unavailable, wrong-country, inactive-pack, ambiguous, and nonphysical production;
- derives duration server-side through the Phase 6A timing authority;
- resolves canonical Business Warehouse and Work in Progress accounts;
- moves exact canonical BOM quantities `Warehouse -> WIP` through `economy_private.post_inventory_transaction_v2`;
- records exact immutable material line, quantity, carried cost, and currency evidence;
- extends the existing labor and equipment reservation authorities with a mutually exclusive manufacturing-job binding rather than adding parallel capacity tables;
- reserves eligible role/headcount/skill employee minutes in deterministic employee public-key order;
- reserves installed equipment capability/time in deterministic installation public-key order;
- inserts one queued manufacturing job and append-only Player/audit evidence within the same transaction;
- replays matching idempotency without moving or reserving resources again;
- rejects conflicting idempotency reuse;
- uses a deferred exact-resource constraint so no queued/running job can commit with missing or extra BOM, labor, or equipment holds;
- rolls the complete transaction back when any material, labor, equipment, ownership, recipe, or reconciliation check fails.

The live Player route remains unchanged while this checkpoint is verified. Legacy instant production is not retired until the authenticated API cutover and completion/recovery path are both complete.

## Player cutover

Player cutover is **NOT STARTED** on this source. PR #661 does not yet contain the authenticated manufacturing start/cancel routes or the connected Player Business workspace. Those changes remain a later Phase 6 checkpoint and may not be represented as complete until their exact-head API, browser, replay, load, and two-game isolation gates pass.

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

## Phase 6B verification requirements

Phase 6B is not certified until all of the following pass on one exact source:

- focused authority contract and rollback/concurrency simulation;
- complete database replay from zero twice and rebuilt-database lint;
- Backend and all Edge typechecks;
- retained Phase 4 labor/payroll and Phase 5 equipment gates;
- Business Economy and Business Banking gates;
- Repository Quality and Supply Chain Security;
- Player Terminal Verify including Chromium;
- cross-game/public-key privacy checks;
- durable plan/log checkpoint evidence.

## Required completion worker

The next Phase 6 checkpoint must:

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

**Immediate checkpoint:** certify the existing Phase 6B–6D source on one replayable exact head, then implement Phase 6E authenticated Player API and workspace cutover. Do not open Store seller offers, sales, durability/repair, IPO, merge, or deployment before the full Phase 6 completion rule is satisfied.
