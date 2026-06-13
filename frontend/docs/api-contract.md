# API Contract

This branch must not change the current root `app.js` API behavior or the
Cloudflare Worker API contract.

Current action names:

- `LOGIN`
- `LOGOUT`
- `GET_SNAPSHOT`
- `GET_STOCK_HISTORY`
- `GET_STOCK_NEWS`
- `STORE_PURCHASE`
- `STOCK_TRADE`
- `SUBMIT_RATING`
- `USE_ITEM`

The modular frontend should call the backend through an API client. That API
client can later point to the current Cloudflare Worker or a Supabase Edge
Function, but this task does not add Supabase code and does not change the
active root `app.js` API URL.

Feature files should not directly call `fetch`. They should coordinate through
the API client when a module becomes active.
