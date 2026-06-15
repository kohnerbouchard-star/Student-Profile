# Supabase RLS Policy Plan V1

This document designs the first Row Level Security policy model for the current
Eco Novaria core schema. It is a planning checkpoint only. Do not treat this
document as an implemented policy set, and do not add RLS SQL until the next
reviewed migration checkpoint.

## Recommended V1 RLS Posture

V1 should enable RLS on every current core table and rely on conservative
deny-by-default behavior for direct client access. The backend/server remains
the primary trusted write path through service-role access, and the backend
access boundary remains responsible for resolving staff, player, and system
identity before application logic reads or writes game-scoped data.

RLS should be used as defense-in-depth, not as a replacement for backend access
checks. Service-role clients bypass RLS, so backend modules must continue to
derive authority from Supabase Auth staff identity, hashed player session
tokens, and the access-boundary helpers.

Recommended V1 defaults:

- Enable RLS on all core tables.
- Deny anonymous direct access by default.
- Keep sensitive writes backend/service-only.
- Allow direct authenticated teacher reads only where access is clearly scoped
  through `auth.uid()` and `staff_users.supabase_auth_user_id`.
- Do not allow players to directly query or write private tables from frontend
  code in V1.
- Delay direct player RLS policies until custom player sessions are represented
  by a reviewed backend/session bridge.
- Keep player credentials, player sessions, ledger writes, balance projection
  writes, and audit writes backend-only.

## Policy Helper Strategy

Future RLS SQL should use small helper functions so table policies do not repeat
complex ownership subqueries. These helpers should be created in the SQL
migration that implements RLS, not in this planning checkpoint.

Proposed helpers:

- `current_staff_user_id() returns uuid`
  - Uses `auth.uid()` to find `staff_users.id` where
    `staff_users.supabase_auth_user_id = auth.uid()`.
  - Returns null when the current Supabase Auth user is not a V1 teacher.
- `is_game_owner(game_session_id uuid) returns boolean`
  - Uses `current_staff_user_id()` and checks
    `game_sessions.owner_staff_user_id`.
  - This is the main teacher-owned game isolation helper.
- `can_access_player(game_session_id uuid, player_id uuid) returns boolean`
  - For V1, should return true for staff owners only.
  - Future player support must not rely on frontend-provided IDs. It needs a
    reviewed way to bind a custom player session to a database identity before
    direct player RLS is safe.
- `can_read_game_audit(game_session_id uuid) returns boolean`
  - Optional helper for future teacher audit-log read policies.
  - Should use `is_game_owner(game_session_id)`.

Helper functions should be stable, security-conscious, and written to avoid
accidentally granting access when `auth.uid()` is null.

## Table-by-Table Policy Plan

### `staff_users`

- Enable RLS in V1: yes.
- Select: authenticated teachers may select only their own row where
  `supabase_auth_user_id = auth.uid()`. Backend/service-role can manage through
  trusted server code.
- Insert: backend/service-only. Teachers should not self-create staff rows from
  frontend code in V1.
- Update: backend/service-only in V1. Profile self-update can be reviewed later
  as a separate narrow policy.
- Delete: backend/service-only; prefer no hard deletes for app workflows.
- Access columns/relationships: `staff_users.supabase_auth_user_id` maps
  Supabase Auth identity to `staff_users.id`.
- Access class: teacher-auth scoped read; backend-only writes.

### `purchase_codes`

- Enable RLS in V1: yes.
- Select: backend/service-only. Purchase codes should not be directly readable
  from frontend code.
- Insert: backend/service-only.
- Update: backend/service-only for redemption counters and lifecycle status.
- Delete: backend/service-only; prefer status changes over hard deletes.
- Access columns/relationships: `code_hash`, `status`, `max_redemptions`,
  `redeemed_count`, and `expires_at` are licensing internals.
- Access class: backend-only.

### `entitlements`

- Enable RLS in V1: yes.
- Select: backend/service-only in initial V1. Teacher-read for entitlements
  linked to owned games may be added later after the helper functions are
  implemented and reviewed.
- Insert: backend/service-only during purchase-code redemption.
- Update: backend/service-only for entitlement lifecycle changes.
- Delete: backend/service-only; prefer status changes over hard deletes.
- Access columns/relationships: `staff_user_id`, `game_session_id`, and
  `game_sessions.owner_staff_user_id`.
- Access class: backend-only first; possible future teacher-auth scoped read.

### `game_sessions`

- Enable RLS in V1: yes.
- Select: authenticated teachers may select game sessions where
  `owner_staff_user_id = current_staff_user_id()`.
- Insert: backend/service-only. Game creation follows server-side license and
  purchase-code checks.
- Update: backend/service-only in V1. Direct teacher update can be reviewed
  later for narrow fields such as `name`, but not join-code lifecycle fields.
- Delete: backend/service-only; prefer archive/disable status changes.
- Access columns/relationships: `game_sessions.owner_staff_user_id` is the
  teacher ownership boundary; `game_sessions.id` is the game isolation boundary.
- Access class: teacher-auth scoped read; backend-only writes.

### `game_settings`

- Enable RLS in V1: yes.
- Select: backend/service-only in initial V1. A future direct teacher read policy
  may allow reads when `is_game_owner(game_settings.game_session_id)`.
- Insert: backend/service-only when a game is created.
- Update: backend/service-only in V1. Direct teacher updates are optional/later
  and must be limited to settings for owned games.
- Delete: backend/service-only.
- Access columns/relationships: `game_settings.game_session_id` references
  `game_sessions.id`; ownership is derived through `game_sessions.owner_staff_user_id`.
- Access class: backend-only first; possible future teacher-auth scoped read or
  narrow update.

### `players`

- Enable RLS in V1: yes.
- Select: backend/service-only in initial V1. A future direct teacher read policy
  may allow reads when `is_game_owner(players.game_session_id)`.
- Insert: backend/service-only. Roster creation/import must enforce duplicate
  student-code rules server-side.
- Update: backend/service-only for player lifecycle and roster management in V1.
- Delete: backend/service-only; prefer status changes over hard deletes.
- Access columns/relationships: `players.game_session_id` references
  `game_sessions.id`. Student-private access later requires both
  `game_session_id` and `player_id`.
- Access class: backend-only first; possible future teacher-auth scoped read.

### `player_access_credentials`

- Enable RLS in V1: yes.
- Select: backend/service-only. Never expose credential hashes through direct
  frontend reads.
- Insert: backend/service-only when creating or rotating student credentials.
- Update: backend/service-only for revocation and lifecycle changes.
- Delete: backend/service-only; prefer revocation over hard deletes.
- Access columns/relationships: `game_session_id`, `player_id`, and
  `normalized_student_code_hash`. Credential uniqueness is scoped to active
  credentials inside one game session.
- Access class: backend-only.

### `player_sessions`

- Enable RLS in V1: yes.
- Select: backend/service-only. Player sessions are resolved by hashed token in
  trusted backend code, not by direct frontend reads.
- Insert: backend/service-only after successful `game_join_code + student_code`
  login.
- Update: backend/service-only for expiry, revocation, and lifecycle changes.
- Delete: backend/service-only; prefer revocation/expiry status changes.
- Access columns/relationships: `session_token_hash`, `game_session_id`,
  `player_id`, `status`, `expires_at`, and `revoked_at`.
- Access class: backend-only.

### `ledger_entries`

- Enable RLS in V1: yes.
- Select: backend/service-only in initial V1. Teacher read for owned games may
  be added later through `is_game_owner(ledger_entries.game_session_id)`.
- Insert: backend/service-only. Ledger entries are authoritative money movement
  records and must be written by trusted server logic.
- Update: no direct update policy. Ledger entries should be append-only; any
  correction should be a new ledger entry from backend logic.
- Delete: no direct delete policy.
- Access columns/relationships: `game_session_id` is required for every row;
  player-specific entries also include `player_id`.
- Access class: backend-only writes; possible future teacher-auth scoped read.

### `account_balances`

- Enable RLS in V1: yes.
- Select: backend/service-only in initial V1. Teacher/player reads should go
  through backend first because player sessions are custom and not represented
  in Supabase Auth.
- Insert: backend/service-only as a ledger-derived projection.
- Update: backend/service-only as a ledger-derived projection.
- Delete: backend/service-only.
- Access columns/relationships: `game_session_id`, `player_id`,
  `last_ledger_entry_id`, and the composite player relationship.
- Access class: backend-only first; future teacher/player scoped reads require a
  reviewed player-session bridge.

### `audit_log`

- Enable RLS in V1: yes.
- Select: backend/service-only in initial V1. Teacher read for owned game audit
  rows may be added later after reviewing volume, redaction, and metadata
  exposure.
- Insert: backend/service-only. Audit logs should be appended by trusted backend
  logic after sensitive actions.
- Update: no direct update policy. Audit rows should be immutable.
- Delete: no direct delete policy.
- Access columns/relationships: `game_session_id`, `actor_type`, `actor_id`,
  `action`, `target_type`, `target_id`, and `metadata`.
- Access class: backend-only writes; possible future teacher-auth scoped read.

## Risks and Open Decisions

- Service-role access bypasses RLS, so backend repository adapters and access
  boundary helpers must remain strict.
- Direct frontend access increases RLS complexity and makes policy mistakes more
  likely.
- Player sessions are custom server-issued tokens and are not automatically
  represented in Supabase Auth.
- RLS cannot safely identify a custom player session without a reviewed backend
  or session bridge that maps the request to one player and one game.
- Frontend-provided `game_session_id` and `player_id` must remain routing hints,
  not authority.
- Ledger and account-balance writes must stay backend-only to preserve money
  movement integrity.
- Audit logs should be append-only from trusted backend logic; direct updates or
  deletes would weaken incident review.
- Teacher direct reads of players, balances, ledger entries, and audit metadata
  may need redaction decisions before being exposed.
- It is still open whether V1 should include direct teacher reads beyond
  `staff_users` and `game_sessions`, or keep all other reads backend-only until
  route/service behavior is reviewed.

## Recommended Next Checkpoint

Recommended next task:

`backend: add Supabase RLS policies v1`

That future checkpoint should create a SQL migration that:

- enables RLS on all current core tables
- adds conservative deny-by-default policies
- adds safe teacher-owned read policies where appropriate
- keeps player credentials, player sessions, and backend-sensitive tables
  service-only
- preserves backend access-boundary checks as the source of application
  authorization
- does not add feature tables, seed data, frontend wiring, or app routes
