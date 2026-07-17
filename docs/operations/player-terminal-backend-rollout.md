# Player terminal backend rollout

**Prepared:** 2026-07-17

**Status:** implemented and locally verified; not deployed

**Merge branch:** `agent/player-terminal-production-integration-v1` (created
from current `origin/main`; the older implementation worktrees remain reference
branches only)

**Scope:** the standalone v7.4 player terminal, the authenticated
`classroom-api` routes it consumes, and the forward database migrations needed
by those routes.

This document is a release plan, not deployment authorization. No migration or
Edge Function in this work was applied to the live Supabase project.

## Release objective

Ship a bounded first production slice in which the new terminal can establish a
player session, render authoritative dashboard/World/market/Store/contract data,
read the player ledger and inventory, manage stock watchlists and notifications,
submit supported writes, and revoke logout without using preview data or
client-supplied player identity.

## Implemented route coverage

All player routes below derive player and game ownership from the opaque
`x-player-session-token`. A route may accept a game-session reference only when
its reviewed contract requires one, and it must match the token-derived game.
The browser never receives or sends the service-role key or stock-runner secret.

| Capability | Production route | State |
| --- | --- | --- |
| Session | `GET /players/me` | Connected |
| Dashboard | `GET /players/me/game/dashboard` | Connected |
| Countries | `GET /players/me/world/countries` | Added |
| Country detail | `GET /players/me/world/countries/:countryId` | Added |
| World news | `GET /players/me/world/news` | Added |
| Market directory | `GET /players/me/stocks/assets` | Added |
| Market detail/history | `GET /players/me/stocks/assets/:assetId` | Added |
| Portfolio | `GET /players/me/stocks/portfolio` | Connected |
| Market order | `POST /players/me/stocks/orders` | Connected; market orders only |
| Watchlist | `GET /players/me/stocks/watchlist` | Added |
| Watchlist mutation | `PUT` / `DELETE /players/me/stocks/watchlist/:assetId` | Added; idempotent |
| Store catalog | `GET /players/me/store/items` | Connected |
| Store quote | `POST /players/me/store/quote` | Connected |
| Store purchase | `POST /players/me/store/purchases` | Connected; idempotent |
| Inventory | `GET /players/me/inventory` | Added |
| Ledger | `GET /players/me/ledger` | Hardened and bounded |
| Contracts | `GET /players/me/contracts` | Connected |
| Contract acceptance | `POST /players/me/contracts/:contractId/accept` | Added; atomic and idempotent |
| Contract submission | `POST /players/me/contracts/:contractId/submit` | Connected |
| Notifications | `GET /players/me/notifications` | Added; cursor-paginated |
| Notification read | `POST /players/me/notifications/read` | Added; bounded and idempotent |
| Logout | `POST /players/me/session/logout` | Added; server revocation |

The terminal keeps its initial production bootstrap to two sequential requests:
session validation followed by the aggregate dashboard. Countries load after
first render; other reads are lazy. Opening the notification drawer is the first
notification request. Market selection is one bounded directory read plus one
bounded history read.

## Database changes in the release

| Migration | Purpose | Release requirement |
| --- | --- | --- |
| `20260717165000_add_storyline_schema_v1.sql` | Forward storyline schema | Rehearse from a restored copy |
| `20260717165100_add_demo_storyline_seed_rpc_v1.sql` | Controlled storyline seed RPC | Keep unavailable to browser roles |
| `20260717165200_harden_story_notification_scope_v1.sql` | Notification game-scope integrity | Apply before notification routes |
| `20260717165300_accept_player_contract_atomic_v1.sql` | Atomic player contract acceptance | Apply before the acceptance route |
| `20260717165500_add_player_stock_watchlist_v1.sql` | Scoped watchlist table and trigger | Apply before watchlist routes |

The contract and watchlist migrations are transaction-wrapped forward changes.
The watchlist table has composite game/player and game/asset foreign keys,
forced RLS, no browser policy or privilege, and service-role-only access. Apply
the checked-in migration files; do not paste their SQL into the dashboard.

## Required merge and release order

1. Use `agent/player-terminal-production-integration-v1` for review. Fetch the
   latest protected `main` immediately before opening the pull request and
   rebase only if `main` has advanced. Do not merge the stale
   `feat/contracts-end-to-end-wiring` history or the intermediate worktrees.
2. Review the backend route/migration and standalone terminal changes as a
   bounded pull request. Run the
   complete repository, migration, TypeScript, Deno, and authorization tests.
3. Reconcile/replay the full migration history in an isolated Supabase project.
   Apply migrations there before deploying the matching `classroom-api` build.
4. Deploy the backend artifact to staging with the player-terminal capability
   disabled. Record artifact hashes and the migration head.
5. Merge the standalone terminal adapter changes. Build once from the merge
   commit and deploy that exact artifact to staging.
6. Enable the capability for test players only. Run the journey matrix below,
   cross-game denial tests, and observability checks.
7. Obtain named production approval, apply migrations, deploy the same backend
   artifact, deploy the same frontend artifact, then enable the capability in a
   controlled cohort.
8. Keep the previous terminal/backend artifacts available through the
   observation window. Database correction remains forward-only.

## Staging journey matrix

The release is blocked unless all of these pass against the staged database and
deployed Edge Function:

- valid login, reload, expiry, explicit logout, revoked-token reuse;
- missing token, malformed token, wrong game, inactive player, and cross-player
  attempts for every route family;
- dashboard then lazy World, market/history, Store, contracts, inventory,
  ledger, notifications, and watchlist reads;
- Store quote/purchase replay with one balance/inventory effect;
- contract acceptance replay and concurrent acceptance with one assignment;
- market-order idempotency plus insufficient-funds/share failures;
- watchlist add/remove replay, inactive asset, and cross-game asset rejection;
- notification pagination, mark-read replay, foreign delivery rejection, and
  an oversized request rejection;
- response-size, query-bound, p95 latency, and database-call-count assertions;
- browser verification that no runner/service credential or backend UUID is
  displayed, stored, placed in a URL, or emitted in client logs.

## Remaining terminal backend backlog

These frontend endpoint keys deliberately remain fail-closed. They must be
implemented as bounded capabilities, not guessed aliases to legacy routes.

| Priority | Domain | Missing production operations |
| --- | --- | --- |
| P0 | Release safety | Rate limits, request IDs, structured route metrics, staged E2E authorization matrix, migration replay, restore rehearsal |
| P1 | Inventory actions | Use/consume/equip with atomic quantity checks, idempotency, ledger/audit linkage, and refresh contract |
| P1 | Banking | Player transfer, savings transfer, account policy, recipient verification, reservations, atomic double-entry ledger writes |
| P1 | Marketplace | Listing read/create/cancel/purchase with reservations, fees, concurrency control, settlement, and idempotency |
| P2 | Business | Business summary, production runs, product pricing, and hiring with game rules and atomic resource use |
| P2 | Crafting | Recipe reads and atomic crafting with reserved inputs, output inventory, and replay protection |
| P2 | Loans | Offers, applications, repayments, amortization, delinquency, and double-entry ledger integration |
| P2 | Messaging | Thread reads and sends with membership authorization, content limits, moderation, retention, and abuse controls |
| P2 | Progression | Summary, unlock, and reward claim with prerequisite checks and one-time atomic awards |

Preview data must not be promoted as a source for these domains. Their controls
remain disabled or explicitly unavailable until both route and data invariants
exist.

## Production gates

- backend and frontend branches are rebased on current `main` with a reviewable
  diff;
- clean migration replay succeeds twice and repository/live history is mapped;
- no live schema or function was edited outside the release path;
- Edge and browser artifacts have immutable hashes in the release manifest;
- cross-game and cross-player authorization tests pass for every new route;
- money, contract, inventory, notification, and watchlist replay tests pass;
- rate limiting, safe structured logs, alerts, and rollback ownership exist;
- an isolated restore meets the approved RPO/RTO;
- the pilot has an owner, cohort limit, support window, rollback trigger, and
  post-release observation window.

## Rollback boundary

Disable the new terminal capability first, then restore the prior frontend and
Edge artifacts. Do not delete the watchlist table or reverse an applied
migration during the incident. Preserve new rows, investigate from scoped audit
data, and use a reviewed forward corrective migration if database repair is
required.
