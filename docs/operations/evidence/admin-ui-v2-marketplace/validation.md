# Marketplace Moderation Validation Matrix

## Source checks

Focused validation is implemented in `scripts/admin-v2-marketplace.test.mjs`.

Coverage:

- authoritative Marketplace GET path;
- listing moderation paths and idempotency payload/header;
- dispute moderation paths and idempotency payload/header;
- policy mutation path;
- unsupported mutation rejection before transport;
- safe Backend error normalization;
- zero, one, and many listing normalization;
- active, sold, cancelled, and dispute-derived `disputed` presentation;
- search/filter source guard;
- long and Korean item/player text;
- private UUID and unsafe audit-metadata stripping;
- `marketplace.moderate` denial before reads/mutations;
- explicit financial Market / Marketplace route separation;
- Player Marketplace contract presence/regression guard;
- responsive CSS boundaries at 900px, 640px, and 420px.

## Syntax checks performed before publication

The following new/modified source files were checked with `node --check` in the implementation workspace before publishing:

- `MarketplaceApiClient.js`
- `MarketplaceController.js`
- `MarketplaceRoute.js`
- `MarketplaceSkeleton.js`
- `app.js`
- `navigation-registry.js`
- `admin-v2-marketplace.test.mjs`

## Runtime/browser evidence

The route is built on the existing Admin V2 responsive table/card, dialog, permission-boundary, safe-error, and six-state primitives. Repository CI/preview results are recorded on the draft PR; no staging or production deployment is part of this task.

The branch must remain a draft until checks settle. This task does not authorize merge.
