# Player API Connection Map — Production Adapter Foundation

The terminal keeps stable frontend endpoint keys while translating the capabilities that already exist to authenticated `classroom-api` player routes. Unsupported domains remain fail-closed in direct HTTP mode; the browser does not send requests to guessed backend paths.

## Connected route map

| Endpoint key | Backend request |
| --- | --- |
| `session` | `GET /players/me` |
| `dashboard` | `GET /players/me/game/dashboard?gameSessionId=...` |
| `countries` | `GET /players/me/world/countries` |
| `country` | `GET /players/me/world/countries/:countryId` |
| `news` | `GET /players/me/world/news?limit=100` |
| `market` | `GET /players/me/stocks/assets?limit=100&offset=0` |
| `marketAsset` | `GET /players/me/stocks/assets/:assetId?historyLimit=200` |
| `portfolio` | `GET /players/me/stocks/portfolio?gameSessionId=...&playerSessionId=...` |
| `marketOrder` | `POST /players/me/stocks/orders` |
| `marketWatchlist` | `PUT` or `DELETE /players/me/stocks/watchlist/:assetId` |
| `store` | `GET /players/me/store/items` |
| `storeQuote` | `POST /players/me/store/quote` |
| `storePurchase` | `POST /players/me/store/purchases` |
| `inventory` | `GET /players/me/inventory` |
| `banking` | `GET /players/me/ledger?limit=50` |
| `contracts` | `GET /players/me/contracts?gameSessionId=...` |
| `contractAccept` | `POST /players/me/contracts/:contractId/accept` |
| `contractSubmit` | `POST /players/me/contracts/:contractId/submit` |
| `notifications` | `GET /players/me/notifications?status=unread&limit=50` |
| `notificationsRead` | `POST /players/me/notifications/read` |
| `logout` | `POST /players/me/session/logout` |

The backend currently executes market orders immediately. The adapter rejects a frontend limit order locally instead of silently converting it into a market order.

## Authentication

Direct HTTP requests send the custom player session in:

```text
x-player-session-token: <opaque player session token>
```

An optional host access token is sent as `Authorization: Bearer ...` for the Edge Function gateway. Player and game ownership still come from the active player-session token; the terminal never sends a player ID as authorization.

The direct transport does not send a client-supplied game-scope header. Routes that require an explicit game reference receive it only in their reviewed query or body contract and validate it against the token-derived session. Market, ledger, Store, Inventory, and logout reads derive scope entirely on the server.

Fetch credentials default to `omit` because the Edge API does not use browser cookies and may respond with wildcard CORS. A same-origin host that deliberately uses cookies can override `requestCredentials` in runtime configuration.

No credential or token is written to local storage, session storage, IndexedDB, or the URL.

Backend UUIDs remain internal. The read-model adapter displays a player-facing identifier only when the session response supplies one; it does not relabel the backend player UUID or roster label as the Player ID. The stock-market runner secret is never accepted from configuration or sent by the browser transport.

## Bootstrap and lazy reads

Production bootstrap is sequential and bounded:

1. `GET /players/me` validates the session and discovers canonical game/player-session IDs.
2. `GET /players/me/game/dashboard` returns the aggregate player snapshot.

The dashboard snapshot hydrates the shell, cash, market board, portfolio, Store, inventory, contracts, market news, and cutscene notifications. After the shell is ready, Dashboard loads the scoped country directory without blocking first render. World News, Market, Portfolio, Store, Contracts, Inventory, and Banking refresh lazily the first time their route is opened. Market loading uses one bounded asset-directory request and one bounded history request for the selected asset. A refresh no longer launches 18 parallel Edge Function requests.

Domains with no production route receive explicit empty read models so their existing pages render honestly without preview data or accidental network calls.

## Store purchase sequence

Store writes use two explicit methods:

```js
const quote = await playerApi.quoteStoreItem({ storeItemId, quantity });
const purchase = await playerApi.completeStorePurchase({ quoteId: quote.quoteId });
```

`completeStorePurchase` generates an idempotency key when the host does not supply one. The UI follows the same quote-to-purchase sequence and refreshes both the authoritative dashboard and inventory route after confirmation so cash and inventory do not rely on optimistic state.

## Inventory and logout

The live inventory response is normalized from backend-owned quantities and values. A nullable backend `capacity` remains nullable; the terminal does not invent a storage limit. Item actions appear only when the response includes an allowed action.

Logout sends an empty `POST /players/me/session/logout`, waits for server revocation, clears the in-memory session, and then notifies the host so it can return to its existing sign-in surface. The logout event does not broadcast the opaque session token.

## Market and ledger reads

The live market directory is capped at 100 assets per request. Selecting an asset loads at most 200 authoritative price ticks, returned oldest-to-newest for chart rendering. Player holdings remain sourced from the scoped dashboard/portfolio response; public market refreshes cannot overwrite ownership.

Watchlist state is returned with each player-safe asset DTO. The star control uses idempotent `PUT` and `DELETE` requests and applies only the backend-confirmed `isWatchlisted` state; it does not infer success from the requested action.

Banking reads reuse the existing token-scoped ledger endpoint. Cash and any real savings balance are displayed, along with up to 50 recent entries. The adapter does not infer interest, credit scores, transfer limits, or lending eligibility. Those controls remain disabled until transactional backend domains exist.

## World reads

Country IDs used by the interface are canonical country codes, not backend profile UUIDs, so they align with the approved map geometry. Live macroeconomic rates are converted from stored decimal rates to display percentages. Narrative resources, exports, trade partners, and policy prose remain empty unless an authoritative backend source exists; the interface does not copy preview lore into production.

World News loads at most 100 active, public events for the authenticated game. Ticker and country targets are linked to the current market and map read models. Internal event metadata and runner-only fields are not exposed.

## Notification inbox

Opening the notification drawer loads up to 50 unread deliveries for the token-derived player and game. The browser sends delivery IDs—not notification-definition IDs—to the bounded mark-read endpoint. A successful response removes only the deliveries confirmed by the backend, so repeated requests remain safe and the two-request application bootstrap stays unchanged.

## Host adapter contract

A host adapter continues to receive the stable provisional context and session:

```js
apiCall({
  endpointKey,
  method,
  path,
  payload,
  params,
  session,
  backendRequest,
  backendRouteError,
  config
})
```

`method`, `path`, and `payload` remain the frontend contract. When a production mapping exists, `backendRequest` contains the exact backend method, path, and normalized payload. This is additive, so an existing adapter can continue switching on `endpointKey` while a new adapter can issue `backendRequest` directly.

Unsupported expansion keys remain available to a host-provided adapter. Direct `HttpTransport` rejects them with `ApiConnectionPendingError` unless a controlled integration explicitly enables provisional HTTP routes.

## Remaining backend dependencies

The terminal still requires reviewed backend routes for inventory actions, transfers, savings policy, and every business/marketplace/crafting/loan/messaging/progression capability. Those screens or actions must not be treated as connected until their authorization, transactions, idempotency, response contracts, and refresh behavior are implemented.
