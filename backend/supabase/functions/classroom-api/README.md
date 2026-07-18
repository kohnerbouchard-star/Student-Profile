# Classroom API

`classroom-api` is an active Supabase Edge Function and the modern HTTP boundary
for classroom and student capabilities. Its deployed source must be traceable to
a reviewed Git commit and promoted with the matching migrations and frontend.

## Responsibilities

- staff authentication and licensing/game creation boundaries;
- player session and identity validation;
- attendance clock-in and localized, idempotent reward issuance;
- player-safe Store quoting and purchase execution;
- player-scoped Inventory reads, atomic redemption reservation, and public-ID
  redemption history/status reads;
- contract reads, atomic/idempotent acceptance, evidence submission, and
  game-scoped classroom operations;
- thin HTTP adaptation into domain handlers and repository/RPC boundaries.

## Request boundary

The router validates method, path, headers, and body before invoking a handler.
Staff routes use a Supabase Auth bearer token. Player routes use the configured
player session token contract and derive player/game identity from that session;
they do not accept browser-selected identity as authority.

After authentication, each operation must enforce its game/player scope before
using service-role data access. CORS remains restricted to approved application
origins and local development—not wildcard origins.

## Development rules

- Keep the Edge router thin; business rules belong in `backend/src/domains/`.
- Do not duplicate transaction logic that already exists in an atomic RPC.
- Do not log tokens, access codes, passwords, or student-sensitive bodies.
- Add route tests for unauthenticated, wrong-role, wrong-game, revoked/expired,
  valid-owner, and replay/idempotency cases.
- Pin Edge dependencies and update `../deno.lock` intentionally.

Verify from the repository root:

```zsh
npm --prefix backend run typecheck:edge
npm --prefix backend run smoke
```
