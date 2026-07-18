# Player capability manifest contract

## Route

`GET /players/me/capabilities`

The route is authenticated by `x-player-session-token`. Player, game, and active-session scope are derived server-side. The route accepts no query parameters, request body, player/game/owner headers, or stock-runner secret.

Successful responses are `private, no-store` and vary by `authorization, x-player-session-token`.

## Versioning

- `schemaVersion`: integer shape version; currently `1`.
- `manifestVersion`: reviewed capability mapping version; currently `2026-07-18.1`.
- `service`: always `classroom-api` for this contract.

Clients must reject unsupported schema versions. A manifest version change means the reviewed endpoint/capability mapping changed and must be reconciled with the adapter before connected execution.

## Source of truth

`backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts` contains one reviewed endpoint descriptor allowlist. Route and action booleans are generated from that allowlist; they are not maintained as an independent optimistic list.

The first version advertises only the UUID-private routes reviewed on PR #158:

- countries, country detail, and news;
- market collection and ticker detail;
- watchlist list, add, and remove;
- Inventory read;
- notification list and mark-read;
- Player logout;
- the capability route itself.

## Fail-closed exclusions

The first manifest does not advertise the following even when older handlers exist:

- legacy session/bootstrap, dashboard, portfolio, Banking, Store, or Contract paths that still serialize or accept browser-owned internal identifiers;
- market orders before public-ticker resolution is authoritative at the order boundary;
- Contract acceptance before its atomic lifecycle exists;
- Inventory redemption before its migration, RPCs, and state machine exist;
- any expansion feature that is only represented by a Player Terminal surface.

Unsupported route/action keys are returned as `false`. Unsupported endpoints are absent from `endpoints`.

## Privacy and security

- no player, game, session, holding, Store-item, notification-row, delivery-row, watchlist-row, or stock-row UUID appears in the response;
- no credentials, token hashes, or session tokens appear in the response;
- direct paths and `/functions/v1/classroom-api` paths are recognized exactly;
- spoofed prefixes fail closed;
- missing, expired, revoked, inactive, and cross-game sessions fail closed;
- successful responses contain static capability metadata only and perform no economic write.

## Reconciliation rule

Every later PR #158 tranche must update the endpoint allowlist and `manifestVersion` only after its route is implemented, security-reviewed, tested, and ready to advertise. The manifest must never get ahead of implementation.
