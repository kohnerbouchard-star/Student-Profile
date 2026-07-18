# Player Backend Reconciliation v2 — Parity Audit

Date: 2026-07-18  
Branch: `agent/player-backend-reconciliation-v2`  
Synchronized baseline: `main` at `c7c949482b78c5960173e25e487f3aba2448d10e`  
Status: World reads and Market collection/detail reads complete; no production deployment or migration execution authorized

## Scope

This branch owns Backend-only reconciliation for the current Admin and Player Terminal contracts. It preserves current Admin behavior, the merged Player Terminal, the current Contract lifecycle, forward-only migration history, immutable player ownership, and existing economic settlement paths.

Donor PRs #141 and #143 remain reference sources only. Their trees and migrations must not be merged wholesale.

## Identity invariants

- Durable ownership uses immutable player UUIDs.
- Player ID remains mutable and player-facing.
- Player UUID, active session, and game scope come from `x-player-session-token`.
- Browser requests cannot select owner, recipient, session, game, or stock-table UUIDs.
- Browser DTOs do not expose ownership or internal stock-record UUIDs.
- Existing settlement routes must resolve public identifiers server-side before invoking internal transaction logic.

## Current route parity

| Capability | Player Terminal expectation | Backend path | Status | Current finding |
|---|---|---|---|---|
| Session/profile | `GET /session` | `GET /players/me` | Implemented | Bootstrap exists; generated capability manifest remains pending. |
| Dashboard | `GET /dashboard` | `GET /players/me/game/dashboard` | Implemented | Existing route preserved. |
| Countries | `GET /world/countries` | `GET /players/me/world/countries` | Implemented | Authenticated-game scoped, active only, public country identifiers. |
| Country detail | `GET /world/countries/:countryId` | `GET /players/me/world/countries/:countryId` | Implemented | Public country code replaces internal profile UUID. |
| World news | `GET /world/news` | `GET /players/me/world/news` | Implemented | Public active feed with bounded cursor pagination. |
| Portfolio | `GET /portfolio` | `GET /players/me/stocks/portfolio` | Implemented | Existing portfolio read preserved. |
| Market collection | `GET /market/assets` | `GET /players/me/stocks/assets` | Implemented | Bounded list, ticker public IDs, no stock-table UUIDs, explicit empty and unavailable states. |
| Market detail/history | `GET /market/assets/:assetId` | `GET /players/me/stocks/assets/:assetId` | Implemented | Public ticker route, maximum 500 history points, two bounded queries, ascending chart output. |
| Market order | `POST /market/orders` | `POST /players/me/stocks/orders` | Existing settlement preserved | Public ticker must be resolved to one active internal asset inside the authenticated game before connected use. |
| Market watchlist | watchlist toggle | `PUT/DELETE /players/me/stocks/watchlist/:assetId` | Missing | Next Market tranche. |
| Store catalog | `GET /store/items` | `GET /players/me/store/items` | Implemented | Routed. |
| Store quote | `POST /store/quotes` | `POST /players/me/store/quote` | Implemented | Non-settling quote path preserved. |
| Store purchase | `POST /store/purchases` | `POST /players/me/store/purchases` | Implemented | Idempotent settlement path preserved. |
| Contracts list | `GET /contracts` | `GET /players/me/contracts` | Implemented | Existing list preserved. |
| Contract acceptance | accept action | `POST /players/me/contracts/:contractId/accept` | Missing | Requires manual atomic lifecycle reconciliation. |
| Contract submission | submit action | `POST /players/me/contracts/:contractId/submit` | Implemented | Existing submission preserved. |
| Inventory | `GET /inventory` | `GET /players/me/inventory` | Missing | Follows Market watchlist. |
| Banking summary | `GET /banking/summary` | `GET /players/me/ledger` | Implemented read-only | Transfers and savings remain unsupported. |
| Notifications | list/read | `/players/me/notifications...` | Missing | Follows Inventory. |
| Logout | host action | `POST /players/me/session/logout` | Missing | Follows notifications. |
| Capability manifest | bootstrap capabilities | generated from Backend support | Missing | Must not advertise incomplete actions. |
| Inventory redemption | use/redeem action | replacement redemption contract | Planned | Requires forward migration and restricted RPCs. |
| Marketplace, Business, Crafting, Loans, Messaging, Progression | visible product surfaces | TBD | Planned | Remain fail-closed. |

## Authoritative player request scope

`backend/src/domains/players/api/playerRequestScope.ts` provides:

- immutable player UUID;
- server-derived game ID;
- active player-session ID;
- validated session state and expiration;
- own-player authorization context.

It rejects missing, expired, revoked, inactive, wrong-game, structurally mismatched, and ownership-injected requests.

## World read tranche

Implemented components include exact route parsing, bounded request parsing, an authenticated handler, service validation, Supabase repositories, browser-safe DTOs, deterministic news pagination, explicit empty-state behavior, and focused tests.

Internal player, game, assignment, profile, snapshot, and event database UUIDs are not published.

## Market collection tranche

The collection route supports:

- `limit` from 1 through 100;
- `offset` from 0 through 10,000;
- deterministic ticker ordering and lookahead pagination;
- one active-asset query and one latest-tick RPC;
- public ticker `assetId` values;
- sectors and asset arrays compatible with the Player Terminal;
- successful `stock_market_not_initialized` empty state;
- retryable persistence unavailability.

## Market detail and history tranche

The detail route supports:

- normalized ticker paths such as `AURA` and `BRK.B`;
- rejection of UUID-shaped identifiers, encoded slashes, and extra segments;
- `historyLimit` default 200 and maximum 500;
- one active asset lookup bounded to two rows;
- no history query for an unavailable asset;
- history filtered by authenticated game, resolved internal asset row, and ticker;
- newest-first SQL reads and ascending browser chart order;
- duplicate tick-index and cross-scope rejection;
- public DTOs without game, player, session, or internal asset UUIDs.

The detail path deliberately avoids an extra latest-tick RPC. Displayed volume and response tick are derived from the newest returned history point.

## Architectural findings

1. `classroom-api` still uses a direct conditional dispatcher and has no generated capability manifest.
2. The authoritative request-scope module is the required identity boundary for new player routes.
3. Existing duplicated identity logic should be replaced incrementally rather than through a broad rewrite.
4. The public Market ticker and internal settlement UUID require a bounded server-side resolution boundary for writes.
5. Store and Market settlement implementations already exist and must not be replaced from donor branches.
6. Planned domains remain fail-closed until the Backend capability manifest advertises verified support.

## Remaining reconciliation order

1. Authenticated player request scope — **complete**.
2. World countries, country detail, and news — **complete**.
3. Market asset collection — **complete**.
4. Market asset detail and bounded history — **complete**.
5. Market watchlist reads and writes.
6. Inventory read.
7. Notifications list/read and player logout.
8. Capability manifest generated from implemented support.
9. Atomic Contract acceptance.
10. Forward-only Inventory redemption schema and RPCs.
11. Player and Admin redemption routes.
12. Runtime contract, security audit, migration replay, staging documentation, and final verification.

## Acceptance gates before leaving draft

- all new player handlers use authoritative request scope;
- ownership-injection and invalid-session tests pass;
- migrations replay twice after migration work begins;
- Backend, Admin, Player Terminal, browser, repository-quality, and branch-hygiene gates pass;
- consumer contracts match the final Backend implementation;
- no production migration, Edge deployment, Auth change, or runtime cutover occurs from this PR.
