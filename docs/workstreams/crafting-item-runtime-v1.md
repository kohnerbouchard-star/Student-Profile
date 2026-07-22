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

- one authoritative inventory reservation per job/input holding;
- atomic reserve, release, or consume transitions;
- deterministic failure and quality resolution from immutable job snapshots;
- exactly-once output grants and equipment instance creation;
- player-scoped salvage/recraft cooldown;
- bounded salvage recovery and no guaranteed system buyback;
- idempotent Player and Admin mutations;
- committed-success responses remain successful even when a follow-up refresh fails;
- append-only job, effect, inventory, Admin, and audit history;
- cross-game isolation and public runtime identifiers.

## Migration status

The current permanent source retains a dependency-ordered provisional migration set solely so replay and contract checks can run. Chat 1 must assign the reserved post-Business migration range after PR #299 merges. The set must then be rekeyed once without changing SQL intent, synchronized with final Business `main`, replayed twice, linted, and exercised in isolated staging before merge.
