# Admin UI V2 Attendance Architecture

## Scope

This migration moves Attendance from the legacy Admin handoff into the existing source-owned Admin UI V2 shell. It does not redesign the Admin V2 architecture, change Attendance persistence semantics, or create a second attendance ownership model.

- Repository: `kohnerbouchard-star/Student-Profile`
- Base `origin/main`: `b7827211f0ff15b8a963219a63738180b33a1b3d`
- Branch: `refactor/admin-ui-v2-attendance-v1`
- Permission: `attendance.manage`
- Route disposition after this change: Attendance `legacy` -> `v2`

## Existing authority

Attendance remains server-authoritative. Admin V2 consumes the existing HttpOnly Admin BFF through the same `createAdminBffTransport` used by the other native V2 routes.

Authoritative read:

- `GET /api/admin/games/:gameId/attendance/today`

Authoritative writes already present in Admin/BFF:

- `POST /api/admin/games/:gameId/attendance/scan`
- `POST /api/admin/games/:gameId/attendance/corrections`
- `POST /api/admin/games/:gameId/attendance/notes`
- `POST /api/admin/games/:gameId/attendance/reward-adjustments`
- `POST /api/admin/games/:gameId/attendance/lock`

No Attendance endpoint is added by this migration. The browser does not call Supabase tables or Staff APIs directly.

## Ownership and security

The selected game remains transport/server scoped. The Admin BFF verifies session, permission, AAL2 for mutations, CSRF, rate limits, game ownership, and idempotency before authoritative writes.

The `/attendance/today` DTO contains internal player identifiers because the existing mutation contract requires a player target. Admin V2 immediately projects those rows into a presentation model without UUIDs. A private controller-only map associates an opaque V2 row key with the authoritative player UUID for protected writes. UUIDs are not placed in row labels, form values, route state, status messages, or rendered attendance data.

Scanned RFID/player credential input is cleared from the field immediately after submission and is not retained in the presentation model or scanner status.

## Read model

The source-owned route projects the current-day response into:

- attendance date and timezone;
- present, late, absent, excused, and missing summary counts;
- active roster rows;
- display name and roster label;
- attendance status;
- check-in timestamp;
- attendance source;
- notes/correction timestamp where available;
- day lock state and reason.

Long names, including Korean text, are rendered as normal text and allowed to wrap. No `innerHTML`-style interpolation is used.

## Scanner behavior

The legacy scanner interaction timing is preserved:

- scanner re-arms after 250 ms;
- success presentation resets after 1.2 s;
- failure presentation resets after 2.0 s;
- the scanner input receives focus again when it is ready;
- Enter submits the scanner form;
- duplicate/repeated scans are left to the authoritative scanner operation, whose response distinguishes newly created from already-recorded attendance.

The server remains responsible for player resolution, attendance window behavior, duplicate handling, timestamp selection, attendance reward policy, currency resolution, ledger creation, and audit/idempotency completion.

## Supported actions

The V2 route exposes only operations already implemented by the Admin API:

- scanner check-in;
- manual correction: `present`, `late`, `absent`, `excused`;
- attendance note;
- reward adjustment;
- day lock/unlock.

There is no authoritative Attendance check-out operation in the audited Admin/BFF contract. This migration therefore does not invent a check-out button or state transition.

## Data states

Attendance uses the shared Admin V2 data-state contract:

- `initial-loading`;
- `ready`;
- `refreshing`;
- `stale` after a failed refresh with prior resolved data;
- `empty` when no active roster/attendance rows exist;
- `failed` with safe retry handling when the first read fails.

Permission denial is owned by the existing shell `AdminPermissionBoundary`. Because the shell checks `attendance.manage` before calling `load()`, a denied route renders without making a protected Attendance request. The controller also fails closed if called without permission.

## Source ownership

Route-local source:

- `admin/v2/src/routes/attendance/AttendanceApi.js`
- `admin/v2/src/routes/attendance/AttendanceController.js`
- `admin/v2/src/routes/attendance/AttendanceRoute.js`
- `admin/v2/src/routes/attendance/AttendanceSkeleton.js`
- `admin/v2/styles/routes/attendance.css`

Shared edits are additive and limited to route registration, the stylesheet include, the V2 shell controller registration, and the Admin V2 test command. No other Admin route is rewritten.

## Verification evidence

See `docs/operations/evidence/admin-ui-v2-attendance/` for the focused contract audit and branch/PR verification record.
