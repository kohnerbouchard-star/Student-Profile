# Player Inventory Read Test Matrix

Date: 2026-07-18  
Pull request: #158

| Area | Required assertion |
|---|---|
| Route | Exact direct and `classroom-api` `/players/me/inventory` paths are accepted. |
| Route | Spoofed function prefixes are rejected. |
| Route | Item/detail and unrelated paths are rejected or left to other domains. |
| Parser | Unsupported query parameters are rejected. |
| Scope | Browser-supplied game query and game headers are rejected with `400`. |
| Method | Non-GET requests return `405`. |
| Authentication | Missing session token returns `401`. |
| Authentication | Expired, revoked, inactive, and malformed session scope remain covered by the shared player request-scope suite. |
| Injection | Player/owner UUID query and header injection returns `400`. |
| Secret boundary | Stock-runner secret is rejected. |
| Repository | Holdings are filtered by authenticated game and player. |
| Repository | Only positive owned quantities are read. |
| Repository | Holding reads are capped at 200 with one-row lookahead. |
| Repository | Store metadata is filtered and batch-loaded by the same game. |
| Repository | Missing Store metadata fails closed. |
| Repository | Schema and persistence failures are distinguished internally. |
| Service | Cross-game or cross-player repository output fails closed. |
| Service | More than 200 records and duplicate public item keys fail closed. |
| Quantity | Reserved quantity cannot exceed owned quantity. |
| Quantity | Available quantity equals owned minus reserved. |
| Empty state | No holdings returns `200` and `inventory_empty`. |
| Unavailable state | Persistence failure returns retryable `503`. |
| Ordering | Items and categories are deterministic. |
| Summary | Owned, reserved, available, item-type, and currency totals are authoritative. |
| Action policy | `availableActions` remains empty before redemption support. |
| Privacy | Browser response contains no UUID-shaped values. |
| Caching | Successful response is `private, no-store` and varies by player-session authorization. |
| Dispatcher | `classroom-api` resolves the Inventory route before generic fallthrough. |
| Regression | Backend smoke suite executes route, parser, handler, service, and repository tests. |

## Required gates

- Backend Typecheck;
- Edge graph check;
- focused player Inventory tests;
- canonical Backend smoke suite;
- Repository Quality;
- Admin API Check;
- Database Replay.

No production migration or Edge deployment is required for this read-only tranche.
