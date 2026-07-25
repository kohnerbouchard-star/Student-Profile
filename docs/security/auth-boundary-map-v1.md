# Econovaria authentication boundary map v1

Status: migration in progress. This document is release-gating evidence, not a production deployment authorization.

## Decision

Econovaria uses four distinct credential classes. They are not interchangeable.

| Credential | Purpose | Permitted transport | Browser-visible |
|---|---|---|---|
| `sb_publishable_...` | Identifies the public application | `apikey` only | Yes |
| Supabase Auth user JWT | Identifies a signed-in staff user | `Authorization: Bearer <JWT>` | Yes, session-scoped |
| Opaque Player session token | Identifies an active Player session | `x-player-session-token` | Yes, session-scoped |
| `sb_secret_...` or legacy service-role fallback | Privileged database access after authorization | Edge Function environment only | No |

A publishable key is never a user JWT. The browser, local gateway, Edge Functions, tests, and scheduled runners must reject any attempt to use it as a bearer token.

## Application topology

### Browser identity service

Password sign-in and refresh call Supabase Auth with the publishable key in `apikey`. The returned staff access JWT is held in `sessionStorage`, refreshed through the Auth endpoint, and sent as a bearer token only to authenticated staff functions.

Password-recovery requests require only the publishable key. Password updates use the one-time recovery JWT as the bearer token. The recovery JWT remains page-scoped and is cleared after use.

### Bootstrap API

`bootstrap-api` owns unauthenticated account creation and initial game provisioning. Platform JWT verification is disabled because no user JWT exists yet and opaque publishable keys are not JWTs. The function explicitly validates the `apikey` and then applies the purchase-code, rate-limit, request-bound, provisioning-preflight, atomicity, replay, and cleanup controls already implemented in the signup domain.

Routes:

- `POST /staff/signup`
- `POST /licensing/activate` only when the licensing contract permits a non-session bootstrap flow
- `GET /health`

The function cannot treat the publishable key as user authorization. Privileged database access begins only after the route-specific checks pass.

### Staff API

`staff-api` owns classroom administration operations. Platform JWT verification remains enabled. Every request carries both the publishable `apikey` and a real Supabase Auth user JWT. The server calls `auth.getUser`, resolves the `staff_users` record, enforces controlled role and game ownership, and only then constructs a privileged client.

Covered routes include game settings and join-code rotation, roster and Player credential administration, attendance, balances and ledgers, Store, Contracts, storyline initialization, staff bootstrap, and authenticated licensing activation.

### Admin API

`admin-api` remains the primary Admin shell backend. It uses the same publishable-plus-user-JWT contract as `staff-api` and preserves its operation-specific authorization and response adapters. A small number of internal compatibility operations still call `classroom-api` with a real staff JWT. That path is server-to-server compatibility debt and must not be exposed as a direct browser target.

### Player API

`player-api` owns the complete Player runtime. Platform JWT verification is disabled because Players do not have Supabase Auth user JWTs. The function validates the publishable `apikey`, then authenticates and authorizes the opaque Player session token.

The server hashes the token, resolves one active session, derives the durable Player identity and game scope, enforces expiry and rate limits, and rejects client ownership UUIDs. This boundary covers login, session bootstrap, dashboard, world and travel, inventory, Store, Contracts, stocks, banking, business operations, Messaging, Marketplace, Progression, notifications, story delivery, attendance, and logout.

### Stock-market server functions

The stock runner, seed-copy, market-read, Player-read compatibility, and trading functions are server-to-server surfaces. They validate the publishable `apikey` and the dedicated `x-stock-market-runner-secret`; they do not accept a legacy anon bearer token. Their privileged database client remains function-local. A future hardening iteration should replace the static runner secret with a timestamped HMAC or one-time signed invocation while preserving current idempotency protections.

### Local gateway

The browser receives only `PUBLISHABLE_KEY`. The launcher strips accidental `Authorization: Bearer <publishable>` headers, preserves real staff JWTs, preserves Player session headers, overwrites forwarded client-IP headers with loopback, and never exposes or injects the legacy anon JWT. The underlying generic gateway still contains a legacy compatibility implementation, but `npm run dev:local` installs the publishable-only policy before binding the server. Removing the unused legacy base implementation is tracked as cleanup, not as a release dependency.

## Storage map

`econovaria.admin.auth.v1` contains the staff access JWT, refresh token, and a bounded user summary in `sessionStorage`. It must never contain an API key, purchase code, secret key, or service-role key.

`econovaria.player.auth.v1` contains the opaque Player session token, expiry, and safe Player/game summaries in `sessionStorage`. It must never contain a publishable key, privileged key, durable ownership UUID, or another Player's identifier.

The publishable key is deployment configuration and does not need to be copied into either session record.

## Route migration map

| Existing caller | Previous destination | New destination | Identity contract |
|---|---|---|---|
| Main Player login | `classroom-api` | `player-api` | publishable `apikey`; no bearer; credentials in body |
| Player Terminal | `classroom-api` | `player-api` | publishable `apikey` plus opaque Player session header |
| Create Game | `classroom-api/staff/signup` | `bootstrap-api/staff/signup` | publishable `apikey` plus one-time purchase code |
| Admin login bootstrap | `classroom-api/staff/bootstrap` | `staff-api/staff/bootstrap` | publishable `apikey` plus staff JWT |
| Admin Player credential bridge | `classroom-api` | `staff-api` | publishable `apikey` plus staff JWT and game binding |
| Admin write fallback | `classroom-api` | `staff-api` through compatibility alias | publishable `apikey` plus staff JWT and game binding |
| Admin shell | `admin-api` | `admin-api` | unchanged publishable `apikey` plus staff JWT |
| Market scheduler | anon bearer plus runner secret | publishable `apikey` plus runner secret | server-to-server only |

## Compatibility and retirement

`classroom-api` remains deployed with `verify_jwt=true` during migration because `admin-api` still uses it for bounded compatibility operations. New browser runtime configuration does not point to it. Retirement requires:

1. moving the remaining Admin compatibility operations into `admin-api` or `staff-api`;
2. proving zero direct browser references and zero observed browser traffic;
3. updating staging probes and dashboards;
4. deleting or reducing the mixed router only after replacement parity tests pass.

## Release gates

The migration is not releasable until all of the following are true:

- browser source and generated runtime configuration contain no legacy anon, service-role, or secret key;
- no publishable key is sent as a bearer token;
- only the ledger-approved functions disable platform JWT verification;
- every function with `verify_jwt=false` validates `apikey` and route-specific authorization inside the function;
- staff calls fail without a real user JWT and fail when `auth.getUser`, staff lookup, role, or game ownership fails;
- Player calls fail without a valid active Player session and do not trust client ownership UUIDs;
- bootstrap signup fails closed on invalid purchase code, rate limit, replay, incomplete canonical content, or partial provisioning;
- stock functions fail without both publishable identity and runner authorization;
- local and staging browser tests exercise Create Game, Admin login, Player login, Player Terminal bootstrap, Admin writes, password recovery, and stock runner invocation;
- the existing signup 503 has a proven root cause and a passing local provisioning preflight; changing API-key headers alone is not sufficient evidence.

The machine-readable authority for this map is `docs/security/auth-boundary-ledger-v1.json`.
