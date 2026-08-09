# Admin UI V2 Logs

## Status

- Route: `logs`
- V2 disposition: source-owned
- Permission: `audit.read`
- Selected-game scope: required
- Interaction model: read-only
- Backend redesign: none

## Authoritative contracts audited

The migration uses the existing Admin audit read path only:

- `GET /api/admin/games/:gameId/logs`
- implementation: `backend/supabase/functions/admin-api/gameRoutes.ts`
- query/read model: `backend/supabase/functions/admin-api/logs.ts`
- authorization: `backend/supabase/functions/admin-api/adminSecurityGuard.ts`

The backend read contract already provides game scoping, descending timestamp ordering, exact-count pagination, and these supported query parameters:

- `page`
- `pageSize` / `limit`
- `eventId`
- `action`
- `actorType`
- `targetType`
- `search` / `q` (action substring search)
- `startAt` / `from`
- `endAt` / `to`
- `flagged`

V2 intentionally exposes the safe subset needed for a general audit/operational browser: page, page size, action search, exact action, actor type, target/resource type, start time, and end time. The UI does not expose raw event-ID filtering because event IDs are internal UUIDs.

The existing backend also contains related-record reads, raw CSV export, and audit-log flag review mutations. Those contracts are not surfaced by this migration. The requested V2 Logs surface is read-only, and the current CSV serializer contains raw actor/target identifiers plus serialized metadata. Surfacing that export would violate the V2 redaction boundary.

## Security and privacy boundary

The authoritative backend DTO contains fields that are useful to backend operators but are not appropriate to render in the browser. The V2 normalization boundary therefore drops, rather than hides with CSS, all of the following before the route model reaches the DOM:

- audit event UUIDs;
- actor IDs;
- target/resource IDs;
- related-record IDs;
- staff review IDs;
- flag record IDs and flag mutation state;
- ownership identifiers;
- credentials, tokens, secrets, cookies, authorization material, MFA/OTP/recovery material;
- service-role values;
- SQL/query fields and SQL-shaped values;
- backend stack traces or stack-shaped values;
- nested/malformed metadata objects that cannot be represented as safe scalar display values.

Metadata is allow-by-shape and deny-by-sensitivity. At most eight safe entries are retained per event. Values may be strings, finite scalar values, booleans, or short arrays of safe scalars. Object values are discarded rather than stringified. Strings containing UUIDs, JWT-shaped values, authentication material, SQL-shaped diagnostics, or stack-trace patterns are discarded.

This is a presentation/redaction boundary, not a new audit source of truth. The route never reads `audit_log` directly and never uses browser-readable privileged credentials.

## Display model

Each normalized V2 row contains only:

- `rowKey`: synthetic page/index key with no backend identifier;
- `timestamp`: validated ISO timestamp;
- `actor`: presentation derived from authoritative `actorType` only;
- `action`: authoritative action string after unsafe-text screening;
- `target`: presentation derived from authoritative `targetType` only;
- `category`: safe explicit metadata category when present, otherwise the action namespace, then target type;
- `outcome`: safe `outcome`, `status`, `result`, or boolean `success` metadata when present; otherwise `Not reported`;
- `metadata`: sanitized scalar metadata entries.

Category and outcome do not create new game semantics. They are display projections of existing authoritative fields and explicitly fall back when the backend does not report a value.

## API ownership

`admin/v2/src/routes/logs/LogsApi.js` is a route-local, read-only adapter layered on the same V2 `createAdminBffTransport` instance as the other migrated Admin routes. It issues only `GET` requests to the scoped Admin BFF. It has no update, delete, flag, export, CSRF, or idempotency operation.

Transport/backend failures are normalized through the shared Admin V2 safe error envelope. Backend error messages, SQL, stack traces, and arbitrary diagnostic details are never forwarded to route rendering.

## State model

`LogsController` uses the shared six-state Admin data model:

- initial loading;
- ready;
- refreshing;
- stale resolved data after failed refresh;
- empty;
- failed initial read.

Permission is checked before the protected read. Without `audit.read`, the controller does not call the Logs API and the shell renders the shared permission boundary.

## Filtering and pagination

Filtering is server-owned. Applying filters resets the page to 1 and issues a fresh scoped read. Pagination uses the server-provided page, page size, total, total pages, and previous/next booleans. The route does not pretend to search records outside the loaded server page.

The search field is labeled `Search action text` because the current authoritative `search` contract applies substring matching to the `action` column only.

## Responsive and accessibility behavior

The route uses the shared V2 page frame, fields, data table, empty/error/stale states, and buttons. The data table retains its keyboard-focusable horizontal scroll region. Route-level CSS prevents document-width overflow while allowing the table itself to scroll horizontally on narrow screens. Filter and summary grids collapse at tablet/mobile widths, and pagination controls stack on small screens.

Long Latin/Korean values use `overflow-wrap: anywhere`; malformed values are dropped rather than coerced to `[object Object]`.

## Scope exclusions

This migration does not:

- modify `audit_log` schema or write semantics;
- add audit log editing or deletion;
- expose flag/review mutation controls;
- expose raw CSV export;
- expose internal IDs to support deep links;
- add direct Supabase/table access;
- change Overview, Store, or Market ownership or behavior;
- migrate any route other than Logs.
