# Admin modal and drawer focus matrix

**Roadmap item:** `BETA-ADMIN-002`  
**Current branch:** `agent/admin-modal-focus-accessibility-v1`  
**Pull request:** `#197`  
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
7. Closing restores focus to the connected or semantically rerendered opener.
8. If the opener no longer exists, focus moves to a stable active Admin section or shell fallback.
9. Nested confirmation dialogs suspend the parent trap, then resume it after the child closes.
10. Hidden, inert, disabled, and `aria-hidden` controls are excluded from focus order.
11. The active surface remains authoritative when route refreshes or unrelated DOM updates occur.
12. Tests use keyboard input and focus assertions rather than pointer simulation.

## Controller and lifecycle foundation

| Contract | State | Evidence |
|---|---|---|
| Single modal initial focus | Verified | `admin-modal-accessibility-smoke.mjs` |
| Forward and reverse focus wrapping | Verified | shared fixture and mounted operational matrix |
| `focusin` containment | Verified | `admin-modal-accessibility-smoke.mjs` |
| Nested modal stack | Verified at controller level | shared parent/child Escape scenario |
| Parent suspension and resume | Verified at controller level | child close restores the parent opener and trap |
| Connected opener restoration | Verified | parent close scenario |
| Rerendered semantic opener restoration | Verified | Add Player, Add Contract, Add Store Item, and Scanner mounted evidence |
| Disconnected opener fallback | Verified | Admin section fallback scenario |
| Configurable Escape policy | Verified | source and browser smoke |
| Blocked acknowledgement dismissal | Verified at controller level | locked modal scenario |
| Configurable backdrop policy | Verified | controller source contract |
| Bundle-owned modal lifecycle bridge | Implemented | explicit click/request/route lifecycle events; no DOM observer |
| Optional nonmodal drawer trapping | Implemented at controller API | `trapFocus: false`; mounted drawer evidence remains |
| Architecture boundaries | Verified | no transport wrapper, DOM observer, runtime stylesheet, or inline visual mutation |

## Verified mounted operational surfaces

The following real v606 operational surfaces now pass initial focus, live forward and reverse focus wrapping, Escape dismissal, semantic opener restoration, and zero recorded pointer events:

| Surface | Opener ownership | Evidence state |
|---|---|---|
| Add Player | Overview quick actions | Verified |
| Add Contract | Overview quick actions | Verified |
| Add Store Item | Store section | Verified |
| Attendance Scanner | Overview quick actions | Verified, including its dynamic live focus boundary |

Evidence: `scripts/admin-mounted-operational-modal-focus-smoke.mjs`.

## Remaining mounted surface inventory

| Surface family | Representative surfaces | Current state |
|---|---|---|
| Player management | Player drawer, identity editor, Access Code reset, archive confirmation | In progress in combined modal/drawer matrix |
| Contract administration | Contract profile, submission review, accept/revision/reject confirmation, duplicate, archive | Contract profile verified; nested review initial-focus integration in progress |
| Store administration | Edit, restock, reprice, status, archive | Create modal verified; remaining edit/destructive surfaces pending |
| Attendance administration | Correction, notes, reward adjustment, day lock/unlock | Scanner verified; remaining administrative dialogs pending |
| Player-created credentials | Acknowledgement-required credential confirmation | Existing dedicated evidence present; consolidation in combined matrix pending |
| Game/session controls | Join-code reset and lifecycle confirmations that currently exist | Pending source and mounted inventory |
| Account and settings | Destructive reset or confirmation surfaces that currently exist | Pending source and mounted inventory |
| Inventory redemption | PR #177 review drawer and confirmation dialogs | Owned by PR #177 until merge; integrate evidence afterward without duplicating its implementation |

## Active files

- `admin/modal-accessibility.js`
- `admin/modal-lifecycle-bridge.js`
- `admin/index.html`
- `scripts/admin-modal-accessibility-source-smoke.mjs`
- `scripts/admin-modal-accessibility-smoke.mjs`
- `scripts/admin-mounted-operational-modal-focus-smoke.mjs`
- `scripts/admin-modal-drawer-accessibility-smoke.mjs`
- `.github/workflows/admin-shell-smoke.yml`
- `admin/docs/admin-modal-focus-matrix-2026-07-19.md`

## Completion boundary

The shared controller and four primary operational modals are verified. `BETA-ADMIN-002` remains `IN_PROGRESS` until the mounted Contract stack, Player drawer, protected credential confirmation, remaining administrative dialogs, and PR #177 redemption surfaces are exhausted with browser evidence.
