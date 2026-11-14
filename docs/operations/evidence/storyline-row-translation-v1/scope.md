# Storyline repository row translation

## Current-main integration (2026-11-14)

- Integrated locally onto freshly fetched main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`, including Contract refactor #964, on `refactor/storyline-rows-integrated-20261114`.
- Recovered source head `80890a3c8e8df670bba5eebb94c6612771c75cc2` and original runtime/test bytes are preserved. This is a new integration tree, not the original reviewed tree. Independent review and recovery must qualify this new tree before publication.
- Original archive remains immutable. Global roadmap edits are omitted because #668 owns that ledger. No denied Business workforce workflow, release control, runtime Contract source, workflow guard, dependency or gate was replaced. The only workflow addition is the recovered Storyline repository test entrypoint.
- Deterministically regenerated inventory preserves current-main Contract extraction: 1,395 to 1,400 sources; 81 to 80 oversized files; all other counts and ceilings unchanged.
- The following original preparation/review claims are historical evidence, not fresh integration qualification. Fresh execution results are recorded separately with the integration recovery handoff. Hosted exact-head qualification and actual-number authority are still required. No publication or deployment in this lane.

## Original scope and ownership

- Roadmap item: `ARCH-LARGE-STORYLINE-ROWS-001`.
- Baseline: `96988b6f2745112a6b91ce9bb5b83ca17ae2f42f`; local branch `refactor/storyline-row-translation-20261114`.
- Reviewed local implementation: `35e81692c2529cfb98446f66e2f52b0903fff941`; source tree `ea42841b39fdd3faf41d33fb5aa252fb2c120b65`. The subsequent identity record changes documentation only. No remote publication.
- All seven live open PR pathsets (#938, #933, #735, #731, #668, #624, #620) were checked. None owns the selected Storyline runtime/test paths. Roster, CSS, release controls, Actions-version updates and global context-ledger work stay separate. Shared Story Replay workflow, inventory and roadmap metadata require additive reconciliation.
- Retained narrative, scheduler and contract-flag branches do not own this extraction. No donor code is imported and no branch is deleted.
- Move adapter-local query contracts, rows and select strings into `storylineRows.ts`; move pure candidate eligibility, elapsed-time, numeric interpretation and row/result mapping into `storylineRowProjection.ts`.
- Keep the entire `SupabaseStorylineRepository` class and both error helpers unchanged. Preserve sequential read admission, filtering, game scope, all trigger thresholds, duplicate-resolution reread, write payloads/conflict keys, aliases, null/default/error behavior, reference sharing and the original public export.
- No API, route, RPC, schema/migration, economic policy, UI, dependency, credential, permission, live-data or production change.

## Implementation

The repository decreases from 636 to 341 physical lines (the inventory counts the original as 637). Row/query/select contracts are 187 lines and pure projections are 150 lines. These are cohesive adapter responsibilities, not arbitrary line-count splits.

The repository entrypoint still exports only its original class. All 32 original declarations remain text-identical apart from added helper export modifiers and separator whitespace; the complete class and both error functions are byte-identical.

## Local qualification

- Pinned Node 22.23.1, npm 10.9.8 and Deno 2.9.3; exact-lock root/backend dependency installs pass.
- 106 new public-entrypoint/helper-control cases and six retained tests pass on untouched baseline and candidate: 112/112 each. Both independent runs use the frozen config/lock, cached-only imports and denied runtime network.
- Coverage includes exact queries/selects/filter ordering, deferred query admission, read/write error precedence, empty short circuits, every trigger and coercion/date boundary, duplicate activation/override/resolution behavior, complete DTO identity, write defaults/results, aliases and unique-conflict rereads.
- Independent review found and corrected an assertion-helper weakness before final qualification. Strict recursive equality now distinguishes null/nonfinite values, signed zero, missing/undefined keys, sparse arrays and symbol keys. Four disposable-copy mutations are rejected: nullable null-to-NaN (two failures), inclusive-to-exclusive market tick (two), wrong impact select (14), and changed repository error code (13). Authoritative runtime hashes remain unchanged.
- Both characterization modules are imported by the retained repository test. Story Replay Safety now runs that entrypoint without removing any prior command, test, filter, pin, permission or guard. Expanded suite: 247/247 pass. The retained Story source check and all three owned source checks pass.
- Full root tests, core TypeScript, deterministic architecture inventory/ratchet, secret scan, formatting and whitespace pass. Inventory changes from 1,392 to 1,397 source files and 82 to 81 oversized files. All other debt counts, thresholds and ratchet ceilings remain unchanged.
- Full Edge typecheck and backend smoke remain incomplete at the unchanged frozen SDK import `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` (connection refused). Smoke completes 23 Deno groups / 1,160 cases and 18 Node cases before the failure. No full aggregate pass or waiver is claimed.
- Independent runtime/test review has no remaining actionable finding. Local preparation is not hosted, staging or production qualification.

## Publication hold and next step

No branch push, draft PR, ready-for-review transition, merge, dispatch, deployment, live probe or provider setting change has occurred.

The current Vercel file explicitly disables automatic deployment for `main`, enables `release/production`, and does not explicitly disable arbitrary feature branches. Its runtime builder supports production configuration, so the word "preview" does not establish isolated backend binding. Repository release dispatch guards remain unchanged, but are not proof that a new branch cannot expose a production-connected preview.

Before publication, obtain coordinator clearance based on verified provider behavior and backend binding, including Vercel feature-branch and Supabase PR-preview integration. If provider evidence or an authorized pre-existing narrow guard is unavailable, remain local. Do not attempt to solve this by a blind first push or by editing unrelated production release workflows.

After that boundary is resolved: reconcile current main and active owners, independently verify recovery, publish one draft, register actual-number cross-cutting authority while preserving every inherited required/critical check, qualify the exact final head, and merge serially only after all required gates pass. Production remains held.
