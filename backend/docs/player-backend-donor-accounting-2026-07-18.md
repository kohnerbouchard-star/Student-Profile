# Player Backend Donor Accounting

Date: 2026-07-18  
Target PR: #158  
Donor PRs: #141 and #143  
Policy: extract reviewed backend behavior only; never merge or restore donor trees wholesale

## Accounting status

| Donor component | Classification | Reconciliation result |
|---|---|---|
| PR #141 `backend/src/domains/players/api/playerRequestScope.ts` | Replaced by a safer design | Reconciled into the same Backend-owned path with one authoritative `resolvePlayerRequestScope` boundary, immutable `playerUuid` naming, server-derived game scope, active-session validation, wrong-game rejection, query/header/body ownership-injection rejection, recipient UUID rejection, and compatibility exports for bounded route ports. |
| PR #141 World reads | Reviewed and redesigned | Countries list, country detail, and world news are implemented on PR #158 through separate route, request-parser, handler, service, repository-contract, Supabase-repository, DTO, and test layers. |
| PR #141 Market asset list | Reviewed and redesigned | The authenticated asset collection is implemented through a new route, bounded parser, service, repository contract, Supabase repository, public ticker identifier, UUID-private DTO, dispatcher handoff, and focused tests. Donor files were not copied wholesale. |
| PR #141 remaining authenticated read domains | Pending review | Market detail/history, Inventory, notifications, watchlists, and logout remain unreviewed and must be reconciled independently. |
| PR #141 atomic Contract acceptance | Pending manual reconciliation | Must be added to the current Contracts lifecycle without replacing merged submission, review, reward, or idempotency behavior. |
| PR #143 capability manifest | Pending safer redesign | Must be generated from actual Backend support and must not advertise frontend-only mutations. |
| PR #143 Inventory redemption | Pending migration and transaction review | Requires a fresh forward-only migration, restricted RPC grants, retry-safe transitions, and Backend-only route contracts. |

## World tranche file accounting

Every World donor file was reviewed independently. No donor directory or dispatcher tree was copied wholesale.

| Donor file or behavior | Classification | Result on PR #158 |
|---|---|---|
| `backend/src/domains/countries/api/playerWorldRoutePaths.ts` | Redesigned | Retains strict direct and `classroom-api` path recognition while rejecting spoofed prefixes and extra segments. |
| `backend/src/domains/countries/api/playerWorldRoutePaths.test.ts` | Redesigned | Rewritten around the current three-route tranche and public country-code detail path. |
| `backend/src/domains/countries/api/playerWorldReadHttpHandler.ts` | Redesigned | Split into request parsing, authorization scope, service, repository, and DTO layers. The handler now uses `resolvePlayerRequestScope` and never accepts browser-selected game ownership. |
| `backend/src/domains/countries/api/playerWorldReadHttpHandler.test.ts` | Redesigned | Covers the three valid routes, missing/expired/revoked/wrong-game sessions, UUID injection, empty news, and browser DTO UUID privacy. |
| `backend/src/domains/countries/contracts/playerWorldReadContracts.ts` | Redesigned | Internal UUID-bearing persistence records are separated from browser-safe DTOs. Public country codes and public event IDs are the only resource identifiers published. |
| `backend/src/domains/countries/infrastructure/supabasePlayerWorldReadRepository.ts` | Redesigned | Queries active country profiles only through authenticated-game snapshots, derives player assignment from the authenticated player UUID, and filters news by authenticated game, public visibility, and active publication state. |
| `backend/src/domains/countries/infrastructure/supabasePlayerWorldReadRepository.test.ts` | Redesigned | Verifies game filters, active-country filters, player assignment scope, deterministic news ordering, cursor filtering, cross-game rejection, and safe media normalization. |
| Donor World request parsing embedded in the handler | Redesigned | Moved to `playerWorldRequestParser.ts` with bounded limits, category allowlisting, stable cursor parsing, public country-code validation, unknown-query rejection, and explicit prohibition of browser-selected game scope. |
| Donor World DTO mapping embedded in the handler | Redesigned | Moved behind `PlayerWorldReadService`; internal player, game, assignment, profile, snapshot, and database row UUIDs are excluded from browser models. |
| Donor World service layer | Unsupported in donor | A dedicated `PlayerWorldReadService` was added to validate repository scope, distinguish empty data from unavailable service, sort deterministically, paginate, and map browser-safe DTOs. |
| Donor `classroom-api` dispatcher modifications | Redesigned | Only the current dispatcher received an additive World route-parser handoff. The donor dispatcher was not restored. |
| Donor acceptance of UUID country identifiers | Rejected | Country detail accepts a public country code only. Browser callers cannot address internal country-profile UUIDs. |
| Donor `playerCountryProfileId`, game-session, player, snapshot, and event database IDs in responses | Rejected | These internal UUIDs are not published. Assignment is represented only through `isPlayerCountry`. |
| Donor offset-free limit-only news page | Redesigned | World news uses deterministic `created_tick DESC, shock_id DESC` ordering and a stable cursor contract with a maximum page size. |

## World behavior retained from the donor

The following concepts remain valid and were reimplemented rather than copied:

- one bounded route parser for countries, country detail, and news;
- service-role Supabase reads behind an authenticated player-session boundary;
- active country profiles and latest effective per-game economic snapshots;
- player country assignment derived from the authenticated player and game;
- public and active world-news filtering;
- deterministic ordering and explicit limits;
- safe media extraction from bounded metadata;
- persistence errors mapped to player-safe service responses.

## World behavior intentionally changed

- The browser cannot provide a game ID even as a normal selector. Game scope comes only from the active player session.
- Country detail no longer accepts a country-profile UUID.
- Browser DTOs no longer contain game, player, assignment, profile, snapshot, or event database UUIDs.
- A successful empty news response is `200` with `items: []`; persistence unavailability is a distinct retryable service error.
- News pagination is cursor-based and deterministic.
- Unsupported query parameters fail closed instead of being ignored.
- The Player Terminal receives only active countries with an authoritative snapshot in the authenticated game.

## Market asset-list tranche accounting

The donor Market list was reviewed file by file and redesigned around the current authoritative request scope and current Player Terminal response contract.

| Donor file or behavior | Classification | Result on PR #158 |
|---|---|---|
| donor Market route parser | Redesigned | The current checkpoint recognizes only the exact asset collection path. Detail paths remain deliberately malformed until the next tranche. |
| donor embedded query parsing | Redesigned | Moved to `playerStockAssetListRequestParser.ts` with bounded `limit` and `offset`, duplicate rejection, unknown-query rejection, and explicit game-scope injection rejection. |
| donor Market HTTP handler | Redesigned | Uses `resolvePlayerRequestScope`, prohibits the runner secret, derives game scope from the player session, and delegates mapping to a service. |
| donor asset contracts | Redesigned | Internal UUID-bearing asset and tick records are separated from the browser DTO. The public `assetId` is the normalized ticker. |
| donor Market repository | Redesigned | Uses one active-asset query scoped to the authenticated game plus one existing latest-tick RPC. There is no per-asset query. |
| donor Market response mapping | Redesigned | Adds deterministic sector and asset ordering, bounded lookahead pagination, current volume, calculated change percentage, and explicit empty/unavailable states. |
| donor response containing stock-asset UUID | Rejected | Internal stock-asset, player, session, and game UUIDs are never serialized. Duplicate tickers fail closed rather than falling back to UUIDs. |
| donor dispatcher edits | Redesigned | Only the current `classroom-api` dispatcher received the additive collection-route handoff. |
| donor Market tests | Redesigned | Focused route, parser, handler, service, repository, privacy, scope, empty-state, and unavailability tests were added. |

## Market behavior retained from the donor

- authenticated player-session boundary;
- active per-game stock assets;
- current asset prices and current latest-tick volume;
- deterministic bounded pagination;
- explicit service-unavailability mapping.

## Market behavior intentionally changed

- The browser cannot select a game through query parameters or headers.
- The list route accepts only the asset collection path in this checkpoint.
- The browser receives the public ticker as `assetId`, never the stock-table UUID.
- A valid game with no active assets returns a successful `stock_market_not_initialized` empty state.
- Persistence failure is a distinct retryable 503 response.
- The existing order-settlement implementation is preserved. A later mutation-boundary tranche must resolve the public ticker to exactly one active internal asset inside the authenticated game before settlement.

## PR #141 remaining candidate backend behavior

The following areas still contain potentially unique behavior and remain open for later bounded review:

- Inventory read handler, DTOs, repository, and tests;
- player notification list/read handlers, request parser, route parser, DTOs, repository, and tests;
- player session logout handler and repository;
- stock asset detail/history handler, route parser, contracts, repository, and tests;
- stock watchlist handler, route parser, contracts, repository, and tests;
- atomic Contract acceptance route/handler/repository behavior and transaction tests;
- forward Contract-acceptance and stock-watchlist migrations, subject to current migration-history and privilege review.

## Review-only modifications

These donor files may contain useful corrections but must continue to be diffed against current `main` rather than copied:

- current Contract list/submission implementation and repository contracts;
- player ledger handler;
- shared Edge response helpers;
- `classroom-api` dispatcher;
- backend package metadata and lockfile;
- Supabase function lock/config files;
- stock service documentation.

## Explicitly excluded from donor import

- all `admin/**` changes;
- all `player-terminal/**` changes;
- root package and lockfile changes without a lease;
- GitHub workflows without a lease;
- broad repository governance files already represented on current `main`;
- historical migrations already present on current `main`;
- any donor migration version that conflicts with current forward history.

## PR #143 accounting

### Candidate backend behavior to reconcile

- authoritative player capability registry;
- capability-manifest integration into player bootstrap;
- Inventory redemption route parser and HTTP handlers;
- Inventory redemption backend tests;
- Inventory DTO extensions required for redemption status and action policy;
- Admin API backend routes and normalization for redemption review;
- forward-only Inventory redemption migration design;
- rolled-back database workflow smoke test.

### Required redesign or repair before porting

- Capability status must be generated from authoritative backend support and must not advertise frontend-only or incomplete mutations.
- Admin support must be exposed through backend contracts only; donor Admin JavaScript and CSS are excluded.
- The redemption migration must be assigned a unique version after comparing current migration history; do not reuse or renumber an applied migration.
- RPC grants, `search_path`, RLS, service-role behavior, and direct anon/authenticated denial require explicit verification.
- Player ownership and game scope must be derived from the active player session, independent of browser payloads.
- Admin review must validate staff role and game ownership and use deterministic transitions and pagination.
- Known donor TypeScript and Admin source-contract failures must not be imported.

### Explicitly excluded from donor import

- `admin/css/player-scope-readiness.css`;
- `admin/player-scope-readiness.js`;
- donor edits to `admin/index.html`;
- all donor `player-terminal/**` changes;
- workflow edits without an explicit lease;
- generic root scripts without an explicit lease.

## Planned extraction sequence

1. Reconcile the authoritative player request scope — **complete**.
2. Reconcile World countries list, country detail, and world news — **complete**.
3. Reconcile Market asset list — **implemented; current gates pending**.
4. Reconcile Market asset detail/history and watchlists independently.
5. Reconcile Inventory, notifications, and logout independently.
6. Add the capability registry only after actual route support is known.
7. Reconcile Contract acceptance manually with current list/submission/review/reward semantics.
8. Design a fresh forward redemption migration, then implement and test RPCs.
9. Add player and Admin redemption routes after database transaction semantics are green.
10. Publish consumer contracts; do not modify Admin or Player Terminal code in this PR.

## Donor closure rule

PRs #141 and #143 remain open and unmerged until every candidate backend change is classified as:

- ported;
- already present on current `main`;
- intentionally replaced by a safer design;
- intentionally unsupported;
- rejected with rationale.

Only after that accounting is complete may the donor PRs be closed and their branches deleted.
