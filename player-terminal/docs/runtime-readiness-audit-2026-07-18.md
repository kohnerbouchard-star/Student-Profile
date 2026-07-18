# Player Terminal Runtime Readiness Audit

Date: 2026-07-18

Branch scope: Player Terminal maintenance only. This audit does not implement connected-mode runtime wiring and does not modify Backend, Admin, Supabase, migrations, deployment configuration, or the legacy Worker.

## Executive conclusion

The Player Terminal is not ready for production runtime cutover yet.

The frontend already contains hardened transport primitives, a Student-Profile request adapter, session handoff logic, capability resolution, response normalization, and fail-closed unsupported-endpoint behavior. However, the browser entrypoint does not install the Student-Profile adapter automatically. In connected mode, the terminal currently selects one of three transports strictly from resolved configuration:

1. preview transport when `usePreviewData` is true;
2. adapter transport when `apiCall` or `adapter` is injected;
3. generic HTTP transport otherwise.

The current generic HTTP default is `/api/player`. It does not automatically select `/functions/v1/classroom-api`. The exported Student-Profile factory defaults to `/functions/v1/classroom-api`, but that factory is not imported or constructed by `src/main.js`.

Runtime integration therefore remains blocked until Backend PR #158 defines and merges the authoritative player routes, capability manifest, Contract acceptance, inventory-redemption contracts, session/header contract, and final `/functions/v1/classroom-api` behavior.

## Current startup behavior

### Configuration resolution

`src/main.js` calls `resolvePlayerTerminalConfig()` before constructing the terminal.

`resolvePlayerTerminalConfig()` reads `globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG` and combines it with location-derived behavior.

Current defaults include:

- `apiBaseUrl: "/api/player"`;
- `environment: "development"`;
- preview mode allowed only in development;
- `adapter: null`;
- `apiCall: null`;
- `sessionProvider: null`;
- host event names for session ready, session required, session invalid, and logout requested.

The `?api=1` or `?api=true` query flag disables the default development preview. `?preview=1` or `?preview=true` can request preview only when preview is allowed. Production and staging never enable preview through this mechanism.

### API client construction

`createPlayerTerminal({ mount, config })` constructs `new PlayerApi(config)` synchronously before resolving the player session.

`PlayerApi` chooses its transport once during construction:

- `PreviewTransport` when `config.usePreviewData` is true;
- `AdapterTransport` when `config.apiCall` or `config.adapter` exists;
- `HttpTransport` otherwise.

A later session handoff updates authentication fields and invalidates session-scoped work, but it does not replace the selected transport.

### Injected adapter and `apiCall`

The terminal supports both forms:

- an async function in `config.apiCall` or `config.adapter`;
- an object exposing `request(context)`.

`AdapterTransport` passes the endpoint key, provisional method/path, payload, request ID, idempotency key, abort signal, resolved session fields, and complete terminal config to the adapter.

The repository includes `createStudentProfileApiCall()` and `createStudentProfileFetchRequest()` in `src/integrations/student-profile-api-call.js`. These factories are not installed by `src/main.js`. A host must currently construct and inject them explicitly.

### Current default API base

The terminal configuration default is `/api/player`.

The Student-Profile fetch factory independently defaults to `/functions/v1/classroom-api`.

Connected mode does not currently switch the terminal configuration to `/functions/v1/classroom-api` automatically. Without an injected adapter or explicit `apiBaseUrl`, the generic `HttpTransport` uses `/api/player` plus the provisional frontend endpoint path.

This fallback is not the approved Student-Profile runtime contract.

## Session handoff behavior

### Existing session resolution

When preview mode is off, startup attempts to resolve a host-provided player session in this order:

1. session fields already present in terminal configuration;
2. `config.sessionProvider()`;
3. `globalThis.ECONOVARIA_PLAYER_SESSION`;
4. `globalThis.Econovaria.playerSession`;
5. `globalThis.Econovaria.state.getCurrentSession()`.

The handoff accepts common camelCase and snake_case token fields, but it requires a non-empty player session token.

If no session exists, the terminal enters a waiting state, calls `onSessionRequired` when provided, and dispatches the configured session-required host event. It sends no authenticated data request before a session is available.

A later session-ready event or direct `terminal.connectSession(session)` call applies the handoff and restarts loading.

### Session replacement

`PlayerApi.setSession()` fingerprints the player session token, game session ID, player session ID, and access token.

When the fingerprint changes, it:

- aborts the previous session controller;
- increments the session version;
- clears read caches and cache timestamps;
- clears in-flight reads and writes;
- clears completed-write cooldown state;
- clears retained retry idempotency keys;
- clears resource invalidations.

Late results from the old session are rejected by the session-version guard.

### Invalid session behavior

A 401 during bootstrap, route loading, authoritative refresh, or mutation handling moves the terminal into its waiting state and dispatches the configured session-invalid host event. The terminal does not silently continue with the rejected session.

### Logout behavior

The current Logout control is host-owned. It invokes `onLogoutRequested` when configured and dispatches the configured logout-requested event.

The application controller does not directly call the backend logout route. Although a logout route builder exists in the Student-Profile mapping file, it is not used by the current UI logout flow. The final runtime contract must define whether the host revokes the session before or after unmounting the terminal.

## Preview-mode sequence

1. Resolve terminal configuration.
2. Confirm development environment and preview permission.
3. Construct `PlayerApi` with `PreviewTransport`.
4. Skip host session resolution.
5. Load session, dashboard, and route data exclusively from local preview fixtures.
6. Reject preview writes with `ApiConnectionPendingError` unless explicit write simulation is enabled.

Because `PreviewTransport` is selected before adapter or HTTP transport, preview reads cannot accidentally call a connected endpoint. Production and staging cannot enable preview through query parameters or default development behavior.

Preview fixtures and skeleton output must continue to exclude ownership UUID fields.

## Connected-mode sequence today

1. Resolve terminal configuration from the host global and location.
2. Construct `PlayerApi` with the transport selected from the configuration available at that moment.
3. Resolve an existing host player session or enter the waiting state.
4. Apply the session handoff and call `api.setSession()`.
5. Bootstrap the session and dashboard.
6. Resolve capabilities from configuration, dashboard, and session declarations.
7. Load route-specific required and optional resources.
8. Execute only capability-enabled actions.

This sequence becomes valid for Student-Profile only when the host injects a reviewed Student-Profile adapter or the future integration bootstrap installs one before `PlayerApi` construction.

## Capability behavior

Capability precedence is:

1. runtime configuration;
2. dashboard response;
3. session response.

The first explicit boolean declaration wins per route or action.

Dashboard and Profile are always enabled. Preview mode enables all approved routes and actions. Other connected routes and actions default to disabled unless advertised.

Frontend endpoint capabilities map to action capabilities through a fixed allowlist. Store quote uses the Store purchase capability. Unsupported action controls are disabled after render.

Current limitations that must be resolved during runtime integration:

- capability declarations are not yet validated against the complete Student-Profile adapter route manifest at startup;
- a capability can be advertised even when no adapter mapping exists;
- route visibility and route access must be reconciled with the product-surface preservation rule rather than inferred from missing backend support;
- the final Backend capability schema and version field are not yet authoritative on `main`.

## Fail-closed contract expectations

### Backend advertises support but frontend mapping is missing

The future integration layer must:

- record a contract mismatch with capability key, manifest version, frontend version, and request correlation context;
- disable the affected action or route operation;
- render a degraded or integration-mismatch state;
- send no speculative request;
- never derive or guess a path from the capability name;
- never fall back to the provisional generic HTTP route.

The current Student-Profile adapter already returns no mapping for unknown endpoint keys, which becomes `ApiConnectionPendingError`. Runtime integration must detect this mismatch before user execution when possible.

### Frontend surface exists but Backend support is not advertised

The future integration layer must:

- retain approved product surfaces where product design requires visibility;
- label the surface Integration Pending, Restricted, or Temporarily Unavailable as appropriate;
- disable mutation controls;
- send no mutation;
- avoid fabricating zero values or success states;
- preserve accessible explanations that do not rely only on the `title` attribute.

## Identity invariants

The following rules are mandatory for the future runtime integration:

- durable ownership remains server-derived from immutable player UUID;
- no ownership UUID appears in request bodies;
- no ownership UUID appears in frontend-generated URLs;
- no ownership UUID appears in browser read models, preview fixtures, diagnostics, or skeleton output;
- the host session supplies authentication;
- Player ID remains mutable and player-facing;
- recipient Player ID remains a future server-side lookup input;
- the browser must never choose or submit recipient UUIDs.

The current Student-Profile adapter rejects known client ownership fields before route resolution.

## Exact Backend PR #158 dependencies

Runtime integration must remain blocked until `main` contains reviewed and tested contracts for:

- authenticated player request scope;
- required authenticated player read routes;
- authoritative capability manifest and manifest versioning;
- Contract acceptance reconciled with the current Contracts lifecycle;
- inventory-redemption schema and atomic RPCs;
- player redemption request routes;
- Admin redemption review and approve/reject/fulfill routes;
- final player-session token and header requirements;
- final `/functions/v1/classroom-api` dispatch contract;
- response DTOs matching the frontend normalizers;
- idempotency and retry semantics for economic writes;
- staging-only migration and Edge Function rehearsal instructions.

No runtime branch should guess these contracts from donor PRs #141 or #143.

## Desired connected-mode startup after Backend merge

1. Host completes player authentication and owns the raw session lifecycle.
2. Host provides a normalized player session handoff without exposing ownership UUIDs.
3. Runtime bootstrap installs the reviewed Student-Profile request adapter before terminal construction.
4. Adapter base resolves explicitly to `/functions/v1/classroom-api`.
5. Terminal constructs `PlayerApi` with `AdapterTransport`; generic HTTP fallback is not used for Student-Profile mode.
6. Session bootstrap returns player identity, game context, capability manifest, and contract version.
7. Frontend validates manifest version, advertised routes/actions, and adapter mapping coverage.
8. Contract mismatches fail closed before user actions.
9. Required shell resources load; optional failures retain resource-level unavailable state.
10. Route reads and mutations use only allowlisted mappings and server-derived ownership.
11. Session replacement aborts old work and clears all session-scoped caches.
12. Logout is propagated through the reviewed host lifecycle.

## Required runtime-integration tests

After Backend PR #158 merges, the runtime integration branch must add or retain tests for:

- configuration resolution in development, staging, and production;
- adapter installation before `PlayerApi` construction;
- `/functions/v1/classroom-api` base selection;
- prohibition of `/api/player` fallback in Student-Profile connected mode;
- existing host session, asynchronous session provider, global session, and session-ready event paths;
- missing-session waiting state with no network request;
- session replacement abort and stale-result rejection;
- invalid-session event propagation;
- logout event and host revocation sequence;
- capability manifest version validation;
- capability-to-route and capability-to-adapter coverage;
- advertised-capability/missing-mapping mismatch behavior;
- frontend-surface/missing-capability integration-pending behavior;
- preview isolation from all connected endpoints;
- no ownership UUID in URLs, payloads, models, fixtures, logs, or rendered output;
- desktop and mobile connected bootstrap;
- authoritative Store, Contracts, Market, Banking, Inventory, and redemption flows;
- committed-success with refresh failure;
- offline, timeout, 429, and ambiguous-write retry behavior.

## Merge boundary for this maintenance branch

This branch is complete when it contains only:

- explicit static skeleton dispatch;
- regression coverage rejecting computed renderer invocation;
- this runtime-readiness audit.

It must not add adapter auto-installation, connected base selection, backend routes, migrations, production configuration, deployment behavior, or runtime cutover.
