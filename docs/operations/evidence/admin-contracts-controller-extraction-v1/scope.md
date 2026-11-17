# Contracts controller normalization extraction

Roadmap item: `ARCH-LARGE-ADMIN-CONTRACTS-CONTROLLER-001`.
Status: `IMPLEMENTED_NOT_MERGED`, local preparation only. No public PR, hosted qualification, merge or deployment is claimed.

## Baseline and ownership

Base main: `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7`.
Branch: `refactor/admin-contracts-controller-read-model`.
The seven open PRs (#620, #624, #668, #731, #735, #933 and #938) have no changed path overlapping the Contracts controller, new read model or existing Contracts API tests. Shared inventory and roadmap edits must be reconciled against the integration baseline rather than copied over other work. Roster, World and Attendance changes are not included.

## Bounded implementation

- Move the complete pure normalization block, including all 20 functions and original constants, to `admin/v2/src/routes/contracts/ContractsReadModel.js`.
- Keep the controller's existing normalizer exports as the same function objects.
- Reuse the existing text sanitizer and two thin predicates without exposing mutable status sets.
- Keep all other controller orchestration byte-identical after reversing the two predicate substitutions. Selected-game scope, permission gates, mutation methods, retry-key ownership, duplicate suppression, refresh/cancellation and lifecycle teardown are unchanged.
- No API client, route, form, CSS, migration, RPC, backend, workflow, gate or production change.

The controller falls from 640 to 354 physical lines. The read model has 308 physical lines. The deterministic inventory changes from 1,353 to 1,354 source files and 93 to 92 oversized sources. Persistence exceptions (52), cross-domain deep import inventory (70), browser shim files (26), compatibility-marker files (210) and other counts do not increase. The existing `fallback` marker moves with its helper to the new file. World and Attendance reductions are separate and are not included in this branch's count.

Source-preservation proof against base main:
- Extracted normalization block SHA-256: `f4d9502e2b649fae43caea5ff5da5b6a2a5dfa132903eb800b07f96b4de8d74f`.
- Remaining controller block after reversing the two equivalent predicate substitutions: `4f229dc355e4145a8afe2b3a6fb3f4b960b4602043e4b4ca73ffdd8b1fdef49b`.

## Verification on 2026-11-13

Pinned Node 22.23.1 and npm 10.9.8 were used. Both root and backend dependency installs passed using an isolated writable npm cache; no lockfile changed.

Passed:
- Five added normalization characterization tests passed on the original controller before extraction (11/11 including retained cases).
- The final Contracts API suite passed 13/13, including retained exports, accepted/malformed envelopes, bounds/freezing, UUID-safe display, validated-ID joins, authoritative precedence, lifecycle/issued-state matrix, evidence fallback, scoped mutations, retry identity, duplicate suppression and edit/not-found guards.
- The exact five-file Contracts workflow Node suite passed 132/132 with no skipped cases.
- Complete root `npm test` passed.
- Backend TypeScript stage passed. Both new and changed JavaScript files passed syntax checks.
- Inventory regeneration, whitespace validation and exact source-preservation checks passed.
- Independent read-only review found no introduced bug and independently passed all 132 workflow Node cases. No circular dependency or missing Contracts workflow trigger was found. Existing `routes/contracts/**` covers the new module, which is imported by the retained test entry point.

Incomplete, without waiver:
- `typecheck:all` stops in Edge typechecking because the frozen dependency `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` refuses connection.
- Backend smoke passed 23 Deno groups (968 cases) and 18 Node cases, then stopped at game-session tests on that same frozen dependency. Later groups are not certified.
- Both Contracts browser commands stop before executing acceptance tests because the pinned Chromium headless-shell executable is absent. No runtime/browser evidence is claimed.
- No hosted run, live database proof, publication or production action was attempted.

The extraction deliberately preserves inherited behavior, including current targeting editability rules. A separate functional follow-up should assess the pre-existing UUID-only targeting editability issue rather than silently change it in this refactor.

## Next action

Preserve and verify private recovery, then reconcile this independent branch with the actual integration baseline and other shared inventory/roadmap changes. Re-run the unchanged required gates, including browser and frozen Edge/backend aggregates in a supported environment, before publishing/merging through the normal qualified queue. Continue the next independently scoped large-file tranche only after checking current ownership.
