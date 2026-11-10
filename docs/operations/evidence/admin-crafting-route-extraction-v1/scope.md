# Admin Crafting route extraction

- Roadmap ID: `ARCH-LARGE-ADMIN-CRAFTING-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; branch `refactor/admin-crafting-route-extraction`, draft [PR #935](https://github.com/kohnerbouchard-star/Student-Profile/pull/935).
- Implementation commit: `15b920eafe1faa60601d090f6ec878f8c06ab906`; independently reviewed tree: `cea8622d88caf15358fe81c240c62ce263330049`.
- Audited base: `a29f4439368aca18e14a06819e5a7ad6040ac74d` (current main fetched 2026-11-10).
- Production deployment, hosted-data mutation, merge, auto-merge and ready-for-review transition are not authorized.

## Scope and ownership

The owner approved separate behavior-preserving large Admin route refactors. This first tranche extracts Crafting only. Current open PRs #929 (scanner tests), #927 (Overview lifecycle), #924 (Settings), #668 (backend bootstrap), #624 (Player CSS), #735/#731 (release controls) and #620 (dependency workflows) were checked by changed-path inventory; none owns the Crafting route or these new modules. The retained `backup/admin-ui-v2-crafting-preconvergence-20260810` ref is not an active PR owner and is not used as a donor. Current main already contains the separate Player Crafting correction from #922.

Runtime edits are restricted to `admin/v2/src/routes/crafting/`:

- `CraftingRoute.js`: public entry point, state rendering, panel composition, callback defaults, dialog ownership and idempotent destruction remain together. Physical line count falls from 1,077 to 141.
- `CraftingOversightPanels.js`: read-only summary, authority boundary, pack, recipes, supply, effects and integrity presentation (339 lines).
- `CraftingJobsPanel.js`: job rendering, recovery affordances and filter state (170 lines).
- `CraftingDialogs.js`: recovery and supply forms, validation, existing confirmation and mutation callbacks (366 lines).
- `CraftingViewHelpers.js`: shared value formatting, input defaults, route buttons and badges (66 lines).

All 24 original top-level function bodies remain byte-identical after removing only the `export` keyword. New imports/exports provide the only runtime wiring changes. The original public module still exports only `CraftingRoute`. No controller/API client, schema, migration, RPC, route URL, permission/auth boundary, idempotency contract, persistence, CSS, shell, Settings or lifecycle feature is changed. All existing DOM element order, classes, labels, attributes, table column order and callback identities are retained.

The deterministic source inventory decreases from 100 to 99 files at or above 500 lines, with no replacement oversized file. It counts one trailing newline, so its original route count is 1,078. Source files increase from 1,325 to 1,329; all other counts, debt measurements and ratchet ceilings are unchanged. The existing lexical `fallback` marker moves to the shared view helper; no compatibility path is added or removed. Shared roadmap/inventory metadata must be reconciled additively with other owners.

## Characterization and verification

New route characterization was run against a separate unchanged-main source copy before accepting the extraction. All 31 cases pass on both baseline and candidate, including a native import/export check, immutable original-function digest map, all six loading/data states, retry behavior, exact panel/table order and row identity, initial and subsequent filters, recovery validation/failure/cleanup, supply validation/normalization/confirmation/cancellation, and idempotent destruction. Component-seam doubles exercise the actual local route import graph; they do not replace real-browser acceptance or certify shared component focus behavior.

The characterization is imported by the existing Crafting API/controller suite, which the retained Admin V2 suite and Crafting workflow already run. Existing tests and assertions are unchanged. The original desktop/mobile Crafting and supply-mutation browser runners remain required and byte-identical.

Local pinned tools: Node 22.23.1, npm 10.9.8 and Deno 2.9.3. Initial checks reused existing installed dependencies. Clean root/backend `npm ci` subsequently pass with a writable temporary cache, with manifests and lockfiles unchanged; the final registered Admin, TypeScript and full root checks all pass on those fresh installs.

Completed local checks:

- Baseline characterization: 31/31.
- Candidate Crafting route/API/controller: 38/38.
- Registered Admin V2 suite: 126/126.
- Backend TypeScript (`tsc --noEmit`): passes.
- Architecture v2 and seam ratchets: pass, with oversized inventory 99 and every other measured debt unchanged.
- Full root `npm test`: passes after staging the regenerated deterministic inventory; no test was weakened.
- Secret scan and staged/unstaged whitespace: pass.

Outstanding qualification:
- Backend `typecheck:all` passes TypeScript but cannot complete its Edge step because the unchanged pinned Supabase dependency at esm.sh returns connection refused.
- Full backend smoke stops at the unchanged pinned Supabase esm.sh import with connection refused; no aggregate pass is claimed.
- Real-browser run cannot launch because pinned Chromium is absent. The official Playwright Chromium 158.0.8127.18 install fails with truncated/invalid ZIP downloads; both retained browser suites still require hosted qualification.
- Independent read-only review found no actionable source or test issue and independently passed the 38-case Crafting and 126-case Admin suites. Exact-head hosted checks remain pending; metadata registration is described below.

## Rollback and next step

Revert only the bounded extraction and regenerate the source inventory if needed. Characterization can still run against the original route; no database or hosted-state rollback is required. Preserve all concurrent feature work, prior roadmap entries and release/security holds.

Next exact item: independently review and publish the actual-number scope authority, then qualify the exact final head of draft PR935. Continue the other proposed large Admin route extractions separately after another ownership check. This tranche does not certify the entire large-file program or any feature/persistence retirement.

## Draft publication registration

Draft PR935 contains the exact independently reviewed implementation tree. Its actual-number authority locks the 13 changed paths plus the two unchanged authority verifier/test paths, with no wildcard. Main PR923's 125 required and 92 critical checks are retained in order and unchanged; the existing `Admin V2 Crafting` workflow and `Crafting V2 contracts and browser smoke` job bring the totals to 127 required and 93 critical checks. No workflow or verifier is edited. Production deployment, hosted mutation and secret-value flags remain false. This metadata does not waive unavailable browser/Edge evidence or grant merged-main completion credit.

The three-file registration changes only this evidence, the additive roadmap entry and `pr-935.json`; runtime, tests and generated inventory remain byte-identical to implementation `15b920ea`. Final source qualification and the exact-head hosted results must be checked after this metadata commit.
