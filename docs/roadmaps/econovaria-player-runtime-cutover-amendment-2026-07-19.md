# Econovaria Player Runtime Cutover Amendment

**Date:** 2026-07-19  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Runtime-cutover pull request:** `#217`, merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`  
**Physical-cleanup pull request:** `#222`  
**Status:** `IN_PROGRESS` — repository cutover merged; physical cleanup implemented and awaiting merge; connected operational evidence remains open

## Scope decision

The product owner requested runtime consolidation and cleanup without beginning the broader API-boundary refactor. The work therefore replaces the active legacy Player frontend and Cloudflare browser transport while preserving the current `classroom-api`, Admin Terminal, database contracts, and independently owned feature work.

## `BETA-PLAYER-RUNTIME-001` — Install Player Terminal as the sole post-login Player runtime

**Status:** `IN_PROGRESS` — merged repository implementation; connected operational evidence pending

Merged through PR #217:

- `index.html` is authentication-only and no longer mounts `#appShell`;
- `frontend/src/core/login.js` owns Player, Admin, and Create Game authentication;
- Player login sends Game Code, Player ID/RFID identifier, and Access Code to the authoritative route;
- browser handoff storage is limited to the opaque Player session token, expiry, and storage timestamp;
- successful Player authentication navigates to `player-terminal/`;
- `player-terminal/host-runtime.js` installs the session provider and connected Supabase runtime before `player-terminal/src/main.js`;
- logout, expired-session, revoked-session, and invalid-session paths clear the handoff and return to Player sign-in;
- legacy root-shell Contract testing was replaced with the Player Terminal public-key, scope-stripping, lifecycle, and UUID-privacy suite.

Verified repository evidence on PR #217 head `6cdd032dc18db31df876dc083058785288d6dc2f`:

- Repository Quality #882;
- Player Terminal Verify #289;
- Player Runtime Cutover Verify #5;
- Admin Shell Smoke #824;
- Database Replay #293;
- Staging Readiness Preflight #56;
- Exchange Calendar Runtime #142;
- Required Game Market Timezone #149.

Remaining acceptance evidence:

- connected isolated-staging login and capability-manifest verification;
- connected logout, expiry, revoked-session, and invalid-session verification;
- connected response, network, log, and artifact confirmation that no internal UUID or session secret leaks.

## `BETA-LEGACY-001` — Retire the Cloudflare Player browser path

**Status:** `IN_PROGRESS` — browser dependency removed; physical source cleanup awaiting merge; live service shutdown pending

Merged through PR #217:

- removed the Worker URL from active constants;
- removed the legacy `callApi`, `callApiOnce`, and `submitAction` transport chain;
- removed all legacy Player feature script tags from the root page;
- replaced the stale Cloudflare caller audit with the current retirement boundary;
- added source and Chromium regression evidence preventing the browser dependency from returning.

Operational limitation:

- the externally deployed Worker has not been disabled or deleted;
- production retirement requires traffic evidence, credential rotation, explicit approval, monitoring, and rollback ownership.

## Cross-PR isolation

The runtime cutover did not change Banking or notification feature implementations. Cleanup PR #222 was synchronized with the merged Banking pagination correction on current `main` and does not modify `player-terminal/**`, Backend routes, schemas, Admin runtime, economic writes, or seed-content PR #163.

## Physical legacy-source removal

**Branch:** `agent/legacy-player-source-removal-v1`  
**Pull request:** `#222`  
**Base main:** `26eecaa1ed04e3aa0909c75be269491a975fad70`  
**Status:** `IMPLEMENTED_NOT_MERGED`

PR #222 physically removes 38 dormant legacy paths, including:

- the compatibility `app.js` marker and obsolete behavior-preserving refactor note;
- the old Player core bootstrap, state, router, and snapshot modules;
- legacy Auth, Dashboard, Store, Inventory, Portfolio, Trading, Market, Forecast, Contract, and realtime modules;
- obsolete Player UI helpers, currency/formatting utilities, sound effect, and root-shell CSS layouts/screens.

It preserves:

- the root Player/Admin/Create Game authentication surface;
- `frontend/src/core/constants.js`, `api.js`, and `login.js`;
- the Admin runtime;
- the complete `player-terminal/**` runtime;
- Supabase Backend boundaries and economic transaction logic;
- operational Cloudflare-retirement documentation and rollback evidence.

The root stylesheet now imports only shared base rules and login-specific components. The permanent runtime-cutover smoke fails if any retired path returns or if active sources restore `appShell`, `submitAction`, `callApiOnce`, `workers.dev`, or the retired Cloudflare hostname.

Pre-review reconciliation evidence:

- the bounded cleanup application completed successfully;
- the complete repository test chain passed after deletion;
- the complete Player Terminal package verification passed unchanged;
- the cleanup and ledger reconciliation workflows removed their own temporary helpers;
- the effective PR diff contains only permanent source removals, the login stylesheet reduction, the permanent regression ratchet, and roadmap evidence.

## Exclusions

This work does not:

- rename or split `classroom-api`;
- modify database schemas or migrations;
- change economic transaction logic;
- change Admin Terminal production behavior;
- change Player Banking, notifications, Store, Contract, or Inventory behavior;
- alter seed-content authority;
- disable or delete the live Cloudflare service.

## Next exact action

Pass the full normal workflow suite on the final PR #222 head, confirm the permanent diff remains isolated, then squash-merge PR #222. After merge, complete connected isolated-staging verification and the controlled live Cloudflare Worker retirement procedure.