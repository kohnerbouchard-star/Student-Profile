# Admin UI V2 World Management Evidence

Branch: `refactor/admin-ui-v2-world-management-v1`
Base: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
Scope: source-owned Admin V2 World Management only.

## Evidence set

- `contract-audit.md` records the authoritative World read/write inventory and excluded controls.
- `validation-matrix.md` maps the requested acceptance cases to automated/source checks.
- `scripts/admin-v2-world-management.test.mjs` contains the focused executable contract tests.

## Reconciled validation

The branch was reconciled against the latest fetched `main` at `4c17b942fcf4b2a6f60b629549f192d066053ba4`. The intervening mainline changes were confined to Player coordinator files and did not modify Admin V2 or World contracts.

A first validation run identified two stale assertions in the existing shared V2 unit suite: it still expected World Management to be `planned`. Those assertions were reconciled to the new first-class V2 route without changing runtime behavior.

The corrected branch was validated at head `5eab9621466daa5ad2188d9fb4dd87135722d469` by GitHub Actions run `31175193936`, job `92855548139`, using Node `22.23.1` and npm `10.9.8`.

```text
node --test scripts/admin-v2-world-management.test.mjs
# tests 9
# pass 9
# fail 0
# duration_ms 133.525957

npm run test:admin-v2
# tests 31
# pass 31
# fail 0
# duration_ms 236.856537
```

The focused suite validates authoritative World reads and reviewed mutations, safe error normalization, private-ID suppression, Unicode/long-name handling, authoritative currencies, permission denial, empty/stale lifecycle behavior, and the World Management / News & Events route boundary.

The V2 suite verifies the reconciled navigation/route-boundary expectations and preserves Overview, Store, Store media, and financial Market regressions.

## Repository-wide check context

The prior published World head also completed Backend Typecheck, Admin Browser E2E, Environment Neutral Browser, Runtime Interaction Wiring, Button Action Coverage, Supply Chain Security, Staging Readiness Preflight, Release Integrity, Production Runtime Promotion Contract, and exact-artifact promotion checks successfully.

Repository Quality, Admin Shell Smoke, and Admin Scroll Integrity reported existing mainline ratchet/legacy-scroll failures outside this branch's changed files: the architecture ratchet counts 12 `MutationObserver` instances against an 11-instance cap, and the legacy scroll tests assert older `admin-scroll-integrity.css` literals. World Management introduces no `MutationObserver` and does not modify the legacy scroll stylesheet or its contracts.

The automatic Vercel preview was requested by the Git-connected PR flow. Vercel reported the account's free-plan daily deployment rate limit rather than an application build failure.

No production, staging, database, Supabase, manual deployment, or merge action is part of this evidence set.
