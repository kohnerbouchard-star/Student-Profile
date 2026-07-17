# UI and Interactive Map Pass — v7.2

## Scope

This pass addresses visual fit and map interaction only. It does not redesign the v7 shell, change authentication ownership, modify provisional endpoint contracts, or replace the v7 icon set.

## UI corrections

The additive polish layer now:

- applies `min-width: 0` to nested grid and flex children that previously forced overflow;
- allows long headings, metadata, product names, and panel copy to wrap safely;
- prevents metric values and account values from being clipped;
- lets toolbar and heading actions wrap instead of leaving their containers;
- increases the dashboard next-action capacity from two to three description lines;
- lets the full game-session name wrap inside the sidebar game-code panel;
- displays all four contract lifecycle tabs in one desktop row and two tablet/mobile columns;
- removes the redundant state column from filtered contract lists;
- gives contract titles and issuers enough space to display without ellipsis;
- corrects wide, tablet, and mobile grid collapse points;
- maintains zero document-level horizontal overflow.

## Interactive map

The map overlay uses country polygon geometry derived from the supplied `econovaria_interactive_map_v33_market_research_ui` reference package.

Implementation:

- coordinate space: `1672 × 941`, matching the existing world-map image;
- ten country groups rendered as SVG paths;
- low-opacity borders visible at rest;
- the player’s home country receives a stronger persistent border;
- hover and keyboard focus strengthen the border and add a restrained country fill;
- each country region includes a larger invisible hit path for reliable selection;
- each country remains selectable with a mouse, touch input, `Enter`, or `Space`;
- selection opens the existing country-intelligence modal;
- the map image remains the visual base, so the supplied reference UI is not transplanted wholesale.

## Validation results

Browser harness: bundled application loaded through Playwright `page.set_content` because managed Chromium blocks local navigation. The application’s actual bundled JavaScript, CSS, images, and SVG assets were used.

- 15 routes × 3 viewport classes = 45 route renders;
- desktop viewport: `1440 × 1000`;
- tablet viewport: `1024 × 900`;
- mobile viewport: `390 × 844`;
- horizontal overflow failures: 0;
- detected clipped leaf-text elements: 0;
- critical panels outside the viewport: 0;
- route render errors: 0;
- browser page errors: 0;
- map country regions: 10;
- home-country regions: 1;
- mouse country selection: passed;
- keyboard country selection: passed.

Raw results are stored in:

- `preview/v7-ui-map-pass/ui-audit-final.json`
- `preview/v7-ui-map-pass/map-interaction-audit.json`
