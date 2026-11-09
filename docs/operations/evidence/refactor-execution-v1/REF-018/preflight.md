# REF-018 preflight — Staff Attendance persistence extraction

Date: 2026-10-01
Base main: `51f592cccaa10c7436d0a8ecc9a85b19332fccc2`
Owner branch: `refactor/ref-018-staff-attendance-persistence`
Status: IN_PROGRESS
Risk: R3
Dependency: REF-016 VERIFIED_COMPLETE

## Selected seam

Application owner: `backend/src/domains/attendance/application/recordAttendanceForAuthorizedStaff.ts`.

Direct persistence currently selected for extraction:
- scanner replay RPC `admin_read_mutation_replay_v1`;
- normalized game-scoped active Player lookup;
- current-version active credential lookup, then legacy SHA-256 credential fallback;
- game-scoped Player fetch after credential resolution;
- game-scoped `game_settings.attendance_window` read;
- atomic `admin_record_attendance_v1` invocation.

Reward-policy persistence remains owned by `attendanceRewardPolicy.ts` and is not selected for relocation.

## Frozen transaction and identity contract

`admin_record_attendance_v1` remains the sole Staff Attendance mutation boundary. It owns admin-mutation idempotency, attendance-day locking, game/player validation, attendance-lock enforcement, manual correction or scanner clock-in, scanner reward/ledger posting through `private.record_attendance_clock_in_core_v1`, and completion/audit receipt. The extraction may wrap/inject this RPC but may not split it.

The application passes the already authorized `gameSessionId` and `staffUserId`; scanner input is only a lookup value. The persisted Player UUID must remain the server-resolved, game-scoped ID. Request identity remains `idempotencyKey` plus `requestId`. Scanner request fingerprint remains operation + peppered lookup digest + normalized device timezone only; derived date/status/reward values remain outside the fingerprint.

## Frozen behavior

- replay is checked before mutable roster/settings/policy reads;
- normalized Player identifier is tried first;
- current `pbkdf2-sha256-v2` active credential digest is tried before legacy `sha256-v1`;
- credential material is not returned or forwarded to the mutation;
- only active Players are accepted for scanner operation;
- attendance window determines timezone, cutoff and base reward;
- reward policy remains in its current owner;
- scanner mutation sends resolved Player ID, date/status, effective reward/currency and response context;
- manual correction keeps reward/currency null;
- database/idempotency/locked-period failures retain existing public error mapping.

## Ownership and exclusions

Open PR #668 has no selected Attendance/application path overlap at this checkpoint. No Player clock-in implementation, SQL/migration/RPC definition, scanner UI, reward formula, timezone policy, authentication/context owner, production deployment, hosted database mutation, or REF-019 work is authorized.

## Planned bounded implementation

Introduce a narrow Attendance repository contract and Supabase adapter using the existing request-scoped client. Move database-specific scanner lookup/window/replay and atomic mutation invocation behind that boundary while retaining policy decisions and response translation in the application owner. Preserve dependency injection for focused tests.

Target meaningful paths remain within the task budget of twelve. If atomicity requires SQL changes or approved context semantics cannot be preserved, stop rather than widening scope.

## Required qualification

Focused Attendance tests must cover manual parity, present/late scans, replay short-circuit, normalized/current/legacy lookup order, missing/inactive player, invalid policy/read failures, transaction failure, same-key conflict/in-progress behavior, and duplicate/concurrent scan safety. Then run the task-required backend Admin local mutation, Player security, economic ledger invariant, Admin API, Attendance/race, root economic and architecture checks plus all applicable exact-head CI.

## Missing database qualification follow-up — 2026-10-01

Repository baseline: `67d29d4fe1dc51aa48143ed8143c0a8d589b2828` (merged #770).
Inspection of the original qualification established that its disposable database
harnesses exercised Contracts/Store, not the selected Staff Attendance seam.
REF-018 must not receive database/race acceptance credit from those harnesses.

This bounded follow-up adds only:
- `scripts/ref-018-attendance-acceptance.ts`;
- `.github/workflows/ref-018-attendance-qualification.yml`;
- this existing preflight record.

The original eight implementation/evidence paths plus these two new paths are
ten unique paths; any later PR authority or completion artifact must remain
within the twelve-path budget. No application, repository contract, SQL migration,
reward policy, scanner UI, Player clock-in, credential or production change.

The harness uses the unchanged scanner application, repository and atomic RPC
with a real local PostgreSQL service-role transport. It creates synthetic fixtures
only at `localhost`/`127.0.0.1:54322/postgres`, requires an explicit disposable flag,
rejects connection-option overrides, and never reads production secrets. It tests
same-key replay/conflict, concurrent same-key and different-key same-player/day
scans, exact single reward/attendance effects, locked-period denial, and rollback
of all game-scoped state including private replay receipts. Concurrent submissions
must both be observed waiting on real database locks before they are released.
A transient, fixture-game-scoped audit trigger raises inside the real RPC after
attendance/reward writes; it is removed in cleanup, not committed as a migration.
A same-key retry must succeed after rollback without an extra reward.

The new exact-head PR/main workflow preserves existing gates, starts disposable
Supabase (initial migration replay), resets it from zero, executes the focused
application suites and harness, lints the database, checks architecture limits,
and uploads `/tmp/ref018/` evidence. No hosted environment or manual dispatch.
Local source/type checks are separate from database acceptance. Docker and psql
are unavailable in the current workspace; database/race acceptance remains
NOT_RUN until this exact candidate passes the new workflow and its artifact is
inspected. No REF-019 work or production certification is included.
