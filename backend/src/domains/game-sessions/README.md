# Game Sessions Domain

Teacher-owned simulation lifecycle code lives here.

## Structure

- `application/createGame.ts` creates a teacher-owned game session, default game settings, and audit log entry.
- `infrastructure/gameRepository.ts` contains the Supabase persistence adapter for `game_sessions` and `game_settings`.
- `api/` is reserved for future thin request handlers.
- `contracts/` is reserved for future request/response DTOs and validation contracts.
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
