# v7.5 Architecture: Before and After

## Startup and failure isolation

| Concern | v7.4 | v7.5 |
| --- | --- | --- |
| Startup reads | Eighteen reads in one `Promise.all()` | Session, dashboard, optional notifications, then active-route resources |
| Unsupported service | Could reject the complete bootstrap | Capability-gated and isolated to its route |
| Navigation | All fifteen routes always visible | Only declared connected routes visible; preview retains all routes |
| Route failure | Could become a full connection error | Local route error with retry; shell remains available |
| Production preview | Could activate when integration was absent | Disabled for production and staging |

## Transport and write integrity

| Concern | v7.4 | v7.5 |
| --- | --- | --- |
| Adapter timeout | Host promise awaited without a bound | Bounded timeout plus abort signal |
| Request tracing | No stable request identifier | Request ID on every read and write |
| Duplicate reads | Independent requests | In-flight deduplication and read cache |
| Duplicate writes | Button state only | Per-action/resource serialization, cooldown, and idempotency key |
| HTTP player token | Not sent | `x-econovaria-player-session-token` |
| Rate limiting | Generic request failure | Safe 429 state with parsed Retry-After |
| Error messages | Backend message could reach the player | Stable player-safe envelope; raw backend details discarded |
| Successful writes | Toast only; visible data stale | Targeted authoritative refetch |

## Preserved contracts

- The host application still owns login, session replacement, and sign-out.
- The terminal still consumes `playerSessionToken`, `gameSessionId`, and `playerSessionId` through the session handoff.
- `endpointKey` remains the stable frontend-to-host adapter contract.
- Backend authorization, rate limits, idempotency persistence, ownership checks, and atomic economic settlement remain server responsibilities.
- The approved v7 CSS, icons, ten-country geometry, unobstructed map, responsive layout, and fifteen route renderers remain intact.

## Next integration slice

After v7.5 is reviewed, the first staging connection should remain limited to:

```text
Host sign-in
→ session validation
→ dashboard
→ Store catalog and quote
→ Store purchase
→ authoritative inventory and banking refresh
```

Contracts and stock-market reads/writes should follow as separate reviewed slices. Business, Marketplace, Crafting, Loans, Messages, and Progression stay capability-gated until their backend contracts exist.
