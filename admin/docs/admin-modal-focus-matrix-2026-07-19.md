# Admin modal and drawer focus matrix

**Roadmap item:** `BETA-ADMIN-002`  
**Corrective branch:** `agent/admin-modal-inventory-correction-v1`  
**Corrective pull request:** `#209`  
**Foundation pull request:** `#197`, merged as `ff9c6207ae2f7284fe753f0a719b0aa0c18017ff`  
**Status:** `VERIFIED_COMPLETE_NOT_MERGED`  
**Visual boundary:** preserve the accepted Admin v606 shell

## Acceptance contract

Every active major Admin modal and drawer must provide evidence for the applicable behaviors below:

1. Initial focus moves to a meaningful control or the surface root.
2. Tab and Shift+Tab remain inside a modal focus boundary.
3. Programmatic focus outside an active modal is redirected inside.
4. Escape closes dismissible surfaces exactly once.
5. Escape remains blocked for acknowledgement-required or committed-success surfaces.
6. Backdrop dismissal follows the same explicit policy as Escape.
7. Closing restores focus to the connected or semantically rerendered opener.
8. If the opener no longer exists, focus moves to a stable active Admin section or shell fallback.
9. Nested confirmation dialogs suspend the parent trap, then resume it after the child closes.
10. Hidden, inert, disabled, and `aria-hidden` controls are excluded from focus order.
11. Dynamic renderer focus changes do not invalidate a verified boundary transition.
12. Tests use keyboard input and focus assertions rather than pointer simulation.

## Controller and lifecycle foundation

| Contract | State | Evidence |
|---|---|---|
| Single modal initial focus | Verified | `admin-modal-accessibility-smoke.mjs` |
| Forward and reverse focus wrapping | Verified | shared fixture and mounted operational matrix |
| Dynamic Store and Scanner boundary transitions | Verified | focus-transition evidence before accepted renderer refocus |
| `focusin` containment | Verified | `admin-modal-accessibility-smoke.mjs` |
| Nested modal stack | Verified | shared fixture and mounted Contract profile/review stack |
| Parent suspension and resume | Verified | child close restores the parent opener and trap |
| Connected opener restoration | Verified | parent close scenarios |
| Rerendered semantic opener restoration | Verified | operational modal and Store rerender evidence |
| Disconnected opener fallback | Verified | Admin section fallback scenario |
| Configurable Escape policy | Verified | source and browser smoke |
| Blocked acknowledgement dismissal | Verified | shared fixture and protected credential confirmation |
| Configurable backdrop policy | Verified | controller source contract |
| Bundle-owned modal lifecycle bridge | Verified | explicit click/request/route lifecycle events; no DOM observer |
| Shared-backdrop nested dialog ownership | Verified | Contract profile and submission-review stack |
| Player drawer trapping | Verified | dedicated drawer controller and combined mounted matrix |
| Architecture boundaries | Verified | no transport wrapper, DOM observer, runtime stylesheet, or inline visual mutation |

## Verified active mounted surfaces

The following real v606 surfaces pass their applicable initial-focus, focus-containment, Escape or blocked-Escape, nested restoration, semantic opener restoration, and zero-pointer contracts.

| Surface | Verified behavior | Evidence |
|---|---|---|
| Add Player | Initial focus, live boundaries, Escape, opener restoration | `admin-mounted-operational-modal-focus-smoke.mjs` |
| Add Contract | Initial focus, live boundaries, Escape, opener restoration | `admin-mounted-operational-modal-focus-smoke.mjs` |
| Add Store Item | Initial focus, dynamic forward boundary, Escape, rerendered opener restoration | `admin-mounted-operational-modal-focus-smoke.mjs` |
| Attendance Scanner | Dynamic forward/reverse boundaries, Escape, opener restoration | `admin-mounted-operational-modal-focus-smoke.mjs` |
| Contract profile | Parent trap, Escape, table-opener restoration | `admin-modal-drawer-accessibility-smoke.mjs` |
| Contract submission review | Child initial focus, shared-backdrop trap, Escape to parent review opener | `admin-modal-drawer-accessibility-smoke.mjs` |
| Player drawer | Selected-tab initial focus, Tab containment, Escape, player-row opener restoration | `admin-modal-drawer-accessibility-smoke.mjs` |
| Player-created credential confirmation | Acknowledgement focus, Escape blocked, explicit acknowledgement close, opener restoration | `admin-modal-drawer-accessibility-smoke.mjs` |
| Edit Player Profile | Ten-control focus boundary, Escape, exact opener restoration | `admin-mounted-modal-focus-smoke.mjs` |
| Share Game Access | Eleven-control focus boundary, Escape, exact opener restoration | `admin-mounted-modal-focus-smoke.mjs` |
| Export History | Two-control focus boundary, Escape, exact opener restoration | `admin-mounted-modal-focus-smoke.mjs` |

## Exhaustive renderer classification

The accepted bundle contains three additional literal modal renderers that are not active major surfaces in the current capability state:

| Renderer | Classification | Reason |
|---|---|---|
| `admin-2fa-management` | Explicitly disabled | Account 2FA routes are declared `explicitly_disabled` in the Admin route manifest. |
| `google-classroom-connect` | Explicitly disabled | Google Classroom integration is declared `explicitly_disabled` in the Admin route manifest. |
| `admin-export-job-status` | Conditional child renderer | Emitted only for a concrete export-job lifecycle; the active Logs modal is Export History. |
| `admin-signout-failed` | Conditional recovery renderer | Emitted only when Admin sign-out fails; normal sign-out is not a modal workflow. |
| `player-log-event-detail` | Conditional player-specific renderer | Ordinary Logs detail and related-record actions remain inline and activate no modal controller. |

Disabled and conditional renderers remain covered by the shared controller source contract when mounted. They are not counted as active major current-main surfaces, and the matrix does not fabricate mounted evidence for states that the accepted runtime did not render.

## Scope boundary

PR #177 owns the future inventory-redemption drawer and confirmation dialogs under `BETA-ADMIN-008`. Those unmerged surfaces are not part of the current-main `BETA-ADMIN-002` inventory. Their accessibility evidence must remain with PR #177 and be reconciled after that capability merges.

## Active files

- `admin/modal-accessibility.js`
- `admin/modal-lifecycle-bridge.js`
- `admin/player-drawer-accessibility.js`
- `admin/index.html`
- `scripts/admin-modal-accessibility-source-smoke.mjs`
- `scripts/admin-modal-accessibility-smoke.mjs`
- `scripts/admin-mounted-operational-modal-focus-smoke.mjs`
- `scripts/admin-modal-drawer-accessibility-smoke.mjs`
- `scripts/admin-mounted-modal-focus-smoke.mjs`
- `.github/workflows/admin-shell-smoke.yml`
- `admin/docs/admin-modal-focus-matrix-2026-07-19.md`

## Completion boundary

The current-main active major modal and drawer inventory is exhausted with mounted keyboard evidence. `BETA-ADMIN-002` becomes `VERIFIED_COMPLETE` when corrective PR #209 merges and its immutable merge SHA and post-merge workflow evidence are recorded.