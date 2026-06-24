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

## V1 Core Loop Rules

1. V1 has one teacher role and one player role.
2. V1 does not use platform users, support teachers, assistant teachers, or developer app roles.
3. V1 does not use `game_staff`.
4. A teacher owns a game through `game_sessions.owner_staff_user_id`.
5. `game_sessions.id` is the isolation boundary between games.
6. Student-private data requires both `game_session_id` and `player_id`.
7. Student login uses `game_join_code + student_code`.
8. Student codes must not duplicate among active players inside the same game session.
9. Internal IDs must be database-generated UUIDs, not typed user codes.
10. All live simulation data must be scoped by `game_session_id`.
11. Global templates may exist, but live game state must be copied or scoped per game.
12. All money movement must go through economy/ledger.
13. Cross-domain actions must be coordinated through application use-cases.
14. `game_settings` owns configurable simulation windows.
15. Audit logging is required for sensitive actions from the beginning.
16. Future SQL migrations must preserve the core loop, game-session isolation, student data isolation, and ledger contracts.

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
- `game-dashboard`: player-safe consolidated game screen snapshots and future game-public realtime contracts.
- `analyst`: ratings, target prices, accuracy checks, reward requests.
- `notifications`: notification jobs and delivery state.
- `audit`: audit trail for sensitive actions.
