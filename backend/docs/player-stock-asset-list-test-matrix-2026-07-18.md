# Player Stock Asset List Test Matrix

**Date:** 2026-07-18  
**Branch:** `agent/player-backend-reconciliation-v2`

## Verification scope

| Layer | Required behavior | Automated coverage |
|---|---|---|
| Route parser | Accept only `/players/me/stocks/assets` | exact collection path test |
| Route parser | Reject detail or additional path segments in this checkpoint | malformed route test |
| Request parser | Default to `limit=50`, `offset=0` | default parser test |
| Request parser | Enforce `limit` 1–100 and `offset` 0–10,000 | lower, upper, fractional, and duplicate tests |
| Request parser | Reject unsupported query fields | unsupported `historyLimit` test |
| Request parser | Reject client-selected game scope | query and header injection tests |
| Authentication | Require `x-player-session-token` | missing-session handler test |
| Authentication | Derive immutable player and game scope from the active session | handler dependency and repository-input assertions |
| Security | Reject stock runner secret | handler runner-secret test |
| HTTP | Reject non-GET methods | handler method test |
| Repository | Query only active assets in the authenticated game | fake-query scope assertions |
| Repository | Use one bounded asset query and one existing latest-tick RPC | query-count and RPC-argument assertions |
| Repository | Preserve lookahead pagination bounds | range assertion |
| Repository | Map missing schema and read failures | persistence error tests |
| Service | Deterministically order by ticker and internal tie-breaker | unordered fixture test |
| Service | Return normalized ticker as public `assetId` | DTO assertion |
| Service | Reject duplicate ticker collisions | public-ID collision test |
| Service | Reject any cross-game asset or tick record | scope-violation test |
| Service | Compute change percentage and current volume | DTO assertions |
| Privacy | Exclude player, session, game, and stock-asset UUIDs | serialized-response negative assertions |
| Pagination | Return `hasMore` and `nextOffset` from bounded lookahead | pagination assertion |
| Empty state | Return successful `stock_market_not_initialized` state | empty-market test |
| Availability | Map persistence failure to retryable 503 | service-unavailable test |
| Response | Apply private no-store and Vary headers | handler header assertions |
| Dispatcher | Route collection path before existing portfolio/order routes | classroom-api Edge typecheck and source diff |

## Canonical command

```text
npm --prefix backend run test:player-market-assets
```

The suite is also part of:

```text
npm --prefix backend run test:smoke
```

## Repository gates

This checkpoint is not complete until the current head passes:

- Backend Typecheck;
- Repository Quality;
- the canonical player Market asset-list suite;
- effective-diff verification restricted to `backend/**`.

Admin Shell Smoke may run as a repository regression gate after shared dispatcher changes; it must not be weakened or bypassed.
