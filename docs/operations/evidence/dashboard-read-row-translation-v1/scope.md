# Dashboard read row translation

## Scope and ownership

- Roadmap item: `ARCH-LARGE-DASHBOARD-READ-ROWS-001`.
- Baseline: `c3dea58f886285b7346315684e675f6db8b7eed8`; owner `refactor/dashboard-read-rows-20261114`.
- Seven open PR pathsets (#938, #933, #620, #668, #624, #735, #731) have no Dashboard runtime/test overlap. Roster stays under its existing owners; shared inventory and this additive scope intake reconcile serially without replacing other ledger content.
- Retained PR #888 is closed as superseded. Current Dashboard already consumes capabilities integrated through #890. Its optional donor diagnostic residue is untouched.
- Extract only adapter-local row/client/select declarations and pure row-to-DTO/leaderboard interpretation. Preserve the full repository class, dependency snapshots, clock identity, concurrent read admission, query order, scope filters, error semantics, numerical policy and response identity/shape.
- No route, RPC, migration/schema, persistence policy, economic write, UI, credentials, permission, dependency or production change.

## Implementation

- The repository goes from 892 to 522 physical lines (inventory convention: 893 to 523). It deliberately retains the whole cohesive I/O class rather than introducing an arbitrary extra owner to meet a line target.
- Adapter-local row/client/select declarations live in `dashboardReadRows.ts` (202 lines); pure DTO/leaderboard translation lives in `dashboardReadProjection.ts` (231 lines). Snapshot-derived Store DTO type aliases follow the existing financial projection pattern without adding production cross-domain imports.
- The original class, dependency interface and error helper, all pure function bodies and the original public module export set are preserved. Only internal exports/import location and one select declaration's formatting change.
- Inventory: 1,387 sources, 83 oversized files (unchanged), 52 persistence exceptions, 210 compatibility-marker files and zero foreign infrastructure imports. Deep imports go from 70 to 71 solely because the new characterization must instantiate the existing narrow Store error type; runtime deep-import count does not increase. No ceiling or exemption changes.

## Qualification

- Twelve independent public-entrypoint tests pass on untouched baseline and extraction, type-checked with the frozen lock, cached-only and network denied. Four cohesive test/support modules stay below 500 lines.
- Tests cover exact queries/selects/order/limits, concurrent dependency starts and Date identity, game/player filters, failure translation/identity, malformed positions, defaults, private/public projections, country selection, currency-local ranking/ties, numeric behavior, inventory, purchases, market news and contract reference identity.
- One additive import registers those tests through the retained Dashboard API test, so existing hosted Dashboard commands run them without replacing any assertion. The expanded API/limiter/realtime suite passes 62/62; full root tests, core TypeScript, deterministic inventory/ratchet, secret scan and whitespace checks pass.
- Local full `typecheck:all` and backend smoke stop at the unchanged frozen SDK retrieval `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` with connection refused. Neither aggregate is claimed as passed; fresh exact-head hosted Backend gates remain required.
- Independent source review finds no actionable findings and verifies all 40 original declarations, exact public exports, equivalent snapshot-derived types and public-read coverage. Full class, dependency interface and error helper are byte-identical; moved declarations retain identical tokens except internal exports and formatting. Independent expanded suite and core TypeScript pass.
- Independent recovery review, actual-number draft authority, fresh exact-head hosted qualification and actual postmerge verification remain pending. No staging/runtime or production completion is claimed. Production remains held.
