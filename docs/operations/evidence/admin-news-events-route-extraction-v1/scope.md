# Admin News & Events route extraction

- Roadmap ID: `ARCH-LARGE-ADMIN-NEWS-EVENTS-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, owner branch `refactor/admin-news-events-route-extraction`; separate draft publication is authorized and pending.
- Source implementation: `6f031230d54d9cb226739eb5b6f6581da7f15967`, tree `369a79ee632beacbd7bf935280ee78bc986d04e1`.
- Audited base: freshly fetched main `b77c9610e9b6ed3be93d8f4c888cacbc706df8ca` on 2026-11-10.
- Production deployment, hosted data mutation, merge and check waivers are excluded.

## Ownership and source scope

The owner requested continuing independent large-file refactors. A fresh connected audit on 2026-11-10 found fourteen open PR heads and pathsets (#941, #940, #939, #938, #936, #933, #929, #927, #924, #735, #731, #668, #624 and #620), none owning the selected News & Events source/tests. The existing News workflow remains unchanged, including the actions dependency surface also present in #620. No donor branch is used. Main contains merged Crafting #935, hash #937, Player Crafting #932 and Story persistence #934; historical unmerged ledger wording is not a new completion claim. World #939, Market #941 and Banking #940 remain separate draft PRs. The News remote branch is absent; this existing local branch owns the work.

Runtime scope is restricted to `admin/v2/src/routes/news-events/`:

- `NewsEventsRoute.js`: 543 physical lines to 68; original public route, six-state rendering, skeleton, refresh action and frozen return interface.
- `NewsEventsTimeline.js`: 199 lines; merged timeline ordering, filters and table composition.
- `NewsEventsDetail.js`: 99 lines; drawer details and existing failed-publication recovery interaction.
- `NewsEventsPanels.js`: 132 lines; metrics, authority notice, schedule, partial-feed errors and composition.
- `NewsEventsViewHelpers.js`: 49 lines; UUID-safe text, formatting and presentation badges.

All twenty-two original complete functions and the UUID text pattern remain byte-identical apart from export keywords. Sole original `NewsEventsRoute` public export and every DOM node/class/attribute/label/order, callback, immutable filter value and recovery lifecycle remain unchanged. No controller/API, auth, recovery contract, route URL, schema, migration, RPC, dependency, CSS, existing workflow or other feature edits.

Deterministic inventory decreases 99 to 98 oversized sources, with source files 1,333 to 1,337 and every other measured debt/ceiling unchanged, including 52 persistence exceptions. Scanner count includes the trailing newline (original route 544). The existing lexical fallback marker moves to the helper. Other branch inventories must be regenerated on integration, not summed mechanically.

## Tests and qualification

Twenty-two route characterization cases pass on unchanged main before extraction and on the candidate. They cover native export linkage, all original complete-function hashes, six route states/defaults, retry ownership, frozen public/filter values, panel/table ordering, authoritative timestamp ordering, absence states, NFKC search and filters, partial-feed failures, event/news details, opener/close cleanup, UUID-bearing display suppression and failed-publication recovery validation, pending state, failure and success. Component-seam doubles run the actual local module graph; they do not replace browser focus/layout or real recovery checks.

The eight original News & Events API/controller cases are unchanged except one additive import registering characterization. The existing `Admin V2 News & Events` workflow already runs that suite directly, plus the Admin suite, responsive native-app browser runner and permission-denial runner. All existing workflow and browser files remain byte-identical. Actual-number PR authority must preserve all current-main required/critical gates and explicitly retain this workflow/job.

Local pinned tools are Node 22.23.1, npm 10.9.8 and Deno 2.9.3. Clean root/backend npm installs pass without manifest or lock changes. Baseline 22 characterization and eight existing tests pass; candidate combined News & Events 30/30 and unchanged Admin 126/126 pass. Full root `npm test`, backend TypeScript, architecture/seam ratchets, secret scan and whitespace pass on the implementation checkpoint. Independent read-only review found no actionable finding, independently compared all twenty-two complete functions and the UUID guard against the base AST, verified an acyclic import graph, reran 22 baseline/30 candidate/126 Admin cases and regenerated identical inventory bytes.

Browser remains unexecuted: pinned Chrome Headless Shell 158.0.8127.18 is unavailable, and its official Playwright v1254 download returned a truncated/invalid ZIP in the parallel Banking qualification. No downgrade or substitute browser is used. Both retained browser suites were attempted and fail at browser launch before any browser assertions; they remain mandatory. Current Edge and full backend smoke attempts stop at the unchanged frozen Supabase 2.108.2 esm.sh import with connection refused. No backend aggregate or browser pass is claimed.

The owner explicitly approved retained-content public-roadmap updates and separate publication for World, Market, Banking, News & Events, Attendance and Messages. This clears the prior News publication hold; it does not authorize changing or retrying the separate scanner #936 held item. Publication uses the connected GitHub tools and preserves every current-main roadmap byte plus this bounded News intake. No ready-for-review transition or merged-complete claim occurs.

## Rollback and next step

Revert this bounded source/test extraction and regenerate the inventory. No database rollback or hosted-state change is needed. Publish the reviewed candidate as a separate draft, register its actual PR-number scope authority, and obtain preliminary exact-head hosted qualification. The coordinated merge order is World #939, Market #941, Banking #940, News & Events, Attendance, Messages. Reconcile current main after predecessors merge, preserve their source/intake/authority, regenerate inventory and rerun final exact-head qualification before a separately coordinated merge. Preliminary checks cannot satisfy that later final-head gate. Preserve all other active owners and production holds.
