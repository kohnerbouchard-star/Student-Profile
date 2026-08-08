# Admin UI V2 Contracts Architecture

Status: source-owned V2 route migration

Base audited: `b7827211f0ff15b8a963219a63738180b33a1b3d`
Branch: `refactor/admin-ui-v2-contracts-v1`
Permission: `contracts.manage`

## Scope

This migration replaces only the legacy Contracts handoff (`Assignments` / `#contracts`) with a source-owned Admin V2 route. It does not change the Contracts domain model, backend authorization, contract lifecycle semantics, reward semantics, or any other Admin V2 route disposition.

The route manages the authoritative game-scoped contract lifecycle already exposed through the Admin BFF:

- list game-scoped contracts and their lifecycle/progress counts;
- create a game-scoped contract using fields accepted by the existing Admin contract mutation adapter;
- publish draft or scheduled contracts;
- archive contracts non-destructively;
- duplicate an existing contract as an existing compatibility operation;
- inspect participant progress/submissions;
- approve, reject, or request revision for submitted progress;
- issue configured rewards only after completion through the existing reward-issuance endpoint.

## Contract templates

Contract templates are an authoritative domain concept, and game-scoped contracts can retain source/template lineage. There is no audited Admin/BFF contract-template CRUD route in the current repository. This V2 migration therefore does **not** invent template management APIs or controls. Template/system lineage is rendered when present through existing source metadata; template CRUD remains outside this route until an authoritative Admin/BFF contract exists.

## Runtime boundary

All browser requests stay behind the existing cookie-bound Admin BFF using the shared `createAdminBffTransport` boundary. The Contracts-specific client emits only local `/api/admin` URLs and never sends a bearer token.

Read paths:

- `GET /api/admin/games/:gameId/contracts`
- `GET /api/admin/games/:gameId/contracts/:contractId/progress`
- `GET /api/admin/games/:gameId/contracts/:contractId/submissions`

Mutation paths:

- `POST /api/admin/games/:gameId/contracts`
- `POST /api/admin/games/:gameId/contracts/:contractId/publish`
- `POST /api/admin/games/:gameId/contracts/:contractId/archive`
- `POST /api/admin/games/:gameId/contracts/:contractId/duplicate`
- `POST /api/admin/games/:gameId/contracts/:contractId/progress/:progressId/review`
- `POST /api/admin/games/:gameId/contracts/:contractId/progress/:progressId/rewards/issue`

The shared BFF transport adds the selected game scope, device binding, HttpOnly-session credentials, CSRF identity for writes, and idempotency keys. No client-supplied staff/player authority fields are added by the V2 route.

## Read model and UUID boundary

Backend resource IDs remain available only as controller-internal `resourceId` values needed to address authoritative mutations. They are never used as visible text, table row labels, accessible names, URLs exposed in the DOM, or data attributes. The display normalizer also strips UUID-shaped substrings from text projections.

Participant names and evidence are resolved through the existing Admin BFF submission projection rather than exposing player ownership IDs. Reward item identifiers are not rendered; the route reports configured item quantities/counts only.

## Lifecycle mapping

Contract lifecycle values are preserved as authored by the Contracts domain:

- `draft`
- `scheduled`
- `active`
- `paused`
- `completed`
- `expired`
- `archived`

Participant progress values are preserved as:

- `available`
- `in_progress`
- `submitted`
- `completed`
- `failed`
- `expired`
- `dismissed`

Review controls are rendered only for submitted progress. Reward issuance is rendered only for completed progress without an existing `rewardIssuedAt`. The backend remains authoritative and may reject a stale client state.

## V2 state model

The controller uses the existing Admin V2 data-state contract:

- `initial-loading`
- `ready`
- `refreshing`
- `stale`
- `empty`
- `failed`

Permission denial is handled by the existing app-level `AdminPermissionBoundary` for `contracts.manage`. Initial-load failures use the shared safe error envelope; refresh failures preserve the last resolved contract directory in `stale` state.

## UI composition

The route reuses source-owned V2 primitives:

- `AdminPageFrame`
- `AdminDataTable`
- `AdminField`
- `AdminDialog`
- `AdminConfirmDialog`
- `AdminDrawer`
- `AdminSkeleton`
- `AdminEmptyState`
- `AdminErrorState`
- `AdminStaleState`
- `AdminValidationSummary`

The main directory provides search, lifecycle filtering, and category filtering. A detail drawer carries long contract content and participant progress. Creation and review use accessible dialogs; destructive/non-destructive lifecycle confirmations use the standard confirm dialog.

At narrow widths, the contract and participant tables become semantic stacked cards rather than requiring a wide fixed table. Long English and Korean/non-ASCII content uses wrapping rules rather than truncating identifiers into the UI.

## Mutations and replay safety

Each mutation receives a stable idempotency key for the active attempt. Retryable failures retain that key for a same-payload retry; successful or non-retryable attempts release it. Concurrent duplicate mutations with the same action/target/payload are rejected locally while one is active. The server remains the source of truth for replay handling.

## Non-goals

This migration does not:

- add contract-template CRUD;
- add new contract status values, completion modes, review actions, assignment models, or reward types;
- bypass the Admin BFF;
- add player/staff UUIDs to rendered UI;
- redesign the Admin V2 shell;
- change Banking, Loans, Business, Marketplace, Inventory, World, News, Messages, Progression, Players, Attendance, Settings, or Logs route ownership;
- rewrite the Admin roadmap.
