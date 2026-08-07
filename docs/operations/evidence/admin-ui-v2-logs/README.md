# Admin UI V2 Logs evidence

## Scope

Branch: `refactor/admin-ui-v2-logs-v1`

This evidence set covers the source-owned V2 Logs migration only. Logs remains a read-only, game-scoped audit/operational surface protected by `audit.read`.

## Contract evidence

Authoritative implementation audited:

- `backend/supabase/functions/admin-api/logs.ts`
- `backend/supabase/functions/admin-api/gameRoutes.ts`
- `backend/supabase/functions/admin-api/adminSecurityGuard.ts`
- `scripts/admin-visible-route-manifest.json`

Observed contract properties:

- `GET /games/:gameId/logs` is game-scoped and paginated;
- default page size is 100; backend maximum is 500;
- supported reads include action search/exact filter, actor type, target type, start/end time, and pagination;
- `logs` maps to `audit.read` in the authoritative Admin permission guard;
- the backend DTO contains internal UUIDs and arbitrary metadata that must not be rendered directly;
- legacy/raw CSV export serializes actor ID, target ID, and metadata, so it is intentionally not exposed by V2;
- backend flag review exists but is intentionally not exposed by this read-only V2 migration.

## Automated checks

Primary contract/unit suite:

```text
node --test scripts/admin-v2-logs-api.test.mjs
```

Covers:

- Logs route legacy -> V2 disposition and `audit.read` permission;
- exact read-only GET contract and supported query parameters;
- no Logs mutation/export API methods;
- safe error normalization;
- UUID/token/service-role/SQL/stack redaction;
- malformed optional metadata;
- Korean/long text preservation;
- 500-row normalization and pagination;
- permission fail-closed behavior;
- ready -> refreshing -> stale behavior;
- filters resetting pagination and authoritative next-page reads.

Browser smoke:

```text
node scripts/admin-v2-logs-browser-smoke.mjs
```

Covers:

- ready and empty states;
- high-volume server pages;
- action filtering;
- stale safe-error behavior;
- `audit.read` denial with zero protected Logs reads;
- Korean content;
- rendered-text and exposed-attribute UUID checks;
- credential/service-role/SQL/stack diagnostic checks;
- 390x844 and 320x568 mobile layouts;
- document overflow and keyboard focus on the horizontal table scroll region.

When run, the browser smoke writes:

- `admin-v2-logs-browser-results.json`
- `logs-ready-1280x720.png`
- `logs-mobile-390x844.png`
- `logs-mobile-320x568.png`

## Regression scope

The migration makes only three shared runtime ownership edits:

- register the new Logs controller in `admin/v2/src/app.js`;
- flip only Logs from `legacy` to `v2` in `admin/v2/src/core/navigation-registry.js`;
- load the route-owned `logs.css` from `admin/v2.html`.

Overview, Store, and Market controller implementations and API contracts are unchanged. Existing V2 regression commands should therefore remain authoritative alongside the Logs-specific suites.

## Security acceptance

The V2 route does not render or retain backend audit identifiers in its normalized model. It does not expose raw CSV export, related-record IDs, flag controls, delete/edit operations, service-role material, access/refresh tokens, raw SQL, stack traces, authentication secrets, or internal ownership UUIDs.
