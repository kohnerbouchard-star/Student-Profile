# Econovaria Player Runtime Cutover Amendment

**Date:** 2026-07-19  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Branch:** `agent/player-terminal-runtime-cutover-v1`  
**Pull request:** `#217`  
**Status:** `IMPLEMENTED_NOT_MERGED`

## Scope decision

The product owner requested cleanup and runtime consolidation without beginning the broader API-boundary refactor. This tranche therefore replaces the active legacy Player frontend and Cloudflare browser transport while preserving the current `classroom-api`, Admin Terminal, database contracts, and work owned by other active pull requests.

## Roadmap items addressed

### `BETA-PLAYER-RUNTIME-001` — Install Player Terminal as the sole post-login Player runtime

**Status:** `IMPLEMENTED_NOT_MERGED`

Implementation:

- `index.html` is authentication-only and no longer mounts `#appShell`;
- `frontend/src/core/login.js` authenticates Player, Admin, and Create Game flows;
- successful Player authentication sends Game Code, Player ID/RFID identifier, and Access Code to the authoritative login route;
- the browser stores only the opaque Player session token, expiry, and storage timestamp after the terminal host sanitizes the handoff;
- successful authentication navigates to `player-terminal/`;
- `player-terminal/host-runtime.js` installs the Player session provider and connected Supabase runtime before `player-terminal/src/main.js`;
- logout, expired-session, revoked-session, and invalid-session paths clear the handoff and return to Player sign-in;
- the obsolete root-shell Contract browser smoke now delegates to the Player Terminal public-key, scope-stripping, lifecycle, and UUID-privacy suite.

Acceptance still required:

- PR merge into `main`;
- Repository Quality, Player Terminal Verify, Player Runtime Cutover Verify, Admin Shell Smoke, and Database Replay;
- isolated staging login, capability-manifest, logout, expiry, and revoked-session evidence;
- confirmation that no internal UUID appears in browser storage or connected responses.

### `BETA-LEGACY-001` — Retire the active Cloudflare Player browser path

**Status:** `IMPLEMENTED_NOT_MERGED`

Implementation:

- removed the Worker URL from active constants;
- removed the legacy `callApi` / `submitAction` transport from the active API module;
- removed all legacy Player feature script tags from the root page;
- replaced the stale Cloudflare caller audit with the current retirement boundary;
- added source and browser regression tests preventing reintroduction;
- retained dormant historical source only as non-executable reference during the active-PR window, avoiding destructive conflicts with parallel work.

Explicit limitation:

- the externally deployed Worker has not been disabled or deleted;
- live retirement requires traffic evidence, credential rotation, approval, monitoring, and rollback ownership.

## Cross-PR isolation

PR #217 does not modify Banking or notification feature source. Its shared Player workflow change is limited to one cutover-path allowlist expression placed separately from the backend allowlist additions owned by PRs #213 and #216. Runtime-cutover behavior is validated by a dedicated workflow so future feature verification remains independently owned.

## Files

- `.github/workflows/player-runtime-cutover-verify.yml`
- `.github/workflows/player-terminal-verify.yml`
- `.github/workflows/repository-quality.yml`
- `index.html`
- `frontend/src/core/constants.js`
- `frontend/src/core/api.js`
- `frontend/src/core/login.js`
- `player-terminal/index.html`
- `player-terminal/host-runtime.js`
- `scripts/player-login-identity-smoke.mjs`
- `scripts/player-contracts-workspace-smoke.mjs`
- `scripts/player-terminal-runtime-cutover-smoke.mjs`
- `scripts/shared-game-timezone-ui-smoke.mjs`
- `scripts/apply-shared-game-timezone-ui-v1.mjs`
- `scripts/fix-shared-game-timezone-smoke-v1.mjs`
- `package.json`
- `docs/audits/remaining-cloudflare-api-url-v1.md`

## Exclusions

This tranche does not:

- rename `classroom-api`;
- split Player, Admin, and platform API boundaries;
- modify database schemas or migrations;
- change economic transaction logic;
- change Admin Terminal production behavior;
- alter feature implementations owned by Banking, Backend, Inventory, Admin, notifications, or seed-content pull requests;
- disable or delete the live Cloudflare service.

## Next exact action

Complete all pull-request gates, confirm the final diff remains isolated and mergeable, then merge the runtime cutover. Connected isolated-staging and live Cloudflare shutdown evidence remain separate post-merge operational requirements before either item becomes `VERIFIED_COMPLETE`.
