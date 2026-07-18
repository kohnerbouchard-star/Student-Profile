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
| PR #141 stock watchlists | Reviewed and redesigned | Complete. Public ticker routes, token-derived ownership, deterministic reads, idempotent PUT/DELETE, forward-only migration, forced RLS, and browser privilege denial. |
| PR #141 Inventory reads | Reviewed and redesigned | Complete. Public item keys, token-derived ownership, 200-holding bound, batched Store metadata, UUID-private DTOs, explicit empty/unavailable states, and no new migration. |
| PR #141 notifications | Replaced by safer design | PR #158 uses independent public notification/delivery IDs, bounded cursor reads, and scoped idempotent mark-read. |
| PR #141 logout | Replaced by safer design | PR #158 revokes the exact token-owned session and treats repeated logout as success without UUID output. |
| PR #141 atomic Contract acceptance | Pending manual reconciliation | Must preserve the merged submission, review, reward, and idempotency lifecycle. |
| PR #143 capability manifest | Pending safer redesign | Must be generated from actual Backend support and must not advertise incomplete mutations. |
| PR #143 Inventory redemption | Pending migration and transaction review | Requires a fresh migration, restricted RPC grants, retry-safe state transitions, and Backend-only player/Admin routes. |

## Behavior retained in redesigned form

- authenticated player-session boundary;
- service-role persistence behind Edge routes;
- game-isolated reads and writes;
- deterministic ordering and explicit bounds;
- explicit empty-state versus service-unavailability semantics;
- current Store, Inventory, and stock persistence foundations;
- idempotent desired-state watchlist mutations.

## Behavior intentionally changed

- Browser callers never select game, player, owner, session, holding, Store-item, watchlist, or stock-table UUID scope.
- Country detail uses a public country code.
- Market assets and watchlists use normalized public tickers.
- Inventory uses stable per-game Store item keys as public identifiers.
- Internal player, session, game, assignment, holding, Store-item, watchlist, and stock-row UUIDs are not serialized.
- Market detail history is capped at 500 and returned in ascending chart order.
- Inventory is capped at 200 holdings and uses two bounded batch queries.
- Unsupported parameters fail closed.
- A valid empty state is distinct from persistence unavailability.
- Watchlist PUT and DELETE accept no body and use database constraints for idempotency.
- Generic Inventory item use remains unsupported until the redemption contract is implemented.
- Donor migration timestamps are not reused.

## Inventory file accounting

| Donor file or behavior | Classification | PR #158 result |
|---|---|---|
| `playerInventoryHttpHandler.ts` | Redesigned | Split into exact route parser, bounded request parser, authoritative-scope HTTP handler, service, and repository layers. |
| donor Inventory route handling | Redesigned | Exact direct and `classroom-api` collection paths; spoofed prefixes and item paths fail closed. |
| donor request parsing | Unsupported in donor; added | No query parameters, no browser game scope, no ownership UUID inputs, GET only, and no runner secret. |
| `playerInventoryContracts.ts` | Redesigned | Internal UUID-bearing records are separated from browser-safe item-key DTOs. Response-level game/player UUID objects were rejected. |
| `playerInventoryRepository.ts` | Redesigned | Repository input requires authenticated game/player scope and an explicit hard limit. |
| `supabasePlayerInventoryRepository.ts` | Redesigned | Two bounded queries, positive holdings only, same-game batch metadata, strict field validation, over-limit rejection, and no per-item query loop. |
| donor Inventory DTO identifiers | Rejected | Holding UUID, Store-item UUID, player UUID, game UUID, and session UUID are not serialized. |
| donor client game verification hint | Rejected | Inventory accepts no browser-selected game scope; scope comes only from the active player session. |
| donor unbounded holding reads | Rejected | Maximum 200 holdings with one-row lookahead. |
| donor `availableActions` behavior | Retained as unsupported | `availableActions` remains empty; item use and redemption are deferred. |
| donor tests | Redesigned | Current route, parser, handler, service, repository, bounds, privacy, empty-state, unavailable-state, and cache-control tests are authoritative. |
| Inventory migration | Already present | Existing `inventory_holdings` and `store_items` schema is sufficient; this read-only tranche adds no migration. |
| donor dispatcher edits | Rejected wholesale | Current `classroom-api` dispatcher was extended additively. |

## Inventory invariants

- one holding is scoped by authenticated game, player, and Store item;
- only positive owned quantities are returned;
- reserved quantity cannot exceed owned quantity;
- Store metadata must resolve inside the same game;
- duplicate public item keys fail closed;
- maximum 200 browser-visible holdings;
- public item identity is the stable per-game item key;
- successful responses are private and non-cacheable;
- no direct browser table access or production schema change is introduced.

## Remaining PR #141 candidates

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
5. stock watchlist reads and writes — complete;
6. Inventory read — complete;
7. notifications list/read — replaced by authoritative PR #158 implementation;
8. player logout — replaced by authoritative PR #158 implementation;
9. generated capability manifest — in progress as a safer reviewed allowlist;
10. atomic Contract acceptance;
11. Inventory redemption schema, RPCs, and player/Admin routes;
12. security, replay, runtime contract, staging documentation, and final verification.

## Donor closure rule

PRs #141 and #143 remain open and unmerged until every candidate Backend change is classified as ported, already present, replaced by a safer design, intentionally unsupported, or rejected with rationale. Only then may their branches be deleted.
