# Admin UI V2 Players — focused contract audit

**Exact audited base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`

**Branch owner:** `refactor/admin-ui-v2-players-v1`

## Baseline ownership

- `overview`, `store`, and `market` are native V2 on the audited base.
- `players` is legacy on the audited base.
- `marketplace` remains a distinct planned route.
- No active branch or open pull request matching a Players migration was found before the owner branch was created.

## Proven contracts used

1. `GET /api/admin/games/:gameId/players` — game-scoped enhanced roster read.
2. `POST /api/admin/games/:gameId/players` — authoritative Player creation using display name, optional roster label, Player ID/RFID identifier, and Access Code.
3. `PATCH /api/admin/games/:gameId/players/:playerId/settings` — Admin metadata persistence only.
4. `POST /api/admin/games/:gameId/players/:playerId/access-code/reset` — replacement Player ID/RFID and/or Access Code while retaining omitted credential values.
5. Existing Admin BFF session, selected-game, CSRF, idempotency, AAL2, permission, rate-limit, and safe-error boundaries.

## Identity findings

- The Players roster returns a private Player resource UUID used by backend relations. V2 retains it only as an internal request key and presents route-local row keys instead.
- The roster projection does not return the current Player ID/RFID value.
- Existing Access Codes are not readable credential material.
- The credential reset route permits Player ID/RFID-only, Access-Code-only, or combined replacement. V2 therefore never needs to reveal an existing credential.
- Admin player settings are metadata and do not rename the core Player Terminal identity.

## Unsupported or intentionally unclaimed legacy concepts

The current create parser does not accept starting location, starting balance, arbitrary status, notes, owner IDs, or internal UUID fields. They are omitted from V2 creation.

No audited Admin route mutates the core Player display name/status/country assignment through the settings endpoint. V2 therefore labels those settings as Admin metadata and does not claim a Player Terminal rename or country reassignment.

Players does not absorb balance, attendance, contract, progression, inventory, business, or other route-owned workflows. The enhanced roster's flag count is retained as read-only context only.

## Backend-change decision

No existing contract was found to be broken. No Backend, database, migration, Supabase, or Player Terminal change is authorized or required for this migration.
