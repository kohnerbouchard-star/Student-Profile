# Marketplace Moderation Contract Audit

Base: `b7827211f0ff15b8a963219a63738180b33a1b3d`

Branch: `refactor/admin-ui-v2-marketplace-v1`

## Admin contracts audited

- `admin/marketplace-lifecycle-client.js`
- `admin/marketplace-lifecycle-loader.js`
- `admin/marketplace-lifecycle-surface.js`
- `backend/supabase/functions/admin-api/marketplaceOperations.ts`

Confirmed read contract:

- Marketplace policy
- listings
- purchase reservations
- settlement orders
- disputes
- audit events
- financial settlement postings

Confirmed mutations:

- listing hold / approve / reject
- dispute refund buyer / resolve seller / reject
- Marketplace policy update

No authoritative offers collection or offers mutation was found. No offers UI is implemented.

## Player contracts audited

- `player-terminal/src/api/marketplace-backend-routes.js`

Confirmed Player behaviors remain separate and unchanged:

- list/read Marketplace listings
- create listing
- activate listing
- purchase listing
- cancel listing
- open order dispute

## Financial Market separation

Financial Market remains under the separate `market.manage` V2 route and `/games/:gameId/market/...` contracts. Marketplace uses `marketplace.moderate` and `/games/:gameId/marketplace...` exclusively.

No financial Market file is owned by this change.
