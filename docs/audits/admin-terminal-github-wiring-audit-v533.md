# Econovaria GitHub Codebase Wiring Audit — Admin Frontend to Backend

Date: 2026-07-02  
Repository: `kohnerbouchard-star/Student-Profile`  
Branch inspected: `main`

## Executive conclusion

The GitHub repository currently has a strong Supabase backend foundation, but the new admin terminal frontend package is not yet integrated into the repo. The frontend checked into GitHub is still primarily the player-facing runtime loaded from `index.html`.

The backend already exposes many staff/admin routes through `classroom-api`, including players, attendance, store catalog, contracts, join code reset, game settings, initial balance seed, ledger adjustment, and player stock routes. The integrated frontend only wires part of that.

The correct next step is to land the accepted admin frontend package into the repo as a real source tree, add a thin backend adapter layer, and then wire pages one at a time.

## Important baseline decision

Use the accepted admin terminal package work through the Marketplace/UI cleanup and options-in-order-ticket behavior, but do not carry forward the Settings experiments.

Recommended frontend baseline:

1. Admin terminal visual/UI baseline: `v527`.
2. Preserve `v529` Marketplace options-in-order-ticket behavior.
3. Do not preserve `v528`, `v530`, or `v531` Settings work.
4. Settings is paused.

## GitHub repo state

The current root `index.html` loads the player-facing runtime, not the admin terminal package. The login mode tab area contains only `Player`, and only the `playerPane` form is present in the checked-in HTML. The sidebar navigation is also player-facing: Overview, Store, Portfolio, Trading, Market Data, Forecasts.

`auth.js` still tries to bind `adminForm` and `createForm` submit handlers, but the checked-in `index.html` does not include those forms. That means admin auth code exists but is unreachable from the current DOM.

## Backend route inventory found

The Supabase Edge Function `classroom-api` is the primary backend entry point.

### Player routes

- `POST /players/login`
- `GET /players/me`
- `GET /players/me/game/dashboard`
- `GET /players/me/store/items`
- `POST /players/me/store/quote`
- `GET /players/me/store/purchases`
- `POST /players/me/store/purchases`
- player contracts routes
- `GET /players/me/stocks/portfolio`
- `GET /players/me/stocks/holdings`
- `GET /players/me/stocks/orders`
- `POST /players/me/stocks/orders`
- `GET /players/me/stocks/trades`
- `GET /players/me/ledger`

### Staff/admin routes

- `GET /staff/bootstrap`
- `POST /staff/signup`
- `POST /licensing/activate`
- game join code reset routes
- game settings routes
- `GET /games/:gameSessionId/players`
- `POST /games/:gameSessionId/players`
- reset player access code route
- `GET /games/:gameSessionId/attendance`
- `POST /games/:gameSessionId/attendance/scan`
- initial balance seed route
- staff player ledger history route
- staff ledger adjustment route
- staff store catalog routes
- staff contract routes
- demo storyline initialization route

## Frontend/backend wiring audit

### Player login and dashboard

Status: mostly wired for the player runtime.

Frontend uses `/players/login`, `/players/me`, and `/players/me/game/dashboard?gameSessionId=...`.

Risk: this is player runtime wiring, not the new admin terminal.

### Store purchase

Status: player store purchase is now Supabase-wired.

The older audit document saying Store is not migrated is stale. Player store now loads items, creates quotes, and completes purchases through `/players/me/store/...` routes.

Admin Store should use staff catalog routes, not player purchase routes.

### Stock trading

Status: not correctly wired.

Current frontend still submits legacy `submitAction("STOCK_TRADE", { action, ticker, shares })`.

Supabase trading expects:

```json
{
  "gameSessionId": "...",
  "stockAssetId": "...",
  "side": "buy",
  "quantity": 1,
  "idempotencyKey": "..."
}
```

Backend currently accepts only `side = buy | sell`. It does not support shorts, options, stop loss, stop limit, or option-contract payloads yet.

Required fix:

- Add `callPlayerStockOrderApi()` frontend helper.
- Use `currentSession.gameSessionId`.
- Resolve selected asset to `stockAssetId`.
- Generate `idempotencyKey`.
- Restrict executable order UI to backend-supported sides until backend supports advanced instruments.

### Player roster/admin players

Backend exists:

- `GET /games/:gameSessionId/players`
- `POST /games/:gameSessionId/players`
- reset player access code route

Needed adapter:

- `listPlayers(gameSessionId, staffToken)`
- `createPlayer(gameSessionId, staffToken, { displayName, rosterLabel })`
- `resetPlayerAccessCode(gameSessionId, playerId, staffToken)`

### Attendance

Backend exists:

- `GET /games/:gameSessionId/attendance`
- `POST /games/:gameSessionId/attendance/scan`

Needed adapter:

- `getAttendanceDaily(gameSessionId, staffToken)`
- `scanAttendance(gameSessionId, staffToken, input)`

The frontend scanner UI should not invent rewards. Backend is source of truth.

### Store catalog/admin store

Backend and partial frontend helpers exist:

- `listAdminStoreItems`
- `createAdminStoreItem`
- `updateAdminStoreItem`

Wire the admin Store page to these helpers. Rewards should remain system-issued and should not draw from Store stock.

### Contracts

Backend route parser supports:

- list/create staff contracts
- publish
- progress
- review progress
- issue rewards

Needed adapter:

- `listContracts(gameSessionId, staffToken)`
- `createContract(gameSessionId, staffToken, input)`
- `publishContract(gameSessionId, contractId, staffToken)`
- `listContractProgress(gameSessionId, contractId, staffToken)`
- `reviewContractProgress(gameSessionId, contractId, progressId, staffToken, input)`
- `issueContractRewards(gameSessionId, contractId, progressId, staffToken)`

## High-priority cleanup

1. Add the new admin terminal frontend as real source.
2. Add a backend adapter layer before wiring UI.
3. Fix stock trading payload mismatch before enabling execution.
4. Supersede stale audit docs that still say Store/Stock routes do not exist.
5. Keep Settings paused.

## Recommended Codex execution order

1. Land the frontend source.
2. Add admin API adapter.
3. Staff bootstrap/session selection.
4. Read-only Players.
5. Read-only Store catalog.
6. Read-only Attendance.
7. Read-only Contracts.
8. Safe mutations.
9. Marketplace reads.
10. Buy/sell only.
11. Advanced Marketplace instruments after backend support.
