# Shared request rate-limit foundation

**Roadmap item:** `BETA-AUTH-005`\
**Authority:** PR #158 / `agent/player-backend-reconciliation-v2`\
**Baseline:** `72a1c1c593a11627eaddbafe37177619ead0d8b3`

The foundation now includes the Classroom API integration for reviewed Player
routes and a separate pre-authentication login guard. It does not advertise a
new capability or change any accepted visual system. `BETA-AUTH-005` remains
`IMPLEMENTED_NOT_MERGED` until PR #158 merges and the runtime evidence below is
recorded.

## Security model

Each protected request consumes exactly four buckets in one database
transaction:

| Dimension | Server-owned source                                         | Default read limit | Default write limit | Sensitive limit |
| --------- | ----------------------------------------------------------- | -----------------: | ------------------: | --------------: |
| IP        | Configured, platform-overwritten proxy header               |            240/min |             120/min |        30/5 min |
| Identity  | Player UUID resolved from the active session                |            180/min |              60/min |        15/5 min |
| Game      | Game UUID resolved from the active session                  |          1,200/min |             600/min |       300/5 min |
| Action    | Reviewed action + authenticated game + authenticated player |             90/min |              30/min |        10/5 min |

Every raw dimension value is domain-separated and HMAC-SHA256 keyed in the Edge
runtime. Postgres stores only the dimension label and 64-character digest. It
never stores the client IP, action composite, token, token hash, player UUID, or
game UUID in the rate-limit tables.

The Edge runtime must supply:

- `ECONOVARIA_RATE_LIMIT_HMAC_SECRET`: an independently generated secret of at
  least 32 characters and at least eight distinct characters;
- `ECONOVARIA_TRUSTED_CLIENT_IP_HEADER`: exactly `cf-connecting-ip`,
  `x-real-ip`, or `x-forwarded-for`.

The selected IP header is trusted only if the hosting proxy overwrites it and
strips the browser-supplied value. Missing configuration, an absent or malformed
IP, HMAC failure, RPC failure, or malformed RPC result fails closed.
Configuration values and derived keys must never be logged.

The service accepts the full `PlayerRequestScope` produced by the shared active
session resolver rather than independent player/game arguments. This makes the
intended ownership provenance explicit at the integration boundary.

`POST /players/login` is different because no authenticated owner exists before
credential verification. Its pre-authentication guard consumes exactly two
buckets in one transaction:

- IP, derived only from the configured platform-overwritten proxy header;
- action-per-IP, derived from the reviewed constant `player.login.attempt` and
  that IP.

The login guard does not parse the request body and cannot receive submitted
game code, Player ID, access code, player UUID, or game UUID. A second
forward-only RPC, `consume_pre_auth_request_rate_limits_v1(jsonb)`, accepts
exactly the `action` and `ip` dimensions. It reuses the HMAC-only counter table,
deterministic lock ordering, atomic upsert, RLS, and service-role-only execution
boundary.

## Dispatcher integration

`playerRateLimitDispatch.ts` is the single post-authentication integration
point. It resolves active token-owned scope, selects an action/profile from a
server-owned endpoint-and-method map, consumes the limiter once, and invokes the
route only after an allowed decision. Unsupported methods bypass consumption so
the authoritative handler retains its `405` semantics. Denial or outage never
invokes route work.

Integrated routes:

| Route operation | Action | Profile |
| --- | --- | --- |
| `GET /players/me` | `player.session.read` | read |
| `GET /players/me/capabilities` | `player.capabilities.read` | read |
| `GET /players/me/world/countries` | `player.countries.read` | read |
| `GET /players/me/world/countries/:countryCode` | `player.country.read` | read |
| `GET /players/me/world/news` | `player.news.read` | read |
| `GET /players/me/stocks/assets` | `player.market.read` | read |
| `GET /players/me/stocks/assets/:ticker` | `player.asset.read` | read |
| `GET /players/me/stocks/watchlist` | `player.watchlist.read` | read |
| `PUT/DELETE /players/me/stocks/watchlist/:ticker` | `player.watchlist.write` | write |
| `GET /players/me/inventory` | `player.inventory.read` | read |
| `GET /players/me/notifications` | `player.notifications.read` | read |
| `POST /players/me/notifications/read` | `player.notifications.write` | write |
| `POST /players/me/session/logout` | `player.session.logout` | sensitive |
| `POST /players/login` | `player.login.attempt` | sensitive pre-auth |

The reviewed `contractAccept` mapping is defined as
`player.contracts.accept/write`, but dispatcher wiring remains with the active
Contract acceptance owner and is deliberately not changed in this tranche.

## Atomic persistence and replay semantics

Migration `20260718173000_add_shared_request_rate_limits_v1.sql` creates:

- table `public.request_rate_limit_buckets`;
- RPC `public.consume_request_rate_limits_v1(jsonb)`.

The service-role-only RPC validates exactly one bounded bucket for each
dimension, processes dimensions in deterministic order, takes keyed transaction
advisory locks, and uses `INSERT ... ON CONFLICT ... DO UPDATE`. This prevents
lost increments under concurrency and carries an active block across a fixed
window boundary. Forced RLS and explicit grants keep the table and RPC out of
browser Data API roles. Even `service_role` has no direct table grant; the Edge
runtime can execute only the bounded security-definer RPC.

Replayed HTTP attempts intentionally consume capacity again. A
browser-controlled request ID or idempotency key cannot make a retry invisible
to throttling. This does not alter domain mutation idempotency: an economic RPC
still deduplicates the mutation independently after the request passes the
limiter. The migration itself is forward-only and source-idempotent; no existing
migration is edited.

Expired rows are deleted for the four current keys during consumption. A future
operations job may perform a broader bounded cleanup, but cleanup is not on the
authorization decision path for unrelated keys.

## HTTP contract

A denied request receives:

- status `429`;
- error code `rate_limit_exceeded`;
- `retryable: true`;
- integer `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and
  `RateLimit-Reset` headers;
- `Cache-Control: private, no-store`;
- no bucket key, IP, internal UUID, token, count history, or limiting dimension.

A limiter outage produces a private, retryable
`503
rate_limit_service_unavailable`. A protected write must not continue after
that response.

## Automated evidence

The focused suites cover:

- four distinct bounded HMAC keys and absence of raw scope material;
- IP normalization and malformed/missing trusted IP rejection;
- weak secret, unreviewed action, and invalid UUID rejection;
- cross-game and cross-action key isolation;
- fail-closed runtime configuration;
- repeated and 40-way concurrent service calls with no client idempotency
  bypass;
- one-call atomic RPC adapter behavior and malformed/error response rejection;
- privacy-safe `429` and `503` response contracts;
- transaction, RLS, service-role grant, deterministic lock order, advisory lock,
  atomic upsert, exact dimension count, and no raw identity columns in migration
  source.

## Remaining runtime evidence

1. Wire `contractAccept` through the shared dispatch helper when its owning
   branch completes; do not duplicate limiter consumption in its handler.
2. Configure the two runtime variables in isolated staging only after verifying
   that the chosen proxy header is overwritten by the platform. Rotate the HMAC
   secret only as a coordinated security change; rotation starts a new digest
   key space and therefore resets active counters.
3. Run Database Replay twice and database lint in CI, then run real concurrent
   requests across two games, multiple players, and a shared classroom NAT.
4. Tune thresholds from staging telemetry. Policy changes require review because
   overly narrow game/IP buckets can deny a whole classroom.
5. Add bounded global expired-row cleanup and monitoring for denial rate,
   limiter latency, RPC failures, bucket volume, and sustained blocks.

No capability manifest, package script, visual system, or existing migration is
changed. The forward migration
`20260718190000_add_pre_auth_rate_limit_rpc_v1.sql` adds only the dedicated
pre-authentication RPC.

## Local verification

On the integration tranche based on privacy commit
`72a1c1c593a11627eaddbafe37177619ead0d8b3`:

- all 26 rate-limit keying, service, repository, HTTP, migration, guard, and
  Classroom API dispatch tests passed;
- the combined security suite passed 43 tests and the leak scanner passed 3
  tests plus its live Player Terminal repository scan;
- Backend TypeScript typecheck passed;
- migration source audit passed with 62 unique migrations;
- the concurrent Contract-acceptance tranche's 9 tests passed unchanged;
- the root repository test/release-quality suite passed, including Admin v606
  drift gates.

The broader Backend smoke passed Classroom API smoke and every Player suite (45
market, 10 scope, 8 capability, 17 world, 14 inventory, 15 notification, and 9
logout tests) plus 9 Contract-acceptance tests. It then reached the Admin API
suite but could not download
`@supabase/supabase-js@2.108.2` from `esm.sh` because the execution environment
refused the network connection. Classroom API Edge typecheck reached the same
remote import before checking the dispatcher entry point. No Admin assertion
ran or failed. Docker and a local Supabase runtime are unavailable here, so CI
must supply the authoritative Edge typecheck, two-pass database replay, lint,
and SQL concurrency evidence.
