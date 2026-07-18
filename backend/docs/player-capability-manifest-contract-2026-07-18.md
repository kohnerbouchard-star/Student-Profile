# Player capability manifest contract

## Route

`GET /players/me/capabilities`

The route is authenticated by `x-player-session-token`. Player, game, and active-session scope are derived server-side. The route accepts no query parameters, request body, player/game/owner headers, or stock-runner secret.

Successful responses are `private, no-store` and vary by `authorization, x-player-session-token`.

## Versioning

- `schemaVersion`: integer shape version; currently `1`.
- `manifestVersion`: reviewed capability mapping version; currently `2026-07-18.3`.
- `service`: always `classroom-api` for this contract.

Clients must reject unsupported schema versions. A manifest version change means the reviewed endpoint/capability mapping changed and must be reconciled with the adapter before connected execution.

## Source of truth

`backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts` contains one reviewed endpoint descriptor allowlist. Route and action booleans are generated from that allowlist; they are not maintained as an independent optimistic list.

The current version advertises only the UUID-private routes reviewed on PR #158:

- countries, country detail, and news;
- market collection and ticker detail;
- watchlist list, add, and remove;
- Inventory read;
- Inventory redemption request, collection history, and exact public-request-ID status read;
- notification list and mark-read;
- Player logout;
- atomic Contract acceptance by public `contractKey`;
- the capability route itself.

Contract acceptance sets `actions.contractAccept` to `true`. Inventory redemption sets `actions.inventoryUse` to `true`; each Inventory item still exposes `inventory.use` only when it is active, player-visible, and has positive unreserved quantity. The broader `routes.contracts` flag remains `false` because Contract list and submission still use legacy UUID-bearing contracts and require separate reconciliation.

## Fail-closed exclusions

The current manifest does not advertise the following even when older handlers exist:

- legacy session/bootstrap, dashboard, portfolio, Banking, Store, Contract list, or Contract submission paths that still serialize or accept browser-owned internal identifiers;
- market orders before public-ticker resolution is authoritative at the order boundary;
- automated item effects, equipment mutations, crafting, or direct item consumption outside the reviewed redemption workflow;
- any expansion feature that is only represented by a Player Terminal surface.

Unsupported route/action keys are returned as `false`. Unsupported endpoints are absent from `endpoints`.

## Privacy and security

- no player, game, session, holding, Store-item, notification-row, delivery-row, watchlist-row, stock-row, Contract-row, redemption-row, or progress-row UUID appears in the response;
- no credentials, token hashes, or session tokens appear in the response;
- Inventory redemption uses public item keys and `red_` public request IDs;
- direct paths and `/functions/v1/classroom-api` paths are recognized exactly;
- spoofed prefixes fail closed;
- missing, expired, revoked, inactive, and cross-game sessions fail closed;
- reviewed redemption GET/POST operations remain covered by the shared authenticated rate limiter;
- successful responses contain static capability metadata only and perform no economic write.

## Reconciliation rule

Every later PR #158 tranche must update the endpoint allowlist and `manifestVersion` only after its route is implemented, security-reviewed, tested, and ready to advertise. The manifest must never get ahead of implementation.
