# Domain Modules

Each folder in this directory is a self-contained product domain. A domain should be testable and connectable to API entrypoints without mixing HTTP code, business rules, and database access.

## Module structure

- `api/` is for request handlers or adapters used by Edge Functions.
- `application/` is for use cases and orchestration.
- `domain/` is for pure business rules and domain entities.
- `infrastructure/` is for Supabase, database, and external adapters.
- `contracts/` is for request and response types, validation schemas, and DTOs.
- `tests/` is for tests specific to that domain.

## Architecture rules

1. Domain business rules belong in `domain/`.
2. API handlers must stay thin.
3. Application and use-case code coordinates work but should not contain low-level database details.
4. Infrastructure code handles persistence and Supabase access.
5. Cross-domain imports should go through public boundaries later, not random deep imports.
6. Shared code must stay small and must not become a dumping ground.
7. Every future simulation table and query must be scoped by `game_session_id` or an equivalent game identifier.
8. Purchase codes and student join codes are different concepts.
9. Teacher/admin auth and student/player auth are different concepts.

## Ownership boundaries

- `licensing`: purchase codes, entitlements, activation limits.
- `game-sessions`: isolated teacher-owned simulations and lifecycle.
- `auth`: teacher/player session validation and access control.
- `players`: student/player records and enrollment inside a game session.
- `economy`: ledger, balances, rewards, fines, payroll, loans later.
- `attendance`: clock-in, lateness, streaks, attendance records.
- `store`: item catalog and purchase rules.
- `inventory`: owned items, inventory events, item-use requests.
- `stocks`: stock assets, price engine, price ticks, trades, portfolios.
- `analyst`: ratings, target prices, accuracy checks, reward requests.
- `notifications`: notification jobs and delivery state.
- `audit`: audit trail for sensitive actions.
