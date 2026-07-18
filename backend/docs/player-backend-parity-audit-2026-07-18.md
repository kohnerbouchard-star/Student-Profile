# Player Backend Reconciliation v2 — Initial Parity Audit

Date: 2026-07-18
Branch: `agent/player-backend-reconciliation-v2`
Current synchronized baseline: `main` at `e6922fb54a905dfc1e11a122c67cf9e3a7208419` after PRs #159 and #160
Status: Tranche 1 request-scope implementation checkpoint; no production deployment or migration execution authorized

## Scope

This branch owns backend-only reconciliation for the current Admin and Player Terminal contracts. It preserves the merged Player Terminal, current Admin behavior, the current Contracts lifecycle, forward-only migration history, immutable player ownership, and idempotent economic mutations.

Donor PRs #141 and #143 are reference sources only. They must not be merged, rebased wholesale, or used to replace current trees or migration history.

## Identity invariants

- Durable ownership and transaction foreign keys use immutable player UUIDs.
- Player ID remains mutable and player-facing.
- The authenticated player UUID is derived from `x-player-session-token`.
- Game scope is derived from the authenticated session and authorized route context.
- Browser payloads must not select or submit owner, sender, recipient, or session UUIDs.
- Recipient Player ID may be accepted only as a scoped lookup value and must be resolved server-side.
- Browser DTOs must not expose ownership UUIDs.

## Tranche 1 — authenticated player request scope

Implemented in `backend/src/domains/players/api/playerRequestScope.ts` with focused Deno tests.

The authoritative internal scope contains:

- immutable player UUID;
- server-derived game ID;
- active player-session ID;
- validated session state;
- session expiration;
- own-player authorization context.

The boundary rejects:

- missing player-session tokens;
- expired sessions;
- revoked sessions;
- inactive sessions;
- wrong-game scope hints;
- structurally mismatched session, game, and player records;
- query-supplied player, owner, session, or recipient UUIDs;
- ownership-selection headers;
- body-supplied player, owner, session, recipient, or game UUIDs.

A player-facing recipient Player ID remains allowed as input for a future server-side scoped lookup. It is never treated as durable ownership authority.

## Current route parity

This matrix compares the merged Player Terminal endpoint registry and Student-Profile backend-route adapter with the `classroom-api` dispatcher on the synchronized baseline.

| Capability | Terminal endpoint | Expected backend path | Current status | Finding |
|---|---|---|---|---|
| Player session/profile | `GET /session` | `GET /players/me` | Implemented | Routed to player session bootstrap. Capability manifest is not yet included. |
| Dashboard | `GET /dashboard` | `GET /players/me/game/dashboard` | Implemented | Routed with authenticated player session and game query context. Future reconciliation should consume the authoritative request scope. |
| Countries list | `GET /world/countries` | `GET /players/me/world/countries` | Missing | Next bounded domain in Tranche 2. |
| Country detail | `GET /world/countries/:countryId` | `GET /players/me/world/countries/:countryId` | Missing | Next bounded domain in Tranche 2. |
| World news | `GET /world/news` | `GET /players/me/world/news` | Missing | Next bounded domain in Tranche 2. |
| Portfolio | `GET /portfolio` | `GET /players/me/stocks/portfolio` | Implemented | Current dispatcher routes portfolio reads. Server-derived identity remains authoritative. |
| Market assets | `GET /market/assets` | `GET /players/me/stocks/assets` | Missing | Port after World reads. |
| Market asset/history | `GET /market/assets/:assetId` | `GET /players/me/stocks/assets/:assetId` | Missing | Port after asset list. |
| Market order | `POST /market/orders` | `POST /players/me/stocks/orders` | Implemented | Existing settlement path must be preserved. |
| Market watchlist | `POST /market/watchlist/:assetId` | `PUT/DELETE /players/me/stocks/watchlist/:assetId` | Missing | Port after asset detail/history. |
| Store catalog | `GET /store/items` | `GET /players/me/store/items` | Implemented | Routed. |
| Store quote | `POST /store/quotes` | `POST /players/me/store/quote` | Implemented | Routed; quote remains non-settling. |
| Store purchase | `POST /store/purchases` | `POST /players/me/store/purchases` | Implemented | Routed with idempotency contract. |
| Contracts list | `GET /contracts` | `GET /players/me/contracts` | Implemented | Existing authenticated list read is preserved. |
| Contract acceptance | `POST /contracts/:contractId/accept` | `POST /players/me/contracts/:contractId/accept` | Missing | Requires manual atomic reconciliation with the merged lifecycle. |
| Contract submission | `POST /contracts/:contractId/submissions` | `POST /players/me/contracts/:contractId/submit` | Implemented | Existing submission and game-scope checks are preserved. |
| Inventory read | `GET /inventory` | `GET /players/me/inventory` | Missing | Port after Market watchlist. |
| Inventory use/redemption | `POST /inventory/:inventoryItemId/use` | Replacement redemption contract required | Planned | Direct generic use remains disabled. |
| Banking summary | `GET /banking/summary` | `GET /players/me/ledger` | Implemented read-only | Transfers and savings remain unsupported. |
| Notifications list | `GET /notifications` | `GET /players/me/notifications` | Missing | Port after Inventory. |
| Notifications read | `POST /notifications/read` | `POST /players/me/notifications/read` | Missing | Port after notification list. |
| Logout | host-owned/local action | `POST /players/me/session/logout` | Missing | Final route in Tranche 2. |
| Marketplace | read and writes | `/players/me/marketplace/...` | Planned | No complete settlement path. |
| Business | read and writes | TBD | Planned | Visible product surface; not connected. |
| Crafting | read and writes | TBD | Planned | Visible product surface; not connected. |
| Player transfers/savings | writes | TBD | Planned | Recipient Player ID must resolve server-side to UUID. |
| Loans | read and writes | TBD | Planned | No authoritative backend path. |
| Messaging | read and writes | TBD | Planned | No authoritative backend path. |
| Progression | read and writes | TBD | Planned | No authoritative backend path. |

## Architectural findings

1. `classroom-api` still uses a direct conditional dispatcher and has no generated capability manifest.
2. The request-scope module now provides one reusable Backend identity boundary for all new player routes.
3. Existing handlers contain duplicated identity-injection and game-matching logic that should be replaced incrementally, not through a broad rewrite.
4. Contract list and submission exist, but acceptance remains absent.
5. Store settlement and stock market-order settlement are already present and must not be replaced from donor branches.
6. Planned features remain fail-closed until the capability manifest advertises complete support.

## Reconciliation order

1. Authenticated player request scope — **implemented; repository checks pending**.
2. Countries list, country detail, and world news.
3. Market asset list, detail/history, and watchlist.
4. Inventory, notifications, and logout.
5. Generated capability manifest.
6. Atomic Contract acceptance.
7. Forward-only Inventory redemption schema and RPCs.
8. Player and Admin redemption routes.
9. Runtime contract, security audit, replay, and staging documentation.

## Acceptance gates

Before this PR can leave draft:

- all new player handlers consume the authoritative request scope;
- query, header, and body identity-injection tests pass;
- wrong-game, wrong-player, expired-session, revoked-session, and idempotency tests pass;
- migrations replay cleanly twice after migration work begins;
- root, Backend, Admin, Player Terminal, Chromium, repository-quality, and branch-hygiene gates pass;
- no production migration or Edge Function deployment occurs.
