# Econovaria Player Terminal v7.5 — API Readiness

## Release boundary

v7.5 hardens the standalone player frontend before any live Supabase or Edge Function wiring. It does not change the approved v7 CSS layers, icon component, map geometry, backend schema, production routing, or host-owned authentication flow.

## Loading architecture

The terminal no longer requests every player system during startup.

1. Resolve the existing host player session.
2. Validate the `session` read.
3. Load the `dashboard` shell read.
4. Load notifications as an optional shell resource.
5. Load only the active route's required and supporting resources.
6. Cache successful reads and deduplicate identical in-flight reads.

A failed Business, Marketplace, Loans, Messages, Crafting, or Progression read can no longer prevent Dashboard from opening. Required route failures render inside that route while the shell and other enabled routes stay usable.

## Capability contract

Connected environments fail closed. The host must declare supported routes and actions through the session, dashboard, or runtime configuration:

```js
capabilities: {
  routes: {
    market: true,
    portfolio: true,
    contracts: true,
    store: true,
    inventory: true,
    banking: true
  },
  actions: {
    marketOrder: true,
    contractSubmit: true,
    storePurchase: true
  }
}
```

`dashboard` and `profile` remain available after a successful shell bootstrap. Every undeclared optional route and write action is hidden or disabled. Preview mode enables the complete route and action surface only for local visual verification.

## Production preview policy

Preview data and developer diagnostics are permitted only in local development. Production and staging ignore `?preview=1`, `usePreviewData: true`, and `allowPreviewMode: true`, and never render diagnostic paths or payloads. Missing host adapters or sessions therefore produce controlled integration states instead of displaying fictional player records.

## Request contract

Every request receives a `ptr_` request ID. Adapter requests receive an `AbortSignal`; direct HTTP requests send the request ID as `x-request-id`. Direct HTTP mode also sends the player session token through `x-econovaria-player-session-token` and the game session through `x-econovaria-game-session-id`. Replacing the host player session aborts outstanding transport signals, clears session-scoped caches and cooldowns, and rejects late results before they can enter the replacement session.

Critical writes receive a unique `idempotency-key`. Only one matching action/resource write may be in flight at a time, and a short completion cooldown suppresses immediate repeats.

## Error contract

The frontend maps timeouts, cancellation, offline state, HTTP status, session expiry, and rate limiting into stable player-safe messages. Raw SQL, RPC, stack, authorization, and backend messages are not rendered. A 401 triggers the existing host `econovaria:player-session-invalid` flow; a 429 retains a bounded Retry-After duration for player feedback.

## Write settlement and refresh

Money, holdings, contracts, rewards, and inventory remain server-authoritative. The terminal does not optimistically apply economic mutations. After a confirmed write, only the resources listed in `WRITE_INVALIDATIONS` are refetched. If a supporting refresh fails, the confirmed write remains complete and the interface reports that some information will refresh later.

## Response and input controls

Read responses are bounded by depth, array length, object keys, and string length. Non-finite numbers normalize safely. Remote image URLs require HTTP(S) and an explicitly allowed host; relative repository assets remain supported. Write payloads enforce finite numeric bounds, identifier lengths, string limits, and HTTP(S)-only submission links.

## Verification

Run:

```zsh
npm run verify
```

The command runs syntax checks, the original v7 route and interaction smoke suite, the v7.5 architecture/security suite, the original package audit, and the v7.5 visual-lock audit.
