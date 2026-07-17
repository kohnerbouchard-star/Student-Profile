# Econovaria backend

This workspace contains the active Supabase replacement backend. It is no
longer a structure-only checkpoint: it includes domain services, migrations,
database RPCs, repository adapters, smoke tests, and deployed Edge Function
sources.

## Runtime boundaries

- `supabase/functions/admin-api/` is the staff-authenticated, game-scoped admin
  API and uses service-role access only after route authorization.
- `supabase/functions/classroom-api/` owns modern classroom/student capabilities
  including licensing, sessions, attendance, Store, contracts, and related
  game-scoped reads and writes.
- `supabase/functions/stock-market-*` contains stock read, trading, seed-copy,
  and runner boundaries.
- `supabase/migrations/` is the only normal database schema path.
- `src/domains/` owns business rules and contracts by bounded context.
- `src/platform/` owns Supabase, scheduling, and realtime adapters.
- `src/shared/` is restricted to genuinely cross-domain primitives.
- `legacy/` is reference material and must not receive new production logic.

## Verification

From the repository root:

```zsh
npm --prefix backend ci
npm --prefix backend run typecheck:all
npm --prefix backend run smoke
```

Edge imports and runtimes are exact-pinned. Do not restore `--no-lock`, use a
floating Deno release, or omit a deployable function from typechecking.

Database changes must be forward migrations, preserve game/player scope, and
pass the clean database replay workflow. Never repair the live migration ledger
or execute production SQL merely because migration names appear equivalent.

## Security rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend or admin browser code.
- Authenticate before creating a service-role client and prove target-game
  ownership on every privileged route.
- Use composite game/player or game/resource relationships where data carries
  `game_session_id`.
- Keep monetary, inventory, reward, contract, attendance, and stock writes
  transactional and idempotent.
- Add authorization-matrix coverage when creating or changing a route.
