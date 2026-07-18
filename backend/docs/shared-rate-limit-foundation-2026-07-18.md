# Shared request rate-limit foundation

**Roadmap item:** `BETA-AUTH-005`\
**Authority:** PR #158 / `agent/player-backend-reconciliation-v2`\
**Baseline:** `5944fd5127289c659909e6b608858345672fdd4d`

This tranche adds the shared persistence, keying, policy, repository, service,
and HTTP response foundation for authenticated Player request throttling. It
does not advertise a new capability and does not change the Classroom API
dispatcher. `BETA-AUTH-005` therefore remains `IMPLEMENTED_NOT_MERGED` and
requires the route integration and runtime evidence listed below.

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

## Remaining integration and runtime evidence

1. Add a single reviewed integration point after session authentication and
   before route work for each supported Player action. Pass only action
   constants and token-derived scope. Do not let query, body, or browser headers
   select the action, player, or game dimension.
2. Add an IP/action pre-authentication limiter for `/players/login`. Invalid
   credentials cannot supply authoritative player/game dimensions, so login must
   not fabricate them from submitted identifiers. Successful login may consume
   the authenticated dimensions after identity resolution.
3. Map limiter errors to the provided `429`/`503` responses and prove protected
   writes never execute when limiting is unavailable or denied.
4. Configure the two runtime variables in isolated staging only after verifying
   that the chosen proxy header is overwritten by the platform. Rotate the HMAC
   secret only as a coordinated security change; rotation starts a new digest
   key space and therefore resets active counters.
5. Run Database Replay twice and database lint in CI, then run real concurrent
   requests across two games, multiple players, and a shared classroom NAT.
6. Tune thresholds from staging telemetry. Policy changes require review because
   overly narrow game/IP buckets can deny a whole classroom.
7. Add bounded global expired-row cleanup and monitoring for denial rate,
   limiter latency, RPC failures, bucket volume, and sustained blocks.

No route, Classroom API dispatcher, capability manifest, package script, visual
system, or existing migration is changed in this tranche.

## Local verification

After rebasing onto PR #158 commit `120277da75b970165e9fc8b64b5d4b8b092a1d55`:

- all 12 focused rate-limit tests passed;
- the combined security suite passed 23 tests and the leak scanner passed 3
  tests plus its live Player Terminal repository scan;
- Backend TypeScript typecheck passed;
- migration source audit passed with 61 unique migrations;
- the concurrent Contract-acceptance tranche's 9 tests passed unchanged;
- the root repository test/release-quality suite passed before the compatible
  Contract-only rebase.

The broader Backend smoke passed Classroom API smoke and every Player suite (45
market, 10 scope, 8 capability, 17 world, 14 inventory, 15 notification, and 9
logout tests). It then reached the Admin API suite but could not download
`@supabase/supabase-js@2.108.2` from `esm.sh` because the execution environment
refused the network connection. No Admin assertion ran or failed. Docker and a
local Supabase CLI are unavailable here, so CI must supply the authoritative
two-pass database replay, lint, and SQL concurrency evidence.
