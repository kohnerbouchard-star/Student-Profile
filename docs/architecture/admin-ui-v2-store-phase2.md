# Admin UI v2 Phase 2 — Store Management and canonical Store media

**Roadmap item:** `BETA-ADMIN-UI-V2-002`

**Owner branch:** `refactor/admin-ui-v2-store-media-v1`

**Base:** `60334c2e92c6396a15c61fdd7b3552b055aee271`

**Status:** `IMPLEMENTED_NOT_MERGED`

**Production promotion authorized:** No

## Purpose

Phase 2 migrates Store Management into the source-owned Admin v2 application and establishes one repository-owned media contract for Store items used by both the Admin and Player surfaces. Overview and Store are the only native v2 routes at the end of this tranche. World Management remains a first-class left-navigation item, and every other navigation disposition remains exactly as it was after Phase 1.

This work consumes existing authoritative Store contracts. It does not add or change a Backend endpoint, database table or function, Supabase configuration, authentication or authorization rule, rate limit, Player purchase contract, or legacy Admin behavior. `/admin` remains available as the independent v606 runtime while migration continues.

## Route and migration boundary

| Destination | Phase 2 owner | Disposition |
|---|---|---|
| `/admin/v2.html#overview` | `admin/v2/src/routes/overview/**` | Native v2, unchanged from Phase 1 |
| `/admin/v2.html#store` | `admin/v2/src/routes/store/**` | Native v2 Store Management |
| `/admin/` | Existing legacy Admin files | Retained independently; no behavior change |
| All other v2 navigation destinations | Existing Phase 1 registry and boundaries | Unchanged `legacy` or `planned` disposition |

The Store registry entry changes only from an explicit legacy handoff to `migration: "v2"`. World Management stays in the primary `World` group. Phase 2 does not make World Management, Players, Attendance, Contracts, Marketplace, Settings, Logs, or any other destination native.

`admin/v2/src/app.js` remains an application-composition boundary. It activates the Overview or Store controller selected by the route registry and deactivates the previous controller. Store normalization, filtering, rendering, form validation, mutation orchestration, and idempotency ownership stay under `admin/v2/src/routes/store/` or the route-facing API adapter rather than accumulating in `app.js`.

## Existing authoritative Store API

All paths below are same-origin browser paths below `/api/admin`. The configured HttpOnly BFF remains responsible for forwarding them to the established Admin API.

| Operation | Method and path | Phase 2 use |
|---|---|---|
| Read catalog | `GET /api/admin/games/:gameId/store/items?include=stock,prices,purchaseStats` | Authoritative list, stock, price, and read-only usage projection |
| Create item | `POST /api/admin/games/:gameId/store/items` | Create dialog submission |
| Update item | `PATCH /api/admin/games/:gameId/store/items/:itemId` | Edit dialog submission |
| Archive item | `DELETE /api/admin/games/:gameId/store/items/:itemId` | Confirmed soft archive through the existing mutation contract |

The browser continues to use the selected-game context already validated by the session bootstrap. It does not select or assert ownership by sending a Player identity or an arbitrary owner value. Item resource identifiers are retained only inside the API/controller boundary for the required update and archive request paths; they are not rendered as visible text, titles, accessible names, address-bar or handoff URLs, or presentation data attributes.

### Session and mutation security

- Requests use the existing same-origin HttpOnly Admin BFF with `credentials: "include"`; no Staff bearer token is browser-readable or mocked.
- The v2 transport is dependency-injected and scoped to the application. It does not replace `window.fetch`, `globalThis.fetch`, a prototype, or a platform DOM API.
- The transport removes caller-supplied credential, game, device, and CSRF headers before rebuilding the established trusted browser request shape.
- Mutations require a currently authenticated, unexpired session and its validated CSRF token. Missing or invalid session material fails closed before a mutation request is sent.
- Each logical create, update, or archive command owns a stable `Idempotency-Key`. An in-flight duplicate with the same command shares the first request; a conflicting payload cannot reuse the key. A retryable failure retains the command key, while a committed mutation is not reclassified as failed merely because its follow-up read fails.
- Server authentication, AAL2, `store.manage`, owner/game scope, rate limiting, audit identity, and transactional idempotency remain authoritative and unchanged. The UI normalizes their `401`, permission-denied `403`, AAL2-required, `409`, validation, `429`, and retryable `5xx` results into the established safe Admin error envelope.
- Raw Backend, SQL, Supabase, stack, function, service-role, environment, private identifier, and exception details are never copied into the DOM.

## Persisted data and control boundary

The current Store DTO persists the following fields:

| Field | Existing persistence contract | Phase 2 control |
|---|---|---|
| `itemKey` | Create only | No direct control; the authoritative create contract generates it |
| `name` | Create and update | Required display name |
| `description` | Create and update | Optional description |
| `category` | Create and update | Existing category value |
| `price` | Create and update | Non-negative existing Store price |
| `currencyCode` | Create and update | Existing Store currency code |
| `stockQuantity` | Create and update | Finite non-negative integer stock |
| `status` | Create and update | `active` or `disabled`; `archived` is reached only through Archive |
| `visibility` | Create and update | `visible` or `hidden` |
| `sortOrder` | Create and update | Existing integer ordering value |

Phase 2 intentionally exposes only controls backed by those persisted fields and the existing create/update/archive routes. It does not fabricate artwork or upload persistence. It also omits unlimited stock, country-specific stock, a restock action, fulfillment rules, usage configuration, and other UI-only concepts. Purchase statistics returned by the read projection may be displayed as read-only evidence; they are not editable usage controls.

Archive uses the existing `DELETE` route, which persists `status: "archived"` and `visibility: "hidden"`. Phase 2 labels this action **Archive**, requires explicit confirmation, and does not claim a destructive hard delete or invent a restore route.

## Canonical Store media

`assets/store-item-media.mjs` is the canonical resolver. It derives media from a public Store item key and an allow-listed repository asset root; it does not trust an item-supplied image URL, storage path, upload token, or internal UUID.

The resolver returns a small presentation descriptor:

```js
{
  src,
  alt,
  kind: "seeded" | "catalog" | "placeholder",
  fallback,
  fallbackSrc
}
```

Resolution order is deterministic:

1. valid seeded keys map to the existing country artwork under `player-terminal/assets/images/items/store/**`;
2. allow-listed catalog keys map to existing repository SVG artwork under `player-terminal/assets/store-items/**`;
3. every unsupported, malformed, custom, missing, or private-key case uses the branded graphical placeholder at `assets/store-item-placeholder.svg`.

The current Store DTO contains no custom-media field, and the existing mutation handler explicitly rejects file-bearing Store multipart requests until an approved storage and media policy exists. Accordingly, Phase 2 has no upload affordance and does not preserve arbitrary `image` values. A custom Store item receives the branded placeholder. A seeded or catalog asset that fails to load also converges on that placeholder without rendering a glyph, initial, raw path, or broken-image treatment.

The Player Store retains its existing seeded and catalog artwork by adapting `player-terminal/src/features/store/store-artwork.js` to the canonical resolver with the Player-relative asset root. Its Store cards opt into the same deterministic load-error fallback. The Player purchase, stock, price, inventory, and navigation contracts remain unchanged. The legacy Marketplace helper continues to accept only its pre-existing repository-local SVG shape and is separated from canonical Store resolution so an API-provided URL cannot become a Store media authority.

## V2 Store ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/store/StoreController.js` | Authoritative load state, route filters, mutation lifecycle, stable idempotency, refresh scheduling, cancellation, and teardown |
| `admin/v2/src/routes/store/StoreRoute.js` | Store page composition, responsive catalog presentation, read-only summaries, dialogs, and route-local listeners |
| `admin/v2/src/routes/store/StoreItemForm.js` | Create/edit controls, field validation, linked validation summary, submit state, and cleanup |
| `admin/v2/src/routes/store/StoreSkeleton.js` | Shape-accurate Store loading state |
| `admin/v2/src/api/admin-api-client.js` | Exact Store path construction, request/response validation, safe errors, and mutation request deduplication |
| `admin/v2/src/api/admin-bff-transport.js` | Same-origin HttpOnly BFF transport, mutation CSRF/idempotency header boundary, and unchanged session-expiry handoff |
| `admin/v2/styles/routes/store.css` | Store-only responsive table/card, media, status, controls, and dialog layout |
| `assets/store-item-media.mjs` | Shared repository-owned Store media resolution |
| `assets/store-item-placeholder.svg` | Branded graphical fallback with no item glyph or initials |

The route reuses Phase 1 primitives: `AdminPageFrame`, `AdminDataTable`, `AdminMedia`, `AdminField`, `AdminDialog`, `AdminConfirmDialog`, data-state surfaces, validation summary, icons, and toast. Generic focus, error, permission, media, table, and dialog behavior is not duplicated inside the Store route.

Every route-owned listener and open dialog has deterministic teardown. Navigating away deactivates the Store view, closes dialogs, restores or safely releases focus, removes listeners, aborts the current read, and prevents a stale request from re-rendering the route. Destroying the application additionally cancels Store work and clears scheduled refreshes. No document-wide `MutationObserver`, raw `innerHTML`, or `insertAdjacentHTML` renderer is introduced.

## Presentation, state, and accessibility contract

Desktop layouts use the shared data table; narrow layouts present the same authoritative rows as readable cards. A table may scroll inside its own horizontal boundary, but the document must not overflow horizontally. The route must remain usable at 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 320×568, and the 1024×540 short-desktop viewport.

The Store route supports the shared six-state model:

| State | Store behavior |
|---|---|
| `initial-loading` | Shape-accurate catalog skeleton; no fabricated items or totals |
| `ready` | Authoritative summary, filters, media, catalog, and supported actions |
| `refreshing` | Valid catalog remains visible with a non-blocking progress signal |
| `stale` | Last valid catalog remains visible with a safe retry path |
| `empty` | Truthful no-item state with **Add Store item** only when permitted |
| `failed` | Safe normalized error and retry when allowed; no raw response text |

The catalog contract covers zero, one, and at least 50 items, long safe names/descriptions, seeded art, catalog art, placeholder art, zero stock, disabled, hidden, and archived rows. Search, status/stock, and category filtering occur over the normalized authoritative model.

Create and edit use `AdminDialog`; archive uses `AdminConfirmDialog`. Each flow requires deterministic initial focus, Tab and Shift+Tab containment, Escape behavior, one effective submit, explicit pending state, validation-to-field focus, close-path cleanup, and opener-focus restoration. A successful mutation announces through the shared toast and schedules a fresh authoritative read. A failed refresh after success becomes stale data and never invites an accidental duplicate mutation.

## Legacy retention and cutover prerequisites

No legacy Store file, selector, style, test, or accepted hash is removed or changed in Phase 2. `/admin` remains the fallback runtime for the routes that still explicitly hand off to it. Store's v2 registry entry no longer offers a legacy handoff because Store is native on `/admin/v2.html`, but the legacy Store surface remains present and independently operable until a separately authorized cutover.

Retiring legacy Store code requires all of the following after this branch is merged:

1. exact route ownership and API parity are verified on `main`;
2. create, update, archive, authentication, session, permission, AAL2, CSRF, idempotency, media, focus, responsive, and error tests pass;
3. source and configured built-dist browser suites pass with the required screenshots;
4. the Git-connected preview loads `/admin/v2.html#store` with correct resources and no new console, CSP, Trusted Types, MIME, or request failure;
5. consumers of each proposed legacy Store file are proven absent; and
6. the product owner separately authorizes the cutover or deletion tranche.

Phase 2 itself deletes nothing.

## Verification and evidence gates

The release audit must record, without fabricating pending results:

- Admin v2 unit, Store API, and Store media contracts;
- source browser and configured Vercel built-dist browser suites;
- authentication boundaries and Store session-state scenarios;
- create/edit/archive success, safe failure, validation, AAL2, permission, rate-limit, retryable-service, and duplicate-submit behavior;
- keyboard navigation, dialog focus lifecycle, and no document horizontal overflow;
- correct JavaScript, CSS, image, and asset MIME types; no missing resource, unexpected console error, CSP violation, or Trusted Types warning;
- seeded Player/Admin media agreement, custom placeholder, and load-error fallback;
- zero-, one-, and 50-plus-item fixtures;
- JavaScript syntax, `git diff --check`, configured Vercel build/deployment contract, and changed-file secret scan; and
- no new failure relative to exact base `60334c2e92c6396a15c61fdd7b3552b055aee271`.

Local evidence belongs under `docs/operations/evidence/admin-ui-v2-store/`, including browser result JSON and captures for every required viewport plus representative state, dialog, seeded-art, and placeholder cases.

## Audited review record

- **Implementation commit:** `3663c2f906778c98469d5d68b4abcda72f34f28c`
- **Draft pull request:** [#505](https://github.com/kohnerbouchard-star/Student-Profile/pull/505), targeting `main`
- **Final changed-file and line counts:** 69 files, 5,648 additions, 113 deletions relative to exact base
- **Local unit and contract checks:** Admin v2 unit/API/media 21/21; authentication 16/16; Admin request-auth 8/8; Vercel deployment contract 6/6; Store artwork 50 authored descriptions, 50 repository assets, and 50 Player mappings; five focused Player Store scripts, Player runtime cutover, and all 159 Player modules passed; all 21 changed JavaScript modules passed syntax; `git diff --check` and the 69-file secret scan passed.
- **Browser checks:** Store source 20/20 and configured built-dist 20/20, each with 19 screenshots and a 66-resource manifest; Overview regression source and built-dist each passed 41 checks with the eight documented selected-game URL exceptions. Required state, cardinality, mutation, AAL2, permission, keyboard/focus, overflow, MIME, missing-resource, console, CSP, Trusted Types, safe-error, and private-DOM checks passed.
- **Baseline comparison:** the architecture ratchet, legacy shell scroll check, and v606 drift audit fail identically on exact base and branch. No v2-owned product or browser regression exists relative to `60334c2e92c6396a15c61fdd7b3552b055aee271`.
- **Git-connected preview:** Vercel attempted the automatic PR deployment on 2026-08-07 but rejected it before build with `api-deployments-free-per-day` because the team exceeded 100 free deployments in 24 hours. No preview URL exists yet. No manual deployment or production promotion was attempted.
- **Required-CI delivery blocker:** `Player Terminal Verify` stops at its unchanged cross-cutting scope gate because the single repository authority manifest on `main` is bound to PR #500, not PR #505. All relevant Player tests pass locally. Updating that security authority file is outside this Phase 2 authorization and the check was not weakened or bypassed.

The implementation is committed and reviewable, but preview availability and the Player cross-cutting authority gate remain unresolved delivery blockers. This item must not be marked `VERIFIED_COMPLETE` until it is merged to `main`, its required checks pass, and the required runtime evidence exists. Merge, manual deployment, and production promotion remain unauthorized.
