# REF-012 — Attendance request adapter preflight

Status: IN_PROGRESS. Initial tranche: executable characterization only; adapter activation is not implemented or certified. Owner request: "Start task 12". Stop before REF-013.

## Identity and ownership

- Repository: `kohnerbouchard-star/Student-Profile`.
- Exact base/main: `d7112eb6cde0dad8b48fb04a55b32ad56c3f8b6d`; tree `b9d1dbaa676c107e762e7cc3fc20484315d41464`.
- Owner branch: `refactor/ref-012-attendance-request-adapter`. Live REF-012 PR/branch searches found no previous owner before branch creation.
- Scope: REF-012, ARCH-500/ARCH-700. Dependency REF-005 and preceding REF-011 are VERIFIED_COMPLETE in the base backlog. REF-011 implementation #757 and closeout #758 are merged.
- Live open-PR search retained #668 context/global ledger, #736 Player authentication, #735 release origin, #730/#731 Phase 15, #624 Player CSS, #690 Living World and #620 dependencies. None is absorbed here. No shared manifest, generated inventory, authentication, release or global ledger edit is included.

## Locked editable paths for this initial tranche

1. `scripts/admin-local-mutation-ui-contract.test.mjs`: preserve its eight existing cases and add isolated Node VM characterization of the actual Attendance bridge; use synthetic inputs only.
2. `docs/roadmaps/refactor-execution-v1/tasks/REF-012.md`: retain the original acceptance/rollback requirements and append the start checkpoint and remaining work.
3. This preflight record.

One conceptual change, three paths, at most 400 added semantic source/test lines. No production source, generated/minified bundle, bootstrap wiring, package, lockfile, workflow, SQL, migration, cloud resource, credential, global completion ledger or other REF task may change in this tranche. The existing `test:admin-local-mutation-ui` script already owns the edited test file; no new framework or package registration is needed. The ten-file parent budget remains in force for subsequent explicitly scoped implementation.

## Source-observed baseline

The bridge is not proven unused. Current `admin/admin-bootstrap.js` serially imports the route bridge, save controller, settings module, simplified presentation, settings lifecycle and error bridge. REF-002's retained-page/build mapping distinguishes raw `admin/index.html` from the built default V2 page. This is repository source evidence, not a fresh production-browser or quiet-window observation.

`attendance-reward-settings-route-bridge-v2.js` captures the prior fetch, assigns one global wrapper and exposes the frozen `EconovariaAttendanceRewardSettingsRouteBridge.getCurrentAttendanceWindow` API. Exact request matching uses `/api/admin/games/:gameId/settings` with an optional `/difficulty` suffix. GET/HEAD success clones the response to cache attendance settings per game. POST/PUT/PATCH with a mounted Attendance card augment the body unless a different active game is selected. Other requests delegate unchanged. The matcher is pathname-based; this tranche does not silently change origin or malformed-input behavior.

Payload selection prefers attendanceWindow under settings, then payload, then the root; a nonempty supplied window wins over DOM fallback. Existing container casing and unrelated fields remain. Headers are cloned, Content-Type becomes application/json, and credential/cache/redirect/referrer/referrerPolicy/mode/signal options pass through. The bridge does not generate retry keys. Successful combined writes emit `econovaria:attendance-reward-saved` only while the save controller reports a pending combined save. Failed responses and thrown transport errors do not emit success or initiate a retry.

The existing save controller separately owns Attendance-only verification GET plus one PATCH, payload-bound retry storage, busy/error/completed presentation and generation checks. Core edits deliberately fall through to the retained terminal's combined save. REF-002 records the combined descriptor's PUT difficulty request, effective-payload idempotency calculation and authenticated normalizer's PATCH translation. Replacing only the direct Attendance path is insufficient to remove the global wrapper safely.

Named saved-event consumers found in current source/search: `attendance-reward-settings-v4.js` (acknowledge/clear draft), `attendance-reward-save-controller-v3.js` (clear combined dirty keys), `settings-simplified.js` (acknowledge presentation), `settings-lifecycle-bridge.js` (reconcile), and `settings-save-error-bridge.js` (schedule error presentation). The settings module retains a body MutationObserver and card-local input/change listeners. Complete disposal/remount and exact refresh ownership still require browser qualification; this tranche does not remove an observer or certify a leak-free lifecycle.

## Validation and limits

Run the added cases against the unchanged bridge, preserving all original assertions. Independently hash the locally reconstructed bridge and baseline test file against their Git blob identities before using local results. The local runtime has Node 22.16.0, below the repository's >=22.22.2 requirement; local execution is supplementary only. Deno is absent and `git ls-remote` failed because github.com could not resolve. A full clone, pinned dependency install and full-repository local qualification are NOT_RUN, not passed.

Required continuation checks remain: affected Attendance/Admin browser cases; `npm run test:admin-local-mutation-ui`; `npm run test:admin-v2`; `npm run test:admin-v2:browser`; `npm run audit:interaction-wiring`; `npm run audit:assets`; shared architecture/high-priority/legacy/security/root tests; backend typecheck/smoke; and `git diff --check`. Observe exact-head CI, never substitute unrelated prior green runs. Synthetic VM tests cannot prove real Admin authentication, browser refresh/disposal, staging or production acceptance.

## Next exact work and rollback

After characterization qualifies, finish the fresh source-owned combined-save/client handoff and consumer/disposal audit. Lock the smaller runtime path list before activating an explicit adapter through the authenticated transport. Preserve one mutation, effective-payload retry identity, all lifecycle consumers and required DOM observation. If the only writable caller is the generated bundle or consumer ownership remains unresolved, stop the runtime cutover and record the exact blocker; do not patch generated output or invent a second writer.

Then prove direct/combined save success, duplicate clicks, malformed settings, denial/dependency failures, retry-key parity, context switches and remounts. Only after those gates may this bridge's global fetch assignment be removed and unchanged replacement fetch identity certified. Normal revert restores the bounded test/docs tranche; a future runtime rollback must restore adapter and source wiring together. No merge, deployment, live mutation, whole-task completion or REF-013 credit is implied by this start.
