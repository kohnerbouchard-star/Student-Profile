# Backend shared access primitives

This folder retains shared identity contracts and access primitives. It is not a
public package API or a complete route authorization system. The backend package
is private; actual request boundaries are composed by their owning domains and
server entrypoints.

## Retained staff authority

`staffAccess.ts` resolves a verified Supabase Auth user to a staff identity using
an injected repository. Its game-access primitive checks the teacher-owned game
session. `domains/licensing/api/activationRouteHandler.ts` imports this module and
resolves staff identity before invoking staff licensing activation. These live
primitives and their shared `types.ts` contracts must remain.

## Current Player authority

Player request authentication and scope handling live in
`domains/players/api/playerRequestScope.ts` and
`domains/players/api/playerSessionHttpHelpers.ts`. The unconsumed V1
`playerAccess.ts` primitive was retired after checking its exports and entrypoints;
no live session or ownership checks were removed. Current server environment
composition uses `platform/supabase/edgeStaffSession.ts`; the unused Node-only
`config/env.ts` reader is retired, not used as proof of live key validation.

## Retired disconnected scaffolding

The unused `gameAccess.ts`, `requestIdentity.ts` and `permissions.ts` V1 scaffolds
were removed after a tracked-tree source, documentation, script and build scan
found no executable consumers. Their older README recommendations were not an
active authorization implementation. No live route, current Staff creation flow, session
repository, shared identity type or authorization policy was removed.

## Server-only credentials

Current entrypoints compose their server clients, including
`backend/supabase/functions/classroom-api/classroomClients.ts`. The disconnected
generic `supabase/serverClient.ts` and `supabase/staffRepository.ts` scaffolds
are retired. Service-role credentials belong only in server runtimes and must
never be exposed to browser code. This repository has backend package dependencies.
