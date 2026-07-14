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

- Removed the standalone sign-in, account creation, and game-selection implementation from `admin/admin-auth.js`.
- Removed `admin/admin-api-base.js`, which was a second overlapping fetch wrapper.
- `admin/admin-auth.js` is now the single runtime bridge for transferred session validation, shell mounting, authenticated forwarding, sign-out, and reauthentication redirects.
- `admin/session-gate.js` validates only local handoff state and exposes explicit `release()` and `showError()` controls.
- The gate no longer performs server bootstrap and no longer leaves an opaque blocking screen after a startup failure.

## Current backend-for-frontend coverage

The isolated `admin-api` currently serves real Supabase-backed reads for session bootstrap, overview, players, attendance, contracts, store, marketplace, settings, logs, and safe account/notification/help states.

It proxies supported writes to `classroom-api` for player creation, player access-code reset, attendance scans, contract creation, store item mutations, and settings mutations.

## Confirmed non-placeholder sources

- Players: `players`, `account_balances`, `player_country_assignments`, `country_profiles`, `player_sessions`.
- Attendance: `player_attendance_records`.
- Contracts: `game_session_contracts`, `player_contract_progress`.
- Store: `store_items`, `store_purchases`.
- Marketplace: `game_session_stock_assets`, `stock_price_ticks`, `stock_trades`, `stock_market_events`.
- Settings: `game_settings`, `game_difficulty_policy_settings`.
- Logs: `audit_log`.

## July 14, 2026 consistency audit

The branch was compared with accepted v606 commit `2a1d223c3d986fbb75f8c0b87d93c53820ef2e35` and the complete PR file inventory.

### Visual and asset drift

No unplanned generated-interface drift was found. These accepted files remain byte-identical:

- `admin/dist/admin-overview-terminal.js`
- `admin/css/admin-overview-terminal.css`
- `admin/css/page-shell.css`
- `admin/css/admin-overview-integrity.css`

Original interface SVGs, PNGs, and all five modal MP4 files remain at the paths expected by the bundle. Generic media fallback logic remains limited to content media.

### Add Player inconsistencies found and repaired

1. **Required-versus-generated contradiction**
   - The v606 workflow described Player ID and Access Code as generated while the integration marked both inputs required.
   - Both fields are now optional in Add Player.
   - Blank values are populated immediately before submission using `crypto.getRandomValues`.
   - Generated Player IDs use `PLR-XXXXXXXX`; generated Access Codes use `XXXX-XXXX`, excluding visually ambiguous characters.
   - The backend still receives and validates the canonical nonblank identity contract.

2. **Manual credential preservation**
   - A manually entered Player ID or Access Code is sent unchanged.
   - Each field can be generated independently when only one is blank.

3. **Post-create credential UX**
   - The previous custom inline-styled credential overlay was inconsistent with the v606 interface.
   - It is suppressed and removed.
   - Successful creation now opens a bounded, responsive v606-style `player-created-confirmation` modal.
   - The modal shows the credentials once, distinguishes generated and custom values, supports copying, and requires explicit acknowledgement.

4. **Existing-player isolation**
   - Existing-player identity changes remain in Edit Player Profile.
   - Those changes do not open the Player-created confirmation.
   - No additional fetch or XHR wrapper was introduced.

### Validation coverage

The browser suite verifies desktop, compact, and narrow layouts; original assets and videos; all create workflows; blank and manual player credentials; the Player-created confirmation; Edit Player Profile; Player-ID-only updates; player login; and attendance. Static and backend checks cover source contracts, API normalization, bundle contracts, and TypeScript.

## Remaining intentional gaps and simplifications

1. **Game join code** — only a hash is stored; a secure reset-and-display flow is still required.
2. **Net worth / overall score** — cash balance remains the temporary score and does not include all asset classes.
3. **Attendance rewards issued today** — ledger aggregation from `ledger_entries` is not yet implemented.
4. **Notifications, security history, and help articles** — safe empty states remain where no production service exists.
5. **Contract write completeness** — advanced publish, review, reward, edit, and archive actions still require live verification.
6. **Store and settings mutations** — each v606 action still requires live request-body verification against production.
7. **Presence** — online status is session-row based rather than heartbeat based.

## Drift assessment

The architecture remains a dedicated admin read model over existing Supabase domain tables with trusted writes delegated to `classroom-api`.

Current differences from accepted v606 are intentional authentication/session integration, API compatibility, restored assets, player credential UX, confirmation layout, and validation coverage. Remaining work is feature completeness and metric accuracy, not duplicated authentication or proxy architecture.