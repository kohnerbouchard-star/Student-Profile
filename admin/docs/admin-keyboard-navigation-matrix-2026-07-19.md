# Admin keyboard navigation matrix

**Roadmap item:** `BETA-ADMIN-001`  
**Current branch:** `agent/admin-keyboard-navigation-v2`  
**Pull request:** `#178`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Acceptance state:** all `BETA-ADMIN-001` implementation and browser-evidence requirements satisfied  
**Visual boundary:** preserve the accepted Admin v606 shell

## Consolidated implementation

PR #173 merged the first bounded tranche into `main`. It established the transport-independent keyboard controller, primary-section arrow navigation, tablist navigation, non-native Enter/Space activation, explicit input modality, external `:focus-visible` treatment, forced-colors support, and repository architecture guards.

PR #178 completes the remaining `BETA-ADMIN-001` evidence without redesigning the Admin console or replacing its delegated click authority.

| Surface | Keyboard contract | Automated evidence |
|---|---|---|
| Primary Admin pages | Arrow navigation and Enter activation cover Overview, Attendance, Players, Contracts, Store, Marketplace, Settings, and Logs | `admin-mounted-keyboard-navigation-smoke.mjs` |
| Sequential focus | Tab and Shift+Tab remain eligible and reversible at desktop, compact, and narrow widths | `admin-mounted-keyboard-navigation-smoke.mjs` |
| Page-specific order | Stable focus sequences are recorded for every primary page, including filters, presets, exports, and quick actions | `admin-keyboard-focus-order-smoke.mjs` |
| Add Player | Enter opens the workflow; keyboard input sets text and select fields; Enter submits one normalized request | `admin-keyboard-workflows-smoke.mjs` |
| Add Contract | Space opens the workflow; keyboard input completes required fields; Enter submits the published Contract request | `admin-keyboard-workflows-smoke.mjs` |
| Add Store Item | Enter opens the workflow; keyboard input completes text, numeric, and select fields; Space submits the normalized catalog request | `admin-keyboard-workflows-smoke.mjs` |
| Attendance scanner | Space opens the scanner; Enter selects manual mode; keyboard entry submits; success resets to Ready with an empty refocused input | `admin-keyboard-workflows-smoke.mjs` |
| Contract review | Keyboard navigation opens the review workspace, follows the modal focus trap to Accept, follows the confirmation trap, and submits one authenticated decision | `admin-contract-review-smoke.mjs` |
| Player drawer | Keyboard opens the native player row toggle and ArrowRight traverses all six authoritative drawer tabs | `admin-player-drawer-smoke.mjs` |
| Account surfaces | Profile, Settings, Notifications, Security, Help, and Games open through keyboard activation | `admin-account-surfaces-smoke.mjs` |
| In-flight protection | A delayed create request disables the action; a repeated Enter produces no duplicate write | `admin-keyboard-focus-order-smoke.mjs` |
| Excluded controls | Hidden, inert, explicitly stale, disabled, and skeleton-owned controls are rejected; `aria-busy` remains distinct from stale or disabled state | controller and mounted source/browser evidence |
| Pointer exclusion | Browser tests record pointerdown, mousedown, and touchstart and require zero events | keyboard workflow, focus-order, Contract review, Player drawer, and account reports |
| Helper exclusion | Keyboard evidence may not use `.click()`, `.fill()`, `selectOption()`, mouse helpers, or touchscreen taps | `admin-keyboard-navigation-source-smoke.mjs` |
| Architecture | No `window.fetch` assignment, `MutationObserver`, inline style, runtime style element, replacement event system, or accepted v606 shell change | source smoke and accepted v606 audit |

## Implementation and evidence files

- `admin/keyboard-navigation.js`
- `admin/css/keyboard-navigation.css`
- `scripts/admin-keyboard-navigation-source-smoke.mjs`
- `scripts/admin-keyboard-navigation-smoke.mjs`
- `scripts/admin-mounted-keyboard-navigation-smoke.mjs`
- `scripts/admin-keyboard-workflows-smoke.mjs`
- `scripts/admin-keyboard-focus-order-smoke.mjs`
- `scripts/admin-contract-review-smoke.mjs`
- `scripts/admin-player-drawer-smoke.mjs`
- `scripts/admin-account-surfaces-smoke.mjs`
- `.github/workflows/admin-shell-smoke.yml`

## Completion boundary

`BETA-ADMIN-001` is implementation-complete on PR #178 and awaits merge into `main` before the authoritative roadmap may label it `VERIFIED_COMPLETE`.

`BETA-ADMIN-002` remains a separate open item. Its completion requires the exhaustive modal/drawer focus-trap, Escape, and opener-focus-restoration matrix; this document does not claim that separate item is complete.
