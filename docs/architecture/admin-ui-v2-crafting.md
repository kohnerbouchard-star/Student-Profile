# Admin UI V2 — Crafting

**Owner branch:** `refactor/admin-ui-v2-crafting-v1`

**Original implementation base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`

**Reconciled main:** `4c17b942fcf4b2a6f60b629549f192d066053ba4`

**Main reconciliation commit:** `9c44517a2cdb9bb27f8d97113546797b74dbadd9`

**Status:** `IMPLEMENTED_NOT_MERGED`

**Production promotion authorized:** No

## Purpose and boundary

This tranche migrates only the Admin **Crafting** destination into the source-owned Admin UI V2 shell.

Crafting remains part of Econovaria's existing physical-economy chain:

`Store purchase → Inventory ownership/reservations → Crafting consumption/output → Business inventory where authoritative`

This UI does not introduce a second inventory ledger, business-inventory projection, recipe store, or item-grant path. No Backend/Supabase, Inventory semantics, Business semantics, Store semantics, or Player Crafting semantics are changed.

The V2 navigation permission remains `inventory.redeem`.

## Canonical asset dependency — required merge gate

PR #503 (`feat/economic-asset-ownership-core-v2`) owns canonical economic asset ownership and is still open/draft at the latest review. It now includes a canonical Crafting read model, but its own remaining-work list still includes Crafting mutation cutover, Business material-flow cutover, compatibility work, migration replay, and Store → Inventory → Crafting → Business acceptance.

Therefore this Admin V2 branch may be completed and reviewed now, but **must not merge until a final reconciliation against #503 is performed**. After #503 reaches its mergeable/final contract shape, the Crafting V2 branch must:

1. fetch the then-current `main` / final #503 contract state;
2. audit only the finalized Crafting Admin read/mutation DTOs and canonical Inventory ownership boundary;
3. replace observational fallbacks only where the finalized authoritative Admin contract exposes richer recipe/input/output/ownership fields;
4. preserve `inventory.redeem` and the Store → Inventory → Crafting → Business authority chain;
5. rerun the focused Admin V2 and Player Crafting/Inventory regressions before merge.

No API shape from an unmerged #503 head is consumed directly by this branch.

## Focused contract audit

Only existing Crafting/Inventory contracts needed by this route were audited.

### Existing Admin Crafting operations

| Capability | Existing Admin route | V2 use |
|---|---|---|
| Oversight read | `GET /games/:gameId/crafting/oversight?status=&limit=` | Reads the current Crafting pack, jobs, effects, physical-economy supply state, and Inventory/Crafting invariant counters. |
| Job recovery | `POST /games/:gameId/crafting/jobs/:jobKey/recover` | Uses only `release_and_fail` or `requeue`, plus required reason/idempotency. |
| Supply override | `POST /games/:gameId/crafting/supply/:itemKey` | Uses the existing country/scarcity/quantity/multiplier/source/expiry contract. |

The browser calls these paths only through the same-origin Admin BFF. The V2 route supplies the existing CSRF/device/game binding through `createAdminBffTransport` and uses an idempotency key in both the mutation header and body because the existing Crafting handler requires both layers.

### Oversight DTO available on reconciled `main`

The current oversight projection exposes:

- pack identity/status/version and feature flags;
- Crafting jobs with public job key, player identifier, recipe key/name, quantity, state, difficulty, country, quality, timing, failure code, and recovery version;
- effect definitions with public effect identity/summary and behavior metadata;
- physical-economy supply state by item/country;
- aggregate invariant counts for negative holdings/reservations, reservation projection mismatch, reserved-above-owned, and duplicate output grants.

It does **not** expose a standalone Admin recipe catalog, recipe input lines, recipe output lines, per-player Inventory holdings, private reservation rows, or Business inventory rows.

V2 therefore shows an **Observed recipes** view derived only from authoritative Crafting job records. It explicitly labels that view as observational, not a writable recipe catalog. Required inputs, output item lines, and ownership details are not fabricated. Final enrichment is deferred to the required #503 reconciliation gate above.

## Recovery semantics

The server remains the authority for whether recovery is safe.

- `release_and_fail` is server-supported only while the job has no granted output and is in an accepted recoverable state.
- `requeue` is accepted only for a failed job whose output has not already been granted and whose reservations satisfy the server-required active state.
- V2 never edits Inventory quantities locally. After a committed mutation it refreshes the authoritative oversight projection.

## Supply semantics

The supply table is physical-economy availability, not player ownership. V2 may submit only fields already accepted by the existing supply operation:

- country scope;
- scarcity band;
- available quantity;
- event multiplier;
- route multiplier;
- source event key;
- expiry.

An item key identifies an existing physical-economy item. The Admin form does not create an item or recipe.

## Permission mismatch recorded for backend follow-up

The V2 product/navigation contract specifies `inventory.redeem` for Crafting, and the route fails closed client-side when that permission is absent.

The current backend permission resource mapping on this tranche's reconciled `main` does not contain an explicit `crafting` entry, so Crafting paths fall back to generic game permissions. This branch does not change Backend/Supabase policy because that is outside the authorized UI scope. The browser-side permission check is not treated as a substitute backend authority.

## V2 ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/crafting/CraftingApi.js` | Exact existing Crafting Admin/BFF paths, request validation, safe errors, cancellation, CSRF/idempotency-compatible mutation requests. |
| `admin/v2/src/routes/crafting/CraftingController.js` | Data-state lifecycle, safe read-model normalization, permission fail-closed behavior, observed-recipe derivation, recovery/supply orchestration, authoritative refresh. |
| `admin/v2/src/routes/crafting/CraftingRoute.js` | Supervisory UI, filters, observed recipes, jobs, recovery dialogs, supply state/adjustment, effects, integrity counters, contract-boundary explanations. |
| `admin/v2/src/routes/crafting/CraftingSkeleton.js` | Shape-accurate loading state. |
| `admin/v2/styles/routes/crafting.css` | Route-local desktop/mobile/short-width behavior and long/non-ASCII wrapping. |
| `.github/workflows/admin-v2-crafting.yml` | Focused Admin V2 contract and desktop/mobile browser verification for this route. |

Shared product changes are limited to the V2 navigation disposition, composition root, Crafting stylesheet load, test command wiring, and migration-regression expectations.

## Privacy and presentation rules

- No game/admin/player UUID is rendered.
- `jobKey` remains controller-private for the recovery path and is not presented in visible text or accessible labels.
- backend handler codes, content digests, source commits, raw SQL/error details, and private reservation/holding identifiers are omitted.
- Korean/non-ASCII recipe/player text is preserved unless it contains a UUID-like private identifier.
- long names wrap instead of forcing document overflow.
- stale refresh failures retain the last valid Crafting model and expose only the shared safe Admin error envelope.
- the route uses the existing V2 permission boundary, dialogs, fields, data table, empty/error/stale states, toast system, and BFF transport.

## Test scope

Dedicated Crafting API/controller tests cover empty oversight, many/long/Korean recipe observations, claimed jobs, constrained supply, invariant counts, private-ID stripping, exact read/mutation paths and bodies, idempotency, permission denial, and safe 403/5xx failures.

Browser smoke coverage checks desktop and mobile V2 rendering, no horizontal document overflow, long/Korean content, mutation-boundary headers, no private IDs/raw backend diagnostics, and permission/error/empty states.

The focused Player Crafting/Inventory gate is the repository's existing `Crafting Item Runtime` workflow, which runs `test:crafting-runtime`, backend Player Crafting tests/typechecks, player-terminal verification, and the desktop/mobile `player-crafting-runtime` browser matrix.

Evidence is recorded under `docs/operations/evidence/admin-ui-v2-crafting/`.
