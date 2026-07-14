# Admin v606 runtime and wiring audit

## Intended architecture

1. The root login is the only administrator sign-in UI.
2. Root login authenticates with Supabase Auth, loads staff bootstrap, and lets the administrator select a game.
3. The access token and selected game ID are transferred through `sessionStorage` to `/admin/`.
4. `/admin/` validates only the transferred session locally, mounts the v606 shell, and does not display a second login.
5. One browser adapter intercepts `/api/admin/...` and forwards those requests to the isolated `admin-api` Edge Function.
6. `admin-api` verifies the bearer token, verifies staff ownership of the selected game, reads normalized admin views from Supabase, and proxies supported mutations to `classroom-api`.
7. Authentication failures redirect to the root admin login. Temporary data failures remain inside the console and do not erase a valid session.

## Runtime consolidation completed

- Removed overlapping standalone admin sign-in and proxy implementations.
- `admin-auth.js` is the single authenticated `/api/admin` runtime bridge.
- `admin/session-gate.js` validates local handoff state and no longer duplicates server bootstrap.
- Header/body-stripping identity transports and unsafe DOM UUID replacement were removed.
- The create adapter normalizes only create POSTs; non-create request bodies pass through untouched.

## Data coverage

Real Supabase-backed reads cover session bootstrap, overview, players, attendance, contracts, store, marketplace, settings, and logs. Supported player, attendance, contract, store, and settings mutations are proxied to trusted domain handlers.

## July 14, 2026 consistency audit

The branch was compared with accepted v606 commit `2a1d223c3d986fbb75f8c0b87d93c53820ef2e35` and the complete PR file inventory.

### Visual and asset drift

No unplanned generated-interface drift was found. These accepted files remain byte-identical:

- `admin/dist/admin-overview-terminal.js`
- `admin/css/admin-overview-terminal.css`
- `admin/css/page-shell.css`
- `admin/css/admin-overview-integrity.css`

Original interface SVGs, PNGs, and all five modal MP4 files remain at the paths expected by the bundle. Generic media fallback logic remains limited to content media.

### Add Player inconsistencies repaired

- Player ID / RFID card and Access Code are optional in Add Player.
- Blank values are generated immediately before submission with `crypto.getRandomValues`.
- Generated Player IDs use `PLR-XXXXXXXX`.
- Generated Access Codes use `XXXX-XXXX`.
- Ambiguous characters are excluded.
- Manually entered values are preserved unchanged.
- The authenticated request still carries the canonical nonblank identity contract expected by the backend.

### Post-create confirmation repaired

- The previous custom inline-styled credential overlay is suppressed and removed.
- Successful creation opens a bounded, responsive v606-style Player-created confirmation.
- The confirmation shows credentials once, labels generated versus custom values, supports copying, and requires acknowledgement.
- Existing-player identity changes remain in Edit Player Profile and never open the creation confirmation.
- No additional fetch or XHR wrapper was introduced.

### Validation completed

The passing browser suite covers root player login, desktop/compact/narrow layouts, original assets and videos, all create workflows, blank and manual player credentials, confirmation acknowledgement, Edit Player Profile, Player-ID-only changes, and attendance. Backend Typecheck, Admin API Check, Admin Bundle Contract Audit, and Admin Shell Smoke are required to remain green.

## Remaining intentional gaps

1. Game join code lacks a secure reset-and-one-time-display UX.
2. Net worth and overall score do not yet include all asset classes.
3. Attendance rewards issued today lacks ledger aggregation.
4. Notifications, security history, and help retain safe empty states where no production service exists.
5. Advanced contract, store, and settings mutations need live page-by-page verification.
6. Presence is session-row based rather than heartbeat based.

## Drift assessment

Current differences from accepted v606 are intentional authentication/session integration, API compatibility, restored assets, player credential UX, confirmation layout, and validation coverage. Remaining work is feature completeness and live production verification, not duplicated architecture or frontend drift.