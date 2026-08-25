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

Status: `VERIFIED_COMPLETE`

Execution record (2026-08-17): audited fetched `origin/main` at `72cefb73a0038aa2bc24261d63e70c113cb7c24c` from the existing owner branch `agent/architecture-hardening-roadmap-v2`. Open-PR collision audit covered #619, #620, #624 and #626; none owns the ARCH-000 deliverables, while #624's Player CSS/realtime files were treated as in-flight and not modified. Deliverables are `docs/architecture/econovaria-domain-ownership-v2.md`, `docs/architecture/econovaria-dependency-map-v2.md`, `scripts/architecture/build-architecture-inventory.mjs`, and its checked snapshot under `docs/architecture/inventories/`. The inventory measures 26 domains, 24 Edge entrypoints, 58 handler candidates, 168 cross-domain deep imports, 100 persistence-call candidates outside approved infrastructure paths, 27 browser shim/observer files, 209 compatibility-marker candidates, six scheduler/worker entrypoints, 100 source files at or above the 500-line review threshold, and 123 capability-like strings. Counts are candidate baselines and do not declare every lexical match a live violation. No runtime, route, RPC, migration, UI or schema behavior changes. Local evidence and the required pre-merge PR suite passed, including deterministic inventory, architecture/high-priority/legacy audits, repository quality, security, replay and release-contract workflows. The transient Business Banking setup failure (GitHub action download 503/429/500) passed unchanged on rerun. Runtime/staging evidence is inapplicable to this documentation/read-only tooling tranche. Implementation commit: `71bb4911daf47720ecb3e10872260c61bf26ff06`; accepted PR #629 head: `0bc5edb5097d9bfcea8276c2ffa6f209ba4d1385`; merge commit: `e40cb5b066457a355d09cdb47cf6fa13e45f6923`. The accepted-head and merge trees are identical at `f7af6ce5c4c2a051e4b572e16e0cc433ff5e18ed`. Post-close Branch Hygiene run `32040084962` initially failed when GitHub's delete-ref API returned HTTP 503; attempt 2 passed on 2026-08-25, and the owner branch is absent locally and remotely. A later dynamic CodeQL Python job in run `32040352374` failed before checkout on repeated external action-download HTTP 429 responses and cannot be rerun; the Actions and JavaScript/TypeScript jobs passed, and this does not change the already accepted implementation evidence. Unresolved implementation blocker: none. Next exact item: `ARCH-001`.

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

Status: `VERIFIED_COMPLETE`
Depends on: `ARCH-000`

Execution record (2026-08-17): owner branch `chore/architecture-ratchets-v1`, created from merged ARCH-000 main `e40cb5b066457a355d09cdb47cf6fa13e45f6923` and reconciled with current main `7ecc9e018f6ee82ef4f4eae56a824e719481c3fd`. Collision audit covered open PRs #619, #620, #624 and #626; none owns architecture ratchets, and no in-flight Player/runtime file was modified. This tranche composes the existing Admin and legacy-runtime audits with a checked v2 baseline and non-increasing/zero-tolerance checks in `scripts/architecture/`. It detects direct browser database access, deep cross-domain and infrastructure imports, direct balance/Inventory mutations outside their owners, unscoped live-simulation persistence, browser transport monkey patches, unowned compatibility candidates, oversized handlers/source files and retired browser markers. No behavior, route, RPC, schema, migration or UI change. Local acceptance passed: `npm run audit:architecture`, `npm run audit:high-priority-boundaries`, `npm run audit:legacy-runtime`, syntax/JSON validation, `git diff --check`, and changed-file secret scans. PR #631's required checks all passed; release-only jobs were skipped by their intended conditions, and transient external action-download/Admin browser failures passed unchanged on rerun. Runtime/staging evidence is inapplicable to read-only architecture tooling. Implementation commit: `a19b8b0758cf174dfb8205676b1bd4d5175c326d`; PR #631 merged into `main` as `92a818dfd719d1dcf1407c39bb6904f5d9b78077`. Unresolved blocker: none. Next exact item: `ARCH-100`.

Extend existing architecture audits rather than inventing a disconnected second framework. Add ratchets for newly measured violations so the count can only move toward zero.

Implementation commit: `a19b8b0758cf174dfb8205676b1bd4d5175c326d`; pull request: #631; merge commit: `92a818dfd719d1dcf1407c39bb6904f5d9b78077`.

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

Status: `IN_PROGRESS`
Depends on: Phase 0

Execution record (2026-08-17): Phase 0 is merged and verified through `92a818dfd719d1dcf1407c39bb6904f5d9b78077`. `ARCH-100A` consolidated the live `PlayerRequestScope` equivalent into an immutable internal Player application context with server-generated request identity and forwarded the same server-derived object from the reviewed rate-limit boundary into Inventory read/redemption handlers in both Player entrypoints. Unsupported methods retain scope-free behavior, direct handler callers retain a characterized fallback, and no browser contract receives the internal context. Player implementation commit `cb356a8fb6e6d6f5b826a437b60d33c6121d1429`, PR-bound authority commit `5592fb369cd4d2c195a41952c25d9ff265634932`, and final head `4a1cbd6322853ae46cdc7ddfcd186c42d667544a` merged through PR #633 as `baca5cfdd5934f1f85b3666d4e85bfac30244060`; the merge and accepted head trees are identical. Focused Player/privacy/security/Inventory suites, the full backend smoke/Admin API suite, typechecks, auth boundaries, architecture/legacy ratchets, secret scan and diff checks passed. Exact-head PR evidence is 38 successful check runs, 13 intended conditional skips, 3 successful status contexts, and no pending/failing context; merge-SHA Player Terminal Verify run `32065901120` passed. Connected staging was inapplicable because no route, RPC, migration, schema, response, UI, deployment, economic-write or idempotency behavior changed.

Completed Admin tranche (2026-08-18): `ARCH-100B` owner branch `refactor/admin-request-application-context-v1` was created from exact merged `main` `baca5cfdd5934f1f85b3666d4e85bfac30244060` and reconciled through `7a5542afa9ca50d83b6e045b7d4ea8993477645b`. Its collision audit covered #619, #620, #624, #626 and then-draft #634; none owned the Admin guard/context/Inventory-adapter seam. The implementation projects a distinct immutable Admin context once, only after `guardAdminRequest` and `ensureOwnedGame`, using server-resolved Staff identity, owned-game scope, reviewed permission/AAL state and a server-generated request ID. The exact context reaches the Admin Inventory adapter, which alone derives the preserved core/RPC scalars; browser responses, mutation identity and idempotency behavior are unchanged. Implementation commit `393e93de039c36e1180e205d381a2ad32c9d7e47` and final head `c4771765699f26c456883b9be30cd00cc06b249d` merged through PR #635 as `c4710c0a7fc51773f8a1fb0050e6b2d1b785d3aa`; merge and accepted-head trees are identical. Exact-head evidence is 33 successful check runs, 8 intended skips, 3 successful status contexts and no pending/failing context. All 17 exact-merge workflows passed, including Admin API run `32077056600`, Backend Typecheck `32077056489`, Admin Shell Smoke `32077056446`, CodeQL `32077055816`, Production Git Release `32077056498` and Vercel Git Production Verification `32077259492`. Focused factory/privacy/router tests (13), Admin API (160), Admin local mutations (80), Admin local UI/composition (14), Player Inventory (46), auth boundaries (16 + 8), full backend smoke, `typecheck:all`, architecture/high-priority/legacy ratchets, deterministic inventory, secret and diff gates passed. No route, RPC, schema, migration, response, UI, economic-write or idempotency behavior changed; no tranche-specific staging fixture was required, while automatic exact-source production verification passed. The previously recorded verifier blocker is cleared. `ARCH-100B` is `VERIFIED_COMPLETE`, but the parent `ARCH-100` remains `IN_PROGRESS` because scoped use-case/repository propagation is still incomplete.

Verified Player Inventory tranche (2026-08-18): `ARCH-100C — Player Inventory context propagation` was owned solely by `refactor/player-inventory-context-propagation-v1`, created from and merge-based exactly on verified `main` `c4710c0a7fc51773f8a1fb0050e6b2d1b785d3aa`. The final collision audit covered open PRs #619, #620, #624 and #626; none overlapped the bounded backend Inventory paths. Six stale `feat/economic-asset-ownership-core-v2-*` aliases overlapped five read files but remained non-authoritative donor hazards from merged PR #503 and were not merged or cherry-picked. Root manifests, workflows, Player Terminal/realtime/browser files, the singleton Player authority manifest, migrations/RPC SQL, Admin files, UI and deployment files remained excluded.

Implementation commit `15aa42cc5dc128b19238f23d0c91201c744fbc1a` adds the Inventory-owned type-only context port, changes the read and redemption contracts to require it, preserves the exact frozen Player context through both handlers and explicit read/redemption service seams, and projects `gameSessionId` and `actor.playerUuid` only inside the two Supabase repositories. Valid direct handler callers create the canonical context with a server-generated request UUID; malformed/unsupported operations remain scope-free. Redemption command identity and its parsed idempotency key remain separate and unchanged. Focused handler/service/repository and full-lifecycle tests prove reference identity, frozen fallback context, canonical query/RPC projection, cross-game denial, UUID-private responses, created/replayed/conflicting idempotency outcomes and unchanged error contracts. The package-owned Player Inventory suite now registers the previously omitted policy test and the new service test. The deterministic inventory records 1,029 source files; all v2 debt measurements remain flat at 100 persistence candidates, 168 cross-domain deep imports, 9 cross-domain infrastructure imports, 9 browser transport monkey-patch files, 209 compatibility-marker files, 100 oversized sources and 5 oversized handlers, with all three zero-tolerance categories still zero.

Local evidence passed: Player Inventory 50/50; Player request-scope/privacy 22/22; Player security and both-root composition 43/43; adjacent Crafting 25/25, Store 14/14 and Marketplace 48/48; Crafting runtime 37/37; economic/store authority contracts 16/16; auth boundaries 16/16 plus 8/8; `typecheck:all`; the separate Player API Deno check; full backend smoke including Admin API 160/160; the complete root `npm test`; high-priority, architecture and legacy ratchets; deterministic inventory; JSON, secret and diff checks. The initial root composite attempt exposed only missing lockfile-declared local test dependencies; `npm ci --ignore-scripts` restored them without a tracked change, the exact web-session suite passed 45/45, and the full composite rerun passed. Independent review found no correctness, security, privacy, dependency-direction or behavior-parity defect. No route, RPC, schema, migration, runtime dependency, response, UI, deployment, economic-write or idempotency behavior changed; tranche-specific connected staging was inapplicable. The current Supabase changelog was reviewed and no Edge, Data API or database breaking change applied.

PR #637 accepted exact head `1fb86699178ed65567dbf5b28263b053a436f0b1` with 27 successful rollup contexts including one Vercel status, eight intended conditional skips, no pending/failing context and no review thread. It merged as `0e35bbab51e9459ceb83246e6d72ea1123b29283`; accepted-head and merge trees are byte-identical at tree `376a030061946a424df5406c8ba52bdede875c5a`. All 12 exact-merge workflows passed: CodeQL `32079905824`, Edge Function Inventory Convergence `32079905952`, Admin Game Lifecycle Controls `32079905963`, Beta Security Contract `32079906001`, Backend Typecheck `32079906003`, Beta Pilot Contract `32079906004`, Repository Quality `32079906043`, Production Git Release `32079906047`, Required Game Market Timezone `32079906072`, Runtime Interaction Wiring `32079906075`, Supply Chain Security `32079906140` and downstream Vercel Git Production Verification `32080106139`. The merge aggregate is 20 successful checks and three intended skips with no pending/failure; staging and production Edge inventories converged, bounded staging/production live parity passed, `release/production` fast-forwarded to the merge SHA, and canonical production health verified `sourceCommit` exactly `0e35bbab51e9459ceb83246e6d72ea1123b29283`. Branch Hygiene run `32079906337` passed and the owner branch is deleted locally and remotely. The Player-specific push workflow did not select this path, so focused exact-head evidence transfers through the proven identical tree; no configured merge gate is missing. `ARCH-100C` is `VERIFIED_COMPLETE` with no unresolved blocker.

Started Admin Game Sessions tranche (2026-08-18): dependency-serialized `ARCH-100D — Admin Game Sessions context propagation` is now owned solely by `refactor/admin-game-sessions-context-propagation-v1`, created from exact verified `main` `0e35bbab51e9459ceb83246e6d72ea1123b29283` only after `ARCH-100C` exact-merge evidence passed. No active local/remote branch or pull request already owned the work. The initial collision audit covers open PRs #619, #620, #624 and #626: none overlaps the bounded Game Sessions source, while #620 owns relevant workflow definitions and is an acceptance-control-plane collision that this tranche must not edit. Stale branches `wip/codex-production-slices-2026-08-04`, `automation/admin-v2-ux-root-apply-20260814`, `agent/market-minute-replay-v1`, the two PR501 banking release aliases when `readModels.ts` is touched, and `feat/story-narrative-convergence-v1` are donor hazards and must not be merged or cherry-picked. The bounded design must pass the exact reviewed context through join-code/settings paths across Admin, Classroom and Staff callers, preserve reference identity until narrow Supabase/RPC adapters project scalars, keep server request context separate from mutation/idempotency identity, and preserve auth, ownership, permissions/AAL, routes, payloads, errors and UUID-private browser contracts. Create-game/provisioning, unrelated lifecycle/routes/domains, root manifests, workflows, Admin/Player UI, migrations/RPC SQL and deployment configuration are excluded. `ARCH-100` remains `IN_PROGRESS`; re-audit residual scalarized paths after `ARCH-100D` and name any additional bounded owner before closing it. `ARCH-101` remains dependency-blocked and must not start first.

Implemented but not merged (2026-08-18): implementation commit `a59e5caaddf995499795481c897c756395e34916` is under review in PR #638 on the sole owner branch and unchanged exact base. The tranche adds a type-only Game Sessions Staff context plus infrastructure-neutral mutation identity/repository port; creates one immutable shared Staff context only after the existing auth, AAL/rate-limit and owned-game checks; preserves the exact existing Admin context by reference; and moves join-code/settings read and mutation scalar projection into narrow Supabase adapters. Admin join-code read, full/group settings read, update, rotate and compatibility reset now carry the same context through their application/repository seams. Classroom and Staff roots remain unchanged but are both registered in a two-root composition contract. Mutation identity/idempotency stays separate, and routes, response/error/replay contracts, internal-UUID privacy and Admin v606 behavior are unchanged. No migration, RPC SQL/signature, schema, runtime dependency, UI, workflow or deployment file changed.

Local acceptance passes on the exact implementation candidate: Game Sessions 58/58; Admin local mutations 80/80; Admin API 165/165; `typecheck:all`; separate Staff root Deno check; full backend smoke; complete root `npm test`; Admin local UI/composition 15/15; game-session controls and lifecycle; auth boundaries 16/16 plus 8/8; high-priority, admin-contract, architecture and legacy ratchets; secret and diff checks. The deterministic inventory now records 1,040 source files while all v2 debt limits remain flat at 100 persistence candidates, 168 cross-domain deep imports, 9 cross-domain infrastructure imports, 9 browser transport monkey-patch files, 209 compatibility-marker files, 100 oversized sources and 5 oversized handlers; all zero-tolerance categories remain zero and the capability set remains 123. Thirty-two new/touched TypeScript files pass formatting; collision-sensitive `compatibilityOperations.ts` and `readModels.ts` retain pre-existing whole-file format debt without unrelated reformatting. Independent review found two medium acceptance gaps, both fixed: the domain port now owns a neutral mutation identity rather than a Supabase type, and both concrete shared roots have exact-permission registered composition evidence. Re-review found no remaining correctness, auth-order, ownership, privacy, replay, context-identity, dependency-direction or test-evidence defect. The current Supabase changelog was reviewed; no applicable Edge, Data API or database breaking change applies to this TypeScript-only tranche.

Verified Admin Game Sessions tranche (2026-08-18): PR #638 accepted exact head `b19da03f4838d39a7bfa91ec5e36474177d56e3d` with 41 passing checks, 10 intended conditional skips, no pending/failing/cancelled check, no review and no review thread. It merged into unchanged exact base `0e35bbab51e9459ceb83246e6d72ea1123b29283` as `651e607c0f63f79532c9f06ee74b705622ee7819`; the merge parents are exactly the prior main and accepted head, and both accepted-head and merge trees are byte-identical at `f784e1d585db8b2e4337f50558b23442bbee8e56`. All 17 exact-merge workflows passed: CodeQL `32083315409`, Edge Function Inventory Convergence `32083315746`, Admin API Check `32083315726`, Beta Pilot Contract `32083315741`, Player Local Currency Authority `32083315748`, Backend Typecheck `32083315749`, Repository Quality `32083315752`, Admin Bundle Contract Audit `32083315759`, Beta Security Contract `32083315774`, Admin Shell Smoke `32083315782`, Production Git Release `32083315784`, Required Game Market Timezone `32083315788`, Business Banking Runtime `32083315797`, Admin Game Lifecycle Controls `32083315798`, Supply Chain Security `32083315808`, Runtime Interaction Wiring `32083315820` and downstream Vercel Git Production Verification `32083500512`; no exact-merge workflow failed or remained unresolved.

Post-merge evidence is exact-source and complete. Edge convergence run `32083315746` deployed and validated staging first and production second: both have 18 canonical functions, staging has 8 allowed temporary functions, production has none, and every missing, unexpected, JWT, digest, version and retired-function mismatch set is empty. Production Git Release `32083315784` passed tokenless contract validation, staging/production capture, bounded live-parity enforcement with zero unapproved difference and publication guarded by the exact Edge attestation; `release/production` fast-forwarded exactly to `651e607c0f63f79532c9f06ee74b705622ee7819`. Vercel verifier `32083500512` passed its dispatch envelope, exact checkout/release identity, production deployment and canonical health gates; production `/api/health` reports `ok:true`, `status:"ready"`, expected production project `cgiukdjwicykrmtkhudh`, both session services HTTP 200 and `sourceCommit` exactly equal to the merge SHA. Branch Hygiene `32083315958` passed, the remote owner ref is absent, and the merged local owner plus stale tracking ref were retired. No schema, migration, RPC, route, response, UI, deployment configuration, economic-write, idempotency or runtime dependency changed, so no additional tranche-specific connected staging fixture applied. `ARCH-100D` is `VERIFIED_COMPLETE` with no unresolved blocker.

Started residual classification (2026-08-18): dependency-serialized `ARCH-100E — residual context propagation classification and owner split` was owned solely by `refactor/context-propagation-residual-classification-v1`, created from exact verified main `651e607c0f63f79532c9f06ee74b705622ee7819` only after every `ARCH-100D` gate passed. No active local/remote branch or pull request already owned this work. The refreshed collision audit covered open PRs #619, #620, #624 and #626: none owned residual context classification, while #620 remained a workflow control-plane collision and #624/#626 constrained later Player browser and authority-manifest edits. Classification began with multi-game Admin/Staff bootstrap reads in `admin-api/common.ts` and `staffBootstrapHttpHandler.ts`, then mapped scalarized Admin Players/Attendance/Store/Contracts paths, remaining Admin domain routers, shared non-Game-Sessions Staff/Classroom handlers and Player non-Inventory domains into dependency-ordered, collision-bounded owners. This audit changed only a dedicated owner-map document and the two roadmaps; it did not claim those runtime paths implemented. Stale donor hazards remain prohibited. `ARCH-100` remains `IN_PROGRESS`, and `ARCH-101` remains blocked until every resulting propagation owner is merged and verified.

Implemented residual classification (2026-08-18): `docs/architecture/econovaria-context-propagation-owner-map-v1.md` records the exact audited main/tree, canonical context authorities and invariants, ten required/exempt boundary classes, reviewed Admin/shared Staff/Player residual candidate inventory, dependency and collision graph, per-owner gates, and the objective final closure test. Multi-game discovery may load only owner-filtered game IDs before security review; scoped bootstrap hydration uses distinct reviewed contexts sharing one server-generated request correlation ID across all owned-game contexts and never a fabricated aggregate game. Pre-auth, post-verification auth workflow, Staff-global, pre-game Licensing, unreachable compatibility, and system-worker paths are classified rather than forced into a false active-session game context; the post-create provisioning leg is explicitly owned inside `ARCH-100U`. Player/Admin rate-limit ordering, the two-process Admin-to-Classroom proxy boundary, existing identifier compatibility debt, and infrastructure-neutral inward dependencies are explicit gates. The runtime implementation queue is strictly serialized from `ARCH-100F` through `ARCH-100X`, including mandatory Players, Contracts, Economy, and Stocks subowners, so shared roots/application/repository seams cannot collide. `ARCH-100X` must generate an exact-main root-to-handler artifact with zero unassigned live edges and zero unresolved required entries before the parent can close. This documentation-only tranche changes no runtime, route, schema, RPC, migration, response, UI, economic write, idempotency, dependency, workflow, or deployment file. The next exact item is `ARCH-100F — Multi-game bootstrap context hydration` on `refactor/multi-game-bootstrap-context-hydration-v1`.

Local classification acceptance passed on the exact candidate: `npm run audit:architecture`, `npm run audit:high-priority-boundaries`, `npm run audit:legacy-runtime`, `npm run security:secrets`, and `git diff --check`. The deterministic inventory remained unchanged at 1,040 source files, 100 persistence candidates, 168 cross-domain deep imports, 9 cross-domain infrastructure imports, 9 browser transport monkey-patch files, 209 compatibility-marker files, 100 oversized sources, 5 oversized handlers, and zero in every zero-tolerance category. Independent Admin, shared Staff, and Player audits found misclassified system runtime, live Dashboard/login/Crafting mutations, post-create provisioning, false rate/UUID absolutes, oversized owners, proxy/process identity, inward-dependency, root-enumeration, and objective-closure gaps; all were corrected. Three skeptical re-review lanes reported no remaining blocker. Runtime/typecheck, migration, staging, and connected-system suites were inapplicable locally because this tranche changes documentation only; the required exact-head and exact-merge gates subsequently passed. Implementation commit: `977db267704f4ab7c6dc6bf7a84ef62a923efd82`; pull request: #639.

Verified residual classification tranche (2026-08-18): PR #639 accepted exact head `67b8db18013a82338001782fc604270ad25c312b` against unchanged base `651e607c0f63f79532c9f06ee74b705622ee7819` and merged as `83c3177ed112cc93bedae2d2d4018554c4c40a83`. The merge parents are exactly that base and accepted head, and the accepted-head and merge trees are byte-identical at `07440291f6b46011b587dad7346d02bc0c99710b`. Exact-head evidence comprised 10 successful checks, one successful Vercel status, two intended conditional skips, no unresolved check, no review and no review thread. The governing exact-head runs passed: CodeQL `32085727999`, Production Runtime Promotion Contract `32085729919`, Release Integrity `32085729930`, Repository Quality `32085729869` and Supply Chain Security `32085729914`.

All eight exact-source merge workflows passed with no failed or pending gate: CodeQL `32085873137`, Beta Security Contract `32085873315`, Beta Pilot Contract `32085873324`, Required Game Market Timezone `32085873325`, Supply Chain Security `32085873327`, Repository Quality `32085873330`, Production Git Release `32085873306` and downstream Vercel Git Production Verification `32085966812`. The resulting 16 jobs comprised 14 successes and two intended conditional skips: dependency review `95558168805` and event-inapplicable Vercel contract validation `95558448297`. Production Git Release passed tokenless-contract validation, exact staging and production capture, bounded live-parity enforcement with `status:PASS` and zero unapproved differences in artifact `9306694683`, and fast-forward-only publication recorded by artifact `9306699990`; `release/production` resolves exactly to the merge. Edge-attestation publication steps were intentionally skipped because no Edge source changed. Vercel verification artifact `9306709933` reports canonical production health `{ok:true,status:"ready"}`, project `cgiukdjwicykrmtkhudh`, exact `sourceCommit` equal to the merge, and both `web-session-api` and `player-web-session-api` healthy at HTTP 200. Branch Hygiene run `32085874369` passed and the owner branch is absent locally and remotely. No unresolved blocker remains. `ARCH-100E` is `VERIFIED_COMPLETE`; `ARCH-100` remains `IN_PROGRESS`, `ARCH-101` remains blocked, and the next exact item is `ARCH-100F` on `refactor/multi-game-bootstrap-context-hydration-v1`, which must be created only after this completion record merges and from that exact current `main`.

Started multi-game bootstrap hydration (2026-08-18): dependency-serialized `ARCH-100F` is owned solely by `refactor/multi-game-bootstrap-context-hydration-v1`, created from exact verified main/release SHA `59a82ef8580d7d571727e722424bc84cf064e8aa` and tree `7ccf90a65bc0e1717b96f66a7ebca929513e96bf` only after the `ARCH-100E` verification ledger merged and all of its exact-merge gates passed. The refreshed collision audit covers open PRs #619, #620, #624 and #626: none owns the bounded bootstrap/context source; #619 root dependency manifests, #620 workflow control-plane files, and #624/#626 Player browser/realtime/authority-manifest files remain excluded. Stale exact-path donors `wip/codex-production-slices-2026-08-04`, `automation/admin-v2-ux-root-apply-20260814`, and `feat/story-narrative-convergence-v1` must not be merged or cherry-picked. `backend/package.json` may change only to register bounded tests. No later residual owner may start before this owner is merged and verified.

Mandatory pre-code `ARCH-100F` root/edge ledger: `admin-api/index.ts::Deno.serve` calls `common.resolveContext` for bearer authentication, Staff ID and all-status owner-filtered ID-only game discovery, then `guardAdminRequest` exactly once; only post-guard does one server request ID feed distinct per-game Admin contexts and Auth-owned all-or-nothing profile/game hydration, with each row retained beside its exact context. The hydrated set serves global bootstrap/games/switch through `handleGlobalRoute`/`selectGame`/`gameDto`, base `/games/:id` and `/games/:id/dashboard` through `ensureOwnedGame`/`gameRoutes.handleGameRead`/`gameDto`, and existing full-row Admin consumers including archive confirmation. `staff-api/index.ts::Deno.serve` and `classroom-api/index.ts::Deno.serve` both call `staffBootstrapHttpHandler.handleStaffBootstrapRequest`; `web-session-api/index.ts::Deno.serve` reaches the same handler through successful login, status and MFA flows via `loadStaffBootstrap` and its trusted-IP internal dependency wrapper. The shared handler preserves method/environment checks and exactly one `resolveStaffSessionForRequest` security/rate boundary, then performs active-only ID discovery, one request ID, distinct neutral Staff contexts, and Auth-owned hydration. Discovery selects only owner-filtered IDs in existing descending order; hydration rechecks owner and Staff active status, validates exact cardinality/membership/shape, restores discovery order and fails all-or-nothing. Zero games performs no game hydration query. Staff/Classroom join-code and settings routes remain exact Game Sessions regression edges through `handleResetGameJoinCodeRequest`/`handleGameSettingsRequest`; the Game Sessions Staff contract/factory becomes only a neutral type alias/re-export/delegate. Admin all-status versus Staff active-only behavior, selection fallback, join-code mapping, routes, envelopes, browser privacy, guards, schemas, RPCs, economic/idempotency authority, UI and deployment remain unchanged. Every listed root/edge, the focused neutral/Auth/repository/composition seams, Game Sessions, Admin API, auth/Web Session, typecheck/smoke/full-root suites, architecture/safety gates and exact-head/exact-merge Edge/release/Vercel/health evidence are mandatory before `VERIFIED_COMPLETE`.

Planning reconciliation start snapshot after Business architecture drift
(2026-08-25): fetched
`origin/main` is `dcb68958102f4ecbf07fe9e52d6eede4d5e692ff`; the pushed
`ARCH-100F` checkpoint is `9646509c12ac747693fdaefb6aa28908ae872321`,
had no pull request and was one commit ahead and 18 commits behind that main.
The checkpoint contains the bounded implementation described above, so the
earlier “pre-code” label records its original gate rather than current status.
It remained `IN_PROGRESS`: reconciliation had to regenerate the one conflicting
architecture-inventory file, close Staff negative-boundary, Admin guard-denial,
and route-level parity/privacy proof gaps, and rerun all local and exact-source
acceptance. Prior branch-local passing results do not transfer across the
current-main reconciliation.

Reconciled implementation candidate (2026-08-25): planning reconciliation
commit `001e9b35c3dda8197d5bd497b95d0126bbd60bca` was followed by the required
normal merge of unchanged `origin/main` as merge commit
`20e5b649bd9472f49333bc21118de6b60b8d9eeb`; the sole conflict was the
generated architecture inventory and it was regenerated with
`node scripts/architecture/build-architecture-inventory.mjs`. Bounded
implementation commit `88b3e96e4570b027597afa24b91c6de3cdb0c0e4` and tree
`6ba09a1d240e6b7bfafe2945475221c789fdbf55` close all three reviewed
evidence gaps. Staff bootstrap now has a private default-preserving
environment-reader seam plus table-driven environment, resolver, Auth, claims,
rate-limit and exception denial evidence proving zero repository, discovery,
request-ID, application-context and hydration work. Admin bootstrap now uses
one real guard-and-hydrate composition helper; guard denial precedes request-ID
and context creation; the three bootstrap/global routes are isolated in a
side-effect-free router after the unchanged provisioning/account probes; and
the dashboard has test-only final loader seams with unchanged production
defaults. Executable response-parity tests cover zero/one/multi-game selection,
multi-game and empty bootstrap, all-status games ordering and join-code
mapping, owned/non-owned switch, base game, selected-game dashboard scoping,
exact envelopes, `no-store` behavior and persistence/security-field privacy.
Draft PR #668 owns this exact candidate.

Local reconciled evidence is green except for the mandatory backend smoke:
Staff bootstrap 36/36; Game Sessions 58/58; Admin API 184/184; Admin local
mutations 80/80; game lifecycle 16/16; `typecheck:all`; frozen Deno checks for
bootstrap, Staff, Staff MFA, Player, Player Web Session, Web Session and
password-reset roots; Admin local UI/architecture 17/17; Admin game-session
controls and lifecycle; Admin v2 84/84; auth boundaries 16/16 plus 8/8; Web
Session release 39/39 plus 6/6; and complete root `npm test`. Architecture,
Admin-contract, high-priority, legacy-runtime, migration, secret, touched
TypeScript format and diff gates pass. The regenerated inventory contains 1,060
source files and 25 Edge entrypoints; measured debt is flat or lower at 99
persistence candidates, 168 cross-domain deep imports, 209 compatibility-marker
files, 100 oversized source files and 5 oversized handlers, with every
zero-tolerance category still zero. The PR diff changes no migration, RPC,
workflow, root manifest, UI, deployment, Business source, economic write or
idempotency contract.

Unresolved acceptance blocker (2026-08-25): `npm --prefix backend run smoke`
reaches Player Progression and then reports 23 passes and 5 failures in
`progressionIntegrationEventService.test.ts`. That file and its service are
byte-identical to fetched `origin/main`; the static 2026-07-21 fixture has aged
past the production 30-day event window on the 2026-08-25 clock. The cumulative
Business owner already edits that exact test to inject a fixed `now`, so
copying or cherry-picking the donor fix into F would violate the collision and
Business-source exclusions. `ARCH-100F` therefore remains `IN_PROGRESS` in
draft PR #668 with no accepted head, merge, deployment or runtime credit. The
next exact action is for the owning current-main/Business work to land or
otherwise resolve the deterministic fixture, then merge any advanced main
normally, regenerate the inventory, rerun every gate at the exact PR head, and
proceed to merge/runtime/verification-ledger evidence only when all gates are
green. `ARCH-100G0` and every later owner remain blocked.

Business V2 is simultaneously active and unfinished. PR #648 plus stacked draft
PRs #654–#667 are unmerged and undeployed; the current cumulative tip
`1403e7e789a41156d82a629de6846861efa610b3` contains formation,
Stockroom/procurement, workforce/payroll, equipment/manufacturing and Store
seller/listing/withdrawal work. #666 head
`38d040748a62c5aa21a7111eeab80cd7e74b9263` also adds an unmerged,
service-only immutable/non-reserving offer quote RPC, repository/contracts and
three forward migrations, but no Player route/UI composition, money movement,
Inventory transfer, receipt or capability credit. #667 adds only the Phase
10A.3 scope document and temporary source-snapshot workflow; atomic
buyer/seller/Inventory settlement, automatic sales, completed Player/Admin
workspaces and IPO/Market integration remain absent. Branch-local certification
never satisfies this roadmap. The stack also has
non-linear ancestry at #661 and #664, unresolved failing/sparse check evidence,
and open #626/#642 browser/Player-authority collisions. #642 directly overlaps
the Business stack's cross-cutting authority contract and commerce browser
acceptance script.

`ARCH-100F` may finish first because its sole exact-path overlap with current
main and the cumulative Business stack is the generated inventory. Immediately
after F, new documentation gate `ARCH-100G0` must audit the exact merged Business
source and regenerate the root-to-handler classification. It remains blocked
until every owning Business PR is merged in dependency order or explicitly
closed/superseded, #626 and #642 have explicit dispositions, and the ancestry defects
are repaired. No replacement branch is created while it is blocked, and all
later `ARCH-100G1+` work is blocked behind it. The revised serialized ownership
is recorded in `docs/architecture/econovaria-context-propagation-owner-map-v1.md`:
Store is split into canonical catalog (`I1`) and later Business seller commerce
(`I2A` for listing/withdrawal and future conditional `I2B` for quote/settlement);
Banking/loans (`L1`) is separated from Business core (`L2`), procurement
(`L3`), workforce/payroll (`L4`) and equipment/manufacturing (`L5`). Actor
requests must forward the exact reviewed Player context without re-resolving
scope. Admin Business list/review/compliance/cycle-settlement requests likewise
require exact Admin context; only inner payroll, manufacturing, withdrawal and
other leased scheduler processors are system runtimes and never receive
fabricated actor contexts.

Reconciled conditional `ARCH-100` owner ledger:

| Item | Status | Exact dependency/ownership boundary | Required acceptance |
|---|---|---|---|
| `ARCH-100G0 — Business V2 context/collision reclassification` | `BLOCKED` | `ARCH-100F` verified; #648/#654–#666 merged in order or explicitly closed/superseded; scope-only #667 frozen, closed, superseded, or included if runtime is added; #626/#642 resolved; #661/#664 ancestry repaired | Audit exact merged source, regenerate inventory, classify every live/uncomposed/system edge, and resize or remove every conditional row below. Absent future functionality is not an `ARCH-100` completion dependency. |
| `ARCH-100G3 — Player session/capability/auth-workflow context` | `PLANNED` | `ARCH-100G2`, `ARCH-100G0`; owns the generic reviewed-dispatch callback contract, both Player roots and capability/rate mappings; explicitly excludes `_shared/playerBusinessDispatch.ts` | Exact generic context/reference forwarding, limiter identity/order, bootstrap/login/logout/session privacy and replay evidence. |
| `ARCH-100I1 — canonical catalog Store context` | `PLANNED` | `ARCH-100H`, `ARCH-100G0`; existing Admin/shared and seeded/catalog Player Store only | Admin/Player composition, Inventory/Economy authority characterization, public-key privacy and replay/two-game evidence. |
| `ARCH-100L1 — Banking and loans context` | `PLANNED` | `ARCH-100K2`, `ARCH-100G0`; Banking/loan compatibility surfaces only | Exact actor context, handler characterization, ledger atomicity, replay/conflict and runtime evidence. |
| `ARCH-100L2 — Business core/formation/read context` | `BLOCKED` | Conditional on `ARCH-100G0` finding merged Business source; then `ARCH-100L1`, `ARCH-100C`, `ARCH-100K2`; owns `_shared/playerBusinessDispatch.ts` onward plus Player handler/repository and Admin Business list/review/compliance branches | No second scope resolution; exact Player/Admin context identity; public-key privacy, retired-route and every-root composition evidence. |
| `ARCH-100L3 — Business procurement context` | `BLOCKED` | Conditional merged source; then `ARCH-100I1`, `ARCH-100L2`, `ARCH-100C`, `ARCH-100K2` | Canonical price/currency/Inventory basis, atomic ledger/custody, rollback, replay and two-game evidence. |
| `ARCH-100L4 — Business workforce/payroll context` | `BLOCKED` | Conditional merged source; then `ARCH-100L3`, `ARCH-100K2`; owns Player workforce commands and actor-triggered Admin `POST /businesses/:biz/settle`; only the inner leased processor is `SYSTEM_RUNTIME` | Admin auth/AAL/permission/rate/idempotency and exact context; Player context; zero-production, partial/unpaid recovery, no-double-debit, lease/replay and two-game evidence. |
| `ARCH-100L5 — Business manufacturing context` | `BLOCKED` | Conditional merged source; then `ARCH-100L4`, `ARCH-100C`, `ARCH-100K2`; owns live Player job list/start/cancel and system completion/recovery. Equipment repositories remain uncomposed until a root is proven | Characterize and preserve the existing canonical recipe reference without starting Phase-2 `ARCH-203`; prove output, material/labor/equipment reservation, timing/lease/replay/recovery; no equipment capability credit without production composition evidence. |
| `ARCH-100I2A — Business seller listing/withdrawal context` | `BLOCKED` | Conditional merged source; then `ARCH-100I1`, `ARCH-100L5`, `ARCH-100C`, `ARCH-100K2` | Exact actor versus worker classification; seller-offer/listing custody, cooling/reservation/return, replay/race and two-game evidence. |
| `ARCH-100I2B — offer-aware quote/settlement context` | `BLOCKED` | Instantiated only by a merged production actor composition/cutover; #666's service-only unmerged quote earns no context/capability credit; then `ARCH-100I2A`, `ARCH-100L5`, `ARCH-100C`, `ARCH-100K2` | Merge-blocking exact-context, immutable quote/receipt, offer-first locking, and characterization of the existing atomic RPC/transaction with debit/credit/custody/revenue/COGS race/replay/rollback evidence; this context owner does not start Phase-3 `ARCH-300`. If production composition is absent, `ARCH-100G0` removes this row from current closure and the future feature must satisfy it before merge. |

`ARCH-100G0` is a resizing gate, not a promise that every draft feature will
land. If Business work is closed or superseded without a live edge, the gate
records that absence and removes the corresponding conditional owner. If a
future quote/settlement feature appears after context closure, its own PR must
reopen and satisfy `I2B` as a merge-blocking architecture gate.

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
Depends on: `ARCH-200`, `ARCH-205`, `ARCH-300` for settlement

A successful purchase must have one authoritative orchestration path for:

- validate purchasability/game state;
- debit through economy/ledger;
- update/reserve stock;
- grant through Inventory;
- write purchase/audit records;
- return a stable API contract.

No dual writes and no partially successful purchase state.

The unfinished Business V2 program changes the shape of this item, but none of
its unmerged work is complete:

- `ARCH-202A — canonical seeded/catalog Store`: `PLANNED`; preserve the existing
  public catalog, canonical quote/purchase authority, Inventory grant, Economy
  debit and stable API contract independently of seller commerce.
- `ARCH-202B — seller offers, listing custody and withdrawal`: `BLOCKED` by
  `ARCH-202A`, `ARCH-207A`, `ARCH-207D`, `ARCH-200` and `ARCH-205`. Draft
  stacked branches are unaccepted evidence only. Inventory remains custody
  authority and Store owns seller-offer/listing lifecycle. Acceptance requires
  separate actor-triggered and leased-system composition; immediate purchase
  disable; a server-derived minimum five-minute cooling period;
  reservation-safe deferral; exact-once unsold-stock return; replay, recovery,
  purchase/withdrawal race-order and two-game evidence.
- `ARCH-202C — offer-aware quote and atomic settlement`: `BLOCKED` by
  `ARCH-202B`, `ARCH-207A`, `ARCH-207D`, `ARCH-205` and `ARCH-300`.
  Phase 10A.2 now has branch-local service-only quote implementation evidence,
  but it is unmerged, undeployed and uncomposed and therefore unaccepted;
  Phase 10A.3 transaction/receipt runtime remains absent. A quote must
  be immutable and bind exact offer, offer version, seller, custody account,
  quantity, price, currency and expiry; the receipt is likewise immutable.
  Acceptance also requires expiry/version replay conflicts, offer-first locking,
  both purchase/withdrawal race orders, one transaction for buyer debit, seller
  credit, Inventory transfer, listing/purchase state, revenue and COGS, plus
  exact-once replay/conflict/rollback evidence.
- `ARCH-202D — automatic demand/sales`: `PLANNED`; it may start only after
  `ARCH-202C` is merged and verified and must reuse the same settlement authority
  rather than introduce a worker-only economic write path.

Every Business/Store migration must replay twice from a clean database and pass
lint/advisor review. Every new `public` table/function must have explicit Data
API exposure, RLS/forced-RLS, `PUBLIC`/`anon`/`authenticated` revocation and
intended server-role grant decisions. Every `SECURITY DEFINER` function requires
fixed `search_path`, scoped authorization and cross-game/replay tests. Migration
presence or service-only repository code does not prove live composition.

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
Depends on: `ARCH-200`, `ARCH-205`, `ARCH-300`, `ARCH-202A`

Define a canonical business ownership/asset boundary and ensure business-banking, marketplace, investments and Admin surfaces consume it rather than reproducing ownership checks.

The authority program is split so unfinished Business code cannot silently
redefine Banking, Inventory, Store or Market ownership:

- `ARCH-207A — Business boundary, formation and reads`: `BLOCKED` by
  `ARCH-200`, `ARCH-205`, `ARCH-300`, `ARCH-202A` and the exact
  Business-stack merge/disposition gate;
  draft PR #648 is unaccepted evidence only. Business owns formation,
  governance, overview and recipe-access
  policy; Economy owns money, Inventory owns assets/custody, and the canonical
  physical-economy recipe remains the source of truth.
- `ARCH-207B — Stockroom and procurement`: `BLOCKED` by `ARCH-207A`,
  `ARCH-202A`, `ARCH-200`, `ARCH-205` and `ARCH-300`; draft #654–#656 are
  unaccepted evidence only. Transit/warehouse state must preserve Economy price/currency authority,
  Inventory basis/custody, atomic rollback and retirement of the abstract-input
  mutation rather than dual-writing it.
- `ARCH-207C — workforce and payroll`: `BLOCKED` by `ARCH-207B`, `ARCH-205`
  and `ARCH-300`; draft #657–#659 are unaccepted evidence only.
  Player hire/utilization commands require the exact Player context. Admin
  `POST /businesses/:biz/settle` is an actor-triggered
  `GAME_CONTEXT_REQUIRED` boundary and must preserve exact Admin context through
  auth/AAL/permission/rate/idempotency review; only its inner leased payroll
  processor is `SYSTEM_RUNTIME`. Both paths use Economy ledger authority and
  require zero-production, partial/unpaid recovery, no-double-debit and two-game
  evidence.
- `ARCH-207D — equipment and timed manufacturing`: `BLOCKED` by `ARCH-207C`,
  `ARCH-200`, `ARCH-203`, `ARCH-205` and `ARCH-300`; draft #660–#661 are
  unaccepted evidence only. Inventory owns equipment/material/WIP/output custody;
  Business owns job rules. Job list/start/cancel are actor commands;
  claim/complete/fail/recovery are leased system operations with canonical
  recipe, reservation, timing, replay and crash-recovery evidence. Equipment
  read/install adapters are service-only on the audited branch and receive no
  live capability credit until a production composition root and its exact
  actor/system boundary are proven.
- `ARCH-207E — Player/Admin Business workspace convergence`: `PLANNED`; depends
  on `ARCH-207A`–`D` and `ARCH-202C`. The declared phases 12 and 13 are not
  implemented and must expose only merged, authoritative capabilities.
- `ARCH-207F — IPO/Market integration`: `PLANNED`; depends on `ARCH-206`,
  `ARCH-207A`–`D` and accepted operating/financial inputs from `ARCH-202C` (and
  `ARCH-202D` if automatic sales are part of valuation). Phase 14 remains
  outside the current Business runtime. Stocks/Market retains instrument,
  exchange and trading authority until a separately accepted integration exists.

Before any subitem can be credited, its owning stack must be linear, merged into
`main`, pass the relevant database/Edge/browser/runtime gates, and provide
deployed evidence where required. The live legacy
`submit_business_product_v1` route/capability must also be reconciled with the
Business plan’s stated retirement of free-form product creation; leaving both
contracts active is an acceptance blocker, not compatibility completion.

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
| 8 | Canonical seeded/catalog Store + Crafting convergence | `ARCH-202A`, `ARCH-203` |
| 9 | Business formation/read + Stockroom/procurement | `ARCH-207A`, `ARCH-207B` |
| 10 | Business workforce/payroll + equipment/manufacturing | `ARCH-207C`, `ARCH-207D` |
| 11 | Seller commerce quote/settlement + automatic sales | `ARCH-202B`–`ARCH-202D` |
| 12 | Marketplace convergence | `ARCH-204` |
| 13 | Stocks authority; later Business workspace/IPO convergence | `ARCH-206`, `ARCH-207E`, `ARCH-207F` |
| 14 | Contracts/Progression rewards + Story/World scope | `ARCH-208`, `ARCH-209` |
| 15 | Commands/state machines/permissions/errors | `ARCH-301`–`ARCH-304` |
| 16 | Contract and repository/public-boundary completion | `ARCH-400`–`ARCH-402` |
| 17 | Player data plane | `ARCH-501`, part of `ARCH-502` |
| 18 | Admin data plane | `ARCH-500`, remainder of `ARCH-502` |
| 19 | Scheduler/simulation orchestration | `ARCH-600`, `ARCH-601` |
| 20 | Internal domain events where justified | `ARCH-602` |
| 21 | Legacy/compatibility retirement | `ARCH-700`, `ARCH-701` |
| 22 | Topology normalization | `ARCH-702` |
| 23 | Observability/failure isolation | `ARCH-800`–`ARCH-802` |
| 24 | UI/CSS architecture cleanup | `ARCH-900`, `ARCH-901` |
| 25 | Final re-audit and ratchet closure | `ARCH-1000`–`ARCH-1002` |

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
