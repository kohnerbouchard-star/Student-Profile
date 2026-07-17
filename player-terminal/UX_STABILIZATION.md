# Econovaria Player Terminal v7 — Stabilization Pass

Version 7 deliberately adds no new game system. It hardens the v6 task-oriented player experience so the frontend is safer to connect to the live API.

## Interaction changes

- Added route-level rendering protection so one malformed read model does not destroy the full shell.
- Added visible form-level error summaries and field validation before any write request is prepared.
- Added balance, inventory, holdings, quantity, account-selection, and order-type checks for high-risk actions.
- Added live order estimates for market trades and live totals for marketplace purchases.
- Added deterministic focus movement for route changes, modals, notification drawers, and the mobile More sheet.
- Added Escape handling, focus trapping, opener restoration, outside-click dismissal, and background inertness for overlays.
- Added online/offline status feedback and safe clipboard feedback.
- Persisted the desktop sidebar preference without allowing storage errors to break the app.

## Content states

Dedicated empty states now exist for:

- News and category filters
- Market instruments and sectors
- Portfolio allocation, exposure, and holdings
- Store and inventory filters
- Banking transactions
- Business products and suppliers
- Marketplace listings
- Messages
- Loans and payment schedules
- Crafting recipes

Loading, API failure, route rendering failure, pending write, and disabled-action states remain visually distinct.

## Responsive containment

- Increased compact interaction targets to approximately 44 pixels.
- Reserved safe mobile space beneath fixed navigation.
- Prevented mobile banking cards from compressing their content.
- Converted portfolio holdings into readable mobile cards.
- Replaced the horizontal mobile message-thread strip with a stable vertical list.
- Constrained the notification drawer to the active viewport.
- Added wrapping and containment for long balances, labels, and identifiers.

## API safety

No write updates local economic state optimistically. A purchase, transfer, trade, listing, loan payment, contract submission, crafting request, business action, message, or progression action remains pending until a connected backend confirms the operation.
