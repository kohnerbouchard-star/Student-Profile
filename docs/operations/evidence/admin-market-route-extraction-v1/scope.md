# Admin Market route extraction

- Roadmap ID: `ARCH-LARGE-ADMIN-MARKET-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; isolated owner `refactor/admin-market-route-extraction`.
- Original base: `c616ece3e1cebea79fd33c58f5f04ed961121407`; reviewed implementation `9ee3c9e953d64565dab2ef37c96a1cde235ca150`. Current-main reconciliation base: `b77c9610e9b6ed3be93d8f4c888cacbc706df8ca`, fetched 2026-11-10.
- The owner approved retained-content public roadmap updates and qualified serial merges in World, Market, Banking, News & Events, Attendance and Messages order. Independent draft qualification may proceed while prerequisites are resolved. Merge only after World, current-main reconciliation, every required gate and a parent-coordinated slot. No production deployment, hosted-data mutation or release is authorized.

## Scope and ownership

The owner approved continuing independent behavior-preserving large-file refactors. All twelve current open PR heads and changed-path inventories were checked: #939, #938, #936, #933, #929, #927, #924, #735, #731, #668, #624 and #620. None owns the Admin Market route, extracted modules, new workflow or characterization. Current main does not change the existing Market route, original API tests or browser runner from the original source base. World Management remains separate draft #939; its source and test registration are not imported here. All current-main source and roadmap entries are preserved. Shared metadata must be reconciled additively after World merges; this preliminary draft cannot merge out of order.

Runtime changes are confined to `admin/v2/src/routes/market/`:

- `MarketRoute.js` retains the sole public route export, six data states, composition, refresh ownership, public update methods, detail selection, drawer lifetime and idempotent destruction. It falls from 666 to 202 physical lines.
- `MarketInstrumentDirectory.js` owns existing instrument cells, filter-option normalization, directory construction, filter state and table refresh (255 lines).
- `MarketActivityPanels.js` owns summary, session-contract notice and bounded read-only trade/event feeds (159 lines).
- `MarketViewHelpers.js` owns original safe-text/private-ID guard, public row-key guard, number formatting, filter keys and buttons (58 lines).

All 23 original top-level function bodies and both UUID/public-symbol regular-expression constants are byte-identical, apart from export declarations. Import/export wiring is the only runtime change. DOM order, classes, labels, accessible semantics, columns/row keys, filters and publication rules, public callbacks, detail loading/error ownership, selected-row guards, Close/reopen, stale updates and cleanup are preserved. The public module still exports only `MarketRoute`.

No controller, API, instrument-detail/chart implementation, permission, authentication, backend, persistence, schema, migration, RPC, route URL, economic policy, dependency or stylesheet is changed. No existing workflow is changed. Market remains read-only and no new mutation is introduced. Existing player Market work and other feature/release owners remain separate.

Relative to this branch's main base, deterministic oversized inventory falls from 99 to 98. On current main, source files rise from 1,333 to 1,336 (the original base was 1,329 to 1,332). The scanner includes the trailing newline, so its old route count is 667. All other debt counts and ceilings remain unchanged; the existing lexical `fallback` marker moves to `MarketViewHelpers.js`. This independent count must not be added to World without regenerating inventory on their combined tree.

## Characterization and verification

All 25 new characterization cases pass on unchanged main and candidate. They execute the actual route import graph with explicit shared-component/detail doubles. Coverage includes sole native export, original function/guard preservation, six data states, accessible state, refresh, exact panel/column order, Unicode and public row keys, price/movement displays, initial filter normalization/deduplication, every filter control, immutable callback payloads, no-publish programmatic updates, detail opener/selection/profile state, mismatch guards, closed drawer updates, reused drawer, callback precedence/retry/fallback, synchronous/asynchronous request failures, missing callbacks, idempotent destruction, empty/missing/failed feeds, eight-record feed bounds, text-only rendering and private-ID suppression.

The suite is imported by existing `scripts/admin-v2-market-api.test.mjs`; its original ten API/controller cases are retained. The existing registered Admin V2 suite executes the combined tests. No package script or original API/controller assertion is changed. A new isolated `.github/workflows/admin-v2-market.yml` runs standard Admin tests and the dedicated Market desktop/mobile browser runner on the exact PR head with pinned Node/npm/Playwright dependencies and read-only repository permissions. The runner previously had no workflow registration; this adds its required hosted gate without weakening existing workflows. Independent review found stale baseline headings and Marketplace disposition in that runner. A bounded correction now expects the accepted Market Monitor title and permission text, and requires native Marketplace V2 instead of its obsolete planned screen. The Marketplace check retains financial-Market read isolation, privacy, overflow and runtime assertions, and adds exact native boundary/heading, selected navigation, fixture-empty state, no planned/legacy handoff, same-origin/path/query checks. No runtime source changes accompany this correction. Real-browser focus, shared drawers/detail components and layout require the retained Market desktop/mobile browser runner and Admin Browser E2E; doubles do not certify them.

Local tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Fresh root/backend installs pass without lockfile or manifest changes.

Passed:

- Baseline route: 25/25; original API/controller baseline: 10/10.
- Candidate registered Market route/API/controller: 37/37, including two added browser-source/workflow registration regressions. The stale-heading/disposition regression fails before the runner correction and passes afterward; the original 25 baseline behavior cases remain unchanged.
- Registered Admin V2 suite: 153/153.
- Full root `npm test`, including architecture, boundaries, legacy and Admin contracts.
- Deterministic inventory regeneration, with 98 oversized files and unchanged other debt counts.
- Backend TypeScript stage, secret scan and whitespace checks.

Pending or limited at this checkpoint:

- Backend `typecheck:all` passes TypeScript, then stops at the unchanged frozen Supabase esm.sh dependency with connection refused. Backend smoke stops on the same dependency. Later stages remain unexecuted, with no aggregate pass claimed.
- The retained Market browser runner cannot find the pinned Chromium executable locally. Its new exact-head hosted gate remains mandatory.
- The same executor's immediately preceding World tranche already reproduced the unchanged frozen esm.sh connection refusal and invalid/truncated official pinned Chromium archive. No alternative dependency or downgraded browser is substituted, and no gate is waived.
- Independent source and browser-runner correction review cleared `9ee3c9e9` with no actionable findings, independently rerunning 37 Market and 153 Admin cases. Current-main integration and exact-head hosted qualification remain pending at this checkpoint; a source review is not a browser pass.

## Rollback and next step

Revert only the bounded extraction and regenerate source inventory. No hosted-state or database rollback is needed. Preserve concurrent owners and all prior roadmap entries.

Next exact item: review current-main integration, publish a separate draft with actual-number authority preserving all 129 required/94 critical current-main checks plus the Market workflow/job if absent, then qualify that exact head. Reconcile shared metadata and source against main again after World merges; rerun exact-head qualification before the parent-coordinated Market merge slot. Banking, News & Events, Attendance and Messages remain separate later merges. No broad feature/runtime completion or production action is claimed.
