# Patch Registry

This registry tracks active root patch files during the copy, test, transplant
refactor.

| Root file | Current purpose | Planned destination | Status |
| --- | --- | --- | --- |
| `app.js` | Dashboard/profile display, auth/login flow, routing shell, shared normalization, and legacy root app behavior. | `frontend/src/features/dashboard/dashboard-view.js`, `dashboard-selectors.js`, `dashboard-normalizers.js`, `frontend/src/features/profile/profile-view.js`, `profile-selectors.js`, `profile-normalizers.js`, `frontend/src/features/auth/auth-controller.js`, `auth-service.js`, `login-view.js`, `auth-selectors.js`, `auth-normalizers.js` | store copied, extracted, shadow-test-ready, guarded-switch-ready, runtime-wired; inventory copied, extracted, shadow-test-ready, guarded-switch-ready; dashboard/profile copied, extracted, shadow-test-ready, guarded-switch-ready; auth/login copied, extracted, shadow-test-ready, guarded-switch-ready |
| `student-ui-fixes.js` | Student UI patch behavior. | `frontend/src/features/dashboard/`, shared components, or feature-specific views after classification. | copied |
| `market-data-refresh.js` | Refreshes market data profile rendering, chart, and display helpers. | `frontend/src/features/market/market-service.js`, `market-profile-view.js`, `market-chart-view.js`, and selectors. | copied, extracted, shadow-test-ready, guarded-switch-ready, runtime-wired |
| `stock-trade-history-fixes.js` | Trade history rendering or display fixes. | `frontend/src/features/trading/trade-history-view.js`, `frontend/src/features/trading/trading-service.js`, `frontend/src/features/trading/trading-view.js` | copied, extracted, shadow-test-ready, guarded-switch-ready, runtime-wired |
| `partial-snapshot-merge-fix.js` | Snapshot merge compatibility patch. | `frontend/src/core/snapshot-store.js` | copied, extracted, shadow-test-ready, guarded-switch-ready, runtime-wired |
| `use-item-permission-fix.js` | Item use permissions and inventory action safety. | `frontend/src/features/inventory/item-use-service.js`, `frontend/src/features/inventory/inventory-selectors.js` | copied, extracted, shadow-test-ready, guarded-switch-ready |
| `inventory-empty-state-fix.js` | Inventory empty state display. | `frontend/src/features/inventory/inventory-view.js`, `frontend/src/components/empty-state.js` | copied, extracted, shadow-test-ready, guarded-switch-ready |
| `api-retry-fix.js` | API retry behavior. | `frontend/src/core/api-client.js` | copied, extracted, shadow-test-ready, guarded-switch-ready, runtime-wired |
| `mobile-ux-fix.js` | Mobile interaction and layout fixes. | `frontend/styles/mobile.css` | copied |
| `academic-market-copy.js` | Market copy text. | future `frontend/src/content/copy.js` or feature-specific copy constants | copied, future extraction target if needed |
| `login-quotes.js` | Login quote rotation. | `frontend/src/features/auth/login-quotes.js` | copied, extracted, shadow-test-ready, guarded-switch-ready |
| `display-format-final-fix.js` | Display value formatting patch. | `frontend/src/utils/formatters.js`, `frontend/src/utils/currency.js` | copied |
| `market-news-final-fix.js` | Company news normalization, rendering, and modal patch. | `frontend/src/features/market/market-news-view.js`, `market-news-modal.js`, `market-selectors.js`, `market-normalizers.js` | copied, extracted, shadow-test-ready, guarded-switch-ready, runtime-wired |
| `market-data-layout-fix.js` | Market data layout polish around imported news card. | `frontend/src/features/market/market-profile-view.js`, `frontend/styles/market.css` | copied, extracted, shadow-test-ready, guarded-switch-ready, runtime-wired |

No active root runtime file should be deleted, moved, renamed, or archived until
the matching module is extracted, tested, switched behind a feature flag, and
manually approved.
