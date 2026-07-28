# Classroom API

`classroom-api` is a deployed Supabase Edge Function retained as a compatibility
boundary during the Admin and Player API cutover. It is not the primary browser
HTTP boundary. New browser integrations must target the current Staff/Admin or
Player HttpOnly BFF surfaces instead.

The function remains operational because `admin-api` still forwards a bounded set
of staff operations to it server-side. It must stay deployed until those proxy
paths have been migrated, verified, and removed. Its deployed source must remain
traceable to a reviewed Git commit and be promoted with the matching migrations
and frontend.

## Current lifecycle status

- **Primary Staff/Admin browser boundary:** `staff-api`, `admin-api`, and the Admin
  HttpOnly BFF.
- **Primary Player browser boundary:** `player-web-session-api`, `player-api`, and
  the Player HttpOnly BFF.
- **Compatibility boundary:** `classroom-api`, including remaining server-side
  Admin forwarding and route aliases retained for migration and regression tests.
- **New feature rule:** do not add new browser traffic or new product capability
  directly to `classroom-api`.
- **Retirement condition:** remove the function only after its server-side callers,
  compatibility routes, deployment references, and acceptance tests have reached
  zero required usage.

## Responsibilities

- service-role-safe execution for the remaining staff compatibility operations;
- temporary route compatibility for previously integrated classroom and player
  capabilities while canonical callers complete migration;
- authentication, authorization, game/player scoping, and idempotency at every
  retained route;
- thin HTTP adaptation into domain handlers and repository/RPC boundaries.

Business rules continue to live in `backend/src/domains/`; this router must not
become a second implementation of domain behavior.

## Request boundary

The deployed function has platform JWT verification enabled. Staff compatibility
requests use a real Supabase Auth bearer token and are also resolved server-side
before service-role access.

Current Player browser sessions use an opaque session contract terminated by the
Player HttpOnly BFF and `player-api`; browsers must not call `classroom-api`
directly. Player-oriented route code retained here is compatibility surface, not
the canonical browser contract, and must not be expanded.

After authentication, each operation must enforce its game/player scope before
using service-role data access. CORS remains restricted to approved application
origins and local development—not wildcard origins.

## Development rules

- Keep the Edge router thin; business rules belong in `backend/src/domains/`.
- Do not add a new route here when the operation belongs in `staff-api`,
  `admin-api`, or `player-api`.
- Do not duplicate transaction logic that already exists in an atomic RPC.
- Do not log tokens, access codes, passwords, or student-sensitive bodies.
- Add route tests for unauthenticated, wrong-role, wrong-game, revoked/expired,
  valid-owner, and replay/idempotency cases.
- Pin Edge dependencies and update `../deno.lock` intentionally.
- Update this lifecycle section and `backend/supabase/config.toml` together when
  the compatibility surface changes.

Verify from the repository root:

```zsh
npm --prefix backend run typecheck:edge
npm --prefix backend run smoke
```
