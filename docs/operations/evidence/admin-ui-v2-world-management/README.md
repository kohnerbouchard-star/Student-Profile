# Admin UI V2 World Management Evidence

Branch: `refactor/admin-ui-v2-world-management-v1`
Base: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
Scope: source-owned Admin V2 World Management only.

## Evidence set

- `contract-audit.md` records the authoritative World read/write inventory and excluded controls.
- `validation-matrix.md` maps the requested acceptance cases to automated/source checks.
- `scripts/admin-v2-world-management.test.mjs` contains the focused executable contract tests.

## Pre-commit source validation

The new route-owned JavaScript modules and focused test were syntax-checked with `node --check` before publication.

The review/CI validation commands for the published branch are:

```text
node --test scripts/admin-v2-world-management.test.mjs
npm run test:admin-v2
```

The first command validates World-specific contracts, normalization, permissions, stale/empty behavior, safe errors, route boundaries, and responsive source requirements. The second preserves the existing Overview, Store, and Market V2 regression suite.

The branch was rebased onto the latest fetched `main`; the intervening mainline changes were confined to Player coordinator files and did not modify Admin V2 or World contracts.

No production, staging, database, Supabase, or manual deployment action is part of this evidence set.
