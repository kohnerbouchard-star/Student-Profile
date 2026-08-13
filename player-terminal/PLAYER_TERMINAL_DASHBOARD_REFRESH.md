# Player Terminal Dashboard Refresh

**Branch:** `refactor/player-terminal-ux-refresh-foundation-v1`  
**Scope:** Dashboard, interactive-map chrome, and country-intelligence presentation  
**Constraint:** refresh the accepted Player Terminal; do not redesign gameplay or replace the map

## Changes

The Dashboard now has one explicit route owner: `css/routes/player-terminal-dashboard.css`.

That owner controls:

- the four summary metrics;
- the two-column desktop command-center composition;
- priority-action hierarchy;
- world-signal cards;
- the financial snapshot and allocation bars;
- the market ticker;
- the map panel frame, instruction HUD, legend, and home-market summary;
- the country-intelligence modal;
- Dashboard-specific desktop, tablet, and mobile reflow.

It does not control the global shell, navigation, top bar, Store, Market, Banking, or other route layouts.

## Interactive-map preservation

The following remain unchanged:

- the 1672 × 941 coordinate system;
- all ten country identifiers and polygon sets;
- the country path generator;
- the SVG renderer and glow filter;
- `data-player-country` event delegation;
- pointer, keyboard, and focus behavior;
- the player home-country state;
- the country-intelligence action and modal data contract.

Presentation is stronger, but geometry and interaction remain authoritative.

## Readability and density

- Dashboard labels use the 12px semantic label token.
- Supporting copy uses the 13px metadata role or 15px body role.
- Metric values scale without forcing narrow fixed columns.
- Navigation and feature icons retain the established 20px and 24px roles.
- Cards use moderate spacing and remain compact rather than becoming oversized stacked blocks.
- The map remains the dominant Dashboard surface on desktop and moves into a full-width stage on narrower layouts.

## Verification

`tests/player-terminal-dashboard-refresh.mjs` verifies route ownership, stylesheet order, typography minimums, CSS size, map interaction safety, home-market markup, country-modal structure, and inclusion in `npm run verify`.

`tests/player-terminal-map-protection.mjs` now verifies the new map route owner in addition to the existing geometry, renderer, keyboard hook, and compatibility presentation contracts.

`tests/browser/player-dashboard-refresh.spec.mjs` verifies both Chromium projects for:

- four summary metrics;
- ten interactive regions;
- map/image/SVG alignment;
- readable computed text sizes;
- non-overlapping map footer;
- pointer interaction;
- country-modal content;
- desktop and mobile horizontal-overflow safety.

## Remaining migration

The Dashboard is the first route moved into explicit ownership. Market, Portfolio, Banking, Store, Inventory, Crafting, Contracts, Business, Messages, Progression, Profile, News, and World still require route-by-route migration before the Player Terminal refresh is complete.
