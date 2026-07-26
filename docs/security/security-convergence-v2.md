# Econovaria security convergence v2

Status: implementation and connected-acceptance convergence in progress on `agent/security-convergence-v2`.

This document is the repository authority for replacing the mixed legacy security model. It is not production deployment authorization. Production remains unchanged until every release gate is proven in isolated staging.

## Security objective

Econovaria must assume that student-controlled browsers are hostile. Browser code, hidden fields, route names, local storage, device identifiers, game identifiers, Player identifiers, and client-supplied ownership data are untrusted. Authorization is derived server-side from a verified Staff JWT or a hashed active Player session. Privileged database access is created only after the route-specific identity, authorization, rate, request-boundary, and replay checks pass.

## Trust-zone and firebreak map

1. **Static browser zone** — public HTML, CSS and JavaScript; contains only a Supabase publishable key and no privileged credential.
2. **Public bootstrap zone** — Staff sign-in, controlled account creation and recovery initiation. No user JWT is assumed. Requires exact publishable-key validation, bounded JSON, account/IP/device throttles, purchase-code authorization where applicable, atomic provisioning and cleanup.
3. **Player zone** — opaque Player sessions only. The browser never supplies a durable ownership UUID. Every request resolves one active, unexpired, unrevoked session and derives Player/game scope server-side.
4. **Staff zone** — real Supabase user JWT, `auth.getUser`, active controlled `staff_users` state, controlled role and version claims, game ownership, operation permission and AAL policy. The JWT is held server-side behind the Admin web-session BFF.
5. **Operator zone** — separate staging-only function. Requires platform JWT, server-side user validation, controlled `security_operator` role, AAL2, one-time signed authorization, exact project/SHA/artifact binding, production-project denial and zero-residue cleanup.
6. **Internal runner zone** — no browser CORS. Scheduled operations target timestamped HMAC or one-time signed invocation, bounded clock skew, nonce replay denial and exact operation scope.
7. **Database zone** — private implementation schema, minimal exposed API schema, forced RLS, revoked default privileges, fixed `search_path`, narrow security-definer RPCs and final-catalog auditing.
8. **Production data zone** — no staging operator or test-fixture authority. Production secrets, backups and operator credentials are separate from staging.

Compromise of one zone must not automatically grant authority in another zone. A Player session cannot call Staff routes. A Staff JWT cannot call operator routes without the operator role, AAL2 and one-time release authorization. A publishable key is application identity only and never user authorization.

## Authentication controls

### Staff passwords

New Staff passwords:

- minimum 15 characters;
- maximum 128 characters;
- at least one uppercase letter;
- at least one lowercase letter;
- at least one number;
- at least one symbol;
- no control characters;
- validated server-side before Auth creation and password reset;
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

- New Staff accounts are assigned the controlled `game_admin` application role.
- `staff_users.status`, role, permission version and security version are server-controlled.
- Auth `app_metadata` must match the database role and versions.
- Sensitive Staff mutations require AAL2.
- TOTP inventory, enrollment, challenge and verification are mediated through the HttpOnly BFF; the browser never receives the Staff JWT used by the MFA service.
- MFA enrollment and challenge routes are the only Staff routes allowed to operate at AAL1 after password verification.
- Successful verification rotates the encrypted Admin session and CSRF binding to an AAL2 token.
- Security-version increments invalidate authorization after compromise, suspension, password reset or role change.
- A phishing-resistant factor must be offered when the platform capability is enabled; TOTP remains the implemented migration factor.
- Recovery-factor and connected isolated-staging exercises remain release evidence, not completed production authorization.

### Player credentials

Player access codes are not Staff passwords. They remain classroom-friendly credentials under a versioned verification contract:

- `credential_hash_version` identifies legacy and current algorithms;
- successful legacy verification performs a one-time upgrade when the configured current verifier is available;
- code rotation revokes every active Player session;
- repeated login does not leave multiple active sessions;
- login failure responses remain uniform;
- access-code length and alphabet policy are explicit and bounded;
- game codes remain non-secret discovery codes and are never treated as authentication by themselves.

Argon2id remains the preferred target if platform support and measured operating cost are acceptable. The final algorithm decision and legacy-zero-count evidence remain release requirements.

## Request and API controls

Every Edge entry point must apply a machine-readable route policy before dispatch:

- exact allowed methods;
- maximum URL length;
- required content type;
- actual body-byte limit, not only `Content-Length`;
- strict JSON object shape and unknown-field rejection;
- field lengths, formats and numeric bounds;
- exact auth scheme and minimum assurance level;
- game/Player/Staff scope source;
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
- Staff mutation category.

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

The Staff/Admin browser architecture now uses a same-origin backend-for-frontend:

- Staff access and refresh credentials are sealed inside an authenticated encrypted `HttpOnly`, `Secure`, bounded `SameSite=Strict` cookie;
- no Staff token is stored in `window`, JavaScript-readable storage, URLs or logs;
- the browser stores only an allowlisted Staff summary, expiry, assurance level, active games, granular permissions and CSRF value;
- real CSRF tokens are bound to the cookie session and verified server-side;
- login, refresh, logout, password reset, MFA elevation and Admin API forwarding are server-mediated;
- session rotation occurs after login refresh and MFA privilege elevation;
- idle and absolute expiration are enforced;
- explicit logout and server-side revocation are implemented;
- authenticated responses are non-cacheable;
- local and production proxies reconstruct reviewed headers and reject arbitrary cookie/header forwarding.

Still required:

- strict CSP delivered as HTTP headers;
- Trusted Types and safe DOM sinks;
- no dynamic HTML from untrusted data without sanitization;
- connected XSS/session-theft and cross-site mutation evidence;
- a final decision on moving the opaque Player session from `sessionStorage` to a Player BFF cookie without changing classroom login semantics.

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
- Staff password minimum was eight characters;
- signup was not protected by a route-owned progressive throttle;
- Staff email was marked confirmed during service-role account creation;
- Auth creation errors were collapsed into generic conflicts;
- Staff login bypassed application-specific account/device throttling;
- Staff bootstrap returned only active games and could look like a login failure;
- Staff and Auth UUIDs were returned unnecessarily;
- Player login could create orphan sessions when bootstrap failed;
- repeated Player login could create multiple active sessions;
- Player code rotation did not revoke existing sessions;
- login smoke tests validated visibility but not connected authentication journeys;
- static UI claimed Supabase was connected without a real health result.

## Implementation status

Implemented in the current convergence branch:

- split `bootstrap-api`, `player-api`, `staff-api`, `staff-mfa-api`, `admin-api`, `web-session-api`, `password-reset-api` and legacy compatibility surfaces;
- publishable key restricted to `apikey` transport;
- server-mediated Staff password sign-in, refresh, logout and recovery;
- encrypted HttpOnly Admin BFF with bounded local and production proxies;
- browser-readable Staff access and refresh tokens removed;
- cookie-bound CSRF and strict origin enforcement;
- opaque browser/Player Terminal device identifier header;
- platform-controlled client-IP overwrite and anti-spoofing tests;
- HMAC-only account/device/IP progressive throttle ledger;
- Staff signup and Player login failure-sensitive throttling;
- 15–128 character mixed Staff password validation on signup and reset;
- verified password reset with global session revocation and Staff security-version transition;
- Staff status, role, permission version, security version and MFA-required database state;
- controlled Staff Auth metadata on new account creation;
- server-owned granular Staff permission grants with route-to-permission enforcement;
- AAL2 enforcement for privileged Admin mutations;
- BFF-mediated TOTP inventory, enrollment, challenge, verification and browser AAL2 journey;
- exact bootstrap body-byte and media-type boundary;
- hardened JSON security headers and CORS device-header contract;
- local and Vercel proxy response reconstruction and trusted-IP overwrite;
- versioned Player credential verification, lazy upgrade support, single-active-session issuance and revocation on rotation;
- direct browser `classroom-api` fallback retired while lifecycle, normalization and idempotency remain BFF-bound;
- auth, gateway, proxy, MFA, session, permission and secret-scanning security contracts;
- CodeQL response-splitting and browser-readable Staff credential findings resolved.

Not yet release-ready:

- connected reconciliation and controlled metadata backfill for existing Staff Auth users;
- universal route-policy application to every remaining Edge entry point;
- universal route/device limiting and idempotency coverage for every Staff, Admin and server-runner endpoint;
- final Player credential algorithm decision and legacy-zero-count evidence;
- phishing-resistant Admin factor and recovery-factor operating procedure;
- strict document CSP/Trusted Types cleanup;
- private-schema/database capability reduction and final live catalog proof;
- timestamped HMAC/nonce replacement for static runner secrets;
- backend `classroom-api` compatibility zero-traffic proof, controlled deletion and credential retirement;
- connected adversarial local and isolated-staging proof, rollback and zero-residue evidence;
- exact-head broad CI convergence.

## Legacy retirement ledger

| Legacy mechanism | Replacement state | Retirement proof still required |
|---|---|---|
| Publishable/anon key as bearer | replaced by split application/user identity contract | connected request capture and legacy-zero scan |
| Mixed `classroom-api` browser router | browser calls retired; split routes and Admin BFF active | zero observed traffic, controlled backend deletion and credential retirement |
| Direct browser Staff password sign-in | replaced by BFF-mediated login | connected login, throttle and recovery acceptance |
| Eight-character password rule | replaced by 15–128 server policy | deployed Auth configuration and connected weak-password rejection |
| Wildcard `permissions: ["*"]` | replaced by server-owned granular grants | complete route authorization matrix and connected denial tests |
| Hardcoded `twoFactorEnabled: false` | replaced by TOTP inventory/enrollment/verification and AAL2 | connected recovery-factor and phishing-resistant-factor plan |
| Browser-readable Staff credentials | replaced by encrypted HttpOnly Admin BFF | connected XSS/session-theft source and runtime evidence |
| Decorative CSRF token | replaced by cookie-bound verified CSRF | connected cross-site mutation rejection |
| SHA-256 Player access codes | versioned migration path implemented | final algorithm decision and legacy-zero-count evidence |
| Static purchase-code SHA-256 | high-entropy code plus keyed digest target | brute-force and disclosure tests |
| Static runner secret | timestamped HMAC/nonce target | replay/skew/signature tests |
| Client UUID routes/responses | server-derived scope and public identifiers | privacy corpus and connected horizontal-scope test |
| Meta-only CSP | HTTP response CSP and Trusted Types target | browser policy report with no violations |
| Mutable GitHub Action tags | pinned/reviewed workflow policy | full workflow inventory proof |
| Legacy service-role key | `sb_secret_` and capability-specific client target | secret inventory and controlled rotation evidence |
| Migration-text-only privilege checks | final live catalog auditor target | isolated restore/catalog report |

Removal order is always:

`inventory → replacement → parity tests → isolated staging dual-run → zero legacy use → delete legacy → rotate/revoke credentials → rerun full gate`

## Release gates

The branch remains NO-GO until:

1. every browser, Staff, Player, operator and internal route appears in the route-policy manifest;
2. every route has method/body/schema/auth/rate/idempotency/response tests;
3. AAL2 is enforced for privileged Staff operations and connected MFA recovery is exercised;
4. existing Staff Auth metadata is reconciled and stale claims are rejected;
5. Player access credentials are migrated and the legacy count is zero under the chosen verifier;
6. browser-readable Staff session tokens remain absent under source and connected browser inspection;
7. the legacy mixed router receives zero browser and internal compatibility traffic before controlled deletion;
8. live database catalog grants, RLS, security-definer functions and search paths pass the auditor;
9. adversarial tests cover brute force, device reset, rotating IPs, NAT behavior, replay, session theft, horizontal scope, malformed payloads, concurrency and partial outage;
10. backup/restore, rollback, key rotation, cleanup and zero-residue checks pass in isolated staging;
11. the production project remains untouched during verification;
12. all required CI, CodeQL, secret scanning, dependency review, SBOM and artifact-attestation gates pass on one immutable exact head.
