# Remaining Cloudflare API_URL Audit v1

## Context

PR #33 merged the approved Eco Novaria login UI and Supabase classroom-api integration into main.

The frontend now has Supabase-specific helpers for:
- Player login
- Player bootstrap
- Staff/admin bootstrap
- Licensing activation
- Admin store catalog management

However, the legacy Cloudflare Worker URL is still present in frontend/src/core/constants.js as API_URL.

## Audit Scope

Searched for:
- API_URL
- getApiUrl
- callApi
- submitAction
- silent-haze-ca17
- kohner.workers.dev
- LOGOUT
- GET_SNAPSHOT
- USE_ITEM
- SUBMIT_RATING
- STOCK_TRADE
- STORE_PURCHASE

## Current Legacy API Chain

API_URL
→ getApiUrl()
→ callApiOnce()
→ callApi()
→ submitAction()
→ feature callers

## Confirmed Legacy Callers

### frontend/src/features/auth/auth.js

Uses legacy callApi() only for non-Supabase sessions:
- LOGOUT
- GET_SNAPSHOT

Supabase player refresh now uses /players/me.

Supabase admin refresh now uses staff bootstrap.

### frontend/src/features/store/store.js

Still uses submitAction("STORE_PURCHASE", ...).

### frontend/src/features/trading/trading.js

Still uses submitAction("STOCK_TRADE", ...).

### frontend/src/features/forecasts/forecasts.js

Still uses submitAction("SUBMIT_RATING", ...).

### frontend/src/features/inventory/inventory.js

Still uses submitAction("USE_ITEM", ...).

## Supabase Routes Found

The Supabase classroom-api router currently wires routes including:
- GET /health
- POST /players/login
- GET /players/me
- GET /players/me/ledger
- GET /staff/bootstrap
- POST /licensing/activate
- game join code reset routes
- game settings routes
- staff store catalog routes
- player roster routes
- player access code reset routes
- staff attendance routes
- player attendance clock-in route
- initial balance seed route
- staff player ledger history route
- staff ledger adjustment route

## Supabase Routes Not Found

No existing Supabase classroom-api route was found for:
- STORE_PURCHASE
- STOCK_TRADE
- SUBMIT_RATING
- USE_ITEM

## Migration Map

| Legacy Action | Current Caller | Current Behavior | Supabase Replacement | Risk | Safe Without Backend Changes |
|---|---|---|---|---|---|
| LOGOUT | frontend/src/features/auth/auth.js | Legacy logout for non-Supabase sessions | None needed for Supabase sessions | Low | No change needed |
| GET_SNAPSHOT | frontend/src/features/auth/auth.js | Legacy dashboard refresh for non-Supabase sessions | /players/me and /staff/bootstrap already used for Supabase sessions | Medium | No change needed |
| STORE_PURCHASE | frontend/src/features/store/store.js | Purchases item; likely updates balance, inventory, store stock, and transaction history | Not found | High | No |
| STOCK_TRADE | frontend/src/features/trading/trading.js | Places buy/sell order; likely updates balance, portfolio, and trade history | Not found | High | No |
| SUBMIT_RATING | frontend/src/features/forecasts/forecasts.js | Saves forecast/rating and possible reward state | Not found | Medium/High | No |
| USE_ITEM | frontend/src/features/inventory/inventory.js | Requests item use and likely updates inventory/request state | Not found | Medium/High | No |

## Conclusion

API_URL, callApi(), and submitAction() are not dead code.

They must remain until Supabase backend routes exist for the student runtime mutation actions.

Do not remove the old Cloudflare Worker URL yet.

Do not migrate submitAction() to Supabase blindly.

Do not change the four student mutation callers until backend route contracts exist.

## Recommended Next Step

Create a separate backend planning task for Supabase student runtime mutation routes:

1. Store purchase route
2. Stock trade route
3. Analyst forecast/rating route
4. Inventory item-use request route

Each route should define:
- route path
- HTTP method
- request body
- authentication/session resolution
- database transaction boundaries
- snapshot response shape
- permission checks
- audit/ledger behavior
- frontend migration plan

## Non-Blocking Cleanup

frontend/src/core/api.js contains a harmless duplicate key in callPlayerLoginApi():

token: publishableKey,
token: publishableKey,

This can be removed in a later cleanup PR.
