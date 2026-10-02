# U3 / REF-042 — dependent child registration

Status: PLANNED; registration submitted for parent review, no source implementation.
Observed main: `1a0ff1adb28f710d646c655c8ca91b24e799dd18` (2026-10-02).
Parent REF-042 remains BLOCKED with its original acceptance and dependency edges.
REF-023/041 remain verified. REF044 closeout is separately proposed in draft
[PR823](https://github.com/kohnerbouchard-star/Student-Profile/pull/823).
Neither child alone closes REF-042; both require exact-head CI, parent-reviewed
merges, merged-main verification and accepted combined evidence before closeout.

## Decision and narrow ownership handoff

The owner approved D1-A; parent preflight accepted one per-terminal shared
session/resource-generation coordinator, with optional API injection. No new
library, cross-session singleton or global cache redesign is authorized.

Fresh #624 inspection confirms head `83a9d2af37d2eab3202eee7293780dbd31443edb`,
branch `fix/player-ui-css-convergence-20260817`, still open under the same user.
The explicit handoff supersedes ONLY its reference-based freshness /
`RECENT_REFRESH_GUARD_MS` workaround in
`player-terminal/src/realtime/player-invalidation-controller.js` and
`player-terminal/tests/realtime-freshness.mjs`. No outside owner is displaced.
Do not import that branch or its stale verification authority. Preserve its
`main.js`, CSS, disclosure, modal, focus, browser and release ownership; changes
to the one browser spec below are limited to freshness regression assertions.
All visual and interaction behavior remains protected.

The existing module-global invalidation registry does not establish independent
terminal isolation. Instantiate the coordinator at each terminal composition
boundary; share it only among that terminal's API, Inventory flow and realtime
participants. Keep standalone API callers compatible and isolated by default.
`resource-plan.js` / `WRITE_INVALIDATIONS` remains the sole resource-list owner.

## REF-042a / U3a — coordinator and API ticket plumbing

Depends on existing REF-023/041 and accepted registration/ownership. This child
must land before REF-042b; terminal composition remains inert until child b.
Runtime/test editable paths (three):

- New `player-terminal/src/api/resource-freshness-coordinator.js`.
- `player-terminal/src/api/player-api.js`.
- `player-terminal/tests/read-invalidation-ordering.mjs`.

Allowed symbols: coordinator session/resource generations and equivalent-read
coalescing; optional PlayerApi injection, request/cache admission, bootstrap,
loadResources/loadRoute aggregation, invalidation and session disposal plumbing.
Maintain public caller compatibility. Carry generation tickets through cache
admission AND final publication after `Promise.allSettled`, including per-resource
errors/status and capability derivation. A pre-write read cannot satisfy a
post-write read; same-generation equivalent reads coalesce without crossing
transport/query/session/terminal identity. Rejected writes do not invalidate;
authoritative applied/replayed writes invalidate before targeted GET starts.
Do not wire app/action/realtime source in this child or claim the race is fixed.

Budget: three source/test files, at most six meaningful paths including metadata,
and strictly fewer than 400 semantic changed lines. Metadata is limited to this
registration, proposed `REF-042/u3a-evidence.md` in this evidence directory and
one exact-PR `docs/operations/contracts/player-cross-cutting/pr-<number>.json`
(number fixed after draft allocation). Generated architecture inventory, if the
existing audit requires regeneration, is separately declared and reviewed.

## REF-042b / U3b — complete composition and publication fencing

Depends on accepted/merged REF-042a and fresh main/ownership reconciliation.
Runtime/test editable paths (six), all under `player-terminal/`:

- `src/app.js`.
- `src/features/inventory/inventory-action-flow.js`.
- `src/realtime/player-invalidation-controller.js`.
- `tests/inventory-redemption-connected-lifecycle.mjs`.
- `tests/realtime-freshness.mjs`.
- `tests/browser/player-route-refresh.spec.mjs`.

Allowed scope: terminal coordinator composition; Inventory targeted invalidation
and refresh; complete terminal/action/realtime final publication and lifecycle
fences. Account for bootstrap, loadData, loadRouteData, refreshResources,
executeEndpoint, realtime and action publishers. Fence values, resourceStatus,
errors, capabilities, stale 401 handling, toasts and timers. Session switch,
logout, destroy and remount must retire old work; stale reads cannot clear a
newer pending invalidation. Preserve control restoration and listeners.

Budget: six source/test files, at most nine meaningful paths including metadata,
and strictly fewer than 400 semantic changed lines. Metadata is limited to this
registration, proposed `REF-042/u3b-evidence.md` in this evidence directory and
one newly allocated exact-PR cross-cutting authority path as above. Generated
architecture inventory is separately declared if required. Do not expand into
child a paths without parent review. Neither budget permits splitting a behavior
across unregistered follow-up work to evade full acceptance.

## Required evidence and stop gates

Before edits, reproduce both existing diagnostics on unchanged fresh source:
`node docs/operations/evidence/refactor-execution-v1/REF-042/characterize.mjs`
and the same command with `--targeted`; keep baseline failures as evidence.
Register permanent regressions in the existing owning suites, not a new runner.

Child a proves session/terminal isolation, generation/cache and aggregated-result
admission, equivalent-read coalescing, mutation ordering and stale errors/401.
Child b additionally proves isolated one-POST/three-GET item use and one-POST/
two-GET redemption; held old realtime read released after authoritative refresh
cannot regress state or clear newer invalidation. Cover replay, rejected write,
failed refresh, abort, double click, mixed-resource batch, stale 401, session
changes, logout/destroy/remount and two independent terminals. Preserve focus,
selection, drafts, modal/disclosure state and measured listener counts.

Run pinned Player `read-ordering`, `inventory-read`, `inventory-redemption-connected`,
`mutation-control-regressions`, `realtime`, `route-refresh`, `recovery`, `verify`,
affected browser cases and shared VALIDATION guards. Resolve the existing browser
runner and exact spec path before execution; npm `route-refresh` is the separate
Node suite. Any needed package-script/path expansion requires parent review first.
Report exact SHA, commands, exits/counts, request/event/listener budgets and fixture
versus connected/live provenance. No missing browser evidence counts as a pass.

All other source, `main.js`, CSS, global authority, auth/transport ownership,
economic/RPC/schema, workflows/release controls, U1 helpers/tests/REF032 evidence
and CampusPay are protected. No capture/dispatch/deploy/hold restoration/security
changes. Stop for scope/budget drift, ownership collision or a required broader
API/policy change. Split and register smaller children before editing if either
budget cannot hold. Parent reviews this registration before any implementation;
parent owns all merges. Rollback is bounded source reversion preserving later
accepted fixes and the untouched server-authoritative transaction semantics.
