# Story context row translation

## Scope and ownership

- Roadmap item: `ARCH-LARGE-STORY-CONTEXT-ROWS-001`.
- Baseline: `f44e1239d2bdbd53529bdbbcdcae3423e111ac57`; branch `refactor/story-context-rows-20261114`.
- Six open PRs (#938, #933, #735, #731, #668, #624) and their live changed-path sets were checked. None owns the selected Story runtime/test files. Roster, CSS, release controls and global context-ledger work stay separate. Retained refactor branches do not own this seam.
- Move adapter-local query contracts, row shapes and select strings into `playerStoryContextRows.ts`, and pure row normalization, cash valuation, exposure and relationship helpers into `playerStoryContextProjection.ts`.
- Keep the entire `SupabasePlayerStoryContextRepository` class and its error helper unchanged. This preserves all query ordering and filters, nine parallel read admissions, dependent country lookup, provider failures, null/default behavior, reference sharing, normalization, arithmetic and sorting.
- No API, route, RPC, schema/migration, persistence policy, economic write, UI, dependency, credential, permission, staging/live-data or production change.

## Implementation

The repository decreases from 638 to 341 physical lines. Adapter-local rows are 140 lines and pure projections are 210 lines. These are cohesive ownership boundaries rather than arbitrary line-count splits. The module still exports only the original repository class.

## Qualification

- 34 public-entrypoint characterization cases pass on untouched main and candidate, with type-checked frozen, cached-only, network-denied Deno execution. They cover exact selects/filters/order, all ten read failures, nine parallel admissions, dependent country lookup, first-settled errors, sparse null data, cash currency selection, exposure calculations, contract statuses, relationship normalization and shared-reference/input-immutability behavior. Three test/support files stay below 500 lines.
- Existing adapter and public read-query tests also pass, for 40 combined baseline and candidate cases independently rerun by review. Both characterization modules are imported by the retained adapter test. The retained Story Replay workflow adds the adapter and public read-query tests to its existing frozen Deno command without removing any old path, assertion or command. Expanded registered suite: 135/135 passed.
- Full root tests, core TypeScript, deterministic architecture inventory/ratchet, secret scan, formatting and whitespace checks pass. Inventory is 1,392 source files / 82 oversized files, down from 83; every other debt count and threshold is unchanged.
- Independent source review verifies all 47 original declarations, the byte-identical entire 277-line class and the unchanged sole public export. No stale source assertions or binding/behavior defect was found.
- Full local Edge typecheck and backend smoke remain incomplete at the unchanged frozen SDK import `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` (connection refused). The partial smoke run passed 1,160 Deno and 18 Node cases before the failure. No aggregate pass or waiver is claimed; exact-head hosted gates remain mandatory.
- Recovery review, actual-number draft authority, fresh exact-head hosted qualification and normal postmerge verification remain pending. No staging/runtime or production completion is claimed. Production remains held.

## Draft publication

Draft [PR #963](https://github.com/kohnerbouchard-star/Student-Profile/pull/963) publishes source `fda59157c370c1b5e5017dada30f443fa4034d0b`, identical to independently reviewed/restored tree `02a8fcce43401ac02405f20b34d0efbdf3aec60f`. Actual-number authority preserves all ordered 149 required and 104 critical identities and 56 workflow families from #962. Only missing pull-request path filters receive this tranche's own manifest. No commands, permissions, assertions or production guards are relaxed. Fresh final-head hosted qualification and independent review remain mandatory before a normal serial merge. Production stays held.
