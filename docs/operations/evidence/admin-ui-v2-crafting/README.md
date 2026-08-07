# Admin UI V2 Crafting — Evidence

## Current disposition

- Repository: `kohnerbouchard-star/Student-Profile`
- Branch: `refactor/admin-ui-v2-crafting-v1`
- Draft PR: #510
- Prior audited head: `4df2cad921d2aa98fccb93c7fb53f35d2c739a93`
- Latest inspected PR #503 head: `84f12d0b20c9947958c19e19e4106b243ebcd147`
- No Backend/Supabase permission mapping changed by PR #510.
- No Inventory/Business/Player semantics changed by this hold update.
- Crafting route source is preserved.
- No merge or production promotion is authorized.

Status:

`CRAFTING_WAITING_FOR_503_AND_PERMISSION_FIX`

## Gate 1 — PR #503 canonical asset ownership

PR #503 remains open/draft. This inspection was limited to its latest canonical-asset/Crafting contract changes; no broad repository audit was performed.

Relevant inspected #503 files:

- `docs/architecture/adr-economic-asset-ownership-core-v2.md`
- `backend/supabase/migrations/20260806120120_cutover_crafting_read_v2.sql`
- `backend/supabase/migrations/20260806120130_cutover_crafting_start_v2.sql`
- `backend/supabase/migrations/20260806120140_cutover_crafting_cancel_claim_v2.sql`
- `backend/supabase/functions/admin-api/readExtensions.ts`
- `scripts/economic-asset-core-v2-contract.test.mjs`

### Code-level findings at #503 head

The #503 code now establishes:

- canonical item identity through game-scoped `game_items` / canonical item keys;
- canonical ownership/location through `inventory_account_id + game_item_id` internally;
- Store identity as optional acquisition provenance rather than ownership identity;
- canonical Player Crafting recipe reads with ingredient/output definitions;
- ingredient `owned` values resolved from canonical personal inventory holdings after reservations;
- canonical Crafting reservation at job start;
- canonical reservation release at cancel;
- canonical input consumption and output production at claim;
- crafted outputs that do not require a Store offer;
- canonical Business material-flow migrations in the same ownership core;
- a contract rule that browser payloads do not serialize canonical UUIDs.

The #503 PR description is stale relative to the changed files: it still describes some Crafting mutation and Business material-flow work as remaining even though those migrations now exist in the branch. PR #510 must therefore reconcile against the final code/contract that actually lands, not the draft description.

### Important Admin boundary

The richer recipe/input/output/owned-quantity projection currently inspected in #503 is the **Player Crafting** read model. It is not an Admin `inventory.redeem` projection.

PR #510 must not call Player Crafting RPCs, read raw canonical tables, or consume `/players` merely to reconstruct Crafting ownership requirements.

## Exact final Admin contract required

Before PR #510 can leave the dependency hold, the finalized Admin/BFF Crafting contract must be checked for the following semantics. PR #510 will consume only fields that actually exist in that final Admin DTO.

### Public identity

For recipe inputs, outputs and inventory requirements, the Admin payload must use privacy-safe public item identity such as the canonical item key plus display name. It must not expose:

- `game_item_id` UUIDs;
- `inventory_account_id` UUIDs;
- holding/reservation/transaction UUIDs;
- Player ownership UUIDs.

### Recipe/availability semantics

Where the final Admin DTO exposes them, V2 requires authoritative equivalents of:

- recipe key/name/category/tier/workshop/duration;
- enabled/scarcity/country or equivalent availability state;
- input item key/name, required quantity, role and substitution grouping;
- output item key/name, quantity and output kind.

No recipe create/edit/delete contract is required or permitted by PR #510.

### Inventory requirement semantics

Any missing/sufficient ingredient display must come from a server-computed canonical ownership projection. Canonical sufficiency is based on available personal ownership after reservations (`quantity_owned - quantity_reserved`), but the browser must not receive or join the internal ownership IDs used to compute it.

Physical-economy supply availability remains separate from Player inventory ownership.

### Crafting records/actions

The existing Admin Crafting job records and supported recovery/supply actions may remain the V2 mutation surface, but final reconciliation must verify that recovery still respects #503's canonical reservation/consumption/output state and idempotency. PR #510 does not gain Player Crafting start/cancel/claim authority or direct inventory posting authority.

### Store → Inventory → Crafting → Business

Final reconciliation must preserve:

1. Store purchase moves/grants a canonical item into Player canonical inventory.
2. Crafting reserves/consumes canonical Player inventory.
3. Crafting produces canonical outputs back into Player inventory without requiring Store provenance.
4. Business ownership changes only through authoritative Business procurement/contribution/material-flow operations.

Crafting V2 must not materialize a second Business or Player inventory model.

## Gate 2 — separate backend permission blocker

The V2 product permission is `inventory.redeem`.

The currently audited server-side Admin resource mapping does not explicitly map the Crafting resource to `inventory.redeem`; Crafting therefore falls through generic game permissions. PR #510 correctly does not modify that policy.

A separately owned Backend/Supabase/security correction is required before Crafting merge. Its acceptance contract is:

- Crafting Admin reads enforce `inventory.redeem` server-side.
- Supported Crafting recovery/supply mutations enforce `inventory.redeem` server-side unless a separately approved stricter action-level policy is adopted.
- generic `game.read` / `game.update` alone do not silently satisfy Crafting authorization when the product route requires `inventory.redeem`.
- existing game scoping, AAL2, CSRF, idempotency and safe-error protections remain intact.
- denied requests disclose no private Crafting/inventory data.

The V2 client-side permission check remains defense in depth only; it is not the permission fix.

## Preserved PR #510 behavior while held

The current route continues to use only the existing Admin Crafting surface:

- `GET /games/:gameId/crafting/oversight?status=&limit=`;
- `POST /games/:gameId/crafting/jobs/:jobKey/recover`;
- `POST /games/:gameId/crafting/supply/:itemKey`.

Because the reconciled-main Admin oversight DTO does not yet expose standalone recipe inputs/outputs or canonical per-player holdings, V2 continues to:

- show Observed recipes from authoritative Crafting jobs;
- omit fabricated ingredient sufficiency;
- omit fabricated output item lines;
- keep physical supply distinct from ownership;
- leave canonical reservations, consumption and grants to server authority;
- expose no private UUIDs.

No application source was changed for this dependency hold.

## Required convergence procedure

After both blockers are resolved:

1. fetch current `main`;
2. inspect only finalized Admin Crafting/BFF DTOs plus the explicit server Crafting permission mapping;
3. bind richer recipe/input/output/inventory requirement fields only where authoritative Admin fields exist;
4. preserve the canonical ownership/privacy boundary;
5. rerun focused Admin V2 Crafting plus Player Crafting/Inventory regressions;
6. update evidence and reassess PR #510 for merge.

Until then:

`CRAFTING_WAITING_FOR_503_AND_PERMISSION_FIX`
