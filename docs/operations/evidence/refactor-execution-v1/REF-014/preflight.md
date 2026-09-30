# REF-014 — Settings save/error lifecycle preflight

Status: IN_PROGRESS. Observed main: `68d1890e25c70756ceec63e74a832ffe5e6ad4d8`.
Owner branch: `refactor/ref-014-settings-save-lifecycle`.
Parent task: REF-014, ARCH-500/ARCH-700. Declared dependency REF-005 is merged and VERIFIED_COMPLETE in the current backlog. REF-013 implementation and closeout are merged. Owner explicitly authorizes starting, finishing and normally merging Task 14 only. No Task 15 or production action is authorized.

## Source findings

The retained `admin/admin-bootstrap.js` loads the Settings error bridge after the Attendance save controller, explicit request adapter, Settings presenter and lifecycle bridge. The built-default Admin V2 is a separate consumer surface. The bridge is therefore positively source-reachable and must not be called unused or retired wholesale.

`admin/settings-save-error-bridge.js` does not intercept HTTP. It installs the final-polish stylesheet, observes document-wide child/attribute mutations, and repeatedly reconciles `data-attendance-reward-error` into the save button's generic API state. The source-owned direct save promise already belongs to `admin/attendance-reward-save-controller-v3.js`; its `setSaveState` calls the Settings presenter explicitly. Core/combined saves retain their generated owner and the REF-012 explicit request/response adapter. Generated source will not be edited.

Preserve PATCH `/api/admin/games/:gameId/settings`, pre-save GET verification, nested attendanceWindow payload, public error/validation messages, X-Idempotency-Key/X-Request-Id and payload-bound replay storage, canonical cookie/CSRF/device/game transport, no-op handling, numeric defaults, payout policies and form layout. A direct save failure keeps draft values. A response whose route/page/game ownership has expired must not acknowledge a new page. Server write cancellation is not implied by discarding stale UI responses.

## Bounded children declared before implementation

REF-014a — characterize and converge the save/error lifecycle, with focused qualification. Maximum eight meaningful runtime/test/qualification paths:

1. `admin/settings-save-error-bridge.js`: remove only redundant document observation; retain necessary stylesheet bootstrap.
2. `admin/attendance-reward-save-controller-v3.js`: bind existing promise callbacks to route/page/game lifetime; explicit listener/timer disposal; keep request/retry contract.
3. `admin/settings-simplified.js`: consume explicit controller error state without rewriting transport state; failed/busy state must not simultaneously present success; protect saved acknowledgement from stale context.
4. `admin/attendance-reward-request-adapter.js`: only if necessary to bind combined Settings acknowledgement to the same lifetime; no request/formula redesign.
5. `scripts/admin-settings-save-lifecycle.test.mjs`: synthetic unit characterization of the actual source controller and presentation adapter.
6. `scripts/admin-settings-disclosure-smoke.mjs`: extend the existing browser journey with denial/retry/remount/stale-response checks.
7. `package.json`: only register the focused unit cases in the existing Admin local-mutation UI suite.
8. `.github/workflows/ref-014-settings-qualification.yml`: read-only exact-head qualification using repository-pinned Node/npm/Deno; focused UI tests, backend game-session preservation and sanitized source/test evidence. No provider credentials, deployment or repository write permission.

Generated and hash-bound evidence is maintained separately and narrowly: `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` and `docs/operations/evidence/refactor-execution-v1/REF-003/candidates.json`. A PR-specific authority manifest, if the existing cross-cutting guard requires it, may authorize only the exact reviewed paths and retain production denial; the guard itself is protected.

REF-014b — documentation-only closeout, dependent on merged/qualified REF-014a: update the REF-014 task, its one backlog entry, completion evidence, and this preflight with actual tested/merged identities. Parent remains incomplete until both children close. Other 49 task entries and global completion ownership remain unchanged.

## Verification and boundaries

Required cases: invalid settings/timezone response, wrong-game/permission denial, unavailable/offline service, no-op and duplicate saves, preserved retry identity, route/page remount, stale success and failure, preserved input values and focus, and listener disposal/reinstallation. Run the existing Settings browser cases, Admin V2, Admin local mutation UI, auth/web-session regressions, backend game-sessions, source/asset/interaction/architecture checks and required exact-head CI. Never relabel skipped or not-run cases as passed.

Local Git download currently fails DNS and the available Node/npm versions are not repository-pinned. The read-only qualification job publishes a Git archive and exact SHA/tree metadata for reproducible local source review; complete pinned execution remains CI evidence. Archive only tracked source, never runner credentials or environment secrets.

Protected: backend APIs/schema/RPCs, authentication and cloud configuration, generated Admin bundles, payout/difficulty formulas, form defaults and layout, unrelated Player/create behavior, other open PRs and all release guards. Revert only the bounded source changes if qualification exposes a contract change or unresolved ownership. Stop before REF-015.
