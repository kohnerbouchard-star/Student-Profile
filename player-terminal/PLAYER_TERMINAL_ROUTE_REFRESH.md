# Player Terminal Shared Route Refresh

**Branch:** `refactor/player-terminal-ux-refresh-foundation-v1`  
**Scope:** all Player Terminal route families outside the protected Dashboard map subsystem  
**Constraint:** preserve route content, APIs, gameplay behavior, and the accepted v7 visual language

## Shared ownership

Seven explicit files own the shared route system: `css/routes/player-terminal-shared-layout.css`, `player-terminal-shared-cards.css`, `player-terminal-shared-lists.css`, `player-terminal-shared-states.css`, `player-terminal-shared-details.css`, `player-terminal-shared-responsive.css`, and `player-terminal-shared-overlays.css`. Together they normalize:

- metric grids and metric cards;
- Market, News, Portfolio, Business, Contracts, Banking, Profile, Marketplace, Messages, Loans, and Crafting layouts;
- Store, Inventory, Marketplace, Business, Crafting, Loan, allocation, supplier, and queue cards;
- asset, news, contract, transaction, message, reputation, milestone, loan-schedule, and notification rows;
- filters, tabs, search fields, disclosures, holdings tables, empty states, and route errors;
- Banking cards and dense route-detail surfaces;
- generic transactional modals and responsive modal containment;
- desktop, tablet, and mobile route density.

The owners are loaded in that order after the bounded shell compatibility bridge and before the dedicated Dashboard owner. It contains no `!important`, no shell selectors, no protected map geometry selectors, and no fixed text below 11px.

## Bounded compatibility boundary

The legacy UX layer still contains a small number of route-level `!important` declarations for filter text and mobile Banking geometry. `css/player-terminal-route-compat.css` contains only the temporary declarations required to defeat those inherited rules.

The compatibility file is capped at 4 KB and 12 `!important` declarations. The initial implementation uses six. It must shrink when the corresponding legacy rules are retired.

## What remains unchanged

- all route names and navigation groups;
- API endpoints and payloads;
- capability gating;
- authentication and session behavior;
- economic writes and gameplay calculations;
- World runtime behavior;
- Dashboard map geometry, country identifiers, SVG paths, hit areas, and interaction events;
- country-intelligence data contracts.

## Verification

`tests/player-terminal-route-refresh.mjs` enforces stylesheet order, ownership boundaries, CSS budgets, minimum type sizes, the compatibility-declaration cap, balanced CSS blocks, map isolation, and inclusion in `npm run verify`.

`tests/browser/player-route-refresh.spec.mjs` covers every non-Dashboard route family on desktop Chromium, representative mobile routes, readable computed label sizes, rounded panel geometry, page-level overflow safety, control heights, and the shared transactional modal.
