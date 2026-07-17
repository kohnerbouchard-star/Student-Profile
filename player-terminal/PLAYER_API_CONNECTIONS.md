# Player API Connection Map — Adapter Phase

The v7 page contracts and endpoint keys remain unchanged. Backend routes are intentionally not finalized in this build.

Use one host-provided function:

```js
apiCall({ endpointKey, method, path, payload, session })
```

The adapter should switch on `endpointKey` and translate to the actual backend when that backend work begins. This preserves the approved v7 UI while avoiding a second sign-in implementation or premature route coupling.

Read keys include `session`, `dashboard`, `countries`, `news`, `market`, `portfolio`, `business`, `store`, `marketplace`, `contracts`, `inventory`, `crafting`, `banking`, `loans`, `messages`, `progression`, and `notifications`.

Write keys include `marketOrder`, `storePurchase`, `contractAccept`, `contractSubmit`, `inventoryUse`, `bankTransfer`, `savingsTransfer`, and the controlled expansion actions already represented by the v7 frontend.

The host session is supplied in the request context and should be mapped to the backend authorization header later. The terminal itself does not call a login endpoint.
