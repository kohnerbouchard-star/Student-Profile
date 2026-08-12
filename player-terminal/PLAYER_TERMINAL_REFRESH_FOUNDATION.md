# Player Terminal UX Refresh Foundation

**Branch:** `refactor/player-terminal-ux-refresh-foundation-v1`  
**Base:** `284294787bb27d94d53ea938df75a2379b47619f`  
**Scope:** refresh foundation, not product redesign

## Purpose

This tranche begins the Player Terminal UX refresh by establishing a source-owned design system and shell boundary. It corrects the absence of a single authority for spacing, typography, controls, icons, navigation, and top-level responsive behavior without changing gameplay, route contracts, authentication, API transport, or database behavior.

## Files introduced

- `css/player-terminal-tokens.css` owns semantic visual tokens and compatibility aliases used by the existing v7.4 normalization rules.
- `css/player-terminal-foundation.css` owns the shell, desktop navigation, collapsed navigation, top bar, context navigation, page hierarchy, shared controls, icon roles, and mobile shell.
- `css/player-terminal-shell-compat.css` is the temporary, capped priority bridge that lets those foundation values defeat the pre-existing shell declarations until the matching legacy rules are removed.
- `tests/player-terminal-css-foundation.mjs` prevents another append-only global CSS layer and rejects byte hash locking, unbounded priority debt, undersized fixed text, ownership-order regressions, and unbounded foundation growth.
- `tests/player-terminal-map-protection.mjs` protects all ten country regions, map geometry, the SVG renderer, keyboard hook, home-country state, and the existing map presentation boundary.

## Load order

The Player Terminal loads the compatibility stack first, then the new authority:

1. legacy base and route stack;
2. v7.4 normalization compatibility layer;
3. refresh tokens;
4. refresh shell foundation;
5. bounded shell compatibility bridge;
6. state-specific skeleton, recovery, story, and world-runtime styles.

This is a controlled migration boundary. The foundation is not named or treated as another polish layer. Each later route tranche must move selectors into an explicit route owner and remove the compatibility rules it replaces.


## Bounded legacy cascade takeover

The legacy `player-terminal-ux.css` file assigns `!important` to shell, navigation, top-bar, typography, and control dimensions. A later stylesheet without equal priority would therefore appear architecturally correct while leaving the old computed layout in control.

`player-terminal-shell-compat.css` contains one temporary, root-scoped compatibility block after the `Temporary bounded legacy cascade takeover.` marker. The file is capped at 5 KB and 40 declarations, contains no map selectors, and may target only shared shell responsibilities. Tokens and the core foundation remain free of `!important`. Each route migration must remove the legacy declaration it replaces and reduce this allowlist rather than expanding it.

## Protected interactive map

The following remain unchanged in this tranche:

- `assets/images/econovaria-world-map.png`;
- 1672 × 941 coordinate space;
- ten country identifiers and polygon sets;
- country path generation;
- SVG overlay and glow filter;
- pointer selection;
- keyboard activation hook;
- country intelligence action;
- player home-country state;
- map hit areas, fills, borders, markers, and instruction overlay.

The shell foundation intentionally contains no map selectors. A later map-chrome refresh may change the panel frame and supporting hierarchy only after equivalent browser interaction coverage is in place.

## Visual decisions

- Labels use a 12px semantic role rather than 8–10px route-specific values.
- Body copy uses a 15px semantic role.
- Navigation icons use a 20px role inside 40px containers.
- Standard controls use a 44px minimum height; prominent mobile controls use 48px.
- Desktop navigation is 264px wide and collapses to 76px.
- Page content is bounded to 1536px.
- The established cyan, amber, purple, green, and red visual language is retained.

## Non-goals

This tranche does not modify route information architecture, API endpoints, data normalization, session handling, gameplay calculations, country geometry, or route-specific component markup.
