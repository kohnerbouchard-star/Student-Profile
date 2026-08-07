# Admin UI V2 Attendance Contract Audit

Date: 2026-08-07

## Baseline and concurrency

- Exact base SHA: `b7827211f0ff15b8a963219a63738180b33a1b3d`.
- Base is the merged Admin V2 Market commit from PR #506.
- Overview, Store, and Market are native V2 at the base.
- Attendance is legacy at the base.
- No branch named for an Attendance V2 migration existed before `refactor/admin-ui-v2-attendance-v1` was created.
- Open PR #498 mentions attendance but owns the legacy scanner modal-focus guard, not the Admin V2 Attendance route. This branch does not edit PR #498's files.

## Permission contract

`attendance.manage` is the existing route permission. The Admin security guard maps the Attendance read/write surface to that permission. V2 uses the existing shell permission boundary and a controller-level fail-closed guard.

## Read contract

The audited Admin BFF read is:

`GET /games/:gameId/attendance/today`

`handleGameRead` loads the enhanced active roster and current-day attendance for the owned game. The response includes the current attendance date, rows, status/source/check-in timestamp, notes/correction metadata, summary counts, and attendance day lock.

A proposed redundant `GET /attendance` read was rejected during implementation because `admin-api/gameRoutes.ts` does not expose that route. The V2 adapter was corrected before PR creation to use only `/attendance/today`.

## Scanner contract

The existing local Admin mutation boundary accepts:

`POST /games/:gameId/attendance/scan`

The server owns:

- player credential normalization/resolution;
- game scope;
- attendance date/timezone;
- attendance window and status;
- duplicate/replay behavior;
- record persistence;
- reward policy/currency/ledger outcome;
- audit and idempotency completion.

Legacy UI behavior audited from `admin/scanner-auto-refresh.js`:

- re-arm delay: 250 ms;
- success reset: 1,200 ms;
- error reset: 2,000 ms;
- scanner field focus is restored when ready.

Those interaction timings are preserved in V2.

## Correction and action contracts

Existing Admin/BFF writes used by V2:

- `POST /attendance/corrections` — manual statuses `present`, `late`, `absent`, `excused`;
- `POST /attendance/notes` — attendance record note;
- `POST /attendance/reward-adjustments` — ledger adjustment through the existing attendance domain;
- `POST /attendance/lock` — lock/unlock current attendance date.

No check-out operation was found in the authoritative Attendance Admin/BFF contract. It is not invented by the V2 route.

## Privacy and browser boundary

The authoritative current-day DTO contains player UUIDs. V2 consumes them only inside a private controller map used for protected mutation calls. The normalized route model removes UUIDs and uses presentation-safe row keys. Scanned credentials are not retained in rendered state.

The route uses the existing Admin BFF transport. It does not add bearer-token handling, browser Supabase access, direct Staff API access, or client-side ownership checks.

## Reward behavior

The scanner response's reward result is displayed as returned by the server. V2 does not duplicate or infer attendance reward policy. Manual reward adjustments use the already-existing server ledger operation.

## Scope conclusion

Attendance can be migrated frontend-only. No backend endpoint, database schema, persistence model, or permission model needs to change for this route migration.
