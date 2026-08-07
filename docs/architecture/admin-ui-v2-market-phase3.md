# Admin UI v2 Phase 3 — Market Management

**Roadmap item:** `BETA-ADMIN-UI-V2-003`

**Owner branch:** `refactor/admin-ui-v2-market-management-v1`

**Exact base:** `9eb2277e6e16d628c0da2595d05bf99a121002a9`

**Status:** `IMPLEMENTED_NOT_MERGED`

**Production promotion authorized:** No

## Purpose and domain boundary

Phase 3 migrates only the financial **Market** destination into the source-owned Admin v2 application. Overview and Store remain native. Marketplace remains a separate player-to-player commerce domain with its existing `marketplace.moderate` permission and planned migration status.

The Admin page is supervisory and read-only because the merged repository proves no supported Admin financial-Market mutation. It monitors listed instruments, prices, movement, recorded activity, events, fundamentals, and available price history. It does not reproduce Player order entry, portfolio, watchlist, balance, or position controls.

No Backend route, database table or function, Supabase configuration, authentication or authorization policy, Player Market behavior, legacy Admin behavior, or production configuration belongs to this tranche.

## Audited authoritative Admin contract

All browser paths remain below the existing same-origin HttpOnly Admin BFF at `/api/admin`. The game resource is server-authorized and every `/games/:gameId/market/**` request requires `market.manage` through `backend/supabase/functions/admin-api/adminSecurityGuard.ts`.

| Operation | Existing route | Authoritative behavior used by Phase 3 |
|---|---|---|
| Instrument directory | `GET /games/:gameId/market/assets?include=quotes` | Reads active rows from `game_session_stock_assets`; returns public symbol/name, sector/country, current and previous/open/high/low prices, movement, market cap, beta/volatility, description, fundamentals, and any stored chart history. |
| Instrument profile | `GET /games/:gameId/market/assets/:assetId/profile` | Returns the selected active instrument from the same read model. The database UUID is controller-private and used only for this required request path. |
| Price history | `GET /games/:gameId/market/assets/:assetId/chart` | Returns up to 500 ordered `stock_price_ticks` with timestamp, open/close-derived high/low, change percentage, and volume. The current handler exposes one series and does not implement distinct range datasets. |
| Fundamentals | `GET /games/:gameId/market/assets/:assetId/financials` | Returns the selected instrument's existing `financials`/`fundamentals` object. Missing optional values remain unavailable rather than being inferred. |
| Recent aggregate activity | `GET /games/:gameId/market/trades/recent?scope=all-players` | Returns recent trades. Phase 3 may aggregate public market activity but never renders player or trade UUIDs. |
| Market events | `GET /games/:gameId/market/events?status=active,recent` | Returns active/recent `stock_market_events` with safe headline, explanation, category, sentiment, source, magnitude, and volatility impact. |
| News alias | `GET /games/:gameId/market/news` | Returns the same current event read model; no separate Phase 3 request is needed. |
| Impact audit | `GET /games/:gameId/market/impact-audit` | Returns Market audit records. Phase 3 does not need this private-detail-heavy projection for the initial supervisory page. |

The list route currently filters to active instruments. It does not expose a market-open boolean, exchange close time, authoritative currency code, trading-halt state, event schedule, or aggregate index. Phase 3 must label those values unavailable or omit them; it must not infer them from local time, assume ECO, or reinterpret an active listing as an open exchange.

## Mutation audit and omitted legacy controls

The legacy generated action catalog advertises create/edit/pause Market events and broadcast news. That catalog is not proof of persistence. `backend/supabase/functions/admin-api/unsupportedOperations.ts` explicitly rejects non-GET Market event/news requests and pause requests as read-only controls.

Therefore Phase 3 implements no Admin mutation. It intentionally omits:

- opening or closing the exchange;
- halting or resuming an instrument;
- creating, editing, removing, or repricing an instrument;
- creating, editing, pausing, scheduling, or publishing a Market event;
- broadcasting Market news; and
- any Player buy/sell, order-ticket, watchlist, portfolio, checking-balance, or position controls.

No confirmation dialog, CSRF token, or idempotency key is needed for this read-only route. The existing BFF still strips browser credentials, uses HttpOnly authentication, binds the selected game and device identity, and normalizes safe errors. A future real Market mutation must be separately authorized and must reuse that exact boundary.

## Player parity reference

Player Market uses player-scoped stock asset list/detail and order routes under `/players/me/stocks/**`. Public identity is the ticker/symbol; the Player mapper deliberately exposes the ticker as `assetId`. Phase 3 compares Admin and Player instruments by ticker while keeping the Admin database UUID controller-private.

The shared authoritative concepts are ticker, company name, sector, country, current/previous/open/high/low prices, percentage movement, latest recorded volume, market cap, volatility, description, and tick history. Player presentation-derived `Stock` type, inferred risk/outlook, literal schedule copy, range slicing, watchlist, order entry, and portfolio state are not promoted into the Admin contract.

The Player dashboard separately evaluates its market calendar for open/closed state. The current Admin Market routes do not expose that result, so Phase 3 reports session state as unavailable instead of importing Player code or duplicating calendar logic. No Player file needs to change.

## V2 ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/market/MarketController.js` | Main read lifecycle, safe normalization, filters, selected-instrument detail loading, cancellation, stale state, and deterministic teardown. |
| `admin/v2/src/routes/market/MarketRoute.js` | Market page composition, summary, filters, responsive instrument directory, event/activity presentation, and detail-drawer wiring. |
| `admin/v2/src/routes/market/MarketInstrumentDetail.js` | Selected public instrument fields, optional fundamentals, history state, and no private identifier rendering. |
| `admin/v2/src/routes/market/MarketChart.js` | Dependency-free accessible SVG of the one authoritative history series with a textual summary and missing-history fallback. |
| `admin/v2/src/routes/market/MarketSkeleton.js` | Shape-accurate initial loading state. |
| `admin/v2/src/api/admin-api-client.js` | Exact Market read paths, response validation, scoped cancellation, and no unrelated transport. |
| `admin/v2/styles/routes/market.css` | Route-only responsive table/card, detail drawer, chart, events, and short-desktop behavior. |

The route reuses `AdminPageFrame`, `AdminDataTable`, `AdminDrawer`, `AdminField`, `AdminSkeleton`, `AdminEmptyState`, `AdminErrorState`, `AdminStaleState`, and `AdminPermissionBoundary`. It adds no global listener without teardown, global fetch wrapper, prototype patch, MutationObserver, runtime style injection, raw HTML renderer, or duplicate dialog/toast system.

## Presentation and privacy rules

- Search only symbol, name, sector, type, and the supplied country code.
- Filter locally after the authoritative directory is loaded.
- Show prices without inventing a currency when the Admin contract omits its code.
- Distinguish positive, negative, and flat movement with text as well as color.
- Derive recent trade record counts only from the returned authoritative recent-trade rows.
- Keep database asset, trade, event, player, and audit UUIDs out of text, URLs, titles, accessible names, and presentation data attributes.
- Keep the active database asset UUID only in the controller closure required to call profile/history/financial routes.
- Preserve the last valid directory during refresh and stale failure; initial failure is route-local and retryable through the safe envelope.
- Convert the desktop directory into semantic stacked cards on narrow screens; the document must not overflow horizontally at any required viewport.

## Legacy retention and cutover

Only Market's v2 registry disposition changes from `legacy` to `v2` after verification. Marketplace remains `planned`; every other route disposition stays unchanged. The generated legacy Market implementation and its tests remain present and unmodified. Their deletion requires merged-main parity, consumer proof, and separate product-owner authorization.

## Required review evidence

Phase 3 requires Market unit/API tests; source and configured built-dist Market browser suites; Overview, Store, Store-media, authentication, request-auth, Player Market/order/Portfolio, runtime-cutover, configured build/deployment, architecture, syntax, secret, and diff checks; correct MIME and no missing resource, unexpected console error, CSP violation, or Trusted Types warning; zero/one/50-plus instruments; all route and session states; detail/history and missing-history cases; all seven required viewports; and comparison of any red check with this exact base.

Evidence belongs under `docs/operations/evidence/admin-ui-v2-market/`. The bounded implementation and local verification are complete, so this item is `IMPLEMENTED_NOT_MERGED`; it cannot be `VERIFIED_COMPLETE` before merge and required runtime evidence.
