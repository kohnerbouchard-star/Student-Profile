# Beta security and rate-limit hardening

**Roadmap ownership:** `BETA-AUTH-005`, `BETA-AUTH-006`, `OPS-RATE-001`,
`OPS-ACCESS-001`  
**Branch:** `agent/beta-security-rate-limit-v1`  
**Architectural foundation:** merged PR #158  
**Environment changes performed:** none

## Baseline audit

The merged shared limiter already provided HMAC-keyed IP, identity, game, and
action buckets; atomic SQL consumption; credential-blind login pre-auth buckets;
private `429` and `503` responses; `Retry-After`; and fail-closed dispatch for
reviewed Player routes.

The continuation audit found these remaining defects and gaps:

1. the trusted `x-forwarded-for` parser accepted the first browser-controllable
   value of a comma-separated chain instead of requiring one upstream-overwritten
   address;
2. the HMAC contract accepted arbitrary 32-character low-entropy values;
3. the reviewed action validator rejected existing multi-segment actions such as
   `player.inventory.redemptions.read`, which could fail closed as an unintended
   `503`;
4. login used the generic sensitive profile, limiting a shared classroom NAT to
   10 attempts per five minutes through the action-per-IP bucket;
5. Player attendance clock-in and the staff attendance scanner bypassed the
   shared limiter;
6. expired rows were cleaned only opportunistically for keys currently consumed;
7. no bounded aggregate telemetry RPC or connected SQL/HTTP probe existed;
8. staff password, MFA, recovery, revocation, and access-policy changes had no
   exact approval and evidence plan.

## Implemented repository changes

### Runtime configuration and proxy boundary

- HMAC secrets must be 43–128 base64url characters with at least 20 distinct
  characters. This supports independently generated 256-bit-or-stronger secret
  material while rejecting repeated-character and non-base64url values.
- Trusted client IP input must be one IPv4 or IPv6 address. Comma chains and
  CR/LF injection are rejected.
- A proxy-boundary helper deletes common browser-supplied forwarding aliases and
  writes only the configured canonical header. Runtime trust still requires a
  connected ingress overwrite/strip probe.
- Reviewed Player and staff actions may contain two to four normalized action
  segments after the actor prefix.

### Classroom-aware policy profiles

| Profile | IP | Identity | Game | Action |
|---|---:|---:|---:|---:|
| Login | 150 / 5 min | unused | unused | 90 / 5 min per IP |
| Player attendance | 600 / min | 6 / min | 600 / min | 6 / min |
| Staff scanner | 900 / min | 300 / min | 900 / min | 300 / min |

Login remains credential-blind and consumes only IP and action-per-IP buckets.
Player attendance derives identity and game from the active Player session. The
staff scanner authenticates staff and verifies game ownership before consuming
staff identity, game, IP, and action buckets. Both attendance paths enforce the
limiter before body parsing or mutation and return private `429` or fail-closed
`503` responses.

### Persistence operations

Migration `20260720150000_harden_request_rate_limit_operations_v2.sql` adds:

- `prune_request_rate_limit_buckets_v1(integer)`, deleting at most 10,000 expired
  rows with ordered `FOR UPDATE SKIP LOCKED` selection;
- `read_request_rate_limit_telemetry_v1(integer, integer)`, returning at most 100
  aggregate policy-shape rows over at most 24 hours;
- a bounded telemetry-support index.

Both RPCs are security-definer, service-role-only, and expose no HMAC key, IP,
action composite, token, credential, or internal actor/game identifier.

### Connected probes and runbooks

- `scripts/staging/probe-beta-security-rate-limit-sql.mjs` verifies exact atomic
  outcomes for 40 concurrent four-bucket and 40 concurrent two-bucket calls,
  bounded cleanup, telemetry shape, and evidence redaction.
- `scripts/staging/probe-beta-security-http.mjs` verifies shared-NAT login
  behavior while rotating spoofable proxy headers, `429`/`Retry-After`, response
  canaries, malformed sessions, optional expired/revoked/wrong-role cases,
  optional scanner burst, and optional fail-closed outage deployment.
- `docs/operations/beta-security-rate-limit-staging-runbook.md` defines the
  isolated-staging configuration, execution, tuning, outage, privacy, and
  evidence procedure.
- `docs/operations/staff-access-security-policy.md` defines the unapproved Auth
  change plan for passwords, leaked-password protection, TOTP MFA, assurance,
  sessions, recovery, revocation, break-glass access, and quarterly review.

## Automated repository evidence

The security suite ratchets:

- HMAC strength and allowed encoding;
- proxy overwrite/stripping and single-address parsing;
- multi-segment Player and staff actions;
- privacy-safe Player, staff, login, attendance, and scanner keys;
- shared-NAT policy values;
- replay and concurrent service calls;
- auth/ownership-before-limiter and limiter-before-body/mutation ordering;
- bounded cleanup and telemetry migration source;
- service-role-only grants and no sensitive telemetry columns;
- connected probe syntax through Repository Quality.

## Completion boundary

Repository implementation is not isolated-staging completion. The pull request
must remain draft until the same immutable head has passing Backend typecheck,
complete smoke, affected Player/Admin tests, Repository Quality, two-pass
Database Replay, database lint, connected SQL concurrency, connected HTTP proxy
and scanner probes, fail-closed outage evidence, and response/log/trace/
screenshot/artifact leak scans.

No Supabase Auth setting, runtime secret, production route, production
credential, or production database was changed by this repository tranche.
