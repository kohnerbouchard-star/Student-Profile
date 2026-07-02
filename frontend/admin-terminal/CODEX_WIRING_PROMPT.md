# Codex Prompt — Wire Econovaria Admin Terminal to Supabase Backend

Use this prompt in Codex.

```text
We are wiring the Econovaria admin terminal frontend into the Student-Profile repo.

Repository: kohnerbouchard-star/Student-Profile
Branch: frontend/admin-terminal-source-v1

Goal:
Land and wire the new admin terminal frontend against the existing Supabase classroom-api backend.

Critical context:
- The current GitHub frontend is mostly player-facing and does not contain the new admin terminal package yet.
- The accepted admin terminal UI baseline is the clean Marketplace/admin UI work through v527.
- Preserve the v529 Marketplace change where Call/Put options are selected inside the order ticket instead of a separate Chain/contracts block.
- Do not carry forward v528/v530/v531 Settings work. Settings is out of scope for now.
- Do not make unsupported backend behavior look functional.
- The backend stock order execution currently supports buy/sell only.
- Shorts, options, stop loss, stop limit, and advanced order types must remain preview-only or disabled until backend contracts, migrations, and RPCs support them.

Phase 0 — Add source tree:
1. Add the admin terminal source under frontend/admin-terminal/.
2. Keep source fragments and build tooling; do not patch only generated dist output.
3. Keep admin terminal package isolated from the existing player runtime until explicitly integrated.
4. Add an admin entrypoint, preferably frontend/admin-terminal/index.html, and document local run steps.

Phase 1 — Add admin API adapter:
Create:
frontend/admin-terminal/src/admin-overview/adminApi.js

This file should own:
- CLASSROOM_API_URL resolution
- staff bearer token headers
- Supabase publishable apikey header
- JSON fetch wrapper
- error normalization
- idempotency key creation
- response mapping

Do not call fetch directly from page renderers.

Adapter functions to implement first:
- getStaffBootstrap(token)
- listPlayers(gameSessionId, token)
- createPlayer(gameSessionId, token, input)
- resetPlayerAccessCode(gameSessionId, playerId, token)
- getAttendanceDaily(gameSessionId, token)
- scanAttendance(gameSessionId, token, input)
- listStoreItems(gameSessionId, token)
- createStoreItem(gameSessionId, token, input)
- updateStoreItem(gameSessionId, itemId, token, input)
- listContracts(gameSessionId, token)
- createContract(gameSessionId, token, input)
- publishContract(gameSessionId, contractId, token)
- listContractProgress(gameSessionId, contractId, token)
- reviewContractProgress(gameSessionId, contractId, progressId, token, input)
- issueContractRewards(gameSessionId, contractId, progressId, token)
- resetJoinCode(gameSessionId, token)
- seedInitialBalances(gameSessionId, token)
- readPlayerLedger(gameSessionId, playerId, token)
- adjustPlayerLedger(gameSessionId, playerId, token, input)

Phase 2 — Wire read-only admin data first:
1. Staff bootstrap and selected game session.
2. Players roster GET.
3. Store catalog GET.
4. Attendance daily GET.
5. Contracts list GET.
6. Player ledger history GET.

Phase 3 — Wire low-risk mutations:
1. Create player.
2. Reset player access code.
3. Scan attendance.
4. Create/update store item.
5. Create/publish contract.
6. Initial balance seed.
7. Ledger adjustment.

Phase 4 — Marketplace:
1. Wire read-only market data first.
2. Wire holdings, orders history, and trades history.
3. Wire simple buy/sell only.
4. Keep shorts/options/stops preview-only until backend support exists.

Backend contracts to respect:

Staff/admin requests:
- Authorization: Bearer <Supabase access token>
- apikey: <Supabase publishable key>

Player requests:
- Authorization: Bearer <Supabase publishable key>
- apikey: <Supabase publishable key>
- x-player-session-token: <player session token>

Stock order execution currently requires:
{
  "gameSessionId": "...",
  "stockAssetId": "...",
  "side": "buy",
  "quantity": 1,
  "idempotencyKey": "..."
}

Do not send playerSessionId, ticker, shares, optionType, strike, expiry, stopPrice, or short fields to the current stock order endpoint.

Testing requirements:
- Add smoke tests for adapter URL construction.
- Add smoke tests for request headers.
- Add smoke tests for stock order payload shape.
- Add regression test that advanced Marketplace actions are not submitted to the current buy/sell endpoint.
- Run backend checks from backend/: npm run typecheck:all.
```
