# Player Backend Reconciliation v2 — Initial Parity Audit

Date: 2026-07-18
Branch: `agent/player-backend-reconciliation-v2`
Baseline: `main` at `56ee041c10d440fdd2a792723636d08651e4ffd0` after PR #157
Status: Draft audit checkpoint; no production deployment or migration execution authorized

## Scope

This branch owns backend-only reconciliation for the current Admin and Player Terminal contracts. It must preserve the merged Player Terminal, current Admin behavior, the current Contracts lifecycle, forward-only migration history, immutable player ownership, and idempotent economic mutations.

Donor PRs #141 and #143 are reference sources only. They must not be merged, rebased wholesale, or used to replace current trees or migration history.

## Identity invariants

- Durable ownership and transaction foreign keys use immutable player UUIDs.
- Player ID remains mutable and player-facing.
- The authenticated player UUID is derived from `x-player-session-token`.
- Game scope is derived from the authenticated session and authorized route context.
- Browser payloads must not select or submit owner, sender, recipient, or session UUIDs.
- Recipient Player ID may be accepted only as a scoped lookup value and must be resolved server-side.

## Current route parity

This matrix compares the merged Player Terminal endpoint registry and Student-Profile backend-route adapter with the `classroom-api` dispatcher on current `main`.

| Capability | Terminal endpoint | Expected backend path | Current main status | Finding |
|---|---|---|---|---|
| Player session/profile | `GET /session` | `GET /players/me` | Implemented | Routed to player session bootstrap. Capability manifest is not yet included. |
| Dashboard | `GET /dashboard` | `GET /players/me/game/dashboard` | Implemented | Routed with authenticated player session and game query context. |
| Countries list | `GET /world/countries` | `GET /players/me/world/countries` | Missing | Adapter declares the route; `classroom-api` has no dispatcher branch. |
| Country detail | `GET /world/countries/:countryId` | `GET /players/me/world/countries/:countryId` | Missing | Adapter declares the route; no current dispatcher branch. |
| World news | `GET /world/news` | `GET /players/me/world/news` | Missing | Adapter declares the route; no current dispatcher branch. |
| Portfolio | `GET /portfolio` | `GET /players/me/stocks/portfolio` | Implemented | Current dispatcher routes portfolio reads. Adapter currently sends game and player-session query context; server must treat token-derived identity as authoritative. |
| Market assets | `GET /market/assets` | `GET /players/me/stocks/assets` | Missing | Current dispatcher covers portfolio, holdings, orders, and trades, but not assets. |
| Market asset/history | `GET /market/assets/:assetId` | `GET /players/me/stocks/assets/:assetId` | Missing | Adapter expects asset detail and bounded history; no dispatcher branch exists. |
| Market order | `POST /market/orders` | `POST /players/me/stocks/orders` | Implemented | Market-only execution path exists. Client-selected ownership fields are rejected by the adapter and must remain rejected server-side. |
| Market watchlist | `POST /market/watchlist/:assetId` | `PUT/DELETE /players/me/stocks/watchlist/:assetId` | Missing | Adapter declares the route; no dispatcher branch exists. |
| Store catalog | `GET /store/items` | `GET /players/me/store/items` | Implemented | Routed. |
| Store quote | `POST /store/quotes` | `POST /players/me/store/quote` | Implemented | Routed; quote remains non-settling. |
| Store purchase | `POST /store/purchases` | `POST /players/me/store/purchases` | Implemented | Routed with idempotency key in header and body contract. |
| Contracts list | `GET /contracts` | `GET /players/me/contracts` | Implemented | Current route parser and handler support authenticated list reads. |
| Contract acceptance | `POST /contracts/:contractId/accept` | `POST /players/me/contracts/:contractId/accept` | Missing | Adapter expects the route. Current player Contract route parser supports only list and submit. Atomic acceptance must be reconciled with the existing lifecycle. |
| Contract submission | `POST /contracts/:contractId/submissions` | `POST /players/me/contracts/:contractId/submit` | Implemented | Existing handler performs authenticated availability and game-scope checks and upserts submitted progress. |
| Inventory read | `GET /inventory` | `GET /players/me/inventory` | Missing | Adapter and read model exist; no dispatcher branch exists. |
| Inventory use/redemption | `POST /inventory/:inventoryItemId/use` | Replacement redemption contract required | Planned | Direct generic `use` must remain disabled. Implement request/reserve/review/fulfill workflow instead. |
| Banking summary | `GET /banking/summary` | `GET /players/me/ledger` | Implemented read-only | Ledger route exists and is normalized into Banking. Transfers and savings remain unsupported. |
| Notifications list | `GET /notifications` | `GET /players/me/notifications` | Missing | Adapter declares pagination/filter expectations; no dispatcher branch exists. |
| Notifications read | `POST /notifications/read` | `POST /players/me/notifications/read` | Missing | Adapter supports 1–50 delivery IDs; no dispatcher branch exists. |
| Logout | host-owned/local action | `POST /players/me/session/logout` | Missing | Adapter declares the backend route; no dispatcher branch exists. Session invalidation semantics require explicit reconciliation. |
| Marketplace | read and writes | `/players/me/marketplace/...` | Planned | No supported adapter mapping or complete backend settlement path. |
| Business | read and writes | TBD | Planned | Visible product surface; not connected. |
| Crafting | read and writes | TBD | Planned | Visible product surface; not connected. |
| Player transfers/savings | writes | TBD | Planned | Must resolve recipient Player ID to UUID server-side before any ledger mutation. |
| Loans | read and writes | TBD | Planned | No complete authoritative backend path. |
| Messaging | read and writes | TBD | Planned | No complete authoritative backend path. |
| Progression | read and writes | TBD | Planned | No complete authoritative backend path. |

## Architectural findings

1. `classroom-api` currently uses a direct conditional dispatcher. The backend has no generated, single-source capability manifest tying route availability to database, Admin, and player support.
2. The terminal adapter already enforces a browser-side UUID privacy boundary, but backend handlers remain responsible for rejecting identity injection independently.
3. Contract list and submission exist, but acceptance is absent from the current route type and handler.
4. Store settlement and stock market-order settlement are already present and should be preserved, not ported wholesale from donor branches.
5. The terminal has authoritative Inventory and Banking read models, but current backend parity is incomplete: Banking can derive from ledger; Inventory has no active route.
6. Countries, news, notifications, watchlists, asset detail/history, logout, and Inventory reads are declared by the adapter but not exposed by the current `classroom-api` dispatcher.
7. Planned features must remain visible but fail closed until the capability manifest advertises complete support.

## Reconciliation order

1. Formalize route/request scope and authoritative capability identifiers.
2. Implement missing authenticated read routes by bounded domain.
3. Add a generated capability manifest to player bootstrap and an authorized Admin endpoint.
4. Add atomic Contract acceptance without altering submission, review, revision, approval, completion, rejection, expiration, or reward semantics.
5. Add a forward-only Inventory redemption schema and transaction RPCs.
6. Add player redemption request/status routes.
7. Add Admin list/approve/reject/fulfill routes.
8. Publish the final Player Terminal runtime contract.
9. Complete migration, grant, RLS, replay, authorization, and staging documentation.

## Initial acceptance gates

Before this PR can leave draft:

- route parity matrix is completed from code and tests;
- all new player handlers derive identity from the active player session;
- client identity-injection tests cover query, header, and body fields;
- wrong-game, wrong-player, expired-session, revoked-session, and idempotency tests pass;
- migrations replay cleanly twice;
- root, Backend, Admin, Player Terminal, Chromium, repository-quality, and branch-hygiene gates pass;
- no production migration or Edge Function deployment has occurred.
