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
- `admin/admin-auth.js` is now the single runtime bridge for:
  - reading the transferred session;
  - checking expiry;
  - reading the selected game ID;
  - mounting the v606 shell;
  - attaching auth and game headers;
  - forwarding `/api/admin/...` to `admin-api`;
  - sign-out and reauthentication redirects.
- `admin/session-gate.js` now validates only local handoff state and exposes explicit `release()` and `showError()` controls.
- The gate no longer performs server bootstrap and no longer leaves an opaque blocking screen after a startup failure.

## Current backend-for-frontend coverage

The isolated `admin-api` currently serves real Supabase-backed reads for:

- session bootstrap and game list;
- overview/dashboard;
- players and leaderboard inputs;
- attendance for the current day;
- contracts and contract progress;
- store items and purchase aggregates;
- marketplace assets, charts, fundamentals, trades, and market events;
- settings;
- audit logs;
- account profile stubs, notifications empty state, and help empty state.

It proxies supported writes to `classroom-api` for:

- player creation;
- player access-code reset;
- attendance scans;
- contract creation;
- store item mutations;
- settings mutations.

## Confirmed non-placeholder sources

- Players: `players`, `account_balances`, `player_country_assignments`, `country_profiles`, `player_sessions`.
- Attendance: `player_attendance_records`.
- Contracts: `game_session_contracts`, `player_contract_progress`.
- Store: `store_items`, `store_purchases`.
- Marketplace: `game_session_stock_assets`, `stock_price_ticks`, `stock_trades`, `stock_market_events`.
- Settings: `game_settings`, `game_difficulty_policy_settings`.
- Logs: `audit_log`.

## Remaining intentional gaps and simplifications

1. **Game join code**
   - Only a hash is stored, so the plaintext code remains blank.
   - A separate secure reset-and-display flow is still required.

2. **Net worth / overall score**
   - The current leaderboard uses cash balance as the temporary score and net-worth value.
   - It does not yet include stock holdings, inventory valuation, or other asset classes.

3. **Attendance rewards issued today**
   - The attendance read model currently returns an empty attendance ledger.
   - Reward ledger aggregation should be added from `ledger_entries`.

4. **Notifications, security history, and help articles**
   - These endpoints return safe empty states because no corresponding production schema/service has been implemented.

5. **Contract write completeness**
   - Basic contract creation is proxied.
   - Publish, progress review, reward issuance, editing, and archival must be verified against the exact v606 actions.

6. **Store and settings mutations**
   - Routes are proxied, but each v606 action still requires live contract testing to confirm request-body compatibility.

7. **Presence**
   - A player is marked online when an active `player_sessions` row exists.
   - This is not yet a heartbeat-based presence model.

## Drift assessment

The data direction is correct: a dedicated admin read model over the existing Supabase domain tables, with trusted writes delegated to `classroom-api`.

The runtime had drifted because the removed standalone login logic and two fetch adapters remained active simultaneously. This branch removes that drift.

The remaining gaps are feature completeness and metric accuracy, not architectural duplication. They should be addressed incrementally after live page-by-page testing rather than by adding another authentication or proxy layer.
