# Admin UI V2 Progression evidence

## Change under review

Branch: `refactor/admin-ui-v2-progression-v1`

Initial contract audit: `main` at `b7827211f0ff15b8a963219a63738180b33a1b3d`. Before publication, the branch was rebased onto current `main` at `4c17b942fcf4b2a6f60b629549f192d066053ba4`; the intervening changes were Player app coordinator files and did not overlap this migration.

The migration makes `#progression` a source-owned Admin UI V2 route under `progression.review` and preserves the existing Admin progression BFF as the sole authority.

## Contract evidence

Authoritative Admin operations audited:

1. Progression state: `GET /games/{gameId}/progression`.
2. Correction history: `GET /games/{gameId}/progression/corrections`.
3. Audited correction: `POST /games/{gameId}/progression/players/{playerId}/corrections`.

Supported correction mechanics remain exactly the backend-defined experience/reputation corrections. Achievement details are count-only in the Admin DTO. No separate pending-review queue is exposed by the current contract, so none was added.

## Safety assertions

The V2 implementation is expected to prove:

- `progression.review` blocks reads and writes when absent;
- browser requests stay inside the local `/api/admin` BFF boundary;
- no bearer token is constructed by the route;
- correction commands carry one stable idempotency key across retryable replay attempts;
- paused/ended/unavailable game conflicts are represented safely;
- raw backend error details are not rendered;
- ownership/staff UUIDs do not enter the presentation model;
- long and Korean player names/reasons remain supported;
- zero, normal, and high progression record sets normalize without invented mechanics;
- mobile layout retains accessible tables/forms and correction confirmation.

## Validation commands

The repository contract gate is:

```text
npm run test:admin-progression
```

That gate retains the existing Admin/Player Progression compatibility assertions and runs:

```text
node --test scripts/admin-v2-progression.test.mjs
```

The V2-specific suite covers exact read/write paths, safe transport semantics, zero/normal/high records, achievement counts, correction history, UUID exclusion, partial failures, lifecycle conflicts, permission denial, and retry-safe replay behavior.

Additional repository/PR checks should be treated as authoritative for integration regressions. No backend redesign or Player progression change is part of this branch.
