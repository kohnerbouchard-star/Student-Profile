# Game Domain

Backend-only game lifecycle services live here.

## Current checkpoint

`createGame.ts` provides Game Creation Service V1.

It creates:

- one `game_sessions` row owned by a verified staff user
- one default `game_settings` row for that game
- one audit log entry for the creation event

## Security boundary

This service expects `ownerStaffUserId` to come from a trusted backend access path, not directly from frontend input.

Future route wiring should resolve the teacher through the staff access boundary first, then pass the verified `staffUserId` into `createGame`.

## Not included yet

This checkpoint does not add:

- frontend wiring
- public routes
- player roster creation
- player access codes
- player login/session issuance
- attendance
- store
- stock market
- ledger services
- business simulation
