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
