# Beta security and rate-limit isolated-staging runbook

**Roadmap items:** `BETA-AUTH-005`, `BETA-AUTH-006`, `OPS-RATE-001`,
`OPS-ACCESS-001`  
**Environment:** isolated staging only  
**Production authorization:** none

This runbook verifies the security tranche without changing production Auth
settings, credentials, routing, or secrets. Keep the pull request draft until all
required evidence is attached and reviewed.

## Preconditions

Record the following before any staging change:

- immutable Git commit and pull request;
- isolated Supabase project reference and Edge Function deployment version;
- current migration head;
- chosen proxy and trusted client-IP header;
- current names-only secret inventory;
- staging test game, staff account, and bounded test players;
- operator, approver, start time, rollback owner, and observation window.

Do not place secret values, tokens, password hashes, access codes, internal player
or game UUIDs, or sensitive request bodies in the evidence file.

## HMAC-secret configuration contract

`ECONOVARIA_RATE_LIMIT_HMAC_SECRET` must be an independently generated base64url
value containing 43 to 128 characters and at least 20 distinct characters. It
must not be derived from the Supabase service-role key, JWT secret, deployment
key, user password, game code, or any other application secret.

Generate a 384-bit candidate in a protected local terminal:

```zsh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Store the value directly in the isolated-staging secret manager. Do not commit,
chat, email, screenshot, or paste it into CI output. Rotation creates a new HMAC
key space and resets active counters; rotate only through an approved change
record.

Set `ECONOVARIA_TRUSTED_CLIENT_IP_HEADER` to exactly one of:

- `cf-connecting-ip`;
- `x-real-ip`;
- `x-forwarded-for`.

Prefer `cf-connecting-ip` when the isolated-staging ingress is Cloudflare-backed
and the connected overwrite probe confirms the browser cannot control it. The
application requires one address, not a comma-separated forwarding chain.

## Proxy overwrite and stripping proof

Before enabling normal staging traffic:

1. Deploy the pull-request commit to the isolated staging function.
2. Configure one candidate trusted header.
3. Send requests that rotate browser-supplied values for every common forwarding
   alias: `cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`, `true-client-ip`,
   `forwarded`, and `x-client-ip`.
4. Confirm the 91st login attempt from the same actual client is rate limited even
   though every spoofable header value changed.
5. Confirm the selected upstream header contains one normalized address and no
   browser-supplied chain.
6. If spoofing bypasses the bucket, remove the configuration and stop. Do not
   weaken parsing or trust an additional header.

Run the connected HTTP probe:

```zsh
ECONOVARIA_STAGING_CONFIRMATION=I_ACKNOWLEDGE_ISOLATED_STAGING \
CLASSROOM_API_URL="$CLASSROOM_API_URL" \
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
node scripts/staging/probe-beta-security-http.mjs
```

Optional environment variables extend the probe to expired, revoked, wrong-role,
scanner-burst, and isolated limiter-outage fixtures. The probe writes a redacted
JSON evidence record under `artifacts/security/` by default.

## Database migration and atomic-concurrency proof

Apply migrations to the isolated staging project through the normal immutable
release path. Verify the migration ledger contains:

- `20260718173000_add_shared_request_rate_limits_v1.sql`;
- `20260718190000_add_pre_auth_rate_limit_rpc_v1.sql`;
- `20260721002625_harden_request_rate_limit_operations_v3.sql`.

The historical `20260720150000` candidate was never merged and must not be
introduced after a staging ledger that already contains `20260720235900`.

Repository CI must replay all migrations from zero twice and run database lint.
Then run the connected SQL probe with protected service-role credentials:

```zsh
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
node scripts/staging/probe-beta-security-rate-limit-sql.mjs
```

The probe requires exactly 10 allowed and 30 denied results for 40 concurrent
four-bucket calls and again for 40 concurrent pre-auth two-bucket calls. Any
other count is an atomicity failure. It also verifies bounded cleanup and
aggregate telemetry without exporting HMAC keys.

## Shared-NAT and scanner calibration

Initial staging policies are intentionally classroom-aware:

| Profile | IP | Identity | Game | Action |
|---|---:|---:|---:|---:|
| Login | 150 / 5 min | not used pre-auth | not used pre-auth | 90 / 5 min per IP |
| Player attendance | 600 / min | 6 / min | 600 / min | 6 / min |
| Staff scanner | 900 / min | 300 / min | 900 / min | 300 / min |

Collect aggregate telemetry for at least one normal class period and one bounded
load exercise. Review denial rate, blocked buckets, total requests, limiter
latency, storage errors, and bucket volume. Never add raw IP, identity, game,
action composite, token, or HMAC key to telemetry.

Acceptance targets:

- a 30-player login wave behind one NAT completes without denial;
- 90 failed login attempts from one actual IP trigger a block before credential
  verification can continue;
- a normal scanner burst completes, while more than 300 scans per minute from one
  staff/game/action scope receives `429`;
- player attendance retry storms are capped at six attempts per minute per
  authenticated player/action;
- cross-game players share the broad IP bucket but not game or action buckets.

Policy changes require a reviewed commit and a new staging evidence run.

## Cleanup and retention

Run `prune_request_rate_limit_buckets_v1` in bounded batches of no more than
10,000 rows. The recommended initial schedule is every 15 minutes with a batch of
5,000. Do not place cleanup on the request authorization path.

Before scheduling, record three manual runs and confirm:

- only expired rows are deleted;
- each call is bounded;
- concurrent cleanup uses `SKIP LOCKED` and does not block consumption;
- remaining-expired count trends toward zero;
- active blocks survive until expiry.

Scheduling the cleanup job is an operations change and remains owner-approved
staging work before any production promotion.

## Bounded telemetry

`read_request_rate_limit_telemetry_v1` returns only policy-shape aggregates:
dimension, window, limit, active bucket count, blocked bucket count, total request
count, and bounded timestamps. The row limit is at most 100 and the lookback is at
most 24 hours.

Alert candidates for staging calibration:

- limiter RPC failures greater than zero;
- sustained blocked login buckets for more than 10 minutes;
- classroom-wide IP denial with low identity denial;
- cleanup backlog increasing for three consecutive runs;
- p95 limiter latency above 100 ms;
- bucket volume growing after request volume returns to baseline.

No dashboard or alert is complete until its query and exported payload are
reviewed for sensitive-field absence.

## Fail-closed outage exercise

Use only an isolated staging deployment with an approved rollback. Choose one
method:

1. temporarily remove execute permission for the limiter RPC from the staging
   service role; or
2. deploy a separate outage-probe function revision with missing limiter
   configuration.

Do not alter production. Send a protected write and verify:

- HTTP `503`;
- code `rate_limit_service_unavailable`;
- integer `Retry-After`;
- `Cache-Control: private, no-store`;
- the protected route and mutation RPC are not invoked;
- no submitted credential, token, hash, UUID, or body value appears in response,
  logs, traces, or screenshots.

Restore the permission or deployment immediately, rerun a successful protected
request, and attach before/outage/restored evidence. The optional
`ECONOVARIA_LIMITER_OUTAGE_PROBE_URL` input lets the HTTP probe validate a
separately prepared outage revision.

## Authorization and privacy matrix

Run and record these connected cases:

- valid owner;
- wrong role;
- wrong game;
- expired session;
- revoked session;
- replayed request;
- malformed body and header;
- UUID injection in path, query, header, and body;
- brute-force login;
- scanner burst;
- limiter storage outage.

For every case, scan response headers/body, Edge logs, database logs, trace
exports, screenshots, and retained CI artifacts for:

- access codes and submitted passwords;
- access, refresh, Player-session, service-role, and deployment tokens;
- password, access-code, session-token, or credential hashes;
- HMAC secrets and HMAC bucket keys;
- internal player, game, staff, session, ledger, inventory, or request UUIDs;
- sensitive request bodies.

Evidence may contain public identifiers, route names, status codes, bounded
counts, timings, release SHA, and typed outcome codes.

## Required repository and staging evidence

The pull request remains draft until all of the following pass on the same head:

- Backend typecheck, including Edge functions;
- complete Backend smoke;
- Player security and attendance tests;
- affected Admin API and scanner tests;
- Repository Quality;
- migration audit;
- Database Replay from zero twice;
- database lint;
- SQL atomic-concurrency probe;
- HTTP proxy/login/scanner/outage probe;
- response, log, trace, screenshot, and artifact privacy scan;
- staff password, MFA, recovery, revocation, and access-policy review.

The final evidence record identifies the immutable commit, staging deployment,
migration head, configuration names and version—not values—operator, approver,
results, retained artifact hashes, rollback result, and observation window.
