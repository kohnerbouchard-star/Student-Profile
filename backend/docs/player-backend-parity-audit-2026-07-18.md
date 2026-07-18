# Player Backend Reconciliation v2 — Parity Audit

Date: 2026-07-18  
Branch: `agent/player-backend-reconciliation-v2`  
Base: `main` at `c7c949482b78c5960173e25e487f3aba2448d10e`  
Status: World, Market, watchlist, and Inventory read tranches complete; no production deployment authorized

## Scope and invariants

PR #158 owns Backend-only reconciliation for the merged Player Terminal and current Admin.

- Durable ownership uses immutable player UUIDs internally.
- Player ID remains mutable and player-facing.
- `x-player-session-token` derives player, game, and active session scope.
- Browser payloads may not select owner, game, session, recipient, holding, Store-item, or stock-table UUIDs.
- Browser DTOs do not expose ownership or persistence UUIDs.
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
| Watchlist read | `GET /players/me/stocks/watchlist` | Implemented | Token-scoped deterministic list with active browser-safe assets. |
| Watchlist add | `PUT /players/me/stocks/watchlist/:assetId` | Implemented | Public ticker, no body, active same-game asset, idempotent changed flag. |
| Watchlist remove | `DELETE /players/me/stocks/watchlist/:assetId` | Implemented | Public ticker, no body, idempotent removal including stale-row cleanup. |
| Store catalog/quote/purchase | existing player Store routes | Implemented | Existing quote and settlement behavior preserved. |
| Contracts list/submission | existing player Contract routes | Implemented | Current lifecycle preserved. |
| Contract acceptance | `POST /players/me/contracts/:contractId/accept` | Missing | Requires atomic reconciliation. |
| Inventory read | `GET /players/me/inventory` | Implemented | Token-scoped, maximum 200 holdings, public item keys, batched Store metadata, UUID-private DTO, explicit empty/unavailable state. |
| Notifications | `GET /players/me/notifications`; read mutation | Missing | Next bounded tranche. |
| Logout | `POST /players/me/session/logout` | Missing | Follows notifications. |
| Banking summary | `GET /players/me/ledger` | Implemented read-only | Transfers/savings remain unsupported. |
| Capability manifest | bootstrap extension | Missing | Generate only after route support is authoritative. |
| Inventory redemption | replacement contract | Planned | Generic use remains disabled. |

## Inventory read implementation

Components:

- exact direct and `classroom-api` route parser;
- bounded request parser rejecting query and browser game scope;
- authenticated HTTP handler using `resolvePlayerRequestScope`;
- separate internal and browser contracts;
- service with scope, bound, duplicate, quantity, ordering, privacy, empty-state, and action-policy validation;
- Supabase repository with bounded holdings and same-game batched Store metadata;
- focused route, parser, handler, service, and repository tests;
- canonical Backend smoke registration;
- API contract and test matrix.

Persistence and response controls:

- no new migration;
- existing `inventory_holdings` and `store_items` schema reused;
- maximum 200 holdings with one-row lookahead;
- positive owned quantities only;
- no per-item query loop;
- public identifier is the stable per-game item key;
- no holding, Store-item, player, game, or session UUIDs in browser DTOs;
- `availableActions` remains empty;
- successful responses use private no-store caching;
- `inventory_empty` is distinct from retryable service unavailability.

## Architectural findings

1. `classroom-api` still uses a direct conditional dispatcher and has no generated capability registry.
2. New player reads consistently use exact route parsers, bounded request parsers, the authoritative request scope, services, repository contracts, and UUID-private DTOs.
3. Older routes should migrate incrementally rather than through a broad dispatcher or domain rewrite.
4. Public Market identifiers are tickers; public Inventory identifiers are Store item keys; internal settlement and persistence identifiers remain server-only.
5. Watchlist desired-state writes do not require browser idempotency keys because database uniqueness and scoped deletes are authoritative.
6. Inventory needs no new schema for reads; later redemption requires its own reviewed transaction and authorization design.
7. Planned features remain fail-closed until capability publication.

## Reconciliation order

1. request scope — complete;
2. World reads — complete;
3. Market collection — complete;
4. Market detail/history — complete;
5. watchlist reads/writes — complete;
6. Inventory read — complete;
7. notifications list/read;
8. logout;
9. capability manifest;
10. atomic Contract acceptance;
11. Inventory redemption schema/RPCs/routes;
12. security audit, replay, staging documentation, and final verification.

## Exit gates

Before PR #158 can leave draft:

- all new handlers use authoritative player scope;
- identity-injection, expired, revoked, privacy, bounds, empty/unavailable, and idempotency tests pass;
- all forward migrations replay from zero twice;
- database lint passes;
- Backend, Admin, Player Terminal, Chromium, repository-quality, branch-hygiene, and security gates pass as applicable;
- no production migration, Edge deployment, Auth change, or runtime cutover occurs.
