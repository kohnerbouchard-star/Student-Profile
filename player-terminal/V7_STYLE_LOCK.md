# Legacy V7 Baseline and Refresh Ratchet

The Player Terminal v7 files remain part of the compatibility stack while the refresh migrates visual ownership in bounded tranches. They are no longer treated as immutable byte artifacts.

The former stylesheet and icon hash lock was retired on August 13, 2026. It prevented deliberate CSS cleanup and encouraged each visual correction to be appended as another global override layer. Verification now protects behavior, accessibility, ownership boundaries, file budgets, and the interactive map rather than requiring exact legacy bytes.

## Current ownership

| Responsibility | Authoritative owner |
|---|---|
| Spacing, typography, control sizes, icon roles, shell dimensions | `css/player-terminal-tokens.css` |
| Desktop and mobile shell, navigation, top bar, page hierarchy, shared controls | `css/player-terminal-foundation.css` |
| Temporary priority bridge for pre-foundation shell rules | `css/player-terminal-shell-compat.css` |
| Interactive map geometry | `src/data/map-regions.js` |
| Interactive map rendering | `src/pages/dashboard-page.js` |
| Interactive map pointer and keyboard handling | `src/app.js` |
| Interactive map presentation during the foundation tranche | `css/player-terminal-polish.css` |
| Route-specific compatibility styles | Existing v7 CSS until each route is migrated |

## Ratchets

- New generic `polish`, `normalization`, `override`, or `fix` stylesheets are prohibited.
- The token and core foundation files must not use `!important`.
- `player-terminal-shell-compat.css` may use at most 40 temporary `!important` declarations, all isolated after the `Temporary bounded legacy cascade takeover.` marker. This exception exists only to defeat pre-foundation shell rules and must decrease as `player-terminal-ux.css` is retired.
- The foundation may not style map image, map overlay, country geometry, hit regions, markers, borders, or map instructions.
- The token file is limited to 8 KB, the core shell foundation to 24 KB, and the temporary shell compatibility boundary to 5 KB.
- Player labels and controls use semantic token roles instead of new fixed sub-11px text.
- Existing v7 CSS may be reduced or retired as route ownership moves forward; new route work must not append another generation to it.

## Verification

Run:

```bash
npm run css:foundation
npm run map-protection
npm run audit
npm run audit:v75
```

Historical v7.4 preview images remain repository records. They are not the acceptance baseline for the refreshed terminal.
