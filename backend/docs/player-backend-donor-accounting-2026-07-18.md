# Player Backend Donor Accounting

Date: 2026-07-18  
Target PR: #158  
Donor PRs: #141 and #143  
Policy: review and reconcile individual Backend behaviors; never merge or restore donor trees wholesale

## Current accounting status

| Donor component | Classification | Result on PR #158 |
|---|---|---|
| Player request scope | Replaced by a safer design | One authoritative `resolvePlayerRequestScope` derives immutable player UUID, active session, and game scope from `x-player-session-token` and rejects ownership injection. |
| World countries, detail, and news | Reviewed and redesigned | Implemented through separate route, parser, handler, service, repository, DTO, and test layers. Internal database UUIDs are not published. |
| Market asset collection | Reviewed and redesigned | Implemented at `GET /players/me/stocks/assets` with bounded pagination, ticker public IDs, one active-asset query, one latest-tick RPC, explicit empty state, and UUID-private DTOs. |
| Market asset detail and history | Reviewed and redesigned | Implemented at `GET /players/me/stocks/assets/:assetId` with ticker resolution, a 500-point maximum, game/asset/ticker history scope, ascending chart output, and no internal UUID exposure. |
| Stock watchlist | Pending | Requires ownership persistence, mutation validation, migration review, and public-ticker resolution before implementation. |
| Inventory read | Pending | Must be reconciled independently against current Inventory and Store ownership semantics. |
| Notifications and logout | Pending | Must be reconciled independently with current session and notification persistence. |
| Contract acceptance | Pending manual reconciliation | Must preserve the merged Contract lifecycle, review, reward, and idempotency behavior. |
| Capability manifest | Pending safer redesign | Must be generated from actual Backend support and must not advertise incomplete frontend actions. |
| Inventory redemption | Pending migration and transaction review | Requires a fresh forward-only migration, restricted RPC grants, retry-safe transitions, and Backend-only routes. |

## World reconciliation

The useful donor concepts were reimplemented rather than copied:

- one bounded route parser for country collection, country detail, and news;
- service-role reads behind the authenticated player-session boundary;
- active country profiles and latest effective per-game snapshots;
- player country assignment derived from the authenticated player and game;
- public and active news filtering;
- deterministic cursor pagination and explicit limits;
- safe media extraction and player-safe persistence errors.

Intentional changes:

- the browser cannot select the game;
- country detail accepts a public country code, not a profile UUID;
- browser DTOs omit player, game, assignment, profile, snapshot, and database event UUIDs;
- empty news is a successful response while persistence failure is retryable unavailability;
- unsupported query parameters fail closed.

## Market collection reconciliation

| Donor behavior | Classification | Current result |
|---|---|---|
| Combined asset route parser | Redesigned | Collection and detail paths share an exact public-ticker route boundary. UUID-shaped identifiers, encoded slashes, and extra segments fail closed. |
| Embedded list query parsing | Redesigned | `playerStockAssetListRequestParser.ts` validates bounded `limit` and `offset`, duplicates, unknown parameters, and game-scope injection. |
| Collection handler | Redesigned | Uses the authoritative player request scope, prohibits the stock runner credential, and delegates mapping to a service. |
| Asset contracts | Redesigned | Internal UUID-bearing records are separated from browser DTOs. Public `assetId` is the normalized ticker. |
| Asset collection repository | Redesigned | Uses one authenticated-game active-asset query and one existing latest-tick RPC, with no per-asset query. |
| Collection response | Redesigned | Deterministic ordering, bounded lookahead pagination, current volume, calculated change, sectors, and explicit empty/unavailable states. |
| Stock-table UUID in browser response | Rejected | Internal stock-asset, game, player, and session UUIDs are never serialized. Duplicate public tickers fail closed. |

## Market detail and history reconciliation

| Donor behavior | Classification | Current result |
|---|---|---|
| UUID detail route | Rejected | The detail route accepts a public ticker only. The internal stock-row UUID is resolved after authentication. |
| Detail query parsing embedded in handler | Redesigned | `playerStockAssetDetailRequestParser.ts` validates only `historyLimit`, default 200 and maximum 500, and rejects game-scope selection. |
| Detail repository added to legacy board repository | Redesigned | A dedicated player-detail repository resolves one active game/ticker row and then reads history by game, resolved internal row, and ticker. |
| Missing asset behavior | Redesigned | No history query occurs when the ticker is unavailable; the service returns a safe non-retryable 404. |
| History ordering | Retained with stronger validation | Persistence reads newest-first under the SQL bound; the service validates scope and duplicate tick indices, then returns ascending chart order. |
| Latest tick RPC plus history query | Simplified | Detail derives displayed volume and response tick from the newest bounded history point, avoiding an unnecessary extra RPC. |
| Detail browser DTO | Redesigned | Reuses the collection DTO mapper and omits game, player, session, and internal stock-row UUIDs. |
| Donor watchlist enrichment | Deferred | `isWatchlisted` remains absent until ownership persistence and watchlist routes are reconciled. |

## Behavior intentionally preserved

- the current stock-market calculation and tick tables;
- the existing latest-tick RPC for collection reads;
- the existing Market order settlement path;
- active per-game asset visibility;
- deterministic bounded reads;
- player-safe service-unavailability mapping.

The Market mutation boundary must later resolve the public ticker to exactly one active internal stock row inside the authenticated game before invoking existing settlement. The settlement implementation itself must not be replaced from the donor branch.

## Remaining PR #141 candidate behavior

- stock watchlist schema, repository, reads, and idempotent mutations;
- Inventory read handler, DTO, repository, and tests;
- notification list/read routes, parser, repository, and tests;
- player session logout handler and repository;
- atomic Contract acceptance behavior and transaction tests;
- forward migrations for watchlists and Contract acceptance, subject to current migration-history review.

## PR #143 candidate behavior

- authoritative capability registry and bootstrap projection;
- Inventory redemption request and review contracts;
- player and Admin redemption routes;
- forward-only redemption migration and restricted RPCs;
- rolled-back database workflow verification.

Required redesign remains:

- capabilities must reflect actual Backend support;
- Admin support must be exposed through Backend contracts only;
- migrations must receive unique forward versions;
- RPC grants, `search_path`, RLS, service-role access, and browser-role denial require explicit verification;
- player ownership and game scope must come from the active player session;
- Admin transitions must validate role, game ownership, idempotency, and deterministic pagination.

## Explicit exclusions

- all donor `admin/**` changes;
- all donor `player-terminal/**` changes;
- root package, lockfile, workflow, and governance changes without an explicit lease;
- historical migrations already represented on current `main`;
- any migration version that conflicts with current forward history;
- wholesale dispatcher, domain-directory, or repository replacement.

## Remaining extraction sequence

1. Player request scope — **complete**.
2. World countries, detail, and news — **complete**.
3. Market asset collection — **complete**.
4. Market asset detail and bounded history — **complete**.
5. Stock watchlist reads and writes.
6. Inventory read.
7. Notifications list/read and player logout.
8. Capability manifest generated from implemented support.
9. Atomic Contract acceptance reconciled manually.
10. Forward Inventory redemption migration, RPCs, player routes, and Admin routes.
11. Security review, replay, runtime contract, staging documentation, and final verification.

## Donor closure rule

PRs #141 and #143 remain open and unmerged until every candidate Backend change is classified as ported, already present, replaced by a safer design, intentionally unsupported, or rejected with rationale. Only then may the donor PRs be closed and their branches deleted.
