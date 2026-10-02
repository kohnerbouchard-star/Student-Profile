# U3 / REF-042 — dependent child registration

Status: REF-042b split registration proposed for parent review; no b source edits.
Observed main: `5d32be72e7e88644f3248104320725ed6aadc672` (2026-10-02),
REF-042a implementation [PR825](https://github.com/kohnerbouchard-star/Student-Profile/pull/825).
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

### REF-042b2 — Inventory and realtime participant preparation

Depends on parent-merged and verified b1. Editable paths:

- `player-terminal/src/features/inventory/inventory-action-flow.js`.
- `player-terminal/src/realtime/player-invalidation-controller.js`.
- `player-terminal/tests/inventory-redemption-connected-lifecycle.mjs`.
- `player-terminal/tests/realtime-freshness.mjs`.

Allowed symbols: `installInventoryActionFlow`, use/redemption handlers and
cleanup; `installPlayerInvalidationController`, invalidation/refresh/scheduling,
publication/pending settlement and disposal. Consume the optional terminal-owned
coordinator; preserve legacy behavior when absent. Use operation invalidations
from WRITE_INVALIDATIONS, never a duplicated resource list. Applied/replayed
receipts precede targeted GET; rejected actions do not invalidate. Fence all
values/status/errors/401/toasts/finally/timers and obsolete pending clears.
Prove injected participant isolation, exact one-POST/three-GET use and one-POST/
two-GET redemption, late realtime completion, equivalent-read coalescing, failed
refresh/replay/rejection/abort/double-click/mixed batches and lifecycle cleanup
in the two existing Node suites. Default remains uninjected through this child.

Budget: four runtime/test files, at most seven meaningful paths with metadata,
strictly fewer than 400 semantic changed lines. Rollback: revert participant
preparation/tests; if b3 has landed, retire its activation first. Do not revert
server transactions, later independent fixes or child a.

### REF-042b3 — default composition and combined acceptance

Depends on parent-merged and verified b2. Editable paths:

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

For child `b1`, `b2` or `b3`, only these metadata paths are editable:

- This `docs/operations/evidence/refactor-execution-v1/REF-042/u3-child-registration.md`.
- Corresponding `docs/operations/evidence/refactor-execution-v1/REF-042/u3b1-evidence.md`,
  `u3b2-evidence.md` or `u3b3-evidence.md` (one per child, not all three).
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
