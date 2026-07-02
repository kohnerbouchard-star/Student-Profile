# Admin Overview source layout — v505

This source folder splits the Admin Overview Terminal runtime into ordered JavaScript fragments. The build script concatenates the fragments into `dist/admin-overview-terminal.js`.

`adminApi.js` sits beside the fragment folder and owns classroom-api URL construction, headers, JSON fetch, normalized errors, idempotency keys, and backend response mapping. Page renderers and delegated event handlers should call adapter functions rather than `fetch` directly.

Edit the fragments first, then run:

```bash
npm run build
npm run check
npm run smoke
```

## Fragment map

- `01-bootstrap-data.fragment.js` — namespace setup, helpers, sample model data.
- `02-shell-overview-renderers.fragment.js` — notification drawer, user menu, left menu, overview cards.
- `03-player-identity-and-modals.fragment.js` — player ID/profile utilities and player operation modals.
- `04-overview-modals-and-forms.fragment.js` — attendance summary, scanner, contract/player/store modal builders.
- `05a-routing-and-roster.fragment.js` — routing helpers and roster support.
- `05b-player-holdings-data-and-currency.fragment.js` — player holdings data and currency utilities.
- `05c-player-holdings-panel.fragment.js` — player holdings panel renderer.
- `05d-players-page-render.fragment.js` — fixed-layout Players page.
- `06-attendance-operations-page.fragment.js` — attendance operations, roster, history, and rewards ledger.
- `07-secondary-admin-pages.fragment.js` — Contracts, Store, Marketplace, Settings, and Logs renderers.
- `08-account-pages-and-rendering.fragment.js` — account pages, rerendering, and core render functions.
- `09-style-loader.fragment.js` — stylesheet loader only.
- `10-global-events-and-sharing.fragment.js` — delegated events, navigation, notifications, share modal, Marketplace chart interaction.
- `11-modal-bindings-and-previews.fragment.js` — modal form controls and live previews.
- `12-boot-and-public-api.fragment.js` — boot sequence and public API export.

## Backend wiring boundary

Supported classroom-api routes are wired through `adminApi.js` first: staff bootstrap, players, player access-code reset, attendance, store catalog, join-code reset, initial balance seed, and player ledger history/adjustment.

Contracts and Marketplace read models currently return explicit unsupported results until backend routes exist. Marketplace order execution is guarded so only simple stock buy/sell payloads can reach the current stock order endpoint.

## Current architecture rules

Use the Players page pattern for complex pages: headers and control rows stay fixed; only the body/list area scrolls.

Avoid generic modal CSS leakage. If a modal needs special behavior, isolate it with dedicated classes rather than relying on scanner/player modal rules.

Keep Store, Contracts, and Marketplace conceptually separate:

- Store: purchasable item catalog.
- Contracts: teacher assignment/review workflow.
- Marketplace: securities exchange/trading terminal.

## v505 Marketplace chart notes

The Marketplace chart renderer lives in `07-secondary-admin-pages.fragment.js`.

The chart interaction and simulated live feed live in `10-global-events-and-sharing.fragment.js`.

The chart is a frontend SVG implementation with backend-ready hooks, not a static image. Production should replace the simulated live updater with backend events such as `quote:update`, `trade:print`, `candle:update`, and `candle:closed`.

The current chart supports:

- Full-width selected-security chart layout.
- Finance-style chart control rail: Candle, Compare, Indicators.
- OHLC candles.
- Close-price line and subtle area fill for quick visual trend reading.
- Volume pane.
- Right-side price axis.
- Latest-price tag.
- Crosshair guide.
- Bottom timeframe buttons: 1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX.
- OHLCV hover tooltip.
- Event/trade markers.
- Simulated local tick updates for UI testing.

The backend remains responsible for actual order execution, positions, margin, settlement, portfolio updates, and stop-order triggering.


## v505 Marketplace chart note

Marketplace keeps the full-width selected-security chart from v504, but the chart styling is now an Econovaria sci-fi trading HUD rather than a consumer finance app reference.

## v506 Marketplace chart controls

Marketplace chart controls are now wired in `10-global-events-and-sharing.fragment.js`:

- `marketplace-toggle-chart-menu` opens/closes the local chart dropdown.
- `marketplace-set-chart-style` switches `data-marketplace-chart-style` between `line`, `area`, `candle`, and `bar`.
- `marketplace-set-chart-compare` switches `data-marketplace-compare` between `none` and a selected comparison security symbol.
- `marketplace-set-chart-indicator` switches `data-marketplace-indicator` between `none`, `ma20`, `ma50`, and `vwap`.

The chart SVG is rendered in `07-secondary-admin-pages.fragment.js`. It includes separate layers for close line, area fill, candles, OHLC bars, comparison overlays, indicator overlays, volume, hit zones, markers, and tooltip data. CSS in `admin-overview-terminal.css` controls which layers are visible for each chart mode.

## v507 Marketplace timeframe behavior

The Marketplace chart range buttons now switch actual chart datasets instead of only changing the selected label. Each range renders its own OHLC/volume frame: 1D uses intraday time labels, 5D and 1M use day labels, 6M/YTD/1Y use month labels, and 5Y/MAX use year labels. This keeps the chart controls ready for backend range-specific candle payloads while preserving the current frontend preview data.



## v508 Marketplace chart hover tooltip

The chart OHLCV tooltip is no longer a static panel inside the chart. It is hidden by default and appears only when the pointer is over a chart candle/point hit zone. `handleMarketplaceCandleHover`, `handleMarketplaceCandleMove`, and `handleMarketplaceCandleOut` in `10-global-events-and-sharing.fragment.js` update the tooltip content, position it near the cursor, constrain it inside the active frame, and hide it when hover ends.


## v509 Marketplace live-feed strip

The chart header feed display is now a compact status component rather than a raw inline text string. `07-secondary-admin-pages.fragment.js` renders `admin-terminal-marketplace-feed-pill` for the live state and `admin-terminal-marketplace-feed-time` for the latest tick. `10-global-events-and-sharing.fragment.js` keeps using the existing realtime hook, but now updates only the timestamp node instead of writing `Last tick ...` into a single text block. Styling lives in the v509 CSS block in `admin-overview-terminal.css`.


## v510 Marketplace compare and financials notes

Compare now uses other securities from the Marketplace list rather than synthetic sector/country/market averages. Comparison lines are normalized to the selected security's starting price for the active timeframe, which keeps cross-price comparisons legible.

The financials drawer still uses tabbed sections, but `renderMarketplaceFinancialPanel` now outputs table-like statement rows rather than cards.

The tooltip fix is in `10-global-events-and-sharing.fragment.js`: hover handlers now resolve `[data-marketplace-chart-tooltip]` from the active `[data-marketplace-chart-frame]`. `handleMarketplaceTimeframe` clears any visible tooltips before switching frames.

## v511 Marketplace chart labels

- Replaced placeholder `D#` / `Day #` chart labels with date-style labels.
- Day-based ranges now use abbreviated month and day labels such as `Jun 28`.
- Month/year and year-based ranges now use abbreviated month and year labels such as `Jan 2026`.
- Raw backend labels are preserved unless they are placeholder day labels.


## v512 Marketplace 5D date-time labels

The 5D range now uses `axisMode: "dayHours"` in `07-secondary-admin-pages.fragment.js`. `formatMarketplaceAxisLabel` formats that range as abbreviated month/day plus hour, while 1M remains month/day and 6M/YTD/1Y/5Y/MAX remain month/year or year-style calendar labels.

## v513 Marketplace chart hover behavior

The chart hover popup is chart-type aware. Line and Area views show price, percent change, and volume. Candle and Bar views show OHLC plus volume. A vertical dashed guide follows the hovered candle/point and hides with the tooltip when hover ends.

## v514 Marketplace admin-only chart markers

Event/trade markers are no longer an implicit chart layer. `renderMarketplaceProfile`, `renderMarketplaceCandlestickChart`, and `renderMarketplaceChartFrame` now accept an options object. The admin Marketplace passes `{ showAdminEventMarkers: true }`, while the default is false for any future student/player chart reuse. Rendered markers include `data-marketplace-admin-only="true"` and the chart root includes `data-marketplace-admin-events="true"` only in the admin Marketplace view.



## v515 note

Marketplace Company Financials was redesigned into a more polished financial workspace with top section tabs, annual/quarterly mode controls, summary cards, statement charts, and wider statement tables.


## v516 note

Marketplace Ratios formatting was isolated from older financial table-row CSS. The Ratios panel now uses a dedicated card grid and hides the annual/quarterly mode toggle where it is not relevant.


## v518 note

Marketplace chart density and icon cleanup: tighter plot/canvas layout, denser y-axis grid, inline SVG chart control icons, and cleaner admin-only event markers.


## v519 note

Marketplace chart controls now use normalized icon wrappers and CSS to keep chart type, compare, indicators, and admin event icons aligned and consistently sized.
