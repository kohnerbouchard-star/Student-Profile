# Player Notification Test Matrix

Date: 2026-07-18  
Pull request: #158

| Area | Required assertion |
|---|---|
| Routes | Exact list and mark-read paths are accepted directly and under `classroom-api`. |
| Routes | Item, extra-segment, and spoofed-prefix paths fail closed. |
| Methods | List is GET-only; mark-read is POST-only. |
| Authentication | Missing, expired, revoked, inactive, and invalid-scope sessions are rejected. |
| Injection | Player/owner/session UUID query, header, and body injection is rejected. |
| Game scope | Browser game query and game headers are rejected. |
| Secret boundary | Stock-runner secret is rejected. |
| List parser | Status default and enum are enforced. |
| List parser | Limit defaults to 20 and is bounded 1–50. |
| Cursor | Public-delivery cursor round trips and malformed values fail closed. |
| Ordering | Newest delivery then public delivery ID descending. |
| Pagination | One-row lookahead determines `hasMore` and next cursor. |
| Empty state | No matching deliveries returns `200` and `notifications_empty`. |
| Repository | Deliveries are filtered by authenticated game and player. |
| Repository | Notification metadata is same-game and batch-loaded. |
| Repository | Generic inbox does not select notification payload JSON. |
| Public IDs | Migration backfills and defaults independent notification and delivery public IDs. |
| Public IDs | Public ID format and uniqueness are database-enforced. |
| Privacy | Browser response contains no persistence or ownership UUIDs. |
| Mark read | Body is a bounded JSON object with exactly `deliveryIds`. |
| Mark read | 1–50 unique public delivery IDs are accepted. |
| Mark read | Internal UUIDs and compatibility `notificationIds` are rejected. |
| Mark read | Missing/foreign delivery set returns `404` without partial disclosure. |
| Idempotency | Already-read deliveries remain successful and count as already read. |
| Mutation | Unread rows receive the authoritative request timestamp only. |
| Concurrency | Final state is re-read; unresolved state returns retryable `409`. |
| Unavailable | Schema/read/write failures return retryable `503`. |
| Caching | Success responses are private, no-store, and vary by authorization/session. |
| Dispatcher | `classroom-api` dispatches Notifications before generic fallthrough. |
| Migration | Source validation, zero-state replay twice, and database lint pass. |

## Required gates

- Backend Typecheck and all Edge graph checks;
- focused notification route, parser, handler, service, repository, privacy, and idempotency tests;
- canonical Backend smoke suite;
- Repository Quality;
- Admin API Check;
- Database Replay.

No production migration or Edge deployment is authorized by these tests.
