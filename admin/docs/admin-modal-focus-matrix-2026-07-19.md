# Admin modal and drawer focus matrix

**Roadmap item:** `BETA-ADMIN-002`  
**Current branch:** `agent/admin-modal-focus-accessibility-v1`  
**Status:** `IN_PROGRESS`  
**Visual boundary:** preserve the accepted Admin v606 shell  
**Dependency note:** `BETA-ADMIN-001` merged through PR #178 as `8ae4fc3dc9233b2e826c409680cd362c61509033`; `BETA-ADMIN-005` merged through PR #193 as `8e9ff38270248d3ce0a46afd4179b371379e5da3`.

## Acceptance contract

Every major Admin modal and drawer must provide evidence for the applicable behaviors below:

1. Initial focus moves to a meaningful control or the surface root.
2. Tab and Shift+Tab remain inside a modal focus boundary.
3. Programmatic focus outside an active modal is redirected inside.
4. Escape closes dismissible surfaces exactly once.
5. Escape remains blocked for acknowledgement-required or committed-success surfaces.
6. Backdrop dismissal follows the same explicit policy as Escape.
7. Closing restores focus to the connected opener.
8. If the opener no longer exists, focus moves to a stable active Admin section or shell fallback.
9. Nested confirmation dialogs suspend the parent trap, then resume it after the child closes.
10. Hidden, inert, disabled, and `aria-hidden` controls are excluded from focus order.
11. The active surface remains authoritative when route refreshes or unrelated DOM updates occur.
12. Tests use keyboard input and focus assertions rather than pointer simulation.

## Controller foundation

| Contract | State | Evidence |
|---|---|---|
| Single modal initial focus | Implemented | `admin-modal-accessibility-smoke.mjs` |
| Forward and reverse focus wrapping | Implemented | `admin-modal-accessibility-smoke.mjs` |
| `focusin` containment | Implemented | `admin-modal-accessibility-smoke.mjs` |
| Nested modal stack | Implemented | `admin/modal-accessibility.js` and browser smoke |
| Parent suspension and resume | Implemented | nested Escape scenario |
| Connected opener restoration | Implemented | parent close scenario |
| Disconnected opener fallback | Implemented | fallback close scenario |
| Configurable Escape policy | Implemented | source and browser smoke |
| Blocked acknowledgement dismissal | Implemented | locked modal scenario |
| Configurable backdrop policy | Implemented | controller source contract |
| Optional nonmodal drawer trapping | Implemented at controller API | `trapFocus: false` option; mounted drawer evidence remains |
| Architecture boundaries | Implemented | no transport wrapper, DOM observer, runtime stylesheet, or inline visual mutation |

## Major mounted surfaces to verify

The following inventory is deliberately broader than the first controller tranche. A surface may be marked complete only after mounted browser evidence validates its real opener, lifecycle, dismissal policy, and restoration target.

| Surface family | Representative surfaces | Current state |
|---|---|---|
| Create workflows | Add Player, Add Contract, Add Store Item | Pending mounted modal matrix |
| Attendance | Scanner, correction, notes, reward adjustment, day lock/unlock | Pending mounted modal matrix |
| Player management | Player drawer, identity editor, Access Code reset, archive confirmation | Pending mounted modal/drawer matrix |
| Contract administration | Review workspace, accept/revision/reject confirmation, duplicate, archive | Contract review has partial inherited evidence; exhaustive matrix pending |
| Store administration | Edit, restock, reprice, status, archive | Pending mounted modal matrix |
| Player-created credentials | Acknowledgement-required credential confirmation | Partial inherited evidence; blocked Escape and opener restoration must be consolidated here |
| Game/session controls | Join-code reset and lifecycle confirmations that currently exist | Pending source and mounted inventory |
| Account and settings | Destructive reset or confirmation surfaces that currently exist | Pending source and mounted inventory |
| Inventory redemption | PR #177 review drawer and confirmation dialogs | Owned by PR #177 until merge; integrate evidence afterward without duplicating its implementation |

## First-tranche files

- `admin/modal-accessibility.js`
- `scripts/admin-modal-accessibility-source-smoke.mjs`
- `scripts/admin-modal-accessibility-smoke.mjs`
- `.github/workflows/admin-shell-smoke.yml`
- `admin/docs/admin-modal-focus-matrix-2026-07-19.md`

## Completion boundary

This first tranche hardens the shared controller and proves nested focus, Escape, blocked dismissal, and restoration behavior. `BETA-ADMIN-002` remains `IN_PROGRESS` until the mounted surface inventory is exhausted and every applicable modal/drawer row has browser evidence.
