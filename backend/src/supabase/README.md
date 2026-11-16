# Shared Supabase query contracts

This folder retains structural query normalization and row contracts used by
current domain repositories. The backend has package dependencies; these helpers
are not a pending package-setup placeholder.

- `queryResult.ts` normalizes responses and defines repository client contracts.
- `tableTypes.ts` and its core/stock table modules define shared row contracts.
- Domain-owned adapters live under `../domains/*/infrastructure/`.

## Retired disconnected adapters

`staffRepository.ts`, `playerSessionRepository.ts` and `serverClient.ts` had no
executable consumers or public package exports in the tracked-tree scan and were
removed. Their old README described future injection, not current runtime wiring.
The unused standalone Staff/Game creation cluster and its shared `auditRepository.ts` adapter are also retired. Domain-owned audit writes and shared auth/row/query contracts remain; no audit history or database policy was deleted.

## Current ownership and security

The licensing HTTP adapter resolves a verified staff session through
`../platform/supabase/edgeStaffSession.ts`, supplies its scoped staff lookup to
the licensing route, and constructs the domain licensing repository. Classroom
API clients are composed in
`backend/supabase/functions/classroom-api/classroomClients.ts`.
Current Player request/session handling lives under `../domains/players/api/`.
These are observed current owners, not a claim that every historical scaffold
function has a one-to-one replacement.

Repositories do not replace route authorization. Preserve server-derived game
and player scope, hashed session credentials and server-only service-role keys.
