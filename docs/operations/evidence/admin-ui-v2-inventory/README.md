# Admin UI V2 Inventory Evidence

Branch: `refactor/admin-ui-v2-inventory-v1`

Exact base: `b7827211f0ff15b8a963219a63738180b33a1b3d`

## Contract evidence

The implementation was bounded to the existing canonical Admin inventory redemption contract:

- queue read: `GET /api/admin/games/:gameId/inventory/redemptions`;
- review: `approve`, `reject`, `fulfill` POST actions;
- permission: `inventory.redeem`;
- existing client reused: `admin/inventory-redemption-queue-client.js`;
- canonical backend handlers/RPCs remain unchanged.

No Admin endpoint exists on this base for a global arbitrary owned-item balance directory. The V2 route therefore labels quantities as **requested redemption quantities** and explicitly does not create or infer a second inventory ledger.

## Scope evidence

Expected changed source surface:

- `admin/v2.html`
- `admin/v2/src/app.js`
- `admin/v2/src/core/navigation-registry.js`
- `admin/v2/src/routes/inventory/*`
- `admin/v2/styles/routes/inventory.css`
- `scripts/admin-v2-inventory-contract.test.mjs`
- `docs/architecture/admin-ui-v2-inventory.md`
- this evidence directory

No Store, Crafting, Business, Player Inventory, Backend, database, migration, or Supabase implementation file is intentionally changed.

## Behavior evidence

Covered by the focused contract test and source assertions:

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

Focused command:

```text
node --test scripts/admin-v2-inventory-contract.test.mjs
```

## Review notes

The current authoritative Admin response exposes a player relationship but not a Business ownership link. It exposes item name/category but not seeded/custom provenance/type today. Those unsupported fields are omitted rather than synthesized.

The draft PR checks are the authoritative remote execution record for the committed branch. No staging or production mutation is part of this work.
