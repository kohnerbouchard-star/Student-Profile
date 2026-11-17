# Attendance reward read boundary

Roadmap ID: `ARCH-ATTENDANCE-REWARD-READ-001`.
Status: `IMPLEMENTED_NOT_MERGED`; branch `refactor/attendance-reward-read-port` based on main `03adc6891995fe1d780fe34629b1daf14470ea39`.

## Scope and invariants

Extract the six reward policy reads from the API module into a typed `AttendanceRewardReadRepository` contract and Supabase infrastructure adapter. The application resolver consumes the port. The existing `api/attendanceRewardPolicy.ts` exports and service-client call signature remain the composition boundary, so authorized callers and derived game/player scope are unchanged.

Preserve query columns, game/player/active filters, latest-assignment and snapshot ordering/limits, error precedence and sanitized failure, active-policy/preset precedence, missing country fixed currency behavior, disabled-modifier short circuit, bounded multipliers and currency rounding. No attendance writes, economic settlement, idempotency, auth, permission, migration, routes, RPCs, browser contract or deployment change.

Runtime files: `api/attendanceRewardPolicy.ts`, `application/resolveAttendanceRewardPolicy.ts`, `contracts/attendanceRewardReadRepository.ts`, `infrastructure/supabaseAttendanceRewardReadRepository.ts`, all under `backend/src/domains/attendance/`.

The application still type-imports the existing API-owned attendance configuration shape. This bounded tranche isolates persistence, not every domain type dependency. Existing authorization remains upstream, not newly implemented here.

## Qualification

- Existing seven reward arithmetic/policy tests retained. Eleven new port/adapter tests are added directly to the existing registered test module: 18/18 pass with checked frozen Deno configuration.
- Added exact query-chain assertions for all six reads; all six database failure positions fail closed without leaking database messages; policy branches verify read short circuits, currency resolution and rounding.
- Backend core TypeScript passes.
- Generated inventory: persistence outside infrastructure 84 to 83; source files 1636 to 1639; lexical compatibility candidates 209 to 210 due preserved/split policy strings and composition text. No ratchet ceilings change.
- Independent source review found no blocking behavior/security/failure finding; focused tests independently passed. Initial root ratchet caught an extra lexical marker from a separate test module; tests were consolidated into the existing registered file without dropping assertions or changing ceilings. Final root/Edge/smoke qualification pending. No hosted, staging, database integration or production verification claimed.

No active attendance reward policy owner was found in the open-PR audit. Teacher timing #1002 and roster #933/#938 do not overlap this runtime slice. Broad stale attendance donor edits are not imported. Next: finish independent review/local qualification, publish a bounded draft and bind actual-number exact-head checks before considering merge. Broader attendance authorization/context refactors remain separate.
