# Player Backend Donor Accounting

Date: 2026-07-18  
Target PR: #158  
Donor PRs: #141 and #143  
Policy: review and redesign bounded Backend behavior; never merge or restore donor trees wholesale

## Current accounting

| Donor component | Classification | PR #158 result |
|---|---|---|
| PR #141 player request scope | Replaced by a safer design | Complete. One authoritative token-derived player/game/session boundary rejects expired, revoked, inactive, wrong-game, and UUID-injected requests. |
| PR #141 World reads | Reviewed and redesigned | Complete. Countries, country detail, and news use public identifiers, bounded parsing, separate service/repository layers, and UUID-private DTOs. |
| PR #141 Market collection | Reviewed and redesigned | Complete. Public ticker IDs, bounded pagination, current tick volume, explicit empty/unavailable states, and no stock-table UUIDs. |
| PR #141 Market detail/history | Reviewed and redesigned | Complete. Public ticker route, 1–500 history bound, same-game internal resolution, duplicate detection, deterministic ascending history. |
| PR #141 stock watchlists | Reviewed and redesigned | Complete in the current tranche. Public ticker routes, token-derived ownership, deterministic reads, idempotent PUT/DELETE, forward-only migration, forced RLS, and browser privilege denial. |
| PR #141 Inventory reads | Pending review | Must be reconciled independently after watchlists. |
| PR #141 notifications | Pending review | List/read routes remain donor candidates. |
| PR #141 logout | Pending review | Session revocation behavior remains a donor candidate. |
| PR #141 atomic Contract acceptance | Pending manual reconciliation | Must preserve the merged submission, review, reward, and idempotency lifecycle. |
| PR #143 capability manifest | Pending safer redesign | Must be generated from actual Backend support and must not advertise incomplete mutations. |
| PR #143 Inventory redemption | Pending migration and transaction review | Requires a fresh migration, restricted RPC grants, retry-safe state transitions, and Backend-only player/Admin routes. |

## Behavior retained in redesigned form

- authenticated player-session boundary;
- service-role persistence behind Edge routes;
- game-isolated reads and writes;
- deterministic ordering and explicit bounds;
- explicit service-unavailability mapping;
- current stock pricing and latest-tick integration;
- idempotent desired-state watchlist mutations.

## Behavior intentionally changed

- Browser callers never select game, player, owner, session, or stock-table UUID scope.
- Country detail uses a public country code.
- Market assets and watchlists use normalized public tickers.
- Internal player, session, game, assignment, watchlist, and stock-row UUIDs are not serialized.
- Market detail history is capped at 500 and returned in ascending chart order.
- Unsupported parameters fail closed.
- A valid empty state is distinct from persistence unavailability.
- Watchlist PUT and DELETE accept no body and use database constraints for idempotency.
- The donor watchlist UUID route was rejected.
- The donor migration timestamp was not reused; PR #158 uses a fresh forward-only version.

## Stock watchlist file accounting

| Donor file or behavior | Classification | PR #158 result |
|---|---|---|
| `playerStockMarketWatchlistRoutePaths.ts` | Redesigned | Replaced UUID paths with exact collection and public-ticker item routes. |
| embedded watchlist parsing | Redesigned | Separate bounded parser rejects duplicate/unknown fields, identity injection, mutation query strings, and mutation bodies. |
| watchlist HTTP handler | Redesigned | Uses `resolvePlayerRequestScope`, private no-store controls, shared error envelopes, and no client ownership inputs. |
| `stockMarketWatchlistContracts.ts` | Redesigned | Separates internal UUID-bearing records from browser-safe ticker DTOs and exposes explicit idempotency state. |
| `supabaseStockMarketWatchlistRepository.ts` | Redesigned | Resolves ticker inside the authenticated game, batches list assets, treats unique conflict and missing delete as idempotent, and permits stale-row removal after deactivation. |
| donor watchlist migration | Redesigned | New migration `20260718064000_add_player_stock_watchlist_v1.sql`; composite FKs, unique ownership key, active-scope insert trigger, forced RLS, browser privilege revocation, service-role least privilege. |
| donor dispatcher edits | Rejected wholesale | Current public stock-route facade was extended additively; the donor dispatcher was not restored. |
| donor tests | Redesigned | Current route, parser, handler, service, repository, privacy, scope, idempotency, migration, and replay gates are authoritative. |

## Watchlist database invariants

- one row per `(game_session_id, player_id, stock_asset_id)`;
- player and asset composite foreign keys enforce same-game ownership;
- PUT requires one active same-game asset;
- insert trigger rechecks active player and asset under database locking;
- DELETE can remove an existing same-game row after the asset becomes inactive;
- direct browser table access is denied;
- no update privilege is granted;
- no production migration execution is authorized by this PR.

## Remaining PR #141 candidates

- Inventory read handler, contracts, repository, and tests;
- notification list/read parser, handler, repository, and tests;
- player-session logout handler and repository;
- atomic Contract acceptance and transaction tests.

## PR #143 candidates

- generated capability registry;
- Inventory redemption schema and RPCs;
- player redemption request routes;
- Admin review and fulfillment routes;
- rollback and replay smoke tests.

## Explicit exclusions

- all donor `admin/**` files;
- all donor `player-terminal/**` files;
- donor root package/workflow changes without a lease;
- historical or conflicting migration versions;
- wholesale dispatcher, lockfile, or domain-tree restoration;
- production migration execution, Edge deployment, Auth change, or runtime cutover.

## Planned extraction sequence

1. authoritative request scope — complete;
2. World reads — complete;
3. Market collection — complete;
4. Market detail/history — complete;
5. stock watchlist reads and writes — implemented; final gates pending;
6. Inventory read;
7. notifications list/read;
8. player logout;
9. generated capability manifest;
10. atomic Contract acceptance;
11. Inventory redemption schema, RPCs, and player/Admin routes;
12. security, replay, runtime contract, staging documentation, and final verification.

## Donor closure rule

PRs #141 and #143 remain open and unmerged until every candidate Backend change is classified as ported, already present, replaced by a safer design, intentionally unsupported, or rejected with rationale. Only then may their branches be deleted.
