# Player authorization and privacy security matrix

**Roadmap scope:** `BETA-AUTH-004`, `BETA-AUTH-006`\
**Authority:** PR #158 / `agent/player-backend-reconciliation-v2`\
**Audit baseline:** `3b55d288cf9f5c76fb51dc122c75d9e78a6d11cc`

The authorization matrix and shared rate-limit foundation remain additive. The
`BETA-AUTH-006` privacy tranche redesigns the existing Player login and
bootstrap response DTOs without adding a route, database object, migration,
capability advertisement, or visual change. These items remain
`IMPLEMENTED_NOT_MERGED` until integrated into PR #158 and are not
`VERIFIED_COMPLETE` until merged to `main` with the remaining evidence below.

## Authorization matrix

| Scenario                       | Expected boundary                                                                                   | Automated evidence                                                                             | Current result                |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| Repeated invalid tokens        | Every attempt returns the same non-retryable `401`; raw token and hash stay out of the public error | `authorization matrix: repeated invalid-token attempts fail closed with uniform public errors` | Passes for 25 unique attempts |
| Revoked token                  | `401 player_session_revoked`                                                                        | `authorization matrix: revoked, expired, inactive, and malformed-expiry sessions fail closed`  | Passes                        |
| Expired token                  | `401 player_session_expired`, including equality with the expiry instant                            | same test                                                                                      | Passes                        |
| Inactive session               | `401 player_session_inactive`                                                                       | same test                                                                                      | Passes                        |
| Malformed expiry               | Fail closed with `409 invalid_player_session_expiry`                                                | same test                                                                                      | Passes                        |
| Replay after revocation        | Initial active resolution may succeed; the same token must fail after authoritative revocation      | `authorization matrix: replay of a token after revocation is rejected`                         | Passes                        |
| Browser-selected wrong game    | `401 invalid_player_session_scope`                                                                  | `authorization matrix: cross-game request hints and cross-game resolved rows are rejected`     | Passes                        |
| Cross-game resolver mismatch   | `401 invalid_player_session_scope`                                                                  | same test                                                                                      | Passes                        |
| Wrong-player resolver mismatch | `401 invalid_player_session_scope`                                                                  | `authorization matrix: wrong-player resolution and ownership injection are rejected`           | Passes                        |
| Browser ownership injection    | `400 invalid_player_request`                                                                        | same test                                                                                      | Passes                        |
| Valid active owner             | Player, game, and session ownership derive only from the authenticated session                      | `authorization matrix: active owner succeeds without accepting browser-selected ownership`     | Passes                        |
| Brute-force throttling         | Shared limits by IP, identity, game, and action; audited `429` and retry headers                    | Not implemented here                                                                           | Blocked by `BETA-AUTH-005`    |

The repeated-attempt test verifies fail-closed behavior and uniform errors, not
rate limiting. The shared limiter foundation is now defined in
`shared-rate-limit-foundation-2026-07-18.md`; `BETA-AUTH-004` must remain open
until it is integrated on authoritative routes and has database-backed
runtime/clock/concurrency evidence.

## Browser, log, fixture, artifact, and error privacy

`playerBrowserLeakAudit.ts` scans the Player Terminal source, preview evidence,
and common generated-artifact roots. It detects high-confidence secret literals
and credential-bearing console, DOM, storage, or `postMessage` sinks. The
scanner deliberately permits the in-memory transfer of a session token into an
authenticated request header; it rejects rendering, logging, persisting, or
messaging that credential. Findings identify only the path, line, rule, and a
redacted marker, so the scanner cannot repeat discovered secret material into a
CI log.

`playerBrowserPayloadPrivacy.test.ts` verifies the reviewed capability manifest,
logout response, generic authorization errors, UUID-free login DTO, and
UUID/token-free bootstrap DTO. The login test permits exactly one sensitive
field, `session.token`, because that newly issued credential must cross the
authenticated success response once. Regression fixtures continue to prove
that legacy UUID-bearing bootstrap fields and any other credential field are
detected.

`playerBrowserSessionPrivacyHttpHandlers.test.ts` executes the login and
bootstrap handlers against UUID-bearing persistence fixtures. It proves the
browser receives only the public mutable Player ID (`playerIdentifier`), that
the raw token appears only in login success, and that old player rows without a
public identifier fail closed instead of falling back to an internal UUID.

The legacy frontend and Player Terminal no longer derive game or session scope
from `gameSession.id`, `player.id`, or `session.id`. Token handoff accepts an old
login object only for backward compatibility with its authenticated raw token;
it discards UUID scope and clears stale configured IDs. UUID-dependent legacy
capabilities therefore remain fail-closed until their backend routes derive
scope from the authenticated session.

Current source/artifact scan result: no high-confidence Player Terminal leak was
found in the scanned roots. This is repository evidence only, not browser or
staging runtime evidence.

## Open blockers and findings

1. The newly issued login token must remain transient and must still be verified
   absent from DOM, logs, storage, screenshots, traces, and error telemetry in a
   real connected staging login.
2. The current check cannot inspect uncommitted developer files, CI platform
   logs, hosted observability, browser memory dumps, or staging network traces.
   Those require CI artifact scanning and isolated staging evidence.
3. Shared brute-force rate-limit persistence, keying, policy, and response
   contracts exist on PR #158. Route integration, login pre-auth IP/action
   limiting, proxy trust verification, database replay, and staging concurrency
   evidence remain open under `BETA-AUTH-005`.

## Commands

From `backend/`:

```sh
deno test --config supabase/functions/classroom-api/deno.json \
  --lock=supabase/functions/deno.lock --frozen \
  src/domains/players/api/playerBrowserSessionPrivacyHttpHandlers.test.ts \
  src/security/playerAuthorizationSecurityMatrix.test.ts \
  src/security/playerBrowserPayloadPrivacy.test.ts

deno test --no-config --allow-read \
  scripts/security/playerBrowserLeakAudit.test.ts

deno run --no-config --allow-read \
  scripts/security/playerBrowserLeakAudit.ts
```

No migration, new route, RPC, schema, workflow, or package-script change is part
of the privacy tranche. Existing login (`POST /players/login`) and bootstrap
(`GET /players/me`) response contracts change in place.

## Local verification evidence

The following checks passed on the privacy tranche based on the shared
rate-limit foundation commit
`3b55d288cf9f5c76fb51dc122c75d9e78a6d11cc`:

- Backend TypeScript typecheck;
- 17 handler, authorization-matrix, and payload-privacy tests;
- 3 new leak-scanner tests and the live repository scan;
- full Player Terminal `npm run verify`, including source, smoke, hardening,
  adapter, transaction-flow, timeout, audit, and 11 accepted visual locks;
- repository `npm test`, including the 61-migration audit and Admin v606 drift
  gates;
- 10 existing player request-scope regression tests;
- the Backend smoke sequence through Classroom API smoke and all Player suites:
  45 market, 10 request-scope, 8 capability, 17 world, 14 inventory, 15
  notification, 9 logout, and 9 contract-acceptance tests.

Backend Edge typecheck and the full smoke command reached a remote Supabase
module import (Edge typecheck first; Admin API after every Player suite) but could not
download `@supabase/supabase-js@2.108.2` from `esm.sh` because this execution
environment refused the network connection. No Admin assertion ran or failed; PR
CI remains the required authoritative full-gate evidence.
