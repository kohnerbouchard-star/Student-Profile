# Backend Access Boundary V1

This folder defines the first backend-only access boundary around Supabase Auth,
teacher-owned games, server-issued player sessions, and V1 permission checks.
It does not add feature routes, frontend wiring, seed data, RLS policies, or live
Supabase queries.

## Staff identity

Staff requests start with a verified Supabase Auth user from a server runtime.
`staffAccess.resolveStaffIdentity` maps `SupabaseAuthUser.id` to
`staff_users.supabase_auth_user_id`. In V1, `staff_users` means teacher users
only. Staff can access a game only when `game_sessions.owner_staff_user_id`
matches the resolved `staff_users.id`.

## Player identity

Player requests start with a server-issued player session token. The plaintext
token is treated as a secret, normalized only for transport whitespace, hashed by
an injected backend hasher, then looked up through `session_token_hash`.
`playerAccess.resolvePlayerIdentityFromSessionToken` accepts exactly one
`player_sessions` row, and requires:

- `status = "active"`
- `expires_at` later than the backend clock
- no `revoked_at` value

The resolved identity supplies the authoritative `gameSessionId` and `playerId`.
Frontend-provided `game_session_id` or `player_id` values are routing hints only
and must be checked against this identity before use.

## Game access

`gameAccess` contains helpers for the two V1 access paths:

- staff access to teacher-owned game sessions
- player access to the one game and player resolved from their session

Use `rejectCrossGameAccess` for any request that includes a game id from the
URL, payload, or query string. Shared game data is scoped by `game_session_id`;
student-private data must also be scoped by `player_id`.

## Permissions

`permissions` provides intentionally small V1 helpers such as `canManageGame`,
`canManagePlayers`, `canReadOwnPlayerProfile`, `canWriteLedgerEntry`,
`canReadLedger`, and `canWriteAuditLog`. These helpers are not a full RBAC
system. Route and use-case code should first resolve identity and game access,
then use permissions as the final action check.

## Supabase client boundary

`../supabase/serverClient.ts` is server-only scaffolding. It accepts a Supabase
client factory instead of importing `@supabase/supabase-js` directly because this
checkout does not yet include backend package dependencies. The service role key
belongs only in backend/server runtimes and must never be exposed to frontend
code.
