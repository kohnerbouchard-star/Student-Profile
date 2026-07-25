# Econovaria security convergence v2

Status: implementation in progress on `agent/security-convergence-v2`.

This document is the repository authority for replacing the mixed legacy security model. It is not production deployment authorization. Production remains unchanged until every release gate is proven in isolated staging.

## Security objective

Econovaria must assume that student-controlled browsers are hostile. Browser code, hidden fields, route names, local storage, device identifiers, game identifiers, Player identifiers, and client-supplied ownership data are untrusted. Authorization is derived server-side from a verified staff JWT or a hashed active Player session. Privileged database access is created only after the route-specific identity, authorization, rate, request-boundary, and replay checks pass.

## Trust-zone and firebreak map

1. **Static browser zone** — public HTML, CSS and JavaScript; contains only a Supabase publishable key and no privileged credential.
2. **Public bootstrap zone** — staff sign-in, controlled account creation and recovery initiation. No user JWT is assumed. Requires exact publishable-key validation, bounded JSON, account/IP/device throttles, purchase-code authorization where applicable, atomic provisioning and cleanup.
3. **Player zone** — opaque Player sessions only. The browser never supplies a durable ownership UUID. Every request resolves one active, unexpired, unrevoked session and derives Player/game scope server-side.
4. **Staff zone** — real Supabase user JWT, `auth.getUser`, active controlled `staff_users` state, controlled role and version claims, game ownership, operation permission and AAL policy.
5. **Operator zone** — separate staging-only function. Requires platform JWT, server-side user validation, controlled `security_operator` role, AAL2, one-time signed authorization, exact project/SHA/artifact binding, production-project denial and zero-residue cleanup.
6. **Internal runner zone** — no browser CORS. Scheduled operations use timestamped HMAC or one-time signed invocation, bounded clock skew, nonce replay denial and exact operation scope.
7. **Database zone** — private implementation schema, minimal exposed API schema, forced RLS, revoked default privileges, fixed `search_path`, narrow security-definer RPCs and final-catalog auditing.
8. **Production data zone** — no public bootstrap, staging operator or test-fixture authority. Production secrets, backups and operator credentials are separate from staging.

Compromise of one zone must not automatically grant authority in another zone. A Player session cannot call staff routes. A staff JWT cannot call operator routes without the operator role, AAL2 and one-time release authorization. A publishable key is application identity only and never user authorization.

## Authentication controls

### Staff passwords

New staff passwords:

- minimum 15 characters;
- maximum 128 characters;
- at least one uppercase letter;
- at least one lowercase letter;
- at least one number;
- at least one symbol;
- no control characters;
- validated server-side before Auth creation;
- checked against Supabase leaked-password protection in the deployed Auth configuration;
- never logged, hashed by application code or returned in responses.

The composition requirement is retained because it is an explicit product requirement. Length, breached-password checks, MFA and throttling remain the primary defenses.

### Progressive brute-force protection

Authentication uses two independent systems:

1. **Volumetric request limiting** — fixed-window action/IP limits stop floods before expensive authentication or database work.
2. **Failure-sensitive authentication throttling** — account, device and IP failure counters produce progressively longer cooldowns.

Initial progressive policy:

| Dimension | First lock | Escalation | Maximum cooldown |
|---|---:|---|---:|
| Account | third failure | 5s, 15s, 30s, 60s, 5m, 15m, 1h | 6h |
| Device | sixth failure | 30s, 60s, 5m, 15m | 1h |
| IP | after 50 failures | 1m, 5m, 15m | 1h |

IP thresholds are deliberately high because an entire classroom may share one NAT address. Device identifiers are opaque resettable risk signals, not proof of identity. All stored keys are domain-separated HMAC-SHA256 digests; raw email, Player ID, game code, device ID and IP are never stored in throttle tables.

Successful authentication clears the account and device failure state. It only decays IP state so one valid login cannot erase a distributed attack signal. Security operators receive a controlled reset operation; no browser route may reset its own throttle.

### Staff MFA and session assurance

- New staff accounts are assigned the controlled `game_admin` application role.
- `staff_users.status`, role, permission version and security version are server-controlled.
- Auth `app_metadata` must match the database role and versions.
- Sensitive staff mutations require AAL2.
- MFA enrollment and challenge routes are the only staff routes allowed to operate at AAL1 after password verification.
- Security-version increments invalidate authorization after compromise, suspension, password reset or role change.
- A phishing-resistant factor must be offered when the platform capability is enabled; TOTP remains an acceptable migration factor.

### Player credentials

Player access codes are not staff passwords. They remain classroom-friendly credentials but must migrate from deterministic SHA-256 to a versioned password-hash contract:

- `credential_hash_version` identifies legacy and current algorithms;
- current hashes use Argon2id with repository-owned parameters and a server-side pepper;
- successful legacy verification performs a one-time rehash;
- code rotation revokes every active Player session;
- login failure responses remain uniform;
- access-code length and alphabet policy are explicit and bounded;
- game codes remain non-secret discovery codes and are never treated as authentication by themselves.

## Request and API controls

Every Edge entry point must apply a machine-readable route policy before dispatch:

- exact allowed methods;
- maximum URL length;
- required content type;
- actual body-byte limit, not only `Content-Length`;
- strict JSON object shape and unknown-field rejection;
- field lengths, formats and numeric bounds;
- exact auth scheme and minimum assurance level;
- game/Player/staff scope source;
- rate-limit profile and dimensions;
- idempotency/replay policy;
- audit event name;
- safe response contract;
- CORS policy;
- cache policy.

Unknown routes fail closed with 404. Wrong methods return 405. Unsupported media returns 415. Oversized requests return 413. No route may silently coerce malformed ownership or authentication fields.

## Rate limiting and abuse controls

The canonical limiter covers:

- route/action;
- IP;
- opaque device;
- authenticated identity;
- game;
- account identifier for authentication;
- high-cost resource category;
- staff mutation category.

Additional controls:

- bounded concurrency for fan-out endpoints;
- query/result limits;
- pagination caps;
- upload/attachment denial until a separate scanning boundary exists;
- idempotency keys for financial, inventory, marketplace, contract, provisioning and administration mutations;
- replay denial for signed internal/operator requests;
- `Retry-After` and reset metadata on 429;
- sanitized structured abuse events without raw identity values;
- classroom-NAT-aware IP policy;
- temporary scoped blocks instead of permanent global IP bans.

## Browser and session containment

Target architecture uses a same-origin backend-for-frontend:

- staff and Player session credentials in `HttpOnly`, `Secure`, bounded `SameSite` cookies;
- no tokens in `window`, JavaScript-readable storage, URLs or logs;
- real CSRF tokens bound to the cookie session and verified server-side;
- strict CSP delivered as HTTP headers;
- Trusted Types and safe DOM sinks;
- no dynamic HTML from untrusted data without sanitization;
- session rotation after login and privilege changes;
- idle and absolute expiration;
- explicit logout and server-side revocation;
- no caching of authenticated responses.

`sessionStorage` remains migration-only debt until the BFF cutover is complete.

## Database blast-radius controls

- Move implementation tables to a private schema where feasible.
- Expose only narrow views/RPCs through an API schema.
- Revoke `PUBLIC`, `anon` and `authenticated` defaults before object creation.
- Force RLS on exposed tenant/game tables.
- Use service privilege only after application authorization.
- Replace broad service clients with capability-specific repository interfaces.
- Keep operator/release tables and secrets outside the browser application schema.
- Deny production project references in staging acceptance and operator functions.
- Separate staging and production keys, backups, runners and operator accounts.
- Audit the final live catalog, not only migration text.

## Sign-in findings added to the fix ledger

- publishable key previously used as both `apikey` and bearer JWT;
- project reference and publishable key were not cryptographically paired by the browser runtime;
- public signup was coupled to complete game provisioning;
- staff password minimum was eight characters;
- signup was not protected by a route-owned progressive throttle;
- staff email was marked confirmed during service-role account creation;
- Auth creation errors were collapsed into generic conflicts;
- staff login bypassed application-specific account/device throttling;
- staff bootstrap returned only active games and could look like a login failure;
- staff and Auth UUIDs were returned unnecessarily;
- Player login could create orphan sessions when bootstrap failed;
- repeated Player login could create multiple active sessions;
- Player code rotation did not revoke existing sessions;
- login smoke tests validated visibility but not connected authentication journeys;
- static UI claimed Supabase was connected without a real health result.

## Implementation status

Implemented in the first convergence tranche:

- split `bootstrap-api`, `player-api`, `staff-api` and legacy compatibility surfaces;
- publishable key restricted to `apikey` transport;
- server-mediated staff password sign-in;
- opaque browser/Player Terminal device identifier header;
- HMAC-only account/device/IP progressive throttle ledger;
- staff signup and Player login failure-sensitive throttling;
- 15–128 character mixed staff password validation;
- staff status, role, permission version, security version and MFA-required database state;
- controlled staff Auth metadata on new account creation;
- exact bootstrap body-byte and media-type boundary;
- hardened JSON security headers and CORS device-header contract;
- local gateway response-header sanitization for response-splitting prevention;
- test seams for deterministic security-policy validation.

Not yet release-ready:

- MFA enrollment/challenge UX and universal AAL2 enforcement;
- staff metadata backfill for existing Auth users;
- granular operation permission matrix replacing wildcard permissions;
- universal request-boundary application to every Edge entry point;
- route/device limiting on every staff, Admin and server-runner endpoint;
- Argon2id Player access-code migration and session revocation on rotation;
- same-origin BFF and HttpOnly cookie cutover;
- strict document CSP/Trusted Types cleanup;
- private-schema/database capability reduction;
- timestamped HMAC replacement for static runner secrets;
- removal of all `classroom-api` compatibility calls;
- connected adversarial staging proof and legacy-zero-traffic evidence.

## Legacy retirement ledger

| Legacy mechanism | Replacement required before removal | Retirement proof |
|---|---|---|
| Publishable/anon key as bearer | split API identity contract | source scan plus connected request capture |
| Mixed `classroom-api` browser router | bootstrap/Player/staff route parity | zero browser references and zero observed browser traffic |
| Direct browser staff password sign-in | mediated login endpoint | connected login, throttle and recovery tests |
| Eight-character password rule | 15-character server policy and Auth config | weak-password rejection tests |
| Wildcard `permissions: ["*"]` | operation permission manifest | authorization matrix tests |
| Hardcoded `twoFactorEnabled: false` | factor inventory and AAL2 enforcement | enrollment/challenge/recovery tests |
| `sessionStorage`/global credentials | same-origin HttpOnly cookie BFF | XSS/session theft tests and source scan |
| Decorative CSRF token | cookie-bound verified CSRF | cross-site mutation rejection test |
| SHA-256 Player access codes | versioned Argon2id verifier | lazy-rehash and legacy-zero-count evidence |
| Static purchase-code SHA-256 | high-entropy code plus keyed digest | brute-force and disclosure tests |
| Static runner secret | timestamped HMAC/nonce contract | replay/skew/signature tests |
| Client UUID routes/responses | server-derived scope and public identifiers | privacy corpus test |
| Meta-only CSP | HTTP response CSP and Trusted Types | browser policy report with no violations |
| Mutable GitHub Action tags | full commit-SHA pinning | workflow policy check |
| Legacy service-role key | `sb_secret_` and capability-specific server clients | secret inventory and rotation evidence |
| Migration-text-only privilege checks | final live catalog auditor | isolated restore/catalog report |

Removal order is always:

`inventory → replacement → parity tests → isolated staging dual-run → zero legacy use → delete legacy → rotate/revoke credentials → rerun full gate`

## Release gates

The branch remains NO-GO until:

1. every browser, staff, Player, operator and internal route appears in the route-policy manifest;
2. every route has method/body/schema/auth/rate/idempotency/response tests;
3. AAL2 is enforced for privileged staff operations;
4. existing staff Auth metadata is reconciled and stale claims are rejected;
5. Player access credentials are migrated and legacy SHA-256 count is zero;
6. browser-readable session tokens are removed;
7. the legacy mixed router receives zero browser and internal compatibility traffic;
8. live database catalog grants, RLS, security-definer functions and search paths pass the auditor;
9. adversarial tests cover brute force, device reset, rotating IPs, NAT behavior, replay, session theft, horizontal scope, malformed payloads, concurrency and partial outage;
10. backup/restore, rollback, key rotation, cleanup and zero-residue checks pass in isolated staging;
11. the production project remains untouched during verification;
12. all CI, CodeQL, secret scanning, dependency review, SBOM and artifact-attestation gates pass.
