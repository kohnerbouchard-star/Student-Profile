# UX and Responsive Audit — v7

## Validation matrix

All fifteen routes were rendered at:

- Desktop: 1440 × 1000
- Mobile: 390 × 844

This produced thirty route-and-viewport checks.

## Browser results

- No document-level horizontal overflow on any route.
- No route-level rendering error shell.
- No unresolved `undefined` text.
- No browser runtime errors.
- No browser console errors.
- Critical banking cards, portfolio holdings, message rows, and marketplace cards remained within viewport bounds.
- All five mobile navigation targets met the 44-pixel minimum used by this frontend.

The raw browser results are stored at `preview/v7-stabilization/browser-audit-v7.json`.

## Interaction checks

Twenty-three interaction checks passed:

- Notification drawer opens, receives focus, closes with Escape, and restores focus.
- Country modal opens, contains focus, makes the background inert, closes with Escape, and restores focus.
- Mobile More sheet opens, receives focus, closes with Escape, and restores focus.
- Same-account transfers are rejected before processing.
- Invalid transfer focus moves to the affected field.
- Market estimates update with quantity changes.
- Limit orders require a limit price.
- Orders exceeding available cash are rejected.
- Marketplace totals update with quantity changes.
- Store search displays a no-results state.
- Route changes update the document title and move focus to main content.

## Visual findings corrected

- Mobile bank cards no longer compress balances or supporting text.
- Portfolio holdings no longer depend on a horizontally scrolling desktop table.
- Message threads no longer require a horizontal carousel on mobile.
- The notification drawer cannot extend beyond the active viewport.
- Compact controls use consistent target sizes and visible focus treatment.
- Form errors remain inside the affected workflow and no longer depend on browser-native error bubbles.

## Audit harness

The managed Chromium environment blocks navigation to local development and file origins. The audit therefore bundled the application and loaded it through Playwright `page.set_content`, while a request interceptor served the package’s real local image and SVG assets. The executed JavaScript, CSS, routes, interactions, and assets were the package contents; only the navigation transport differed from `npm run dev`.

## Remaining constraints

- Preview data is static.
- Backend schemas, authorization, latency, and server error payloads still require integration testing.
- Economic state is not updated optimistically.
- Final usability testing should include actual student players after API connection.
