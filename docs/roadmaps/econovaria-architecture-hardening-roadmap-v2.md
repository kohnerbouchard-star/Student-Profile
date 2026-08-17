# Econovaria Architecture Hardening Roadmap v2

**Document ID:** `ECON-ARCH-HARDENING-V2`  
**Status:** `ACTIVE / READY_FOR_EXECUTION`  
**Authoring date:** 2026-08-17  
**Baseline main:** `72cefb73a0038aa2bc24261d63e70c113cb7c24c`  
**Program shape:** modular-monolith hardening; no rewrite  
**Expected delivery shape:** approximately 15–25 bounded PRs, each independently reviewable and mergeable  
**Companion authority:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md` remains the repository-wide completion ledger required by `AGENTS.md`.

This roadmap supersedes the architectural assumptions in `docs/roadmaps/econovaria-structured-refactor-roadmap-v1.md` where current `main` has already advanced beyond them. The earlier roadmap remains valid historical evidence. Do not redo already-completed decomposition merely because the old roadmap requested it.

Current `main` already contains `backend/src/domains`, `platform`, `shared`, `simulations`, domain contracts, API adapters, repositories, state-machine tests, ledger invariants, and architecture/audit tooling. The job now is to finish the boundaries, remove duplicate authority, reduce change amplification, and make those rules mechanically difficult to violate.

---

## 1. Program objective

Reduce Econovaria's architectural change amplification so a change to one game mechanic has one obvious implementation path and does not require unrelated subsystems to be modified or reverse-engineered.

The target is not fewer files. The target is **lower coupling, one authoritative implementation per mechanic, explicit ownership, predictable state propagation, and enforceable game isolation**.

### Definition of architectural success

The program is successful when all of the following are true:

1. Every game mechanic has exactly one authoritative domain implementation. Everything else is an adapter or consumer.
2. `game_sessions.id` is an enforced isolation boundary, not a convention developers must remember manually.
3. Economic writes remain transactional, game-scoped, server-authoritative, idempotent, and ledger-backed.
4. Store, Inventory, Crafting, Marketplace, Contracts, Banking, Stocks, Story/World, Progression, Attendance, and other domains do not directly mutate one another's persistence.
5. HTTP/BFF/Edge handlers are thin adapters: authenticate, parse/validate, call a use case, translate the result.
6. Cross-domain workflows are coordinated in application use cases with explicit transaction/event boundaries.
7. API request/response contracts and capability semantics have one canonical source per operation.
8. Player/Admin frontends use a consistent data-fetch/mutation/invalidation strategy instead of route-specific refresh behavior.
9. Scheduler/cron entrypoints only discover due work and invoke deterministic domain/application services.
10. Legacy/compatibility paths have explicit owners and removal criteria; superseded paths are deleted after parity evidence.
11. Architecture tests prevent the repository from reintroducing forbidden dependency patterns.
12. A developer can answer “where is this behavior implemented?” without searching multiple competing runtime paths.

---

## 2. Non-goals and hard constraints

This is **not** authorization for:

- a full rewrite;
- microservices, Kafka, RabbitMQ, or other distributed infrastructure solely to make the architecture look cleaner;
- changing gameplay semantics while moving architecture unless a separate roadmap item explicitly authorizes the behavior change;
- changing accepted Admin v606/Admin V2 or Player Terminal visual systems as part of backend cleanup;
- weakening RLS, authorization, rate limiting, audit logging, idempotency, privacy, or test coverage;
- exposing internal UUID ownership identifiers to browser contracts;
- bypassing the ledger for balance-affecting writes;
- destructive production schema edits or hand-edited production state;
- creating parallel replacement implementations that remain live indefinitely;
- merging or deploying without the authorization required by repository policy.

Preserve external behavior by default: method, route, auth requirement, permission, request schema, response envelope, status code, error code, idempotency behavior, side effects, game scoping, and audit behavior.

---

## 3. Mandatory Codex execution contract

Every coding session executing this roadmap must follow `AGENTS.md` and this loop before touching code:

1. Fetch current `main`; never assume the baseline SHA above is still current.
2. Read `AGENTS.md`, `CONTRIBUTING.md`, `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`, and this roadmap.
3. List active branches and open PRs that touch the candidate domain.
4. Reconcile the authoritative beta roadmap Scope Intake and live ownership before choosing work.
5. Do not create a replacement branch when an active branch already owns the same capability.
6. Audit the live implementation paths before planning. Never patch from stale chat summaries or old roadmap paths.
7. Add/reconcile the bounded architecture item in the beta roadmap Scope Intake when required by `AGENTS.md`.
8. Prefer characterization/contract tests before moving behavior.
9. Implement one bounded architectural seam per PR. Avoid giant mixed-domain refactors.
10. Run the relevant focused tests plus repository architecture/safety gates.
11. Record implementation files, tests, migrations, routes/RPCs, commit SHA, PR, runtime evidence, blockers, and next exact item in the authoritative roadmap.
12. A branch or PR is not `VERIFIED_COMPLETE`; only merged-main plus required evidence qualifies.

### Collision rule

At authoring time, attendance modularization is actively moving on `main`, and PR #1245 (`refactor: extract attendance reporting handlers`) is open. Treat this as a snapshot, not permanent truth. Re-audit active PRs before every tranche and **do not duplicate or rewrite an in-flight extraction**.

---

## 4. Target architecture

```text
Player UI                         Admin UI
   |                                 |
   +---------------+-----------------+
                   |
        typed API/BFF contracts
                   |
            HTTP/API adapters
                   |
          application use cases
                   |
       +-----------+------------+
       |           |            |
   Inventory    Economy       Stocks      ...domain modules
       |           |            |
       +-----------+------------+
                   |
        repositories / adapters
                   |
             Supabase / DB
```

### Required dependency direction

```text
UI -> API/BFF -> domain API adapter -> application -> domain -> infrastructure
```

Allowed cross-domain workflow:

```text
application use case -> public domain boundary/use case
```

Forbidden target-state patterns:

```text
UI -> Supabase
HTTP handler -> unrelated domain table
Domain A -> Domain B infrastructure internals
Scheduler -> hand-written duplicate business logic
Compatibility wrapper -> second authoritative implementation
Page component -> ad-hoc fetch/cache/retry/invalidation policy
```

---

## 5. Architecture invariants to preserve and strengthen

The existing `backend/src/domains/README.md` is directionally correct and remains authoritative unless separately changed. This program must strengthen, not bypass, its core rules:

- teacher-owned games are isolated by `game_sessions.id`;
- student-private state is game- and player-scoped;
- all live simulation state is game-scoped;
- all money movement goes through economy/ledger;
- cross-domain actions are coordinated through application use cases;
- API handlers stay thin;
- infrastructure owns persistence details;
- shared code must not become a dumping ground;
- global templates may exist, but live state must be copied/scoped into a game.

Add one overarching rule:

> **Every game mechanic has exactly one authoritative implementation. Everything else is an adapter or consumer.**

---

# PHASE 0 — Establish the measured baseline and freeze new architecture drift

**Priority:** P0  
**Blocking:** all later phases

### `ARCH-000` — Current architecture inventory

Status: `IMPLEMENTED_NOT_MERGED`

Execution record (2026-08-17): audited fetched `origin/main` at `72cefb73a0038aa2bc24261d63e70c113cb7c24c` from the existing owner branch `agent/architecture-hardening-roadmap-v2`. Open-PR collision audit covered #619, #620, #624 and #626; none owns the ARCH-000 deliverables, while #624's Player CSS/realtime files were treated as in-flight and not modified. Deliverables are `docs/architecture/econovaria-domain-ownership-v2.md`, `docs/architecture/econovaria-dependency-map-v2.md`, `scripts/architecture/build-architecture-inventory.mjs`, and its checked snapshot under `docs/architecture/inventories/`. The inventory measures 26 domains, 24 Edge entrypoints, 58 handler candidates, 168 cross-domain deep imports, 100 persistence-call candidates outside approved infrastructure paths, 27 browser shim/observer files, 209 compatibility-marker candidates, six scheduler/worker entrypoints, 100 source files at or above the 500-line review threshold, and 123 capability-like strings. Counts are candidate baselines and do not declare every lexical match a live violation. No runtime, route, RPC, migration, UI or schema behavior changes. Local evidence passes: deterministic `audit:architecture-inventory`; `audit:high-priority-boundaries` (80 checks); `audit:architecture` (7 broad fetch assignments, 1 scoped assignment, 11 MutationObservers); `audit:legacy-runtime` (8 groups, 15 runtimes, 2 credential records); Node syntax; JSON parse; `git diff --check`; and tracked/untracked changed-file secret scans. Runtime/staging evidence is inapplicable to this documentation/read-only tooling tranche. Implementation commit: `71bb4911f8a9e256549629ff74750a65cf26de46`; pull request: #629. Unresolved completion gate: the item remains unmerged and therefore cannot be `VERIFIED_COMPLETE`. Next exact item after merge and green required checks: `ARCH-001`.

Produce a current-main inventory, not an old-roadmap reconstruction:

- domain directory and public-boundary inventory;
- HTTP/BFF/Edge entrypoints mapped to domain use cases;
- direct Supabase/database call sites outside infrastructure/repository boundaries;
- cross-domain deep imports;
- direct cross-domain table/RPC mutations;
- duplicate route/handler implementations;
- compatibility/fallback runtime paths;
- global/browser transport shims;
- scheduler/cron entrypoints and the business logic they currently own;
- frontend fetch/mutation/invalidation patterns;
- files above agreed size/complexity thresholds;
- state machines implemented in more than one place;
- permission/capability strings interpreted differently across layers;
- seeded/template vs game-owned vs player-owned data classification gaps.

Deliverables:

- `docs/architecture/econovaria-domain-ownership-v2.md`
- `docs/architecture/econovaria-dependency-map-v2.md`
- a machine-checkable inventory under `docs/architecture/inventories/` or `scripts/architecture/` where practical.

### `ARCH-001` — Architecture ratchets before large moves

Status: `PLANNED`  
Depends on: `ARCH-000`

Extend existing architecture audits rather than inventing a disconnected second framework. Add ratchets for newly measured violations so the count can only move toward zero.

At minimum detect/ratchet:

- new direct database access from UI/browser code;
- new deep cross-domain imports;
- new cross-domain infrastructure imports;
- new direct balance mutation outside economy/ledger;
- new direct inventory mutation outside Inventory authority;
- new live simulation query/write without game scoping;
- new global browser transport monkey patches;
- new compatibility/fallback runtime paths without an owner/removal record;
- new HTTP handlers above a defined orchestration/complexity budget;
- reintroduction of retired routes/modules.

**Gate to leave Phase 0:** current violations are inventoried with owners; ratchets are green on current `main`; no later PR is allowed to increase the baselines.

---

# PHASE 1 — Make game and actor context structural

**Priority:** P0

### `ARCH-100` — Canonical request/application context

Status: `PLANNED`  
Depends on: Phase 0

Create or consolidate the existing equivalent of a request/application context carrying server-derived identity and scope. Do not invent a second context if one already exists.

Conceptually:

```ts
GameContext {
  gameSessionId
  actor
  role
  permissions/capabilities
  requestId
  idempotencyContext?
}
```

Requirements:

- browser-supplied ownership UUIDs are never trusted;
- game/player ownership is derived server-side;
- scoped repositories/use cases receive context explicitly;
- context is immutable for a request/use case;
- Admin and Player authentication remain distinct concepts;
- unauthorized cross-game access fails closed.

### `ARCH-101` — Data ownership classification

Status: `PLANNED`  
Depends on: `ARCH-100`

Classify persistent entities as one of:

- `GLOBAL_REFERENCE`
- `TEMPLATE`
- `GAME_SCOPED`
- `PLAYER_SCOPED`
- `SYSTEM_RUNTIME`

Document ambiguous tables and fix unsafe access patterns before deletion/lifecycle tooling depends on them.

### `ARCH-102` — Two-game isolation contract suite

Status: `PLANNED`  
Depends on: `ARCH-100`, `ARCH-101`

Create reusable tests proving that a mutation/read in Game A cannot observe or alter Game B across the high-risk domains: Story/World, Inventory, Store, Crafting, Economy/Banking, Stocks, Contracts, Marketplace, Progression, Attendance, Messaging/Notifications, and game lifecycle.

**Gate to leave Phase 1:** game scope is injected/derived through a canonical mechanism; high-risk domains have explicit two-game isolation evidence; no browser-owned game scope is authoritative.

---

# PHASE 2 — Establish one authoritative mutation path per core mechanic

**Priority:** P0

This is the largest value-producing phase. Work in vertical slices. Do not create a giant “domain refactor” PR.

## `ARCH-200` — Inventory authority

Status: `PLANNED`

Inventory owns:

- item ownership;
- quantities/instances;
- inventory events;
- consume/grant semantics;
- item-use semantics;
- inventory-side reservation semantics where applicable.

No Store/Crafting/Marketplace/Contract/Progression handler may directly reproduce Inventory mutation rules.

## `ARCH-201` — Redemption authority and state machine

Status: `PLANNED`  
Depends on: `ARCH-200`

Separate direct item use from supervised redemption. Preserve the canonical lifecycle and make transitions explicit through one state machine/use-case boundary.

Examples:

```text
request -> pending
pending -> approved | rejected
approved -> fulfilled
```

Forbidden: arbitrary callers setting a status column directly to simulate a transition.

## `ARCH-202` — Store -> Inventory/Economy integration

Status: `PLANNED`  
Depends on: `ARCH-200`, Phase 3 transaction primitive if required

A successful purchase must have one authoritative orchestration path for:

- validate purchasability/game state;
- debit through economy/ledger;
- update/reserve stock;
- grant through Inventory;
- write purchase/audit records;
- return a stable API contract.

No dual writes and no partially successful purchase state.

## `ARCH-203` — Crafting -> Inventory integration

Status: `PLANNED`  
Depends on: `ARCH-200`

Crafting owns recipes/crafting rules; Inventory owns item consume/grant. Crafting must not reproduce Inventory ownership logic.

## `ARCH-204` — Marketplace -> Inventory/Economy integration

Status: `PLANNED`  
Depends on: `ARCH-200`

Marketplace owns listing/reservation/trade lifecycle. Inventory and Economy remain authoritative for assets and money. Preserve existing abuse, replay, reservation, and lifecycle tests.

## `ARCH-205` — Economy/Banking/ledger authority

Status: `PLANNED`

Enforce the existing rule that all money movement uses the economy ledger. Consolidate remaining balance-changing paths into explicit use cases with idempotency and transaction semantics.

Scope includes Player Checking/Savings transfers, rewards/fines/payroll, Store, Contracts, Marketplace, Stocks, Businesses, and Admin adjustments where applicable.

## `ARCH-206` — Stocks/Market authority

Status: `PLANNED`  
Depends on: `ARCH-205`

Stocks own instruments, exchange/calendar rules, prices/ticks, orders/trades, portfolios and market-specific simulation. Economy owns money movement. Do not duplicate exchange/session logic in UI or scheduler code.

## `ARCH-207` — Business/asset authority

Status: `PLANNED`  
Depends on: `ARCH-205`

Define a canonical business ownership/asset boundary and ensure business-banking, marketplace, investments and Admin surfaces consume it rather than reproducing ownership checks.

## `ARCH-208` — Contracts/Progression/reward authority

Status: `PLANNED`  
Depends on: `ARCH-205`

Contracts own lifecycle/acceptance/completion rules. Progression owns progression mechanics. Reward issuance must use canonical Economy/Inventory boundaries instead of direct writes.

## `ARCH-209` — Story/World/Campaign authority

Status: `PLANNED`  
Depends on: Phase 1

Make story/campaign/world state transitions game-scoped, explicit and deterministic. Preserve the prior cross-game story-isolation correction and add regression tests around any remaining global-vs-game configuration seams.

**Gate to leave Phase 2:** high-risk mechanics each have one documented mutation authority; cross-domain direct writes are removed or ratcheted to zero; characterization/integration tests prove behavior parity.

---

# PHASE 3 — Transactions, state machines, commands/queries, permissions and errors

**Priority:** P0/P1

### `ARCH-300` — Canonical transaction boundary

Status: `PLANNED`

For multi-domain mutations, define explicit atomic boundaries using existing database/RPC transaction mechanisms where appropriate.

Priority workflows:

- Store purchase;
- Crafting consume/grant;
- Marketplace listing/reservation/settlement;
- Contract rewards;
- stock trade settlement;
- Player/Admin banking transfers/adjustments;
- game lifecycle operations that create/copy live game state.

Tests must include failure injection or equivalent assertions proving no partial mutation survives.

### `ARCH-301` — Commands vs queries

Status: `PLANNED`

Make mutation intent explicit. Reads may use optimized read models; commands own state transitions. Avoid generic “save/update” helpers that make mutation authority opaque.

### `ARCH-302` — Explicit lifecycle state machines

Status: `PLANNED`

Inventory redemption already has state-machine concepts. Extend the same discipline where multiple handlers currently encode lifecycle transitions independently.

Candidate lifecycles include:

- redemption;
- contracts;
- game sessions;
- marketplace listings/reservations;
- stock orders;
- licensing/entitlements/data purge;
- story/campaign progression.

State transitions must reject impossible transitions, be idempotent where required, and be tested independently of HTTP.

### `ARCH-303` — Permission/capability normalization

Status: `PLANNED`

Give permission/capability names one exact semantic meaning. The server is authoritative. UI may render capability-driven controls but must not invent different semantics.

Audit pairs such as `inventory.use` vs `inventory.redeem` and equivalent near-duplicate capabilities throughout the product.

### `ARCH-304` — Typed domain errors

Status: `PLANNED`

Introduce/consolidate domain errors so handlers translate known failures consistently instead of emitting generic 409/500/503 behavior with inconsistent payloads.

Examples: insufficient funds, invalid state transition, item unavailable, permission denied, game inactive, market closed, conflict/replay, not found.

Do not leak SQL, Supabase, stack, environment, service-role, or private identity detail.

**Gate to leave Phase 3:** priority multi-domain writes are atomic/idempotent; lifecycle transitions are explicit; capability semantics and error translation are canonical and contract-tested.

---

# PHASE 4 — Unify contracts and repository boundaries

**Priority:** P0/P1

### `ARCH-400` — Contract source-of-truth audit

Status: `PLANNED`

For each high-traffic route, identify the canonical request/response/validation contract. Do not create a new schema layer if the existing domain `contracts/` structure already serves the purpose.

Eliminate duplicated handwritten DTO interpretations across:

- domain API handlers;
- Admin BFF;
- Player BFF/API;
- frontend clients;
- tests/fixtures.

Prefer generated/derived types only when it reduces, rather than adds, sources of truth.

### `ARCH-401` — Repository/data-access boundary completion

Status: `PLANNED`

Move remaining persistence details out of domain/application/HTTP code into domain infrastructure/repository adapters. Do this incrementally and only when ownership is clear.

Do not build one enormous “generic repository.” Domain repositories should express domain language and preserve game scope.

### `ARCH-402` — Public domain boundaries

Status: `PLANNED`

Create or consolidate a minimal public boundary for cross-domain use. Ban random deep imports after consumers migrate.

Avoid barrel files that expose entire domains merely for convenience.

**Gate to leave Phase 4:** contracts have named owners, infrastructure access is localized, and cross-domain consumers use public boundaries rather than deep internals.

---

# PHASE 5 — Frontend data plane and live-state consistency

**Priority:** P0/P1

The goal is to eliminate “refresh button as consistency mechanism” behavior while preserving the accepted visual systems.

### `ARCH-500` — Canonical Admin data client/mutation policy

Status: `PLANNED`

Inventory existing Admin V2/BFF transport before changing it. Standardize:

- request lifecycle;
- retries/backoff where safe;
- cancellation/stale responses;
- mutation result handling;
- cache/read-model invalidation;
- optimistic updates only where correctness is provable;
- permission errors;
- offline/retryable states;
- loading/empty/stale/error rendering.

### `ARCH-501` — Canonical Player data client/mutation policy

Status: `PLANNED`

Apply the same principles to Player Terminal while preserving server-authoritative identity and same-origin security boundaries.

Priority mutation fan-out examples:

```text
Store purchase -> inventory + wallet + stock + relevant progression reads
Craft -> inventory + crafting state + progression reads
Bank transfer -> affected account views
Trade -> order/portfolio/balance views
Redemption request -> inventory/redemption views
```

### `ARCH-502` — Remove route-specific manual-refresh dependence

Status: `PLANNED`  
Depends on: `ARCH-500`, `ARCH-501`

Measure and remove cases where a successful mutation leaves authoritative dependent UI stale until manual reload/refresh.

Do not implement constant aggressive polling as a substitute for invalidation/realtime design.

**Gate to leave Phase 5:** mutations deterministically refresh/invalidate dependent state; route code no longer implements incompatible private networking policies; accepted UI behavior remains intact.

---

# PHASE 6 — Scheduler, simulation and internal domain events

**Priority:** P1

### `ARCH-600` — Scheduler as trigger, not business owner

Status: `PLANNED`

Inventory cron/scheduled functions. Refactor toward:

```text
find due games/work -> acquire/idempotency/lease guard -> invoke application service -> record outcome
```

Business rules belong in deterministic domain/application services reusable from tests and other entrypoints.

### `ARCH-601` — Simulation orchestration boundary

Status: `PLANNED`

Consolidate simulation advancement around explicit checkpoints/time windows and game-scoped deterministic inputs. Preserve existing checkpoint/retention/recovery guarantees.

Do not require per-tick heavy database churn merely to keep UI time moving; distinguish authoritative checkpoints from presentation interpolation where already designed.

### `ARCH-602` — Internal domain events

Status: `PLANNED`

Use a lightweight in-process/application event contract only where it genuinely reduces direct coupling.

Candidate events:

- item purchased/crafted/used;
- contract completed;
- trade executed;
- business created;
- story decision made;
- game started/paused/ended;
- player joined;
- progression milestone reached.

Rules:

- an event is not a substitute for an atomic write that must succeed together;
- critical money/inventory mutation stays inside the transaction;
- event consumers must be idempotent where replay is possible;
- do not introduce distributed messaging infrastructure without a separate demonstrated need.

**Gate to leave Phase 6:** scheduler code is thin, simulations are deterministic/game-scoped, and optional event coupling does not weaken atomicity or observability.

---

# PHASE 7 — Delete legacy/compatibility complexity and clarify topology

**Priority:** P0/P1 after parity evidence

### `ARCH-700` — Legacy runtime inventory with retirement conditions

Status: `PLANNED`

Every retained compatibility path must have:

- owner;
- current consumer;
- reason it still exists;
- canonical replacement;
- parity evidence required for removal;
- removal condition.

Targets include:

- deprecated routes;
- compatibility operations;
- browser fallbacks;
- legacy Admin/Player paths no longer serving traffic;
- duplicate API handlers;
- transport shims;
- obsolete feature flags;
- old globals/monkey patches;
- dead donor code.

### `ARCH-701` — Delete proven-dead paths

Status: `PLANNED`  
Depends on: `ARCH-700`

Delete only after proving no live consumer and preserving regression evidence. Update ratchets so deleted runtime paths cannot silently return.

### `ARCH-702` — Directory/topology normalization

Status: `PLANNED`

Only after authority is established, make locations discoverable and consistent. Avoid move-only churn before semantics are settled.

A domain should converge toward the repository's documented model:

```text
domain/
  api/
  application/
  domain/
  infrastructure/
  contracts/
  tests/
```

Not every domain needs every folder. Do not create empty architecture ceremony.

**Gate to leave Phase 7:** no unexplained live compatibility path remains; superseded code is deleted; canonical behavior locations are obvious from the tree and architecture docs.

---

# PHASE 8 — Observability and failure isolation

**Priority:** P1

### `ARCH-800` — Request/use-case trace context

Status: `PLANNED`

Ensure sensitive operations can be correlated without logging secrets or student-sensitive payloads. Prefer structured fields such as:

- request/correlation ID;
- game/session scope identifier where policy permits server logs;
- actor class/role, not leaked private credentials;
- operation/use-case name;
- duration;
- outcome;
- stable error code;
- retry/idempotency metadata where relevant.

### `ARCH-801` — Cross-domain workflow tracing

Status: `PLANNED`

Make workflows diagnosable as one operation, e.g. Store purchase -> ledger debit -> inventory grant -> audit/progression side effects.

### `ARCH-802` — Remove generic failure archaeology

Status: `PLANNED`

Pair typed domain errors with logs/metrics so a 409/500/503 can be traced to a stable operation/error class without reading arbitrary runtime logs across unrelated modules.

**Gate to leave Phase 8:** high-value mutations have traceable outcomes and stable error classes; no new sensitive information is exposed.

---

# PHASE 9 — UI/CSS architecture cleanup

**Priority:** P2; do after behavioral boundaries stabilize

### `ARCH-900` — Shared UI primitive audit

Status: `PLANNED`

Audit Admin V2 and Player Terminal separately. Reuse a shared design vocabulary where useful without forcing the two surfaces into one visual implementation.

Consolidate recurring primitives:

- spacing/type/icon tokens;
- page/shell layouts;
- panels/cards;
- tables/list-to-card responsiveness;
- forms/fields;
- dialog/drawer behavior;
- status/permission/error/empty/loading states;
- accessibility/focus behavior.

### `ARCH-901` — Remove one-off CSS repair layers

Status: `PLANNED`

Retire accumulated route-specific overrides only when their replacement is proven at required viewports. Preserve accepted visual systems and interactive map behavior.

**Gate to leave Phase 9:** shared primitives cover common behavior, route CSS is bounded, visual regression/browser checks pass, and no redesign has been smuggled into architecture work.

---

# PHASE 10 — Final convergence and architecture ratchet closure

**Priority:** P0 for program completion

### `ARCH-1000` — Full dependency re-audit

Status: `PLANNED`

Re-run the Phase 0 inventory against current `main` and compare counts:

- duplicate authorities;
- deep cross-domain imports;
- direct persistence bypasses;
- unscoped live game data access;
- legacy runtime paths;
- oversized HTTP/orchestration modules;
- frontend manual-refresh dependencies;
- scheduler-owned business rules;
- state-machine duplication;
- capability semantic drift.

### `ARCH-1001` — Ratchets to zero/accepted baseline

Status: `PLANNED`

Convert temporary baselines into hard zero-tolerance rules wherever remediation is complete. Any accepted residual debt must have an explicit roadmap owner and removal condition.

### `ARCH-1002` — Architecture completion evidence

Status: `PLANNED`

Produce a concise final architecture record containing:

- final dependency diagram;
- domain ownership table;
- canonical public boundaries;
- game/data ownership rules;
- transaction/event rules;
- scheduler/simulation rules;
- frontend data policy;
- compatibility inventory (expected empty or explicitly bounded);
- architecture audit output;
- merged PR/commit index;
- remaining non-blocking debt.

**Program completion gate:** all P0 items are `VERIFIED_COMPLETE` in merged `main`, required P1 items are complete or explicitly owned in the authoritative beta roadmap, all required CI/runtime gates pass, and architecture audits show no regression from the target state.

---

## 6. Recommended PR queue

This queue is a dependency guide, not permission to ignore active-branch ownership. Reconcile it against current `main` before every PR.

| Order | Suggested tranche | Primary roadmap items |
|---|---|---|
| 1 | Current dependency/authority inventory | `ARCH-000` |
| 2 | Architecture ratchets | `ARCH-001` |
| 3 | Canonical Game/Actor context | `ARCH-100` |
| 4 | Data ownership + two-game isolation harness | `ARCH-101`, `ARCH-102` |
| 5 | Inventory authority | `ARCH-200` |
| 6 | Redemption state machine/use split | `ARCH-201` |
| 7 | Economy/ledger authority and transaction primitive | `ARCH-205`, `ARCH-300` |
| 8 | Store + Crafting convergence | `ARCH-202`, `ARCH-203` |
| 9 | Marketplace convergence | `ARCH-204` |
| 10 | Stocks + Business convergence | `ARCH-206`, `ARCH-207` |
| 11 | Contracts/Progression rewards + Story/World scope | `ARCH-208`, `ARCH-209` |
| 12 | Commands/state machines/permissions/errors | `ARCH-301`–`ARCH-304` |
| 13 | Contract and repository/public-boundary completion | `ARCH-400`–`ARCH-402` |
| 14 | Player data plane | `ARCH-501`, part of `ARCH-502` |
| 15 | Admin data plane | `ARCH-500`, remainder of `ARCH-502` |
| 16 | Scheduler/simulation orchestration | `ARCH-600`, `ARCH-601` |
| 17 | Internal domain events where justified | `ARCH-602` |
| 18 | Legacy/compatibility retirement | `ARCH-700`, `ARCH-701` |
| 19 | Topology normalization | `ARCH-702` |
| 20 | Observability/failure isolation | `ARCH-800`–`ARCH-802` |
| 21 | UI/CSS architecture cleanup | `ARCH-900`, `ARCH-901` |
| 22 | Final re-audit and ratchet closure | `ARCH-1000`–`ARCH-1002` |

Split any tranche further if it crosses unrelated domains, changes too many runtime surfaces, or cannot be independently characterized and reverted.

---

## 7. Per-PR acceptance gate

Every architecture PR must include the following evidence unless genuinely inapplicable:

### Scope

- one named roadmap item or tightly related set;
- current-main baseline SHA;
- active-PR collision check;
- exact behavior intentionally preserved;
- explicit behavior changes, if separately authorized.

### Architecture

- no new forbidden dependency direction;
- no new duplicate authority;
- no new deep cross-domain infrastructure import;
- no new browser-authoritative game/player ownership;
- no new unscoped live-game query/write;
- no new ledger bypass;
- no new compatibility path without a retirement record.

### Tests

Run the narrowest relevant suite plus broader gates based on touched surfaces. Existing commands on current `main` include, as applicable:

```bash
npm run audit:high-priority-boundaries
npm run audit:architecture
npm run audit:legacy-runtime
npm run audit:migrations
npm run test:auth-boundaries
npm run test:admin-v2
npm run test:player-runtime-cutover
npm run test:admin-redemptions
npm run test:admin-economic-writes
npm run test:crafting-runtime
npm run test:progression-simulation

cd backend
npm run typecheck:all
npm run test:smoke
npm run test:player-inventory
npm run test:player-store-public
npm run test:player-banking-public
npm run test:economic-ledger-invariants
npm run test:player-marketplace
npm run test:player-crafting
npm run test:player-market-assets
npm run test:game-sessions
npm run test:game-lifecycle
npm run test:admin-api
```

Do **not** mechanically run every command above for a documentation-only or tightly scoped change; choose based on affected contracts and record why. Database/migration changes require migration validation/replay evidence. UI changes require focused browser/viewport evidence. Security-boundary changes require the corresponding auth/privacy/rate-limit tests.

### Quality

- tests are not weakened to fit the refactor;
- no unexplained skipped tests;
- no secrets/student-sensitive data;
- `git diff --check` clean;
- changed-file secret scan as required by existing workflows;
- docs/roadmap status updated with the exact next item.

---

## 8. Refactor technique rules

### Prefer strangler-style internal replacement

1. Characterize current behavior.
2. Introduce the canonical domain/use-case seam.
3. Move one caller to it.
4. Verify parity.
5. Move remaining callers.
6. Delete the old path.
7. Ratchet against its return.

### Avoid abstraction-first refactoring

Do not create generalized frameworks before at least two concrete consumers demonstrate the same need. Econovaria needs **fewer competing concepts**, not more abstract layers.

### Avoid “generic service” dumping grounds

Shared helpers should be small and dependency-light. Domain-specific policy belongs to the domain that owns it.

### Keep HTTP boring

Target handler shape:

```text
authenticate/derive scope
-> validate request
-> call application use case
-> translate typed result/error
```

### Keep domain logic testable without HTTP

State transitions, permissions, pricing/eligibility rules, and orchestration decisions should be testable independently of the Edge/BFF transport whenever practical.

### Preserve reversible delivery

Prefer additive internal seams followed by deletion after parity. Avoid one commit that moves many domains and changes behavior at the same time.

---

## 9. Risk register

### Risk A — “Refactor” silently changes gameplay

Mitigation: characterization tests first; explicit behavior invariants in every PR; separate product behavior changes from architecture changes.

### Risk B — A second architecture is created beside the current one

Mitigation: audit current `backend/src/domains` before introducing any new layer; consolidate existing primitives instead of duplicating them.

### Risk C — Active PR collision creates conflicting authorities

Mitigation: mandatory open-PR/branch audit; honor existing capability owner; rebase/reconcile after active work merges.

### Risk D — Transactions are split across services incorrectly

Mitigation: critical ledger/inventory/ownership writes remain inside one authoritative transaction boundary; events are only for post-commit/decoupled work.

### Risk E — Game isolation regresses during repository moves

Mitigation: canonical GameContext plus reusable two-game isolation tests and RLS/server-side ownership checks.

### Risk F — Legacy code is deleted before real parity

Mitigation: consumer inventory + runtime evidence + retirement criteria before deletion.

### Risk G — Frontend cache layer hides stale or incorrect state

Mitigation: server remains authoritative; mutation invalidation tests; avoid unbounded optimistic behavior.

### Risk H — Cleanup becomes endless

Mitigation: P0/P1/P2 classification and measurable exit gates. P2 polish is not allowed to block P0 architecture closure unless it causes correctness or operability risk.

---

## 10. Program priority

### P0 — Must be done to regain architectural control

- Phase 0 baseline/ratchets;
- Phase 1 game/data isolation;
- Inventory/Redemption authority;
- Economy/ledger authority;
- Store/Crafting/Marketplace transactional convergence;
- shared transaction semantics;
- critical API/permission/error consistency;
- frontend mutation consistency for high-risk gameplay;
- final architecture ratchets.

### P1 — Strongly recommended before aggressive scale-up

- remaining domain public boundaries/repositories;
- Stocks/Business/Contracts/Progression/Story convergence;
- scheduler/simulation ownership;
- internal domain events where useful;
- legacy retirement;
- observability/failure isolation.

### P2 — Cleanup after behavior is stable

- broad UI/CSS primitive consolidation;
- low-risk directory normalization;
- low-impact residual duplication.

---

## 11. Stop conditions

Codex must stop the current tranche and record a blocker instead of improvising if any of the following occurs:

- current `main` contradicts the roadmap's assumed ownership and there is no obvious canonical implementation;
- an active branch/PR owns the same capability;
- a behavior change is required to complete what was supposed to be behavior-preserving architecture work;
- migration order or production schema state is ambiguous;
- transaction boundaries cannot preserve an existing invariant;
- tests reveal cross-game leakage, ledger bypass, UUID/privacy leakage, or non-idempotent replay;
- the only proposed solution requires introducing a second source of truth;
- deletion cannot be proven safe.

A stop condition is not a reason to abandon the program. Record the exact contradiction, affected files/routes/tables, evidence, and the smallest decision needed from the product owner or next roadmap tranche.

---

## 12. End state

The intended end state is a maintainable modular monolith, not a distributed system:

```text
one repository
one deployment architecture where practical
clear domain modules
one authoritative implementation per mechanic
explicit application orchestration
transactional economic/gameplay mutations
strict game-session isolation
thin API/BFF adapters
consistent frontend data propagation
deterministic simulation scheduling
bounded compatibility code
mechanically enforced dependency rules
```

When this roadmap is complete, changing Inventory should primarily require understanding Inventory's public contract, not Store, Crafting, Admin internals, Player internals, scheduler code, and database implementation simultaneously. The same principle should hold for every major Econovaria domain.
