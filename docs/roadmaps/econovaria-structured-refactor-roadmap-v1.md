# Econovaria Structured Refactor Roadmap v1

Status: Normative roadmap
Authority: Current `main` plus live repository and pull-request metadata
Owner: Repository architecture
Created: 2026-07-28
Supersedes: none
Superseded by: none

## Controller instructions for every future refactor chat

Every chat working on the structured refactor must follow this document.

1. Fetch live `main`, active pull requests, checks, and branch metadata before changing files.
2. Trust live repository state over historical statements in this document.
3. Identify the active roadmap phase and work only inside its authorized scope.
4. Do not silently enter the next phase.
5. Do not deploy staging or production unless a separate explicit instruction authorizes it.
6. Do not mutate production data, credentials, Auth settings, or deployment configuration.
7. Preserve feature semantics, authorization, ownership, privacy, idempotency, and economic invariants unless a phase explicitly authorizes a behavioral change.
8. Keep compatibility paths working until their removal gates are proven.
9. Use small, phase-specific branches and pull requests.
10. Update the status ledger with branch, pull request, exact head SHA, validation, blockers, and merge SHA.
11. A phase is not complete until the required changes are merged to `main` and validated from the merged commit.
12. Stop and report blockers rather than widening scope.

## Refactor objective

The refactor will produce a repository where ownership and runtime authority are evident from the directory tree and request flow.

A developer should be able to determine:

- which Admin and Player applications are canonical;
- which browser API boundaries are canonical;
- which code is compatibility-only;
- which code is historical or archived;
- which tests belong to each application or domain;
- which tooling is shared;
- which files may be changed together;
- which validation is required before structural work is merged.

The target is a domain-oriented modular monolith with separate Admin and Player browser-facing BFF boundaries. The project is not adopting a broad microservice architecture.

## Current API truth

The canonical current request paths are:

```text
Admin browser
  -> Admin web-session/BFF
  -> admin-api
  -> Admin operations and domain modules
  -> Postgres / Supabase Auth

Player browser
  -> Player web-session/BFF
  -> player-api
  -> Player domain modules
  -> Postgres
```

Additional narrow boundaries currently include:

- `bootstrap-api` for pre-authenticated Staff signup and initial provisioning;
- `staff-mfa-api` behind the Admin session boundary;
- `password-reset-api` for recovery;
- internal market and release runners.

`classroom-api` is a deployed compatibility surface. It is not a canonical browser-facing API. It remains required because:

- `admin-api` still proxies residual operations to it;
- `player-api` still imports at least one dispatcher from its directory;
- tests and configuration still use Classroom API terminology and configuration in places;
- deployment and documentation references have not yet reached zero.

## Target API architecture

The final public application surface should be limited to:

```text
/api/bootstrap/*
/api/admin-session/*
/api/admin/*
/api/player-session/*
/api/player/*
/api/recovery/*
```

Internal operators and scheduled jobs should use non-browser internal boundaries such as:

```text
/internal/operators/*
/internal/workers/*
```

### Browser boundaries

The Admin and Player browsers must use same-origin session boundaries with:

- encrypted HttpOnly cookies;
- CSRF validation for mutations;
- origin validation;
- method and payload bounds;
- request IDs and idempotency where required;
- server-held credentials;
- sanitized browser responses;
- no raw ownership UUIDs or privileged tokens.

### Application APIs

`admin-api` and `player-api` should own:

- route parsing;
- authentication context;
- authorization and game scope;
- capability checks;
- rate limiting;
- idempotency;
- use-case dispatch;
- HTTP response mapping.

They should not:

- proxy through a compatibility router;
- contain browser DOM logic;
- import implementation code from another API directory;
- hold large domain business rules that belong in domain services;
- expose direct privileged database access to browsers.

### Domain modules

Business behavior belongs in bounded domain modules, including:

- games;
- players and sessions;
- attendance;
- economy and banking;
- business banking;
- Store;
- inventory;
- Contracts;
- financial markets;
- Marketplace;
- Messaging;
- Progression;
- World and travel;
- notifications.

Domain modules must not depend on browser code, cookies, HTTP framework details, or API-directory implementation files.

## Non-negotiable safety constraints

The refactor must preserve:

- Staff and Player authentication semantics;
- server-side Staff `auth.getUser` validation;
- controlled role and permission authorization;
- Player identity derived from the server-side session;
- game ownership and participant scope;
- browser UUID privacy;
- append-only ledger behavior;
- atomic economic mutations;
- idempotency and replay denial;
- rate limits;
- migration immutability;
- current Admin visual design;
- current Player feature semantics;
- production isolation.

## Phase status ledger

Allowed states:

```text
not_started
active
blocked
ready_for_review
merged
superseded
rolled_back
```

| Phase | State | Branch | PR | Exact head | Merge SHA | Validation | Blockers |
|---|---|---|---|---|---|---|---|
| 1 API boundary consolidation | not_started | — | — | — | — | — | Documentation lifecycle clarification should be merged or incorporated first |
| 2 Repository census and ownership ledger | not_started | — | — | — | — | — | Phase 1 active implementation must be bounded |
| 3 Documentation authority normalization | not_started | — | — | — | — | — | — |
| 4 Structural ratchets | not_started | — | — | — | — | — | — |
| 5 Tooling ownership normalization | not_started | — | — | — | — | — | — |
| 6 Canonical frontend declaration | not_started | — | — | — | — | — | — |
| 7 Workspace and package boundaries | not_started | — | — | — | — | — | — |
| 8 Backend dependency refinement | not_started | — | — | — | — | — | — |
| 9 Assets, content, and evidence normalization | not_started | — | — | — | — | — | — |
| 10 Workflow and CI normalization | not_started | — | — | — | — | — | — |
| 11 Compatibility path removal and final acceptance | not_started | — | — | — | — | — | — |

# Phase 1 — API Boundary Consolidation and Classroom API Retirement

## Purpose

Complete the transition from the mixed historical Classroom API model to clear Admin and Player BFF and application API boundaries before moving directories or introducing workspaces.

This is the first executable refactor phase because API ownership determines where files, tests, dispatchers, and tooling ultimately belong.

## End state

The final request paths must be:

```text
Admin browser
  -> Admin session/BFF
  -> Admin application use case
  -> domain service
  -> repository / transactional database operation

Player browser
  -> Player session/BFF
  -> Player application use case
  -> domain service
  -> repository / transactional database operation
```

The following chain must no longer exist:

```text
Admin browser
  -> Admin BFF
  -> admin-api
  -> classroom-api
  -> domain service
```

The following references must eventually reach zero:

```text
classroom-api
classroomApiUrl
CLASSROOM_API_URL
proxyClassroom
imports from classroom-api/*
browser files named as Classroom API fallbacks
unrelated domain tests using classroom-api configuration
```

## Phase 1 scope

Authorized areas include:

- API route and caller inventories;
- API ownership documentation and ledgers;
- `admin-api` compatibility operations;
- `player-api` cross-directory dispatcher imports;
- neutral shared Edge configuration;
- browser API aliases and obsolete filenames;
- route-specific tests;
- Classroom API deployment and retirement checks;
- required CI ratchets.

Not authorized in this phase:

- redesigning Admin or Player UI;
- moving Admin or Player applications into new top-level directories;
- introducing npm workspaces;
- changing product behavior;
- rewriting domain models;
- changing economic formulas;
- deleting applied migrations;
- production deployment.

## Phase 1 preflight

Before active implementation:

1. Merge or incorporate the documentation that classifies `classroom-api` as compatibility-only.
2. Fetch the current Classroom API route inventory from live `main`.
3. Fetch all direct callers and imports.
4. Identify active pull requests touching the same files.
5. Freeze new Classroom API routes and new browser dependencies.
6. Record the exact pre-refactor request and response contracts for every route being moved.
7. Confirm required tests are green before movement begins.

## Workstream 1A — Build the route and dependency ledger

Create a normative ledger, preferably:

```text
docs/architecture/api-route-ownership.md
```

A machine-readable companion may be added:

```text
docs/architecture/api-route-ownership.json
```

Every route must include:

- public path;
- HTTP method;
- current browser caller;
- current BFF;
- current application API;
- current handler;
- current domain owner;
- authentication mechanism;
- authorization and game scope;
- mutation or read classification;
- idempotency requirement;
- rate-limit key;
- current compatibility dependency;
- canonical target;
- migration state;
- removal gate;
- tests proving the contract.

Required states:

```text
canonical
transitional
compatibility
retired
```

The ledger must separately identify:

- HTTP calls to Classroom API;
- source imports from the Classroom API directory;
- tests using Classroom API configuration;
- deployment and release references;
- documentation references;
- historical references that do not block retirement.

### Workstream 1A acceptance

- every Classroom API route is listed;
- every caller is listed;
- every source import is listed;
- every route has a canonical target;
- no route is marked retired without zero-call evidence;
- the ledger is checked by CI for unknown new routes.

## Workstream 1B — Freeze compatibility growth

Add repository-owned ratchets that reject:

- new browser requests to `classroom-api`;
- new product routes in `classroom-api`;
- new `admin-api` calls to `CLASSROOM_API_URL`;
- new imports from `classroom-api/*` outside the compatibility function itself;
- new frontend use of `classroomApiUrl` or `CLASSROOM_API_URL`;
- new domain tests that use Classroom API configuration without an explicit compatibility justification.

Existing violations should be baselined by exact path and count. The baseline must only decrease.

### Workstream 1B acceptance

- ratchets run in Repository Quality or Beta Security Contract;
- current violations are explicit;
- any new violation fails CI;
- no production behavior changes.

## Workstream 1C — Move shared dispatchers to neutral ownership

`player-api` must not import implementation code from the Classroom API directory.

The Messaging dispatcher and any similar shared dispatch code should move to either:

```text
backend/src/domains/messaging/api/
```

or a neutral application-dispatch location such as:

```text
backend/src/application/player/
```

Selection rule:

- domain-specific parsing and dispatch belongs with the domain;
- cross-domain route composition belongs in the Player application layer;
- compatibility translation remains inside Classroom API only until retirement.

Movement must preserve:

- route paths;
- participant and game scope;
- rate limits;
- idempotency;
- privacy filtering;
- response contracts;
- test behavior.

### Workstream 1C acceptance

- `player-api` has zero imports from `classroom-api/*`;
- Messaging lifecycle tests remain green;
- Player Messaging browser evidence remains green;
- Classroom API may call the neutral dispatcher during transition, but the neutral dispatcher must not call back into Classroom API.

## Workstream 1D — Absorb residual Admin routes into `admin-api`

Migrate residual server-side Classroom API operations route by route.

Likely route groups include:

- Contract creation;
- Contract review and reward issuance compatibility;
- Store item mutations;
- settings mutations;
- any remaining generic `proxyClassroom` paths.

For each route:

1. Record the exact current HTTP contract.
2. Identify the domain owner and application use case.
3. Add or confirm focused tests at `admin-api`.
4. Implement the operation directly in `admin-api` through domain services or database transactions.
5. Preserve Staff authentication and controlled authorization.
6. Preserve selected-game ownership validation.
7. Preserve idempotency and atomicity.
8. Preserve sanitized response behavior.
9. Change the server-side caller.
10. Prove zero calls to the old Classroom API route.
11. Remove only that compatibility route.
12. Update the route ledger.

No route group should be migrated as an unreviewed bulk rewrite.

### Contract operations

Contract creation, review, and reward issuance must preserve:

- Staff game ownership;
- Contract lifecycle state;
- immutable review/audit history;
- idempotent reward issuance;
- append-only ledger effects;
- no duplicate rewards;
- current browser response shape.

### Store operations

Store mutations must preserve:

- item identity and game scope;
- inventory and visibility semantics;
- currency and pricing rules;
- audit records;
- request normalization only where current browser compatibility requires it.

### Settings operations

Settings mutations must preserve:

- typed validation;
- difficulty-policy application;
- timezone requirements;
- attendance and market settings semantics;
- existing response contract.

### Workstream 1D acceptance

- `admin-api` has no runtime call to `CLASSROOM_API_URL`;
- `proxyClassroom` is removed;
- every migrated route has focused tests;
- Admin browser tests remain green;
- economic invariant tests remain green;
- no direct browser fallback is introduced.

## Workstream 1E — Remove misleading browser terminology

After the actual runtime dependency is removed, clean browser-facing compatibility names.

Required targets include:

- remove the `classroomApiUrl` runtime property;
- remove `CLASSROOM_API_URL` from frontend constants;
- rename `admin/classroom-write-fallback.js` to a name reflecting its actual function, such as:

```text
admin/admin-request-lifecycle-adapter.js
```

The renamed file may continue to provide:

- Admin request lifecycle events;
- request normalization;
- economic idempotency headers;
- response unwrapping required by the accepted Admin bundle.

It must not be described as a Classroom API fallback.

Use a compatibility script path or HTML update only for the minimum period required to avoid a broken load sequence.

### Workstream 1E acceptance

- browser runtime has no Classroom API alias;
- browser code has no direct Classroom API URL;
- no stale fallback naming remains in canonical files;
- asset and script-reference audits are green;
- Admin visual and interaction behavior is unchanged.

## Workstream 1F — Neutralize Edge test configuration

Domain and Player tests should not depend on Classroom API configuration solely because it historically contained the shared Deno configuration.

Create neutral shared configurations, for example:

```text
backend/supabase/functions/_config/deno.base.json
backend/supabase/functions/_config/deno.player.json
backend/supabase/functions/_config/deno.admin.json
backend/supabase/functions/_config/deno.compatibility.json
```

The exact shape may differ if Supabase tooling requires another layout.

Migration sequence:

1. extract common compiler and import configuration;
2. point Player tests and `player-api` at Player configuration;
3. point Admin tests and `admin-api` at Admin configuration;
4. retain compatibility configuration only for Classroom API tests;
5. add a ratchet that prevents unrelated tests from returning to the compatibility configuration.

### Workstream 1F acceptance

- Player tests run without Classroom API configuration;
- Admin tests run without Classroom API configuration;
- Classroom API configuration is used only by compatibility tests;
- Deno lockfile validation remains frozen and deterministic;
- backend typecheck and smoke remain green.

## Workstream 1G — Retire Classroom API deployment

Classroom API can be removed only after all retirement gates are met.

Required gates:

- zero browser callers;
- zero Admin BFF callers;
- zero Player BFF callers;
- zero `admin-api` HTTP calls;
- zero `player-api` source imports;
- zero Staff API callers;
- zero required compatibility routes;
- zero unrelated test-configuration dependencies;
- zero runtime-config references;
- zero deployment-workflow requirements;
- zero release-manifest requirements;
- route ledger contains no transitional Classroom API route;
- staging acceptance records zero calls;
- cleanup and rollback plan reviewed;
- explicit removal authorization recorded.

Retirement steps:

1. remove the function from deployment configuration;
2. remove release and staging inventory references;
3. delete the compatibility function source;
4. retain a historical tombstone document;
5. run exact-head security and acceptance validation;
6. deploy only under a separate explicit staging authorization;
7. production removal remains a separate release operation.

Historical record location:

```text
docs/archive/retired-runtime/classroom-api.md
```

The tombstone should record:

- why the function existed;
- what replaced it;
- final route removed;
- removal PR and merge SHA;
- staging evidence;
- production release identity when eventually promoted.

## Phase 1 validation matrix

Always required:

- Repository Quality;
- Branch Hygiene;
- Supply Chain Security;
- secret scanning;
- Backend Typecheck;
- backend smoke;
- Beta Security Contract;
- auth-boundary tests;
- Runtime Interaction Wiring;
- migration immutability and replay checks when database files are touched.

Admin route changes additionally require:

- Admin API Check;
- Admin Shell Smoke;
- Admin Browser E2E;
- economic mutation invariants where relevant;
- Contract, Store, settings, attendance, Messaging, Marketplace, Progression, or World tests as affected.

Player dispatcher or API changes additionally require:

- Player Terminal Verify;
- Player browser acceptance;
- Player response privacy;
- Player capability manifest tests;
- affected domain tests;
- multiplayer and load evidence where the route is load-sensitive.

Classroom API retirement additionally requires:

- route retirement ratchet;
- deployment inventory validation;
- release manifest validation;
- isolated-staging connected acceptance;
- proof of zero Classroom API traffic during the acceptance run;
- no production authorization implied.

## Phase 1 branch and PR sequence

Use bounded PRs rather than one large branch.

Recommended sequence:

```text
agent/refactor-api-01-route-ledger-v1
agent/refactor-api-02-growth-ratchets-v1
agent/refactor-api-03-neutral-dispatchers-v1
agent/refactor-api-04-admin-contract-routes-v1
agent/refactor-api-05-admin-store-routes-v1
agent/refactor-api-06-admin-settings-routes-v1
agent/refactor-api-07-browser-terminology-v1
agent/refactor-api-08-neutral-edge-config-v1
agent/refactor-api-09-classroom-retirement-v1
```

Route groups may be split further if a PR exceeds a clear reviewable scope.

Preferred PR bounds:

- one route group or ownership concern;
- fewer than 30 files where practical;
- no unrelated feature work;
- no directory-wide formatting;
- exact-head validation;
- explicit rollback instructions.

## Phase 1 rollback policy

### Route migration rollback

- restore the old server-side compatibility call;
- do not restore direct browser access;
- preserve the new tests and ledger classification as blocked or rolled back;
- record the failure reason.

### Dispatcher movement rollback

- restore the previous import path;
- retain any neutral contract tests that remain valid;
- do not duplicate implementation in both locations indefinitely.

### Browser terminology rollback

- restore the script reference only if the canonical application fails to load;
- do not reintroduce a functional direct Classroom API fallback.

### Deployment retirement rollback

- redeploy the exact last known compatibility artifact only under explicit authorization;
- do not bypass the Admin or Player BFF;
- preserve security controls and JWT verification.

## Phase 1 completion definition

Phase 1 is complete only when all of the following are true on merged `main`:

- Admin browser traffic uses only the Admin session/BFF boundary;
- Player browser traffic uses only the Player session/BFF boundary;
- `admin-api` performs its operations directly through owned application and domain code;
- `player-api` has no imports from the Classroom API directory;
- browser runtime has no Classroom API alias or fallback terminology;
- unrelated tests no longer use Classroom API configuration;
- the route ledger shows zero transitional Classroom API routes;
- Classroom API is removed from runtime and deployment configuration, or an explicitly approved narrowly scoped residual role is documented with a new roadmap decision;
- full required validation is green;
- staging acceptance proves the new request paths;
- production remains unchanged until separately authorized.

# Phase 2 — Repository Census and Ownership Ledger

After Phase 1, classify every top-level path and major subtree as:

```text
canonical-runtime
compatibility-runtime
tooling
generated-content
immutable-evidence
historical
archived
```

Create a machine-readable ownership ledger with owner, status, runtime role, replacement, and removal gate.

No broad file moves occur in this phase.

# Phase 3 — Documentation Authority Normalization

Separate normative architecture, operations, product documentation, research, evidence, and archives.

Target structure:

```text
docs/
  architecture/
  operations/
  product/
  roadmaps/
  research/
  evidence/
  archive/
```

Every controlled document must declare status, owner, verification date, and supersession state.

# Phase 4 — Structural Ratchets

Add path and dependency rules before broad movement:

- no new root runtime files;
- no new cross-application imports;
- no browser imports from backend infrastructure;
- no runtime imports from archives or evidence;
- migration immutability;
- approved script ownership directories;
- documentation status enforcement.

# Phase 5 — Tooling Ownership Normalization

Reorganize `scripts/` by owner while preserving npm command compatibility:

```text
scripts/admin/
scripts/player/
scripts/backend/
scripts/database/
scripts/security/
scripts/release/
scripts/seed/
scripts/legacy/
scripts/shared/
```

The root package should increasingly orchestrate owned commands rather than directly owning domain-specific implementation.

# Phase 6 — Canonical Frontend Declaration

Declare one canonical Admin application and one canonical Player application.

Likely eventual mapping:

```text
admin/           -> apps/admin/
player-terminal/ -> apps/player/
```

The old root and `frontend/` surfaces must be classified before removal. Path movement is not sufficient; browser parity and hosting authority must be proven.

# Phase 7 — Workspace and Package Boundaries

After application authority is stable, introduce workspaces for:

```text
apps/*
packages/*
backend
tooling
```

Create shared packages only for genuinely neutral contracts, types, browser-runtime primitives, and test helpers.

# Phase 8 — Backend Dependency Refinement

Retain bounded domains while enforcing dependency direction:

```text
contracts -> domain -> services -> api/infrastructure
```

Prohibit domain imports from API directories, browser code, or another domain's concrete infrastructure.

# Phase 9 — Assets, Content, and Evidence Normalization

Separate:

- shared brand assets;
- Admin-owned assets;
- Player-owned assets;
- source content;
- generated runtime content;
- immutable release evidence;
- disposable local output.

Every generated artifact must declare its generator, inputs, determinism requirement, check command, and whether it belongs in Git.

# Phase 10 — Workflow and CI Normalization

Workflows should call stable package commands and use path filters aligned with the ownership ledger.

Shared contract changes must trigger all dependents. Documentation-only changes should avoid irrelevant runtime suites only where safe.

# Phase 11 — Compatibility Removal and Final Acceptance

Remove remaining obsolete paths only after zero-caller, zero-import, zero-deployment-reference, and staging-acceptance gates are proven.

Final acceptance requires:

- one canonical Admin app;
- one canonical Player app;
- clear API ownership;
- no uncontrolled compatibility path;
- tests owned by the relevant application or domain;
- reproducible migrations and generated content;
- CI aligned with repository ownership;
- full local and isolated-staging acceptance;
- separate explicit production authorization.

## Global definition of refactor completion

The structured refactor is complete when:

- the directory tree communicates runtime authority accurately;
- every route and major path has an owner;
- Admin and Player have separate secure browser session boundaries;
- application APIs call domain services directly;
- Classroom API is retired;
- backend domains have enforced dependency direction;
- root tooling primarily orchestrates package-owned commands;
- documentation clearly separates current authority from history and evidence;
- migrations remain immutable and replayable;
- all compatibility paths have been removed or explicitly retained under a new approved architecture decision;
- full staging acceptance is green;
- production promotion remains a separate controlled release.
