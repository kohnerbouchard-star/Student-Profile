# Admin UI V2 — Crafting

**Owner branch:** `refactor/admin-ui-v2-crafting-v1`

**Original implementation base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`

**Reconciled main:** `4c17b942fcf4b2a6f60b629549f192d066053ba4`

**Main reconciliation commit:** `9c44517a2cdb9bb27f8d97113546797b74dbadd9`

**Latest inspected PR #503 head:** `84f12d0b20c9947958c19e19e4106b243ebcd147`

**Status:** `CRAFTING_WAITING_FOR_503_AND_PERMISSION_FIX`

**Production promotion authorized:** No

## Purpose and boundary

This tranche owns only the Admin **Crafting** destination in Admin UI V2.

Crafting remains part of the canonical economic chain:

`Store offer/purchase → canonical Inventory ownership/reservations → Crafting consumption/output → explicit Business inventory/material flow where authoritative`

This branch does not introduce a second inventory ledger, business-inventory projection, recipe store, item-grant path, or backend permission rule. No Backend/Supabase, Inventory semantics, Business semantics, Store semantics, or Player Crafting semantics are changed here.

The V2 navigation permission remains `inventory.redeem`.

## Hold state

Two independent blockers must be cleared before PR #510 may merge:

1. **PR #503 canonical asset ownership must reach its final/merged contract shape and PR #510 must be reconciled against that final shape.**
2. **The server-side Admin permission mapping must explicitly authorize Crafting under `inventory.redeem`.** The current audited server mapping does not explicitly map the Crafting resource and therefore falls back to generic game permissions. That backend policy correction is deliberately not made in this UI branch.

The Crafting route source is preserved while these dependencies are unresolved.

## Latest PR #503 inspection

PR #503 remains open/draft at inspected head `84f12d0b20c9947958c19e19e4106b243ebcd147`.

The code at that head is more advanced than the PR description: it already contains forward migrations for canonical Crafting read, start, cancel/claim, inventory effect/salvage cutover, Business material-flow foundation/production/settlement, seed synchronization, Marketplace/redemption context, and integrity validation. The PR description still lists some of those areas as remaining work, so convergence must use the final code/contract that lands on `main`, not the draft description alone.

The inspected #503 code establishes these canonical semantics:

- `game_items` is the game-scoped canonical item identity; stable public resolution is by canonical item key, not Store-key prefix stripping.
- canonical ownership/location is internal `(inventory_account_id, game_item_id)`; `store_item_id` is optional acquisition provenance rather than ownership identity.
- Player Crafting read resolves recipes, inputs and outputs through canonical `game_items` and personal inventory accounts.
- Player Crafting start reserves canonical holdings; cancel releases canonical reservations; claim consumes canonical inputs and grants canonical outputs.
- crafted outputs do not require a Store offer and may have no `store_item_id` provenance.
- Business material flows use canonical inventory accounts and explicit warehouse/WIP/finished-goods movement rather than a second free-form ownership model.
- browser payloads must not expose canonical UUIDs.

These are dependency facts only. PR #510 does not consume the unmerged #503 RPCs or tables directly.

## Exact final contracts required for Crafting V2 convergence

The final reconciliation must use the finalized Admin/BFF contracts after #503 lands. The UI must not infer or invent a contract from draft database internals.

### 1. Canonical item identity contract

Any Admin Crafting payload used by V2 must expose a stable **public item key** and display name for recipe inputs/outputs and inventory requirements. Internal `game_item_id`, `inventory_account_id`, holding UUIDs, reservation UUIDs, player UUIDs, and transaction UUIDs must remain server-private.

Store offer identity may be shown only as provenance when the finalized Admin DTO explicitly provides it. Crafting must not use Store offer identity as the ownership key because #503 makes Store provenance optional for crafted outputs.

### 2. Admin-scoped recipe/read contract

PR #503 currently enriches the **Player** Crafting read model with recipe details, but that Player RPC is not an Admin authorization surface and must not be called by Crafting V2 merely to obtain richer data.

For the Admin route to show authoritative recipes/inputs/outputs/inventory requirements, the finalized Admin/BFF Crafting read contract must expose those semantics through an Admin-authorized projection, preferably by enriching the existing `GET /games/:gameId/crafting/oversight` contract rather than creating parallel browser ownership logic.

Where present in the final Admin DTO, V2 may consume only authoritative equivalents of:

- recipe identity/name/category/tier/workshop tier and duration;
- recipe availability such as enabled/scarcity/country or equivalent server-computed availability state;
- input public item key/name, required quantity, role and substitution group where authoritative;
- output public item key/name, quantity and output kind where authoritative;
- inventory requirement/sufficiency values computed by the server from canonical personal inventory ownership/reservations;
- Crafting job records, lifecycle/timing/quality/failure state and supported recovery state;
- effects, physical supply state and invariant/integrity counters where still part of the final Admin contract.

Field names above describe required semantics, not a new API proposal. PR #510 must bind only to fields actually present in the finalized Admin DTO.

If final Admin contracts do **not** expose a recipe/input/output/ownership field, V2 must continue to omit it rather than reading raw tables, calling Player-scoped RPCs, consuming `/players` as an ownership surrogate, or reconstructing it client-side.

### 3. Inventory requirement authority

Ingredient sufficiency must be based on canonical available ownership after reservations, equivalent to:

`available = quantity_owned - quantity_reserved`

but the browser must receive only a privacy-safe server projection. It must not calculate canonical ownership by joining internal IDs or by treating physical-economy supply quantities as Player inventory.

Recipe availability and physical-economy supply are separate from Player ownership. V2 must continue to distinguish them.

### 4. Crafting mutation/recovery authority

PR #510 may use only existing supported Admin mutations. It does not gain recipe CRUD, direct inventory adjustment, Crafting start/cancel/claim on behalf of Players, or direct canonical transaction posting.

The existing Admin recovery contract must be reconciled after #503 so that any `release_and_fail` / `requeue` behavior remains compatible with canonical reservations, consumption, output grants and idempotency. The server remains the sole authority for whether a recovery is safe.

The existing physical-supply override remains a supply/availability operation; it is not an ownership grant.

### 5. Store → Inventory → Crafting → Business relationship

The final contract must preserve these ownership transitions without UI duplication:

- Store purchase grants/moves the canonical item into the Player's canonical personal inventory account.
- Crafting reserves and consumes that canonical Player inventory.
- Crafting outputs are canonical items returned to canonical Player inventory and do not require Store provenance.
- Business material ownership is reached only through authoritative Business procurement/contribution/material-flow operations; Crafting V2 must not mirror Player holdings into a Business inventory model.

## Separate backend blocker — Admin permission mapping

Crafting V2 intentionally requires `inventory.redeem` and fails closed client-side when the permission is absent. That browser check is not sufficient authorization.

Before PR #510 merges, a separately owned Backend/Supabase/security change must make the server-side Admin resource/action mapping explicitly enforce the intended Crafting permission. The acceptance contract is:

- Admin Crafting read requests require `inventory.redeem` server-side.
- Supported Admin Crafting recovery/supply mutations require `inventory.redeem` server-side unless an explicitly approved stricter action-level policy replaces it.
- possession of generic `game.read` or `game.update` alone must not silently authorize Crafting when the product permission is `inventory.redeem`.
- existing AAL2/CSRF/idempotency/game-scope protections remain intact.
- permission denial is returned as the normal safe Admin authorization error and no private Crafting/inventory data is disclosed.

PR #510 must not fix this by changing only client-side checks, by broadening `inventory.redeem`, or by weakening inherited server permissions.

## Current Admin Crafting contract on PR #510's reconciled main

The existing Admin surface used by this branch remains:

| Capability | Existing Admin route | V2 use |
|---|---|---|
| Oversight read | `GET /games/:gameId/crafting/oversight?status=&limit=` | Reads current pack, jobs, effects, physical-economy supply state, and Inventory/Crafting invariant counters. |
| Job recovery | `POST /games/:gameId/crafting/jobs/:jobKey/recover` | Uses only `release_and_fail` or `requeue`, plus required reason/idempotency. |
| Supply override | `POST /games/:gameId/crafting/supply/:itemKey` | Uses existing country/scarcity/quantity/multiplier/source/expiry fields. |

The current oversight DTO does not expose a standalone Admin recipe catalog, recipe input lines, recipe output lines, per-player canonical holdings, private reservations, or Business inventory rows. V2 therefore keeps the **Observed recipes** fallback derived from authoritative job records and does not fabricate richer data while on hold.

## V2 source ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/crafting/CraftingApi.js` | Existing Admin/BFF Crafting paths, safe request/error handling and mutation idempotency. |
| `admin/v2/src/routes/crafting/CraftingController.js` | Data-state lifecycle, privacy-safe normalization, `inventory.redeem` fail-closed behavior and authoritative refresh. |
| `admin/v2/src/routes/crafting/CraftingRoute.js` | Supervisory UI using only supported read/action data. |
| `admin/v2/src/routes/crafting/CraftingSkeleton.js` | Loading state. |
| `admin/v2/styles/routes/crafting.css` | Route-local responsive behavior. |
| `.github/workflows/admin-v2-crafting.yml` | Focused V2 verification. |

No application-source change is required while the two dependency gates remain open.

## Final convergence procedure

After #503 is merged/finalized and the backend Crafting permission correction exists:

1. fetch current `main`;
2. inspect only finalized Admin Crafting/BFF DTOs and the explicit Crafting permission mapping;
3. reconcile recipe/input/output/inventory requirement fields additively where the Admin contract actually exposes them;
4. preserve public-key/privacy boundaries and the canonical Store → Inventory → Crafting → Business chain;
5. rerun focused Admin V2 Crafting and Player Crafting/Inventory regressions;
6. update evidence and reassess PR #510 for controller merge.

Until both dependency gates are cleared, status remains:

`CRAFTING_WAITING_FOR_503_AND_PERMISSION_FIX`
