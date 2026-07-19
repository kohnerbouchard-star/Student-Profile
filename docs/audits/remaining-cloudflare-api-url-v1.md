# Cloudflare Player Runtime Retirement Audit

**Status:** Repository runtime retired on `agent/player-terminal-runtime-cutover-v1`; merge and connected staging evidence remain required.

## Decision

The legacy Cloudflare Worker is no longer an approved Player browser dependency.

The root Econovaria document now owns authentication only. Successful Player authentication stores an opaque Player session handoff in `sessionStorage` and navigates to `player-terminal/`. The Player Terminal then loads its own authoritative session, capability manifest, and feature read models through the Supabase `classroom-api` boundary.

## Retired active chain

The following active browser chain has been removed:

```text
API_URL
→ getApiUrl()
→ callApiOnce()
→ callApi()
→ submitAction()
→ legacy Player feature mutations
```

The active runtime no longer contains or loads:

- the `silent-haze-ca17.kohner.workers.dev` URL;
- `API_URL`;
- `callApi()` or `callApiOnce()`;
- `submitAction()`;
- the legacy `#appShell` Player dashboard;
- legacy Store, Trading, Forecast, Inventory, Portfolio, Market, Dashboard, or realtime script tags.

## Current Player runtime

```text
index.html
→ frontend/src/core/login.js
→ POST /players/login
→ sessionStorage opaque token handoff
→ player-terminal/
→ player-terminal/host-runtime.js
→ player-terminal/src/main.js
→ /functions/v1/classroom-api
```

The login request includes all three required credentials:

- Game / Session Code;
- Player ID / RFID identifier;
- Access Code.

The handoff uses the server-issued Player session token. Player and game ownership remain server-derived; the terminal does not submit Player UUID ownership fields.

## Admin and Create Game containment

The root login controller preserves:

- Admin Supabase password authentication;
- staff bootstrap;
- active-game selection;
- Admin session and selected-game handoff to `admin/`;
- password recovery;
- licensed staff signup and initial game creation;
- explicit game timezone selection.

No Admin terminal implementation or Backend route ownership was refactored in this tranche.

## Live Cloudflare service boundary

This repository change does **not** disable, delete, redeploy, or rotate the externally deployed Cloudflare Worker. Live retirement still requires service-owner confirmation, traffic evidence, credential rotation, a maintenance window, monitoring, and rollback ownership under `docs/operations/legacy-service-containment.md`.

Repository references retained in historical documentation or release manifests are evidence only and must not be treated as executable configuration.

## Verification

The branch adds `scripts/player-terminal-runtime-cutover-smoke.mjs`, which fails if the root page remounts the legacy shell, reloads legacy feature scripts, restores a Worker URL to active sources, omits the Player Access Code, or loads the Player Terminal before its host-session runtime.

Required before `VERIFIED_COMPLETE`:

1. merge the cutover PR into `main`;
2. pass Repository Quality and Player Terminal verification;
3. verify Player login → terminal bootstrap → capability manifest in isolated staging;
4. verify logout, expiry, revoked-session, and invalid-session return to the root login;
5. confirm no production browser traffic reaches the Cloudflare Worker;
6. obtain explicit approval before disabling or deleting the live Worker.
