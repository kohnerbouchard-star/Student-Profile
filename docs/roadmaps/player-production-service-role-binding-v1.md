# Player Production Service-Role Credential Binding

**Document ID:** `ECON-BETA-PROD-PLAYER-LOGIN-006`  
**Roadmap item:** `BETA-PROD-PLAYER-LOGIN-006`  
**Status:** `IN_PROGRESS`  
**Owner branch:** `fix/player-service-role-key-v1`  
**Exact base:** `a303d9f067f8f37dbd2a57391cc8b31e7a4021e1`  
**Pull request:** pending publication  
**Production deployment authorized:** No

## Incident evidence

Canonical production health was HTTP 200 on deployed release
`4b1cba674b278dd481689aa56d0cc76af97f6e19`, while a bounded synthetic
`POST /api/player-session/login` returned HTTP 503 with
`rate_limit_service_unavailable`. The request failed before Player credentials
were evaluated. The byte-identical staging function reached the expected HTTP
400 validation boundary, which isolates the observed difference to runtime
configuration rather than source.

Both Player limiter RPCs are database-authorized only to `service_role`:

- `consume_pre_auth_request_rate_limits_v1(jsonb)` protects Player login;
- `consume_request_rate_limits_v1(jsonb)` protects authenticated Player
  operations.

The shared application client intentionally selects from several server-secret
sources, including `SUPABASE_SECRET_KEY`, generic `SECRET_KEY`, configured key
dictionaries, and `SUPABASE_SERVICE_ROLE_KEY`. A valid modern Supabase secret
can map to the database `service_role`; the incident evidence does not prove
that modern key class is invalid. A masked production diagnostic subsequently
confirmed that both configured modern and built-in keys can execute the
pre-auth and authentication-throttle RPCs. The generic selection path
nevertheless leaves the exact runtime credential implicit, so this repair binds
the canonical Player transaction to the explicit built-in service-role
credential as deterministic incident isolation. The canonical 503 remains
compatible with HMAC, trusted-IP, or other RPC failures until the post-deploy
synthetic-login probe reaches a safe 4xx result.

## Bounded correction

- Read only the built-in `SUPABASE_SERVICE_ROLE_KEY` at the canonical
  `player-api` entrypoint and fail closed before route dispatch when it is
  missing or unreadable.
- Define one entrypoint-local `createServiceClient` factory backed by
  `createServiceRoleClient`, then pass it through every existing Player
  injection. This covers pre-auth and post-auth limiters, login authentication
  throttles and credential queries, bootstrap, Business and Messaging
  dispatchers, Crafting, Attendance, and all later Player routes, so a
  credential-selection defect cannot merely move to the next database call.
- Keep login parsing, credential verification, session behavior, Player/game
  ownership, HMAC keying, trusted-IP handling, handler query/mutation logic,
  database grants, and fail-closed responses unchanged.
- Leave the shared secret selector, Admin/staff/worker roots, classroom
  compatibility root, database grants, and browser credentials untouched.
- Do not fall back to `SUPABASE_SECRET_KEY`, `SECRET_KEY`, a configured key
  dictionary, or a browser credential in this canonical Player factory.

## Implementation inventory

- `backend/supabase/functions/player-api/runtime.ts`
- `scripts/player-edge-trusted-ip-entrypoint-contract.test.mjs`
- deterministic architecture inventory refresh

No migration, RPC, route, response schema, browser credential, secret value,
Player authentication semantic, application-data mutation, or production
configuration change is included.

## Verification ledger

- Player entrypoint and trusted-IP contract: 6 passed.
- Complete `test:player-security`: 45 passed.
- Backend TypeScript typecheck passed. Full Edge-root typecheck reached an
  unavailable external `esm.sh` dependency in this workspace and remains a CI
  gate.
- High-priority boundary audit: 80 checks passed.
- Authentication-boundary contracts: 25 passed.
- Secret scan: passed with no high-confidence credential finding.
- Architecture inventory regenerated with every count unchanged; only the
  existing `player-api/runtime.ts` line inventory moved from 617 to 641.
- The production `player-api` import closure gains no file; this branch modifies
  the existing runtime in place.

## Release and completion boundary

The public `/health` route intentionally remains ahead of secret validation and
is not sufficient release evidence.

This item cannot become `VERIFIED_COMPLETE` until it is merged into `main`, the
exact merged source is deployed through the authorized staging and production
release path, and canonical bounded probes prove:

1. the existing invalid synthetic login reaches HTTP 400 instead of the limiter
   503, and a well-formed nonexistent Player reaches its expected safe HTTP 401;
2. authenticated Player bootstrap and one protected read reach their normal
   application outcomes;
3. invalid, missing, and replayed Player sessions remain denied;
4. no secret value appears in logs, artifacts, browser responses, or source.

The global beta roadmap is not edited in this branch because open PR #668 owns
that collision-sensitive ledger. Its owner must reconcile this bounded item
after the repair merges. No staging or production mutation is performed by this
implementation branch.

**Next exact action:** publish a draft pull request, add its exact cross-cutting
authority manifest, pass exact-head CI, then hand the immutable candidate to the
authorized staging-to-production release controller.
