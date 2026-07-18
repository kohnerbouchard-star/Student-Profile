# Player Backend Reconciliation v2 — Parity Audit

Date: 2026-07-18  
Branch: `agent/player-backend-reconciliation-v2`  
Base: `main` at `c7c949482b78c5960173e25e487f3aba2448d10e`  
Status: World and Market read tranches complete; watchlist implementation under final verification; no production deployment authorized

## Scope and invariants

PR #158 owns Backend-only reconciliation for the merged Player Terminal and current Admin.

- Durable ownership uses immutable player UUIDs internally.
- Player ID remains mutable and player-facing.
- `x-player-session-token` derives player, game, and active session scope.
- Browser payloads may not select owner, game, session, recipient, or stock-table UUIDs.
- Browser DTOs do not expose ownership UUIDs.
- Existing Store and stock-order settlement implementations are preserved.
- Donor PRs #141 and #143 are review sources only.

## Current route parity

| Capability | Backend path | Status | Finding |
|---|---|---|---|
| Player session/profile | `GET /players/me` | Implemented | Existing bootstrap preserved; capability manifest pending. |
| Dashboard | `GET /players/me/game/dashboard` | Implemented | Existing route preserved. |
| Countries | `GET /players/me/world/countries` | Implemented | Active authenticated-game countries, public codes, UUID-private DTO. |
| Country detail | `GET /players/me/world/countries/:countryId` | Implemented | Public country code only. |
| World news | `GET /players/me/world/news` | Implemented | Bounded deterministic cursor feed. |
| Portfolio | `GET /players/me/stocks/portfolio` | Implemented | Existing read preserved. |
| Market collection | `GET /players/me/stocks/assets` | Implemented | Bounded list, ticker IDs, current volume, explicit empty/unavailable state. |
| Market detail/history | `GET /players/me/stocks/assets/:assetId` | Implemented | Ticker route, history limit 1–500, deterministic ascending history. |
| Market order | `POST /players/me/stocks/orders` | Existing implementation preserved | Connected use still requires public-ticker-to-internal-asset resolution at the mutation boundary. |
| Watchlist read | `GET /players/me/stocks/watchlist` | Implemented checkpoint | Token-scoped deterministic list with active browser-safe assets. |
| Watchlist add | `PUT /players/me/stocks/watchlist/:assetId` | Implemented checkpoint | Public ticker, no body, active same-game asset, idempotent changed flag. |
| Watchlist remove | `DELETE /players/me/stocks/watchlist/:assetId` | Implemented checkpoint | Public ticker, no body, idempotent removal including stale-row cleanup. |
| Store catalog/quote/purchase | existing player Store routes | Implemented | Existing quote and settlement behavior preserved. |
| Contracts list/submission | existing player Contract routes | Implemented | Current lifecycle preserved. |
| Contract acceptance | `POST /players/me/contracts/:contractId/accept` | Missing | Requires atomic reconciliation. |
| Inventory read | `GET /players/me/inventory` | Missing | Next bounded read tranche. |
| Notifications | `GET /players/me/notifications`; read mutation | Missing | Follows Inventory. |
| Logout | `POST /players/me/session/logout` | Missing | Follows notifications. |
| Banking summary | `GET /players/me/ledger` | Implemented read-only | Transfers/savings remain unsupported. |
| Capability manifest | bootstrap extension | Missing | Generate only after route support is authoritative. |
| Inventory redemption | replacement contract | Planned | Generic use remains disabled. |

## Watchlist implementation

Components:

- public-ticker collection/item route parser;
- bounded list and body-free mutation parser;
- authenticated HTTP handler using `resolvePlayerRequestScope`;
- separate internal/browser contracts;
- service with scope, duplicate, privacy, pagination, and idempotency validation;
- Supabase repository with batched reads and desired-state writes;
- migration `20260718064000_add_player_stock_watchlist_v1.sql`;
- focused route, parser, handler, service, and repository tests;
- canonical Backend smoke registration;
- API contract and test matrix.

Database controls:

- composite same-game foreign keys;
- unique player/asset ownership key;
- active player/asset insert trigger;
- forced RLS;
- no browser policy or table privilege;
- service role receives select, insert, and delete only.

## Architectural findings

1. `classroom-api` still uses a direct conditional dispatcher and has no generated capability registry.
2. The public stock-route facade now groups collection, detail, and watchlist parsing while preserving the existing dispatcher import contract.
3. New player routes consistently use the authoritative request scope; older routes should migrate incrementally rather than through a broad rewrite.
4. Public Market identifiers are tickers; internal settlement and persistence identifiers remain server-only.
5. Watchlist desired-state writes do not require browser idempotency keys because database uniqueness and scoped deletes are authoritative.
6. Planned features remain fail-closed until capability publication.

## Reconciliation order

1. request scope — complete;
2. World reads — complete;
3. Market collection — complete;
4. Market detail/history — complete;
5. watchlist reads/writes — implemented; final migration and current-head gates pending;
6. Inventory read;
7. notifications list/read;
8. logout;
9. capability manifest;
10. atomic Contract acceptance;
11. Inventory redemption schema/RPCs/routes;
12. security audit, replay, staging documentation, and final verification.

## Exit gates

Before PR #158 can leave draft:

- all new handlers use authoritative player scope;
- identity-injection, wrong-game, expired, revoked, privacy, and idempotency tests pass;
- all forward migrations replay from zero twice;
- database lint passes;
- Backend, Admin, Player Terminal, Chromium, repository-quality, branch-hygiene, and security gates pass as applicable;
- no production migration, Edge deployment, Auth change, or runtime cutover occurs.
