# Eco Novaria v606 Admin Data Wiring Repair Plan

## Objective

Connect the v606 administrator terminal to the existing Supabase-backed classroom domain without replacing the current backend architecture, exposing privileged credentials, or fabricating placeholder data.

## Non-negotiable constraints

- Keep the student application at `/` and the administrator terminal at `/admin/`.
- Keep Supabase Auth as the administrator identity provider.
- Keep `classroom-api` as the server-side authorization boundary.
- Never expose the service-role key to browser code.
- Every staff route must resolve the authenticated staff user and verify ownership of the requested game session.
- Do not merge or deploy a partial route that makes destructive UI controls appear functional when the backend operation is not implemented.
- Apply database changes through versioned migrations only.
- Do not modify production data during validation except through explicit fixture/setup actions.

## Confirmed current state

### Working foundation

- Root administrator sign-in and Create Game flow use Supabase Auth and `GET /staff/bootstrap`.
- The selected game and access token are transferred to `/admin/` through `sessionStorage`.
- `/admin/` is session-gated and no longer contains a second login UI.
- The browser adapter already proxies a subset of `/api/admin` requests to `classroom-api`.
- Existing backend domains include staff bootstrap, players, player access-code reset, settings, store catalog, attendance handlers, ledger operations, contracts handlers, join-code reset, and player market functions.

### Confirmed defects

1. Unsupported v606 requests fall through to `501 admin_route_not_implemented`.
2. Existing backend responses are often forwarded without translation into the response shapes expected by v606.
3. The live database does not currently contain `public.player_attendance_records` even though the migration history records the original attendance migration as applied.
4. The live database does not contain the contracts schema and does not record migration `20260625123000_add_contracts_schema_v1` as applied.
5. Staff bootstrap does not return a plaintext game join code. The database stores only `game_join_code_hash`, so the existing code cannot be reconstructed.
6. Dedicated staff read models for dashboard, leaderboard, marketplace summary, recent trades, notifications, and audit logs are not currently exposed by `classroom-api`.

## Delivery strategy

The repair is split into independently testable phases. Each phase must pass its acceptance gate before the next phase starts.

## Phase 0 — Contract inventory and safety baseline

### Work

- Extract every `/api/admin` request emitted by the v606 bundle.
- Record method, path, request body, expected success shape, empty shape, and expected error behavior.
- Map each request to one of:
  - existing backend route;
  - adapter-only transformation;
  - missing backend route;
  - intentionally unsupported feature.
- Add adapter diagnostics that log method, normalized route name, upstream status, and error code without logging access tokens or sensitive payloads.

### Acceptance gate

- A checked-in route matrix covers every v606 request.
- No request can silently fall through without a named integration status.
- No secrets or bearer tokens appear in logs.

## Phase 1 — Restore live schema parity

### Attendance repair migration

Create a new idempotent repair migration rather than replaying an already-recorded migration version. It must:

- recreate `public.player_attendance_records` if absent;
- recreate required indexes and update trigger if absent;
- recreate `public.record_player_attendance_clock_in(...)` with the repository version;
- reapply service-role execution permissions;
- validate required dependencies before changing anything:
  - `public.players` composite game/player key;
  - `public.set_current_timestamp_updated_at()`;
  - `public.record_player_ledger_entry(...)`;
  - `public.audit_log`.

### Contracts schema migration

Apply the repository contracts schema only after checking all dependencies and verifying that it is idempotent against an empty contracts installation. Do not hand-create a reduced schema that diverges from the contract repository implementation.

### Acceptance gate

- Attendance table, indexes, trigger, and RPC exist.
- Contracts tables, constraints, indexes, and RPCs required by the repository exist.
- Existing tables and production rows are unchanged except for the new schema objects.
- Direct read-only smoke queries pass.
- Migration history contains the new repair migration and the contracts migration or an explicitly named compatibility migration.

### Rollback

- Rollback scripts remove only newly created schema objects and never delete pre-existing domain data.
- If any dependency check fails, the migration aborts before creating objects.

## Phase 2 — Normalize already-supported routes

Create named adapter functions instead of forwarding raw responses.

### Session bootstrap

Normalize:

- administrator identity;
- active game;
- games list;
- permissions;
- session expiry.

Do not claim a join code is available when only a hash exists.

### Players

Map existing backend payload:

```text
{ ok, gameSession, players }
```

into the exact v606 list and create-player shapes. Preserve:

- UUIDs;
- display name;
- roster label;
- status;
- active access-code state;
- timestamps.

### Store

Normalize catalog list, create, update, and status/visibility behavior. Do not synthesize SKU values if the UI can use UUID/item key directly.

### Settings

Map difficulty and window configuration without discarding fields not represented by the UI. Updates must be merge-safe rather than replacing the entire settings object with partial data.

### Attendance

Map daily summary, scanned records, and missing players after schema repair. Preserve timezone and attendance date.

### Contracts

Normalize contract list/create/publish/progress/review/reward responses against the existing contract domain types.

### Acceptance gate

- Players, Store, Settings, Attendance, and Contracts render real data for an owned game.
- Empty datasets render legitimate empty states rather than server errors.
- All mutations return visible success/error feedback.
- Cross-game IDs fail ownership checks.

## Phase 3 — Add staff read models required by Overview

Implement server-side staff routes under the existing `classroom-api` authorization boundary:

```text
GET /staff/game-sessions/:gameId/dashboard
GET /staff/game-sessions/:gameId/leaderboard
GET /staff/game-sessions/:gameId/market
GET /staff/game-sessions/:gameId/trades
GET /staff/game-sessions/:gameId/logs
GET /staff/game-sessions/:gameId/notifications
```

### Dashboard read model

The dashboard endpoint should aggregate the first-screen data in one request:

- game identity and status;
- active player count;
- today attendance summary;
- store activity summary;
- contract activity summary;
- market status;
- recent administrator-relevant activity;
- generated timestamp.

It must not issue N+1 per-player queries.

### Leaderboard

Define the ranking formula explicitly and implement it server-side. Until that formula is approved, return an unavailable state rather than ranking by an arbitrary field.

### Logs

Use `public.audit_log` as the source. Return only records belonging to the owned game. Apply bounded pagination and server-side filters.

### Notifications

If no durable notifications table exists, initially derive actionable notifications from domain state and label them as computed. Do not introduce a new table until retention and read-state requirements are defined.

### Acceptance gate

- Overview loads without `501` or fallback “cannot reach server” messages.
- All aggregate queries are bounded and scoped to one owned game.
- Response latency is measured and documented.

## Phase 4 — Game join-code behavior

The current database stores only a hash. Therefore:

- do not attempt to decode or display the existing code;
- display “Code hidden — reset to reveal a new code” when no recoverable code is available;
- use the existing reset endpoint to generate a new code;
- return the plaintext code once in the reset response;
- never persist the plaintext code in browser storage longer than required for display/copy;
- never log the plaintext code.

### Acceptance gate

- Existing sessions do not display blank or fabricated codes.
- Reset generates and displays a new code once.
- The stored database value remains hashed.

## Phase 5 — Remaining mutations and unsupported controls

Audit every v606 action. Each control must be one of:

- fully implemented and tested;
- visibly disabled with a precise reason;
- removed from the current release.

Priority mutations:

- create player;
- reset player access code;
- attendance scan;
- contract create/update/publish/review/reward;
- store item create/update/status;
- difficulty/settings update;
- ledger adjustment;
- game join-code reset.

## Testing strategy

### Automated

- route parser tests;
- adapter response normalization tests;
- ownership and authorization tests;
- empty-state tests;
- malformed upstream response tests;
- migration dependency tests;
- contract and attendance repository integration tests;
- `deno check` for Edge Function code;
- existing backend test suite;
- frontend JavaScript syntax checks.

### Manual smoke test

For one owned active game:

1. Sign in from the root Admin tab.
2. Select the game and enter `/admin/` without a second login.
3. Verify Overview, Players, Attendance, Contracts, Store, Marketplace, Settings, and Logs.
4. Create a temporary player, reset its access code, and verify it appears.
5. Run one attendance scan and verify summary/record changes.
6. Create a draft contract, publish it, and verify the player-facing route.
7. Change one reversible setting and restore it.
8. Confirm requests for another game ID are rejected.
9. Sign out and confirm `/admin/` redirects to the root Admin login.

## Deployment order

1. Merge migration and backend code only after local tests pass.
2. Apply database migrations.
3. Deploy `classroom-api`.
4. Run backend smoke requests against production.
5. Deploy static frontend adapter changes.
6. Hard-refresh GitHub Pages and run the full UI smoke test.
7. Keep the previous Edge Function deployment and frontend commit SHA recorded for rollback.

## Merge policy

- Use a dedicated PR from `fix/admin-v606-data-wiring`.
- Do not merge while any critical route is returning `501`, `404`, or unexplained `500` in the tested flow.
- Do not merge database and frontend changes without the corresponding backend deployment instructions.
- Secret scan and staged-file review are mandatory.
