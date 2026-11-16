# Admin Market route extraction

## Current-main reconciliation (2026-11-10)

World #939 merged as actual main `150ca9935ace3182c0a069e2b92691a4b58f2a0f`, tree `1d7db831621b59344d1ed1199b84a93bfa748f8a`, identical to qualified World source head `916598645411fd42076658c210c0af1683f39c3a`. Fresh fetch confirms the actual merge and clean ancestry reconciliation. The existing Market owner `refactor/admin-market-route-extraction` and published head `15ed1b541ac8855ac7f548957ea4a5635f3071ab` are preserved. Market remains `IMPLEMENTED_NOT_MERGED`; this checkpoint prepares a local reviewed candidate, not a hosted qualification or merge.

- Refresh audited all fourteen open PR pathsets. No competing Market runtime/test/new-workflow owner exists. Active #620/#731/#933/#938 overlap is limited to inherited scheduling workflow filenames, not Market runtime/test/new-workflow ownership. This candidate adds only its exact PR941 scheduling path and leaves all current-main actions, jobs, assertions, permissions, non-PR triggers and production guards untouched. Later roster integrations must retain these entries.
- Earlier union conflicts were confined to the roadmap intake and generated inventory. Actual-main ancestry reconciliation introduces no new conflict or source change. Preserve every main roadmap byte and add only Market's intake/current evidence plus the predecessor's qualified merge checkpoint. All main source, evidence, authorities, scanner readiness and REF-003 bindings remain intact; the ten original Market runtime/test/workflow paths remain byte-identical to published `15ed1b54`.
- Regenerated union inventory contains 97 oversized sources and 1,340 source files, compared with actual main's 98 and 1,337. Every other count and ceiling is unchanged. Historical single-branch counts below are not the current union count.
- Audit proved fifteen inherited required workflow families do not match the original Market-only diff. Each receives only `docs/operations/contracts/player-cross-cutting/pr-941.json` in its existing `pull_request.paths`: Story Replay Safety, Required Game Market Timezone, Player Multiplayer and Load E2E, Exchange Calendar Runtime, Banking FX Clearing, Business Financial Market, Player Button Click Safety, Crafting Item Runtime, Business Primary IPO, World Runtime, Loans Lifecycle Read, Database Replay, Economic Core Request Claims, Admin V2 Crafting and Player Response Privacy. All prior PR936/PR939 entries and existing exact-head checkout bindings are retained. No wildcard or new trigger is introduced; all job/action/assertion/permission/production-guard bytes are unchanged.
- Actual-main-relative scope is 29 changed paths under 31 exact locks, including two unchanged read-only verifier/test files. Authority preserves every ordered actual-main predecessor required/critical identity and the existing Market workflow/job: 131 required / 95 critical, with production/mutation/secret flags false.
- Fresh pinned root/backend dependency installs passed during source-identical preparation. That committed union passed full root `npm test`, 37 Market cases, 177 Admin cases, all 16 authority regressions and the 29-path/31-lock authority validator. Structural audit confirmed all 4,446 predecessor non-scope paths, ten original Market non-document files, the full predecessor roadmap and the fifteen path-only workflow additions. Retained scanner/REF-003/seam regressions passed 56 cases; four Phase 15/U1 workflow guard regressions, secret scanning and whitespace checks passed. Inventory regeneration was deterministic. Backend TypeScript passed, while full Edge typecheck and backend smoke stopped at the unchanged frozen Supabase 2.108.2 esm.sh connection refusal; later aggregate stages were not executed. Native Market browser startup could not find pinned Chromium headless shell 1254. Actual-main committed-head reruns pass full root, 37 Market and 177 Admin cases, 76 combined authority/scanner/REF-003/seam/Phase 15 guard cases, exact 29-path/31-lock validation, deterministic inventory, structural preservation, TypeScript, secrets and whitespace. Native browser and frozen Edge/backend limits reproduce unchanged. Independent final review remains required before coordinated publication. No browser, full backend aggregate or hosted qualification pass is claimed for this candidate.

World predecessor repository qualification passed all 129 required / 94 critical identities: 53 successful workflows, 96 passed jobs and 14 intentional guarded skips. Its normal merge completed at 22:50:24Z. These results qualify World's exact source head, not the new Market candidate. They do not certify live runtime or production deployment.

Next exact item: obtain independent final review of the committed candidate, return the exact artifact for coordinated publication on the existing Market branch, then run all renewed exact-head hosted gates before the second-slot merge. Banking #940, News #942, Attendance #943 and Messages #944 remain later, separate merges. No readiness transition, merge, dispatch, hosted mutation or production action is performed by this local preparation.

## Historical preliminary Market evidence

The remaining sections retain the original standalone Market checkpoint for provenance. Their older main, draft-World, inventory and gate-count statements are historical and are superseded by the current-main reconciliation above.



- Roadmap ID: `ARCH-LARGE-ADMIN-MARKET-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; draft [PR #941](https://github.com/kohnerbouchard-star/Student-Profile/pull/941), isolated owner `refactor/admin-market-route-extraction`.
- Published implementation: `fb2c1d75c2cc27b262c72656bbc1cc02fbc0ee0c`, tree `f03d7c0a930ee55f1e9610d86f4783b83bb4e970`, identical to local current-main integration `2233a3039b2097541799902b084614c273a228ea`.
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
- Registered Admin V2 suite: 153/153. Current-main reruns of 37 Market cases, 153 Admin cases and full root also pass.
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

PR #941 authority retains all 129 required/94 critical current-main checks in order and adds `Admin V2 Market` plus `Market V2 contracts and browser smoke` for 131 required/95 critical checks. Sixteen exact path locks cover fourteen changed files and two unchanged read-only verifier/test files; production deployment, mutation and secret flags stay false.

Next exact item: complete independent integration/authority review and qualify the exact published head. Reconcile shared metadata and source against main again after World merges; rerun exact-head qualification before the parent-coordinated Market merge slot. Banking, News & Events, Attendance and Messages remain separate later merges. No broad feature/runtime completion or production action is claimed.
