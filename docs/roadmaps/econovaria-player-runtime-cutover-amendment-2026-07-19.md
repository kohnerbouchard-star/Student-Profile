# Econovaria Player Runtime Cutover Amendment

**Date:** 2026-07-19  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Branch:** `agent/player-terminal-runtime-cutover-v1`  
**Status:** `IMPLEMENTED_NOT_MERGED`

## Scope decision

The product owner requested cleanup and runtime consolidation without beginning the broader API-boundary refactor. This tranche therefore replaces the active legacy Player frontend and Cloudflare browser transport while preserving the current `classroom-api`, Admin Terminal, database contracts, and work owned by other active pull requests.

## Roadmap items addressed

### `BETA-PLAYER-RUNTIME-001` — Install Player Terminal as the sole post-login Player runtime

**Status:** `IMPLEMENTED_NOT_MERGED`

Implementation:

- `index.html` is now authentication-only and no longer mounts `#appShell`.
- `frontend/src/core/login.js` authenticates Player, Admin, and Create Game flows.
- successful Player authentication stores an opaque session handoff in `sessionStorage` and navigates to `player-terminal/`;
- `player-terminal/host-runtime.js` installs the Player session provider and connected Supabase runtime before `player-terminal/src/main.js`;
- logout and invalid-session events clear the handoff and return to Player sign-in.

Acceptance still required:

- PR merge into `main`;
- Repository Quality and Player Terminal Verify;
- isolated staging login, capability-manifest, logout, expiry, and revoked-session evidence;
- confirmation that no internal UUID appears in browser storage or responses.

### `BETA-LEGACY-001` — Retire the active Cloudflare Player browser path

**Status:** `IMPLEMENTED_NOT_MERGED`

Implementation:

- removed the Worker URL from active constants;
- removed the legacy `callApi` / `submitAction` transport from the active API module;
- removed all legacy Player feature script tags from the root page;
- replaced the stale Cloudflare caller audit with the current retirement boundary;
- added a source-level regression test preventing reintroduction.

Explicit limitation:

- the externally deployed Worker has not been disabled or deleted;
- live retirement requires traffic evidence, credential rotation, approval, monitoring, and rollback ownership.

## Files

- `index.html`
- `frontend/src/core/constants.js`
- `frontend/src/core/api.js`
- `frontend/src/core/login.js`
- `player-terminal/index.html`
- `player-terminal/host-runtime.js`
- `scripts/player-terminal-runtime-cutover-smoke.mjs`
- `scripts/shared-game-timezone-ui-smoke.mjs`
- `scripts/apply-shared-game-timezone-ui-v1.mjs`
- `package.json`
- `docs/audits/remaining-cloudflare-api-url-v1.md`

## Exclusions

This tranche does not:

- rename `classroom-api`;
- split Player, Admin, and platform API boundaries;
- modify database schemas or migrations;
- change economic transaction logic;
- change Admin Terminal production behavior;
- alter work owned by Banking, Backend, Inventory, Admin, or seed-content pull requests;
- disable or delete the live Cloudflare service.

## Next exact action

Open a draft pull request, run the repository and Player Terminal gates, correct any path-based smoke tests exposed by removal of the legacy root shell, then complete isolated staging verification before marking either item `VERIFIED_COMPLETE`.
