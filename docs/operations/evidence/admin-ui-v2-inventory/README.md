# Admin UI V2 Inventory Evidence

Branch: `refactor/admin-ui-v2-inventory-v1`

Original implementation base: `b7827211f0ff15b8a963219a63738180b33a1b3d`

Reconciled `main`: `4c17b942fcf4b2a6f60b629549f192d066053ba4`

Reconciliation commit: `d4b2a13ddb20ce2362934c549f2350e863ebf7fc`

## Contract evidence

The implementation remains bounded to the existing canonical Admin inventory redemption contract:

- queue read: `GET /api/admin/games/:gameId/inventory/redemptions`;
- review: `approve`, `reject`, `fulfill` POST actions;
- permission: `inventory.redeem`;
- existing client reused: `admin/inventory-redemption-queue-client.js`;
- canonical backend handlers/RPCs remain unchanged.

Current `main` has no `inventory.redeem`-scoped Admin endpoint for a global arbitrary owned-item balance directory. The V2 route therefore labels quantities as **requested redemption quantities** and explicitly does not create or infer a second inventory ledger.

## PR #503 dependency evidence

PR #503 is open and draft at head `84f12d0b20c9947958c19e19e4106b243ebcd147`.

Its current canonical economic-asset work adds:

- canonical `game_items` and inventory-account ownership;
- authoritative owned-position quantities/reservations and `assetClass`;
- Store seeded/custom `sourceType` when represented;
- canonical Marketplace/redemption item/account/reservation context.

The canonical Admin owned-position projection currently enters through `/games/:gameId/players`, which is guarded by `players.manage`. Inventory V2 is guarded by `inventory.redeem`, and #503 does not change the public `/inventory/redemptions` DTO. This branch therefore does not consume `/players` or escalate its permission requirements.

**Final merge gate:** reconcile Inventory V2 against #503 after #503 resolves. If #503 supplies an `inventory.redeem`-compatible ownership projection, Inventory V2 should consume it for owned items, owned quantity, provenance/type, and authoritative player/business ownership relationships. If not, those fields remain unavailable rather than inferred.

## Scope evidence

Changed source remains bounded to:

- `admin/v2.html`
- `admin/v2/src/app.js`
- `admin/v2/src/core/navigation-registry.js`
- `admin/v2/src/routes/inventory/*`
- `admin/v2/styles/routes/inventory.css`
- `scripts/admin-v2-inventory-contract.test.mjs`
- `docs/architecture/admin-ui-v2-inventory.md`
- this evidence directory

No Store, Crafting, Business, Marketplace, Player Inventory, Backend, database, migration, or Supabase implementation file is intentionally changed.

The two commits pulled from `main` during reconciliation change only Player Terminal coordinator/capability routing files and do not overlap Inventory V2, Store media authority, or Crafting oversight source.

## Focused regression evidence

Executed after dependency review and current-main reconciliation:

- Store source/media regression: `node --test scripts/admin-v2-store-media.test.mjs` -> **7/7 passed**.
- Crafting oversight source contract: `node scripts/admin-crafting-oversight-contract.mjs` -> **passed**.
- Inventory V2 contract: `node --test scripts/admin-v2-inventory-contract.test.mjs` -> **6/6 passed**.

Inventory coverage includes:

- zero redemption records;
- 25-row page / many records;
- integer requested quantities;
- Korean/non-ASCII and long text;
- UUID-shaped private-value redaction;
- seeded/custom provenance absent unless represented by the row;
- pending -> approve/reject;
- approved -> fulfill;
- idempotent mutation contract;
- permission dependency remains `inventory.redeem`;
- standard V2 loading/ready/refreshing/stale/empty/failed states;
- safe no-ledger copy;
- desktop table plus 900 px / 620 px responsive behavior;
- Inventory route has no Store/Crafting/Business route dependency.

## Review notes

The current authoritative redemption response exposes a player relationship but not a Business ownership link. It exposes item name/category but not seeded/custom provenance/type. Those unsupported fields are omitted rather than synthesized.

The draft PR checks and automatic preview remain the remote execution/review record for the committed branch. No staging or production mutation is part of this work.
