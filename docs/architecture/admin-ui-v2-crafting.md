# Admin UI V2 — Crafting

**Owner branch:** `refactor/admin-ui-v2-crafting-v1`

**Exact base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`

**Status:** `IMPLEMENTED_NOT_MERGED`

**Production promotion authorized:** No

## Purpose and boundary

This tranche migrates only the Admin **Crafting** destination into the source-owned Admin UI V2 shell.

Crafting remains part of Econovaria's existing physical-economy chain:

`Store purchase → Inventory ownership/reservations → Crafting consumption/output → Business inventory where authoritative`

This UI does not introduce a second inventory ledger, business-inventory projection, recipe store, or item-grant path. No Backend/Supabase, Inventory semantics, Business semantics, Store semantics, or Player Crafting semantics are changed.

The V2 navigation permission remains `inventory.redeem`.

## Focused contract audit

Only existing Crafting/Inventory contracts needed by this route were audited.

### Existing Admin Crafting operations

| Capability | Existing Admin route | V2 use |
|---|---|---|
| Oversight read | `GET /games/:gameId/crafting/oversight?status=&limit=` | Reads the current Crafting pack, jobs, effects, physical-economy supply state, and Inventory/Crafting invariant counters. |
| Job recovery | `POST /games/:gameId/crafting/jobs/:jobKey/recover` | Uses only `release_and_fail` or `requeue`, plus required reason/idempotency. |
| Supply override | `POST /games/:gameId/crafting/supply/:itemKey` | Uses the existing country/scarcity/quantity/multiplier/source/expiry contract. |

The browser continues to call these paths only through the same-origin Admin BFF. The V2 route supplies the existing CSRF/device/game binding through `createAdminBffTransport` and uses an idempotency key both in the mutation header and body because the existing Crafting handler requires both layers.

### Oversight DTO actually available on `main`

The current oversight projection exposes:

- pack identity/status/version and feature flags;
- Crafting jobs with public job key, player identifier, recipe key/name, quantity, state, difficulty, country, quality, timing, failure code, and recovery version;
- effect definitions with public effect identity/summary and behavior metadata;
- physical-economy supply state by item/country;
- aggregate invariant counts for negative holdings/reservations, reservation projection mismatch, reserved-above-owned, and duplicate output grants.

It does **not** expose a standalone Admin recipe catalog, recipe input lines, recipe output lines, per-player Inventory holdings, private reservation rows, or Business inventory rows.

Therefore V2 shows an **Observed recipes** view derived only from authoritative Crafting job records. It explicitly labels that view as observational, not a writable recipe catalog. Required inputs, output item lines, and ownership details are not fabricated.

## Recovery semantics

The current server is the authority for whether a recovery is safe.

`release_and_fail` may release active Crafting input reservations and fail a job only when the existing recovery function accepts the current job/output state.

`requeue` is accepted only for a failed job whose output has not already been granted and whose reservations remain in the server-required active state.

V2 never edits Inventory quantities locally. After a committed mutation it refreshes the authoritative oversight projection.

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

## Permission mismatch discovered during audit

The V2 product/navigation contract specifies `inventory.redeem` for Crafting, and the route fails closed client-side when that permission is absent.

However, the current backend `requiredAdminPermission()` mapping on this exact base does not contain a `crafting` resource entry. Consequently `/games/:id/crafting/**` currently falls back to generic `game.read` for reads and `game.update` for mutations.

This branch does **not** repair that mismatch because the requested scope forbids Backend/Supabase changes. The mismatch is recorded as a follow-up security/authorization item; it must not be hidden by adding a parallel browser-side authority.

## V2 ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/crafting/CraftingApi.js` | Exact existing Crafting Admin/BFF paths, request validation, safe errors, cancellation, CSRF/idempotency-compatible mutation requests. |
| `admin/v2/src/routes/crafting/CraftingController.js` | Data-state lifecycle, safe read-model normalization, permission fail-closed behavior, observed-recipe derivation, recovery/supply orchestration, authoritative refresh. |
| `admin/v2/src/routes/crafting/CraftingRoute.js` | Supervisory UI, filters, observed recipes, jobs, recovery dialogs, supply state/adjustment, effects, integrity counters, contract-boundary explanations. |
| `admin/v2/src/routes/crafting/CraftingSkeleton.js` | Shape-accurate loading state. |
| `admin/v2/styles/routes/crafting.css` | Route-local desktop/mobile/short-width behavior and long/non-ASCII wrapping. |

Shared changes are limited to the V2 navigation disposition, composition root, Crafting stylesheet load, and migration-regression expectations.

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

Browser smoke coverage is designed for desktop and mobile V2 rendering, no horizontal document overflow, long/Korean content, mutation-boundary headers, no private IDs/raw backend diagnostics, and permission/error/empty states.

Existing Overview/Store/Market tests are retained. Player Crafting/Inventory regressions remain source-owned by their current tests and no Player file is modified.

Evidence is recorded under `docs/operations/evidence/admin-ui-v2-crafting/`.
