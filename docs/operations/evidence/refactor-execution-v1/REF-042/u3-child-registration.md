# U3 / REF-042 — dependent child registration

Status: REF-042b2 refinement proposed for parent review; no participant source edits.
Observed main: `44799a8e63f5d539628645f305894a665943e741` (2026-10-02),
REF-042b1 implementation [PR827](https://github.com/kohnerbouchard-star/Student-Profile/pull/827).
B1 merged-main verification passed all 16 runs; 40 checks: 35 success/five skips.
Its [evidence](u3b1-evidence.md), dependencies and historical failures are retained.
The A/B cases prove fail-closed isolation followed by explicit full refresh,
not automatic recovery after a superseded initial bootstrap.
Original registration PR824 and REF044 closeout PR823 are merged and preserved.
Parent REF-042 remains BLOCKED with its original acceptance and dependency edges;
REF-023/041 remain verified. REF-042a supplies inactive foundation, not the fix.
The owner approved b1 → b2 → b3 before implementation because complete publisher,
participant and regression coverage cannot safely fit the original single-child
budget. All primary IDs, dependency edges and acceptance criteria are unchanged.
Each child requires exact-head CI, independent parent review, parent-owned merge
and applicable merged-main verification. No child alone closes REF-042.

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

## REF-042b / U3b — dependent implementation scopes

The original six-path b scope is superseded only by the three dependent scopes
below. D1-A, resource-list ownership and combined acceptance are unchanged.
No b1 edits until this registration is parent-reviewed and PR825 merged-main
checks are terminal green. Reconcile fresh main and active ownership per child.
Default composition remains uninjected through b1 and b2; optional injection is
an explicit dependency for tests, not a runtime feature flag or new singleton.
Preserve legacy default behavior until b3 activates the complete composition.
Do not edit child a coordinator/API paths without a concrete reviewed need.

### REF-042b1 — terminal publisher and lifecycle preparation

Depends on accepted registration and verified merged REF-042a. Editable paths:

- `player-terminal/src/app.js`.
- `player-terminal/tests/browser/player-route-refresh.spec.mjs`.

Allowed symbols: optional coordinator dependency on `createPlayerTerminal` and
its returned participant seam; `loadData`/bootstrap, `loadRouteData`,
`refreshResources`, `executeEndpoint`, session handoff/invalid-session/logout,
`destroy`, and their publication, error, toast/timer/control cleanup guards.
Check resource tickets again at final publication, including resourceStatus,
capabilities and stale 401 handling. Retire work across session and lifecycle
changes. Preserve render/focus/modal/disclosure behavior and existing callers.
Extend only the named browser spec with injected-coordinator publisher and
lifecycle regressions, including final settlement/publication gaps. No other
browser path, runner or package-script expansion is authorized.

Budget: two runtime/test files, at most five meaningful paths with metadata,
strictly fewer than 400 semantic changed lines. Default remains uninjected.
Rollback: revert this optional app/test preparation, preserving REF-042a and
accepted docs; after dependents land, revert dependents in reverse order first.

### REF-042b2 — approved participant refinement

The owner approved b2a → b2b as a bounded refinement of b2 before source edits.
Registration requires parent review first. Both retain D1-A and the full combined
acceptance below; default composition remains uninjected until b3. Neither child
alone completes participant acceptance or REF-042. Do not omit tests to fit.

### REF-042b2a — Inventory action participant

Depends on accepted refinement and parent-merged/verified b1. Editable paths:

- `player-terminal/src/features/inventory/inventory-action-flow.js`.
- `player-terminal/tests/inventory-redemption-connected-lifecycle.mjs`.
- `.github/workflows/backend-typecheck.yml`, limited as specified below.

Allowed symbols: `installInventoryActionFlow`, use/redemption handlers, shared
local action orchestration and cleanup. Consume the optional terminal-owned
coordinator; preserve legacy behavior when absent. Use operation invalidations
from WRITE_INVALIDATIONS, never a copied list. Applied/replayed receipts precede
targeted GET; rejected actions do not invalidate. Fence final values/status/error/
401/toast/control effects across session changes, logout, destroy and remount.
Retain mutation serialization/idempotency and restore controls without allowing
an old operation to release a newer one. No optimistic inventory/economic writes.

Extend the named Node suite with real API/coordinator/terminal-action fixtures:
exact one-POST/three-GET use and one-POST/two-GET redemption, warm cache, replay,
rejection, abort, failed refresh, double click, session retirement and independent
terminals. These tests must exercise the real invalidation/publication ordering.
Realtime race and pending-generation integration follow in b2b, not disappear.

Budget: two runtime/test files, at most six meaningful paths including the workflow
and scoped metadata; strictly fewer than 400 semantic changed lines. Rollback
reverts optional Inventory preparation/tests, after retiring dependent activation
and realtime changes if present; preserve b1/a, server transactions and later fixes.

### REF-042b2b — realtime participant and combined participant acceptance

Depends on parent-merged/verified b1 and b2a. Editable paths:

- `player-terminal/src/realtime/player-invalidation-controller.js`.
- `player-terminal/tests/realtime-freshness.mjs`.
- `.github/workflows/backend-typecheck.yml`, limited as specified below.

Allowed symbols: `installPlayerInvalidationController`, invalidation, refresh,
scheduling, final publication, pending settlement and disposal. Consume the same
optional terminal coordinator; preserve legacy behavior when absent. Fence values,
resourceStatus/errors/capabilities/401, stale pending clears, finally blocks,
timers and listeners. Session/logout/destroy/remount must retire old work without
allowing an obsolete completion to release newer in-flight ownership. Preserve
interaction/disclosure deferral and cadence; no polling expansion or global cache
redesign. No main.js, CSS, focus/modal behavior or child-a API edits are authorized.

Extend the named Node suite with real shared API/coordinator participant fixtures:
held old realtime read completing after a mutation refresh; newer pending
invalidation surviving stale completion; equivalent same-generation coalescing;
pre-write reads excluded from post-write results; mixed batches, failed refresh,
stale 401, session/lifecycle retirement, listener counts and two-terminal isolation.
Rerun b2a's exact write/GET budgets and all combined participant acceptance.
Default composition still remains uninjected until b3's separate activation gate.

Budget: two runtime/test files, at most six meaningful paths including the workflow
and scoped metadata; strictly fewer than 400 semantic changed lines. Rollback
reverts realtime preparation/tests after retiring b3 activation, preserving b2a,
b1/a, server transactions and later independent fixes.

### Participant validation scope and estimated review size

Each child may add only its own two exact runtime/test paths listed above to
`.github/workflows/backend-typecheck.yml` under `pull_request.paths`. Recheck live
ownership before editing. Preserve the entire job body, push filter, permissions,
action pins and assertions; no other workflow change is authorized. Include this
workflow path in that child's exact-PR authority and evidence. Required checks
and actual full backend diagnostics must qualify the child's exact final head.

Estimates count semantic additions/deletions, including comments and metadata:

| Child | Runtime | Fixtures/regressions | Scoped metadata | PR-filter entries | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| b2a | 70 | 180 | 80 | 2 | 332 |
| b2b | 90 | 200 | 80 | 2 | 372 |

These are planning estimates, not permission to exceed the strict cap or compress
behavior artificially. They reserve review margin and retain all required cases;
no further split is planned absent a concrete new finding. Report any new API/path
need or budget overrun before widening. Existing owning suites/runners remain;
package-script expansion still needs review. Generated inventory, if required by
the existing audit, remains separately declared and reviewed.

### REF-042b3 — default composition and combined acceptance

Depends on parent-merged and verified b2a and b2b (and their retained b1 dependency). Editable paths:

- `player-terminal/src/app.js`.
- `player-terminal/tests/browser/player-route-refresh.spec.mjs`.

Allowed symbols: `createPlayerTerminal` default coordinator creation and sharing
through the b1 participant seam; only minimal integration corrections in the b1
publisher/lifecycle symbols above. Instantiate exactly one coordinator for each
terminal and share it with that terminal's API/action/realtime participants.
Activate only after both participant paths and full publisher fences exist.
Extend the same browser spec for the complete warm-cache/action/realtime race,
session/logout/destroy/remount and two-independent-terminal matrix. Verify final
values/resourceStatus/errors/capabilities, stale 401, toasts/timers/control
restoration, exact request budgets and retained listener counts. Preserve focus,
selection, drafts, modal and disclosure state. Run all combined acceptance below;
b1/b2 evidence is supporting history, not a substitute for exact b3 qualification.

Budget: two runtime/test files, at most five meaningful paths with metadata,
strictly fewer than 400 semantic changed lines. Rollback: revert b3 default
activation and its tests first, leaving the optional b1/b2 foundation inactive.
No runtime rollout, deployment or REF-042 completion is implied by source merge.

### Exact metadata and review boundaries

For child `b1`, `b2a`, `b2b` or `b3`, only these metadata paths are editable:

- This `docs/operations/evidence/refactor-execution-v1/REF-042/u3-child-registration.md`.
- Corresponding `docs/operations/evidence/refactor-execution-v1/REF-042/u3b1-evidence.md`,
  `u3b2a-evidence.md`, `u3b2b-evidence.md` or `u3b3-evidence.md` (one per child).
- One `docs/operations/contracts/player-cross-cutting/pr-<number>.json`, fixed to
  that child's actual draft PR number before implementation authority validation.

The path and semantic budgets include comments and metadata. Generated architecture
inventory is separately declared and reviewed only if the existing audit requires
it. No source/test path outside the listed child scope is authorized. Stop before
editing if a child cannot fit or needs a new path; present a further registration
for parent review. Do not omit acceptance or conceal behavior in mechanical edits.

## Required evidence and stop gates

Before edits, reproduce both existing diagnostics on unchanged fresh source:
`node docs/operations/evidence/refactor-execution-v1/REF-042/characterize.mjs`
and the same command with `--targeted`; keep baseline failures as evidence.
Register permanent regressions in the existing owning suites, not a new runner.

Child a proves session/terminal isolation, generation/cache and aggregated-result
admission, equivalent-read coalescing, mutation ordering and stale errors/401.
The combined b1/b2/b3 result additionally proves isolated one-POST/three-GET item use and one-POST/
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
API/policy change. Split and register smaller children before editing if any
budget cannot hold. Parent reviews this registration before any implementation;
parent owns all merges. Rollback is bounded source reversion preserving later
accepted fixes and the untouched server-authoritative transaction semantics.
