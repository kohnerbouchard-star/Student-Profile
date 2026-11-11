# Admin World Management route extraction

- Roadmap ID: `ARCH-LARGE-ADMIN-WORLD-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; draft [PR #939](https://github.com/kohnerbouchard-star/Student-Profile/pull/939), isolated owner `refactor/admin-world-management-route-extraction`.
- Published implementation: `d162f3ea55064cc0816a94d34439e91e0c6929f6`, tree `d2a173023034f40d995b358bb09a77bc6e35488e`, identical to current-main local integration checkpoint `8e0db57bffbc0346ff6361684be05ef52174196e`.
- Original source base: `c616ece3e1cebea79fd33c58f5f04ed961121407`; reviewed implementation `f7d94eef29aade53236482b642479c3d5730c715`. Current-main reconciliation base: `b77c9610e9b6ed3be93d8f4c888cacbc706df8ca`, freshly fetched 2026-11-10.
- The owner explicitly approved retained-content public roadmap updates and qualified serial merges in World, Market, Banking, News & Events, Attendance and Messages order. Merge only after every required gate clears and the parent grants the serial merge slot. No production deployment, hosted-data mutation or release is authorized.

## Scope and ownership

The owner approved continuing independent behavior-preserving large-file refactors. A refreshed audit of all eleven open PR heads and changed-path inventories (#938, #936, #933, #929, #927, #924, #735, #731, #668, #624 and #620) found no World route/test owner. Main already includes Crafting #935, Player Crafting #932, hash #937 and Story #934; historical unmerged ledger wording does not certify current runtime. Current main does not change the extracted World source or characterization registration. Existing API/controller, app/shell, CSS, lifecycle, Settings, persistence, feature and release owners remain untouched. Shared roadmap/inventory metadata is reconciled additively with all current-main content retained.

Runtime changes are confined to `admin/v2/src/routes/world-management/`:

- `WorldManagementRoute.js` retains the sole public route export, all six data-state branches, refresh ownership, panel composition, shared confirmation ownership and idempotent destruction. It falls from 934 to 178 physical lines.
- `WorldOverviewPanels.js` owns summary, partial-data notice, runtime, country and currency presentation (163 lines).
- `WorldCampaignPanels.js` owns campaign lifecycle, effect recovery and Arrival Class presentation and their existing reviewed callbacks (262 lines).
- `WorldGeographyPanels.js` owns geography, route close/reopen, read-only travel and residency presentation (227 lines).
- `WorldViewHelpers.js` owns formatting, buttons, status pills, fact grids and section-card construction (118 lines).

All 23 original top-level function bodies are byte-identical, apart from export declarations. Import/export wiring is the only runtime change. DOM structure/order, CSS classes, labels, accessible attributes, section anchors, table columns/row identity, reviewed action labels and messages, callback identity, cancellation, error propagation, failure retention, stale/refreshing mutation disabling and cleanup are preserved. The public route module still exports only `WorldManagementRoute`.

No API, controller, permission, authentication, security, economic policy, persistence, backend, schema, migration, RPC, route URL, dependency, stylesheet or workflow is changed. No previously unavailable mutation is introduced. In particular, currency/residency remain read-only and News & Events stays a separate monitor.

The deterministic inventory falls from 99 to 98 source files at or above 500 lines. Its newline-inclusive original route count is 935; physical line count is 934. On current main, source files rise from 1,333 to 1,337 (the earlier base was 1,329 to 1,333). Every other count and ratchet ceiling remains unchanged. The existing lexical `fallback` marker moves to `WorldViewHelpers.js`; no compatibility behavior is added or removed.

## Characterization and verification

All 24 new route characterization cases passed on unchanged main before extraction and on the candidate. They execute the actual local module graph using explicit shared-component doubles. Coverage includes native module linking/sole export, all original function digests, six states and refresh callbacks, accessible state and disabled actions, panel/anchor/table/column order, row identity, Unicode locations/currency presentation, partial data, campaign states and reviewed pause/resume/emergency disable, effect recovery, exact Arrival Class options and no-op guard, close/reopen, missing action references, cancellation/re-review, reported/thrown/default failures, retry retention, pending-command clearing and idempotent destruction.

The new suite is imported by the existing `admin-v2-runtime-ux-stabilization.test.mjs`, so both full root tests and the existing registered Admin V2 suite execute it. Existing assertions are retained unchanged. No package script or workflow is altered. Component doubles do not certify browser focus, shared-dialog internals or layout; retained `Admin Browser E2E` qualification remains mandatory and includes the existing real-browser World navigation, seven-read BFF, section/pack/revision and privacy assertions.

Local tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Fresh root and backend `npm ci` pass without manifest/lock changes.

Completed checks:

- Unchanged-main route characterization: 24/24.
- Candidate route characterization: 24/24.
- Registered Admin V2 suite: 150/150. Current-main integration reruns of all 24 focused, 150 Admin and full root tests also pass.
- Backend TypeScript stage: passes; aggregate Edge qualification is recorded separately below.
- Deterministic architecture inventory: 98 oversized sources, with other debt counts unchanged.
- Full root `npm test`: passes, including its architecture, boundary, legacy, security and Admin contracts.
- Architecture ratchet and secret scan: pass, with no raised ceiling.
- Whitespace checks: pass.

Outstanding checks and known baseline failure:

- Original implementation independent source review found no actionable findings. Current-main integration review and exact-head hosted qualification are pending at this checkpoint.
- Backend `typecheck:all` reaches its unchanged frozen Supabase esm.sh import and fails with connection refused; no aggregate pass is claimed.
- Backend smoke stops at the same unchanged frozen Supabase esm.sh dependency with connection refused. Later aggregate stages are unexecuted; no full pass is claimed.
- Local browser launch cannot find the pinned Chromium headless shell. The official Playwright Chromium 158.0.8127.18 installation into a writable temporary cache fails on truncated/invalid ZIP downloads. No browser assertion is claimed passed; hosted qualification remains mandatory.
- The old, unregistered `scripts/admin-v2-world-management.test.mjs` reproduces 8/9 passing on untouched main, with the last test incorrectly expecting News & Events to remain `planned` although the accepted registry says `v2`. That test also contains historical Marketplace and route-copy assumptions. This extraction does not edit, remove, skip or weaken it, and does not claim that suite passed. Its eight API/controller cases pass. The new route characterization is independently registered without importing that stale test into the aggregate.

## Rollback and next step

Revert only this extraction and regenerate the inventory. No database or hosted-state rollback is required. Preserve other owners' source and additive ledger entries.

Next exact item: independently review current-main integration, publish a separate draft PR with actual-number authority preserving all current-main required/critical checks, then qualify its exact final head. The newly explicit public-roadmap approval cleared the previously unexecuted upload on its single evidence-backed retry; the returned blob and published tree hashes were verified. PR #939 authority retains all 129 required and 94 critical predecessor checks unchanged, including Admin Browser E2E, under 15 exact path locks (13 changed paths plus two unchanged read-only verifier/test paths). Production deployment, mutation and secret handling remain false. After every mandatory gate clears, coordinate the merge slot with the parent, then advance to Market, Banking, News & Events, Attendance and Messages serially. No deployment or broader feature/runtime completion credit is granted.


## Qualified scanner-main reconciliation and complete gate scheduling

Integrate current main `a44d8e52119b9f2f3e6642dad0caabf845c46b39`, whose qualified tree `4fdfb3a1c83e451a1bc11ca574790ace4169a049` contains merged scanner #936/#929. Preserve its complete runtime/harness fixes, REF003 review bindings, both authorities, evidence, intake records and workflow guards. Earlier scanner draft wording remains historical source evidence, not a new pending dependency. The existing World remote history `d754861e9120c99a854c8eabcfb83ab4baca749f` is retained; no World runtime, harness, characterization or registration byte changes are needed.

All fifteen current open PR pathsets (#944, #943, #942, #941, #940, #939, #938, #933, #927, #924, #735, #731, #668, #624 and #620) were refreshed. No competing World runtime/test owner exists. The broad dependency-update owner #620 overlaps workflow files and #731 overlaps Database Replay/Multiplayer workflow files; their action versions, job content and guards are not changed. Only shared generated metadata and exact scheduling entries need additive reconciliation.

The previous inherited-check audit identified 32 absent names across fifteen retained workflow families. Rechecking current main confirms their pull-request branch filters allow main, but none matches World's original thirteen changed paths. Add only `docs/operations/contracts/player-cross-cutting/pr-939.json` to each existing pull-request paths list, retaining every existing entry, including PR936. The files are enumerated exactly in this PR's authority. Scanner main already supplies the three required exact-head checkout bindings; do not add a duplicate or change them. This supersedes earlier no-workflow-change statements only for these fifteen scheduling entries. No push/manual trigger, wildcard, job, test command, action version, permission, environment, timeout or guard is altered. Workforce's unrelated writer remains restricted to its existing PR, Database Replay's U1 live-shaped rehearsal remains false-held, and production dispatches stay unauthorized.

Authority retains all 129 required and 94 critical current-main checks in their original order, under thirty exact locks covering 28 changed paths and two unchanged read-only verifier/test paths. All production/mutation/secret flags remain false. These names mix workflow labels, jobs and embedded contracts; they are retained qualification commitments rather than 129 independent branch-protection contexts. Missing or intentionally guarded checks are never mislabeled as passes.

Parsed workflow comparison confirms that removing the one added path in each file reproduces current-main workflow structures exactly. Fresh committed-tree root, focused, backend and authority checks, independent union review and exact-head hosted qualification remain mandatory before a serial merge slot. Prior World-head native browser/backend passes and scanner-head passes do not qualify this combined head. No readiness transition, merge or deployment is performed by local integration.


Committed integration checkpoint `8226641f51cfc96dc281087293e4ba769392ea0b` (tree `70dc764750efddf1b20ac8f233a718b62b0b48af`) passes fresh full root `npm test`, 24 World characterization cases, 150 Admin cases, all sixteen authority regressions, exact 28-path/30-lock validation, backend TypeScript, secret scan and whitespace checks under pinned Node 22.23.1/npm 10.9.8/Deno 2.9.3. Root and backend dependencies were freshly installed without lock changes. The inventory was regenerated from this actual combined tree and retains 98 oversized sources, 1,337 source files and all other main counts/ceilings.

Fresh aggregate backend typechecking passes TypeScript, then stops at the unchanged frozen esm.sh Supabase 2.108.2 connection refusal. Full backend smoke executes its preceding suites, then stops at the same import in game-session tests; the full aggregate is not passed. Native Admin browser launch fails before assertions because the locked Chromium headless shell 1254 is absent on this executor. Those missing aggregate/browser results must come from final exact-head hosted runs; no test or dependency pin is weakened. Independent integration review and renewed complete hosted qualification remain pending at this local checkpoint.
