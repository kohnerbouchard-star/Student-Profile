# Player authorization and privacy security matrix

**Roadmap scope:** `BETA-AUTH-004`, `BETA-AUTH-006`\
**Authority:** PR #158 / `agent/player-backend-reconciliation-v2`\
**Audit baseline:** `7d068bf31a67614bf31bc0ae45f564f4a18556a3`

This tranche adds reusable, additive security checks. It does not change a
runtime route, database object, migration, capability advertisement, or visual
system. These items remain `IMPLEMENTED_NOT_MERGED` until integrated into PR
#158 and are not `VERIFIED_COMPLETE` until merged to `main` with the remaining
evidence below.

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
logout response, and generic authorization errors. It also carries regression
fixtures proving that credential fields and the existing legacy UUID-bearing
bootstrap shape are detected.

Current source/artifact scan result: no high-confidence Player Terminal leak was
found in the scanned roots. This is repository evidence only, not browser or
staging runtime evidence.

## Open blockers and findings

1. `playerLoginHttpHandler.ts` still returns internal `gameSession.id` and
   `player.id`, and necessarily returns the newly issued session token. The
   token must remain transient and must be verified absent from DOM, logs,
   storage, screenshots, traces, and error telemetry in a real connected login.
2. `playerSessionBootstrapHttpHandler.ts` still returns internal
   `gameSession.id`, `player.id`, and `session.id`. The capability manifest
   keeps this legacy route unavailable, but the route must be replaced or its
   DTO must be redesigned before `BETA-AUTH-006` can complete.
3. The current check cannot inspect uncommitted developer files, CI platform
   logs, hosted observability, browser memory dumps, or staging network traces.
   Those require CI artifact scanning and isolated staging evidence.
4. Shared brute-force rate-limit persistence, keying, policy, and response
   contracts exist on PR #158. Route integration, login pre-auth IP/action
   limiting, proxy trust verification, database replay, and staging concurrency
   evidence remain open under `BETA-AUTH-005`.

## Commands

From `backend/`:

```sh
deno test --config supabase/functions/classroom-api/deno.json \
  --lock=supabase/functions/deno.lock --frozen \
  src/security/playerAuthorizationSecurityMatrix.test.ts \
  src/security/playerBrowserPayloadPrivacy.test.ts

deno test --no-config --allow-read \
  scripts/security/playerBrowserLeakAudit.test.ts

deno run --no-config --allow-read \
  scripts/security/playerBrowserLeakAudit.ts
```

No migration, route, RPC, schema, workflow, or package-script change is part of
this tranche.

## Local verification evidence

The following checks passed after rebasing the tranche onto PR #158 head
`5e3969d453c522fcced2b52901ce0df5ce8c45b8`:

- Backend TypeScript typecheck;
- Deno checks for all four new TypeScript modules;
- 11 new authorization and payload-privacy tests;
- 3 new leak-scanner tests and the live repository scan;
- 10 existing player request-scope regression tests;
- the Backend smoke sequence through Classroom API smoke and all Player suites:
  45 market, 10 request-scope, 8 capability, 17 world, 14 inventory, 15
  notification, and 9 logout tests.

The full Backend smoke command then reached the Admin API suite but could not
download `@supabase/supabase-js@2.108.2` from `esm.sh` because this execution
environment refused the network connection. No Admin assertion ran or failed; PR
CI remains the required authoritative full-gate evidence.
