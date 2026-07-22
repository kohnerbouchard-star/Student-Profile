# Crafting and Item Runtime v1

PR #300 and branch `agent/crafting-item-runtime-v1` are the sole runtime authority for `EXP-ITEM-001` through `EXP-ITEM-009` and `EXP-CRAFT-001` through `EXP-CRAFT-008`.

## Definition boundary

PR #163 remains the only catalog, recipe, substitution, salvage, scarcity, and calibration authority. Crafting consumes `docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json`, validates its exact file hashes and pack identity, and builds a runtime envelope without committing copied Seed definitions. Deployment is not activation. Pack activation fails closed unless the exact downstream contract, catalog, recipe, calibration, digest, and zero-failure balance gates are authorized.

Maintenance and durability remain disabled because the current PR #163 maintenance/salvage source is definition-only. Salvage is active only through the approved bounded recovery rules.

## Player routes

- `GET /players/me/crafting`
- `POST /players/me/crafting/jobs`
- `POST /players/me/crafting/jobs/:jobKey/cancel`
- `POST /players/me/crafting/jobs/:jobKey/claim`
- `POST /players/me/items/:itemKey/use`
- `POST /players/me/equipment/:equipmentKey/equip`
- `POST /players/me/equipment/:equipmentKey/salvage`

All scope is derived from the authenticated Player session. Internal UUIDs and browser-selected game scope are rejected.

## Admin routes

- `GET /games/:gameId/crafting/oversight`
- `POST /games/:gameId/crafting/jobs/:jobKey/recover`
- `POST /games/:gameId/crafting/supply/:itemKey`

The accepted Admin Inventory surface loads a scoped Crafting oversight drawer without a new global observer or shell redesign.

## Capability and rate-limit publication

Route capability: `crafting`.

Action capabilities: `craftItem`, `craftCancel`, `craftClaim`, `equipmentEquip`, `itemEffectUse`, `itemSalvage`.

Reviewed rate-limit operations: `crafting`, `craftingJobCancel`, `craftingJobClaim`, `itemEffectUse`, `equipmentEquip`, `equipmentSalvage`.

## Runtime invariants

- one authoritative generic inventory reservation per job/input holding;
- `inventory_holdings.quantity_reserved` remains the derived projection of active generic reservations;
- atomic reserve, release, or consume transitions;
- deterministic failure and quality resolution from immutable job snapshots;
- exactly-once output grants and equipment instance creation;
- player-scoped salvage/recraft cooldown;
- bounded salvage recovery and no guaranteed system buyback;
- idempotent Player and Admin mutations;
- committed-success responses remain successful even when a follow-up refresh fails;
- append-only job, effect, inventory, Admin, and audit history;
- cross-game isolation and public runtime identifiers.

## Final migration and synchronization state

- Authorized predecessor and synchronization target: Business merge `2b073019ed36ca63cf9a9b3c7acd14569fe88116`.
- Pre-synchronization Crafting head: `93b344fda089777fd90083b827ed70d5284db380`.
- Controller-assigned Crafting range: `20260721130000–20260721139999`.
- Final migration family: twenty ordered migrations from `20260721130000` through `20260721135700`.
- Marketplace remains reserved at `20260721140000–20260721149999`.
- The branch was synchronized once against the exact Business merge and permanent Crafting source was replayed additively onto that tree.
- Production remains unchanged and unauthorized.

Exact-head repository, browser, replay/lint, and isolated-staging evidence must be bound to the frozen final head before Chat 1 authorizes merge.
