# Econovaria Admin shape-accurate skeleton matrix

**Date:** 2026-07-18  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Branch:** `agent/admin-shape-accurate-skeletons-v1`  
**Baseline:** `e6922fb54a905dfc1e11a122c67cf9e3a7208419`

## Scope

This tranche is limited to `admin/**` and `scripts/admin-*.mjs`. It does not change Backend, Player Terminal, migrations, deployment configuration, Supabase, or production infrastructure.

## Loading-path audit

| Path | Previous behavior | Final behavior |
|---|---|---|
| Session verification | Centered generic heading and six cards | Full v606 shell footprint: navigation rail, top bar, four metrics, table/activity panels, responsive reflow |
| Initial Admin model load | Absolute generic six-card overlay | Clone of the actual mounted page shell with route-specific component tagging |
| Primary navigation reads | Same six-card overlay for every route | Active route shell is cloned after navigation; loaded and loading states share the same classes and layout rules |
| Background model replacement | No explicit freshness presentation | Existing content remains visible; bounded model-setter bridge shows a non-blocking refresh/updated indicator |
| Account surfaces | No structural skeleton contract | Profile, Preferences, Notifications, Security, Help, and Games use the same account-page shell and route-specific assembly |
| Player drawer | No loading geometry contract | Bounded surface skeleton API clones the final drawer shell without changing width, tabs, body, or close position |
| Contract review | No loading geometry contract | Bounded surface skeleton API clones the final review shell, body, and action region |
| Attendance scanner | Scanner state text only | Bounded surface skeleton API preserves 16:9 modal, camera/result area, controls, and statistics geometry |
| Empty/error/unavailable | Could be obscured by generic overlay during navigation timing | Remain explicit states; skeletons are initial/navigation loading only and do not represent empty, error, denied, unavailable, pending, or stale states |

## Architecture

The implementation does not introduce a second request wrapper or a page-wide observer.

1. The existing Admin read lifecycle remains authoritative for initial and navigation loading.
2. `shape-accurate-skeletons.js` replaces only the contents of the existing `.admin-qol-page-skeleton` host.
3. The controller clones the actual mounted shell, strips interaction and media sources, preserves layout classes, and applies decorative skeleton masks through external CSS.
4. Route assemblies identify major regions for geometry testing while the clone itself preserves all unlisted layout details.
5. Bounded `renderSurface()` support covers drawers, review workspaces, scanners, and modals without resizing the host.
6. A configurable `currentModel` setter bridge adds refresh status without replacing valid data or wrapping `window.fetch`.

## Route-to-skeleton matrix

| Route/surface | Major regions tagged | Shape contract |
|---|---|---|
| Session verification | nav rail, top bar, metrics, table, activity panel | 220 px rail on desktop, 64 px compact rail, 52 px narrow rail; loaded shell height footprint |
| Overview | heading, toolbar, metrics, recent activity | actual mounted Overview shell; metric and activity geometry preserved |
| Players | heading, toolbar, roster, actions | actual table/list shell, header and action-column position preserved |
| Player detail drawer | heading, tabs, body | final drawer width and tab/body placement preserved |
| Contracts | heading, toolbar, list, review | actual list and workspace panels preserved |
| Contract review workspace | heading, body, actions | final modal/workspace dimensions and footer placement preserved |
| Store | heading, toolbar, grid, card | actual card media/copy/action footprint preserved |
| Marketplace | heading, toolbar, summary, surface | read-only surface remains read-only and shape-stable |
| Attendance | heading, toolbar, summary, records | actual records/table geometry preserved |
| Attendance scanner | viewport, result, controls | modal, camera/result area, mode controls, and statistics remain fixed |
| Logs | heading, toolbar, table, pagination | actual table header, rows, and pager geometry preserved |
| Settings | heading, toolbar, sections, controls | disclosure sections and form controls use the loaded shell |
| Account Profile | heading, summary, content | accepted account-page shell |
| Account Preferences | heading, summary, content | accepted account-page shell |
| Account Notifications | heading, summary, content | accepted account-page shell |
| Account Security | heading, summary, content | accepted account-page shell |
| Account Help | heading, summary, content | accepted account-page shell |
| Account Games | heading, summary, content | accepted account-page shell |
| Generic Admin modal | heading, body, footer | final modal width, height, close control, and footer position preserved |

## State contract

- `aria-busy="true"` is applied only to the relevant page or bounded surface.
- The loading label is meaningful and route-specific.
- Decorative clones are `aria-hidden` and `inert`.
- Original headings and landmarks remain mounted beneath the overlay.
- Existing focus, page scroll, main scroll, selected navigation, open drawers, selected tabs, and drafts are not replaced.
- Background refresh does not display a skeleton over usable data.
- Empty, error, denied, unavailable, integration-pending, and stale states remain explicit.

## Responsive contract

The skeleton clone inherits the same CSS classes and breakpoints as the loaded page. It therefore follows actual desktop, compact, and narrow reflow instead of scaling a desktop-only placeholder.

Session verification uses explicit matching breakpoints:

- Desktop: 220 px navigation rail, four metric columns, two content columns.
- Compact: 64 px rail, two metric columns, stacked content panels.
- Narrow: 52 px rail, one metric column, stacked panels with reduced spacing.

## Geometry tolerances

Browser geometry assertions use the tolerances approved in the Admin audit:

- page/root width and height: `<= 4 px` delta;
- page heading: `<= 4 px` on each edge;
- toolbar height: `<= 2 px`;
- major panels, tables, cards, drawers, modals, scanner viewport, and Settings sections: `<= 4 px` on each measured dimension;
- horizontal overflow: `<= 2 px` beyond viewport;
- scroll position: `<= 1 px` delta;
- focus: unchanged while loading is shown and hidden.

## Accessibility and motion

- Route and surface hosts use `role="status"` and route-specific `aria-label` text.
- Decorative clone trees are `aria-hidden="true"` and `inert`.
- `prefers-reduced-motion: reduce` removes skeleton sweep and refresh-spinner animation.
- Loading completion does not focus any control.

## Deferred work

Inventory-redemption review remains blocked pending the reconciled Backend contract. No redemption queue, Marketplace writes, backend route changes, or migrations are included in this tranche.
