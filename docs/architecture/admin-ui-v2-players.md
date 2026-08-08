# Admin UI V2 — Players

**Owner branch:** `refactor/admin-ui-v2-players-v1`

**Exact base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`

**Permission:** `players.manage`

**Status:** `IMPLEMENTED_NOT_MERGED`

**Production promotion authorized:** No

## Purpose

This tranche migrates **Players** from the legacy Admin handoff into the existing source-owned Admin V2 shell. It does not redesign the Admin V2 application, change the global navigation taxonomy, modify the backend, database, Supabase schema/functions, Player Terminal, or any other Admin route.

At the end of this tranche the native source-owned V2 routes are exactly **Overview, Store, Market, and Players**. Marketplace remains a separate planned destination and is not merged into Market.

## Route boundary

| Destination | Disposition after this tranche |
|---|---|
| `/admin/v2.html#overview` | Native V2, unchanged |
| `/admin/v2.html#store` | Native V2, unchanged |
| `/admin/v2.html#market` | Native V2, unchanged |
| `/admin/v2.html#players` | Native V2, owned by `admin/v2/src/routes/players/**` |
| `/admin/` | Legacy Admin retained independently |
| Every other Admin V2 destination | Existing `legacy` or `planned` disposition unchanged |

`admin/v2/src/core/navigation-registry.js` changes only the Players migration disposition from `legacy` to `v2`. `admin/v2/src/app.js` adds only the Players controller to the existing route-controller composition boundary.

## Authoritative Players contracts

All browser paths below are same-origin `/api/admin` paths. The existing HttpOnly Admin BFF remains the only browser transport. The V2 route does not call the Staff API, Classroom API, Supabase, or database directly.

| Operation | Existing method and path | V2 use |
|---|---|---|
| Roster read | `GET /api/admin/games/:gameId/players` | Authoritative game-scoped roster, presence, flags summary, and Admin settings projection |
| Create Player | `POST /api/admin/games/:gameId/players` | Create dialog |
| Save Admin profile metadata | `PATCH /api/admin/games/:gameId/players/:playerId/settings` | Administrative profile edit |
| Replace Player ID/RFID and/or Access Code | `POST /api/admin/games/:gameId/players/:playerId/access-code/reset` | Protected credential update |

The private Player UUID returned by the roster is retained only as a controller/API request key. It is never rendered as visible text, an accessible name, a title, a presentation `data-*` value, or a form value. Table rows use route-local opaque keys such as `player-row-1`.

### Creation contract

The current authoritative create parser accepts exactly:

- `displayName` — required;
- `rosterLabel` — optional;
- `playerIdentifier` — required Player ID/RFID-facing identifier; and
- `accessCode` — required initial Player credential.

The V2 create form intentionally does not expose legacy-looking fields such as starting location, starting balance, notes, ownership identifiers, or arbitrary status because they are not part of the authoritative create parser.

### Administrative settings versus Player Terminal identity

The existing `players/:playerId/settings` route persists a JSON Admin-settings record. It does **not** mutate the core `players.display_name`, core account status, or country-assignment authority used by Player Terminal.

Accordingly, V2 labels these fields explicitly as **administrative profile metadata**:

- Admin display name;
- Admin status label;
- Admin country assignment; and
- Admin note.

The UI does not claim that these settings rename the Player Terminal account or change country ownership. No unsupported core rename/status/country mutation is invented.

### Player ID, RFID, and Access Code

The authoritative access-code reset contract accepts `playerIdentifier`, `accessCode`, or both. When one field is omitted, the backend retains the corresponding current credential state. This allows V2 to offer independent replacement operations without reading existing credentials.

The current roster projection does not expose the Player ID/RFID value, and existing Access Codes are non-readable credential material. Therefore:

- current Player ID/RFID is not displayed or prefilled;
- current Access Code is never displayed or prefilled;
- the credential dialog starts blank;
- at least one replacement value is required;
- Player ID/RFID validation follows the existing `A-Z`, `0-9`, colon, underscore, hyphen, 128-character contract; and
- Access Code validation follows the existing letters/numbers/hyphen, 128-character contract.

## Security and ownership boundary

- Route access requires `players.manage` from the authenticated Admin session.
- The application permission boundary is evaluated before the Players controller is loaded; a denied route issues no protected Players request.
- The selected game remains the existing session-validated game context. The browser does not send arbitrary owner IDs.
- Reads and mutations use the existing scoped Admin BFF transport with `credentials: "include"`; browser-readable Staff bearer tokens are not accepted or forwarded.
- Mutations require the existing authenticated/unexpired session, CSRF token, selected-game header, device binding, and `Idempotency-Key` contract.
- Backend AAL2, permission, ownership, rate limit, audit, credential hashing, session revocation, and idempotency behavior remain authoritative and unchanged.
- Raw SQL, Supabase, service-role, function, stack, environment, and exception details are normalized through the shared Admin safe-error envelope before rendering.

## V2 ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/players/PlayersController.js` | Six-state lifecycle, authoritative roster normalization, search/filter state, private request keys, mutation lifecycle, idempotency, refresh, cancellation |
| `admin/v2/src/routes/players/PlayersRoute.js` | Page composition, responsive roster, selection/detail drawer, dialogs, safe state presentation |
| `admin/v2/src/routes/players/PlayerForms.js` | Authoritative create, Admin-profile, and credential form validation |
| `admin/v2/src/routes/players/PlayersSkeleton.js` | Shape-accurate initial loading state |
| `admin/v2/src/api/admin-api-client.js` | Exact Players paths, response validation, field allow-lists, safe errors, mutation request deduplication |
| `admin/v2/styles/routes/players.css` | Players-only responsive layout and presentation |

The route reuses the existing Admin V2 `AdminPageFrame`, `AdminDataTable`, `AdminDrawer`, `AdminDialog`, `AdminField`, `AdminValidationSummary`, `AdminEmptyState`, `AdminErrorState`, `AdminStaleState`, `AdminSkeleton`, icons, permission boundary, BFF transport, and toast. No new global shell primitive is introduced.

## State model

Players uses the existing six-state contract without a parallel state machine:

| Shared state | Players behavior |
|---|---|
| `initial-loading` | Shape-accurate skeleton; no fabricated roster |
| `ready` | Authoritative roster, filters, detail, and supported actions |
| `refreshing` | Last valid roster remains visible with non-blocking progress |
| `stale` | Last valid roster remains visible with safe retry after refresh failure |
| `empty` | Truthful zero-Player state with Add Player action |
| `failed` | Safe normalized error and retry where allowed |

The route supports zero, one, and 40-plus Player rosters, long names, Korean/non-ASCII content, search, account-status filtering, session-presence filtering, selection/detail, and responsive desktop/tablet/mobile layouts.

## Deliberately omitted controls

This migration does not invent or overstate capabilities. It omits:

- direct core Player Terminal rename/status mutation because no authoritative route exists in the audited Admin boundary;
- direct country ownership/assignment mutation from Players because that authority is separate from Admin profile metadata;
- reading or revealing current Access Codes;
- reading or revealing the current Player ID/RFID value from a roster projection that does not return it;
- private/internal Player UUID controls;
- legacy-looking create fields not accepted by the current create parser; and
- balance/ledger, attendance, contracts, progression, business, inventory, or other domain controls that belong to other Admin routes.

Read-only flag counts already returned by the authoritative Players projection may be shown as roster context; this tranche does not absorb unrelated investigation, ledger, or domain-management workflows into Players.

## Verification contract

Focused verification for this tranche covers:

- exact route migration status: Overview + Store + Market + Players native V2, Marketplace still separate;
- exact Players Admin API paths and field allow-lists;
- permission denied with zero protected Players requests;
- zero, one, and 40-plus Player datasets;
- long and Korean/non-ASCII names;
- search/filter behavior;
- detail drawer selection;
- supported create, administrative-profile edit, and protected credential replacement;
- no private Player UUID in presentation fields or exposed DOM attributes;
- safe failed/retry and stale behavior with raw backend diagnostics suppressed;
- desktop, tablet, mobile, and small-mobile overflow behavior;
- unchanged Overview, Store, and Market unit/browser regressions;
- authentication/BFF boundaries;
- JavaScript syntax, diff whitespace, secret scan, and Vercel build/preview checks.

Evidence is stored under `docs/operations/evidence/admin-ui-v2-players/`. This tranche does not merge or promote production.
