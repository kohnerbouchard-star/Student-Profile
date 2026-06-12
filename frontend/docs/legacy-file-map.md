# Legacy File Map

## app.js

Future homes:

- `frontend/src/core/app-state.js`
- `frontend/src/core/router.js`
- `frontend/src/core/api-client.js`
- `frontend/src/features/*`

Store logic copied/extracted, not switched:

- `frontend/src/features/store/store-view.js`
- `frontend/src/features/store/store-service.js`
- `frontend/src/features/store/store-selectors.js`
- `frontend/src/features/store/store-normalizers.js`

## api-retry-fix.js

Future home:

- `frontend/src/core/api-client.js`

## partial-snapshot-merge-fix.js

Future home:

- `frontend/src/core/snapshot-store.js`

## market-news-final-fix.js

Future homes:

- `frontend/src/features/market/market-news-view.js`
- `frontend/src/features/market/market-news-modal.js`
- `frontend/src/features/market/market-selectors.js`
- `frontend/src/features/market/market-normalizers.js`

## market-data-refresh.js

Future homes:

- `frontend/src/features/market/market-service.js`
- `frontend/src/features/market/market-profile-view.js`

## market-data-layout-fix.js

Future homes:

- `frontend/src/features/market/market-profile-view.js`
- `frontend/styles/market.css`

## stock-trade-history-fixes.js

Future home:

- `frontend/src/features/trading/trade-history-view.js`

## use-item-permission-fix.js

Copied/extracted, not switched:

- `frontend/src/features/inventory/item-use-service.js`
- `frontend/src/features/inventory/inventory-selectors.js`

The extracted helpers are display-only or validation-preview-only. Backend
`USE_ITEM` remains authoritative.

## inventory-empty-state-fix.js

Copied/extracted, not switched:

- `frontend/src/features/inventory/inventory-view.js`
- `frontend/src/components/empty-state.js`

## mobile-ux-fix.js

Future home:

- `frontend/styles/mobile.css`

## display-format-final-fix.js

Future homes:

- `frontend/src/utils/formatters.js`
- `frontend/src/utils/currency.js`

## login-quotes.js

Future home:

- `frontend/src/features/auth/login-quotes.js`

## academic-market-copy.js

Future home:

- future `frontend/src/content/copy.js` or feature-specific copy constants
