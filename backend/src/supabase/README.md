# Supabase Repository Adapters V1

This folder contains backend-only Supabase adapter modules for the access
boundary. They are framework-agnostic and use structural client types so future
routes can inject a real `@supabase/supabase-js` server client when backend
package setup exists.

## Adapters

- `staffRepository.ts` implements `StaffAccessRepository` with lookups for
  `staff_users.supabase_auth_user_id` and `game_sessions.id`.
- `playerSessionRepository.ts` implements `PlayerSessionRepository` with lookup
  by `player_sessions.session_token_hash`.
- `auditRepository.ts` provides a small `writeAuditLogEntry` adapter for future
  audit writes.
- `tableTypes.ts` defines narrow row types for `staff_users`, `game_sessions`,
  `player_sessions`, and `audit_log`.
- `queryResult.ts` normalizes Supabase query responses without importing
  Supabase package types.

## Security Boundary

The adapters fetch and write rows only. They do not make authorization
decisions. Future routes and services must resolve identity and call the
auth/access helpers before using fetched records or writing game-scoped data.

Player session lookup accepts `session_token_hash` only. Plaintext player session
tokens must be hashed before reaching the repository adapter.

Staff lookup uses `supabase_auth_user_id`. Staff game access still has to be
checked through `game_sessions.owner_staff_user_id`.

The server client used with these adapters must be created in backend/server-only
code. Never expose the Supabase service-role key to frontend code.
