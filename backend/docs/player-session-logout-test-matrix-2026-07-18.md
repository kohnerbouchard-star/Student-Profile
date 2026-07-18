# Player Session Logout Test Matrix

Date: 2026-07-18  
Pull request: #158

| Area | Required assertion |
|---|---|
| Route | Exact direct and `classroom-api` logout paths are accepted. |
| Route | Session collection, extra-segment, and unrelated paths fail closed. |
| Method | Logout is POST-only. |
| Authentication | Missing and unknown tokens return `401`. |
| Authentication | Expired, inactive, and malformed sessions return `401`. |
| Scope | Active player, game, and session scope is revalidated before revocation. |
| Injection | Player, owner, recipient, session, and game identifiers are rejected in query, headers, and body. |
| Secret boundary | Stock-runner secret is rejected. |
| Body | Empty body and empty JSON object are accepted. |
| Body | Non-object, malformed, non-empty, and over-1,024-byte bodies are rejected. |
| Repository | Lookup uses only the hashed session token. |
| Repository | Conditional update matches internal session UUID, game ID, player UUID, token hash, active status, and null revocation. |
| Mutation | First logout sets `status = revoked` and the authoritative timestamp. |
| Idempotency | Repeated logout with the same revoked token returns success with `alreadyLoggedOut: true`. |
| Concurrency | A concurrent winner is detected by re-reading the exact token-owned row. |
| Conflict | Unresolved concurrent state returns retryable `409`. |
| Privacy | Success and error DTOs contain no internal UUIDs. |
| Caching | Success uses `private, no-store` and varies by authorization/session token. |
| Unavailable | Repository failure returns retryable `503`. |
| Dispatcher | `classroom-api` resolves logout before the generic `/players/me` route. |
| Regression | Focused route, handler, and repository tests are part of the canonical Backend smoke suite. |

## Required gates

- Backend Typecheck and all Edge graph checks;
- focused logout route, handler, repository, privacy, idempotency, and conflict tests;
- canonical Backend smoke suite;
- Repository Quality;
- Admin API Check;
- Database Replay.

No production Edge deployment or Auth mutation is authorized by these tests.
