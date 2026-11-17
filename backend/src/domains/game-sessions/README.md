# Game Sessions Domain

Teacher-owned simulation lifecycle code lives here.

## Structure

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

Live Admin creation uses adminGlobalRoutes and gameProvisioningOperations with licensing activation. The uncalled pre-licensing adapter is retired; the unused standalone creator and its repository are now retired too.

The retired pre-licensing route DTOs and body parser are also removed. Live request validation remains owned by licensing activation, not by the retired standalone application helper.
