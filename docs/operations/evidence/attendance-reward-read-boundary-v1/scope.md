# Attendance reward read boundary

Roadmap ID: `ARCH-ATTENDANCE-REWARD-READ-001`.
Status: `IMPLEMENTED_NOT_MERGED`; draft [PR #1009](https://github.com/kohnerbouchard-star/Student-Profile/pull/1009), branch `refactor/attendance-reward-read-port` based on main `03adc6891995fe1d780fe34629b1daf14470ea39`.

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
- Independent source review found no blocking behavior/security/failure finding; focused tests independently passed. Initial root ratchet caught an extra lexical marker from a separate test module; tests were consolidated into the existing registered file without dropping assertions or changing ceilings. Final root `npm test` passes. Full Edge fails at unchanged frozen Supabase 2.108.2 SDK download (connection refused); smoke also fails at the same SDK download and is not an aggregate pass. No hosted, staging, database integration or production verification claimed.

No active attendance reward policy owner was found in the open-PR audit. Teacher timing #1002 and roster #933/#938 do not overlap this runtime slice. Broad stale attendance donor edits are not imported. Next: finish independent review/local qualification, qualify draft #1009 against its actual-number exact-head checks before considering merge. Broader attendance authorization/context refactors remain separate.

Actual-number authority locks eleven changed paths plus two read-only verifier files. CI contract records 30 workflow families,64 active tuples,four guarded skips; no matrix or workflow changes. Source reviewed at local `58f73ca02`, published identical tree `5da452242cef35dc3788dd4f62a524819af07b80` at `1d8ad3150a1d9335c42a04c66ce62473ac40e4fc`. Final metadata review and hosted qualification pending.

## Hosted correction tranche

Hosted Edge checks of `29ec5310` reported six TS2352 errors in the new adapter because its generic Supabase row is not structurally assignable to the named result row. Restore the original explicit unknown-to-row boundary in the infrastructure adapter, rather than weakening the typed application port. All six query chains and result/error identities remain unchanged. Direct no-config Deno adapter checking and the checked frozen 18-case suite pass; inventory is byte-identical.

The connected Roster gate also correctly rejected `runtime-head-projection-drift`: its integrated source pin still selected pre-refactor `60a08987`. Preserve the verifier, workflow and exact runtime projection. After independent review, pin both integrated roles to the same published complete corrected candidate SHA/tree, followed by a pin-only harness commit. The added `scripts/roster-connected/sources.json` authority path is the only scope expansion; no relaxed exclusions, bypasses or assertions. Re-derived full scope remains 30 families/64 active jobs/four guarded skips. Exact pin identity lives in the source manifest; fresh final-head hosted qualification is mandatory. Prior green local source tests do not negate the hosted type failure.
