# Admin keyboard navigation matrix

**Roadmap item:** `BETA-ADMIN-001`  
**Branch:** `agent/admin-keyboard-navigation-v1`  
**Status:** `IN_PROGRESS`  
**Visual boundary:** preserve the accepted Admin v606 shell

## First bounded tranche

This tranche adds a transport-independent keyboard controller for the existing Admin shell. It does not redesign the Admin console, replace delegated click handling, intercept requests, observe the DOM, or add runtime styles.

| Surface | Keyboard contract | Automated evidence |
|---|---|---|
| Primary Admin sections | Arrow Up/Down/Left/Right moves focus with wrapping; Home/End moves to the boundary; existing Enter/Space activation remains authoritative | `admin-keyboard-navigation-smoke.mjs` and existing three-viewport Admin browser smoke |
| Admin tablists | Arrow keys and Home/End move and activate the selected tab | `admin-keyboard-navigation-smoke.mjs` |
| Non-native delegated Admin actions | Enter and Space dispatch the existing click contract only when enabled | `admin-keyboard-navigation-smoke.mjs` |
| Input modality | Keyboard and pointer modality are explicit and do not depend on DOM observation | source and browser smoke |
| Visible focus | Focus-visible treatment is external CSS and includes forced-colors support | source and browser smoke |
| Architecture | No `window.fetch` assignment, `MutationObserver`, inline style, runtime style element, or generated visual shell | source smoke and architecture audits |

## Current implementation files

- `admin/keyboard-navigation.js`
- `admin/css/keyboard-navigation.css`
- `scripts/admin-keyboard-navigation-source-smoke.mjs`
- `scripts/admin-keyboard-navigation-smoke.mjs`
- `.github/workflows/admin-shell-smoke.yml`

## Remaining before `BETA-ADMIN-001` can be complete

- Prove sequential Tab and Shift+Tab order across every primary Admin page.
- Exercise every quick action through keyboard-only activation.
- Exercise Add Player, Add Contract, Add Store Item, scanner, Contract review, player drawer, and account entry without pointer input.
- Verify no hidden, inert, disabled, skeleton, or stale controls enter the tab order.
- Verify keyboard operation at desktop, compact, and narrow widths in the mounted Admin application.
- Complete the separate `BETA-ADMIN-002` modal and drawer focus-trap, Escape, and focus-restoration matrix.

This first tranche must remain `IN_PROGRESS`; passing the focused browser test alone does not establish complete keyboard-only coverage of every Admin workflow.
