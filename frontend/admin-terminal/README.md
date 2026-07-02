# Econovaria Admin Overview Terminal — v532

This package is the current Admin Overview Terminal prototype for the Econovaria classroom economy simulation. It is a static frontend package driven by ordered JavaScript fragments, one consolidated runtime file, and a shared CSS file.

## Current package

Version: `v532 — Backend Wiring Prep / No Settings`

Built from `v527 — Marketplace Endpoint Dot` with only the v529 Marketplace order-ticket change preserved. Settings remains out of scope; do not carry forward v528/v530/v531 game-settings work.

## How to run

```bash
npm run build
npm run dev
```

Open `http://127.0.0.1:4173/`.

The package validation commands are:

```bash
npm run build
npm run check
npm run smoke
```

No install step is required for the current package scripts.

## Codebase structure

```text
index.html
inspect_players.html
package.json
README.md
css/
  admin-overview-terminal.css
  page-shell.css
dist/
  admin-overview-terminal.js
src/admin-overview/
  adminApi.js
  README.md
  fragments/
    01-bootstrap-data.fragment.js
    02-shell-overview-renderers.fragment.js
    03-player-identity-and-modals.fragment.js
    04-overview-modals-and-forms.fragment.js
    05a-routing-and-roster.fragment.js
    05b-player-holdings-data-and-currency.fragment.js
    05c-player-holdings-panel.fragment.js
    05d-players-page-render.fragment.js
    06-attendance-operations-page.fragment.js
    07-secondary-admin-pages.fragment.js
    08-account-pages-and-rendering.fragment.js
    09-style-loader.fragment.js
    10-global-events-and-sharing.fragment.js
    11-modal-bindings-and-previews.fragment.js
    12-boot-and-public-api.fragment.js
tools/
  build-admin-overview.js
  serve-admin-terminal.js
  smoke-test-admin-api.js
  smoke-test-admin-overview.js
```

`tools/build-admin-overview.js` concatenates the ordered fragments into `dist/admin-overview-terminal.js`. Edit source fragments, then rebuild. Do not manually patch `dist/admin-overview-terminal.js` unless the source fragments are also updated.

`src/admin-overview/adminApi.js` is the adapter boundary for classroom-api calls. Render fragments should not call `fetch` directly.

## Current page responsibilities

Overview is the teacher-facing command surface for the active simulation.

Players is the fixed-layout player management page. It established the main layout rule now used elsewhere: fixed header/control areas, scrollable body/list regions.

Contracts is the assignment/contract workflow. It uses a fixed overview panel and a contract ledger. Contract submissions use confirmation before moving from unreviewed to reviewed.

Store is the purchasable item catalog. Store is not the rewards system. Rewards are system-issued and do not draw down Store stock.

Marketplace is the trading/exchange layer. It is separate from Store and separate from the backend macro engine. Marketplace handles securities search, profiles, order staging, options chain loading, chart display, and frontend execution previews.

Settings and Logs remain secondary/admin support pages.

## Major product decisions made so far

### Store decisions

System-seeded Store items are protected. Teachers can view them but cannot edit them.

Teachers can create and edit custom Store items only.

Store items do not show SKU or backend UUID information in the admin UI.

Store items do not have per-player purchase limits. Player purchases are constrained by stock, availability, country supply, visibility, and money.

Store inventory represents purchasable stock only. There is no Held or Reserved stock concept in the Store UI.

Risk Read and backend macro calculation explanations were removed from the Store UI. The admin sees outputs such as price, local price, restock, and status, not formulas.

System item pricing/restock may be economy-linked by the backend. Custom teacher items default to simpler fixed-price behavior unless configured otherwise.

### Contracts decisions

Contracts are the teacher/admin assignment layer.

The Contracts page uses a fixed layout similar to Players: header/control areas should not move when the list expands.

Current Focus should open the relevant contract profile directly, not just expand the row.

Review Submissions opens a submission list. Accept and Reject require confirmation before moving the submission out of Unreviewed and into Reviewed.

Messages from a submission should open a Player Messages style composer from Admin and include the linked contract/submission context.

### Marketplace decisions

Marketplace is not Store. Store is purchasable items. Marketplace is the trading terminal.

Marketplace supports stocks, bonds, indexes, ETFs, commodities, and options.

Marketplace supports buy, sell, short sell, cover short, market, limit, stop-loss, stop-limit, and options order staging in the UI. Only simple stock buy/sell orders may be submitted to the current stock order endpoint; shorts, options, stops, and advanced order types remain preview-only until backend routes, migrations, and RPCs support them.

The Marketplace page should remain a two-zone terminal layout: securities list on the left, selected-security workspace on the right.

Call and Put option selection belongs inside the Order Ticket. Do not restore the separate large Chain/contracts block as the purchase flow.

Search/filter controls should stay minimal. v502 removed the Market count card from the toolbar and left the visible count only in the securities list header.

Company financial information belongs inside a collapsible financials drawer with tabs: Overview, Income, Balance, Cash Flow, and Ratios.

The chart should look and behave like a real trading terminal chart, not a toy dashboard chart.

### Chart decisions

The chart is still data-driven SVG in this package, not a static Magnific image.

The current chart uses OHLC/candlestick rendering with a lower volume pane, right-side price axis, bottom time labels, crosshair guides, latest-price tag, event/trade markers, and a hover tooltip.

v503 adds realtime-ready frontend hooks:

- `data-marketplace-chart-root`
- `data-marketplace-candle-hit`
- `data-marketplace-chart-tooltip`
- `data-marketplace-chart-marker`
- `data-marketplace-live-price`
- `data-marketplace-live-change`
- `data-marketplace-feed-status`
- `data-admin-terminal-action="marketplace-set-timeframe"`

The current frontend includes a local simulated tick updater for UI testing. Production should replace the simulated interval with backend WebSocket events.

Recommended backend event names for future wiring:

```text
quote:update
trade:print
candle:update
candle:closed
orderbook:update
```

Recommended chart data flow:

```text
Load historical candles once.
Apply live tick updates to the current candle.
Close/append a candle on timeframe boundary.
Throttle visual redraws to avoid repainting on every tick.
Keep backend as the source of truth for execution, portfolio balances, margin, settlement, and stop-order triggering.
```

## v505 changes

- Preserved the v504 full-width Marketplace chart layout.
- Replaced the consumer stock-app visual treatment with a more Econovaria-specific sci-fi HUD treatment.
- Added angular clipped chart panels, cyan/orange chart rails, scanline texture, stronger terminal grid, live-feed styling, and sharper timeframe controls.
- Kept realtime-ready chart hooks, hover tooltip, crosshair, price tag, event/trade markers, financials drawer, and order ticket behavior intact.

Validation target:

```bash
npm run build
npm run check
npm run smoke
unzip -t econovaria-admin-overview-terminal-package-v505-marketplace-scifi-chart.zip
```

## v506 Marketplace chart interaction fix

The Marketplace chart keeps the v505 full-width sci-fi trading HUD layout, but the chart controls are now functional rather than decorative.

Current chart decisions:

- Chart type is controlled client-side with `data-marketplace-chart-style`.
- Supported chart styles are Line, Area, Candle, and Bar.
- The chart renders the required SVG layers up front and switches visibility through CSS, avoiding a full Marketplace re-render when the user changes style.
- Compare is a single overlay selector for no comparison, sector average, country index, or market average.
- Indicators are a single overlay selector for no indicator, MA20, MA50, or VWAP.
- Timeframe controls still update the selected range label and active state.
- Realtime tick simulation remains frontend-only until backend WebSocket quote/candle events are wired.
- Backend should remain the source of truth for real quotes, candle creation, order execution, margin, options settlement, and portfolio updates.

## v507 Marketplace timeframe behavior

The Marketplace chart range buttons now switch actual chart datasets instead of only changing the selected label. Each range renders its own OHLC/volume frame: 1D uses intraday time labels, 5D and 1M use day labels, 6M/YTD/1Y use month labels, and 5Y/MAX use year labels. This keeps the chart controls ready for backend range-specific candle payloads while preserving the current frontend preview data.



### v508 Marketplace chart hover tooltip

The static OHLC/VOL information panel was removed from the chart surface. Chart details now appear only while hovering an individual candle/point hit zone. The tooltip follows the cursor, is constrained inside the active chart frame, and disappears when the pointer leaves the chart data hit area. This keeps the graph visually clear while preserving exact OHLCV inspection.


## v509 Marketplace live-feed strip

The chart header live feed was reformatted from raw text into a compact market-status component. The new structure separates the green `LIVE` state from the latest-tick timestamp, keeps the control rail cleaner, and preserves the existing realtime update hook through `data-marketplace-feed-status` and `data-marketplace-last-tick`. The simulated frontend tick updater now writes only the timestamp into the time node; production WebSocket quote events should update the same node when real ticks arrive.


## v510 Marketplace compare, financials, and hover repair

Compare now means compare with another listed stock/security. The dropdown renders available comparison candidates from the Marketplace securities list, and the chart draws normalized comparison lines so securities with different prices can be compared on the same chart surface.

The company financials drawer remains tabbed, but each tab now renders as a cleaner statement table instead of cramped metric cards. This makes income, balance sheet, cash flow, and ratio sections easier to scan inside the selected-security profile.

The OHLCV hover tooltip was repaired for timeframe switching. Each timeframe frame owns its own tooltip, and hover handlers now resolve the tooltip from the active frame rather than querying the first tooltip in the whole chart. Timeframe switching also hides stale tooltips before activating the new frame.

## v511 Marketplace chart labels

- Replaced placeholder `D#` / `Day #` chart labels with date-style labels.
- Day-based ranges now use abbreviated month and day labels such as `Jun 28`.
- Month/year and year-based ranges now use abbreviated month and year labels such as `Jan 2026`.
- Raw backend labels are preserved unless they are placeholder day labels.


## v512 Marketplace 5D date-time labels

The 5D chart range now uses intraday date-time labels instead of day-only labels. Hover and x-axis labels for the 5D frame render abbreviated month/day plus hour, such as `Jun 28 · 09:30` or `Jul 2 · 16:00`. Longer day/month/year ranges keep the v511 calendar-style labels without forcing hours into views where they add noise.


## v513 Marketplace chart hover behavior

- The chart hover popup is now chart-type aware.
- Line and Area views show simplified market-read values: price, percent change, and volume.
- Candle and Bar views keep OHLC values because those chart types depend on open/high/low/close structure.
- A vertical dashed hover guide now follows the active candle/point so the reader can see exactly which slice of the chart is being inspected.
- The hover guide and tooltip are hidden when the pointer leaves the chart hit zone.

## v514 Marketplace admin-only chart markers

Chart event markers are now explicitly admin-only. The selected-security chart renders economy-event and trade-execution markers only when the admin Marketplace page passes `{ showAdminEventMarkers: true }` into the chart renderer. The chart root exposes `data-marketplace-admin-events="true"` for the admin view, and each rendered marker carries `data-marketplace-admin-only="true"` so future student/player chart surfaces can omit these explanatory admin markers while reusing the same price, volume, tooltip, timeframe, and chart-style logic.



## v518 note

Marketplace chart layout was tightened to reduce empty vertical space above and below the graph, y-axis labels were increased from five to seven ticks for better price reading, and chart/control/admin event icons were cleaned up with code-based SVG icons. Magnific was used for icon direction, but the shipped icons remain lightweight inline UI elements.


## v519 note

Corrected Marketplace control icon formatting by adding a consistent icon cell wrapper, normalized SVG stroke/fill behavior, fixed dropdown icon alignment, and separated compare-symbol chips from actual UI icons.


## v520 note

Fixed a Marketplace regression where icon formatting leaked into the trading controls and the order ticket/recent activity area became visually overlapped. The order ticket now uses a protected two-column form layout, the recent activity panel is separated, and chart icons use scoped inline SVG wrappers with explicit SVG stroke attributes.


## v523 note

v522 was broken because the distributed zip was incomplete. v523 restarts from the last stable full package, restores the full project contents, and safely reapplies the 1D previous-close line. The 1D chart now shows a dotted `Prev. close` line and uses previous close as the color/tone reference for daily percentage movement.


## v524 note

Refined the 1D previous-close reference line into a cleaner neutral reference layer. The line is thinner and softer, and the label is now a right-side dark pill with a subtle border and brighter price value. The feature remains 1D-only and keeps the v523 previous-close tone logic.


## v525 note

Removed the static horizontal current-price reference line from the Marketplace chart. The 1D previous-close dotted line and its right-side pill label remain. The current price tag remains available without drawing a full horizontal line across the chart.


## v526 note

Removed the Economy and Trade marker symbols from the Marketplace chart because they were visually distracting. The chart now keeps the price path, volume, previous-close reference, hover guide, axes, and current price tag without admin event/trade icons on the graph.


## v527 note

Removed the right-side current-price chip from the Marketplace chart and replaced it with a live endpoint dot anchored to the latest plotted close. The dot follows the end of the graph line and uses the current price tone for up/down state while preserving the previous-close reference line on the 1D view.
