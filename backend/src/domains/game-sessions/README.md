# Game Sessions Domain

Teacher-owned simulation lifecycle code lives here.

## Structure

- `application/createGame.ts` creates a teacher-owned game session, default game settings, and audit log entry.
- `api/createGameHandler.ts` is a framework-agnostic handler for future route/runtime wiring.
- `contracts/createGameRouteContracts.ts` defines request/response DTOs for game creation.
- `contracts/normalizeCreateGameRouteBody.ts` validates and normalizes the create-game request body.
- `infrastructure/gameRepository.ts` contains the Supabase persistence adapter for `game_sessions` and `game_settings`.
- `domain/` is reserved for pure game-session lifecycle rules.
- `tests/` is reserved for domain-specific tests.

## Boundary

This domain owns teacher-created game sessions and lifecycle orchestration.

It does not own:

- player enrollment
- player access codes
- attendance
- store
- stock market
- ledger/economy
- business simulation

All live game data must remain scoped by `game_session_id`.
