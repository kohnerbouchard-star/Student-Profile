# Econovaria Context Propagation Owner Map v1

**Roadmap item:** `ARCH-100E`  
**ARCH-100E audited main:** `651e607c0f63f79532c9f06ee74b705622ee7819`
**ARCH-100E audited tree:** `f784e1d585db8b2e4337f50558b23442bbee8e56`
**Last reconciled main:** `80f5eb8e24a364bc878de11acfdf196add878f10`
**Active unmerged ARCH-100F reconciliation:** `49f520eac74fedb63a43e15f112faa1655aa4211`; tree `c812eb63d79ac3869d2e82c06f1c8b50bb4f1f42`
**Status:** classification and dependency ledger; no residual path is implemented by this document

This map is the reviewed closure ledger for `ARCH-100`. It classifies the live
request boundaries found by the `ARCH-100E` source audit after `ARCH-100A`
through `ARCH-100D`, assigns each known remaining game-scoped seam to one
collision-bounded owner, and records the boundaries where a game context cannot
truthfully exist. `ARCH-100X` must generate and reconcile a deterministic
root-to-handler inventory before the parent can close; this document does not
claim a reproducible zero-unassigned inventory yet. The classification does not
authorize a route, schema, RPC, response, gameplay, economic, idempotency, or UI
change.

## Canonical authorities and invariants

The implementation must consolidate the existing authorities rather than create
a parallel context:

- `backend/src/shared/requestApplicationContext.ts` is the common immutable
  game-scoped contract.
- `backend/src/domains/players/api/playerRequestScope.ts` creates the canonical
  Player context after a live Player session, player, and game are derived
  server-side.
- `backend/supabase/functions/admin-api/adminRequestApplicationContext.ts`
  creates the Admin context after the Admin permission/AAL/rate guard and owned
  game check.
- `backend/src/shared/staffRequestApplicationContext.ts` is the canonical Staff
  context type, and `backend/src/shared/staffRequestApplicationContextFactory.ts`
  constructs it only after reviewed Staff/rate/owned-game authority. The Game
  Sessions Staff contract is a type re-export and its factory delegates to this
  neutral authority.
- Inventory and Game Sessions type-only context ports are verified examples.
  Later domains may expose equivalent minimal type-only views, but may not create
  a second request identity or authentication authority.

Every implementation owner must preserve these rules:

1. Browser UUIDs are never ownership authority. Game-scoped identifiers are
   match-or-reject inputs; an explicitly characterized global preference may
   select or fall back only within the server-derived owned-game set.
2. Authentication, claims/permission policy, and server-derived actor/game scope
   precede context creation. Universal guards may rate-limit before context;
   scope-dependent Player, Admin Messaging/Progression, or other domain limiters
   receive the exact context after creation. No domain use case or business
   persistence executes until every applicable limiter approves.
3. The same frozen context object reaches every existing/applicable handler,
   application use case or service, and domain repository port. Only a narrow
   infrastructure adapter may project `gameSessionId` or actor IDs into
   queries/RPCs.
4. Admin and Player authentication stay distinct. Shared Staff/Classroom handlers
   retain their reviewed Staff policy and an empty frozen permission set until a
   granular Staff grant model is separately authorized.
5. A game-scoped route, body, query, header, or command identifier that conflicts
   with canonical scope is rejected or ignored according to its characterized
   compatibility contract; it never reaches a wrong-game domain adapter,
   business query, or mutation/RPC call. Authentication,
   Staff/session lookup, owner-ID discovery, permission, and rate-limit
   persistence may necessarily establish the boundary first. An invalid global
   Admin `x-econovaria-game-id` remains the characterized owned-game preference
   fallback; it is not game ownership authority.
6. `context.requestId` is correlation identity. Mutation identities, audit IDs,
   idempotency keys, token hashes, replay fingerprints, and deterministic reward
   identities remain separate.
7. The context object, its correlation request ID, and new server-only ownership
   fields are never serialized into browser DTOs or arbitrary log payloads.
   Existing UUID-shaped or scope-bearing identifiers across Admin, Staff, and
   Player browser surfaces—including game/Staff/Auth/session fields, route/query
   IDs, and realtime channel scope—are compatibility candidates, not ownership
   authority, and are neither expanded nor falsely claimed removed by this
   propagation tranche. `ARCH-100X` must add an exact response/route exposure
   appendix to its generated artifact and classify each as an approved public
   contract identifier or a blocking internal-identifier remediation owner.
   Approved structured correlation logging may use
   `requestId` under the observability policy without returning it to browsers.
8. Context contracts and mutation-identity ports are infrastructure-neutral and
   domain-owned/type-only. Domain contracts/application code may not import Edge
   roots, Supabase implementations, or platform mutation-identity types.
9. Shared Staff domains receive type-only views of one canonical frozen Staff
   context. The `ARCH-100F` candidate has moved/generalized construction into a
   neutral shared contract and factory; this remains unverified until its merge
   and evidence gates complete. The Game Sessions contract/factory is only a
   type re-export/delegate to neutral, and neutral code never imports Game
   Sessions. Per-domain context factories and generic
   Admin/Staff/Player unions are forbidden. Each incoming request/process has
   one correlation request ID and at most one context per owned game; an explicit
   Admin-to-Classroom HTTP hop creates a separate downstream process-local Staff
   context after reauthorization.

## Classification vocabulary

| Class | Meaning | Closure treatment |
|---|---|---|
| `VERIFIED_CONTEXT` | Exact context propagation is merged and verified. | Retain regression coverage; no new owner. |
| `GAME_CONTEXT_REQUIRED` | A live authenticated operation has a server-derived game/actor and still decomposes or re-resolves it above the persistence adapter. | Must merge through the assigned `ARCH-100*` owner. |
| `DERIVE_THEN_CONTEXT` | The endpoint legitimately starts without a Player/Staff game context, derives authority inside its existing guard, then performs scoped work. | Guard stays context-free; create and propagate the canonical context immediately after derivation. |
| `MULTI_GAME_DISCOVERY` | A bootstrap request discovers zero or more games owned by one authenticated Staff actor. No single game describes the request. | Owner-filtered summary lookup may establish scope; scoped hydration must use one reviewed context per owned game. Never fabricate an `all` game ID. |
| `AUTH_WORKFLOW_SCOPE` | A pre-session authentication flow has verified and server-bound a game, player, and credential but cannot yet possess an active-session Player context. | Use one immutable Players-owned workflow scope for credential upgrade/session creation; it is not a `PlayerRequestApplicationContext` and does not become browser authority. |
| `GLOBAL_STAFF_OPERATION` | Staff profile, session, help, or other actor-global behavior does not read or mutate game-owned data. | Characterize and keep outside `GameContext`. |
| `PRE_GAME_WORKFLOW` | Licensing/provisioning creates a game, so no owned game exists at entry. | Treat existing `LicensingActivationRouteContext` as command/audit metadata, not canonical context; do not fabricate game scope. Post-create game work must re-enter a reviewed game boundary. |
| `PRE_AUTH_BOUNDARY` | Login or another guard executes before authenticated actor scope exists. | Remains context-free until successful derivation; unsupported/malformed requests remain scope-free. |
| `UNREACHABLE_COMPATIBILITY` | A route/parser/handler has no live composition root. | Prove it remains unreachable and assign retirement to `ARCH-700`; do not revive it for propagation. |
| `SYSTEM_RUNTIME` | A scheduler/worker is authenticated as system runtime rather than Admin/Staff/Player. | Owned by `ARCH-600`/`ARCH-601`, not by actor `GameContext`; its game scoping must still be explicit. |

An exempt boundary is not permission to run an unscoped query. It is an audited
statement about where context cannot yet exist or is not semantically applicable.

## Boundary creation order

### Admin

`resolveContext` may authenticate the bearer, resolve the Staff record, and load
only owner-filtered game IDs needed by the security guard. Names, status, join
codes, and every browser DTO field hydrate only after `guardAdminRequest`. After
the guard, single-game routes call `ensureOwnedGame` and create one Admin context. Multi-game
bootstrap hydration reuses the one reviewed actor/permission/AAL/rate result and
creates one context for each discovered owned game only after that row proves
ownership. Every per-game context is distinct but shares one server-generated
request correlation ID for the bootstrap request. It may not invent stronger
permissions or repeat the universal guard. The hydrated set serves global
bootstrap/games/switch plus base `/games/:id` and `/games/:id/dashboard` game DTO
consumers while preserving zero-game behavior, current ordering, Admin all-status
versus Staff active-only filtering, and all-or-nothing failure behavior.

### shared Staff/Classroom handlers

Method and environment checks, `resolveStaffSessionForRequest`, Staff status and
role validation, metadata/AAL policy, the universal rate limit, and
`readOwnedGameSession` precede context creation. Endpoint-specific guards also
precede it; notably Attendance scan creates context only after the scanner rate
limit. Both `staff-api` and `classroom-api` roots must retain identical
composition evidence.

`admin-api/common.ts::proxyClassroom` is an explicit process boundary: JavaScript
object identity cannot and must not cross the HTTP request. The Admin context is
preserved to the outbound adapter, which rejects a path/body/header game mismatch
before fetch and serializes neither the context object, its application-context
`requestId`, nor its Staff actor UUID. Existing reviewed transport
`X-Request-Id`/`Idempotency-Key` forwarding and mutation identity semantics remain
separate and unchanged. The receiving Classroom function repeats authentication,
ownership, and applicable guards, then creates a new Staff context whose exact
identity is preserved only inside that downstream process. Players access-reset
and Contract progress/review/reward proxy paths require this two-sided evidence.

### Player

`dispatchRateLimitedReviewedPlayerRequest` already creates one frozen Player
context after session/game/player derivation and passes it to the rate limiter.
Every reviewed live callback must forward that exact object. Direct-handler or
bespoke flows with an existing authenticated derivation boundary may create a
fallback only after the same server authorization; other callers require context.
Unsupported methods remain scope-free. Attendance clock-in, Dashboard POST, and
Crafting POST are `DERIVE_THEN_CONTEXT` flows and must keep their existing bespoke
guard/rate order. Login remains `PRE_AUTH_BOUNDARY` through throttling and
credential comparison; once a game/player/credential binding is verified, its
legacy credential upgrade and session creation use an `AUTH_WORKFLOW_SCOPE`, not
an active-session Player context.

## Residual inventory

### Admin and shared Staff/Classroom

| Family | Reviewed live seams | Class | Owner |
|---|---|---|---|
| Multi-game bootstrap | `admin-api/common.ts` (`resolveContext`, `gameDto`, `selectGame`, `ensureOwnedGame`), `admin-api/index.ts` global bootstrap/games/switch routes, `auth/api/staffBootstrapHttpHandler.ts`, Staff/Classroom/Web Session callers | `MULTI_GAME_DISCOVERY` | `ARCH-100F` |
| Players | Admin `localGameMutations.ts`, `compatibilityOperations.ts`, `playerOperations.ts`, `attendancePlayerOperations.ts`, `gameRoutes.ts`, player read models and archive application; shared roster/create and access-code reset handlers/applications | `GAME_CONTEXT_REQUIRED` | `ARCH-100G1`/`ARCH-100G2` |
| Attendance | Admin `attendanceOperations.ts`, `idempotentLedgerOperations.ts`, read models/proxy paths; shared daily/scan handlers and `recordAttendanceForAuthorizedStaff.ts` | `GAME_CONTEXT_REQUIRED` | `ARCH-100H` |
| Store | Admin local/compat/read routes; shared Store catalog handler, route/service, mutation application, and Supabase adapter | `GAME_CONTEXT_REQUIRED` | `ARCH-100I1`; merged Business listing/withdrawal is conditional `ARCH-100I2A`, and future quote/settlement is conditional `ARCH-100I2B` |
| Contracts | Admin local/compat/read/review/reward routes; shared Contract handler, mutation/reward services, contracts, and repository | `GAME_CONTEXT_REQUIRED` | `ARCH-100J1`–`ARCH-100J3` |
| Economy and personal banking | Admin banking/ledger operations and player-economic read fragments; shared balance seed, ledger history, adjustment handler/service | `GAME_CONTEXT_REQUIRED` | `ARCH-100K1`/`ARCH-100K2` |
| Business and loans | `admin-api/businessBankingOperations.ts` currently mixes Banking/loan operations with Business review, compliance and cycle-settlement branches | `GAME_CONTEXT_REQUIRED` | `ARCH-100L1` for Banking/loans; exact merged Business branches are reclassified into `ARCH-100L2`–`ARCH-100L5` by `ARCH-100G0` |
| Stocks/market reads | `admin-api/marketAssetOperations.ts`, market read/chart fragments | `GAME_CONTEXT_REQUIRED` | `ARCH-100M1` |
| Marketplace | `admin-api/marketplaceOperations.ts`; GET snapshot is write-capable because it can expire listings | `GAME_CONTEXT_REQUIRED` | `ARCH-100N` |
| World/Countries | `admin-api/worldRuntimeOperations.ts` and campaign/effect/arrival/travel/residency seams | `GAME_CONTEXT_REQUIRED` | `ARCH-100O` |
| Messaging | Admin messaging core/participant operations and Staff messaging rate limiter | `GAME_CONTEXT_REQUIRED` | `ARCH-100P` |
| Progression | Admin progression operations and domain limiter | `GAME_CONTEXT_REQUIRED` | `ARCH-100Q` |
| Story initialization | shared demo Storyline initialization handler/contracts/repository | `GAME_CONTEXT_REQUIRED` | `ARCH-100S` |
| Crafting | `admin-api/craftingOperations.ts` | `GAME_CONTEXT_REQUIRED` | `ARCH-100T` |
| Game lifecycle | Admin game lifecycle operations and the game-archive branch of account operations | `GAME_CONTEXT_REQUIRED` | `ARCH-100U` |
| Audit/log reads | Admin logs, related-audit lookup, log read models, and remaining game-router audit branches | `GAME_CONTEXT_REQUIRED` | `ARCH-100W` |
| Inventory/redemption | Admin and Player Inventory seams | `VERIFIED_CONTEXT` | `ARCH-100B`/`ARCH-100C` |
| Game settings/join code | Admin and shared Staff/Classroom Game Sessions seams | `VERIFIED_CONTEXT` | `ARCH-100D` |
| Admin actor-global routes | account/profile/help/sign-out, `/notifications`, `/account/security`, and `/account/sessions` branches that do not touch game-owned data | `GLOBAL_STAFF_OPERATION` | closure characterization in `ARCH-100X` |
| Staff auth lifecycle | `staffLoginHttpHandler.ts` and Staff signup/resend/cancel handlers across Bootstrap/Classroom/Web Session roots | `PRE_AUTH_BOUNDARY` until authenticated Staff scope exists | closure characterization in `ARCH-100X` |
| Web Session lifecycle | cookie/session/logout adapters with no game-owned work | `GLOBAL_STAFF_OPERATION` | closure characterization in `ARCH-100X` |
| Root prerequisites | health, OPTIONS, publishable-key, method, and environment guards | `PRE_AUTH_BOUNDARY` | closure characterization in `ARCH-100X` |
| Licensing/game creation | licensing activation route/application/repository before the game exists; `LicensingActivationRouteContext` is unfrozen command/audit metadata whose request ID may originate from a header/idempotency key | `PRE_GAME_WORKFLOW` | pre-game leg characterized in `ARCH-100X`; post-create onboarding/read leg in `ARCH-100U` |

The `ARCH-100W` related-audit owner must fix or fail closed the current lookup
shape where an audit event is scoped by game but its related record can be loaded
by target ID alone. Context propagation may not preserve that cross-game gap.

### Player

| Family | Reviewed live seams | Class | Owner |
|---|---|---|---|
| Session/capability | capability manifest, session bootstrap/logout handlers, both Player roots | `GAME_CONTEXT_REQUIRED` | `ARCH-100G3` |
| Attendance clock-in | bespoke Attendance handler/RPC boundary | `DERIVE_THEN_CONTEXT` | `ARCH-100H` |
| Store | public seeded/catalog Store handler/repository plus, only after merge, seller-offer/listing/withdrawal/quote/settlement seams | `GAME_CONTEXT_REQUIRED` for actor routes; processors are `SYSTEM_RUNTIME` | `ARCH-100I1`/conditional `ARCH-100I2A`/conditional `ARCH-100I2B` |
| Contracts | public list/accept/submit handlers and Player repositories | `GAME_CONTEXT_REQUIRED` | `ARCH-100J1`–`ARCH-100J3` |
| Banking | public banking handler/repository | `GAME_CONTEXT_REQUIRED` | `ARCH-100K1`/`ARCH-100K2` |
| Business and Business Banking | retained Business Banking compatibility handler/repository plus the unmerged Business V2 dispatcher, handler, formation/read, Stockroom/procurement, workforce/payroll, equipment/manufacturing and future sales seams | `GAME_CONTEXT_REQUIRED` for Player commands and Admin list/review/compliance/cycle-settlement requests; only inner payroll/manufacturing processors are `SYSTEM_RUNTIME` | `ARCH-100L1`–`ARCH-100L5`, conditional on `ARCH-100G0` exact-merged-source classification |
| Stocks/market reads | asset/detail/watchlist handlers, services, and repositories | `GAME_CONTEXT_REQUIRED` | `ARCH-100M1` |
| Stock portfolio/trading | portfolio/read/trading handlers and repositories | `GAME_CONTEXT_REQUIRED` | `ARCH-100M2` |
| Marketplace | handler and Supabase repository | `GAME_CONTEXT_REQUIRED` | `ARCH-100N` |
| World/Countries | World runtime adapter/handler/service/repository and Countries read handler/service/repository | `GAME_CONTEXT_REQUIRED` | `ARCH-100O` |
| Messaging | `classroom-api/messagingDispatch.ts`, lifecycle/messaging handlers and RPC adapters | `GAME_CONTEXT_REQUIRED` | `ARCH-100P` |
| Progression | handler and RPC adapters | `GAME_CONTEXT_REQUIRED` | `ARCH-100Q` |
| Notifications/Story delivery | notification and story-delivery handlers/services/repositories | `GAME_CONTEXT_REQUIRED` | `ARCH-100R` |
| Crafting GET | Inventory bridge must forward its exact outer Player context through the Crafting handler/repository | `GAME_CONTEXT_REQUIRED` | `ARCH-100T` |
| Crafting POST | inner Crafting dispatcher derives scope today; create/pass context there without changing outer/inner rate counts | `DERIVE_THEN_CONTEXT` | `ARCH-100T` |
| Game Dashboard GET | handler/repository and both Player roots | `GAME_CONTEXT_REQUIRED` | `ARCH-100V` |
| Game Dashboard POST | live cutscene-delivery mutation in the same handler; the outer reviewed map has no POST operation | `DERIVE_THEN_CONTEXT` | `ARCH-100V` |
| Inventory/redemption | both Player roots, handlers, services, repositories | `VERIFIED_CONTEXT` | `ARCH-100A`/`ARCH-100C` |
| Login discovery/verification | pre-auth dispatcher, throttle, game/player/credential lookup and comparison | `PRE_AUTH_BOUNDARY` | `ARCH-100G3` characterization |
| Login credential upgrade/session creation | post-verification scoped RPC work | `AUTH_WORKFLOW_SCOPE` | `ARCH-100G3` |
| Retired/uncomposed handlers | always-null legacy Contract route plus unreferenced ledger/Store handler candidates | `UNREACHABLE_COMPATIBILITY` | prove unreachable in `ARCH-100X`; retire only in `ARCH-700` |

### Non-actor runtime boundaries

`backend/supabase/functions/stock-market-player-read/index.ts` is not a Player
request root. It requires publishable identity plus signed internal-runner
authorization, claims a nonce, and then supplies service-role access to a scoped
handler. It is `SYSTEM_RUNTIME`, remains outside `PlayerRequestApplicationContext`,
and is owned by `ARCH-600`/`ARCH-601`. `ARCH-100X` must characterize its explicit
game/player-session binding and require signature, nonce, replay, secret, and
wrong-game denial evidence; no Player context may be fabricated for it. The
stock orchestrator/runner/archiver, licensing workers, and data purger are the
same actor-classification family, with their detailed scope retained by the
scheduler/runtime roadmap owners.

### Business V2 planning reconciliation — 2026-08-25

This map was re-audited against current `origin/main`
`80f5eb8e24a364bc878de11acfdf196add878f10`, the normally reconciled local
`ARCH-100F` merge `49f520eac74fedb63a43e15f112faa1655aa4211` pending publication to draft PR #668, and the active Business
V2 stack. The Business work is not in `main`: PR #648 and stacked PRs
#654–#667 are all draft, unmerged and undeployed. Their branch-local
certification records are useful evidence only and satisfy no dependency in
this map. The current cumulative tip is #667 head
`2a163a0d036973fa1b3f5b237a516fb10b2add4c` and includes the non-mutating Phase
10A.1 settlement contract/simulations and #666's unmerged service-only immutable,
non-reserving quote RPC/repository/contracts. That quote has no Player route or
UI composition and moves no money or Inventory. #667 adds only the Phase 10A.3
scope document and a temporary source-snapshot workflow; atomic
buyer/seller/Inventory settlement, automatic sales convergence, Player/Admin
workspace convergence and IPO/Market integration remain unfinished.

The active Business stack introduces a real `domains/business` boundary, a
mixed `business-banking` compatibility facade, canonical Inventory-backed
Stockroom/WIP/Finished Goods/Store-listing custody, Store seller offers and
withdrawals, workforce/payroll, equipment and timed-manufacturing seams, 55
forward Business/Store migrations, and new composition through
`_shared/playerBusinessDispatch.ts`, both Player roots and the Classroom root.
Its reviewed Player dispatcher currently discards the exact context returned by
`dispatchRateLimitedReviewedPlayerRequest`, resolves Player scope a second time,
and projects `{ gameId, playerUuid }`; this is required context work, not an
accepted exception. Actor-triggered Business commands require the exact Player
context. Payroll/manufacturing/withdrawal workers are `SYSTEM_RUNTIME` and may
never receive a fabricated Player context. The Admin Business cycle-settlement
request is a separate `GAME_CONTEXT_REQUIRED` actor edge; only its inner leased
payroll execution is system runtime. Service-only or uncomposed
repositories remain explicitly non-live until a merged composition root proves
otherwise.

`ARCH-100F` remains path-independent from the Business runtime: its bounded diff
overlaps current main and every Business landing head only at the generated
architecture inventory. Its initial current-main reconciliation regenerated the
one inventory conflict. After #642 merged, dedicated ledger reconciliation
`43ce10be4b829ca0797eb319a53e370e1670f6cc` allowed exact current main to merge
normally and conflict-free as `49f520eac74fedb63a43e15f112faa1655aa4211`;
the generator was run again and the inventory remained deterministic. Every
future inventory collision is resolved only by running the current generator on
the reconciled tree; counts or sorted entries must never be hand-selected.
`ARCH-100F` may finish first without importing any Business source or donor
commit.

After `ARCH-100F`, `ARCH-100G0` is a mandatory coordination gate. It cannot be
completed from donor branches: every Business PR that owns the Player/Classroom,
Business, Store or generated-inventory surface must first merge in dependency
order or be explicitly closed/superseded by its owner. PR #626 is
closed/superseded and PR #642 merged into current main, satisfying their
disposition condition. The active Business stack must now reconcile or
de-duplicate the main-owned
`backend/src/domains/progression/services/progressionIntegrationEventService.test.ts`,
`docs/operations/contracts/player-cross-cutting-verification-authority-v1.json`,
`scripts/business-banking-player-business-browser-acceptance.mjs` and
`scripts/business-banking-player-commerce-browser-acceptance.mjs` without
Business implementation credit. The current stack also requires ancestry
repair at #661 and #664 before it is a linear merge authority. Until those
conditions hold, `ARCH-100G0` and every later context owner are blocked; no
replacement branch is created and no unmerged Business work is treated as
architecture completion. Once unblocked, G0 must resize or remove conditional
Business/Store context owners from the queue based on exact merged live source.
Absent quote/settlement or other future functionality does not block current
`ARCH-100` closure, but any later feature that introduces it must satisfy its
named context gate before merge.

Current `main` also adds the Campaign orchestrator and Story-character reply
worker. They are `SYSTEM_RUNTIME`: closure must inventory their signed/leased,
game-scoped invocation and must not manufacture Staff or Player contexts. Their
new Store-scarcity, Market, World and Messaging effect edges remain owned by the
later scheduler/domain-authority phases rather than by an actor-request context.

## Dependency-ordered owner sequence

Only one residual `ARCH-100*` implementation owner may be active at a time. This
is stricter than the functional dependency graph because `admin-api/index.ts`,
the two Player roots, shared handler/application seams, package test registration,
and the architecture inventory are merge hot spots. A later owner starts from the
exact verified merge of its predecessor; unmerged work never satisfies a
dependency. `ARCH-100G0` must resize or remove the conditional `L2`–`L5` and
`I2*` rows when their Business surfaces are absent from exact merged main;
`ARCH-100` closes against live merged edges, not hypothetical future features.
Any later feature that introduces a removed edge must satisfy its named context
gate before that feature may merge.

| Order | Item and sole branch | Bounded ownership | Functional dependencies and focused acceptance |
|---:|---|---|---|
| 1 | `ARCH-100F — Multi-game bootstrap context hydration`; `refactor/multi-game-bootstrap-context-hydration-v1` | Neutral canonical Staff context authority; ID-only pre-guard discovery; post-guard per-game DTO/join-code hydration for Admin plus Staff/Classroom/Web Session roots | Implementation, proof gaps and local current-main reconciliation are complete through merge `49f520eac74fedb63a43e15f112faa1655aa4211`; publish and run currently satisfiable exact-head checks, hold merge until `BETA-LIVE-MIGRATION-PARITY-001` lands, reconcile that advanced main and rerun every gate, then merge normally, collect exact-merge Edge/release/Vercel/health/hygiene evidence and merge the separate verification ledger |
| 2 | `ARCH-100G0 — Business V2 context/collision reclassification`; branch intentionally uncreated while blocked | Documentation-only exact-merged-source audit of Business, Store, Business Banking, both Player roots, Classroom composition, actor/system boundaries and the downstream owner split | `ARCH-100F` verified plus #648/#654–#666 merged in dependency order or explicitly closed/superseded; scope-only #667 explicitly frozen, closed, superseded, or included if runtime is added; resolved #626/#642 paths reconciled from current main; stack ancestry repaired; fresh inventory and zero unassigned new live edges; donor-branch certification is insufficient |
| 3 | `ARCH-100G1 — Staff Players roster/create/archive context`; `refactor/staff-players-context-propagation-v1` | Shared roster/create plus Admin create/archive/read branches; Player-history audit is excluded for `ARCH-100W` | `ARCH-100G0`; Admin local/API, every Staff/Classroom root, credential/currency/privacy/two-game tests |
| 4 | `ARCH-100G2 — Staff Player credential-reset context`; `refactor/player-credential-context-propagation-v1` | Sensitive access-code reset and Admin-to-Classroom proxy boundary | `ARCH-100G1`; credential/session revocation, no proxy serialization, cross-game and both-process auth tests |
| 5 | `ARCH-100G3 — Player session/capability/auth-workflow context`; `refactor/player-session-context-propagation-v1` | Both Player roots, capability/bootstrap/logout, generic reviewed-dispatch callback contract, pre-auth login characterization and post-verification auth workflow scope; `_shared/playerBusinessDispatch.ts` is excluded for `L2` | `ARCH-100G2`; exact generic callback context/reference and limiter context, bootstrap-currency registration, logout/token/login/session privacy and replay/conflict tests |
| 6 | `ARCH-100H — Attendance context propagation`; `refactor/attendance-context-propagation-v1` | Admin/shared Staff daily/scan/correction and Player clock-in derive-then-context | `ARCH-100G3`; Admin local/API, every live root, Attendance guards, economic ledger invariants, replay/two-game tests |
| 7 | `ARCH-100I1 — Canonical catalog Store context`; `refactor/store-catalog-context-propagation-v1` | Existing Admin/shared Store plus seeded/catalog Player read, quote and purchase only; Business seller commerce and Marketplace are excluded | `ARCH-100H`, `ARCH-100G0`; Admin local/API, Player Store, Inventory/Economy authority, public-key privacy and replay tests |
| 8 | `ARCH-100J1 — Contract read context`; `refactor/contracts-read-context-propagation-v1` | Admin/shared Staff list/progress and Player list reads | `ARCH-100I1`; Contract read DTO/privacy/two-game and every-root composition tests |
| 9 | `ARCH-100J2 — Contract create/publish context`; `refactor/contracts-mutation-context-propagation-v1` | Admin/shared Staff create/edit/publish/archive/duplicate and Player accept/submit where the shared seam applies | `ARCH-100J1`; Admin local/API and Player lifecycle/replay/targeting tests |
| 10 | `ARCH-100J3 — Contract review/reward context`; `refactor/contracts-review-reward-context-propagation-v1` | Review, atomic reward issuance, audit reads and two-process proxy boundary | `ARCH-100J2`; deterministic reward identity, no dual-write, no proxy serialization, replay/conflict/two-game tests |
| 11 | `ARCH-100K1 — Economy read context`; `refactor/economy-read-context-propagation-v1` | Admin/shared Staff ledger history plus Player personal-banking reads | `ARCH-100J3`; public banking, ledger privacy/currency/two-game tests |
| 12 | `ARCH-100K2 — Economy mutation context`; `refactor/economy-mutation-context-propagation-v1` | Balance seed, Staff adjustment, transfers and Attendance-linked economic mutations; the one canonical money-context boundary for later Business/Store consumers | `ARCH-100K1`, `ARCH-100H`; economic invariants, Admin economic-write, idempotency/replay/conflict tests |
| 13 | `ARCH-100L1 — Banking and loans context`; `refactor/banking-loans-context-propagation-v1` | Admin banking/loan branches plus Player loans, savings and transfers; extracted Business formation/operations are excluded | `ARCH-100K2`; handler characterization, ledger atomicity, replay/conflict and Banking runtime evidence |
| 14 | `ARCH-100L2 — Business core/formation/read context`; conditional `refactor/business-core-context-propagation-v1` | Exact-merged `_shared/playerBusinessDispatch.ts` onward, Business handler/repository, overview, formation, ownership/governance, recipe-access and Stockroom reads plus Admin Business list/product-review/compliance branches and bounded legacy forwarding | `ARCH-100L1`, `ARCH-100C`, `ARCH-100K2`, `ARCH-100G0`; exact Player/Admin context/reference identity, no second scope resolution, retired-route, public-key privacy and every-root gates |
| 15 | `ARCH-100L3 — Business procurement context`; conditional `refactor/business-procurement-context-propagation-v1` | Business Store procurement, transit/warehouse Stockroom and retired abstract-input route | `ARCH-100I1`, `ARCH-100L2`, `ARCH-100C`, `ARCH-100K2`; canonical price/currency/Inventory basis, ledger atomicity, replay/rollback/two-game tests |
| 16 | `ARCH-100L4 — Business workforce/payroll context`; conditional `refactor/business-workforce-context-propagation-v1` | Player candidate/read/hire/utilization commands plus actor-triggered Admin `POST /businesses/:biz/settle`; only the inner leased payroll processor is `SYSTEM_RUNTIME` | `ARCH-100L3`, `ARCH-100K2`; Admin auth/AAL/permission/rate/idempotency, exact Player/Admin context, zero-production/partial/unpaid recovery, no wage double debit, worker lease/replay and two-game tests |
| 17 | `ARCH-100L5 — Business manufacturing context`; conditional `refactor/business-manufacturing-context-propagation-v1` | Live Player job list/start/cancel commands; claim/complete/fail/recovery processors are `SYSTEM_RUNTIME`; equipment read/install adapters remain service-only until a production root is proven | `ARCH-100L4`, `ARCH-100C`, `ARCH-100K2`; characterize and preserve the existing canonical recipe reference without attempting Phase-2 `ARCH-203`, then prove output, material/labor/equipment reservations, timing, lease, replay/recovery and two-game behavior; no equipment capability credit while uncomposed |
| 18 | `ARCH-100I2A — Business seller listing/withdrawal context`; conditional `refactor/store-seller-listing-context-propagation-v1` | Exact-merged seller offers, listing custody and actor-triggered withdrawal; inner leased processing is `SYSTEM_RUNTIME`; quote/settlement and Marketplace excluded | `ARCH-100I1`, `ARCH-100L5`, `ARCH-100C`, `ARCH-100K2`; exact actor/worker boundary, immediate purchase disable, server-derived five-minute cooling, reservation-safe deferral, exact-once stock return, race/replay/two-game tests |
| 19 | `ARCH-100I2B — Offer-aware quote/settlement context`; conditional `refactor/store-offer-settlement-context-propagation-v1` | Instantiated only by a merged production actor composition/cutover; #666's unmerged service-only quote repository/RPC earns no context or capability credit; exact Player cutover, immutable quote/receipt and atomic settlement; Marketplace excluded | `ARCH-100I2A`, `ARCH-100L5`, `ARCH-100C`, `ARCH-100K2`; characterize and preserve an existing atomic RPC/transaction boundary without starting Phase-3 `ARCH-300`, then prove exact offer/version/seller/custody/quantity/price/currency/expiry binding, offer-first locking, expiry/version conflicts, both races and buyer debit/seller credit/custody/revenue/COGS exact-once; absent production composition removes this row from current closure but any future feature must pass it before merge |
| 20 | `ARCH-100M1 — Stocks and market read context`; `refactor/stocks-market-read-context-propagation-v1` | Admin market reads and Player asset/detail/watchlist only; Business IPO/fundamentals and direct market-impact audit are excluded | every instantiated `ARCH-100I2*`, `ARCH-100L5`; Player market assets, Admin market, effective-time/watchlist/two-game tests |
| 21 | `ARCH-100M2 — Stock portfolio/trading context`; `refactor/stock-trading-context-propagation-v1` | Player portfolio/read/trading economic paths; internal-runner root explicitly excluded as `SYSTEM_RUNTIME` | `ARCH-100M1`, `ARCH-100K2`; stock trading/calendar, ledger atomicity, order replay/conflict and wrong-game tests |
| 22 | `ARCH-100N — Marketplace context propagation`; `refactor/marketplace-context-propagation-v1` | Admin moderation/snapshot and Player secondary-resale lifecycle; never Store seller-offer/custody authority | `ARCH-100M2`, every instantiated `ARCH-100I2*`, `ARCH-100C`, `ARCH-100K2`; Marketplace/Store non-duplication, lifecycle/abuse, Inventory reservation, ledger/replay tests |
| 23 | `ARCH-100O — World and Countries context propagation`; `refactor/world-context-propagation-v1` | Admin and Player World/Countries/arrival/travel/residency; future Business demand integration remains separately unimplemented | `ARCH-100N`; Player World and World runtime, travel idempotency and two-game tests |
| 24 | `ARCH-100P — Messaging context propagation`; `refactor/messaging-context-propagation-v1` | Admin moderation/scope-dependent limiter and Player thread/message lifecycle | `ARCH-100O`; exact-context limiter, Player Messaging/security, Admin moderation, policy and replay tests |
| 25 | `ARCH-100Q — Progression context propagation`; `refactor/progression-context-propagation-v1` | Admin review/correction/limiter and Player read/unlock/claim | `ARCH-100P`, `ARCH-100K2`; exact-context limiter, Player/Admin Progression, reward/idempotency and simulation gates |
| 26 | `ARCH-100R — Notification delivery context propagation`; `refactor/notification-context-propagation-v1` | Player Notifications and Story delivery | `ARCH-100Q`; Player Notifications, privacy/state-transition/two-game tests |
| 27 | `ARCH-100S — Storyline initialization context propagation`; `refactor/storyline-context-propagation-v1` | Shared Staff demo Storyline initialization | `ARCH-100R`; focused handler/repository plus every-root composition tests |
| 28 | `ARCH-100T — Crafting context propagation`; `refactor/crafting-context-propagation-v1` | Admin/Player Crafting actor context only; Business recipe access/manufacturing remains `ARCH-100L2`/`L5` | `ARCH-100S`, `ARCH-100L5`, `ARCH-100C`, `ARCH-100K2`; canonical recipe/BOM/output and Business-access regressions, exact outer/inner rate counts, Inventory/ledger replay tests |
| 29 | `ARCH-100U — Game lifecycle and post-create context`; `refactor/game-lifecycle-context-propagation-v1` | Admin lifecycle/archive plus only the post-activation `completeOnboarding`/`readGame` leg of provisioning | `ARCH-100T`, `ARCH-100F`; context created after activation/owner proof, correlation ID distinct from provisioning idempotency, lifecycle/replay/operational-state tests |
| 30 | `ARCH-100V — Game Dashboard context propagation`; `refactor/game-dashboard-context-propagation-v1` | Player GET read plus live POST cutscene mutation; replace direct Story infrastructure reach with a Dashboard-owned neutral port/adapter | `ARCH-100U`, `ARCH-100R`, `ARCH-100S`; register handler test, every-root GET/POST, no-call-before-auth/mismatch, state/replay/privacy tests |
| 31 | `ARCH-100W — Audit/log and Admin router closure`; `refactor/admin-audit-context-propagation-v1` | Audit/log domain, Business activity/economic evidence, `loadPlayerHistoryAudit`, direct market-impact/settings audit branches and remaining Admin router scalar seams | `ARCH-100V`; Admin API/logs/browser contract, cross-game related-record denial and exact branch ownership |
| 32 | `ARCH-100X — Context propagation residual closure`; `refactor/context-propagation-closure-v1` | Generated exact-main root-to-handler/classification artifact covering every merged Business/Store edge, compatibility forwarding, system processor and uncomposed seam | `ARCH-100W`, every instantiated `L*` and `I*` owner; zero unassigned live edges/unresolved required entries, no fabricated actor for workers, every focused suite plus full smoke/typecheck/root and architecture/safety gates |

### Active `ARCH-100F` root and edge ledger

`ARCH-100F` is owned solely by
`refactor/multi-game-bootstrap-context-hydration-v1`, created from exact verified
main/release SHA `59a82ef8580d7d571727e722424bc84cf064e8aa` and tree
`7ccf90a65bc0e1717b96f66a7ebca929513e96bf` after the `ARCH-100E` verification
ledger merged. Planning reconciliation commit
`001e9b35c3dda8197d5bd497b95d0126bbd60bca` records the refreshed ownership
audit. The branch merged fetched, unchanged `origin/main`
`dcb68958102f4ecbf07fe9e52d6eede4d5e692ff` normally as
`20e5b649bd9472f49333bc21118de6b60b8d9eeb`; its sole conflict was the
generated inventory, which was regenerated rather than selected or hand
edited. Bounded implementation commit
`88b3e96e4570b027597afa24b91c6de3cdb0c0e4` is published in draft PR #668
with tree `6ba09a1d240e6b7bfafe2945475221c789fdbf55`. The PR remote head is still
`e64f4f1407709806d62c619547c2af3ec2c100db` while the following reconciliation remains local. After PR #642 merged,
blocker-ledger reconciliation `43ce10be4b829ca0797eb319a53e370e1670f6cc`
pre-applied the shared roadmap additions and current main
`80f5eb8e24a364bc878de11acfdf196add878f10` merged normally and
conflict-free as `49f520eac74fedb63a43e15f112faa1655aa4211`, tree
`c812eb63d79ac3869d2e82c06f1c8b50bb4f1f42`. The inventory was regenerated
and remained unchanged. The 2026-08-25 collision audit covers #619, #620,
#624, closed #626, merged #642, Business integration PR #648 and stacked Business PRs
#654–#667. No active owner touches the bounded `ARCH-100F` runtime, tests,
package registration or roadmap source. Its sole exact-path overlap with current
main and every cumulative Business landing head is the generated architecture
inventory; that conflict must be regenerated from the reconciled tree. #619
owns root dependency manifests, #620 workflow control-plane files, #624 owns
Player browser/realtime scope, merged #642 makes its harness and authority
evidence main-owned, and the Business stack owns its
Business/Store/Player/Classroom runtime. This owner may register tests in
`backend/package.json`, but it may not edit root dependency manifests,
workflows, browser/UI, authority-manifest or Business-owned files. Exact-path stale donors
`wip/codex-production-slices-2026-08-04`,
`automation/admin-v2-ux-root-apply-20260814`, and
`feat/story-narrative-convergence-v1` overlap bounded paths or package
registration and remain prohibited from merge or cherry-pick.

The reconciled candidate implements the reviewed neutral Staff context,
Auth-owned game discovery/profile/hydration, Staff/Classroom/Web Session
bootstrap composition, Game Sessions delegation and Admin multi-game
hydration. It also closes all three skeptical-review gaps: table-driven Staff
pre-bootstrap denials prove zero repository/discovery/request-ID/context/
hydration work; a real Admin unrelated-grant denial proves exactly one
Staff/grant evaluation and zero request-ID/profile/game/context/route work; and
executable route tests preserve exact zero/multi-game bootstrap, games, switch,
base-game and selected-game dashboard envelopes, ordering, `no-store` behavior
and privacy. Staff 36/36, Game Sessions 58/58, Admin API 184/184, Admin local
80/80, lifecycle 16/16, full backend smoke, `typecheck:all`, seven frozen
Edge-root checks, full root `npm test`, Admin/auth/Web Session suites and every
architecture/safety gate pass. The regenerated inventory records 1,060 source files and 25 Edge
entrypoints with all debt limits flat or lower and every zero-tolerance
category at zero.

`ARCH-100F` nevertheless remains `IN_PROGRESS`. Draft PR #668 has no accepted
head, merge, runtime or completion credit. PR #642's exact-head checks and three
consecutive connected Player runs passed, but exact-merge Production Git Release
run `32815368607` failed closed on external staging/production migration-ledger
and structural drift; publication was skipped and `release/production` remains
`59a82ef8580d7d571727e722424bc84cf064e8aa`. That drift is outside #642's
five-file diff and is not waived. No active owner currently owns its
reconciliation, so it requires a separate explicitly authorized owner rather
than an F runtime/schema workaround. F may publish and run all currently
satisfiable exact-head checks, but it must not merge until that parity
correction merges into `main`. F must then merge advanced main normally,
regenerate the inventory, rerun every exact-head check and review thread, merge
normally, prove exact-merge Edge, release, live, Vercel, health and
branch-hygiene evidence, and merge a separate verification ledger before any
later context owner starts.

The implemented candidate preserves these exact reviewed roots and
direct/internal composition edges:

1. `backend/supabase/functions/admin-api/index.ts::Deno.serve` calls
   `common.resolveContext`, which authenticates the bearer and discovers only
   the Staff ID plus owner-filtered game IDs in descending `created_at` order,
   with no status filter and no Staff/browser or game DTO fields. It then calls
   `adminSecurityGuard.guardAdminRequest` exactly once. Only after that guard,
   one server request ID is created and one distinct canonical Admin context is
   created per discovered game ID. An Auth-owned read application and Supabase
   adapter recheck owner membership and hydrate the full Staff profile plus all
   game rows all-or-nothing; every hydrated row remains paired with the exact
   context that authorized it, and selected-game dispatch reuses that object
   rather than creating a second context.
2. That hydrated Admin set flows through `handleGlobalRoute` to
   `selectGame`/`gameDto` for `GET /session/bootstrap`, `GET /games`, and
   `POST /games/:id/switch`; and through `ensureOwnedGame` to
   `gameRoutes.handleGameRead`/`gameDto` for `GET /games/:id` and
   `GET /games/:id/dashboard`. Existing downstream consumers that require the
   persistence-shaped row, including game archive name/status confirmation,
   receive the same all-status hydrated set. Zero owned games creates no game
   context and performs no game-row hydration query.
3. `backend/supabase/functions/staff-api/index.ts::Deno.serve` preserves its
   publishable-key, environment, method, and route checks before calling
   `auth/api/staffBootstrapHttpHandler.handleStaffBootstrapRequest` for
   `/staff/bootstrap`.
4. `backend/supabase/functions/classroom-api/index.ts::Deno.serve` calls the
   same handler for `/staff/bootstrap` without adding or weakening a root guard.
5. `backend/supabase/functions/web-session-api/index.ts::Deno.serve` reaches
   `loadStaffBootstrap` from successful `handleLogin`, `handleStatus`, and
   `handleMfa` verification. `loadStaffBootstrap` makes the existing in-process
   `/staff/bootstrap` request to the same handler, whose dependency wrapper
   continues to replace the internal caller IP with its trusted synthetic IP.
6. For roots 3–5, the shared handler performs method/environment validation and
   calls `resolveStaffSessionForRequest` exactly once, preserving bearer auth,
   active Staff status, role/claims, AAL, and universal rate-limit order. It then
   discovers owner-filtered active game IDs only, creates one request ID and one
   distinct neutral Staff context per ID, and calls the same Auth hydration
   application/adapter. The adapter rechecks owner and active status to close
   discovery/hydration races; the application validates exact membership,
   cardinality, ownership and row shape, restores discovery order, and fails the
   whole request on any missing, duplicate, extra, malformed, or failed row.
   Zero games returns the existing empty DTO without a hydration query.
7. The existing Game Sessions consumers remain concrete authority-regression
   edges: Staff and Classroom join-code/settings routes call
   `gameJoinCodeResetHttpHandler.handleResetGameJoinCodeRequest` and
   `gameSettingsHttpHandler.handleGameSettingsRequest`; their domain factory
   becomes only a type alias/re-export/delegate to the neutral shared Staff
   contract/factory. Neutral shared code never imports Game Sessions, while the
   existing one-game auth/ownership/context/repository behavior remains exact.

All edges preserve current Admin all-status versus Staff active-only filtering,
descending order, selection fallback, nullable-versus-empty join-code mapping,
routes, methods, response/error envelopes, identifier compatibility, guard and
rate counts, and browser privacy. No context, correlation request ID, new owner
field, aggregate/fabricated game ID, schema, migration, RPC, economic write,
idempotency identity, UI, dependency, workflow, or deployment change is in
scope. Focused neutral-context, Auth application/repository, Admin composition,
Staff/Classroom/Web Session and Game Sessions tests must cover every edge above
before the general per-owner acceptance gate applies.

The sequence is a maximum reviewed scope, not permission to keep an oversized
tranche. An owner must split before implementation if its fresh source audit
shows unrelated behavior or a safely reviewable PR cannot result. Any split is
added to both roadmaps before code and remains serialized in this same order.

## Per-owner acceptance gate

Every implementation owner must record and pass:

- exact verified predecessor merge SHA and refreshed active branch/PR collision
  audit before the owner branch is created;
- characterization of auth, permission/AAL, rate-limit, ownership, response,
  error, audit, and idempotency behavior before movement;
- reference-identity and frozen-context tests through each use-case/repository
  seam, plus proof that only narrow adapters project ownership scalars;
- where an existing authenticated direct boundary legitimately derives scope,
  fallback characterization showing no context exists on method, environment,
  auth, AAL/rate, or ownership failure; callers otherwise require context at
  compile time and no fallback may be introduced;
- route/body/query/header mismatch and two-game isolation tests proving no
  game-domain/business adapter, query, RPC, or mutation runs for the wrong
  game/player while prerequisite security establishment remains explicit;
- composition evidence for every concrete live root named by that owner, not a
  presumed pair of roots; before implementation the owner appends the exact root
  file/entrypoint and every direct/internal composition edge to this map and both
  roadmaps, then tests every listed edge;
- mutation-specific applied/replayed/conflict evidence without substituting
  `context.requestId` for existing operation identity;
- Business/Store actor owners must pass the exact context returned by
  `dispatchRateLimitedReviewedPlayerRequest` through both Player composition
  roots without a second `resolvePlayerRequestScope`; payroll, manufacturing,
  withdrawal and other scheduled processors instead require explicit signed or
  leased `SYSTEM_RUNTIME` scope, with no fabricated Player actor;
- Business/Store economic owners must prove canonical price/currency and actual
  Inventory basis, no material/labor/equipment double use, zero-production
  payroll without a second wage debit, exact-once worker recovery, offer-first
  purchase/withdrawal serialization in both race orders, atomic buyer debit,
  seller credit, custody transfer and revenue/COGS evidence, and no Store,
  Marketplace, Inventory or Economy dual authority;
- every new public Supabase table/function must have explicit intended Data API
  exposure, RLS/forced-RLS and grants/revokes evidence; service-only Business
  and worker functions must be unreachable to `anon`/`authenticated`, granted
  only to the intended server role, replayed from zero twice and covered by
  database lint/advisors;
- no inward dependency from a domain contract/application module to an Edge
  root, Supabase implementation, or platform mutation type;
- unchanged routes, methods, schemas, response/error DTOs, existing identifier
  compatibility, no new context/ownership-field exposure, Admin v606/Player
  Terminal behavior, and economic authority for valid/compatible requests; an
  owner-required cross-scope denial uses the existing error envelope and is
  recorded as an explicit fail-closed security behavior change;
- the focused suites in the sequence table, `backend` `typecheck:all` and smoke,
  root auth/architecture/high-priority/legacy/secret/diff gates, deterministic
  inventory, and full `npm test` when runtime code changes;
- exact-head PR success, merge into `main`, accepted-head/merge tree parity,
  every required exact-merge workflow, applicable Edge/release/Vercel/health
  evidence, and branch hygiene before `VERIFIED_COMPLETE`.

Tests currently present but not package-registered must be registered by their
owner: Game Dashboard handler (`ARCH-100V`), Crafting rate-limit dispatch
(`ARCH-100T`), and Progression idempotency header (`ARCH-100Q`). Attendance and
Banking/loans and each exact-merged Business owner require new handler-level
characterization suites. The Player
session owner must also register `playerSessionBootstrapCurrencyHttpHandler.test.ts`.
Registration may touch `backend/package.json`; it must be serialized and must not alter root
dependencies owned by PR #619.

## Collision ledger

Reviewed PR and branch collisions at audit time:

- #619 owns root dependency manifests; no context tranche may absorb dependency
  changes.
- #620 owns workflow definitions. It is an acceptance-control-plane collision;
  context tranches do not edit workflows and must reconcile/rerun if it merges.
- #624 retains Player browser/realtime scope. #626 is closed/superseded and
  #642 is merged, so its Player authority and Business-commerce harness paths
  are now main-owned. Backend owners exclude the UI, browser, workflow and
  authority-manifest files. `ARCH-100G0` must verify that the Business stack
  reconciled or de-duplicated those current-main paths before any
  `ARCH-100G1+` owner starts; `ARCH-100L1`–`L5` then re-audit the resulting
  exact merged Player/Business authority surface.
- #648 and stacked #654–#667 own the unfinished Business V2, Store seller,
  Business Player-dispatch, Classroom-composition, migration, browser and
  generated-inventory surfaces. They are draft/unmerged dependencies, not
  donor authority; only `ARCH-100F` may proceed before their disposition, and
  it excludes all of those owned files except regenerating its own inventory
  after current-main reconciliation.

Never merge or cherry-pick these stale donor hazards:

- `wip/codex-production-slices-2026-08-04`;
- `automation/admin-v2-ux-root-apply-20260814`;
- `agent/market-minute-replay-v1`;
- the two PR501 banking release aliases when their read/banking files overlap;
- `feat/story-narrative-convergence-v1`;
- `fix/contract-story-flag-rewards-v1` where Contract rewards overlap.

Exact-path collision checks must be refreshed for every owner. Domain-vertical
ownership means Admin, shared Staff/Classroom, and Player callers for one domain
move together; separate role branches may not edit their shared application or
repository seam in parallel.

Shared Admin routers are branch-owned, not generally shared: `ARCH-100F` owns
base/dashboard `gameDto` hydration; `ARCH-100W` alone owns
`loadPlayerHistoryAudit`, direct market-impact audit, and direct settings-audit
branches. Earlier Players, Market, and Game Sessions owners exclude those audit
functions. Every other owner records the exact `gameRoutes.ts`, `readModels.ts`,
`routeData.ts`, `localGameMutations.ts`, `compatibilityOperations.ts`, or
`common.ts` branches it may edit before implementation, then leaves unrelated
branches byte-unchanged.

## `ARCH-100` closure gate

`ARCH-100X` may close the parent only when merged-main evidence proves all of the
following:

1. A generated artifact records exact audited-main SHA/tree and every live
   composition-root-to-handler edge, with a reproducible command/hash, zero
   unassigned live edges, and zero unresolved `GAME_CONTEXT_REQUIRED` or
   `DERIVE_THEN_CONTEXT` entries.
2. Every live reviewed Player dispatcher callback forwards the exact canonical
   context, except characterized unsupported/malformed operations; every bespoke
   derive-then-context or auth-workflow path satisfies its recorded boundary.
3. No live game-scoped Admin router or shared Staff/Classroom handler decomposes
   context before its domain use case/repository port or re-resolves actor/game
   ownership after a canonical boundary already exists.
4. Remaining ownership scalar reads occur only in security/ownership
   establishment, narrow infrastructure adapters, truthful exempt boundaries,
   or tests.
5. Multi-game discovery uses ID-only owner-filtered discovery and one context per
   game for scoped hydration; no fabricated aggregate game context exists.
6. Every `AUTH_WORKFLOW_SCOPE`, `GLOBAL_STAFF_OPERATION`, `PRE_GAME_WORKFLOW`,
   `PRE_AUTH_BOUNDARY`, `UNREACHABLE_COMPATIBILITY`, and `SYSTEM_RUNTIME` entry
   has executable characterization evidence.
7. No browser contract newly exposes context, correlation identity, or a
   server-only ownership field; existing identifier contracts remain recorded,
   no economic/Inventory/Contract/Marketplace authority dual-write was introduced,
   and existing idempotency/replay behavior remains exact.
8. The generated identifier-exposure appendix covers every Admin, Staff, and
   Player response/route scope field. Each entry is either proved an approved
   public identifier or assigned to a remediation owner that must merge before
   `ARCH-100X`; no unresolved internal ownership UUID exposure remains.
9. The deterministic residual inventory, architecture ratchets, focused suites,
   full repository gates, exact-merge runtime evidence, and both authoritative
   roadmaps agree.

Scalar strings are intentionally not required to disappear from persistence
adapters or ownership guards. Closure is measured by authority and propagation
boundaries, not by a naive lexical zero count. Until `ARCH-100X` is merged and
verified, `ARCH-100` remains `IN_PROGRESS` and `ARCH-101` remains blocked.
